// Recent-pairs persistence (Gap 3): a small typed localStorage helper so a
// successful compare re-populates the idle-state "Недавние пары" chips on
// the next visit. No backend run-history endpoint exists (see
// settingsApi.ts's SSE note for the general pattern of "documented gap,
// client-only workaround") — this is intentionally client-only/per-device.
import type { ReferenceType } from '../types';

const STORAGE_KEY = 'design-diff:recent-pairs:v1';
const MAX_ENTRIES = 6;

/** Enough of a compare run's params to repopulate the setup form — never auto-run from this. */
export interface RecentPairParams {
  referenceType: ReferenceType;
  referenceUrl?: string;
  figmaUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  // shortcut: an uploaded reference image can't be persisted (no File
  // object survives JSON/localStorage) — a recalled `referenceType==='image'`
  // pair restores everything except the file itself; the user re-uploads.
}

export interface RecentPair {
  id: string;
  createdAt: number;
  referenceLabel: string;
  targetLabel: string;
  params: RecentPairParams;
}

function readAll(): RecentPair[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentPair[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: RecentPair[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota/availability errors — recent pairs are a convenience, not critical state
  }
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pair_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function sameSource(a: RecentPairParams, b: RecentPairParams): boolean {
  return a.referenceType === b.referenceType && a.referenceUrl === b.referenceUrl && a.figmaUrl === b.figmaUrl && a.targetUrl === b.targetUrl;
}

/** Newest-first, capped at MAX_ENTRIES. Returns the resulting list (also the new source of truth in localStorage). */
export function loadRecentPairs(): RecentPair[] {
  return readAll();
}

/** Records a completed compare as a recent pair (de-duped by source, moved to front). Returns the updated list. */
export function saveRecentPair(entry: Omit<RecentPair, 'id' | 'createdAt'>): RecentPair[] {
  const existing = readAll();
  const withoutDup = existing.filter((p) => !sameSource(p.params, entry.params));
  const next: RecentPair = { id: makeId(), createdAt: Date.now(), ...entry };
  const merged = [next, ...withoutDup].slice(0, MAX_ENTRIES);
  writeAll(merged);
  return merged;
}
