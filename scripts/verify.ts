// Deterministic pass/fail gate for design-diff comparisons.
//
// This is the CLI a pre-commit hook, a CI job, or the MCP `verify` tool
// (server/mcp.ts) calls under the hood. It REUSES the existing compare
// engine end-to-end (server/jobs.ts) — no capture/diff logic is
// reimplemented here, and no LLM API of any kind is called: this is a
// purely local, deterministic gate.
//
// Usage:
//   npm run verify -- --ref <url> --target <url> [--breakpoints 1440,1024,768,390] [--threshold 90] [--full-page]
//   npm run verify -- --image <path> --target <url> ...
//   npm run verify -- --figma <url> --target <url> ...
//
// Exit codes: 0 pass, 1 fail (below threshold / a breakpoint errored), 2 hard error (bad args, couldn't run).

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createJob, runJob, setReferenceImageBuffer } from '../server/jobs.js';
import type { RunJobParams } from '../server/jobs.js';
import { fetchFigmaReferenceImage, FigmaConfigError, FigmaApiError } from '../server/figma.js';
import { isBreakpointError } from '../server/types.js';
import type { BreakpointResult, CompareResponse, ReferenceType } from '../server/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT_DIR, 'runs');

const DEFAULT_BREAKPOINTS = [1440, 1024, 768, 390];
const DEFAULT_THRESHOLD = 90;

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_HARD_ERROR = 2;

// --- tiny argv parser — no dependency needed, just process.argv ----------

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function hardError(message: string): never {
  console.error(`verify: ${message}`);
  process.exit(EXIT_HARD_ERROR);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^file:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function makeRunId(targetUrl: string): string {
  return `verify-${slugify(targetUrl)}-${Date.now()}`;
}

function isFailingBreakpoint(bp: CompareResponse['breakpoints'][number], threshold: number): boolean {
  return isBreakpointError(bp) || bp.score * 100 < threshold;
}

function printReport(response: CompareResponse, threshold: number): void {
  console.log('');
  console.log(`runId: ${response.runId}`);
  for (const bp of response.breakpoints) {
    if (isBreakpointError(bp)) {
      console.log(`  ${bp.breakpoint} · ERROR ✗  (${bp.error})`);
      continue;
    }
    const pct = bp.score * 100;
    const mark = pct >= threshold ? '✓' : '✗'; // check / cross
    console.log(`  ${bp.breakpoint} · ${Math.round(pct)}% ${mark}`);
  }
  console.log('');
  const avgPct = Math.round(response.summary.avgScore * 100);
  const worst = response.summary.worstBreakpoint;
  console.log(`avg: ${avgPct}%   worst: ${worst !== null ? `${worst}px` : 'n/a'}   threshold: ${threshold}%`);

  const failingBps = response.breakpoints.filter(
    (bp): bp is BreakpointResult => !isBreakpointError(bp) && bp.score * 100 < threshold,
  );
  if (failingBps.length > 0) {
    console.log('');
    console.log('top element diffs (failing breakpoints):');
    for (const bp of failingBps) {
      const top = bp.elementDiffs.slice(0, 5);
      if (top.length === 0) continue;
      console.log(`  @${bp.breakpoint}px:`);
      for (const d of top) {
        const deltas = d.styleDeltas
          .slice(0, 3)
          .map((sd) => `${sd.prop}: ${sd.reference} -> ${sd.target}`)
          .join('; ');
        console.log(`    [${d.status}] ${d.label}${deltas ? ` — ${deltas}` : ''}`);
      }
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const refUrl = typeof args.ref === 'string' ? args.ref : undefined;
  const imagePath = typeof args.image === 'string' ? args.image : undefined;
  const figmaUrl = typeof args.figma === 'string' ? args.figma : undefined;
  const targetUrl = typeof args.target === 'string' ? args.target : undefined;

  const refSources = [refUrl, imagePath, figmaUrl].filter((v) => v !== undefined);
  if (refSources.length !== 1) {
    hardError('exactly one of --ref <url>, --image <path>, --figma <url> is required');
  }
  if (!targetUrl) {
    hardError('--target <url> is required');
  }

  let breakpoints = DEFAULT_BREAKPOINTS;
  if (typeof args.breakpoints === 'string') {
    breakpoints = args.breakpoints
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (breakpoints.length === 0) {
      hardError('--breakpoints must be a comma-separated list of positive numbers, e.g. 1440,1024,768,390');
    }
  }

  let threshold = DEFAULT_THRESHOLD;
  if (typeof args.threshold === 'string') {
    threshold = Number(args.threshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
      hardError('--threshold must be a number between 0 and 100');
    }
  }

  const fullPage = args['full-page'] === true;
  const referenceType: ReferenceType = refUrl ? 'url' : figmaUrl ? 'figma' : 'image';

  let referenceImageBuffer: Buffer | undefined;
  if (referenceType === 'image') {
    const resolvedPath = path.resolve(process.cwd(), imagePath as string);
    try {
      referenceImageBuffer = await fs.readFile(resolvedPath);
    } catch (err) {
      hardError(`could not read --image "${resolvedPath}": ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (referenceType === 'figma') {
    try {
      referenceImageBuffer = await fetchFigmaReferenceImage(figmaUrl as string);
    } catch (err) {
      if (err instanceof FigmaConfigError || err instanceof FigmaApiError) {
        hardError(err.message);
      }
      hardError(`Figma fetch failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const runId = makeRunId(targetUrl as string);
  const runDir = path.join(RUNS_DIR, runId);
  try {
    await fs.mkdir(runDir, { recursive: true });
  } catch (err) {
    hardError(`could not create run directory "${runDir}": ${err instanceof Error ? err.message : String(err)}`);
  }

  const job = createJob(runId, breakpoints);
  if (referenceImageBuffer) {
    setReferenceImageBuffer(job.jobId, referenceImageBuffer);
  }

  const runParams: RunJobParams = {
    referenceType,
    referenceUrl: referenceType === 'url' ? refUrl : referenceType === 'figma' ? figmaUrl : undefined,
    targetUrl: targetUrl as string,
    breakpoints,
    fullPage,
    runDir,
    runId,
    parityGate: 'flag',
  };

  console.log(`verify: running ${referenceType} vs ${targetUrl as string} @ [${breakpoints.join(', ')}]px (threshold ${threshold}%)`);

  await runJob(job, runParams);

  if (job.status !== 'done' || !job.response) {
    hardError(job.error ?? `job ended with status "${job.status}"`);
  }

  const response: CompareResponse = job.response;
  printReport(response, threshold);

  const failing = response.breakpoints.some((bp) => isFailingBreakpoint(bp, threshold));
  process.exit(failing ? EXIT_FAIL : EXIT_PASS);
}

main().catch((err) => {
  hardError(err instanceof Error ? (err.stack ?? err.message) : String(err));
});
