import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import type { Browser } from 'playwright';

import { launchBrowser, openPage, screenshot } from './capture.js';
import { normalizeUrlPair, normalizeImageAgainstTarget } from './normalize.js';
import { computeDiff } from './diff.js';
import { captureDesignSnapshot, diffDesignSnapshots, diffElements } from './styles.js';
import { buildClaudePrompt } from './prompt.js';
import { fetchFigmaReferenceImage, FigmaConfigError, FigmaApiError } from './figma.js';
import type {
  BreakpointOutcome,
  BreakpointResult,
  CaptureOptions,
  CompareResponse,
  DesignSnapshot,
  ElementDiffEntry,
  ReferenceType,
  StyleDiffEntry,
} from './types.js';
import { isBreakpointError } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT_DIR, 'runs');
const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures');
const WEB_DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(cors());
app.use('/runs', express.static(RUNS_DIR));

// Fixture route for Feature 1 verification: serves different markup based on
// a request header or cookie, to prove that captured content actually
// changes when auth headers/cookies are applied during capture.
app.get('/fixtures/gated', (req, res) => {
  const cookieHeader = req.headers.cookie ?? '';
  const grantedByCookie = /(?:^|;\s*)auth=granted(?:;|$)/.test(cookieHeader);
  const grantedByHeader = req.headers['x-fixture-auth'] === 'granted';
  const granted = grantedByCookie || grantedByHeader;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(
    granted
      ? '<!doctype html><html lang="ru"><body style="margin:0;font-family:Arial,sans-serif;padding:40px;"><h1 id="gated-heading">Доступ разрешён</h1><p>granted-content-marker</p></body></html>'
      : '<!doctype html><html lang="ru"><body style="margin:0;font-family:Arial,sans-serif;padding:40px;background:#eee;"><h1 id="gated-heading">Доступ закрыт</h1><p>denied-content-marker</p></body></html>',
  );
});

app.use('/fixtures', express.static(FIXTURES_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// --- Validation ---------------------------------------------------------

const WAIT_UNTIL_VALUES = ['load', 'domcontentloaded', 'networkidle'] as const;

// Job 1: per-side capture + auth options. Cookie `domain` is optional here —
// when omitted the server derives it from that side's own URL (see
// capture.ts hostnameOf), so a cookie block never has to know or guess the
// other side's host.
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
    })
    .optional(),
  clipSelector: z.string().min(1).optional(),
});

/** Builds a fresh `z.string().optional().transform(...)` field that JSON-parses + validates against captureOptionsSchema. */
function captureOptionsField(fieldName: string) {
  return z
    .string()
    .optional()
    .transform((s, ctx) => {
      if (!s || s.trim() === '') return undefined;
      try {
        const parsed = JSON.parse(s);
        return captureOptionsSchema.parse(parsed);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${fieldName} must be a JSON object matching CaptureOptions: ${err instanceof Error ? err.message : String(err)}`,
        });
        return z.NEVER;
      }
    });
}

const compareBodySchema = z
  .object({
    referenceType: z.enum(['url', 'image', 'figma']),
    referenceUrl: z.string().url().optional(),
    figmaUrl: z.string().url().optional(),
    targetUrl: z.string().url(),
    breakpoints: z
      .string()
      .transform((s, ctx) => {
        try {
          const parsed = JSON.parse(s);
          const arr = z.array(z.number().int().positive()).min(1).parse(parsed);
          return arr;
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'breakpoints must be a JSON array of positive numbers' });
          return z.NEVER;
        }
      }),
    fullPage: z
      .string()
      .optional()
      .transform((s) => s === 'true'),
    // Job 1: per-side capture + auth. referenceCapture only ever applies when
    // referenceType === 'url' (checked below); targetCapture always applies.
    // `advanced` is the pre-split legacy field, kept for back-compat: when a
    // per-side field is absent, its value is applied to that side instead.
    referenceCapture: captureOptionsField('referenceCapture'),
    targetCapture: captureOptionsField('targetCapture'),
    advanced: captureOptionsField('advanced'),
  })
  .refine((data) => data.referenceType !== 'url' || !!data.referenceUrl, {
    message: 'referenceUrl is required when referenceType is "url"',
    path: ['referenceUrl'],
  })
  .refine((data) => data.referenceType !== 'figma' || !!data.figmaUrl, {
    message: 'figmaUrl is required when referenceType is "figma"',
    path: ['figmaUrl'],
  });

// --- Run id ---------------------------------------------------------------

let runCounter = 0;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function makeRunId(targetUrl: string): string {
  runCounter += 1;
  return `${runCounter}-${slugify(targetUrl)}-${Date.now()}`;
}

// --- Per-breakpoint pipeline -----------------------------------------------

interface BreakpointContext {
  browser: Browser;
  bp: number;
  runDir: string;
  runId: string;
  referenceType: ReferenceType;
  referenceUrl: string | undefined;
  targetUrl: string;
  fullPage: boolean;
  referenceImageBuffer: Buffer | undefined;
  // Job 1: each side carries its own capture+auth options, applied to ITS
  // OWN Playwright context only — see openPage() in capture.ts.
  referenceCaptureOptions: CaptureOptions | undefined;
  targetCaptureOptions: CaptureOptions | undefined;
}

async function processBreakpoint(ctx: BreakpointContext): Promise<BreakpointOutcome> {
  const {
    browser,
    bp,
    runDir,
    runId,
    referenceType,
    referenceUrl,
    targetUrl,
    fullPage,
    referenceImageBuffer,
    referenceCaptureOptions,
    targetCaptureOptions,
  } = ctx;
  const viewport = { width: bp, height: 900 };
  const targetClipSelector = targetCaptureOptions?.clipSelector;
  const referenceClipSelector = referenceCaptureOptions?.clipSelector;

  try {
    let targetPng: Buffer;
    let refPng: Buffer;
    let styleDiff: StyleDiffEntry[] = [];
    let elementDiffs: ElementDiffEntry[] = [];

    if (referenceType === 'url') {
      const [targetOpened, refOpened] = await Promise.all([
        openPage(browser, targetUrl, viewport, targetCaptureOptions),
        openPage(browser, referenceUrl as string, viewport, referenceCaptureOptions),
      ]);
      try {
        const targetPngResult = await screenshot(targetOpened.page, fullPage, targetClipSelector);
        const targetSnapshot: DesignSnapshot = await captureDesignSnapshot(targetOpened.page);
        const refPngResult = await screenshot(refOpened.page, fullPage, referenceClipSelector);
        const refSnapshot: DesignSnapshot = await captureDesignSnapshot(refOpened.page);

        targetPng = targetPngResult;
        refPng = refPngResult;
        styleDiff = diffDesignSnapshots(refSnapshot, targetSnapshot);
        elementDiffs = diffElements(refSnapshot, targetSnapshot);
      } finally {
        await Promise.all([targetOpened.close(), refOpened.close()]);
      }
    } else {
      const targetOpened = await openPage(browser, targetUrl, viewport, targetCaptureOptions);
      try {
        targetPng = await screenshot(targetOpened.page, fullPage, targetClipSelector);
      } finally {
        await targetOpened.close();
      }
      // shortcut: same reference image (uploaded or Figma-rendered) reused for every breakpoint
      refPng = await sharp(referenceImageBuffer as Buffer)
        .png()
        .toBuffer();
    }

    const targetFile = `${bp}-target.png`;
    const refFile = `${bp}-ref.png`;
    const diffFile = `${bp}-diff.png`;

    await fs.writeFile(path.join(runDir, targetFile), targetPng);
    await fs.writeFile(path.join(runDir, refFile), refPng);

    const normalized =
      referenceType === 'url' ? await normalizeUrlPair(refPng, targetPng) : await normalizeImageAgainstTarget(refPng, targetPng);

    const diffResult = await computeDiff(normalized.ref, normalized.target);
    await fs.writeFile(path.join(runDir, diffFile), diffResult.diffPng);

    return {
      breakpoint: bp,
      score: diffResult.score,
      refImg: `/runs/${runId}/${refFile}`,
      targetImg: `/runs/${runId}/${targetFile}`,
      diffImg: `/runs/${runId}/${diffFile}`,
      hotRegions: diffResult.hotRegions,
      styleDiff,
      elementDiffs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { breakpoint: bp, error: message };
  }
}

// --- Route ------------------------------------------------------------

app.post('/api/compare', upload.single('image'), async (req, res) => {
  const parsed = compareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    return;
  }
  const { referenceType, referenceUrl, figmaUrl, targetUrl, breakpoints, fullPage, referenceCapture, targetCapture, advanced } =
    parsed.data;

  if (referenceType === 'image' && !req.file) {
    res.status(400).json({ error: 'image file is required when referenceType is "image"' });
    return;
  }

  // Job 1: resolve effective per-side options. A per-side field always wins;
  // the legacy `advanced` block (pre-split, applied to both sides) is only a
  // fallback for whichever side didn't send its own field. referenceCapture
  // only makes sense when the reference itself is a live URL.
  const effectiveReferenceCaptureOptions: CaptureOptions | undefined =
    referenceType === 'url' ? (referenceCapture ?? advanced) : undefined;
  const effectiveTargetCaptureOptions: CaptureOptions | undefined = targetCapture ?? advanced;

  // Resolve the static reference image up front (once per request, not per
  // breakpoint) so a bad Figma URL / missing token fails fast with a clean
  // 400 instead of erroring out on every breakpoint individually.
  let referenceImageBuffer: Buffer | undefined;
  if (referenceType === 'image') {
    referenceImageBuffer = req.file!.buffer;
  } else if (referenceType === 'figma') {
    try {
      referenceImageBuffer = await fetchFigmaReferenceImage(figmaUrl as string);
    } catch (err) {
      if (err instanceof FigmaConfigError || err instanceof FigmaApiError) {
        res.status(400).json({ error: err.message });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(502).json({ error: `Не удалось получить рендер из Figma: ${message}` });
      return;
    }
  }

  const runId = makeRunId(targetUrl);
  const runDir = path.join(RUNS_DIR, runId);
  await fs.mkdir(runDir, { recursive: true });

  let browser: Browser | undefined;
  try {
    browser = await launchBrowser();

    const outcomes: BreakpointOutcome[] = [];
    for (const bp of breakpoints) {
      // sequential: keeps memory/CPU bounded and avoids overwhelming the target site
      const outcome = await processBreakpoint({
        browser,
        bp,
        runDir,
        runId,
        referenceType,
        referenceUrl,
        targetUrl,
        fullPage,
        referenceImageBuffer,
        referenceCaptureOptions: effectiveReferenceCaptureOptions,
        targetCaptureOptions: effectiveTargetCaptureOptions,
      });
      outcomes.push(outcome);
    }

    const scored = outcomes.filter((o): o is BreakpointResult => !isBreakpointError(o));
    const avgScore = scored.length > 0 ? scored.reduce((sum, o) => sum + o.score, 0) / scored.length : 0;
    const worst = scored.length > 0 ? scored.reduce((min, o) => (o.score < min.score ? o : min)) : null;

    const responseWithoutPrompt: Omit<CompareResponse, 'claudePrompt'> = {
      runId,
      referenceType,
      referenceUrl: referenceType === 'url' ? (referenceUrl as string) : referenceType === 'figma' ? (figmaUrl as string) : null,
      targetUrl,
      breakpoints: outcomes,
      summary: { avgScore, worstBreakpoint: worst ? worst.breakpoint : null },
    };

    const claudePrompt = buildClaudePrompt(responseWithoutPrompt);
    const response: CompareResponse = { ...responseWithoutPrompt, claudePrompt };

    res.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  } finally {
    if (browser) await browser.close();
  }
});

// --- Static frontend (prod) ---------------------------------------------

app.use(express.static(WEB_DIST_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/runs') || req.path.startsWith('/fixtures')) {
    next();
    return;
  }
  res.sendFile(path.join(WEB_DIST_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`design-diff server listening on http://localhost:${PORT}`);
});
