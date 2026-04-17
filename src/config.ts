import path from 'node:path';

import type { AccountConfig } from './types.js';
import { XPluginError } from './errors.js';

const DEFAULT_X_API_BASE_URL = 'https://api.x.com';
const DEFAULT_X_UPLOAD_API_BASE_URL = 'https://api.x.com';
const DEFAULT_X_OAUTH_AUTHORIZE_URL = 'https://x.com/i/oauth2/authorize';
const DEFAULT_X_OAUTH_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const DEFAULT_DRAFTS_FILE_PATH = path.resolve(process.cwd(), '.openclaw-x-drafts.json');
const DEFAULT_SESSION_FILE_PATH = path.resolve(process.cwd(), '.openclaw-x-session.json');
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access', 'media.write'];

export function loadAccountConfig(env: NodeJS.ProcessEnv = process.env): AccountConfig {
  const config: AccountConfig = {
    apiBaseUrl: env.X_API_BASE_URL?.trim() || DEFAULT_X_API_BASE_URL,
    uploadApiBaseUrl: env.X_UPLOAD_API_BASE_URL?.trim() || DEFAULT_X_UPLOAD_API_BASE_URL,
    oauthAuthorizeUrl: env.X_OAUTH_AUTHORIZE_URL?.trim() || DEFAULT_X_OAUTH_AUTHORIZE_URL,
    oauthTokenUrl: env.X_OAUTH_TOKEN_URL?.trim() || DEFAULT_X_OAUTH_TOKEN_URL,
    scopes: env.X_OAUTH_SCOPES?.split(',').map((part) => part.trim()).filter(Boolean) || DEFAULT_SCOPES,
    approvalMode: 'always',
    draftsFilePath: env.X_DRAFTS_FILE_PATH?.trim() || DEFAULT_DRAFTS_FILE_PATH,
    sessionFilePath: env.X_SESSION_FILE_PATH?.trim() || DEFAULT_SESSION_FILE_PATH,
  };

  if (env.X_CLIENT_ID) config.clientId = env.X_CLIENT_ID;
  if (env.X_CLIENT_SECRET) config.clientSecret = env.X_CLIENT_SECRET;
  if (env.X_REDIRECT_URI) config.redirectUri = env.X_REDIRECT_URI;
  if (env.X_BEARER_TOKEN) config.bearerToken = env.X_BEARER_TOKEN;
  if (env.X_ACCESS_TOKEN) config.accessToken = env.X_ACCESS_TOKEN;
  if (env.X_REFRESH_TOKEN) config.refreshToken = env.X_REFRESH_TOKEN;
  if (env.X_USER_ID) config.userId = env.X_USER_ID;

  return config;
}

export function assertReadConfigPresent(config: AccountConfig): void {
  if (config.bearerToken || config.accessToken) {
    return;
  }

  throw new XPluginError('CONFIG_ERROR', 'No X read credential found in environment.', {
    details: {
      expected: ['X_BEARER_TOKEN', 'X_ACCESS_TOKEN'],
    },
  });
}

export function assertWriteConfigPresent(config: AccountConfig): void {
  if (config.accessToken) {
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
