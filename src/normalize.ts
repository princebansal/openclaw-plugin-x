type AnyRecord = Record<string, unknown>;

type NormalizedUser = {
  id?: string | undefined;
  name?: string | undefined;
  username?: string | undefined;
};

type NormalizedMetrics = {
  retweetCount?: number | undefined;
  replyCount?: number | undefined;
  likeCount?: number | undefined;
  quoteCount?: number | undefined;
  bookmarkCount?: number | undefined;
  impressionCount?: number | undefined;
};

type NormalizedPost = {
  id?: string | undefined;
  text?: string | undefined;
  createdAt?: string | undefined;
  conversationId?: string | undefined;
  authorId?: string | undefined;
  author?: NormalizedUser | undefined;
  metrics: NormalizedMetrics;
  referenced: { type?: string | undefined; id?: string | undefined; post?: NormalizedPost | undefined }[];
  editHistoryTweetIds: string[];
  url?: string | undefined;
};

export function normalizeUser(user?: AnyRecord): NormalizedUser | undefined {
  if (!user) return undefined;
  const id = asString(user.id);
  const name = asString(user.name);
  const username = asString(user.username);
  return {
    ...(id ? { id } : {}),
    ...(name ? { name } : {}),
    ...(username ? { username } : {}),
  };
}

export function normalizePost(post?: AnyRecord, includes?: { usersById?: Map<string, AnyRecord>; tweetsById?: Map<string, AnyRecord> }): NormalizedPost | undefined {
  if (!post) return undefined;

  const authorId = asString(post.author_id);
  const referenced: { type?: string | undefined; id?: string | undefined; post?: NormalizedPost | undefined }[] = Array.isArray(post.referenced_tweets)
    ? post.referenced_tweets.map((item) => {
        const ref = item as AnyRecord;
        const refId = asString(ref.id);
        const type = asString(ref.type);
        return {
          ...(type ? { type } : {}),
          ...(refId ? { id: refId } : {}),
          ...(refId && includes?.tweetsById?.has(refId)
            ? { post: normalizePost(includes.tweetsById.get(refId), includes) }
            : {}),
        };
      })
    : [];

  const id = asString(post.id);
  const text = asString(post.text);
  const createdAt = asString(post.created_at);
  const conversationId = asString(post.conversation_id);
  const author = authorId && includes?.usersById?.has(authorId)
    ? normalizeUser(includes.usersById.get(authorId))
    : undefined;
  const url = author && author.username && id ? buildPostUrl(author.username, id) : undefined;

  return {
    ...(id ? { id } : {}),
    ...(text ? { text } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(author ? { author } : {}),
    metrics: normalizeMetrics(post.public_metrics as AnyRecord | undefined),
    referenced,
    editHistoryTweetIds: Array.isArray(post.edit_history_tweet_ids)
      ? post.edit_history_tweet_ids.map((value) => String(value))
      : [],
    ...(url ? { url } : {}),
  };
}

export function normalizeTimelineResponse(response: { data?: AnyRecord[]; includes?: AnyRecord; meta?: AnyRecord }) {
  const usersById = indexById(Array.isArray(response.includes?.users) ? response.includes.users as AnyRecord[] : []);
  const tweetsById = indexById(Array.isArray(response.includes?.tweets) ? response.includes.tweets as AnyRecord[] : []);
  const includes = { usersById, tweetsById };

  const posts = Array.isArray(response.data)
    ? response.data.map((post) => normalizePost(post, includes)).filter(Boolean)
    : [];

  return {
    posts,
    latest: posts[0],
    meta: response.meta ?? {},
    includes: {
      users: Array.from(usersById.values()).map((user) => normalizeUser(user)),
      posts: Array.from(tweetsById.values()).map((post) => normalizePost(post, includes)),
    },
  };
}

function indexById(items: AnyRecord[]) {
  const map = new Map<string, AnyRecord>();
  for (const item of items) {
    const id = asString(item.id);
    if (id) map.set(id, item);
  }
  return map;
}

function normalizeMetrics(metrics?: AnyRecord): NormalizedMetrics {
  if (!metrics) return {};
  const retweetCount = asNumber(metrics.retweet_count);
  const replyCount = asNumber(metrics.reply_count);
  const likeCount = asNumber(metrics.like_count);
  const quoteCount = asNumber(metrics.quote_count);
  const bookmarkCount = asNumber(metrics.bookmark_count);
  const impressionCount = asNumber(metrics.impression_count);
  return {
    ...(retweetCount !== undefined ? { retweetCount } : {}),
    ...(replyCount !== undefined ? { replyCount } : {}),
    ...(likeCount !== undefined ? { likeCount } : {}),
    ...(quoteCount !== undefined ? { quoteCount } : {}),
    ...(bookmarkCount !== undefined ? { bookmarkCount } : {}),
    ...(impressionCount !== undefined ? { impressionCount } : {}),
  };
}

function buildPostUrl(username?: string, id?: string) {
  if (!username || !id) return undefined;
  return `https://x.com/${username}/status/${id}`;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : value == null ? undefined : String(value);
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : undefined;
}
