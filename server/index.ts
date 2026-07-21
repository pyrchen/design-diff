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
import { captureDesignSnapshot, diffDesignSnapshots } from './styles.js';
import { buildClaudePrompt } from './prompt.js';
import type {
  BreakpointOutcome,
  BreakpointResult,
  CompareResponse,
  DesignSnapshot,
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
app.use('/fixtures', express.static(FIXTURES_DIR));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// --- Validation ---------------------------------------------------------

const compareBodySchema = z
  .object({
    referenceType: z.enum(['url', 'image']),
    referenceUrl: z.string().url().optional(),
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
  })
  .refine((data) => data.referenceType !== 'url' || !!data.referenceUrl, {
    message: 'referenceUrl is required when referenceType is "url"',
    path: ['referenceUrl'],
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
}

async function processBreakpoint(ctx: BreakpointContext): Promise<BreakpointOutcome> {
  const { browser, bp, runDir, runId, referenceType, referenceUrl, targetUrl, fullPage, referenceImageBuffer } = ctx;
  const viewport = { width: bp, height: 900 };

  try {
    let targetPng: Buffer;
    let refPng: Buffer;
    let styleDiff: StyleDiffEntry[] = [];

    if (referenceType === 'url') {
      const [targetOpened, refOpened] = await Promise.all([
        openPage(browser, targetUrl, viewport),
        openPage(browser, referenceUrl as string, viewport),
      ]);
      try {
        const targetPngResult = await screenshot(targetOpened.page, fullPage);
        const targetSnapshot: DesignSnapshot = await captureDesignSnapshot(targetOpened.page);
        const refPngResult = await screenshot(refOpened.page, fullPage);
        const refSnapshot: DesignSnapshot = await captureDesignSnapshot(refOpened.page);

        targetPng = targetPngResult;
        refPng = refPngResult;
        styleDiff = diffDesignSnapshots(refSnapshot, targetSnapshot);
      } finally {
        await Promise.all([targetOpened.close(), refOpened.close()]);
      }
    } else {
      const targetOpened = await openPage(browser, targetUrl, viewport);
      try {
        targetPng = await screenshot(targetOpened.page, fullPage);
      } finally {
        await targetOpened.close();
      }
      // shortcut: same uploaded mockup reused as reference for every breakpoint
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
  const { referenceType, referenceUrl, targetUrl, breakpoints, fullPage } = parsed.data;

  if (referenceType === 'image' && !req.file) {
    res.status(400).json({ error: 'image file is required when referenceType is "image"' });
    return;
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
        referenceImageBuffer: req.file?.buffer,
      });
      outcomes.push(outcome);
    }

    const scored = outcomes.filter((o): o is BreakpointResult => !isBreakpointError(o));
    const avgScore = scored.length > 0 ? scored.reduce((sum, o) => sum + o.score, 0) / scored.length : 0;
    const worst = scored.length > 0 ? scored.reduce((min, o) => (o.score < min.score ? o : min)) : null;

    const responseWithoutPrompt: Omit<CompareResponse, 'claudePrompt'> = {
      runId,
      referenceType,
      referenceUrl: referenceType === 'url' ? (referenceUrl as string) : null,
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
