import type { PostDraft, XApiRequestPlan } from '../types.js';
import { XPluginError } from '../errors.js';

export interface CreatePostInput {
  text: string;
  mediaIds?: string[] | undefined;
  dryRun?: boolean | undefined;
}

export interface ReplyPostInput extends CreatePostInput {
  replyToPostId?: string | undefined;
  replyToUrl?: string | undefined;
}

export interface QuotePostInput extends CreatePostInput {
  quotePostId?: string | undefined;
  quoteUrl?: string | undefined;
}

export interface ThreadInput {
  posts: CreatePostInput[];
  dryRun?: boolean | undefined;
}

export function buildPostDraft(input: CreatePostInput): PostDraft {
  const text = input.text.trim();
  if (!text) {
    throw new XPluginError('VALIDATION_ERROR', 'Post text cannot be empty.');
  }

  if (text.length > 280) {
    throw new XPluginError('VALIDATION_ERROR', 'Post text exceeds 280 characters.', {
      details: { length: text.length },
    });
  }

  return {
    text,
    mediaIds: input.mediaIds,
  };
}

export function buildCreatePostBody(draft: PostDraft): Record<string, unknown> {
  return {
    text: draft.text,
    ...(draft.mediaIds?.length ? { media: { media_ids: draft.mediaIds } } : {}),
    ...(draft.replyToPostId ? { reply: { in_reply_to_tweet_id: draft.replyToPostId } } : {}),
    ...(draft.quotePostId ? { quote_tweet_id: draft.quotePostId } : {}),
  };
}

export function buildGetPostPath(postId: string): string {
  const normalizedPostId = postId.trim();
  if (!normalizedPostId) {
    throw new XPluginError('VALIDATION_ERROR', 'postId is required.');
  }

  const query = new URLSearchParams({
    'tweet.fields': 'created_at,author_id,conversation_id,public_metrics,referenced_tweets',
    expansions: 'author_id,referenced_tweets.id',
    'user.fields': 'id,name,username',
  });

  return `/2/tweets/${normalizedPostId}?${query.toString()}`;
}

export function summarizeCreatePlan(plan: XApiRequestPlan, draft: PostDraft) {
  return {
    request: plan,
    draft,
    honestStatus:
      plan.authMode === 'user'
        ? 'Request shape is wired for the real X v2 create tweet endpoint. Live success still depends on valid user credentials/scopes.'
        : 'Unexpected auth mode for write request.',
  };
}

export function buildThreadPlan(input: ThreadInput) {
  if (!Array.isArray(input.posts) || input.posts.length === 0) {
    throw new XPluginError('VALIDATION_ERROR', 'Thread must contain at least one post.');
  }

  return input.posts.map((post, index) => ({
    step: index + 1,
    draft: buildPostDraft(post),
  }));
}
