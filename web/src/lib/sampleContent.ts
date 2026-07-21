// Verbatim sample content for the idle/results demo — ported from the design
// handoff README "Sample content" section (no lorem). Used to drive the
// hi-fi visual mock (Landing boards + pins + inspector) whenever no real
// compare has completed yet; once a real POST /api/compare result exists,
// the console switches to rendering that instead (see useConsoleState).

import type { ElementDiffEntry } from '../types';

export type Breakpoint = 1440 | 1024 | 768 | 390;
export const BREAKPOINTS: Breakpoint[] = [1440, 1024, 768, 390];

/** Sample per-breakpoint scores (percent), matched to a.html vs b.html. */
export const SAMPLE_SCORES: Record<Breakpoint, number> = { 1440: 79, 1024: 78, 768: 77, 390: 72 };

export const SAMPLE_AVG_SCORE = 76;
export const SAMPLE_WORST_BP: Breakpoint = 390;

export const BOARD_H = 720;
export const BOARD_GAP = 150;

export type DiffKind = 'diff' | 'miss' | 'extra';

export const KIND_META: Record<DiffKind, { color: string; soft: string; label: string }> = {
  diff: { color: 'var(--red)', soft: 'var(--red-soft)', label: 'расхождение' },
  miss: { color: 'var(--amber)', soft: 'var(--amber-soft)', label: 'отсутствует' },
  extra: { color: 'var(--info)', soft: 'var(--info-soft)', label: 'лишний' },
};

export interface SampleRegionRow {
  k: string;
  a: string;
  b: string;
  /** Swatch colors — only present for color-valued rows. */
  ca?: string;
  cb?: string;
}

export interface SampleRegion {
  /** Fractional box [0..1] over the target render area. */
  l: number;
  t: number;
  w: number;
  h: number;
  kind: DiffKind;
  sel: string;
  title: string;
  rows: SampleRegionRow[];
  /**
   * Set only for real (non-sample) regions — the exact backend
   * ElementDiffEntry this pin represents. Lets the point-prompt builder
   * (lib/pointPrompt.ts) emit a surgical, server-consistent instruction
   * instead of falling back to samplePointPrompt()'s demo text. Always
   * undefined for the sample/demo regions below.
   */
  sourceEntry?: ElementDiffEntry;
}

/** World-space element diffs, as fractions of the target board's render area. */
export const SAMPLE_REGIONS: SampleRegion[] = [
  {
    l: 0.04,
    t: 0.25,
    w: 0.5,
    h: 0.13,
    kind: 'diff',
    sel: '<h1>',
    title: '«Дизайн, который продаёт»',
    rows: [
      { k: 'font-family', a: 'Georgia', b: 'Arial' },
      { k: 'font-size', a: '48px', b: '32px' },
      { k: 'сдвиг', a: '+16px', b: '−32px' },
    ],
  },
  {
    l: 0.04,
    t: 0.515,
    w: 0.19,
    h: 0.075,
    kind: 'diff',
    sel: '<a> CTA',
    title: '«Начать бесплатно»',
    rows: [
      { k: 'background', a: '#0F62FE', b: '#E63946', ca: '#0F62FE', cb: '#E63946' },
      { k: 'padding', a: '14/32', b: '10/18' },
    ],
  },
  {
    l: 0.6,
    t: 0.2,
    w: 0.34,
    h: 0.37,
    kind: 'miss',
    sel: '<img>',
    title: 'hero-иллюстрация',
    rows: [{ k: 'статус', a: 'есть в ref', b: 'нет в target' }],
  },
  {
    l: 0.04,
    t: 0.125,
    w: 0.15,
    h: 0.055,
    kind: 'extra',
    sel: '.promo-badge',
    title: 'бейдж акции',
    rows: [{ k: 'статус', a: 'нет в ref', b: 'есть в target' }],
  },
];

export interface SampleElementDiff {
  tag: string;
  text: string;
  kind: DiffKind;
  props: [string, string, string][];
}

export const SAMPLE_ELEMENT_DIFFS: SampleElementDiff[] = [
  {
    tag: '<h1>',
    text: '«Дизайн, который продаёт»',
    kind: 'diff',
    props: [
      ['font-family', 'Georgia', 'Arial'],
      ['font-size', '48px', '32px'],
      ['сдвиг', '+16px', '−32px'],
    ],
  },
  {
    tag: '<a>',
    text: '«Начать бесплатно»',
    kind: 'diff',
    props: [
      ['background', '#0F62FE', '#E63946'],
      ['padding', '14px 32px', '10px 18px'],
    ],
  },
  { tag: '<img>', text: 'hero-иллюстрация', kind: 'miss', props: [['статус', 'есть в ref', 'нет в target']] },
  { tag: '<div>', text: '.promo-badge', kind: 'extra', props: [['статус', 'нет в ref', 'есть в target']] },
];

export interface SampleStyleGroup {
  name: string;
  rows: { k: string; a: string; b: string }[];
}

export const SAMPLE_STYLE_GROUPS: Record<'color' | 'typography' | 'spacing' | 'layout', SampleStyleGroup> = {
  color: { name: 'Цвета', rows: [{ k: 'accent bg', a: '#0F62FE', b: '#E63946' }] },
  typography: {
    name: 'Типографика',
    rows: [
      { k: 'h1 font', a: 'Georgia', b: 'Arial' },
      { k: 'h1 size', a: '48px', b: '32px' },
    ],
  },
  spacing: { name: 'Отступы', rows: [{ k: '.cta padding', a: '14px 32px', b: '10px 18px' }] },
  layout: {
    name: 'Layout',
    rows: [
      { k: 'max-width', a: '1200px', b: '1080px' },
      { k: 'h1 offset', a: '0', b: '+16 / −32' },
    ],
  },
};

export const SAMPLE_RECENT_PAIRS = [
  'a.html ⇄ b.html',
  'stripe.com ⇄ localhost:3000',
  'Figma: Hero v4 ⇄ /landing',
  'shot-042.png ⇄ /pricing',
];

export function samplePointPrompt(region: SampleRegion): string {
  const lines = region.rows.map((r) => `   ${r.k}: ${r.a} (was ${r.b})`).join('\n');
  return `Fix ${region.sel} ${region.title} in b.html to match a.html:\n${lines}`;
}

export const SAMPLE_PROMPT = `You are a senior frontend engineer. Fix the CSS/markup so the implemented site (b.html) matches the reference design (a.html).

Worst breakpoint: 390px · match 72%.

1. <h1> «Дизайн, который продаёт»
   font-family: Georgia (was Arial)
   font-size: 48px (was 32px); shift +16px / −32px
2. <a> «Начать бесплатно»
   background: rgb(15,98,254) (was rgb(230,57,70))
   padding: 14px 32px (was 10px 18px)
3. Accent secondary bg: #0F62FE (was #E63946)
4. Container max-width: 1200px (was 1080px)

Keep responsive behaviour intact across 1440/1024/768/390.`;

/** Score bands: green >=95% · amber 85-95% · red <85%. */
export function scoreColorVar(score: number): string {
  if (score >= 95) return 'var(--green)';
  if (score >= 85) return 'var(--amber)';
  return 'var(--red)';
}

export type ScoreBand = 'good' | 'warn' | 'bad';

export function scoreBand(score: number): ScoreBand {
  if (score >= 95) return 'good';
  if (score >= 85) return 'warn';
  return 'bad';
}
