import fs from 'node:fs';
import path from 'node:path';

import type { SessionState } from './types.js';

export interface SessionStore {
  get(accountId: string): Promise<SessionState | undefined>;
  set(session: SessionState): Promise<void>;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, SessionState>();

  async get(accountId: string): Promise<SessionState | undefined> {
    return this.sessions.get(accountId);
  }

  async set(session: SessionState): Promise<void> {
    this.sessions.set(session.accountId, session);
  }
}

interface SessionFileShape {
  sessions: SessionState[];
}

function ensureStore(filePath: string): SessionFileShape {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const initial: SessionFileShape = { sessions: [] };
    fs.writeFileSync(resolved, JSON.stringify(initial, null, 2));
    return initial;
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  if (!raw.trim()) return { sessions: [] };
  return JSON.parse(raw) as SessionFileShape;
}

function saveStore(filePath: string, store: SessionFileShape): void {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(store, null, 2));
}

export function getSession(filePath: string, accountId = 'default'): SessionState | undefined {
  const store = ensureStore(filePath);
  return store.sessions.find((session) => session.accountId === accountId);
}

export function setSession(filePath: string, next: SessionState): SessionState {
  const store = ensureStore(filePath);
  const index = store.sessions.findIndex((session) => session.accountId === next.accountId);
  if (index === -1) store.sessions.push(next);
  else store.sessions[index] = next;
  saveStore(filePath, store);
  return next;
}
