import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import type {
  ElementBox,
  HotRegion,
  ElementDiffEntry,
  ParityDivergence,
  ParityReport,
  ParityStatus,
  StateAssertion,
  StateManifest,
  StateProbe,
} from './types.js';

// --- Manifest hashing --------------------------------------------------

/** Deep, key-sorted JSON stringify so equivalent manifests always hash the same. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function computeManifestHash(manifest: StateManifest | undefined): string {
  return createHash('sha1').update(stableStringify(manifest ?? {})).digest('hex');
}

// --- apply-state: scroll + hash routing before probing/capture ---------

/**
 * Applies the (partial) navigational parts of a StateManifest that don't
 * require a full re-navigation: scroll position and URL hash. `route.path`
 * is intentionally NOT applied here (each side already navigated to its own
 * configured URL in the `navigate` phase) — it is compared read-only in
 * buildParityReport instead.
 * shortcut: no scripted-interaction executor yet (enable/keep-open modals is
 * Wave 2) — StateManifest.expectOpen/expectClosed are read/compared by
 * probeState + buildParityReport, not acted upon.
 */
export async function applyStateManifest(page: Page, manifest: StateManifest | undefined): Promise<void> {
  if (!manifest) return;

  if (manifest.route?.hash !== undefined) {
    const hash = manifest.route.hash;
    await page.evaluate((h) => {
      window.location.hash = h;
    }, hash);
  }

  const scroll = manifest.scroll;
  if (scroll === 'top') {
    await page.evaluate(() => window.scrollTo(0, 0));
  } else if (scroll === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  } else if (typeof scroll === 'number') {
    await page.evaluate((y) => window.scrollTo(0, y), scroll);
  } else if (scroll && typeof scroll === 'object' && 'selector' in scroll) {
    const selector = scroll.selector;
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) el.scrollIntoView({ block: 'start' });
    }, selector);
  }
}

// --- probeState: FLAT page.evaluate closure -----------------------------
//
// shortcut: per the tsx/esbuild `keepNames` constraint (see styles.ts), this
// closure must not declare any named inner function/const-arrow — only plain
// value bindings, for-loops, if/else, and INLINE anonymous callbacks (which
// esbuild never wraps in `__name`). All ranking/formatting happens in Node
// afterwards (buildParityReport, below).

export async function probeState(page: Page, manifest: StateManifest | undefined): Promise<StateProbe> {
  const assertions: StateAssertion[] = manifest?.assertions ?? [];
  const enumerateOverlays = manifest?.enumerateOverlays ?? true;

  return page.evaluate(
    ({ assertions, enumerateOverlays }) => {
      const overlays: {
        selector: string;
        role: string;
        ariaModal: boolean;
        topLayer: boolean;
        box: { x: number; y: number; width: number; height: number };
        zIndex: number;
      }[] = [];

      if (enumerateOverlays) {
        const candidates = Array.from(document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]'));
        for (const raw of candidates) {
          const el = raw as HTMLElement;
          const cs = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          if (!visible) continue;

          const idPart = el.id ? `#${el.id}` : '';
          const classPart =
            typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';

          let topLayer = false;
          try {
            topLayer = el.matches(':modal');
          } catch {
            topLayer = false;
          }

          overlays.push({
            selector: `${el.tagName.toLowerCase()}${idPart}${classPart}`,
            role: el.getAttribute('role') ?? (el.tagName.toLowerCase() === 'dialog' ? 'dialog' : ''),
            ariaModal: el.getAttribute('aria-modal') === 'true',
            topLayer,
            box: {
              x: Math.round(rect.x + window.scrollX),
              y: Math.round(rect.y + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            zIndex: Number(cs.zIndex) || 0,
          });
        }
      }

      const assertionResults: { selector: string; expect: string; actual: string | number | boolean; ok: boolean }[] = [];
      for (const a of assertions) {
        const el = document.querySelector(a.selector);
        let actual: string | number | boolean = '';
        let ok = false;

        if (a.expect === 'visible' || a.expect === 'hidden') {
          let isVisible = false;
          if (el) {
            const cs = window.getComputedStyle(el as HTMLElement);
            const rect = (el as HTMLElement).getBoundingClientRect();
            isVisible = cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
          }
          actual = a.expect === 'visible' ? isVisible : !isVisible;
          ok = actual === true;
        } else if (a.expect === 'attached') {
          actual = el !== null;
          ok = actual === true;
        } else if (a.expect === 'detached') {
          actual = el === null;
          ok = actual === true;
        } else if (a.expect === 'expanded') {
          actual = el !== null && el.getAttribute('aria-expanded') === 'true';
          ok = actual === true;
        } else if (a.expect === 'collapsed') {
          actual = el === null || el.getAttribute('aria-expanded') !== 'true';
          ok = actual === true;
        } else if (a.expect === 'focused') {
          actual = el !== null && document.activeElement === el;
          ok = actual === true;
        } else if (a.expect === 'count') {
          const count = document.querySelectorAll(a.selector).length;
          actual = count;
          ok = a.value !== undefined ? count === Number(a.value) : count > 0;
        } else if (a.expect === 'text') {
          const text = el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
          actual = text;
          ok = a.value !== undefined ? text === String(a.value) : text.length > 0;
        }

        assertionResults.push({ selector: a.selector, expect: a.expect, actual, ok });
      }

      let activeDesc = 'BODY';
      if (document.activeElement && document.activeElement !== document.body) {
        const ae = document.activeElement as HTMLElement;
        activeDesc = ae.id ? `${ae.tagName.toLowerCase()}#${ae.id}` : ae.tagName.toLowerCase();
      }

      return {
        url: window.location.href,
        scrollY: window.scrollY,
        activeElement: activeDesc,
        assertions: assertionResults,
        overlays,
      };
    },
    { assertions, enumerateOverlays },
  ) as Promise<StateProbe>;
}

// --- buildParityReport: Node-side diffing --------------------------------

export function buildParityReport(
  refProbe: StateProbe,
  targetProbe: StateProbe,
  manifest: StateManifest | undefined,
): ParityReport {
  const divergences: ParityDivergence[] = [];

  // Symmetric overlay-set difference: "which modals are open/closed".
  const refOverlays = new Map(refProbe.overlays.map((o) => [o.selector, o]));
  const targetOverlays = new Map(targetProbe.overlays.map((o) => [o.selector, o]));
  for (const [selector, o] of refOverlays) {
    if (!targetOverlays.has(selector)) {
      divergences.push({ kind: 'overlay', label: selector, reference: 'open', target: 'closed', box: o.box });
    }
  }
  for (const [selector, o] of targetOverlays) {
    if (!refOverlays.has(selector)) {
      divergences.push({ kind: 'overlay', label: selector, reference: 'closed', target: 'open', box: o.box });
    }
  }

  // Declared assertion diffs (paired by declaration order — both probes were
  // evaluated against the same manifest.assertions array).
  const n = Math.min(refProbe.assertions.length, targetProbe.assertions.length);
  for (let i = 0; i < n; i++) {
    const r = refProbe.assertions[i];
    const t = targetProbe.assertions[i];
    if (!r.ok || !t.ok || r.actual !== t.actual) {
      divergences.push({ kind: 'assertion', label: r.selector, reference: r.actual, target: t.actual });
    }
  }

  // Route diff (only when the manifest declares a route to check).
  if (manifest?.route) {
    try {
      const refUrl = new URL(refProbe.url);
      const targetUrl = new URL(targetProbe.url);
      if (refUrl.pathname !== targetUrl.pathname) {
        divergences.push({ kind: 'route', label: 'path', reference: refUrl.pathname, target: targetUrl.pathname });
      }
      if (refUrl.hash !== targetUrl.hash) {
        divergences.push({ kind: 'route', label: 'hash', reference: refUrl.hash, target: targetUrl.hash });
      }
    } catch {
      // malformed URL — nothing sensible to compare
    }
  }

  // Scroll diff (small jitter tolerated).
  if (Math.abs(refProbe.scrollY - targetProbe.scrollY) > 5) {
    divergences.push({ kind: 'scroll', label: 'scrollY', reference: refProbe.scrollY, target: targetProbe.scrollY });
  }

  const status: ParityStatus = divergences.length > 0 ? 'mismatch' : 'match';
  return { status, manifestHash: computeManifestHash(manifest), divergences, refProbe, targetProbe };
}

// --- Gate=flag quarantine: hide state-artifact regions before prompting --

function boxesIntersect(a: ElementBox, b: ElementBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Removes any hotRegion/elementDiff whose box intersects a parity divergence
 * box, so a modal that's open on one side and closed on the other doesn't
 * pollute the fix-prompt with pixel noise that isn't a real design defect.
 *
 * shortcut: hotRegion boxes live in the post-normalize diff-image coordinate
 * space (xPct/yPct of imageWidth/imageHeight) while divergence boxes are in
 * pre-normalize page/document pixel space (viewport + scroll offset) — close
 * enough for top-left-anchored crops (the only alignment method Phase-1
 * uses), but not pixel-exact if a future alignment method re-anchors the
 * image. elementDiff boxes (refBox/targetBox) are already in the same
 * document-pixel space as divergence boxes, so those compare exactly.
 */
export function quarantineDivergentRegions(
  hotRegions: HotRegion[],
  elementDiffs: ElementDiffEntry[],
  divergences: ParityDivergence[],
  imageWidth: number,
  imageHeight: number,
): { hotRegions: HotRegion[]; elementDiffs: ElementDiffEntry[] } {
  const divergenceBoxes = divergences.map((d) => d.box).filter((b): b is ElementBox => !!b);
  if (divergenceBoxes.length === 0) return { hotRegions, elementDiffs };

  const keptHotRegions = hotRegions.filter((r) => {
    const box: ElementBox = {
      x: (r.xPct / 100) * imageWidth,
      y: (r.yPct / 100) * imageHeight,
      width: (r.wPct / 100) * imageWidth,
      height: (r.hPct / 100) * imageHeight,
    };
    return !divergenceBoxes.some((d) => boxesIntersect(box, d));
  });

  const keptElementDiffs = elementDiffs.filter((e) => {
    const box = e.refBox ?? e.targetBox;
    if (!box) return true;
    return !divergenceBoxes.some((d) => boxesIntersect(box, d));
  });

  return { hotRegions: keptHotRegions, elementDiffs: keptElementDiffs };
}

/** Human-readable one-liner describing an overlay divergence, for error messages / prompts. */
export function describeDivergence(d: ParityDivergence): string {
  if (d.kind === 'overlay') {
    return `оверлей ${d.label}: референс=${d.reference === 'open' ? 'открыт' : 'закрыт'}, цель=${d.target === 'open' ? 'открыт' : 'закрыт'}`;
  }
  if (d.kind === 'assertion') return `assertion ${d.label}: референс=${String(d.reference)}, цель=${String(d.target)}`;
  if (d.kind === 'route') return `route.${d.label}: референс=${String(d.reference)}, цель=${String(d.target)}`;
  return `scroll: референс=${String(d.reference)}px, цель=${String(d.target)}px`;
}
