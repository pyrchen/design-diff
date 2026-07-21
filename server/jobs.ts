import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser } from 'playwright';
import sharp from 'sharp';

import { launchBrowser, openPageNavigate, settlePage, screenshot, settleForFullPageCapture } from './capture.js';
import type { OpenedPage } from './capture.js';
import { normalizeUrlPair, normalizeImageAgainstTarget } from './normalize.js';
import { computeDiff, PIXELMATCH_THRESHOLD, PIXELMATCH_INCLUDE_AA } from './diff.js';
import { captureDesignSnapshot, diffDesignSnapshots, diffElements } from './styles.js';
import { applyStateManifest, probeState, buildParityReport, computeManifestHash, quarantineDivergentRegions, describeDivergence } from './state.js';
import { buildClaudePrompt } from './prompt.js';
import type {
  BreakpointOutcome,
  BreakpointResult,
  CaptureOptions,
  CompareResponse,
  DesignSnapshot,
  DiffProvenance,
  ElementDiffEntry,
  HotRegion,
  Job,
  JobEvent,
  JobStatus,
  ParityReport,
  Phase,
  ReferenceType,
  Side,
  StateManifest,
  StyleDiffEntry,
} from './types.js';
import { isBreakpointError } from './types.js';

// ============================================================================
// Job registry + telemetry (Engine Phase-1). See docs/ROADMAP-v2.md.
// shortcut: jobs live in-memory only (Map), never evicted — fine for a local
// single-user tool with a short-lived process; add TTL eviction if this ever
// runs as a long-lived multi-user server.
// ============================================================================

export class CancelledError extends Error {
  constructor() {
    super('Job cancelled');
    this.name = 'CancelledError';
  }
}

interface JobRecord {
  job: Job;
  emitter: EventEmitter;
  buffer: JobEvent[];
  referenceImageBuffer?: Buffer;
}

const MAX_REPLAY_BUFFER = 5000;
const jobs = new Map<string, JobRecord>();

export function createJob(runId: string, breakpoints: number[]): Job {
  const jobId = randomUUID();
  const job: Job = {
    jobId,
    runId,
    status: 'queued',
    pct: 0,
    currentAction: 'queued',
    breakpoints,
    cancelRequested: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(jobId, { job, emitter: new EventEmitter(), buffer: [] });
  return job;
}

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId)?.job;
}

export function setReferenceImageBuffer(jobId: string, buf: Buffer): void {
  const rec = jobs.get(jobId);
  if (rec) rec.referenceImageBuffer = buf;
}

function getReferenceImageBuffer(jobId: string): Buffer | undefined {
  return jobs.get(jobId)?.referenceImageBuffer;
}

export function requestCancel(jobId: string): boolean {
  const rec = jobs.get(jobId);
  if (!rec) return false;
  rec.job.cancelRequested = true;
  return true;
}

export interface JobSubscription {
  replay: JobEvent[];
  unsubscribe: () => void;
}

/** Subscribes to live events; returns the buffered replay so a late subscriber never misses earlier events. */
export function subscribeJob(jobId: string, listener: (event: JobEvent) => void): JobSubscription | undefined {
  const rec = jobs.get(jobId);
  if (!rec) return undefined;
  rec.emitter.on('event', listener);
  return {
    replay: [...rec.buffer],
    unsubscribe: () => rec.emitter.off('event', listener),
  };
}

function emitEvent(jobId: string, event: JobEvent): void {
  const rec = jobs.get(jobId);
  if (!rec) return;

  rec.buffer.push(event);
  if (rec.buffer.length > MAX_REPLAY_BUFFER) rec.buffer.shift();

  if (event.type === 'step') {
    rec.job.pct = event.pct;
    rec.job.currentAction = event.label;
  } else if (event.type === 'job') {
    rec.job.status = event.status;
    rec.job.pct = event.pct;
    rec.job.currentAction = event.currentAction;
    if (event.error !== undefined) rec.job.error = event.error;
  }
  rec.job.updatedAt = Date.now();

  rec.emitter.emit('event', event);
}

// --- Bounded concurrency semaphore (hand-rolled, no dependency) -----------

class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// --- Progress tracker -------------------------------------------------
//
// shortcut: coarse equal-weight progress across phase() calls (breakpoints ×
// sides × phases), not truly weighted by each phase's wall-clock cost —
// good enough for a monotonically-rising progress bar with human labels;
// upgrade to measured per-phase weights if a particular phase dominates.

class ProgressTracker {
  private completed = 0;
  private readonly total: number;

  constructor(total: number) {
    this.total = Math.max(1, total);
  }

  get pct(): number {
    return Math.min(100, Math.round((this.completed / this.total) * 100));
  }

  tick(): number {
    this.completed++;
    return this.pct;
  }
}

// --- Phase watchdog wrapper ---------------------------------------------

const PHASE_TIMEOUTS: Record<Phase, { soft: number; hard: number }> = {
  launch: { soft: 5000, hard: 30000 },
  navigate: { soft: 8000, hard: 35000 },
  settle: { soft: 5000, hard: 20000 },
  'apply-state': { soft: 3000, hard: 10000 },
  parity: { soft: 5000, hard: 20000 },
  scroll: { soft: 8000, hard: 30000 },
  screenshot: { soft: 8000, hard: 30000 },
  normalize: { soft: 5000, hard: 20000 },
  diff: { soft: 5000, hard: 20000 },
  styles: { soft: 5000, hard: 20000 },
  prompt: { soft: 3000, hard: 10000 },
};

function actionLabel(bp: number | null, side: Side, name: Phase): string {
  return bp === null ? `${side} · ${name}` : `${side} · ${name} · ${bp}px`;
}

/**
 * Wraps `fn` with: a `step{start}` event, a soft-timeout `stall` event (does
 * NOT abort), a race against a hard-timeout rejection, a `step{ok|error}`
 * event, and — in the finally — a `job.cancelRequested` check that throws
 * CancelledError (overriding any success/failure), so the pipeline aborts at
 * the next phase boundary.
 */
async function phase<T>(
  job: Job,
  bp: number | null,
  side: Side,
  name: Phase,
  tracker: ProgressTracker,
  fn: () => Promise<T>,
): Promise<T> {
  const { soft: softMs, hard: hardMs } = PHASE_TIMEOUTS[name];
  const jobId = job.jobId;
  const label = actionLabel(bp, side, name);
  const startedAt = Date.now();
  const startPct = tracker.pct;
  job.pct = startPct;
  job.currentAction = label;
  emitEvent(jobId, { type: 'step', jobId, breakpoint: bp, side, phase: name, status: 'start', label, pct: startPct, at: startedAt });

  let settled = false;
  const softTimer =
    softMs > 0
      ? setTimeout(() => {
          if (!settled) {
            emitEvent(jobId, { type: 'stall', jobId, breakpoint: bp, side, phase: name, sinceMs: Date.now() - startedAt, softTimeoutMs: softMs });
          }
        }, softMs)
      : undefined;

  let hardTimer: NodeJS.Timeout | undefined;
  const hardTimeout = new Promise<never>((_, reject) => {
    hardTimer = setTimeout(() => reject(new Error(`phase "${name}" exceeded hard timeout of ${hardMs}ms`)), hardMs);
  });
  hardTimeout.catch(() => undefined); // never let the losing race side become an unhandled rejection

  try {
    const result = await Promise.race([fn(), hardTimeout]);
    settled = true;
    const endPct = tracker.tick();
    job.pct = endPct;
    emitEvent(jobId, {
      type: 'step',
      jobId,
      breakpoint: bp,
      side,
      phase: name,
      status: 'ok',
      label,
      pct: endPct,
      at: Date.now(),
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    settled = true;
    const endPct = tracker.tick();
    job.pct = endPct;
    const message = err instanceof Error ? err.message : String(err);
    emitEvent(jobId, {
      type: 'step',
      jobId,
      breakpoint: bp,
      side,
      phase: name,
      status: 'error',
      label,
      pct: endPct,
      at: Date.now(),
      durationMs: Date.now() - startedAt,
      detail: message,
    });
    throw err;
  } finally {
    if (softTimer) clearTimeout(softTimer);
    if (hardTimer) clearTimeout(hardTimer);
    if (job.cancelRequested) {
      throw new CancelledError();
    }
  }
}

// --- Job pipeline ---------------------------------------------------------

export interface RunJobParams {
  referenceType: ReferenceType;
  /** Navigable URL when referenceType==='url'; the display URL when referenceType==='figma'; undefined for 'image'. */
  referenceUrl?: string;
  targetUrl: string;
  breakpoints: number[];
  fullPage: boolean;
  referenceCaptureOptions?: CaptureOptions;
  targetCaptureOptions?: CaptureOptions;
  runDir: string;
  runId: string;
  parityGate: 'off' | 'flag' | 'block';
  stateManifest?: StateManifest;
  /** Bounded breakpoint concurrency. Default 2. */
  concurrency?: number;
}

function computeTotalSteps(params: RunJobParams): number {
  const sidesCount = params.referenceType === 'url' ? 2 : 1;
  const perSideStepsPerBp = 4 + (params.fullPage ? 1 : 0); // navigate, settle, apply-state, screenshot [+scroll]
  let total = 1; // launch
  total += params.breakpoints.length * sidesCount * perSideStepsPerBp;
  total += params.breakpoints.length * 2; // normalize + diff
  if (params.referenceType === 'url') {
    total += params.breakpoints.length; // styles
    if (params.parityGate !== 'off') total += params.breakpoints.length; // parity
  }
  total += 1; // prompt
  return total;
}

interface SideCapture {
  png: Buffer;
  snapshot: DesignSnapshot | null;
}

async function captureSide(
  job: Job,
  browser: Browser,
  tracker: ProgressTracker,
  bp: number,
  side: Side,
  url: string,
  fullPage: boolean,
  captureOptions: CaptureOptions | undefined,
  stateManifest: StateManifest | undefined,
  captureSnapshot: boolean,
): Promise<{ opened: OpenedPage; capture: SideCapture }> {
  const viewport = { width: bp, height: 900 };
  const clipSelector = captureOptions?.clipSelector;

  const opened = await phase(job, bp, side, 'navigate', tracker, () => openPageNavigate(browser, url, viewport, captureOptions));
  await phase(job, bp, side, 'settle', tracker, () => settlePage(opened.page, captureOptions));
  await phase(job, bp, side, 'apply-state', tracker, () => applyStateManifest(opened.page, stateManifest));

  if (fullPage && !clipSelector) {
    await phase(job, bp, side, 'scroll', tracker, () => settleForFullPageCapture(opened.page));
  }

  const capture = await phase(job, bp, side, 'screenshot', tracker, async () => {
    const png = await screenshot(opened.page, fullPage, clipSelector, { skipSettle: true });
    const snapshot = captureSnapshot ? await captureDesignSnapshot(opened.page) : null;
    return { png, snapshot };
  });

  return { opened, capture };
}

async function imageHeight(buf: Buffer): Promise<number> {
  const meta = await sharp(buf).metadata();
  return meta.height ?? 0;
}

async function runBreakpoint(job: Job, browser: Browser, tracker: ProgressTracker, params: RunJobParams, bp: number): Promise<BreakpointOutcome> {
  const { referenceType, referenceUrl, targetUrl, fullPage, referenceCaptureOptions, targetCaptureOptions, runDir, runId, parityGate, stateManifest } =
    params;

  try {
    let targetPng: Buffer;
    let refPng: Buffer;
    let styleDiff: StyleDiffEntry[] = [];
    let elementDiffs: ElementDiffEntry[] = [];
    let parity: ParityReport | undefined;
    let untrusted = false;

    if (referenceType === 'url') {
      // Both sides captured concurrently (own isolated context each — see
      // capture.ts openPageNavigate), same as the pre-Phase-1 pipeline.
      const [targetSide, refSide] = await Promise.all([
        captureSide(job, browser, tracker, bp, 'target', targetUrl, fullPage, targetCaptureOptions, stateManifest, true),
        captureSide(job, browser, tracker, bp, 'reference', referenceUrl as string, fullPage, referenceCaptureOptions, stateManifest, true),
      ]);

      try {
        if (parityGate !== 'off') {
          parity = await phase(job, bp, 'both', 'parity', tracker, async () => {
            const [refProbe, targetProbe] = await Promise.all([
              probeState(refSide.opened.page, stateManifest),
              probeState(targetSide.opened.page, stateManifest),
            ]);
            return buildParityReport(refProbe, targetProbe, stateManifest);
          });
          emitEvent(job.jobId, { type: 'parity', jobId: job.jobId, breakpoint: bp, report: parity });
        }
      } finally {
        await Promise.all([targetSide.opened.close(), refSide.opened.close()]);
      }

      if (parityGate === 'block' && parity && parity.status === 'mismatch') {
        const divergenceSummary = parity.divergences.map(describeDivergence).join('; ');
        return { breakpoint: bp, error: `State parity mismatch (parityGate=block): ${divergenceSummary}` };
      }

      targetPng = targetSide.capture.png;
      refPng = refSide.capture.png;
      const targetSnapshot = targetSide.capture.snapshot;
      const refSnapshot = refSide.capture.snapshot;
      if (targetSnapshot && refSnapshot) {
        const diffed = await phase(job, bp, 'both', 'styles', tracker, async () => ({
          styleDiff: diffDesignSnapshots(refSnapshot, targetSnapshot),
          elementDiffs: diffElements(refSnapshot, targetSnapshot),
        }));
        styleDiff = diffed.styleDiff;
        elementDiffs = diffed.elementDiffs;
      }
    } else {
      const targetSide = await captureSide(job, browser, tracker, bp, 'target', targetUrl, fullPage, targetCaptureOptions, stateManifest, false);
      targetPng = targetSide.capture.png;
      await targetSide.opened.close();
      // shortcut: same reference image (uploaded or Figma-rendered) reused for every breakpoint
      refPng = await sharp(getReferenceImageBuffer(job.jobId) as Buffer)
        .png()
        .toBuffer();
    }

    const targetFile = `${bp}-target.png`;
    const refFile = `${bp}-ref.png`;
    const diffFile = `${bp}-diff.png`;

    await fs.writeFile(path.join(runDir, targetFile), targetPng);
    await fs.writeFile(path.join(runDir, refFile), refPng);

    const [refOriginalHeight, targetOriginalHeight] = await Promise.all([imageHeight(refPng), imageHeight(targetPng)]);

    const normalized = await phase(job, bp, 'both', 'normalize', tracker, () =>
      referenceType === 'url' ? normalizeUrlPair(refPng, targetPng) : normalizeImageAgainstTarget(refPng, targetPng),
    );

    const diffResult = await phase(job, bp, 'both', 'diff', tracker, () => computeDiff(normalized.ref, normalized.target));
    await fs.writeFile(path.join(runDir, diffFile), diffResult.diffPng);

    let hotRegions: HotRegion[] = diffResult.hotRegions;

    if (parityGate === 'flag' && parity && parity.status === 'mismatch') {
      const quarantined = quarantineDivergentRegions(hotRegions, elementDiffs, parity.divergences, diffResult.width, diffResult.height);
      hotRegions = quarantined.hotRegions;
      elementDiffs = quarantined.elementDiffs;
      untrusted = true;
    }

    const provenance: DiffProvenance = {
      diffMethod: 'pixelmatch',
      pixelThreshold: PIXELMATCH_THRESHOLD,
      includeAA: PIXELMATCH_INCLUDE_AA,
      alignment: referenceType === 'url' ? 'crop-min' : 'image-fit',
      elementMatch: referenceType === 'url' ? 'text|text-sim|structural' : 'n/a',
      stateManifestHash: parity ? parity.manifestHash : null,
      refHeight: refOriginalHeight,
      targetHeight: targetOriginalHeight,
      capturedAt: Date.now(),
    };

    const result: BreakpointResult = {
      breakpoint: bp,
      score: diffResult.score,
      refImg: `/runs/${runId}/${refFile}`,
      targetImg: `/runs/${runId}/${targetFile}`,
      diffImg: `/runs/${runId}/${diffFile}`,
      hotRegions,
      styleDiff,
      elementDiffs,
      ...(parity ? { parity } : {}),
      provenance,
      ...(untrusted ? { untrusted: true } : {}),
    };
    return result;
  } catch (err) {
    if (err instanceof CancelledError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { breakpoint: bp, error: message };
  }
}

/**
 * Runs a full compare job to completion: owns one Browser for the whole job,
 * runs breakpoints with bounded concurrency, emits incremental `breakpoint`
 * events as each lands, and emits a terminal `result` + `job` event. Never
 * throws — all failure modes (including cancellation) resolve into a
 * terminal job status/event. Safe to call detached (not awaited) or awaited.
 */
export async function runJob(job: Job, params: RunJobParams): Promise<void> {
  const jobId = job.jobId;
  job.status = 'running';
  emitEvent(jobId, { type: 'job', jobId, status: 'running', pct: 0, currentAction: 'launching browser' });

  const tracker = new ProgressTracker(computeTotalSteps(params));
  const outcomes: (BreakpointOutcome | undefined)[] = new Array(params.breakpoints.length).fill(undefined);
  let browser: Browser | undefined;

  try {
    browser = await phase(job, null, 'both', 'launch', tracker, () => launchBrowser());

    const semaphore = new Semaphore(params.concurrency ?? 2);
    const activeBrowser = browser;
    const tasks = params.breakpoints.map((bp, index) =>
      semaphore.run(async () => {
        const outcome = await runBreakpoint(job, activeBrowser, tracker, params, bp);
        outcomes[index] = outcome;
        if (!isBreakpointError(outcome)) {
          emitEvent(jobId, { type: 'breakpoint', jobId, result: outcome });
        }
      }),
    );

    const settledTasks = await Promise.allSettled(tasks);
    if (job.cancelRequested || settledTasks.some((s) => s.status === 'rejected' && s.reason instanceof CancelledError)) {
      throw new CancelledError();
    }
    const otherFailure = settledTasks.find((s): s is PromiseRejectedResult => s.status === 'rejected');
    if (otherFailure) throw otherFailure.reason;

    const finalOutcomes = outcomes as BreakpointOutcome[];
    const scored = finalOutcomes.filter((o): o is BreakpointResult => !isBreakpointError(o));
    const avgScore = scored.length > 0 ? scored.reduce((sum, o) => sum + o.score, 0) / scored.length : 0;
    const worst = scored.length > 0 ? scored.reduce((min, o) => (o.score < min.score ? o : min)) : null;

    const responseWithoutPrompt: Omit<CompareResponse, 'claudePrompt'> = {
      runId: params.runId,
      referenceType: params.referenceType,
      referenceUrl: params.referenceType === 'image' ? null : (params.referenceUrl ?? null),
      targetUrl: params.targetUrl,
      breakpoints: finalOutcomes,
      summary: { avgScore, worstBreakpoint: worst ? worst.breakpoint : null },
      jobId,
      manifestHash: computeManifestHash(params.stateManifest),
    };

    const claudePrompt = await phase(job, null, 'both', 'prompt', tracker, async () => buildClaudePrompt(responseWithoutPrompt));
    const response: CompareResponse = { ...responseWithoutPrompt, claudePrompt };

    job.response = response;
    const doneStatus: JobStatus = 'done';
    emitEvent(jobId, { type: 'result', jobId, response });
    emitEvent(jobId, { type: 'job', jobId, status: doneStatus, pct: 100, currentAction: 'done' });
  } catch (err) {
    if (err instanceof CancelledError) {
      emitEvent(jobId, { type: 'job', jobId, status: 'cancelled', pct: job.pct, currentAction: 'cancelled' });
    } else {
      const message = err instanceof Error ? err.message : String(err);
      emitEvent(jobId, { type: 'job', jobId, status: 'error', pct: job.pct, currentAction: 'error', error: message });
    }
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
