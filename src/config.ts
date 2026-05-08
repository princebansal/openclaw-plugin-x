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

export function loadAccountConfig(overrides: Partial<AccountConfig> = {}): AccountConfig {
  const config: AccountConfig = {
    apiBaseUrl: overrides.apiBaseUrl?.trim() || DEFAULT_X_API_BASE_URL,
    uploadApiBaseUrl: overrides.uploadApiBaseUrl?.trim() || DEFAULT_X_UPLOAD_API_BASE_URL,
    oauthAuthorizeUrl: overrides.oauthAuthorizeUrl?.trim() || DEFAULT_X_OAUTH_AUTHORIZE_URL,
    oauthTokenUrl: overrides.oauthTokenUrl?.trim() || DEFAULT_X_OAUTH_TOKEN_URL,
    scopes: overrides.scopes?.length ? overrides.scopes : DEFAULT_SCOPES,
    approvalMode: 'always',
    draftsFilePath: overrides.draftsFilePath?.trim() || DEFAULT_DRAFTS_FILE_PATH,
    sessionFilePath: overrides.sessionFilePath?.trim() || DEFAULT_SESSION_FILE_PATH,
  };

  if (overrides.clientId?.trim()) config.clientId = overrides.clientId.trim();
  { const value = getClientCredential(overrides)?.trim(); if (value) setClientCredential(config, value); }
  if (overrides.redirectUri?.trim()) config.redirectUri = overrides.redirectUri.trim();
  { const value = getBearerCredential(overrides)?.trim(); if (value) setBearerCredential(config, value); }
  { const value = getUserCredential(overrides)?.trim(); if (value) setUserCredential(config, value); }
  { const value = getRefreshCredential(overrides)?.trim(); if (value) setRefreshCredential(config, value); }
  if (overrides.userId?.trim()) config.userId = overrides.userId.trim();

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
