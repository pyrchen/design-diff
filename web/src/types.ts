// Duplicated from server/types.ts — kept in sync manually; the web and
// server projects use different TS module resolution settings so a direct
// cross-root import would need extra config for little benefit here.

export type ReferenceType = 'url' | 'image' | 'figma';

// --- Feature 1: capture robustness options ---------------------------------

export type WaitUntilOption = 'load' | 'domcontentloaded' | 'networkidle';

export interface CaptureCookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
}

export interface CaptureAuth {
  cookies?: CaptureCookie[];
  headers?: Record<string, string>;
  httpCredentials?: { username: string; password: string };
}

export interface AdvancedCaptureOptions {
  hideSelectors?: string[];
  dismissSelectors?: string[];
  waitUntil?: WaitUntilOption;
  waitMs?: number;
  waitForSelector?: string;
  freezeAnimations?: boolean;
  auth?: CaptureAuth;
  clipSelector?: string;
}

export interface HotRegion {
  col?: number;
  row?: number;
  fraction?: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  areaPct: number;
}

export type StyleDiffCategory = 'color' | 'typography' | 'spacing' | 'layout';

export interface StyleDiffEntry {
  category: StyleDiffCategory;
  label: string;
  reference: string | number;
  target: string | number;
}

// --- Feature 2: per-element structured diff --------------------------------

export interface ElementBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GeometryDelta {
  dx: number;
  dy: number;
  dw: number;
  dh: number;
  significant: boolean;
}

export interface ElementStyleDelta {
  prop: string;
  reference: string;
  target: string;
}

export type ElementDiffStatus = 'matched' | 'missing' | 'extra';

export interface ElementDiffEntry {
  key: string;
  label: string;
  status: ElementDiffStatus;
  geometryDelta?: GeometryDelta;
  styleDeltas: ElementStyleDelta[];
  refBox?: ElementBox;
  targetBox?: ElementBox;
}

export interface BreakpointResult {
  breakpoint: number;
  score: number;
  refImg: string;
  targetImg: string;
  diffImg: string;
  hotRegions: HotRegion[];
  styleDiff: StyleDiffEntry[];
  elementDiffs: ElementDiffEntry[];
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
