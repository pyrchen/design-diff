// Duplicated from server/types.ts — kept in sync manually; the web and
// server projects use different TS module resolution settings so a direct
// cross-root import would need extra config for little benefit here.

export type ReferenceType = 'url' | 'image' | 'figma';

// --- Feature 1: capture robustness options ---------------------------------

export type WaitUntilOption = 'load' | 'domcontentloaded' | 'networkidle';

export interface CaptureCookie {
  name: string;
  value: string;
  // Optional: when omitted, the server derives it from that side's own URL.
  domain?: string;
  path?: string;
}

export interface CaptureAuth {
  cookies?: CaptureCookie[];
  headers?: Record<string, string>;
  httpCredentials?: { username: string; password: string };
}

/** Per-side capture + auth options (Job 1: split from the old single "advanced" block). */
export interface CaptureOptions {
  hideSelectors?: string[];
  dismissSelectors?: string[];
  waitUntil?: WaitUntilOption;
  waitMs?: number;
  waitForSelector?: string;
  freezeAnimations?: boolean;
  auth?: CaptureAuth;
  clipSelector?: string;
}

/** @deprecated legacy alias — kept only so old code/data referring to it still compiles. */
export type AdvancedCaptureOptions = CaptureOptions;

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
  // --- Engine Phase-1 (additive, optional — old clients ignore these) ------
  parity?: ParityReport;
  provenance?: DiffProvenance;
  untrusted?: boolean;
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

// ============================================================================
// Engine Phase-1: Job registry, SSE telemetry, state parity, provenance.
// Mirrored from server/types.ts (kept in sync manually, same convention as
// the rest of this file) — only the subset the web client actually consumes:
// the streaming client (lib/jobStream.ts) needs the JobEvent union, and
// BreakpointResult.parity above needs ParityReport/DiffProvenance. Request-
// only shapes (StateManifest, StateAssertion, CompareRequest) are omitted —
// this milestone doesn't build/send a state manifest from the web client.
// ============================================================================

export type Phase =
  | 'launch'
  | 'navigate'
  | 'settle'
  | 'apply-state'
  | 'parity'
  | 'scroll'
  | 'screenshot'
  | 'normalize'
  | 'diff'
  | 'styles'
  | 'prompt';

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export type Side = 'reference' | 'target' | 'both';

export interface Job {
  jobId: string;
  runId: string;
  status: JobStatus;
  pct: number; // 0..100 overall
  currentAction: string; // e.g. "target · screenshot · 768px"
  breakpoints: number[];
  cancelRequested: boolean;
  createdAt: number;
  updatedAt: number;
  error?: string;
  response?: CompareResponse; // terminal payload
}

export interface StepEvent {
  type: 'step';
  jobId: string;
  breakpoint: number | null;
  side: Side;
  phase: Phase;
  status: 'start' | 'ok' | 'warn' | 'error';
  label: string;
  pct: number;
  at: number;
  durationMs?: number;
  detail?: string;
}

export interface StallEvent {
  type: 'stall';
  jobId: string;
  breakpoint: number | null;
  side: Side;
  phase: Phase;
  sinceMs: number;
  softTimeoutMs: number;
}

export interface ParityEvent {
  type: 'parity';
  jobId: string;
  breakpoint: number;
  report: ParityReport;
}

export interface BreakpointEvent {
  type: 'breakpoint';
  jobId: string;
  result: BreakpointResult;
} // incremental, render as it lands

export interface JobStateEvent {
  type: 'job';
  jobId: string;
  status: JobStatus;
  pct: number;
  currentAction: string;
  error?: string;
}

export interface ResultEvent {
  type: 'result';
  jobId: string;
  response: CompareResponse;
} // terminal

export type JobEvent = StepEvent | StallEvent | ParityEvent | BreakpointEvent | JobStateEvent | ResultEvent;

// --- State parity (auto-overlay enumeration + optional assertions) --------

export type AssertState = 'visible' | 'hidden' | 'attached' | 'detached' | 'expanded' | 'collapsed' | 'focused' | 'count' | 'text';

export interface OverlayObservation {
  selector: string;
  role: string;
  ariaModal: boolean;
  topLayer: boolean;
  box: ElementBox;
  zIndex: number;
}

export interface StateProbe {
  url: string;
  scrollY: number;
  activeElement: string;
  assertions: { selector: string; expect: AssertState; actual: string | number | boolean; ok: boolean }[];
  overlays: OverlayObservation[];
}

export type ParityStatus = 'match' | 'mismatch' | 'unchecked';

export interface ParityDivergence {
  kind: 'assertion' | 'overlay' | 'route' | 'scroll';
  label: string;
  reference: string | number | boolean;
  target: string | number | boolean;
  box?: ElementBox;
}

export interface ParityReport {
  status: ParityStatus;
  manifestHash: string;
  divergences: ParityDivergence[];
  refProbe: StateProbe;
  targetProbe: StateProbe;
}

// --- Provenance — "by what means" the diff was produced (trust surface) ---

export type AlignmentMethod = 'crop-min' | 'anchor-band' | 'region-clip' | 'image-fit';

export interface DiffProvenance {
  diffMethod: 'pixelmatch';
  pixelThreshold: number;
  includeAA: boolean;
  alignment: AlignmentMethod;
  elementMatch: string; // 'text|text-sim|structural'
  stateManifestHash: string | null;
  refHeight: number;
  targetHeight: number;
  capturedAt: number;
}

// ============================================================================
// Figma import (Feature 4) — mirrored from server/figmaImport.ts (kept in
// sync manually, same "duplicated from server" convention as the rest of
// this file). The web client only ever reads these (POST /api/figma/import
// response) — it never builds a block tree itself.
// ============================================================================

export type FigmaBlockKind = 'frame' | 'text' | 'image' | 'shape';

export interface FigmaBlockLayout {
  childrenMode: 'flex' | 'absolute';
  direction?: 'row' | 'column';
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
}

export interface FigmaBlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaBlock {
  id: string;
  name: string;
  kind: FigmaBlockKind;
  styles: Record<string, string>;
  layout: FigmaBlockLayout;
  position: FigmaBlockPosition;
  text?: string;
  imageFill?: boolean;
  children: FigmaBlock[];
}

/** Flat, doc-order entry for one block — enough to build a surgical per-block prompt client-side without re-walking the tree (see lib/figmaBlockPrompt.ts). */
export interface FigmaBlockSummary {
  id: string;
  selector: string;
  description: string;
  styleSet: Record<string, string>;
  text?: string;
}

export interface FigmaImportResult {
  previewUrl: string;
  blockTree: FigmaBlock;
  html: string;
  steps: string;
  blocks: FigmaBlockSummary[];
}
