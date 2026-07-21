// Duplicated from server/types.ts — kept in sync manually; the web and
// server projects use different TS module resolution settings so a direct
// cross-root import would need extra config for little benefit here.

export type ReferenceType = 'url' | 'image';

export interface HotRegion {
  col: number;
  row: number;
  fraction: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export type StyleDiffCategory = 'color' | 'typography' | 'spacing' | 'layout';

export interface StyleDiffEntry {
  category: StyleDiffCategory;
  label: string;
  reference: string | number;
  target: string | number;
}

export interface BreakpointResult {
  breakpoint: number;
  score: number;
  refImg: string;
  targetImg: string;
  diffImg: string;
  hotRegions: HotRegion[];
  styleDiff: StyleDiffEntry[];
  error?: undefined;
}

export interface BreakpointError {
  breakpoint: number;
  error: string;
}

export type BreakpointOutcome = BreakpointResult | BreakpointError;

export function isBreakpointError(r: BreakpointOutcome): r is BreakpointError {
  return typeof (r as BreakpointError).error === 'string';
}

export interface RunSummary {
  avgScore: number;
  worstBreakpoint: number | null;
}

export interface CompareResponse {
  runId: string;
  referenceType: ReferenceType;
  referenceUrl: string | null;
  targetUrl: string;
  breakpoints: BreakpointOutcome[];
  summary: RunSummary;
  claudePrompt: string;
}
