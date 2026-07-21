// Settings / secrets (Wave 1 tail) — "remember on this device", no accounts.
// Server-side, gitignored store. Two tiers, resolved per token need in this
// order: explicit request value -> session -> persisted -> .env (FIGMA_TOKEN
// back-compat). See docs/ROADMAP-v2.md "Settings / secrets".
//
// shortcut: plaintext local secret file (mirrors .env), upgrade to OS
// keychain if this ever becomes multi-user.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { CaptureAuth, CaptureOptions, NamedToken, Secrets, SecretsView } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SECRETS_FILE = path.join(ROOT_DIR, '.secrets.json');

export const DEFAULT_PROFILE_ID = 'local'; // seam for future accounts — always "local" for now
const SESSION_COOKIE_NAME = 'dd_sid';

// --- session tier: in-memory only, never written to disk, gone on restart --

const sessionStore = new Map<string, Secrets>();

// --- persisted tier: gitignored .secrets.json, keyed by profileId ---------

type PersistedStore = Record<string, Secrets>;

function loadPersistedStore(): PersistedStore {
  try {
    const raw = fs.readFileSync(SECRETS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as PersistedStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let persistedStore: PersistedStore = loadPersistedStore();

/** Re-reads .secrets.json from disk — exposed for tests that simulate a process restart without actually restarting. */
export function reloadPersistedStoreForTests(): void {
  persistedStore = loadPersistedStore();
}

function persistToDisk(): void {
  const tmp = `${SECRETS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(persistedStore, null, 2), 'utf8');
  fs.renameSync(tmp, SECRETS_FILE); // atomic on both POSIX and modern Windows (MoveFileEx w/ REPLACE_EXISTING)
}

function hasPersistedEntry(profileId: string): boolean {
  const entry = persistedStore[profileId];
  if (!entry) return false;
  return Boolean(entry.figmaToken) || Boolean(entry.tokens && entry.tokens.length > 0);
}

// --- session cookie ---------------------------------------------------

function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      out[key] = part.slice(idx + 1).trim();
    }
  }
  return out;
}

/** Reads the dd_sid cookie; issues a fresh HttpOnly/SameSite=Lax one (and an empty session) if absent or stale (e.g. after a restart, since sessions are memory-only). */
export function ensureSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const existing = cookies[SESSION_COOKIE_NAME];
  if (existing && sessionStore.has(existing)) {
    return existing;
  }
  const sessionId = randomUUID();
  sessionStore.set(sessionId, {});
  res.cookie(SESSION_COOKIE_NAME, sessionId, { httpOnly: true, sameSite: 'lax' });
  return sessionId;
}

// --- resolution (explicit -> session -> persisted -> .env) ----------------

export function resolveFigmaToken(sessionId: string | undefined, profileId: string = DEFAULT_PROFILE_ID, explicit?: string): string | undefined {
  if (explicit && explicit.trim()) return explicit;
  const session = sessionId ? sessionStore.get(sessionId) : undefined;
  if (session?.figmaToken) return session.figmaToken;
  const persisted = persistedStore[profileId];
  if (persisted?.figmaToken) return persisted.figmaToken;
  const envToken = process.env.FIGMA_TOKEN;
  return envToken && envToken.trim() ? envToken : undefined;
}

/** Named tokens have no .env tier — session wins over persisted on id collision. */
export function resolveNamedToken(tokenId: string, sessionId: string | undefined, profileId: string = DEFAULT_PROFILE_ID): NamedToken | undefined {
  const session = sessionId ? sessionStore.get(sessionId) : undefined;
  const fromSession = session?.tokens?.find((t) => t.id === tokenId);
  if (fromSession) return fromSession;
  const persisted = persistedStore[profileId];
  return persisted?.tokens?.find((t) => t.id === tokenId);
}

/**
 * Resolves `auth.tokenId` (if present) into concrete headers/cookies on a
 * CaptureOptions block: bearer -> `Authorization: Bearer <value>`,
 * raw -> `Authorization: <value>` (as given, no prefix), header -> a named
 * header, cookie -> a cookie. Never mutates the input.
 *
 * shortcut: an unresolvable tokenId is silently ignored (best-effort, same
 * style as dismissSelectors/hideSelectors elsewhere) rather than failing the
 * whole compare — the UI only ever sends ids it just read from
 * GET /api/settings, so a miss here means the token was deleted mid-session.
 */
export function resolveCaptureAuthTokens(
  options: CaptureOptions | undefined,
  sessionId: string | undefined,
  profileId: string = DEFAULT_PROFILE_ID,
): CaptureOptions | undefined {
  const tokenId = options?.auth?.tokenId;
  if (!tokenId) return options;

  const token = resolveNamedToken(tokenId, sessionId, profileId);
  if (!token) return options;

  const auth: CaptureAuth = { ...options?.auth };
  if (token.kind === 'bearer') {
    auth.headers = { ...auth.headers, Authorization: `Bearer ${token.value}` };
  } else if (token.kind === 'raw') {
    auth.headers = { ...auth.headers, Authorization: token.value };
  } else if (token.kind === 'header') {
    const headerName = token.headerName ?? 'X-Auth-Token';
    auth.headers = { ...auth.headers, [headerName]: token.value };
  } else if (token.kind === 'cookie') {
    const cookieName = token.headerName ?? token.label;
    auth.cookies = [...(auth.cookies ?? []), { name: cookieName, value: token.value, domain: token.domain }];
  }

  return { ...options, auth };
}

// --- write path (PUT /api/settings, DELETE /api/settings/tokens/:id) ------

function upsertTokens(existing: NamedToken[] | undefined, incoming: NamedToken[]): NamedToken[] {
  const byId = new Map((existing ?? []).map((t) => [t.id, t] as const));
  for (const t of incoming) byId.set(t.id, t);
  return Array.from(byId.values());
}

function sessionSecretsFor(sessionId: string): Secrets {
  let s = sessionStore.get(sessionId);
  if (!s) {
    s = {};
    sessionStore.set(sessionId, s);
  }
  return s;
}

function persistedSecretsFor(profileId: string): Secrets {
  let s = persistedStore[profileId];
  if (!s) {
    s = {};
    persistedStore[profileId] = s;
  }
  return s;
}

export interface SaveSecretsInput {
  sessionId: string;
  profileId?: string;
  figmaToken?: string | null;
  tokens?: NamedToken[];
  remember: boolean;
}

/** `figmaToken:null` clears it from BOTH tiers (a hard delete, not tier-scoped). `remember` selects which tier a provided value/tokens list is written into. Never logs values. */
export function saveSecrets(input: SaveSecretsInput): void {
  const { sessionId, figmaToken, tokens, remember } = input;
  const profileId = input.profileId ?? DEFAULT_PROFILE_ID;
  let touchedDisk = false;

  if (figmaToken === null) {
    const session = sessionStore.get(sessionId);
    if (session) delete session.figmaToken;
    const persisted = persistedStore[profileId];
    if (persisted && persisted.figmaToken !== undefined) {
      delete persisted.figmaToken;
      touchedDisk = true;
    }
  } else if (typeof figmaToken === 'string' && figmaToken.trim()) {
    if (remember) {
      persistedSecretsFor(profileId).figmaToken = figmaToken;
      touchedDisk = true;
      // Avoid a stale session-tier shadow: resolution checks session before
      // persisted, so without this an earlier session-only save of a
      // *different* value would keep winning for this session even after
      // the user just asked to remember the new one.
      const session = sessionStore.get(sessionId);
      if (session) delete session.figmaToken;
    } else {
      sessionSecretsFor(sessionId).figmaToken = figmaToken;
    }
  }

  if (tokens && tokens.length > 0) {
    if (remember) {
      const target = persistedSecretsFor(profileId);
      target.tokens = upsertTokens(target.tokens, tokens);
      touchedDisk = true;
      // Same shadow-avoidance as above, scoped to just the ids just persisted.
      const session = sessionStore.get(sessionId);
      if (session?.tokens) {
        const persistedIds = new Set(tokens.map((t) => t.id));
        session.tokens = session.tokens.filter((t) => !persistedIds.has(t.id));
      }
    } else {
      const target = sessionSecretsFor(sessionId);
      target.tokens = upsertTokens(target.tokens, tokens);
    }
  }

  if (touchedDisk) persistToDisk();
}

/** Removes a token by id from BOTH tiers regardless of which one holds it. */
export function deleteToken(tokenId: string, sessionId: string, profileId: string = DEFAULT_PROFILE_ID): void {
  const session = sessionStore.get(sessionId);
  if (session?.tokens) {
    session.tokens = session.tokens.filter((t) => t.id !== tokenId);
  }
  const persisted = persistedStore[profileId];
  if (persisted?.tokens) {
    const before = persisted.tokens.length;
    persisted.tokens = persisted.tokens.filter((t) => t.id !== tokenId);
    if (persisted.tokens.length !== before) persistToDisk();
  }
}

// --- read path (GET /api/settings) -----------------------------------------

function last4(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}

export function getSecretsView(sessionId: string, profileId: string = DEFAULT_PROFILE_ID): SecretsView {
  const session = sessionStore.get(sessionId) ?? {};
  const persisted = persistedStore[profileId] ?? {};

  const effectiveFigmaToken = resolveFigmaToken(sessionId, profileId);

  const tokenMap = new Map<string, NamedToken>();
  for (const t of persisted.tokens ?? []) tokenMap.set(t.id, t);
  for (const t of session.tokens ?? []) tokenMap.set(t.id, t); // session wins on id collision

  return {
    figmaToken: effectiveFigmaToken ? { set: true, last4: last4(effectiveFigmaToken) } : { set: false },
    tokens: Array.from(tokenMap.values()).map((t) => {
      const { value, ...rest } = t;
      return { ...rest, last4: last4(value) };
    }),
    remember: hasPersistedEntry(profileId),
  };
}
