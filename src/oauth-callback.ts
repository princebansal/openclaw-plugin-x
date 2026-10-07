import type { IncomingMessage, ServerResponse } from 'node:http';

import { getSession, isPendingOAuthFresh, oauthStateMatches, OAUTH_CALLBACK_PATH } from './auth.js';
import { loadAccountConfig } from './config.js';
import { clearPendingOAuth } from './session-store.js';
import { routeToolRequest } from './router.js';
import type { AccountConfig, ToolResponse } from './types.js';

type OAuthPluginConfig = Partial<AccountConfig>;
type OAuthCallbackOptions = {
  notifyOrigin?: (sessionKey: string, message: string, idempotencyKey: string) => Promise<'announced' | 'queued' | 'unavailable'>;
};

export async function handleOAuthCallbackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pluginConfig: OAuthPluginConfig,
  options: OAuthCallbackOptions = {},
): Promise<boolean> {
  setSecureResponseHeaders(response);

  if (request.method !== 'GET') {
    return respond(response, 405, 'Use the X authorization flow to connect your account.');
  }

  let url: URL;
  try {
    url = new URL(request.url ?? '/', 'http://openclaw.invalid');
  } catch {
    return respond(response, 400, 'Invalid OAuth callback. Start a new connection flow in OpenClaw.');
  }

  if (url.pathname !== OAUTH_CALLBACK_PATH) {
    return respond(response, 404, 'OAuth callback not found.');
  }

  const state = getSingleQueryValue(url, 'state');
  const code = getSingleQueryValue(url, 'code');
  const providerError = getSingleQueryValue(url, 'error');
  if (
    !state.valid || !code.valid || !providerError.valid || !state.value ||
    state.value.length > 256 || (code.value !== undefined && code.value.length > 4096) ||
    (code.value && providerError.value)
  ) {
    return respond(response, 400, 'Invalid OAuth callback. Start a new connection flow in OpenClaw.');
  }

  const pendingMatch = findPendingAccount(pluginConfig, state.value);
  if (!pendingMatch) {
    return respond(response, 400, 'This OAuth callback is invalid or expired. Start a new connection flow in OpenClaw.');
  }

  const { accountId, pending } = pendingMatch;
  const config = loadAccountConfig(pluginConfig, accountId);
  if (providerError.value) {
    clearPendingOAuth(config.sessionFilePath, accountId);
    const notice = 'X authorization was declined; no connection was made. You can start a new authorization in this conversation.';
    const delivery = await notifyOrigin(options, pending.originSessionKey, notice, state.value);
    return respond(response, 200, delivery === 'announced'
      ? 'X authorization was declined. OpenClaw has reported this in the conversation that started it.'
      : 'X authorization was declined. Return to OpenClaw to start again.');
  }

  if (!code.value) {
    return respond(response, 400, 'Invalid OAuth callback. Start a new connection flow in OpenClaw.');
  }

  if ((pending.mode ?? 'callback') === 'paste_back') {
    return respond(response, 200, 'Authorization was approved. Return to the OpenClaw conversation that started it and paste this full redirect URL or its code into x_account_complete to finish connecting.');
  }

  let result: ToolResponse;
  try {
    result = await routeToolRequest({
      action: 'x.account.complete',
      input: { accountId, code: code.value, state: state.value, _oauthCallback: true },
      pluginConfig,
    });
  } catch {
    await notifyOrigin(options, pending.originSessionKey,
      'X authorization reached OpenClaw, but token exchange failed. Nothing was confirmed as connected; start a new authorization and try again.', state.value);
    return respond(response, 502, 'X could not complete the connection. Start a new flow in OpenClaw.');
  }

  if (!result.ok) {
    await notifyOrigin(options, pending.originSessionKey,
      'X authorization reached OpenClaw, but token exchange failed. Nothing was confirmed as connected; start a new authorization and try again.', state.value);
    return respond(response, 502, 'X could not complete the connection. Start a new flow in OpenClaw.');
  }

  const notice = 'X account authorization completed successfully. The connection is ready. No posts or media were sent.';
  const delivery = await notifyOrigin(options, pending.originSessionKey, notice, state.value);
  return respond(response, 200, delivery === 'announced'
    ? 'X account connected. OpenClaw has reported the result in the conversation that started authorization.'
    : delivery === 'queued'
      ? 'X account connected. OpenClaw saved the result for the next turn in the conversation that started authorization.'
      : 'X account connected. Return to OpenClaw; if the conversation has no notice, run x_account_me to verify the connection.');
}

type PendingOAuth = NonNullable<NonNullable<ReturnType<typeof getSession>>['pendingOAuth']>;

function findPendingAccount(pluginConfig: OAuthPluginConfig, receivedState: string): { accountId: string; pending: PendingOAuth } | undefined {
  const accountIds = new Set(['default', ...Object.keys(pluginConfig.accounts ?? {})]);
  const matches: Array<{ accountId: string; pending: PendingOAuth }> = [];

  for (const accountId of accountIds) {
    const config = loadAccountConfig(pluginConfig, accountId);
    const session = getSession(config.sessionFilePath, accountId);
    const pending = session?.pendingOAuth;
    if (
      pending &&
      callbackPathMatches(pending.redirectUri) &&
      isPendingOAuthFresh(pending.createdAt) &&
      oauthStateMatches(pending.state, receivedState)
    ) {
      matches.push({ accountId, pending });
    }
  }

  return matches.length === 1 ? matches[0] : undefined;
}

async function notifyOrigin(
  options: OAuthCallbackOptions,
  sessionKey: string | undefined,
  message: string,
  state: string,
): Promise<'announced' | 'queued' | 'unavailable'> {
  if (!sessionKey || !options.notifyOrigin) return 'unavailable';
  try {
    return await options.notifyOrigin(sessionKey, message, `x-oauth:${state}`);
  } catch {
    return 'unavailable';
  }
}

function callbackPathMatches(redirectUri: string): boolean {
  try {
    return new URL(redirectUri).pathname === OAUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

function getSingleQueryValue(url: URL, name: string): { valid: boolean; value?: string } {
  const values = url.searchParams.getAll(name);
  if (values.length > 1) return { valid: false };
  return { valid: true, ...(values.length ? { value: values[0] } : {}) };
}

function setSecureResponseHeaders(response: ServerResponse): void {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function respond(response: ServerResponse, statusCode: number, message: string): true {
  response.statusCode = statusCode;
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>X account connection</title></head><body><p>${message}</p></body></html>`);
  return true;
}
