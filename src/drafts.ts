import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import type { DraftRecord, PostDraft } from './types.js';
import { XPluginError } from './errors.js';

interface DraftStoreShape {
  drafts: DraftRecord[];
}

function ensureStore(filePath: string): DraftStoreShape {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const initial: DraftStoreShape = { drafts: [] };
    fs.writeFileSync(resolved, JSON.stringify(initial, null, 2));
    return initial;
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  if (!raw.trim()) {
    return { drafts: [] };
  }

  return JSON.parse(raw) as DraftStoreShape;
}

function saveStore(filePath: string, store: DraftStoreShape): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(store, null, 2));
}

export function createDraftRecord(input: {
  filePath: string;
  intent: DraftRecord['intent'];
  draft?: PostDraft;
  thread?: PostDraft[];
  metadata?: Record<string, unknown>;
}): DraftRecord {
  const now = new Date().toISOString();
  const store = ensureStore(input.filePath);
  const record: DraftRecord = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    intent: input.intent,
    ...(input.draft ? { draft: input.draft } : {}),
    ...(input.thread ? { thread: input.thread } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };

  store.drafts.unshift(record);
  saveStore(input.filePath, store);
  return record;
}

export function getDraftRecord(filePath: string, draftId: string): DraftRecord {
  const store = ensureStore(filePath);
  const record = store.drafts.find((draft) => draft.id === draftId);
  if (!record) {
    throw new XPluginError('VALIDATION_ERROR', 'Draft not found.', {
      details: { draftId },
    });
  }

  return record;
}

export function approveDraftRecord(
  filePath: string,
  draftId: string,
  approval?: { approvedBy?: string; note?: string },
): DraftRecord {
  const store = ensureStore(filePath);
  const index = store.drafts.findIndex((draft) => draft.id === draftId);
  if (index === -1) {
    throw new XPluginError('VALIDATION_ERROR', 'Draft not found.', {
      details: { draftId },
    });
  }

  const record = store.drafts[index];
  const approvedAt = new Date().toISOString();
  const updated: DraftRecord = {
    ...record,
    status: 'approved',
    updatedAt: approvedAt,
    approval: {
      approvedAt,
      ...(approval?.approvedBy ? { approvedBy: approval.approvedBy } : {}),
      ...(approval?.note ? { note: approval.note } : {}),
    },
  };

  store.drafts[index] = updated;
  saveStore(filePath, store);
  return updated;
}

export function publishDraftRecord(filePath: string, draftId: string, published: { postId: string; url: string; publishedAt?: string }): DraftRecord {
  const store = ensureStore(filePath);
  const index = store.drafts.findIndex((draft) => draft.id === draftId);
  if (index === -1) {
    throw new XPluginError('VALIDATION_ERROR', 'Draft not found.', {
      details: { draftId },
    });
  }

  const record = store.drafts[index];
  const updated: DraftRecord = {
    ...record,
    status: 'published',
    updatedAt: published.publishedAt ?? new Date().toISOString(),
    published: {
      postId: published.postId,
      url: published.url,
      publishedAt: published.publishedAt ?? new Date().toISOString(),
    },
  };

  store.drafts[index] = updated;
  saveStore(filePath, store);
  return updated;
}

export function listDrafts(filePath: string): DraftRecord[] {
  return ensureStore(filePath).drafts;
}
