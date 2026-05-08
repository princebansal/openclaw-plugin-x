import { Type } from '@sinclair/typebox';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { z } from 'zod';

import { routeToolRequest } from './router.js';
import type { AccountConfig } from './types.js';

const pluginConfigZodSchema = z.object({
  apiBaseUrl: z.string().optional(),
  uploadApiBaseUrl: z.string().optional(),
  oauthAuthorizeUrl: z.string().optional(),
  oauthTokenUrl: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  bearerToken: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  userId: z.string().optional(),
  draftsFilePath: z.string().optional(),
  sessionFilePath: z.string().optional(),
}).strict();

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
      clientSecret: { type: 'string' },
      redirectUri: { type: 'string' },
      bearerToken: { type: 'string' },
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      userId: { type: 'string' },
      draftsFilePath: { type: 'string' },
      sessionFilePath: { type: 'string' },
    },
  },
  uiHints: {
    clientId: { label: 'X Client ID' },
    clientSecret: { label: 'X Client Secret', sensitive: true },
    redirectUri: { label: 'OAuth Redirect URI' },
    bearerToken: { label: 'X Bearer Token', sensitive: true, advanced: true },
    accessToken: { label: 'X Access Token', sensitive: true, advanced: true },
    refreshToken: { label: 'X Refresh Token', sensitive: true, advanced: true },
    draftsFilePath: { label: 'Draft store path', advanced: true },
    sessionFilePath: { label: 'Session store path', advanced: true },
  },
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
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.connect', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_account_auth_url',
      label: 'X Account Auth URL',
      description: 'Generate an OAuth PKCE authorization URL for connecting an X account.',
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.auth_url', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_account_complete',
      label: 'X Account Complete OAuth',
      description: 'Complete X OAuth using an authorization code or full redirect URL.',
      parameters: Type.Object({
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
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: (params) => executeAction('x.account.me', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_followers_list',
      label: 'X Followers List',
      description: 'Fetch followers for the connected X account or a specified user id.',
      parameters: Type.Object({
        userId: Type.Optional(Type.String()),
        maxResults: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
        paginationToken: Type.Optional(Type.String()),
        allPages: Type.Optional(Type.Boolean()),
        maxPages: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.followers.list', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_create',
      label: 'X Post Create Draft',
      description: 'Create a durable draft for a new X post.',
      parameters: Type.Object({
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
        draftId: Type.String(),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.post.publish', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_media_upload',
      label: 'X Media Upload Validate',
      description: 'Validate media for a future X upload flow.',
      parameters: Type.Object({
        path: Type.String(),
        mimeType: Type.Optional(Type.String()),
        altText: Type.Optional(Type.String()),
      }, { additionalProperties: false }),
      execute: (params) => executeAction('x.media.upload', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_timeline_mentions',
      label: 'X Timeline Mentions',
      description: 'Fetch mention timeline context for X (currently scaffold/stub).',
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: (params) => executeAction('x.timeline.mentions', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_timeline_me',
      label: 'X Timeline Me',
      description: 'Fetch own timeline/account context for X (currently scaffold/stub).',
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: (params) => executeAction('x.timeline.me', { ...params }, pluginConfig),
    });

    registerTool({
      name: 'x_post_get',
      label: 'X Post Get',
      description: 'Fetch a specific X post by id or URL.',
      parameters: Type.Object({
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
