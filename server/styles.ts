import type { Page } from 'playwright';
import type {
  DesignSnapshot,
  LayoutLandmark,
  PaletteEntry,
  SpacingEntry,
  StyleDiffEntry,
  TypographyEntry,
} from './types.js';

const TYPOGRAPHY_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'button'];
const LANDMARK_TAGS = ['header', 'nav', 'main', 'footer', 'section'];
const PALETTE_TOP_N = 8;
const SPACING_TOP_N = 10;
const LAYOUT_EPSILON_PX = 2;

interface RawSnapshot {
  colorCounts: [string, number][];
  bgCounts: [string, number][];
  marginCounts: [string, number][];
  paddingCounts: [string, number][];
  typography: TypographyEntry[];
  layout: LayoutLandmark[];
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
// sub-functions); ranking, hex-conversion, and top-N slicing happen
// afterwards in plain Node code (rgbToHexList/topNEntries below), which
// runs as normal module code and never gets toString()-extracted.
async function captureRawSnapshot(
  page: Page,
  typographyTags: string[],
  landmarkTags: string[],
): Promise<RawSnapshot> {
  return page.evaluate(
    ({ typographyTags, landmarkTags }) => {
      const colorCounts = new Map<string, number>();
      const bgCounts = new Map<string, number>();
      const marginCounts = new Map<string, number>();
      const paddingCounts = new Map<string, number>();
      const typography: { tag: string; fontFamily: string; fontSize: string; fontWeight: string; lineHeight: string }[] =
        [];
      const layout: { tag: string; x: number; y: number; width: number; height: number }[] = [];

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
      };
    },
    { typographyTags, landmarkTags },
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
 * typography per landmark tag, spacing tallies, and layout landmark boxes.
 *
 * shortcut: naive DOM-wide frequency tally (by element count, not rendered
 * area) instead of a full CSSOM/visual-weight analysis — good enough for
 * coarse url<->url diffing; upgrade to area-weighted tallying if precision
 * on low-frequency-but-large elements (e.g. hero banners) matters.
 */
export async function captureDesignSnapshot(page: Page): Promise<DesignSnapshot> {
  const raw = await captureRawSnapshot(page, TYPOGRAPHY_TAGS, LANDMARK_TAGS);

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
