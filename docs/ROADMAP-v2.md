# design-diff — v2 roadmap & shared contract

Single source of truth for the v2 restructure ("work like a program, not a blog").
Distilled from two design analyses (UX app-shell + capture/compare engine). Keep this file
in sync when the contract changes — both the frontend and backend mirror it.

## Vision
A full-screen, single-window application (VS-Code / DevTools class): the app chrome never
page-scrolls — only individual panes scroll. Fast 2-click path, live telemetry, whole-scroll
capture across many breakpoints, state-parity confirmation before diffing, targeted block
compare, and interaction (hover/animation) QA. Everything stays local (only external calls:
screenshotting user URLs + Figma REST).

## Waves
- **Wave 1 (in progress): app-shell + core engine.**
  - Frontend (M1+M2): `AppShell` grid (no page scroll), `CommandBar`, activity rail →
    context panel (Setup / Breakpoint Matrix / Filmstrip), Canvas (breakpoint switcher, view
    modes, zoom/fit, ScrollMinimap with hot-region ticks), Inspector, StatusBar telemetry,
    `useHotkeys`, responsive reflow (1024 drawer / 768 drawers / 375 single-pane + bottom tabs).
  - Backend (engine Phase-1): `Job` + SSE telemetry (progress/stall/cancel), state-parity
    (auto-overlay enumeration + gate), full-scroll settle + sticky neutralization, provenance.
- **Wave 2: interaction depth.** Region/element picker + mini-prompt, scripted actions
  (enable/keep-open modals) UI + executor, hover/animation QA surfaces.
- **Wave 3: polish.** Command palette (⌘K), recent-pairs persistence, anchor-band alignment
  for variable-height diffs, filmstrip thumbnail derivatives, optional light theme.

## File ownership (Wave 1, two parallel implementers)
- **Backend agent** owns `server/*` and is the canonical author of shared types in
  `server/types.ts`.
- **Frontend agent** owns `web/*` and mirrors the shared types in `web/src/types.ts`
  (the codebase already hand-mirrors types across this boundary).
- Neither edits the other's directory. Both build against the contract below verbatim.

---

## Shared contract (v2, additive — the synchronous path must keep working byte-for-byte)

### HTTP
- `POST /api/compare` (multipart, unchanged) gains optional fields:
  `stream: "true"|"false"` (default `"false"`), `stateManifest` (JSON `StateManifest`),
  `parityGate: "off"|"flag"|"block"` (default `"flag"`).
  - `stream` absent/false → run to completion, return the **same `CompareResponse`** as today
    (now with optional `parity`/`provenance`/`untrusted` fields old clients ignore).
  - `stream=true` → validate, create a `Job`, start `runJob` **detached**, respond
    `202 { jobId, runId }`. Client then subscribes to SSE.
- `GET /api/jobs/:id/events` → **SSE** (`text/event-stream`, no-cache, keep-alive). Server keeps
  a per-job **replay buffer** so a late subscriber still gets earlier events; heartbeat comment
  every 15s. Streams `JobEvent`s (below).
- `POST /api/jobs/:id/cancel` → sets `cancelRequested`; pipeline aborts at the next phase
  boundary, tears down browser, emits `{type:'job',status:'cancelled'}`.

### Types (canonical in `server/types.ts`, mirrored in `web/src/types.ts`)
```ts
export type Phase =
  | 'launch' | 'navigate' | 'settle' | 'apply-state' | 'parity'
  | 'scroll' | 'screenshot' | 'normalize' | 'diff' | 'styles' | 'prompt';
export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';
export type Side = 'reference' | 'target' | 'both';

export interface Job {
  jobId: string; runId: string; status: JobStatus;
  pct: number;                 // 0..100 overall
  currentAction: string;       // e.g. "target · screenshot · 768px"
  breakpoints: number[]; cancelRequested: boolean;
  createdAt: number; updatedAt: number; error?: string;
  response?: CompareResponse;  // terminal payload
}

export interface StepEvent   { type:'step'; jobId:string; breakpoint:number|null; side:Side; phase:Phase; status:'start'|'ok'|'warn'|'error'; label:string; pct:number; at:number; durationMs?:number; detail?:string; }
export interface StallEvent  { type:'stall'; jobId:string; breakpoint:number|null; side:Side; phase:Phase; sinceMs:number; softTimeoutMs:number; }
export interface ParityEvent { type:'parity'; jobId:string; breakpoint:number; report:ParityReport; }
export interface BreakpointEvent { type:'breakpoint'; jobId:string; result:BreakpointResult; } // incremental, render as it lands
export interface JobStateEvent   { type:'job'; jobId:string; status:JobStatus; pct:number; currentAction:string; error?:string; }
export interface ResultEvent { type:'result'; jobId:string; response:CompareResponse; } // terminal
export type JobEvent = StepEvent | StallEvent | ParityEvent | BreakpointEvent | JobStateEvent | ResultEvent;

// State parity (auto-overlay enumeration + optional assertions)
export type AssertState = 'visible'|'hidden'|'attached'|'detached'|'expanded'|'collapsed'|'focused'|'count'|'text';
export interface StateAssertion { selector:string; expect:AssertState; value?:string|number; label?:string; }
export interface StateManifest {
  route?:{ path?:string; hash?:string }; viewport?:{ width:number; height?:number };
  scroll?:'top'|'bottom'|number|{selector:string};
  expectOpen?:string[]; expectClosed?:string[]; assertions?:StateAssertion[];
  enumerateOverlays?:boolean; // default true
}
export interface OverlayObservation { selector:string; role:string; ariaModal:boolean; topLayer:boolean; box:ElementBox; zIndex:number; }
export interface StateProbe { url:string; scrollY:number; activeElement:string;
  assertions:{ selector:string; expect:AssertState; actual:string|number|boolean; ok:boolean }[]; overlays:OverlayObservation[]; }
export type ParityStatus = 'match'|'mismatch'|'unchecked';
export interface ParityDivergence { kind:'assertion'|'overlay'|'route'|'scroll'; label:string; reference:string|number|boolean; target:string|number|boolean; box?:ElementBox; }
export interface ParityReport { status:ParityStatus; manifestHash:string; divergences:ParityDivergence[]; refProbe:StateProbe; targetProbe:StateProbe; }

// Provenance — "by what means" the diff was produced (trust surface)
export type AlignmentMethod = 'crop-min'|'anchor-band'|'region-clip'|'image-fit';
export interface DiffProvenance {
  diffMethod:'pixelmatch'; pixelThreshold:number; includeAA:boolean;
  alignment:AlignmentMethod; elementMatch:string; // 'text|text-sim|structural'
  stateManifestHash:string|null; refHeight:number; targetHeight:number; capturedAt:number;
}

// Additive to the EXISTING BreakpointResult (all optional → non-breaking):
//   parity?: ParityReport; provenance?: DiffProvenance; untrusted?: boolean;
// Additive to CompareResponse: jobId?: string; manifestHash?: string;
```

### Parity gate semantics
- `block`: on mismatch, do NOT diff; breakpoint carries `parity` + an error; prompt states which
  side had which overlay open.
- `flag` (default): still diff, set `untrusted:true`, and **quarantine** any hot region /
  element diff whose box intersects a divergence box before prompt generation, so the fix-prompt
  is not polluted by state artifacts. Prompt shows a STATE-MISMATCH banner + divergence list.
- `off`: legacy behavior.

### Engine notes
- Any new `page.evaluate` closure must be FLAT (no named inner functions/const-arrows — `tsx`
  bakes esbuild `keepNames`, Playwright loses `__name` on serialization → ReferenceError). Do
  ranking/hashing/diffing in Node after `evaluate`.
- Full-scroll capture: bounded lazy-load scroll (cap defeats infinite scroll) → font+image settle
  → neutralize `position:fixed|sticky` (pin to absolute at current offset so bars render once) →
  `screenshot({fullPage:true})`. Gate sticky neutralization behind a capture flag (default on for
  full page). Job owns one Browser; bounded breakpoint concurrency (default 2–3, no new dep).
- SSE recommended over WebSocket/polling (native to Express, no new dep, server→client only).

## Settings / secrets (Wave 1 tail) — "remember on this device", no accounts
Server-side, gitignored store. Two tiers, resolved per token need in this order:
**explicit request value → session → persisted → `.env` (`FIGMA_TOKEN` back-compat)**.
- **session (guest):** in-memory `Map<sessionId, Secrets>`, keyed by an HTTP-only `dd_sid`
  cookie (SameSite=Lax) set on first request; cleared on restart; never written to disk.
- **persisted ("remember on this device"):** gitignored `.secrets.json` at project root, keyed
  by `profileId` (default `"local"` — the seam for future accounts). Loaded on startup.

```ts
export interface NamedToken { id:string; label:string; kind:'bearer'|'header'|'cookie'|'raw'; value:string; headerName?:string; domain?:string; }
export interface Secrets { figmaToken?:string; tokens?:NamedToken[]; }
// masked view — safe to send to the client (never returns raw values):
export interface SecretsView { figmaToken:{set:boolean; last4?:string}; tokens:Array<Omit<NamedToken,'value'>&{last4:string}>; remember:boolean; }
```
- `GET /api/settings` → `SecretsView` (masked: set/not-set + last4).
- `PUT /api/settings` → `{ figmaToken?:string|null; tokens?:NamedToken[]; remember:boolean }`.
  `remember=true` persists to `.secrets.json` (profile "local"); `false` → session only;
  `figmaToken:null` clears it. Never log values.
- `DELETE /api/settings/tokens/:id`.
- Wiring: `server/figma.ts` token lookup uses the resolution order above (not `.env`-only). Per-side
  `auth` may carry `{ tokenId }` → server resolves the saved token into headers/cookies/credentials.
- Security: `.secrets.json` in `.gitignore`; values only to their own service; never to logs/git/net.
  `// shortcut: plaintext local secret file (mirrors .env), upgrade to OS keychain if multi-user`.
- Frontend: a Settings panel (gear in `CommandBar`) — masked Figma-token field (set/clear), named-
  tokens list (add/edit/remove by kind), a "Запомнить на этом устройстве" toggle; the per-side auth
  panel gains a "use saved token" picker.

## Component reuse ledger (frontend)
Reuse as-is: `OverlaySlider`, `ElementDiffList`, `RegistrationMark`. Reuse+relocate:
`CompareForm`, `CaptureAuthPanel`, `PromptPanel`. Evolve: `TopBar`→`CommandBar`. Split:
`BreakpointResult` → `CanvasViewport` (Side/Overlay/Diff + overlays) + `Inspector`
(element/style diffs + prompt). New: `AppShell`, `BreakpointSwitcher`, `BreakpointMatrix`,
`ScrollMinimap`, `StatusBar`, `useHotkeys`, `useRunProgress` (EventSource).

## A11y / design conformance (every wave)
Dark slate + Fira; Lucide icons, no emoji; motion 3/10 (`duration-fast/base`, `ease-standard`);
`:focus-visible` rings on all interactive elements; drawers trap focus but `Esc` exits; status/
score never color-only (glyph+text); `prefers-reduced-motion` honored; verify at 375/768/1024/
1440 with no page scroll and no horizontal scroll.
