import type { IncomingMessage, ServerResponse } from 'node:http';

import { getSession, isPendingOAuthFresh, oauthStateMatches, OAUTH_CALLBACK_PATH } from './auth.js';
import { loadAccountConfig } from './config.js';
import { clearPendingOAuth } from './session-store.js';
import { routeToolRequest } from './router.js';
import type { AccountConfig, ToolResponse } from './types.js';

type OAuthPluginConfig = Partial<AccountConfig>;

export async function handleOAuthCallbackRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pluginConfig: OAuthPluginConfig,
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

  const accountId = findPendingAccount(pluginConfig, state.value);
  if (!accountId) {
    return respond(response, 400, 'This OAuth callback is invalid or expired. Start a new connection flow in OpenClaw.');
  }

  const config = loadAccountConfig(pluginConfig, accountId);
  if (providerError.value) {
    clearPendingOAuth(config.sessionFilePath, accountId);
    return respond(response, 200, 'X authorization was declined. Return to OpenClaw to start again.');
  }

  if (!code.value) {
    return respond(response, 400, 'Invalid OAuth callback. Start a new connection flow in OpenClaw.');
  }

  let result: ToolResponse;
  try {
    result = await routeToolRequest({
      action: 'x.account.complete',
      input: { accountId, code: code.value, state: state.value, _oauthCallback: true },
      pluginConfig,
    });
  } catch {
    return respond(response, 502, 'X could not complete the connection. Start a new flow in OpenClaw.');
  }

  if (!result.ok) {
    return respond(response, 502, 'X could not complete the connection. Start a new flow in OpenClaw.');
  }

  return respond(response, 200, 'X account connected. You can close this page and return to OpenClaw.');
}

function findPendingAccount(pluginConfig: OAuthPluginConfig, receivedState: string): string | undefined {
  const accountIds = new Set(['default', ...Object.keys(pluginConfig.accounts ?? {})]);
  const matches: string[] = [];

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
      matches.push(accountId);
    }
  }

  return matches.length === 1 ? matches[0] : undefined;
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
