import { XPluginError } from './errors.js';

const POST_URL_REGEX = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)(?:[/?#].*)?$/i;

export interface ResolvedPostRef {
  url: string;
  username: string;
  postId: string;
}

export function resolvePostUrl(url: string): ResolvedPostRef {
  const match = POST_URL_REGEX.exec(url.trim());
  if (!match) {
    throw new XPluginError('RESOLUTION_ERROR', 'Unsupported X/Twitter post URL.', {
      details: { url },
    });
  }

  return {
    url,
    username: match[1],
    postId: match[2],
  };
}
