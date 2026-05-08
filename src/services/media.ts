import fs from 'node:fs';
import path from 'node:path';

import type { AccountConfig, MediaDraft, UploadedMedia } from '../types.js';
import { XPluginError } from '../errors.js';

export interface UploadMediaInput {
  path: string;
  mimeType?: string | undefined;
  altText?: string | undefined;
  dryRun?: boolean | undefined;
}

const CHUNK_SIZE = 1024 * 1024 * 5;

export function buildMediaDraft(input: UploadMediaInput): MediaDraft & { sizeBytes: number; fileName: string } {
  const resolvedPath = path.resolve(input.path);
  if (!fs.existsSync(resolvedPath)) {
    throw new XPluginError('VALIDATION_ERROR', 'Media file does not exist.', {
      details: { path: resolvedPath },
    });
  }

  const stats = fs.statSync(resolvedPath);
  if (!stats.isFile()) {
    throw new XPluginError('VALIDATION_ERROR', 'Media path must be a file.', {
      details: { path: resolvedPath },
    });
  }

  return {
    path: resolvedPath,
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.altText ? { altText: input.altText } : {}),
    sizeBytes: stats.size,
    fileName: path.basename(resolvedPath),
  };
}

export async function uploadMediaV2(params: {
  config: AccountConfig;
  credential: string;
  media: ReturnType<typeof buildMediaDraft>;
}): Promise<UploadedMedia> {
  const contentType = params.media.mimeType || inferMimeType(params.media.fileName);
  const mediaCategory = inferMediaCategory(contentType);
  const mediaBlob = await openMediaBlob(params.media.path, contentType);

  const initialized = await requestJson<{ data?: Record<string, unknown> }>({
    url: `${params.config.uploadApiBaseUrl}/2/media/upload/initialize`,
    credential: params.credential,
    method: 'POST',
    json: {
      media_type: contentType,
      media_category: mediaCategory,
      total_bytes: params.media.sizeBytes,
    },
    errorMessage: 'X media initialize failed',
  });

  const mediaId = typeof initialized.data?.id === 'string' ? initialized.data.id : undefined;
  if (!mediaId) {
    throw new XPluginError('API_ERROR', 'X media initialize succeeded but no media id was returned.', {
      details: { response: initialized },
    });
  }

  for (let offset = 0, segmentIndex = 0; offset < mediaBlob.size; offset += CHUNK_SIZE, segmentIndex += 1) {
    const chunk = mediaBlob.slice(offset, Math.min(offset + CHUNK_SIZE, mediaBlob.size), contentType);
    const form = new FormData();
    form.append('segment_index', String(segmentIndex));
    form.append('media', chunk, params.media.fileName);

    await requestJson({
      url: `${params.config.uploadApiBaseUrl}/2/media/upload/${mediaId}/append`,
      credential: params.credential,
      method: 'POST',
      body: form,
      errorMessage: `X media append failed at segment ${segmentIndex}`,
    });
  }

  const finalized = await requestJson<{ data?: Record<string, unknown> }>({
    url: `${params.config.uploadApiBaseUrl}/2/media/upload/${mediaId}/finalize`,
    credential: params.credential,
    method: 'POST',
    errorMessage: 'X media finalize failed',
  });

  await waitForProcessing(params.config, params.credential, mediaId, finalized);

  if (params.media.altText) {
    await requestJson({
      url: `${params.config.uploadApiBaseUrl}/2/media/metadata`,
      credential: params.credential,
      method: 'POST',
      json: {
        id: mediaId,
        metadata: {
          alt_text: {
            text: params.media.altText,
          },
        },
      },
      errorMessage: 'X media metadata creation failed',
    });
  }

  return {
    mediaId,
    ...(contentType ? { mimeType: contentType } : {}),
    ...(params.media.altText ? { altText: params.media.altText } : {}),
    ...(params.media.fileName ? { fileName: params.media.fileName } : {}),
    ...(typeof params.media.sizeBytes === 'number' ? { sizeBytes: params.media.sizeBytes } : {}),
    uploadMode: 'v2',
  };
}

async function openMediaBlob(filePath: string, contentType: string): Promise<Blob> {
  const openAsBlob = (fs as typeof fs & {
    openAsBlob?: (path: string, options?: { type?: string }) => Promise<Blob>;
  }).openAsBlob;

  if (!openAsBlob) {
    throw new XPluginError('VALIDATION_ERROR', 'This Node.js runtime does not support fs.openAsBlob, which is required for X media uploads.');
  }

  return openAsBlob(filePath, { type: contentType });
}

async function waitForProcessing(config: AccountConfig, credential: string, mediaId: string, finalized: { data?: Record<string, unknown> }) {
  let processing = finalized.data?.processing_info as Record<string, unknown> | undefined;

  while (processing && typeof processing.state === 'string' && processing.state !== 'succeeded') {
    if (processing.state === 'failed') {
      throw new XPluginError('API_ERROR', 'X media processing failed.', {
        details: { mediaId, processing },
      });
    }

    const checkAfterSecs = typeof processing.check_after_secs === 'number' ? processing.check_after_secs : 1;
    await delay(checkAfterSecs * 1000);

    const status = await requestJson<{ data?: Record<string, unknown> }>({
      url: `${config.uploadApiBaseUrl}/2/media/upload?media_id=${encodeURIComponent(mediaId)}`,
      credential,
      method: 'GET',
      errorMessage: 'X media status check failed',
    });

    processing = status.data?.processing_info as Record<string, unknown> | undefined;
    if (!processing) break;
  }
}

async function requestJson<T>(params: {
  url: string;
  credential: string;
  method: 'GET' | 'POST';
  json?: Record<string, unknown>;
  body?: BodyInit;
  errorMessage: string;
}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.credential}`,
  };

  let body: BodyInit | undefined = params.body;
  if (params.json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(params.json);
  }

  const response = await fetch(params.url, {
    method: params.method,
    headers,
    ...(body ? { body } : {}),
  });

  const raw = await response.text();
  const parsed = tryParseJson(raw);
  if (!response.ok) {
    throw new XPluginError('API_ERROR', `${params.errorMessage} with ${response.status}.`, {
      retryable: response.status >= 500 || response.status === 429,
      details: {
        status: response.status,
        response: parsed ?? raw,
        endpoint: params.url,
      },
    });
  }

  return (parsed ?? {}) as T;
}

function inferMediaCategory(contentType: string) {
  if (contentType === 'image/gif') return 'tweet_gif';
  if (contentType.startsWith('video/')) return 'tweet_video';
  return 'tweet_image';
}

function inferMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
