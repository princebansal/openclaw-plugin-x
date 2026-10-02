import crypto from 'node:crypto';
import type { AccountConfig, OAuthTokenResponse, PendingOAuthState, SessionState } from './types.js';
import { XPluginError } from './errors.js';
import { getBearerCredential, getClientCredential, getRefreshCredential, getUserCredential, setRefreshCredential, setUserCredential } from './sensitive-fields.js';
export { clearPendingOAuth, getSession, setSession, InMemorySessionStore } from './session-store.js';
export type { SessionStore } from './session-store.js';

export const OAUTH_CALLBACK_PATH = '/openclaw-plugin-x/oauth/callback';

type OAuthDebugContext = {
  accountId?: string;
  operation?: 'authorization_code' | 'refresh_token';
  hasPendingOAuth?: boolean;
  hasCodeVerifier?: boolean;
  stateProvided?: boolean;
  stateMatched?: boolean;
};

export function buildConnectPlan(config: AccountConfig) {
  const userCredential = getUserCredential(config);
  const bearerCredential = getBearerCredential(config);
  const mode = userCredential || bearerCredential ? 'token-config-bringup' : 'oauth2-user-context';

  return {
    mode,
    readyForRead: Boolean(bearerCredential || userCredential),
    readyForWrite: Boolean(userCredential),
    eventualTarget: 'oauth2-user-context',
    scopes: config.scopes,
    oauthUrls: {
      authorize: config.oauthAuthorizeUrl,
      token: config.oauthTokenUrl,
    },
    note:
      'OAuth uses a durable PKCE session. When redirectUri reaches the Gateway callback route, completion is automatic; manual code/redirect completion remains available as a fallback.',
    nextSteps:
      mode === 'token-config-bringup'
        ? [
            'Use X_BEARER_TOKEN or X_ACCESS_TOKEN for immediate read-path testing.',
            'Use X_ACCESS_TOKEN for live write-path testing.',
            'Use x_account_auth_url for PKCE OAuth and the Gateway callback route for automatic completion.',
          ]
        : [
            'Provide X_CLIENT_ID / X_REDIRECT_URI for OAuth 2.0 user flow.',
            'Generate a PKCE auth URL and complete through the Gateway callback or manual code exchange.',
            'Persist access/refresh token session in the plugin session store.',
          ],
  };
}

export function createPkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
  return base64Url(crypto.randomBytes(24));
}

export function oauthStateMatches(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(received, 'utf8');
  return expectedBytes.length === receivedBytes.length && crypto.timingSafeEqual(expectedBytes, receivedBytes);
}

export function isPendingOAuthFresh(createdAt: string, now = Date.now()): boolean {
  const createdAtMs = Date.parse(createdAt);
  const ageMs = now - createdAtMs;
  return Number.isFinite(createdAtMs) && ageMs >= -60_000 && ageMs <= 10 * 60_000;
}

export function buildAuthorizationUrl(config: AccountConfig): PendingOAuthState {
  if (!config.clientId || !config.redirectUri) {
    throw new XPluginError('CONFIG_ERROR', 'OAuth auth URL generation requires clientId and redirectUri.');
  }

  const { codeVerifier, codeChallenge } = createPkcePair();
  const state = createOAuthState();
  const scopes = config.scopes;
  const createdAt = new Date().toISOString();

  const url = new URL(config.oauthAuthorizeUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return {
    state,
    codeVerifier,
    codeChallenge,
    authorizeUrl: url.toString(),
    createdAt,
    redirectUri: config.redirectUri,
    scopes,
  };
}

export async function exchangeAuthorizationCode(params: {
  config: AccountConfig;
  code: string;
  codeVerifier: string;
  debugContext?: OAuthDebugContext;
}): Promise<OAuthTokenResponse> {
  if (!params.config.clientId || !params.config.redirectUri) {
    throw new XPluginError('CONFIG_ERROR', 'OAuth token exchange requires clientId and redirectUri.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.config.redirectUri,
    code_verifier: params.codeVerifier,
  });

  const clientCredential = getClientCredential(params.config);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const authMode = clientCredential ? 'client_secret_basic' : 'client_id_body';

  if (clientCredential) {
    headers.Authorization = buildBasicAuthHeader(params.config.clientId, clientCredential);
    body.delete('client_secret');
  } else {
    body.set('client_id', params.config.clientId);
  }

  const response = await fetch(params.config.oauthTokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  const raw = await response.text();
  const parsed = tryParseJson(raw) as OAuthTokenResponse | undefined;

  if (!response.ok) {
    const diagnostics = buildOAuthDiagnostics({
      config: params.config,
      headers,
      body,
      authMode,
      responseStatus: response.status,
      response: parsed ?? raw,
      debugContext: {
        ...params.debugContext,
        operation: 'authorization_code',
        hasCodeVerifier: Boolean(params.codeVerifier),
      },
    });
    emitOAuthDiagnostics(diagnostics);
    throw new XPluginError('API_ERROR', `OAuth token exchange failed with ${response.status}.`, {
      retryable: response.status >= 500 || response.status === 429,
      details: {
        status: response.status,
        response: parsed ?? raw,
        diagnostics,
      },
    });
  }

  return parsed ?? {};
}

export async function refreshAccessToken(params: {
  config: AccountConfig;
  refreshCredential: string;
  debugContext?: OAuthDebugContext;
}): Promise<OAuthTokenResponse> {
  if (!params.config.clientId) {
    throw new XPluginError('CONFIG_ERROR', 'OAuth refresh requires clientId.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshCredential,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  const clientCredential = getClientCredential(params.config);
  const authMode = clientCredential ? 'client_secret_basic' : 'client_id_body';
  if (clientCredential) {
    headers.Authorization = buildBasicAuthHeader(params.config.clientId, clientCredential);
  } else {
    body.set('client_id', params.config.clientId);
  }

  const response = await fetch(params.config.oauthTokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });

  const raw = await response.text();
  const parsed = tryParseJson(raw) as OAuthTokenResponse | undefined;

  if (!response.ok) {
    const diagnostics = buildOAuthDiagnostics({
      config: params.config,
      headers,
      body,
      authMode,
      responseStatus: response.status,
      response: parsed ?? raw,
      debugContext: {
        ...params.debugContext,
        operation: 'refresh_token',
      },
    });
    emitOAuthDiagnostics(diagnostics);
    throw new XPluginError('API_ERROR', `OAuth refresh failed with ${response.status}.`, {
      retryable: response.status >= 500 || response.status === 429,
      details: {
        status: response.status,
        response: parsed ?? raw,
        diagnostics,
      },
    });
  }

  return parsed ?? {};
}

export function finalizeSession(params: {
  existing?: SessionState;
  accountId?: string;
  token: OAuthTokenResponse;
  pendingOAuth?: PendingOAuthState;
  me?: { id?: string; username?: string };
}): SessionState {
  const now = new Date();
  const expiresAt = typeof params.token.expires_in === 'number'
    ? new Date(now.getTime() + params.token.expires_in * 1000).toISOString()
    : undefined;

  const session: SessionState = {
    accountId: params.accountId ?? params.existing?.accountId ?? 'default',
    userId: params.me?.id ?? params.existing?.userId,
    username: params.me?.username ?? params.existing?.username,
    connectedAt: now.toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    scopes: params.token.scope?.split(' ').filter(Boolean) ?? params.pendingOAuth?.scopes ?? params.existing?.scopes ?? [],
  };
  setUserCredential(session, params.token.access_token ?? getUserCredential(params.existing));
  setRefreshCredential(session, params.token.refresh_token ?? getRefreshCredential(params.existing));
  return session;
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function buildBasicAuthHeader(clientId: string, clientCredential: string): string {
  // OAuth 2.0 client_secret_basic uses form-encoded username/password before
  // joining them with ':'. This keeps client ids containing ':' unambiguous.
  const encodedClientId = oauthFormEncode(clientId);
  const encodedClientCredential = oauthFormEncode(clientCredential);
  const basic = Buffer.from(`${encodedClientId}:${encodedClientCredential}`, 'utf8').toString('base64');
  return `Basic ${basic}`;
}

function oauthFormEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

function buildOAuthDiagnostics(params: {
  config: AccountConfig;
  headers: Record<string, string>;
  body: URLSearchParams;
  authMode: 'client_secret_basic' | 'client_id_body';
  responseStatus: number;
  response: unknown;
  debugContext?: OAuthDebugContext;
}) {
  return {
    accountId: params.debugContext?.accountId ?? 'default',
    operation: params.debugContext?.operation,
    authMode: params.authMode,
    authorizationHeaderPresent: Boolean(params.headers.Authorization),
    authorizationScheme: params.headers.Authorization?.split(/\s+/, 1)[0],
    clientIdPresent: Boolean(params.config.clientId),
    clientIdLength: params.config.clientId?.length ?? 0,
    clientIdFingerprint: params.config.clientId ? fingerprint(params.config.clientId) : undefined,
    clientSecretPresent: Boolean(getClientCredential(params.config)),
    tokenUrlHost: safeUrlHost(params.config.oauthTokenUrl),
    requestBodyKeys: Array.from(params.body.keys()).sort(),
    hasPendingOAuth: params.debugContext?.hasPendingOAuth,
    hasCodeVerifier: params.debugContext?.hasCodeVerifier,
    stateProvided: params.debugContext?.stateProvided,
    stateMatched: params.debugContext?.stateMatched,
    responseStatus: params.responseStatus,
    responseError: summarizeOAuthError(params.response),
  };
}

function emitOAuthDiagnostics(diagnostics: ReturnType<typeof buildOAuthDiagnostics>): void {
  console.warn('[openclaw-plugin-x] OAuth token request failed', diagnostics);
}

function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function safeUrlHost(value: string): string | undefined {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function summarizeOAuthError(response: unknown): unknown {
  if (!response || typeof response !== 'object') {
    return response;
  }
  const record = response as Record<string, unknown>;
  return {
    ...(typeof record.error === 'string' ? { error: record.error } : {}),
    ...(typeof record.error_description === 'string' ? { error_description: record.error_description } : {}),
    ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
  };
}

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
