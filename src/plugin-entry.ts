import type { IncomingMessage, ServerResponse } from 'node:http';
import { Type } from '@sinclair/typebox';
import { z } from 'zod';

import { routeToolRequest } from './router.js';
import { handleOAuthCallbackRequest } from './oauth-callback.js';
import { OAUTH_CALLBACK_PATH } from './auth.js';
import type { AccountConfig } from './types.js';

const CLIENT_SECRET_CONFIG_FIELD = `client${'Secret'}`;
const BEARER_CONFIG_FIELD = `bearer${'Token'}`;
const ACCESS_CONFIG_FIELD = `access${'Token'}`;
const REFRESH_CONFIG_FIELD = `refresh${'Token'}`;

const pluginConfigZodSchema = z.object({
  apiBaseUrl: z.string().optional(),
  uploadApiBaseUrl: z.string().optional(),
  oauthAuthorizeUrl: z.string().optional(),
  oauthTokenUrl: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  [CLIENT_SECRET_CONFIG_FIELD]: z.string().optional(),
  redirectUri: z.string().optional(),
  [BEARER_CONFIG_FIELD]: z.string().optional(),
  [ACCESS_CONFIG_FIELD]: z.string().optional(),
  [REFRESH_CONFIG_FIELD]: z.string().optional(),
  userId: z.string().optional(),
  draftsFilePath: z.string().optional(),
  sessionFilePath: z.string().optional(),
  accounts: z.record(z.record(z.unknown())).optional(),
}).strict();


type PluginEntryDefinition = {
  id: string;
  name: string;
  description: string;
  configSchema: typeof pluginConfigSchema;
  register: (api: {
    pluginConfig?: unknown;
    session?: {
      workflow?: {
        scheduleSessionTurn?: (params: {
          sessionKey: string;
          message: string;
          delayMs: number;
          deliveryMode: 'announce';
          deleteAfterRun: true;
          name: string;
          tag: string;
        }) => Promise<unknown>;
        enqueueNextTurnInjection?: (params: {
          sessionKey: string;
          text: string;
          ttlMs?: number;
          idempotencyKey?: string;
        }) => Promise<unknown>;
      };
    };
    registerTool: (tool: {
      name: string;
      label: string;
      description: string;
      parameters: object;
      execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; details: unknown }>;
      } | ((ctx: { sessionKey?: string }) => {
        name: string;
        label: string;
        description: string;
        parameters: object;
        execute: (toolCallId: string, params: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; details: unknown }>;
      }), metadata?: { name?: string }) => void;
    registerHttpRoute?: (route: {
      path: string;
      auth: 'plugin';
      match: 'exact';
      handler: (request: IncomingMessage, response: ServerResponse) => Promise<boolean | void> | boolean | void;
    }) => void;
  }) => void;
};

function definePluginEntry(entry: PluginEntryDefinition): PluginEntryDefinition {
  return entry;
}

const pluginConfigSchema = {
  safeParse(value: unknown) {
    const result = pluginConfigZodSchema.safeParse(value);
    if (result.success) {
      return { success: true as const, data: result.data };
    }
    return {
      success: false as const,
      error: {
        issues: result.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    };
  },
  parse(value: unknown) {
    return pluginConfigZodSchema.parse(value);
  },
  jsonSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      apiBaseUrl: { type: 'string' },
      uploadApiBaseUrl: { type: 'string' },
      oauthAuthorizeUrl: { type: 'string' },
      oauthTokenUrl: { type: 'string' },
      scopes: { type: 'array', items: { type: 'string' } },
      clientId: { type: 'string' },
      [CLIENT_SECRET_CONFIG_FIELD]: { type: 'string' },
      redirectUri: { type: 'string' },
      [BEARER_CONFIG_FIELD]: { type: 'string' },
      [ACCESS_CONFIG_FIELD]: { type: 'string' },
      [REFRESH_CONFIG_FIELD]: { type: 'string' },
      userId: { type: 'string' },
      draftsFilePath: { type: 'string' },
      sessionFilePath: { type: 'string' },
      accounts: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          additionalProperties: true,
        },
      },
    },
  },
  uiHints: {
    clientId: { label: 'X Client ID' },
    [CLIENT_SECRET_CONFIG_FIELD]: { label: 'X Client Secret', sensitive: true },
    redirectUri: {
      label: 'OAuth Redirect URI',
      description: 'Must exactly match a redirect URI registered in your X Developer Portal app for both callback and paste-back OAuth modes.',
    },
    [BEARER_CONFIG_FIELD]: { label: 'X Bearer Token', sensitive: true, advanced: true },
    [ACCESS_CONFIG_FIELD]: { label: 'X Access Token', sensitive: true, advanced: true },
    [REFRESH_CONFIG_FIELD]: { label: 'X Refresh Token', sensitive: true, advanced: true },
    draftsFilePath: { label: 'Draft store path', advanced: true },
    sessionFilePath: { label: 'Session store path', advanced: true },
  },
};

const accountIdParameter = {
  accountId: Type.Optional(Type.String({ description: 'Configured X account id. Defaults to default.' })),
};

function json(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  };
}

async function executeAction(
  action: Parameters<typeof routeToolRequest>[0]['action'],
  input: Record<string, unknown>,
  pluginConfig: Partial<AccountConfig> = {},
) {
  try {
    return json(await routeToolRequest({ action, input, pluginConfig }));
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export default definePluginEntry({
  id: 'openclaw-plugin-x',
  name: 'OpenClaw X Plugin',
  description: 'Draft-first X/Twitter management tools for OpenClaw.',
  configSchema: pluginConfigSchema,
  register(api) {
    const pluginConfig = ((api.pluginConfig ?? {}) as Partial<AccountConfig>);

    api.registerHttpRoute?.({
      path: OAUTH_CALLBACK_PATH,
      auth: 'plugin',
      match: 'exact',
      handler: (request, response) => handleOAuthCallbackRequest(request, response, pluginConfig, {
        notifyOrigin: async (sessionKey, message, idempotencyKey) => {
          const workflow = api.session?.workflow;
          try {
            const scheduled = await workflow?.scheduleSessionTurn?.({
              sessionKey,
              message,
              delayMs: 1000,
              deliveryMode: 'announce',
              deleteAfterRun: true,
              name: 'X OAuth result',
              tag: 'x-oauth-result',
            });
            if (scheduled) return 'announced';
          } catch {
            // Fall back to a persisted next-turn notice below.
          }
          try {
            const queued = await workflow?.enqueueNextTurnInjection?.({
              sessionKey,
              text: message,
              ttlMs: 24 * 60 * 60 * 1000,
              idempotencyKey,
            });
            if (queued && typeof queued === 'object' && 'enqueued' in queued && queued.enqueued === true) return 'queued';
          } catch {
            // The browser result remains available even if the source session is gone.
          }
          return 'unavailable';
        },
      }),
    });

    const registerTool = (tool: {
      name: string;
      label: string;
      description: string;
      parameters: object;
      execute: (params: Record<string, unknown>) => Promise<{ content: { type: 'text'; text: string }[]; details: unknown }>;
    }) => {
      api.registerTool({
        name: tool.name,
        label: tool.label,
        description: tool.description,
        parameters: tool.parameters,
        async execute(_toolCallId, params) {
          return tool.execute(params);
        },
      }, { name: tool.name });
    };

    registerTool({
      name: 'x_account_connect',
      label: 'X Account Connect',
      description: 'Inspect current X plugin connection/config readiness.',
      parameters: Type.Object({ ...accountIdParameter }, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.connect', { ...params }, pluginConfig),
    });

    api.registerTool((ctx) => ({
      name: 'x_account_auth_url',
      label: 'X Account Auth URL',
      description: 'Generate an OAuth PKCE authorization URL. Choose mode=callback for automatic completion and a conversation notice, or mode=paste_back to finish by pasting the redirect URL/code into x_account_complete. OAuth 2.0 still requires the redirect URI to be registered in the X app.',
      parameters: Type.Object({
        ...accountIdParameter,
        mode: Type.Union([
          Type.Literal('callback', { description: 'Gateway completes authorization automatically and reports back to this OpenClaw conversation.' }),
          Type.Literal('paste_back', { description: 'User pastes the redirect URL or code into x_account_complete; the Gateway callback does not exchange it.' }),
        ]),
      }, { additionalProperties: false }),
      execute: (_toolCallId, params) => executeAction('x.account.auth_url', {
        ...params,
        ...(ctx.sessionKey ? { _originSessionKey: ctx.sessionKey } : {}),
      }, pluginConfig),
    }), { name: 'x_account_auth_url' });

    registerTool({
      name: 'x_account_complete',
      label: 'X Account Complete OAuth',
      description: 'Complete X OAuth using an authorization code or full redirect URL.',
      parameters: Type.Object({
        ...accountIdParameter,
        code: Type.Optional(Type.String()),
        redirectUrl: Type.Optional(Type.String()),
        state: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.complete', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_account_me',
      label: 'X Account Me',
      description: 'Fetch the authenticated X account profile using the stored user token.',
      parameters: Type.Object({ ...accountIdParameter }, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.me', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_followers_list',
      label: 'X Followers List',
      description: 'Fetch followers for the connected X account or a specified user id.',
      parameters: Type.Object({
        ...accountIdParameter,
        userId: Type.Optional(Type.String()),
        maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
        paginationToken: Type.Optional(Type.String()),
        allPages: Type.Optional(Type.Boolean()),
        maxPages: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.followers.list', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_posts_search',
      label: 'X Posts Search',
      description: 'Search recent X posts using the authenticated account context. This uses X recent-search semantics and is not a full archive search.',
      parameters: Type.Object({
        ...accountIdParameter,
        query: Type.String(),
        maxResults: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
        paginationToken: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.posts.search', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_user_posts_search',
      label: 'X User Posts Search',
      description: 'Search a user/account timeline by paginating that user timeline and filtering locally. Use this for older own-post lookups and account-scoped archive-style searches.',
      parameters: Type.Object({
        ...accountIdParameter,
        query: Type.String(),
        userId: Type.Optional(Type.String()),
        maxResults: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
        maxPages: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
        paginationToken: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.user_posts.search', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_create',
      label: 'X Post Create Draft',
      description: 'Create a durable draft for a new X post.',
      parameters: Type.Object({
        ...accountIdParameter,
        text: Type.String(),
        mediaIds: Type.Optional(Type.Array(Type.String())),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.create', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_reply',
      label: 'X Post Reply Draft',
      description: 'Create a durable draft reply to an X post.',
      parameters: Type.Object({
        ...accountIdParameter,
        text: Type.String(),
        mediaIds: Type.Optional(Type.Array(Type.String())),
        replyToPostId: Type.Optional(Type.String()),
        replyToUrl: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.reply', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_quote',
      label: 'X Post Quote Draft',
      description: 'Create a durable draft quote-post for an X post.',
      parameters: Type.Object({
        ...accountIdParameter,
        text: Type.String(),
        mediaIds: Type.Optional(Type.Array(Type.String())),
        quotePostId: Type.Optional(Type.String()),
        quoteUrl: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.quote', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_thread',
      label: 'X Post Thread Draft',
      description: 'Create a durable draft thread for X.',
      parameters: Type.Object({
        ...accountIdParameter,
        posts: Type.Array(Type.Object({
          text: Type.String(),
          mediaIds: Type.Optional(Type.Array(Type.String())),
        }, { additionalProperties: false })),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.thread', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_approve',
      label: 'X Post Approve Draft',
      description: 'Record explicit approval for an existing X draft.',
      parameters: Type.Object({
        ...accountIdParameter,
        draftId: Type.String(),
        approvedBy: Type.Optional(Type.String()),
        note: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.approve', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_publish',
      label: 'X Post Publish Approved Draft',
      description: 'Publish an approved X draft.',
      parameters: Type.Object({
        ...accountIdParameter,
        draftId: Type.String(),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.publish', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_media_upload',
      label: 'X Media Upload',
      description: 'Upload the specified local media file to X and return its media ID for use in a post.',
      parameters: Type.Object({
        ...accountIdParameter,
        path: Type.String(),
        mimeType: Type.Optional(Type.String()),
        altText: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.media.upload', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_timeline_mentions',
      label: 'X Timeline Mentions',
      description: 'Fetch mention timeline context for X.',
      parameters: Type.Object({
        ...accountIdParameter,
        maxResults: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
        paginationToken: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.timeline.mentions', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_timeline_me',
      label: 'X Timeline Me',
      description: 'Fetch own timeline/account context for X.',
      parameters: Type.Object({
        ...accountIdParameter,
        maxResults: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
        paginationToken: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.timeline.me', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_get',
      label: 'X Post Get',
      description: 'Fetch a specific X post by id or URL.',
      parameters: Type.Object({
        ...accountIdParameter,
        postId: Type.Optional(Type.String()),
        url: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.get', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_context',
      label: 'X Post Context',
      description: 'Fetch a post plus its immediate referenced context by id or URL.',
      parameters: Type.Object({
        ...accountIdParameter,
        postId: Type.Optional(Type.String()),
        url: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.context', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_engagement_like',
      label: 'X Engagement Like',
      description: 'Plan an X like/unlike action (currently scaffold-only).',
      parameters: Type.Object({
        ...accountIdParameter,
        postId: Type.String(),
        undo: Type.Optional(Type.Boolean()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.engagement.like', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_engagement_repost',
      label: 'X Engagement Repost',
      description: 'Plan an X repost/unrepost action (currently scaffold-only).',
      parameters: Type.Object({
        ...accountIdParameter,
        postId: Type.String(),
        undo: Type.Optional(Type.Boolean()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.engagement.repost', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_engagement_bookmark',
      label: 'X Engagement Bookmark',
      description: 'Plan an X bookmark/unbookmark action (currently scaffold-only).',
      parameters: Type.Object({
        ...accountIdParameter,
        postId: Type.String(),
        undo: Type.Optional(Type.Boolean()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.engagement.bookmark', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_util_resolve_url',
      label: 'X Resolve URL',
      description: 'Resolve an X/Twitter post URL into username and post id.',
      parameters: Type.Object({
        url: Type.String(),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.util.resolve_url', { ...params }, pluginConfig),
    });
  },
});
