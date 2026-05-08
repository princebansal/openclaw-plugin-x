import {
  buildAuthorizationUrl,
  buildConnectPlan,
  exchangeAuthorizationCode,
  finalizeSession,
  getSession,
  refreshAccessToken,
  setSession,
} from './auth.js';
import { XApiHttpClient } from './client.js';
import { loadAccountConfig, assertOAuthConfigPresent, assertReadConfigPresent } from './config.js';
import { approveDraftRecord, createDraftRecord, getDraftRecord, publishDraftRecord } from './drafts.js';
import { normalizeError, XPluginError } from './errors.js';
import { buildEngagementPlan } from './services/engagement.js';
import { buildMediaDraft, uploadMediaV2 } from './services/media.js';
import { normalizeTimelineResponse } from './normalize.js';
import { buildCreatePostBody, buildGetPostPath, buildPostDraft, buildThreadPlan } from './services/posts.js';
import type { DraftRecord, ToolRequest, ToolResponse, XAction } from './types.js';
import { resolvePostUrl } from './url.js';

function ok<TData>(action: XAction, data: TData, dryRun = true, warnings: string[] = []): ToolResponse<TData> {
  return { ok: true, action, dryRun, data, warnings };
}

function fail(action: XAction, error: unknown, dryRun = true, warnings: string[] = []): ToolResponse {
  return { ok: false, action, dryRun, warnings, error: normalizeError(error) };
}

export async function routeToolRequest(request: ToolRequest): Promise<ToolResponse> {
  try {
    const baseConfig = loadAccountConfig(request.pluginConfig ?? {});
    const session = getSession(baseConfig.sessionFilePath);
    const config = withSessionTokens(baseConfig, session);
    const client = new XApiHttpClient(config);

    switch (request.action) {
      case 'x.account.connect': {
        return ok(request.action, {
          configPresent: Boolean(config.clientId || config.bearerToken || config.accessToken),
          approvalMode: config.approvalMode,
          draftsFilePath: config.draftsFilePath,
          sessionFilePath: config.sessionFilePath,
          session: redactSession(session),
          plan: buildConnectPlan(config),
        });
      }
      case 'x.account.auth_url': {
        assertOAuthConfigPresent(config);
        const pending = buildAuthorizationUrl(config);
        const existing = session ?? { accountId: 'default', scopes: [] };
        const stored = setSession(config.sessionFilePath, {
          ...existing,
          pendingOAuth: pending,
          scopes: existing.scopes?.length ? existing.scopes : pending.scopes,
        });
        return ok(request.action, {
          authorizeUrl: pending.authorizeUrl,
          state: pending.state,
          redirectUri: pending.redirectUri,
          scopes: pending.scopes,
          session: redactSession(stored),
        }, true, ['Open this URL, approve the app, then complete the flow with the returned code or full redirect URL.']);
      }
      case 'x.account.complete': {
        const input = request.input as { code?: string; redirectUrl?: string; state?: string };
        const pending = session?.pendingOAuth;
        if (!pending) {
          throw new XPluginError('AUTH_REQUIRED', 'No pending OAuth session found. Generate an auth URL first.');
        }

        const parsed = parseOAuthCompletionInput(input);
        if (parsed.state && parsed.state !== pending.state) {
          throw new XPluginError('AUTH_REQUIRED', 'OAuth state mismatch.', {
            details: { expected: pending.state, received: parsed.state },
          });
        }

        const token = await exchangeAuthorizationCode({
          config,
          code: parsed.code,
          codeVerifier: pending.codeVerifier,
        });

        const me = token.access_token
          ? await fetchAuthenticatedMe({ ...config, accessToken: token.access_token })
          : undefined;

        const finalized = finalizeSession({
          existing: session,
          token,
          pendingOAuth: pending,
          ...(me ? { me: {
            ...(me.id ? { id: me.id } : {}),
            ...(me.username ? { username: me.username } : {}),
          } } : {}),
        });
        const stored = setSession(config.sessionFilePath, finalized);
        return ok(request.action, {
          connected: true,
          session: redactSession(stored),
          me,
        }, false, ['OAuth exchange completed. Callback HTTP route is still not wired; this used manual code completion.']);
      }
      case 'x.account.me': {
        const effectiveSession = await ensureFreshSession(config, session);
        const me = await fetchAuthenticatedMe(withSessionTokens(config, effectiveSession));
        if (effectiveSession) {
          setSession(config.sessionFilePath, {
            ...effectiveSession,
            ...(me.id ? { userId: me.id } : {}),
            ...(me.username ? { username: me.username } : {}),
          });
        }
        return ok(request.action, { me }, false);
      }
      case 'x.followers.list': {
        const input = request.input as {
          userId?: string;
          maxResults?: number;
          paginationToken?: string;
          allPages?: boolean;
          maxPages?: number;
        };

        const effectiveSession = await ensureFreshSession(config, session);
        const effectiveConfig = withSessionTokens(config, effectiveSession);
        const targetUserId = input.userId?.trim() || effectiveSession?.userId || effectiveConfig.userId;
        if (!targetUserId) {
          throw new XPluginError('AUTH_REQUIRED', 'Connected user id is missing. Reconnect the X account first.');
        }

        assertSessionScopes(effectiveSession, ['follows.read', 'tweet.read', 'users.read'], 'x.followers.list');

        const pageSize = normalizePageSize(input.maxResults);
        const allPages = input.allPages === true;
        const maxPages = normalizeMaxPages(input.maxPages, allPages ? 20 : 1);
        const followersClient = new XApiHttpClient(effectiveConfig);

        let paginationToken = input.paginationToken?.trim() || undefined;
        let pageCount = 0;
        let nextPaginationToken: string | undefined;
        const followersById = new Map<string, ReturnType<typeof normalizeFollowers>[number]>();
        const pageSummaries: Array<{ page: number; resultCount: number; nextPaginationToken?: string }> = [];

        do {
          const response = await followersClient.request<{
            data?: Record<string, unknown>[];
            meta?: Record<string, unknown>;
          }>({
            method: 'GET',
            path: buildFollowersPath(targetUserId, {
              maxResults: pageSize,
              ...(paginationToken ? { paginationToken } : {}),
            }),
            authMode: 'user',
          });

          const normalizedFollowers = normalizeFollowers(response.data ?? []);
          for (const follower of normalizedFollowers) {
            followersById.set(follower.id, follower);
          }

          nextPaginationToken = typeof response.meta?.next_token === 'string'
            ? response.meta.next_token
            : undefined;
          pageCount += 1;
          pageSummaries.push({
            page: pageCount,
            resultCount: normalizedFollowers.length,
            ...(nextPaginationToken ? { nextPaginationToken } : {}),
          });
          paginationToken = nextPaginationToken;
        } while (allPages && paginationToken && pageCount < maxPages);

        const followers = Array.from(followersById.values());
        return ok(request.action, {
          userId: targetUserId,
          followers,
          usernames: followers.map((follower) => follower.username),
          pageSize,
          pageCount,
          ...(nextPaginationToken ? { nextPaginationToken } : {}),
          partial: Boolean(allPages && nextPaginationToken),
          pageSummaries,
        }, false, allPages && nextPaginationToken
          ? [`Stopped after ${pageCount} page(s). Use nextPaginationToken to continue or increase maxPages.`]
          : []);
      }
      case 'x.post.create': {
        const draft = buildPostDraft(request.input as { text: string; mediaIds?: string[] });
        const record = createDraftRecord({
          filePath: config.draftsFilePath,
          intent: 'post',
          draft,
        });
        return ok(request.action, {
          draftId: record.id,
          intent: 'post',
          preview: buildDraftPreview(record),
          draft: record,
          liveReady: false,
        }, true, [
          'Draft created. Explicit approval is required before any publish path exists.',
        ]);
      }
      case 'x.post.reply': {
        const input = request.input as { text: string; mediaIds?: string[]; replyToPostId?: string; replyToUrl?: string };
        const targetId = input.replyToPostId ?? (input.replyToUrl ? resolvePostUrl(input.replyToUrl).postId : undefined);
        if (!targetId) {
          throw new XPluginError('VALIDATION_ERROR', 'Reply target is required.');
        }
        const draft = buildPostDraft({ text: input.text, mediaIds: input.mediaIds });
        const record = createDraftRecord({
          filePath: config.draftsFilePath,
          intent: 'reply',
          draft: { ...draft, replyToPostId: targetId },
          ...(input.replyToUrl ? { metadata: { replyToUrl: input.replyToUrl } } : {}),
        });
        return ok(request.action, {
          draftId: record.id,
          intent: 'reply',
          preview: buildDraftPreview(record),
          target: {
            postId: targetId,
            ...(input.replyToUrl ? { url: input.replyToUrl } : {}),
          },
          draft: record,
          liveReady: false,
        }, true, [
          'Reply draft created. Explicit approval is required before publish.',
        ]);
      }
      case 'x.post.quote': {
        const input = request.input as { text: string; mediaIds?: string[]; quotePostId?: string; quoteUrl?: string };
        const targetId = input.quotePostId ?? (input.quoteUrl ? resolvePostUrl(input.quoteUrl).postId : undefined);
        if (!targetId) {
          throw new XPluginError('VALIDATION_ERROR', 'Quote target is required.');
        }
        const draft = buildPostDraft({ text: input.text, mediaIds: input.mediaIds });
        const record = createDraftRecord({
          filePath: config.draftsFilePath,
          intent: 'quote',
          draft: { ...draft, quotePostId: targetId },
          ...(input.quoteUrl ? { metadata: { quoteUrl: input.quoteUrl } } : {}),
        });
        return ok(request.action, {
          draftId: record.id,
          intent: 'quote',
          preview: buildDraftPreview(record),
          target: {
            postId: targetId,
            ...(input.quoteUrl ? { url: input.quoteUrl } : {}),
          },
          draft: record,
          liveReady: false,
        }, true, [
          'Quote draft created. Explicit approval is required before publish.',
        ]);
      }
      case 'x.post.thread': {
        const plan = buildThreadPlan(request.input as { posts: { text: string; mediaIds?: string[] }[] });
        const record = createDraftRecord({
          filePath: config.draftsFilePath,
          intent: 'thread',
          thread: plan.map((step) => step.draft),
        });
        return ok(request.action, {
          draftId: record.id,
          intent: 'thread',
          preview: buildDraftPreview(record),
          draft: record,
          liveReady: false,
        }, true, [
          'Thread draft created. Explicit approval is required before publish.',
        ]);
      }
      case 'x.post.approve': {
        const input = request.input as { draftId: string; approvedBy?: string; note?: string };
        if (!input?.draftId) {
          throw new XPluginError('VALIDATION_ERROR', 'draftId is required for approval.');
        }
        const approved = approveDraftRecord(config.draftsFilePath, input.draftId, {
          ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
          ...(input.note ? { note: input.note } : {}),
        });
        return ok(request.action, {
          approved,
          publishReady: true,
          note: 'Approval state is recorded. Draft can now be published via x.post.publish.',
        }, true, ['Approval captured.']);
      }

      case 'x.post.publish': {
        const input = request.input as { draftId: string };
        if (!input?.draftId) {
          throw new XPluginError('VALIDATION_ERROR', 'draftId is required for publish.');
        }

        const effectiveSession = await ensureFreshSession(config, session);
        const effectiveConfig = withSessionTokens(config, effectiveSession);
        const publishClient = new XApiHttpClient(effectiveConfig);
        const draft = getDraftRecord(config.draftsFilePath, input.draftId);

        if (draft.status !== 'approved') {
          throw new XPluginError('AUTH_REQUIRED', 'Draft must be approved before publishing.', {
            details: { draftId: input.draftId, status: draft.status },
          });
        }

        if (draft.draft) {
          const response = await publishClient.request<{ data?: { id?: string; text?: string } }>({
            method: 'POST',
            path: '/2/tweets',
            authMode: 'user',
            body: buildCreatePostBody(draft.draft),
          });

          const postId = response.data?.id;
          if (!postId) {
            throw new XPluginError('API_ERROR', 'Publish succeeded without returning a post id.', {
              details: { response },
            });
          }

          const published = publishDraftRecord(config.draftsFilePath, input.draftId, {
            postId,
            url: `https://x.com/${effectiveSession?.username ?? 'i'}/status/${postId}`,
            publishedAt: new Date().toISOString(),
          });

          return ok(request.action, {
            draftId: input.draftId,
            published,
            result: {
              postId,
              url: published.published?.url,
              text: response.data?.text ?? draft.draft.text,
            },
          }, false);
        }

        if (draft.thread?.length) {
          const threadPostIds: string[] = [];
          const threadUrls: string[] = [];
          const results: Array<{ index: number; postId: string; url: string; text: string }> = [];
          let previousPostId: string | undefined;

          for (const [index, post] of draft.thread.entries()) {
            const response = await publishClient.request<{ data?: { id?: string; text?: string } }>({
              method: 'POST',
              path: '/2/tweets',
              authMode: 'user',
              body: buildCreatePostBody({
                ...post,
                ...(previousPostId ? { replyToPostId: previousPostId } : {}),
              }),
            });

            const postId = response.data?.id;
            if (!postId) {
              throw new XPluginError('API_ERROR', 'Thread publish succeeded without returning a post id.', {
                details: { response, draftId: input.draftId, index: index + 1 },
              });
            }

            const url = `https://x.com/${effectiveSession?.username ?? 'i'}/status/${postId}`;
            threadPostIds.push(postId);
            threadUrls.push(url);
            results.push({
              index: index + 1,
              postId,
              url,
              text: response.data?.text ?? post.text,
            });
            previousPostId = postId;
          }

          const publishedAt = new Date().toISOString();
          const published = publishDraftRecord(config.draftsFilePath, input.draftId, {
            postId: threadPostIds[0],
            url: threadUrls[0],
            publishedAt,
            threadPostIds,
            threadUrls,
          });

          return ok(request.action, {
            draftId: input.draftId,
            published,
            result: {
              postId: threadPostIds[0],
              url: threadUrls[0],
              threadPostIds,
              threadUrls,
              posts: results,
            },
          }, false);
        }

        throw new XPluginError('VALIDATION_ERROR', 'Draft does not contain a publishable post or thread.', {
          details: { draftId: input.draftId, intent: draft.intent },
        });
      }
      case 'x.media.upload': {
        const media = buildMediaDraft(request.input as { path: string; mimeType?: string; altText?: string });
        const effectiveSession = await ensureFreshSession(config, session);
        const accessToken = effectiveSession?.accessToken ?? config.accessToken;
        if (!accessToken) {
          throw new XPluginError('AUTH_REQUIRED', 'Media upload requires a connected X user access token.');
        }
        const uploaded = await uploadMediaV2({
          config,
          accessToken,
          media,
        });
        return ok(request.action, { media, uploaded, liveReady: true }, false);
      }
      case 'x.timeline.mentions':
      case 'x.timeline.me':
      case 'x.post.get':
      case 'x.post.context':
      case 'x.engagement.like':
      case 'x.engagement.repost':
      case 'x.engagement.bookmark': {
        if (request.action === 'x.post.get' || request.action === 'x.post.context') {
          const input = request.input as { postId?: string; url?: string };
          const resolved = input.url ? resolvePostUrl(input.url) : undefined;
          const postId = input.postId?.trim() || resolved?.postId;
          if (!postId) {
            throw new XPluginError('VALIDATION_ERROR', 'postId or url is required.');
          }

          const response = await client.request<{
            data?: Record<string, unknown>;
            includes?: Record<string, unknown>;
            errors?: unknown;
          }>({
            method: 'GET',
            path: buildGetPostPath(postId),
            authMode: 'user',
          });

          const normalized = normalizeTimelinePayloadOne(response);
          return ok(request.action, {
            postId,
            resolved,
            post: normalized.post,
            includes: normalized.includes,
            ...(request.action === 'x.post.context'
              ? {
                  context: {
                    root: normalized.post,
                    referenced: normalized.post?.referenced ?? [],
                  },
                }
              : {}),
            response,
          }, false);
        }

        if (request.action.startsWith('x.engagement.')) {
          const kind = request.action.split('.').at(-1) as 'like' | 'repost' | 'bookmark';
          return ok(request.action, {
            plan: buildEngagementPlan(kind, request.input as { postId: string; undo?: boolean }),
          }, true, ['Engagement transport is pending.']);
        }

        if (request.action === 'x.timeline.me' || request.action === 'x.timeline.mentions') {
          const effectiveSession = await ensureFreshSession(config, session);
          const effectiveConfig = withSessionTokens(config, effectiveSession);
          const userId = effectiveSession?.userId ?? effectiveConfig.userId;
          if (!userId) {
            throw new XPluginError('AUTH_REQUIRED', 'Connected user id is missing. Reconnect the X account first.');
          }

          const timelineClient = new XApiHttpClient(effectiveConfig);
          const timelinePath = request.action === 'x.timeline.me'
            ? `/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,author_id,conversation_id,public_metrics,referenced_tweets&expansions=author_id,referenced_tweets.id&user.fields=id,name,username`
            : `/2/users/${userId}/mentions?max_results=5&tweet.fields=created_at,author_id,conversation_id,public_metrics,referenced_tweets&expansions=author_id,referenced_tweets.id&user.fields=id,name,username`;

          const response = await timelineClient.request<{
            data?: Record<string, unknown>[];
            includes?: Record<string, unknown>;
            meta?: Record<string, unknown>;
          }>({
            method: 'GET',
            path: timelinePath,
            authMode: 'user',
          });

          if (effectiveSession) {
            setSession(config.sessionFilePath, effectiveSession);
          }

          const normalized = normalizeTimelineResponse(response);
          return ok(request.action, {
            userId,
            latest: normalized.latest ?? null,
            posts: normalized.posts,
            includes: normalized.includes,
            meta: normalized.meta,
            response,
          }, false);
        }

        assertReadConfigPresent(config);
        await client.request({ method: 'GET', path: `/${request.action}` });
        throw new XPluginError('NOT_IMPLEMENTED', 'Read action routing placeholder reached unexpectedly.');
      }
      case 'x.util.resolve_url': {
        const input = request.input as { url: string };
        return ok(request.action, resolvePostUrl(input.url), true);
      }
      default:
        throw new XPluginError('VALIDATION_ERROR', `Unsupported action: ${String((request as { action?: unknown }).action)}`);
    }
  } catch (error) {
    return fail(request.action, error, true);
  }
}

function parseOAuthCompletionInput(input: { code?: string; redirectUrl?: string; state?: string }): { code: string; state?: string } {
  if (input.code?.trim()) {
    return { code: input.code.trim(), ...(input.state?.trim() ? { state: input.state.trim() } : {}) };
  }

  if (!input.redirectUrl?.trim()) {
    throw new XPluginError('VALIDATION_ERROR', 'Either code or redirectUrl is required to complete OAuth.');
  }

  const url = new URL(input.redirectUrl);
  const code = url.searchParams.get('code')?.trim();
  const state = url.searchParams.get('state')?.trim() || undefined;
  if (!code) {
    throw new XPluginError('VALIDATION_ERROR', 'OAuth redirect URL is missing code.');
  }

  return { code, ...(state ? { state } : {}) };
}

async function fetchAuthenticatedMe(config: ReturnType<typeof loadAccountConfig>) {
  const client = new XApiHttpClient(config);
  const response = await client.request<{ data?: { id?: string; username?: string; name?: string } }>({
    method: 'GET',
    path: '/2/users/me',
    authMode: 'user',
  });

  return response.data ?? {};
}

async function ensureFreshSession(config: ReturnType<typeof loadAccountConfig>, session?: ReturnType<typeof getSession>) {
  const current = session ?? getSession(config.sessionFilePath);
  if (!current) return current;
  if (!current.refreshToken) return current;
  if (!current.expiresAt) return current;

  const expiresAtMs = Date.parse(current.expiresAt);
  if (!Number.isFinite(expiresAtMs)) return current;

  const msUntilExpiry = expiresAtMs - Date.now();
  if (msUntilExpiry > 5 * 60 * 1000) {
    return current;
  }

  const refreshed = await refreshAccessToken({
    config,
    refreshToken: current.refreshToken,
  });

  const next = finalizeSession({
    existing: current,
    token: refreshed,
  });
  setSession(config.sessionFilePath, next);
  return next;
}

function withSessionTokens(config: ReturnType<typeof loadAccountConfig>, session?: ReturnType<typeof getSession>) {
  if (!session) return config;

  return {
    ...config,
    ...(session.accessToken ? { accessToken: session.accessToken } : {}),
    ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    ...(session.userId ? { userId: session.userId } : {}),
  };
}

function redactSession(session?: ReturnType<typeof getSession>) {
  if (!session) return undefined;
  const { accessToken, refreshToken, pendingOAuth, ...safeSession } = session;
  return {
    ...safeSession,
    hasAccessToken: Boolean(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    ...(pendingOAuth ? {
      pendingOAuth: {
        state: pendingOAuth.state,
        codeChallenge: pendingOAuth.codeChallenge,
        authorizeUrl: pendingOAuth.authorizeUrl,
        createdAt: pendingOAuth.createdAt,
        redirectUri: pendingOAuth.redirectUri,
        scopes: pendingOAuth.scopes,
      },
    } : {}),
  };
}

function normalizeTimelinePayloadOne(response: { data?: Record<string, unknown>; includes?: Record<string, unknown> }) {
  const normalized = normalizeTimelineResponse({
    data: response.data ? [response.data] : [],
    ...(response.includes ? { includes: response.includes } : {}),
    meta: {},
  });

  return {
    post: normalized.posts[0],
    includes: normalized.includes,
  };
}

function buildDraftPreview(record: DraftRecord) {
  if (record.intent === 'thread') {
    return {
      draftId: record.id,
      intent: record.intent,
      status: record.status,
      postCount: record.thread?.length ?? 0,
      posts: (record.thread ?? []).map((post, index) => ({
        index: index + 1,
        text: post.text ?? '',
      })),
    };
  }

  return {
    draftId: record.id,
    intent: record.intent,
    status: record.status,
    text: record.draft?.text ?? '',
    ...(record.draft?.replyToPostId ? { replyToPostId: record.draft.replyToPostId } : {}),
    ...(record.draft?.quotePostId ? { quotePostId: record.draft.quotePostId } : {}),
  };
}

function buildFollowersPath(userId: string, input: { maxResults: number; paginationToken?: string }) {
  const query = new URLSearchParams({
    max_results: String(input.maxResults),
    'user.fields': 'created_at,description,profile_image_url,protected,public_metrics,url,verified',
  });

  if (input.paginationToken) {
    query.set('pagination_token', input.paginationToken);
  }

  return `/2/users/${userId}/followers?${query.toString()}`;
}

function normalizeFollowers(rows: Record<string, unknown>[]) {
  return rows
    .map((row) => {
      const id = typeof row.id === 'string' ? row.id : undefined;
      const username = typeof row.username === 'string' ? row.username : undefined;
      if (!id || !username) {
        return undefined;
      }

      return {
        id,
        username,
        ...(typeof row.name === 'string' ? { name: row.name } : {}),
        ...(typeof row.description === 'string' ? { description: row.description } : {}),
        ...(typeof row.profile_image_url === 'string' ? { profileImageUrl: row.profile_image_url } : {}),
        ...(typeof row.url === 'string' ? { url: row.url } : {}),
        ...(typeof row.created_at === 'string' ? { createdAt: row.created_at } : {}),
        ...(typeof row.protected === 'boolean' ? { protected: row.protected } : {}),
        ...(typeof row.verified === 'boolean' ? { verified: row.verified } : {}),
        ...(row.public_metrics && typeof row.public_metrics === 'object'
          ? { publicMetrics: row.public_metrics as Record<string, unknown> }
          : {}),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function normalizePageSize(value: number | undefined) {
  if (value === undefined) {
    return 1000;
  }

  if (!Number.isInteger(value) || value < 1 || value > 1000) {
    throw new XPluginError('VALIDATION_ERROR', 'maxResults must be an integer between 1 and 1000.');
  }

  return value;
}

function normalizeMaxPages(value: number | undefined, fallback: number) {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new XPluginError('VALIDATION_ERROR', 'maxPages must be an integer between 1 and 100.');
  }

  return value;
}

function assertSessionScopes(
  session: ReturnType<typeof getSession> | undefined,
  requiredScopes: string[],
  feature: string,
) {
  if (!session?.scopes?.length) {
    return;
  }

  const currentScopes = new Set(session.scopes);
  const missingScopes = requiredScopes.filter((scope) => !currentScopes.has(scope));
  if (!missingScopes.length) {
    return;
  }

  throw new XPluginError(
    'AUTH_REQUIRED',
    `Connected X session is missing required scope(s): ${missingScopes.join(', ')}. Reconnect the account and approve the updated scope set.`,
    {
      details: {
        feature,
        missingScopes,
        currentScopes: session.scopes,
        reconnectSteps: ['x_account_auth_url', 'x_account_complete'],
      },
    },
  );
}
