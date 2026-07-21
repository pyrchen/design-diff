import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { z } from 'zod';

import { fetchFigmaReferenceImage, FigmaConfigError, FigmaApiError } from './figma.js';
import { createJob, getJob, requestCancel, runJob, setReferenceImageBuffer, subscribeJob } from './jobs.js';
import type { RunJobParams } from './jobs.js';
import {
  DEFAULT_PROFILE_ID,
  deleteToken,
  ensureSessionId,
  getSecretsView,
  resolveCaptureAuthTokens,
  resolveFigmaToken,
  saveSecrets,
} from './secrets.js';
import type { CaptureOptions, CompareResponse, JobEvent, NamedToken, StateManifest } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT_DIR, 'runs');
const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures');
const WEB_DIST_DIR = path.join(ROOT_DIR, 'web', 'dist');
const PORT = Number(process.env.PORT ?? 3000);

const app = express();
app.use(cors());
// Settings/secrets endpoints (GET/PUT JSON, DELETE no body) need a JSON body
// parser; /api/compare stays multipart (multer) and is untouched by this —
// express.json() only engages for requests whose Content-Type is JSON.
app.use(express.json());
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
      // Settings/secrets (Wave 1 tail): resolve a saved NamedToken at request time.
      tokenId: z.string().min(1).optional(),
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

// Engine Phase-1: StateManifest validation (state-parity request field).
const ASSERT_STATE_VALUES = ['visible', 'hidden', 'attached', 'detached', 'expanded', 'collapsed', 'focused', 'count', 'text'] as const;

const stateAssertionSchema = z.object({
  selector: z.string().min(1),
  expect: z.enum(ASSERT_STATE_VALUES),
  value: z.union([z.string(), z.number()]).optional(),
  label: z.string().optional(),
});

const stateManifestSchema = z.object({
  route: z.object({ path: z.string().optional(), hash: z.string().optional() }).optional(),
  viewport: z.object({ width: z.number(), height: z.number().optional() }).optional(),
  scroll: z.union([z.literal('top'), z.literal('bottom'), z.number(), z.object({ selector: z.string() })]).optional(),
  expectOpen: z.array(z.string()).optional(),
  expectClosed: z.array(z.string()).optional(),
  assertions: z.array(stateAssertionSchema).optional(),
  enumerateOverlays: z.boolean().optional(),
});

const stateManifestField = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s || s.trim() === '') return undefined;
    try {
      const parsed = JSON.parse(s);
      return stateManifestSchema.parse(parsed);
    } catch (err) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `stateManifest must be a JSON object matching StateManifest: ${err instanceof Error ? err.message : String(err)}`,
      });
      return z.NEVER;
    }
  });

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
    // Engine Phase-1: streaming + state-parity. All additive/optional —
    // absent stream/parityGate fall back to the pre-Phase-1 synchronous
    // contract exactly.
    stream: z
      .string()
      .optional()
      .transform((s) => s === 'true'),
    stateManifest: stateManifestField,
    parityGate: z.enum(['off', 'flag', 'block']).optional().default('flag'),
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

// --- Route: POST /api/compare ----------------------------------------------
//
// Engine Phase-1: both the legacy synchronous contract (stream absent/false)
// and the new streaming contract (stream=true) run through the exact same
// jobs.ts pipeline (createJob + runJob) — the only difference is whether the
// request handler awaits completion before responding, or responds 202 and
// lets the job run detached while the client subscribes over SSE. This is
// what keeps the sync path byte-for-byte: it is not a separate code path.

app.post('/api/compare', upload.single('image'), async (req, res) => {
  const parsed = compareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    return;
  }
  const {
    referenceType,
    referenceUrl,
    figmaUrl,
    targetUrl,
    breakpoints,
    fullPage,
    referenceCapture,
    targetCapture,
    advanced,
    stream,
    stateManifest,
    parityGate,
  } = parsed.data;

  if (referenceType === 'image' && !req.file) {
    res.status(400).json({ error: 'image file is required when referenceType is "image"' });
    return;
  }

  // Settings/secrets (Wave 1 tail): identify (or provision) this device's
  // guest session up front — both the Figma-token resolution and the
  // per-side auth.tokenId resolution below need it.
  const sessionId = ensureSessionId(req, res);

  // Job 1: resolve effective per-side options. A per-side field always wins;
  // the legacy `advanced` block (pre-split, applied to both sides) is only a
  // fallback for whichever side didn't send its own field. referenceCapture
  // only makes sense when the reference itself is a live URL.
  // Settings/secrets: resolve any auth.tokenId into concrete headers/
  // cookies/httpCredentials at request time (session -> persisted; a miss
  // is a no-op, see resolveCaptureAuthTokens).
  const effectiveReferenceCaptureOptions: CaptureOptions | undefined = resolveCaptureAuthTokens(
    referenceType === 'url' ? (referenceCapture ?? advanced) : undefined,
    sessionId,
    DEFAULT_PROFILE_ID,
  );
  const effectiveTargetCaptureOptions: CaptureOptions | undefined = resolveCaptureAuthTokens(
    targetCapture ?? advanced,
    sessionId,
    DEFAULT_PROFILE_ID,
  );

  // Resolve the static reference image up front (once per request, not per
  // breakpoint) so a bad Figma URL / missing token fails fast with a clean
  // 400 instead of erroring out on every breakpoint individually.
  let referenceImageBuffer: Buffer | undefined;
  if (referenceType === 'image') {
    referenceImageBuffer = req.file!.buffer;
  } else if (referenceType === 'figma') {
    try {
      // Settings/secrets: explicit request value -> session -> persisted -> .env.
      // This request doesn't carry an explicit figma token field itself, so
      // resolution starts at the session tier; fetchFigmaReferenceImage
      // falls back to the legacy .env-only lookup if nothing resolves.
      const resolvedFigmaToken = resolveFigmaToken(sessionId, DEFAULT_PROFILE_ID);
      referenceImageBuffer = await fetchFigmaReferenceImage(figmaUrl as string, resolvedFigmaToken);
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

  const job = createJob(runId, breakpoints);
  if (referenceImageBuffer) {
    setReferenceImageBuffer(job.jobId, referenceImageBuffer);
  }

  const responseReferenceUrl = referenceType === 'url' ? referenceUrl : referenceType === 'figma' ? figmaUrl : undefined;

  const runParams: RunJobParams = {
    referenceType,
    referenceUrl: responseReferenceUrl,
    targetUrl,
    breakpoints,
    fullPage,
    referenceCaptureOptions: effectiveReferenceCaptureOptions,
    targetCaptureOptions: effectiveTargetCaptureOptions,
    runDir,
    runId,
    parityGate,
    stateManifest: stateManifest as StateManifest | undefined,
  };

  if (stream) {
    res.status(202).json({ jobId: job.jobId, runId: job.runId });
    // detached — errors are captured as terminal job events, never thrown here
    void runJob(job, runParams);
    return;
  }

  await runJob(job, runParams);
  if (job.status === 'done' && job.response) {
    const response: CompareResponse = job.response;
    res.json(response);
    return;
  }
  res.status(job.status === 'cancelled' ? 499 : 500).json({ error: job.error ?? `Job ended with status "${job.status}"` });
});

// --- Routes: settings / secrets (Wave 1 tail) -------------------------------
//
// Never log req.body or any resolved token/value on these routes — masked
// views only ever leave this process.

const namedTokenSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['bearer', 'header', 'cookie', 'raw']),
  value: z.string().min(1),
  headerName: z.string().min(1).optional(),
  domain: z.string().min(1).optional(),
});

const putSettingsBodySchema = z.object({
  figmaToken: z.union([z.string().min(1), z.null()]).optional(),
  tokens: z.array(namedTokenSchema).optional(),
  remember: z.boolean(),
});

app.get('/api/settings', (req, res) => {
  const sessionId = ensureSessionId(req, res);
  res.json(getSecretsView(sessionId, DEFAULT_PROFILE_ID));
});

app.put('/api/settings', (req, res) => {
  const parsed = putSettingsBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', issues: parsed.error.issues });
    return;
  }
  const sessionId = ensureSessionId(req, res);
  const { figmaToken, tokens, remember } = parsed.data;
  saveSecrets({ sessionId, profileId: DEFAULT_PROFILE_ID, figmaToken, tokens: tokens as NamedToken[] | undefined, remember });
  res.json(getSecretsView(sessionId, DEFAULT_PROFILE_ID));
});

app.delete('/api/settings/tokens/:id', (req, res) => {
  const sessionId = ensureSessionId(req, res);
  deleteToken(req.params.id, sessionId, DEFAULT_PROFILE_ID);
  res.json(getSecretsView(sessionId, DEFAULT_PROFILE_ID));
});

// --- Route: GET /api/jobs/:id/events (SSE) ---------------------------------

app.get('/api/jobs/:id/events', (req, res) => {
  const jobId = req.params.id;
  const job = getJob(jobId);
  if (!job) {
    res.status(404).json({ error: 'job not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const send = (event: JobEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const isTerminal = (event: JobEvent): boolean =>
    event.type === 'job' && (event.status === 'done' || event.status === 'error' || event.status === 'cancelled');

  const heartbeat = setInterval(() => {
    res.write(':\n\n');
  }, 15000);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    sub?.unsubscribe();
  };

  const sub = subscribeJob(jobId, (event) => {
    send(event);
    if (isTerminal(event)) {
      cleanup();
      res.end();
    }
  });

  if (!sub) {
    cleanup();
    res.status(404).end();
    return;
  }

  let alreadyTerminal = false;
  for (const buffered of sub.replay) {
    send(buffered);
    if (isTerminal(buffered)) alreadyTerminal = true;
  }
  if (alreadyTerminal) {
    cleanup();
    res.end();
    return;
  }

  req.on('close', cleanup);
});

// --- Route: POST /api/jobs/:id/cancel ---------------------------------------

app.post('/api/jobs/:id/cancel', (req, res) => {
  const jobId = req.params.id;
  const ok = requestCancel(jobId);
  if (!ok) {
    res.status(404).json({ error: 'job not found' });
    return;
  }
  res.status(202).json({ jobId, cancelRequested: true });
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
