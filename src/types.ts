export type XAction =
  | 'x.account.connect'
  | 'x.account.auth_url'
  | 'x.account.complete'
  | 'x.account.me'
  | 'x.followers.list'
  | 'x.post.create'
  | 'x.post.reply'
  | 'x.post.quote'
  | 'x.post.thread'
  | 'x.post.approve'
  | 'x.post.publish'
  | 'x.media.upload'
  | 'x.timeline.mentions'
  | 'x.timeline.me'
  | 'x.post.get'
  | 'x.post.context'
  | 'x.engagement.like'
  | 'x.engagement.repost'
  | 'x.engagement.bookmark'
  | 'x.util.resolve_url';

export interface ToolRequest<TInput = unknown> {
  action: XAction;
  input: TInput;
  pluginConfig?: Partial<AccountConfig> | undefined;
}

export interface ToolSuccess<TData = unknown> {
  ok: true;
  action: XAction;
  dryRun: boolean;
  data: TData;
  warnings: string[];
}

export interface SerializedError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown> | undefined;
}

export interface ToolFailure {
  ok: false;
  action: XAction;
  dryRun: boolean;
  warnings: string[];
  error: SerializedError;
}

export type ToolResponse<TData = unknown> = ToolSuccess<TData> | ToolFailure;

export interface AccountConfig {
  apiBaseUrl: string;
  uploadApiBaseUrl: string;
  oauthAuthorizeUrl: string;
  oauthTokenUrl: string;
  scopes: string[];
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  redirectUri?: string | undefined;
  bearerToken?: string | undefined;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  userId?: string | undefined;
  approvalMode: 'always';
  draftsFilePath: string;
  sessionFilePath: string;
}

export interface SessionState {
  accountId: string;
  userId?: string | undefined;
  username?: string | undefined;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  connectedAt?: string | undefined;
  expiresAt?: string | undefined;
  scopes: string[];
  pendingOAuth?: PendingOAuthState | undefined;
}

export interface PendingOAuthState {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  authorizeUrl: string;
  createdAt: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokenResponse {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
  scope?: string;
}

export interface PostDraft {
  text: string;
  mediaIds?: string[] | undefined;
  replyToPostId?: string | undefined;
  quotePostId?: string | undefined;
}

export interface DraftRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'approved' | 'published';
  intent: 'post' | 'reply' | 'quote' | 'thread';
  approval?: {
    approvedAt: string;
    approvedBy?: string | undefined;
    note?: string | undefined;
  } | undefined;
  draft?: PostDraft | undefined;
  thread?: PostDraft[] | undefined;
  metadata?: Record<string, unknown> | undefined;
  published?: {
    postId: string;
    url: string;
    publishedAt: string;
    threadPostIds?: string[] | undefined;
    threadUrls?: string[] | undefined;
  } | undefined;
}

export interface MediaDraft {
  path: string;
  mimeType?: string | undefined;
  altText?: string | undefined;
}

export interface UploadedMedia {
  mediaId: string;
  mimeType?: string | undefined;
  altText?: string | undefined;
  fileName?: string | undefined;
  sizeBytes?: number | undefined;
  uploadMode: 'v2';
}

export interface XApiRequestPlan {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  url: string;
  authMode: 'bearer' | 'user';
  body?: Record<string, unknown> | undefined;
}
