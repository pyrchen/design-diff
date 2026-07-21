// MCP (Model Context Protocol) stdio server — exposes design-diff's own
// compare engine (server/jobs.ts) as tools an MCP client (Claude Code /
// Claude Desktop) can call in a closed verification loop.
//
// HARD INVARIANT: this process makes NO calls to any LLM API. It never
// imports @anthropic-ai/sdk, never reads ANTHROPIC_API_KEY, and never talks
// to api.anthropic.com. It only runs Playwright + pixelmatch + style/element
// diffing locally (the exact same pipeline the Express server and the CLI
// use) and hands the structured result back to whichever client called the
// tool. The LLM — if any — lives entirely in the MCP client, on the user's
// own subscription. See docs/CLAUDE-INTEGRATION.md.
//
// Run: `npx tsx server/mcp.ts` (stdio transport, spawned by the MCP client —
// not meant to be run interactively). Register with `claude mcp add
// design-diff -- npx tsx server/mcp.ts` or a `.mcp.json` entry.

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createJob, runJob, setReferenceImageBuffer } from './jobs.js';
import type { RunJobParams } from './jobs.js';
import { fetchFigmaReferenceImage, FigmaConfigError, FigmaApiError } from './figma.js';
import { isBreakpointError } from './types.js';
import type { CaptureOptions, CompareResponse, ReferenceType } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT_DIR, 'runs');

const DEFAULT_BREAKPOINTS = [1440, 1024, 768, 390];
const DEFAULT_THRESHOLD = 90;

// --- input schemas ----------------------------------------------------
//
// Mirrors server/index.ts's captureOptionsSchema shape exactly, so a client
// that already knows the HTTP API's CaptureOptions JSON shape can reuse it
// verbatim here.

const WAIT_UNTIL_VALUES = ['load', 'domcontentloaded', 'networkidle'] as const;

const captureOptionsSchema = z.object({
  hideSelectors: z.array(z.string().min(1)).optional(),
  dismissSelectors: z.array(z.string().min(1)).optional(),
  waitUntil: z.enum(WAIT_UNTIL_VALUES).optional(),
  waitMs: z.number().int().min(0).max(60000).optional(),
  waitForSelector: z.string().min(1).optional(),
  freezeAnimations: z.boolean().optional(),
  auth: z
    .object({
      cookies: z
        .array(
          z.object({
            name: z.string().min(1),
            value: z.string(),
            domain: z.string().min(1).optional(),
            path: z.string().optional(),
          }),
        )
        .optional(),
      headers: z.record(z.string()).optional(),
      httpCredentials: z.object({ username: z.string(), password: z.string() }).optional(),
      tokenId: z.string().min(1).optional(),
    })
    .optional(),
  clipSelector: z.string().min(1).optional(),
});

// Raw shape (ZodRawShape), as required by McpServer#registerTool's
// inputSchema — NOT wrapped in z.object(); the SDK does that internally.
const compareInputShape = {
  referenceUrl: z.string().url().optional().describe('Reference design as a live URL. Exactly one of referenceUrl/figmaUrl/imagePath is required.'),
  figmaUrl: z.string().url().optional().describe('Reference design as a figma.com file/design URL. Exactly one of referenceUrl/figmaUrl/imagePath is required.'),
  imagePath: z
    .string()
    .min(1)
    .optional()
    .describe('Reference design as a local image file path (PNG/JPG). Exactly one of referenceUrl/figmaUrl/imagePath is required.'),
  targetUrl: z.string().url().describe('URL of the implementation being checked against the reference.'),
  breakpoints: z.array(z.number().int().positive()).min(1).optional().describe('Viewport widths in px. Defaults to [1440, 1024, 768, 390].'),
  fullPage: z.boolean().optional().describe('Capture the full scrollable page instead of just the viewport. Default false.'),
  referenceCapture: captureOptionsSchema.optional().describe('Capture/auth options for the reference side (only applied when referenceUrl is given).'),
  targetCapture: captureOptionsSchema.optional().describe('Capture/auth options for the target side.'),
};

const verifyInputShape = {
  ...compareInputShape,
  threshold: z.number().min(0).max(100).optional().describe('Minimum passing score percentage per breakpoint. Default 90.'),
};

interface CompareToolInput {
  referenceUrl?: string;
  figmaUrl?: string;
  imagePath?: string;
  targetUrl: string;
  breakpoints?: number[];
  fullPage?: boolean;
  referenceCapture?: CaptureOptions;
  targetCapture?: CaptureOptions;
}

// --- run id -------------------------------------------------------------

let runCounter = 0;

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
  runCounter += 1;
  return `mcp-${runCounter}-${slugify(targetUrl)}-${Date.now()}`;
}

function round1(fraction: number): number {
  return Math.round(fraction * 1000) / 10; // one decimal place: 0.7931 -> 79.3
}

// --- engine invocation, shared by both tools -----------------------------
//
// shortcut: launches a fresh Chromium per call (runJob -> launchBrowser owns
// one Browser per job and closes it in its `finally`) rather than pooling a
// long-lived browser across tool calls. Simplest correct thing for a
// locally-invoked MCP server; pool a browser instance if per-call launch
// overhead ever dominates tool-call throughput.

interface EngineOk {
  ok: true;
  runId: string;
  response: CompareResponse;
}
interface EngineErr {
  ok: false;
  error: string;
}

async function runCompareEngine(input: CompareToolInput): Promise<EngineOk | EngineErr> {
  const { referenceUrl, figmaUrl, imagePath, targetUrl, referenceCapture, targetCapture } = input;
  const breakpoints = input.breakpoints && input.breakpoints.length > 0 ? input.breakpoints : DEFAULT_BREAKPOINTS;
  const fullPage = input.fullPage ?? false;

  const sources = [referenceUrl, figmaUrl, imagePath].filter((v) => v !== undefined);
  if (sources.length !== 1) {
    return { ok: false, error: 'Exactly one of referenceUrl, figmaUrl, imagePath must be provided.' };
  }
  const referenceType: ReferenceType = referenceUrl ? 'url' : figmaUrl ? 'figma' : 'image';

  let referenceImageBuffer: Buffer | undefined;
  if (referenceType === 'image') {
    const resolvedPath = path.resolve(imagePath as string);
    try {
      referenceImageBuffer = await fs.readFile(resolvedPath);
    } catch (err) {
      return { ok: false, error: `Could not read imagePath "${resolvedPath}": ${err instanceof Error ? err.message : String(err)}` };
    }
  } else if (referenceType === 'figma') {
    try {
      referenceImageBuffer = await fetchFigmaReferenceImage(figmaUrl as string);
    } catch (err) {
      if (err instanceof FigmaConfigError || err instanceof FigmaApiError) {
        return { ok: false, error: err.message };
      }
      return { ok: false, error: `Figma fetch failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const runId = makeRunId(targetUrl);
  const runDir = path.join(RUNS_DIR, runId);
  try {
    await fs.mkdir(runDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: `Could not create run directory "${runDir}": ${err instanceof Error ? err.message : String(err)}` };
  }

  const job = createJob(runId, breakpoints);
  if (referenceImageBuffer) {
    setReferenceImageBuffer(job.jobId, referenceImageBuffer);
  }

  const runParams: RunJobParams = {
    referenceType,
    referenceUrl: referenceType === 'url' ? referenceUrl : referenceType === 'figma' ? figmaUrl : undefined,
    targetUrl,
    breakpoints,
    fullPage,
    referenceCaptureOptions: referenceType === 'url' ? referenceCapture : undefined,
    targetCaptureOptions: targetCapture,
    runDir,
    runId,
    parityGate: 'flag',
  };

  // runJob never throws — all failure modes (including cancellation, which
  // this server never requests) resolve into job.status/job.error.
  await runJob(job, runParams);

  if (job.status === 'done' && job.response) {
    return { ok: true, runId, response: job.response };
  }
  return { ok: false, error: job.error ?? `Job ended with status "${job.status}"` };
}

// --- response shaping ----------------------------------------------------

function toFsPath(webPath: string): string {
  // webPath looks like "/runs/<runId>/<file>.png" (see server/jobs.ts
  // BreakpointResult.refImg/targetImg/diffImg) — join onto ROOT_DIR so an
  // MCP client can Read the file directly without a running HTTP server.
  return path.join(ROOT_DIR, webPath);
}

function buildComparePayload(runId: string, response: CompareResponse) {
  return {
    runId,
    summary: {
      avgScorePct: round1(response.summary.avgScore),
      worstBreakpoint: response.summary.worstBreakpoint,
    },
    breakpoints: response.breakpoints.map((bp) => {
      if (isBreakpointError(bp)) {
        return { breakpoint: bp.breakpoint, error: bp.error };
      }
      return {
        breakpoint: bp.breakpoint,
        scorePct: round1(bp.score),
        elementDiffs: bp.elementDiffs,
        styleDiff: bp.styleDiff,
        images: {
          ref: toFsPath(bp.refImg),
          target: toFsPath(bp.targetImg),
          diff: toFsPath(bp.diffImg),
        },
      };
    }),
    claudePrompt: response.claudePrompt,
  };
}

// --- server ---------------------------------------------------------------

function createServer(): McpServer {
  const server = new McpServer({ name: 'design-diff', version: '1.0.0' });

  server.registerTool(
    'compare',
    {
      title: 'Compare design vs implementation',
      description:
        'Runs the design-diff engine locally (Playwright capture + pixelmatch + style/element diff) to compare a ' +
        'reference design (a URL, a Figma frame, or an uploaded image) against a target URL across breakpoints. ' +
        'Returns per-breakpoint scores, surgical per-element diffs (missing/extra/changed elements with exact CSS ' +
        'property deltas and geometry), page-level style diffs, screenshot/diff image paths, and a ready-to-use ' +
        'fix prompt. This tool makes no LLM calls itself — it only captures and diffs; the calling assistant reasons ' +
        'about the result and decides what to fix.',
      inputSchema: compareInputShape,
    },
    async (input) => {
      const result = await runCompareEngine(input);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const payload = buildComparePayload(result.runId, result.response);
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  server.registerTool(
    'verify',
    {
      title: 'Verify design vs implementation against a threshold',
      description:
        'Runs the same design-diff engine as "compare" and applies a deterministic pass/fail gate: fails if any ' +
        'breakpoint scores below `threshold` percent (default 90) or if any breakpoint errored during capture. ' +
        'Use this as the stop condition of a fix-and-recheck loop — keep calling it after each round of edits until ' +
        'pass is true.',
      inputSchema: verifyInputShape,
    },
    async (input) => {
      const { threshold = DEFAULT_THRESHOLD, ...rest } = input;
      const result = await runCompareEngine(rest);
      if (!result.ok) {
        return { content: [{ type: 'text', text: result.error }], isError: true };
      }
      const { response } = result;
      const failures = response.breakpoints
        .filter((bp) => isBreakpointError(bp) || bp.score * 100 < threshold)
        .map((bp) => (isBreakpointError(bp) ? { breakpoint: bp.breakpoint, error: bp.error } : { breakpoint: bp.breakpoint, scorePct: round1(bp.score) }));
      const payload = {
        pass: failures.length === 0,
        threshold,
        failures,
        summary: {
          avgScorePct: round1(response.summary.avgScore),
          worstBreakpoint: response.summary.worstBreakpoint,
        },
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
    },
  );

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for JSON-RPC frames — log only to stderr.
  console.error('design-diff MCP server running on stdio (local engine only; no Claude/Anthropic API calls)');
}

main().catch((err) => {
  console.error('design-diff MCP server failed to start:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
