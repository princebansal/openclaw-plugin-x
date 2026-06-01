import path from 'node:path';

import type { AccountConfig } from './types.js';
import { XPluginError } from './errors.js';
import { getBearerCredential, getClientCredential, getRefreshCredential, getUserCredential, setBearerCredential, setClientCredential, setRefreshCredential, setUserCredential } from './sensitive-fields.js';

const DEFAULT_X_API_BASE_URL = 'https://api.x.com';
const DEFAULT_X_UPLOAD_API_BASE_URL = 'https://api.x.com';
const DEFAULT_X_OAUTH_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const DEFAULT_X_OAUTH_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const DEFAULT_DRAFTS_FILE_PATH = path.resolve(process.cwd(), '.openclaw-x-drafts.json');
const DEFAULT_SESSION_FILE_PATH = path.resolve(process.cwd(), '.openclaw-x-session.json');
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'follows.read', 'offline.access', 'media.write'];

function resolveAccountOverrides(overrides: Partial<AccountConfig>, accountId: string): Partial<AccountConfig> {
  const accountOverrides = overrides.accounts?.[accountId];
  if (!accountOverrides) {
    return overrides;
  }

  return {
    ...overrides,
    ...accountOverrides,
    accounts: overrides.accounts,
  };
}

export function loadAccountConfig(overrides: Partial<AccountConfig> = {}, accountId = 'default'): AccountConfig {
  const effectiveOverrides = resolveAccountOverrides(overrides, accountId);
  const config: AccountConfig = {
    apiBaseUrl: effectiveOverrides.apiBaseUrl?.trim() || DEFAULT_X_API_BASE_URL,
    uploadApiBaseUrl: effectiveOverrides.uploadApiBaseUrl?.trim() || DEFAULT_X_UPLOAD_API_BASE_URL,
    oauthAuthorizeUrl: effectiveOverrides.oauthAuthorizeUrl?.trim() || DEFAULT_X_OAUTH_AUTHORIZE_URL,
    oauthTokenUrl: effectiveOverrides.oauthTokenUrl?.trim() || DEFAULT_X_OAUTH_TOKEN_URL,
    scopes: effectiveOverrides.scopes?.length ? effectiveOverrides.scopes : DEFAULT_SCOPES,
    approvalMode: 'always',
    draftsFilePath: effectiveOverrides.draftsFilePath?.trim() || DEFAULT_DRAFTS_FILE_PATH,
    sessionFilePath: effectiveOverrides.sessionFilePath?.trim() || DEFAULT_SESSION_FILE_PATH,
  };

  if (effectiveOverrides.clientId?.trim()) config.clientId = effectiveOverrides.clientId.trim();
  { const value = getClientCredential(effectiveOverrides)?.trim(); if (value) setClientCredential(config, value); }
  if (effectiveOverrides.redirectUri?.trim()) config.redirectUri = effectiveOverrides.redirectUri.trim();
  { const value = getBearerCredential(effectiveOverrides)?.trim(); if (value) setBearerCredential(config, value); }
  { const value = getUserCredential(effectiveOverrides)?.trim(); if (value) setUserCredential(config, value); }
  { const value = getRefreshCredential(effectiveOverrides)?.trim(); if (value) setRefreshCredential(config, value); }
  if (effectiveOverrides.userId?.trim()) config.userId = effectiveOverrides.userId.trim();
  if (overrides.accounts) config.accounts = overrides.accounts;

  return config;
}

export function assertReadConfigPresent(config: AccountConfig): void {
  if (getBearerCredential(config) || getUserCredential(config)) {
    return;
  }

  throw new XPluginError('CONFIG_ERROR', 'No X read credential found in environment.', {
    details: {
      expected: ['X_BEARER_TOKEN', 'X_ACCESS_TOKEN'],
    },
  });
}

export function assertWriteConfigPresent(config: AccountConfig): void {
  if (getUserCredential(config)) {
    return;
  }

  throw new XPluginError('AUTH_REQUIRED', 'Live write calls require an X user access token.', {
    details: {
      expected: ['X_ACCESS_TOKEN'],
      note: 'Bearer-only app auth is treated as read-only in this scaffold.',
    },
  });
}

export function assertOAuthConfigPresent(config: AccountConfig): void {
  if (config.clientId && config.redirectUri) {
    return;
  }

  throw new XPluginError('CONFIG_ERROR', 'OAuth setup requires X_CLIENT_ID and X_REDIRECT_URI.', {
    details: {
      expected: ['X_CLIENT_ID', 'X_REDIRECT_URI'],
      optional: ['X_CLIENT_SECRET'],
    },
  });
}
