import type { Page } from 'playwright';
import type {
  DesignSnapshot,
  ElementDiffEntry,
  ElementStyleDelta,
  GeometryDelta,
  LayoutLandmark,
  PaletteEntry,
  RawElementInfo,
  SpacingEntry,
  StyleDiffEntry,
  TypographyEntry,
} from './types.js';

const TYPOGRAPHY_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button'];
const LANDMARK_TAGS = ['header', 'nav', 'main', 'footer', 'section'];
// Feature 2: tags always captured as "significant" elements regardless of
// their own text length (headings/interactive/media/landmarks); anything
// else is captured only if it's a text leaf with non-trivial visible text.
const STRUCTURAL_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button', 'img', 'input', ...LANDMARK_TAGS];
const PALETTE_TOP_N = 8;
const SPACING_TOP_N = 10;
const LAYOUT_EPSILON_PX = 2;
const MAX_CAPTURED_ELEMENTS = 500;
// shortcut: 8 chars is a heuristic floor for "non-trivial visible text" on
// leaf (non-structural) elements — short enough to catch brand names like
// "Target Inc." (11 chars), high enough to skip icon-only labels like "OK".
const LEAF_TEXT_MIN_LENGTH = 8;

interface RawSnapshot {
  colorCounts: [string, number][];
  bgCounts: [string, number][];
  marginCounts: [string, number][];
  paddingCounts: [string, number][];
  typography: TypographyEntry[];
  layout: LayoutLandmark[];
  elements: RawElementInfo[];
}

// shortcut: tsx's esbuild transform runs with `keepNames: true`, which wraps
// every named function/const-arrow binding in a `__name(fn, "name")` call.
// The `__name` helper itself is hoisted to the top of the *module*, but
// Playwright serializes a page.evaluate() closure by extracting only that
// closure's own source via `.toString()` — so any named helper declared
// *inside* the closure loses its `__name` definition and throws
// "ReferenceError: __name is not defined" at runtime in the browser.
// Anonymous inline callbacks (e.g. `.map(x => ...)`) are unaffected because
// they're never bound to a name. To dodge this, the in-browser closure below
// only does a flat DOM walk with inline conditionals/loops (no named
// sub-functions); ranking, hex-conversion, key-building, matching, and
// diffing all happen afterwards in plain Node code (this file, below),
// which runs as normal module code and never gets toString()-extracted.
async function captureRawSnapshot(
  page: Page,
  typographyTags: string[],
  landmarkTags: string[],
  structuralTags: string[],
): Promise<RawSnapshot> {
  return page.evaluate(
    ({ typographyTags, landmarkTags, structuralTags, maxElements, leafTextMinLength }) => {
      const colorCounts = new Map<string, number>();
      const bgCounts = new Map<string, number>();
      const marginCounts = new Map<string, number>();
      const paddingCounts = new Map<string, number>();
      const typography: { tag: string; fontFamily: string; fontSize: string; fontWeight: string; lineHeight: string }[] =
        [];
      const layout: { tag: string; x: number; y: number; width: number; height: number }[] = [];
      const elements: {
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
      }[] = [];

      const structuralTagSet = new Set(structuralTags);
      const landmarkTagSet = new Set(landmarkTags);

      const allEls = Array.from(document.querySelectorAll<HTMLElement>('body *'));
      for (const el of allEls) {
        const cs = window.getComputedStyle(el);
        const color = cs.color;
        const bg = cs.backgroundColor;
        if (color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)') {
          colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
        }
        if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
          bgCounts.set(bg, (bgCounts.get(bg) ?? 0) + 1);
        }

        const margin = cs.margin;
        const padding = cs.padding;
        if (margin && margin !== '0px') marginCounts.set(margin, (marginCounts.get(margin) ?? 0) + 1);
        if (padding && padding !== '0px') paddingCounts.set(padding, (paddingCounts.get(padding) ?? 0) + 1);

        // Feature 2: significant-element collection (flat, inline only).
        if (elements.length < maxElements && cs.display !== 'none' && cs.visibility !== 'hidden') {
          const tag = el.tagName.toLowerCase();
          const isStructural = structuralTagSet.has(tag);
          const ownTextRaw = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
          const isLeafTextCandidate = !isStructural && el.children.length === 0 && ownTextRaw.length >= leafTextMinLength;

          if (isStructural || isLeafTextCandidate) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              let nthOfType = 1;
              let sib: Element | null = el.previousElementSibling;
              while (sib) {
                if (sib.tagName === el.tagName) nthOfType++;
                sib = sib.previousElementSibling;
              }

              const idPart = el.id ? `#${el.id}` : '';
              const classPart =
                typeof el.className === 'string' && el.className.trim()
                  ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                  : '';
              const parentTag = el.parentElement ? el.parentElement.tagName.toLowerCase() : '';
              const cssPath = `${parentTag}>${tag}${idPart}${classPart}`;

              let text = '';
              if (landmarkTagSet.has(tag)) {
                text = '';
              } else if (tag === 'img') {
                text = el.getAttribute('alt') ?? '';
              } else if (tag === 'input') {
                text =
                  (el as HTMLInputElement).placeholder || (el as HTMLInputElement).value || el.getAttribute('name') || '';
              } else {
                text = ownTextRaw.slice(0, 120);
              }

              elements.push({
                tag,
                role: el.getAttribute('role') ?? '',
                text,
                nthOfType,
                cssPath,
                x: Math.round(rect.x + window.scrollX),
                y: Math.round(rect.y + window.scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                color: cs.color,
                backgroundColor: cs.backgroundColor,
                fontFamily: cs.fontFamily,
                fontSize: cs.fontSize,
                fontWeight: cs.fontWeight,
                lineHeight: cs.lineHeight,
                padding: cs.padding,
                margin: cs.margin,
                borderRadius: cs.borderRadius,
                textAlign: cs.textAlign,
              });
            }
          }
        }
      }

      for (const tag of typographyTags) {
        const el = document.querySelector<HTMLElement>(tag);
        if (!el) continue;
        const cs = window.getComputedStyle(el);
        typography.push({
          tag,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          lineHeight: cs.lineHeight,
        });
      }

      for (const tag of landmarkTags) {
        const el = document.querySelector<HTMLElement>(tag);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        layout.push({
          tag,
          x: Math.round(rect.x),
          y: Math.round(rect.y + window.scrollY),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }

      return {
        colorCounts: Array.from(colorCounts.entries()),
        bgCounts: Array.from(bgCounts.entries()),
        marginCounts: Array.from(marginCounts.entries()),
        paddingCounts: Array.from(paddingCounts.entries()),
        typography,
        layout,
        elements,
      };
    },
    { typographyTags, landmarkTags, structuralTags, maxElements: MAX_CAPTURED_ELEMENTS, leafTextMinLength: LEAF_TEXT_MIN_LENGTH },
  );
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (!m) return rgb;
  const toHex = (n: string) => Number(n).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`.toUpperCase();
}

function topNEntries(entries: [string, number][], n: number): [string, number][] {
  return [...entries].sort((a, b) => b[1] - a[1]).slice(0, n);
}

/**
 * Captures a coarse "design snapshot" of the current page: dominant colors,
 * typography per landmark tag, spacing tallies, layout landmark boxes, and
 * (Feature 2) per-element geometry+style info for significant elements.
 *
 * shortcut: naive DOM-wide frequency tally (by element count, not rendered
 * area) instead of a full CSSOM/visual-weight analysis — good enough for
 * coarse url<->url diffing; upgrade to area-weighted tallying if precision
 * on low-frequency-but-large elements (e.g. hero banners) matters.
 */
export async function captureDesignSnapshot(page: Page): Promise<DesignSnapshot> {
  const raw = await captureRawSnapshot(page, TYPOGRAPHY_TAGS, LANDMARK_TAGS, STRUCTURAL_TAGS);

  const palette: PaletteEntry[] = [
    ...topNEntries(raw.colorCounts, PALETTE_TOP_N).map(([value, count]) => ({
      value: rgbToHex(value),
      count,
      kind: 'color' as const,
    })),
    ...topNEntries(raw.bgCounts, PALETTE_TOP_N).map(([value, count]) => ({
      value: rgbToHex(value),
      count,
      kind: 'background-color' as const,
    })),
  ];

  const spacing: SpacingEntry[] = [
    ...topNEntries(raw.marginCounts, SPACING_TOP_N).map(([value, count]) => ({ value, count, kind: 'margin' as const })),
    ...topNEntries(raw.paddingCounts, SPACING_TOP_N).map(([value, count]) => ({
      value,
      count,
      kind: 'padding' as const,
    })),
  ];

  return {
    palette,
    typography: raw.typography,
    spacing,
    layout: raw.layout,
    elements: raw.elements,
  };
}

function byKind<T extends { kind: string }>(entries: T[], kind: string): T[] {
  return entries.filter((e) => e.kind === kind);
}

const PALETTE_RANK_LABELS_TEXT = ['основной цвет текста', 'вторичный цвет текста'];
const PALETTE_RANK_LABELS_BG = ['основной фон', 'вторичный фон (акцент)'];

function paletteLabel(kind: 'color' | 'background-color', rank: number): string {
  const labels = kind === 'color' ? PALETTE_RANK_LABELS_TEXT : PALETTE_RANK_LABELS_BG;
  if (rank < labels.length) return labels[rank];
  return kind === 'color' ? `цвет текста #${rank + 1}` : `фон #${rank + 1}`;
}

function diffPalette(ref: PaletteEntry[], target: PaletteEntry[]): StyleDiffEntry[] {
  const out: StyleDiffEntry[] = [];
  for (const kind of ['color', 'background-color'] as const) {
    const refList = byKind(ref, kind);
    const targetList = byKind(target, kind);
    const n = Math.min(refList.length, targetList.length);
    for (let i = 0; i < n; i++) {
      if (refList[i].value !== targetList[i].value) {
        out.push({
          category: 'color',
          label: paletteLabel(kind, i),
          reference: refList[i].value,
          target: targetList[i].value,
        });
      }
    }
  }
  return out;
}

function diffTypography(ref: TypographyEntry[], target: TypographyEntry[]): StyleDiffEntry[] {
  const out: StyleDiffEntry[] = [];
  const targetByTag = new Map(target.map((t) => [t.tag, t]));
  for (const r of ref) {
    const t = targetByTag.get(r.tag);
    if (!t) continue;
    if (r.fontFamily !== t.fontFamily) {
      out.push({ category: 'typography', label: `${r.tag} font-family`, reference: r.fontFamily, target: t.fontFamily });
    }
    if (r.fontSize !== t.fontSize) {
      out.push({ category: 'typography', label: `${r.tag} font-size`, reference: r.fontSize, target: t.fontSize });
    }
    if (r.fontWeight !== t.fontWeight) {
      out.push({ category: 'typography', label: `${r.tag} font-weight`, reference: r.fontWeight, target: t.fontWeight });
    }
    if (r.lineHeight !== t.lineHeight) {
      out.push({ category: 'typography', label: `${r.tag} line-height`, reference: r.lineHeight, target: t.lineHeight });
    }
  }
  return out;
}

function diffSpacing(ref: SpacingEntry[], target: SpacingEntry[]): StyleDiffEntry[] {
  const out: StyleDiffEntry[] = [];
  for (const kind of ['margin', 'padding'] as const) {
    const refList = byKind(ref, kind);
    const targetList = byKind(target, kind);
    const n = Math.min(refList.length, targetList.length);
    for (let i = 0; i < n; i++) {
      if (refList[i].value !== targetList[i].value) {
        out.push({
          category: 'spacing',
          label: `${kind} #${i + 1}`,
          reference: refList[i].value,
          target: targetList[i].value,
        });
      }
    }
  }
  return out;
}

function diffLayout(ref: LayoutLandmark[], target: LayoutLandmark[]): StyleDiffEntry[] {
  const out: StyleDiffEntry[] = [];
  const targetByTag = new Map(target.map((t) => [t.tag, t]));
  for (const r of ref) {
    const t = targetByTag.get(r.tag);
    if (!t) continue;
    (['x', 'y', 'width', 'height'] as const).forEach((field) => {
      if (Math.abs(r[field] - t[field]) > LAYOUT_EPSILON_PX) {
        out.push({ category: 'layout', label: `${r.tag} ${field}`, reference: r[field], target: t[field] });
      }
    });
  }
  return out;
}

export function diffDesignSnapshots(ref: DesignSnapshot, target: DesignSnapshot): StyleDiffEntry[] {
  return [
    ...diffPalette(ref.palette, target.palette),
    ...diffTypography(ref.typography, target.typography),
    ...diffSpacing(ref.spacing, target.spacing),
    ...diffLayout(ref.layout, target.layout),
  ];
}

// --- Feature 2: per-element structured diff --------------------------------

const GEOMETRY_EPSILON_PX = 3;
const STYLE_PROPS: (keyof RawElementInfo)[] = [
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'padding',
  'margin',
  'borderRadius',
  'textAlign',
];
const STYLE_PROP_LABELS: Record<string, string> = {
  color: 'color',
  backgroundColor: 'background-color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  lineHeight: 'line-height',
  padding: 'padding',
  margin: 'margin',
  borderRadius: 'border-radius',
  textAlign: 'text-align',
};
// shortcut: matching is O(n*m) greedy nearest-neighbour with a text-similarity
// fallback — fine for typical significant-element counts (<500 per side,
// capped above); would need an index (e.g. by tag) for very large DOMs.
const TEXT_SIMILARITY_THRESHOLD = 0.5;

function normalizedText(text: string): string {
  return text.toLowerCase().trim();
}

function elementKey(el: RawElementInfo): string {
  const textPart = normalizedText(el.text).slice(0, 40);
  return `${el.tag}|${el.role}|${textPart}|${el.nthOfType}|${el.cssPath}`;
}

function elementLabel(el: RawElementInfo): string {
  const text = normalizedText(el.text);
  if (text) {
    const truncated = el.text.trim().slice(0, 40);
    return `<${el.tag}> «${truncated}${el.text.trim().length > 40 ? '…' : ''}»`;
  }
  if (el.role) return `<${el.tag} role="${el.role}">`;
  return `<${el.tag}> (${el.cssPath})`;
}

/** Levenshtein-distance-based similarity in [0,1]; 1 = identical strings. */
function textSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const m = a.length;
  const n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prevDiag : 1 + Math.min(prevDiag, dp[j], dp[j - 1]);
      prevDiag = temp;
    }
  }
  const distance = dp[n];
  return 1 - distance / Math.max(m, n);
}

interface MatchedPair {
  ref: RawElementInfo;
  target: RawElementInfo;
}

/**
 * Matches reference<->target significant elements: (1) exact normalized-text
 * equality within the same tag, (2) best text-similarity above threshold
 * within the same tag, (3) structural fallback by tag+role+nth-of-type order.
 * Returns matched pairs plus the leftover ref-only ("missing") and
 * target-only ("extra") elements.
 */
function matchElements(
  ref: RawElementInfo[],
  target: RawElementInfo[],
): { matched: MatchedPair[]; missing: RawElementInfo[]; extra: RawElementInfo[] } {
  const remainingTarget = [...target];
  const matched: MatchedPair[] = [];
  const unmatchedRef: RawElementInfo[] = [];

  // Pass 1: exact normalized-text match within the same tag (text non-empty).
  for (const r of ref) {
    const rText = normalizedText(r.text);
    if (!rText) {
      unmatchedRef.push(r);
      continue;
    }
    const idx = remainingTarget.findIndex((t) => t.tag === r.tag && normalizedText(t.text) === rText);
    if (idx >= 0) {
      matched.push({ ref: r, target: remainingTarget[idx] });
      remainingTarget.splice(idx, 1);
    } else {
      unmatchedRef.push(r);
    }
  }

  // Pass 2: best text-similarity match within the same tag, above threshold.
  const stillUnmatchedRef: RawElementInfo[] = [];
  for (const r of unmatchedRef) {
    const rText = normalizedText(r.text);
    if (!rText) {
      stillUnmatchedRef.push(r);
      continue;
    }
    let bestIdx = -1;
    let bestScore = TEXT_SIMILARITY_THRESHOLD;
    for (let i = 0; i < remainingTarget.length; i++) {
      const t = remainingTarget[i];
      if (t.tag !== r.tag) continue;
      const score = textSimilarity(rText, normalizedText(t.text));
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      matched.push({ ref: r, target: remainingTarget[bestIdx] });
      remainingTarget.splice(bestIdx, 1);
    } else {
      stillUnmatchedRef.push(r);
    }
  }

  // Pass 3: structural fallback — same tag + role + nth-of-type.
  const finalUnmatchedRef: RawElementInfo[] = [];
  for (const r of stillUnmatchedRef) {
    const idx = remainingTarget.findIndex((t) => t.tag === r.tag && t.role === r.role && t.nthOfType === r.nthOfType);
    if (idx >= 0) {
      matched.push({ ref: r, target: remainingTarget[idx] });
      remainingTarget.splice(idx, 1);
    } else {
      finalUnmatchedRef.push(r);
    }
  }

  return { matched, missing: finalUnmatchedRef, extra: remainingTarget };
}

function computeGeometryDelta(ref: RawElementInfo, target: RawElementInfo): GeometryDelta {
  const dx = target.x - ref.x;
  const dy = target.y - ref.y;
  const dw = target.width - ref.width;
  const dh = target.height - ref.height;
  const significant =
    Math.abs(dx) > GEOMETRY_EPSILON_PX ||
    Math.abs(dy) > GEOMETRY_EPSILON_PX ||
    Math.abs(dw) > GEOMETRY_EPSILON_PX ||
    Math.abs(dh) > GEOMETRY_EPSILON_PX;
  return { dx, dy, dw, dh, significant };
}

function computeStyleDeltas(ref: RawElementInfo, target: RawElementInfo): ElementStyleDelta[] {
  const out: ElementStyleDelta[] = [];
  for (const prop of STYLE_PROPS) {
    const refVal = String(ref[prop]);
    const targetVal = String(target[prop]);
    if (refVal !== targetVal) {
      out.push({ prop: STYLE_PROP_LABELS[prop] ?? String(prop), reference: refVal, target: targetVal });
    }
  }
  return out;
}

/**
 * Feature 2: per-element structured diff between two DesignSnapshots
 * (url<->url only). Produces surgical entries for matched elements that
 * actually differ (geometry and/or style), plus all missing/extra elements.
 */
export function diffElements(ref: DesignSnapshot, target: DesignSnapshot): ElementDiffEntry[] {
  const { matched, missing, extra } = matchElements(ref.elements, target.elements);
  const out: ElementDiffEntry[] = [];

  for (const { ref: r, target: t } of matched) {
    const geometryDelta = computeGeometryDelta(r, t);
    const styleDeltas = computeStyleDeltas(r, t);
    if (!geometryDelta.significant && styleDeltas.length === 0) continue;
    out.push({
      key: elementKey(r),
      label: elementLabel(r),
      status: 'matched',
      geometryDelta,
      styleDeltas,
      refBox: { x: r.x, y: r.y, width: r.width, height: r.height },
      targetBox: { x: t.x, y: t.y, width: t.width, height: t.height },
    });
  }

  for (const r of missing) {
    out.push({
      key: elementKey(r),
      label: elementLabel(r),
      status: 'missing',
      styleDeltas: [],
      refBox: { x: r.x, y: r.y, width: r.width, height: r.height },
    });
  }

  for (const t of extra) {
    out.push({
      key: elementKey(t),
      label: elementLabel(t),
      status: 'extra',
      styleDeltas: [],
      targetBox: { x: t.x, y: t.y, width: t.width, height: t.height },
    });
  }

  // Surface the most impactful differences first: missing/extra (structural)
  // before matched, then by number of style deltas + geometry significance.
  const severity = (e: ElementDiffEntry): number =>
    (e.status !== 'matched' ? 1000 : 0) + e.styleDeltas.length * 2 + (e.geometryDelta?.significant ? 3 : 0);
  out.sort((a, b) => severity(b) - severity(a));

  return out;
}
