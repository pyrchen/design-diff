// Shared types for the design-diff backend and API contract.

export type ReferenceType = 'url' | 'image';

export interface CompareRequest {
  referenceType: ReferenceType;
  referenceUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
}

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

// --- Design snapshot types (for url<->url style diffing) ---

export interface PaletteEntry {
  value: string;
  count: number;
  kind: 'color' | 'background-color';
}

export interface TypographyEntry {
  tag: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
}

export interface SpacingEntry {
  value: string;
  kind: 'margin' | 'padding';
  count: number;
}

export interface LayoutLandmark {
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DesignSnapshot {
  palette: PaletteEntry[];
  typography: TypographyEntry[];
  spacing: SpacingEntry[];
  layout: LayoutLandmark[];
}
