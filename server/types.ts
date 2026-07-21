// Shared types for the design-diff backend and API contract.

export type ReferenceType = 'url' | 'image' | 'figma';

// --- Feature 1: capture robustness options ---------------------------------

export type WaitUntilOption = 'load' | 'domcontentloaded' | 'networkidle';

export interface CaptureCookie {
  name: string;
  value: string;
  // Optional: when omitted, the server derives it from that side's own URL
  // (reference cookies from referenceUrl's host, target cookies from
  // targetUrl's host) so a per-side cookie never leaks its domain guess
  // onto the other side.
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

/** @deprecated legacy alias — the pre-split single "advanced" block had this exact shape. */
export type AdvancedCaptureOptions = CaptureOptions;

export interface CompareRequest {
  referenceType: ReferenceType;
  referenceUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  /** Applied only when referenceType === 'url'. Falls back to `advanced` when absent (back-compat). */
  referenceCapture?: CaptureOptions;
  /** Always applied to the target capture. Falls back to `advanced` when absent (back-compat). */
  targetCapture?: CaptureOptions;
  /** @deprecated legacy single-block capture options applied to BOTH sides when the per-side fields above are absent. */
  advanced?: AdvancedCaptureOptions;
  figmaUrl?: string;
}

export interface HotRegion {
  // Feature 2: hot regions are now connected-component bounding boxes over
  // the pixelmatch diff mask, not grid cells — col/row/fraction are no
  // longer produced (kept optional only for backward-compat of old payloads).
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
  // --- Engine Phase-1 (additive, optional — old clients ignore these) ------
  jobId?: string;
  manifestHash?: string;
}

// ============================================================================
// Engine Phase-1: Job registry, SSE telemetry, state parity, provenance.
// Canonical definitions per docs/ROADMAP-v2.md — mirrored in web/src/types.ts
// by the frontend agent. Keep this block in exact sync with the roadmap.
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

export interface StateAssertion {
  selector: string;
  expect: AssertState;
  value?: string | number;
  label?: string;
}

export interface StateManifest {
  route?: { path?: string; hash?: string };
  viewport?: { width: number; height?: number };
  scroll?: 'top' | 'bottom' | number | { selector: string };
  expectOpen?: string[];
  expectClosed?: string[];
  assertions?: StateAssertion[];
  enumerateOverlays?: boolean; // default true
}

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

export interface RawElementInfo {
  tag: string;
  role: string;
  text: string;
  nthOfType: number;
  cssPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  padding: string;
  margin: string;
  borderRadius: string;
  textAlign: string;
}

export interface DesignSnapshot {
  palette: PaletteEntry[];
  typography: TypographyEntry[];
  spacing: SpacingEntry[];
  layout: LayoutLandmark[];
  elements: RawElementInfo[];
}
