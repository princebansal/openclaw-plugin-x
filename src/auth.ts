import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { AccountConfig, OAuthTokenResponse, PendingOAuthState, SessionState } from './types.js';
import { XPluginError } from './errors.js';

export interface SessionStore {
  get(accountId: string): Promise<SessionState | undefined>;
  set(session: SessionState): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  async get(accountId: string): Promise<SessionState | undefined> {
    return this.sessions.get(accountId);
  }

  async set(session: SessionState): Promise<void> {
    this.sessions.set(session.accountId, session);
  }
}

interface SessionFileShape {
  sessions: SessionState[];
}

function ensureStore(filePath: string): SessionFileShape {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const initial: SessionFileShape = { sessions: [] };
    fs.writeFileSync(resolved, JSON.stringify(initial, null, 2));
    return initial;
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  if (!raw.trim()) return { sessions: [] };
  return JSON.parse(raw) as SessionFileShape;
}

function saveStore(filePath: string, store: SessionFileShape): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(store, null, 2));
}

export function getSession(filePath: string, accountId = 'default'): SessionState | undefined {
  const store = ensureStore(filePath);
  return store.sessions.find((session) => session.accountId === accountId);
}

export function setSession(filePath: string, next: SessionState): SessionState {
  const store = ensureStore(filePath);
  const index = store.sessions.findIndex((session) => session.accountId === next.accountId);
  if (index === -1) store.sessions.push(next);
  else store.sessions[index] = next;
  saveStore(filePath, store);
  return next;
}

export function buildConnectPlan(config: AccountConfig) {
  const mode = config.accessToken || config.bearerToken ? 'token-config-bringup' : 'oauth2-user-context';

  return {
    mode,
    readyForRead: Boolean(config.bearerToken || config.accessToken),
    readyForWrite: Boolean(config.accessToken),
    eventualTarget: 'oauth2-user-context',
    scopes: config.scopes,
    oauthUrls: {
      authorize: config.oauthAuthorizeUrl,
      token: config.oauthTokenUrl,
    },
    note:
      'Current bring-up supports durable PKCE auth planning and manual code exchange scaffolding, but callback HTTP handling is not wired yet.',
    nextSteps:
      mode === 'token-config-bringup'
        ? [
            'Use X_BEARER_TOKEN or X_ACCESS_TOKEN for immediate read-path testing.',
            'Use X_ACCESS_TOKEN for live write-path testing.',
            'Replace env-token bring-up with OAuth 2.0 user flow once callback handling and token persistence are wired.',
          ]
        : [
            'Provide X_CLIENT_ID / X_REDIRECT_URI for OAuth 2.0 user flow.',
            'Generate PKCE auth URL and complete code exchange manually or via callback.',
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

  if (params.config.clientSecret) {
    body.set('client_secret', params.config.clientSecret);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (params.config.clientSecret) {
    const encodedClientId = encodeURIComponent(params.config.clientId);
    const encodedClientSecret = encodeURIComponent(params.config.clientSecret);
    const basic = Buffer.from(`${encodedClientId}:${encodedClientSecret}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${basic}`;
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
    throw new XPluginError('API_ERROR', `OAuth token exchange failed with ${response.status}.`, {
      retryable: response.status >= 500 || response.status === 429,
      details: {
        status: response.status,
        response: parsed ?? raw,
      },
    });
  }

  return parsed ?? {};
}

export async function refreshAccessToken(params: {
  config: AccountConfig;
  refreshToken: string;
}): Promise<OAuthTokenResponse> {
  if (!params.config.clientId) {
    throw new XPluginError('CONFIG_ERROR', 'OAuth refresh requires clientId.');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  if (params.config.clientSecret) {
    const encodedClientId = encodeURIComponent(params.config.clientId);
    const encodedClientSecret = encodeURIComponent(params.config.clientSecret);
    const basic = Buffer.from(`${encodedClientId}:${encodedClientSecret}`, 'utf8').toString('base64');
    headers.Authorization = `Basic ${basic}`;
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
    throw new XPluginError('API_ERROR', `OAuth refresh failed with ${response.status}.`, {
      retryable: response.status >= 500 || response.status === 429,
      details: {
        status: response.status,
        response: parsed ?? raw,
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

  return {
    accountId: params.accountId ?? params.existing?.accountId ?? 'default',
    userId: params.me?.id ?? params.existing?.userId,
    username: params.me?.username ?? params.existing?.username,
    accessToken: params.token.access_token ?? params.existing?.accessToken,
    refreshToken: params.token.refresh_token ?? params.existing?.refreshToken,
    connectedAt: now.toISOString(),
    ...(expiresAt ? { expiresAt } : {}),
    scopes: params.token.scope?.split(' ').filter(Boolean) ?? params.pendingOAuth?.scopes ?? params.existing?.scopes ?? [],
  };
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function base64Url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
