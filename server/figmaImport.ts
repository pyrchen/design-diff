// Figma import: a full Figma frame -> a real, openable HTML+CSS preview +
// a deterministic step-by-step implementation prompt + a flat per-block
// list (for surgical per-block prompts on the client). Feature 4.
//
// The ONLY network call this module makes is to Figma's REST API
// (api.figma.com) using the caller-supplied token (resolved the same way as
// the existing figma-as-reference-image feature — see server/index.ts
// POST /api/figma/import). No Claude/Anthropic call of any kind — the
// "implementation prompt" below is built by plain string templating, not by
// asking any model to write it (mirrors server/prompt.ts's own approach for
// the compare feature's claudePrompt).
//
// Reuses server/figma.ts's URL parser (parseFigmaUrl) and first-top-level-
// frame fallback (resolveFirstTopLevelFrameId) rather than re-implementing
// either, and reuses its FigmaConfigError/FigmaApiError classes so
// server/index.ts can handle both features' errors identically.
//
// Figma REST API shapes below were confirmed against the official spec
// (github.com/figma/rest-api-spec, dist/api_types.ts — Paint, Effect,
// TypeStyle, HasFramePropertiesTrait) and developers.figma.com/docs/rest-api
// (file/nodes + images endpoints) on 2026-07-21. Only the fields this
// module actually reads are declared — Figma's real payloads carry many
// more.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseFigmaUrl, resolveFirstTopLevelFrameId, buildAuthHeaders, FigmaConfigError, FigmaApiError } from './figma.js';

// === Figma REST API response shapes (subset used here) =====================

export interface FigmaColor {
  r: number; // 0..1
  g: number;
  b: number;
  a: number;
}

export interface FigmaPaint {
  type: string; // 'SOLID' | 'IMAGE' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | ...
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor; // SOLID
  imageRef?: string; // IMAGE
}

export interface FigmaEffect {
  type: string; // 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

export interface FigmaTypeStyle {
  fontFamily?: string;
  fontWeight?: number;
  fontSize?: number;
  lineHeightPx?: number;
  textAlignHorizontal?: string; // 'LEFT' | 'RIGHT' | 'CENTER' | 'JUSTIFIED'
}

export interface FigmaRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Only the fields nodeTreeToBlockTree() reads — real Figma nodes carry many more. */
export interface FigmaNode {
  id: string;
  name: string;
  type: string; // FRAME | GROUP | COMPONENT | COMPONENT_SET | INSTANCE | TEXT | RECTANGLE | VECTOR | LINE | ELLIPSE | ...
  visible?: boolean; // default true
  opacity?: number; // default 1
  absoluteBoundingBox?: FigmaRect | null;
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: FigmaEffect[];
  // HasFramePropertiesTrait (auto-layout) — only meaningful on FRAME/GROUP/COMPONENT/INSTANCE.
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL' | 'GRID';
  primaryAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
  counterAxisAlignItems?: 'MIN' | 'CENTER' | 'MAX' | 'BASELINE';
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  // TypePropertiesTrait (TEXT nodes only).
  characters?: string;
  style?: FigmaTypeStyle;
  children?: FigmaNode[];
}

interface FigmaNodesResponse {
  err?: string;
  nodes?: Record<string, { document?: FigmaNode } | null>;
}

interface FigmaImagesResponse {
  err?: string | null;
  images?: Record<string, string | null>;
}

// === Block tree (the transform's output shape) ==============================

export type FigmaBlockKind = 'frame' | 'text' | 'image' | 'shape';

export interface FigmaBlockLayout {
  /** How THIS block lays out its own children — flex (Figma auto-layout) or absolute (everything else, incl. plain GROUPs). */
  childrenMode: 'flex' | 'absolute';
  direction?: 'row' | 'column'; // only when childrenMode === 'flex'
  gap?: number;
  justifyContent?: string;
  alignItems?: string;
  padding?: { top: number; right: number; bottom: number; left: number };
}

/** This block's own box, in px, relative to its PARENT's origin (the root's is always {x:0,y:0}). */
export interface FigmaBlockPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FigmaBlock {
  id: string;
  name: string;
  kind: FigmaBlockKind;
  /** Visual CSS declarations (background/color/border/box-shadow/border-radius/opacity/font-*) — NOT layout/position, those are separate below. */
  styles: Record<string, string>;
  layout: FigmaBlockLayout;
  position: FigmaBlockPosition;
  text?: string;
  /** True when this node's own fill is an image — the exported PNG is looked up by this block's `id` in the imageMap passed to blockTreeToHtml/buildBlockSummaries. */
  imageFill?: boolean;
  children: FigmaBlock[];
}

/** Flat, doc-order (pre-order) entry for one block — what the client needs to build a surgical per-block prompt without re-walking the tree. */
export interface FigmaBlockSummary {
  id: string;
  /** Stable, deterministic — `[data-block-id="..."]`, keyed to the `data-block-id` attribute blockTreeToHtml() stamps on every element. Never a positional (nth-child) path, so it doesn't shift if sibling blocks are added/removed. */
  selector: string;
  description: string;
  /** The exact, final CSS declaration set used to render this block (layout + visual merged) — copy-pasteable. */
  styleSet: Record<string, string>;
  text?: string;
}

export interface FigmaImportResult {
  previewUrl: string;
  blockTree: FigmaBlock;
  html: string;
  steps: string;
  blocks: FigmaBlockSummary[];
}

// === Color / string helpers ==================================================

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function figmaColorToCss(c: FigmaColor, opacityOverride?: number): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  const a = opacityOverride !== undefined ? opacityOverride : c.a;
  return a < 1 ? `rgba(${r}, ${g}, ${b}, ${round2(a)})` : `rgb(${r}, ${g}, ${b})`;
}

const TEXT_ALIGN_MAP: Record<string, string> = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', JUSTIFIED: 'justify' };
const JUSTIFY_MAP: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', SPACE_BETWEEN: 'space-between' };
const ALIGN_MAP: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', BASELINE: 'baseline' };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// === node tree -> block tree =================================================

const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

function firstVisiblePaint(paints: FigmaPaint[] | undefined, type: string): FigmaPaint | undefined {
  return paints?.find((p) => p.type === type && p.visible !== false);
}

function firstVisibleEffect(effects: FigmaEffect[] | undefined, type: string): FigmaEffect | undefined {
  return effects?.find((e) => e.type === type && e.visible !== false);
}

/** Builds one block's visual `styles` (everything except layout/position). */
function buildVisualStyles(node: FigmaNode, kind: FigmaBlockKind): { styles: Record<string, string>; imageFill: boolean } {
  const styles: Record<string, string> = {};
  let imageFill = false;

  const solid = firstVisiblePaint(node.fills, 'SOLID');
  const image = firstVisiblePaint(node.fills, 'IMAGE');
  if (image) {
    // shortcut: the image asset itself is exported by rendering THIS node
    // via GET /v1/images (below), not by resolving the fill's imageRef
    // through /v1/files/:key/images — one endpoint, no separate asset map,
    // fine for MVP fidelity (opaque images only; a node with an IMAGE fill
    // plus a visible text child on top of it is not modeled).
    imageFill = true;
  } else if (solid) {
    const css = figmaColorToCss(solid.color ?? { r: 0, g: 0, b: 0, a: 1 }, solid.opacity);
    if (kind === 'text') styles.color = css;
    else styles.background = css;
  }

  const stroke = firstVisiblePaint(node.strokes, 'SOLID');
  if (stroke) {
    const css = figmaColorToCss(stroke.color ?? { r: 0, g: 0, b: 0, a: 1 }, stroke.opacity);
    styles.border = `${node.strokeWeight ?? 1}px solid ${css}`;
  }

  if (typeof node.cornerRadius === 'number' && node.cornerRadius > 0) {
    styles['border-radius'] = `${node.cornerRadius}px`;
  }

  const shadow = firstVisibleEffect(node.effects, 'DROP_SHADOW');
  if (shadow) {
    const css = figmaColorToCss(shadow.color ?? { r: 0, g: 0, b: 0, a: 0.25 });
    styles['box-shadow'] = `${shadow.offset?.x ?? 0}px ${shadow.offset?.y ?? 0}px ${shadow.radius ?? 0}px ${shadow.spread ?? 0}px ${css}`;
  }

  if (typeof node.opacity === 'number' && node.opacity < 1) {
    styles.opacity = String(round2(node.opacity));
  }

  if (kind === 'text' && node.style) {
    const s = node.style;
    if (s.fontFamily) styles['font-family'] = `'${s.fontFamily}', sans-serif`;
    if (typeof s.fontWeight === 'number') styles['font-weight'] = String(s.fontWeight);
    if (typeof s.fontSize === 'number') styles['font-size'] = `${s.fontSize}px`;
    if (typeof s.lineHeightPx === 'number') styles['line-height'] = `${s.lineHeightPx}px`;
    if (s.textAlignHorizontal) styles['text-align'] = TEXT_ALIGN_MAP[s.textAlignHorizontal] ?? 'left';
  }

  return { styles, imageFill };
}

function classifyKind(node: FigmaNode): FigmaBlockKind {
  if (node.type === 'TEXT') return 'text';
  if (CONTAINER_TYPES.has(node.type)) return 'frame';
  if (firstVisiblePaint(node.fills, 'IMAGE')) return 'image';
  return 'shape'; // RECTANGLE/VECTOR/LINE/ELLIPSE/BOOLEAN_OPERATION/etc. without an image fill
}

function buildLayout(node: FigmaNode, kind: FigmaBlockKind): FigmaBlockLayout {
  if (kind === 'frame' && (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL')) {
    return {
      childrenMode: 'flex',
      direction: node.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
      gap: node.itemSpacing ?? 0,
      justifyContent: node.primaryAxisAlignItems ? JUSTIFY_MAP[node.primaryAxisAlignItems] : undefined,
      alignItems: node.counterAxisAlignItems ? ALIGN_MAP[node.counterAxisAlignItems] : undefined,
      padding: { top: node.paddingTop ?? 0, right: node.paddingRight ?? 0, bottom: node.paddingBottom ?? 0, left: node.paddingLeft ?? 0 },
    };
  }
  // shortcut: GRID auto-layout, constraints-based responsive sizing, and any
  // node without recognized auto-layout all fall back to absolute
  // positioning from absoluteBoundingBox — correct for the imported frame's
  // current size, not responsive. Upgrade path: read `layoutSizingHorizontal`
  // /`constraints` and emit min/max-width or %-based sizing.
  return { childrenMode: 'absolute' };
}

let fallbackIdCounter = 0;

function convertNode(node: FigmaNode, parentBox: FigmaRect | undefined, isRoot: boolean): FigmaBlock {
  const box = node.absoluteBoundingBox ?? { x: parentBox?.x ?? 0, y: parentBox?.y ?? 0, width: 0, height: 0 };
  const position: FigmaBlockPosition = isRoot
    ? { x: 0, y: 0, width: box.width, height: box.height }
    : { x: box.x - (parentBox?.x ?? box.x), y: box.y - (parentBox?.y ?? box.y), width: box.width, height: box.height };

  const kind = classifyKind(node);
  const { styles, imageFill } = buildVisualStyles(node, kind);
  const layout = buildLayout(node, kind);

  const childNodes = (node.children ?? []).filter((c) => c.visible !== false);
  const children = childNodes.map((c) => convertNode(c, box, false));

  // The raw Figma node id (e.g. "1:23") is used verbatim as block.id — it is
  // already unique within the file, and the image-export step (below) needs
  // to hand this exact string back to Figma's /v1/images endpoint, so
  // slugifying it here would silently break that round-trip. A fallback
  // synthetic id only covers the (real-API-never-produces-this) case of a
  // node missing an id.
  fallbackIdCounter += 1;
  const id = node.id && node.id.trim() ? node.id : `n${fallbackIdCounter}`;

  return {
    id,
    name: node.name,
    kind,
    styles,
    layout,
    position,
    text: kind === 'text' ? (node.characters ?? '') : undefined,
    imageFill: imageFill || undefined,
    children,
  };
}

/** Recursive transform: Figma node subtree -> serializable block tree. Pure/deterministic — no I/O. */
export function nodeTreeToBlockTree(node: FigmaNode): { root: FigmaBlock; blocks: FigmaBlock[] } {
  fallbackIdCounter = 0;
  const root = convertNode(node, undefined, true);
  const blocks: FigmaBlock[] = [];
  (function collect(b: FigmaBlock) {
    blocks.push(b);
    for (const c of b.children) collect(c);
  })(root);
  return { root, blocks };
}

// === block tree -> CSS declarations (shared by HTML render + block summaries) ==

function computeBlockStyleMap(
  block: FigmaBlock,
  isRoot: boolean,
  parentMode: 'flex' | 'absolute' | undefined,
  imageMap: Record<string, string>,
): Record<string, string> {
  const css: Record<string, string> = { 'box-sizing': 'border-box' };

  if (isRoot) {
    css.position = 'relative';
    css.width = `${Math.round(block.position.width)}px`;
    css['min-height'] = `${Math.round(block.position.height)}px`;
  } else if (parentMode === 'absolute') {
    css.position = 'absolute';
    css.left = `${Math.round(block.position.x)}px`;
    css.top = `${Math.round(block.position.y)}px`;
    css.width = `${Math.round(block.position.width)}px`;
    css.height = `${Math.round(block.position.height)}px`;
  } else {
    css.width = `${Math.round(block.position.width)}px`;
    css.height = `${Math.round(block.position.height)}px`;
    css['flex-shrink'] = '0';
  }

  // A block whose own children are absolutely positioned needs to itself be
  // a positioning context. It already is one when parentMode==='absolute'
  // (position:absolute above); only the flex-flow case needs an explicit nudge.
  if (!isRoot && block.layout.childrenMode === 'absolute' && block.children.length > 0 && parentMode !== 'absolute') {
    css.position = 'relative';
  }

  if (block.layout.childrenMode === 'flex') {
    css.display = 'flex';
    css['flex-direction'] = block.layout.direction ?? 'row';
    if (block.layout.gap) css.gap = `${block.layout.gap}px`;
    if (block.layout.justifyContent) css['justify-content'] = block.layout.justifyContent;
    if (block.layout.alignItems) css['align-items'] = block.layout.alignItems;
    if (block.layout.padding) {
      const p = block.layout.padding;
      css.padding = `${p.top}px ${p.right}px ${p.bottom}px ${p.left}px`;
    }
  }

  for (const [k, v] of Object.entries(block.styles)) css[k] = v;

  if (block.imageFill && imageMap[block.id]) {
    css['background-image'] = `url('${imageMap[block.id]}')`;
    css['background-size'] = 'cover';
    css['background-position'] = 'center';
  }

  return css;
}

function cssMapToDeclString(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

// === block tree -> HTML ======================================================

function renderBlockHtml(block: FigmaBlock, isRoot: boolean, parentMode: 'flex' | 'absolute' | undefined, imageMap: Record<string, string>): string {
  const css = computeBlockStyleMap(block, isRoot, parentMode, imageMap);
  const style = cssMapToDeclString(css);
  const tag = block.kind === 'text' ? 'p' : 'div';
  const attrs = `class="figma-block" data-block-id="${escapeAttr(block.id)}" data-block-name="${escapeAttr(block.name)}" style="${escapeAttr(style)}"`;

  if (block.kind === 'text') {
    return `<${tag} ${attrs}>${escapeHtml(block.text ?? '')}</${tag}>`;
  }
  const inner = block.children.map((c) => renderBlockHtml(c, false, block.layout.childrenMode, imageMap)).join('\n');
  return `<${tag} ${attrs}>${inner}</${tag}>`;
}

/** Builds a self-contained, openable HTML+inline-CSS page from a block tree — the "working preview". */
export function blockTreeToHtml(root: FigmaBlock, opts: { title: string; imageMap?: Record<string, string> }): string {
  const imageMap = opts.imageMap ?? {};
  const body = renderBlockHtml(root, true, undefined, imageMap);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)}</title>
<style>
  * { margin: 0; padding: 0; }
  html, body { background: #f2f3f5; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; }
  .figma-block { display: block; }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// === block tree -> flat summaries (for the client's per-block prompts) ======

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatBlockDescription(block: FigmaBlock): string {
  const parts: string[] = [];
  parts.push(block.kind);
  parts.push(`${Math.round(block.position.width)}×${Math.round(block.position.height)}px @ (${Math.round(block.position.x)},${Math.round(block.position.y)})`);
  if (block.layout.childrenMode === 'flex') {
    parts.push(`flex ${block.layout.direction}${block.layout.gap ? `, gap ${block.layout.gap}px` : ''}`);
  }
  if (block.styles.background) parts.push(`фон ${block.styles.background}`);
  if (block.styles.color) parts.push(`цвет текста ${block.styles.color}`);
  if (block.styles['border-radius']) parts.push(`radius ${block.styles['border-radius']}`);
  if (block.imageFill) parts.push('изображение (image fill)');
  if (block.text) parts.push(`текст: "${truncate(block.text, 40)}"`);
  return parts.join(', ');
}

/** Flattens the block tree (pre-order, same order the HTML renders it) into the per-block summaries the route returns and the client uses for per-block prompts. */
export function buildBlockSummaries(root: FigmaBlock, imageMap: Record<string, string> = {}): FigmaBlockSummary[] {
  const out: FigmaBlockSummary[] = [];
  function walk(block: FigmaBlock, parentMode: 'flex' | 'absolute' | undefined, isRoot: boolean): void {
    out.push({
      id: block.id,
      selector: `[data-block-id="${block.id}"]`,
      description: formatBlockDescription(block),
      styleSet: computeBlockStyleMap(block, isRoot, parentMode, imageMap),
      text: block.text,
    });
    for (const c of block.children) walk(c, block.layout.childrenMode, false);
  }
  walk(root, undefined, true);
  return out;
}

// === implementation prompt (deterministic, local — no Claude/Anthropic call) ==

/** Direct children only — used to name each top-level "section" step in the plan. */
function flattenAll(block: FigmaBlock): FigmaBlock[] {
  const out: FigmaBlock[] = [block];
  for (const c of block.children) out.push(...flattenAll(c));
  return out;
}

export function buildImplementationPrompt(root: FigmaBlock, blocks: FigmaBlockSummary[], meta: { sourceUrl: string }): string {
  const lines: string[] = [];

  lines.push(
    'You are a senior frontend engineer implementing a design imported from Figma. Build the markup and CSS section by section, top-level frames first, using the exact style values given below — do not guess colors, spacing, or typography.',
  );
  lines.push('');
  lines.push('## Контекст');
  lines.push(`- Источник: Figma (${meta.sourceUrl})`);
  lines.push(`- Корневой фрейм: "${root.name}" — ${Math.round(root.position.width)}×${Math.round(root.position.height)}px`);
  lines.push(`- Блоков всего: ${blocks.length}`);
  lines.push('');

  lines.push('## План реализации (по секциям, сверху вниз)');
  lines.push('');
  lines.push(`1. Корневой контейнер \`[data-block-id="${root.id}"]\` ("${root.name}") — ${formatBlockDescription(root)}`);

  let stepIndex = 2;
  for (const child of root.children) {
    lines.push(`${stepIndex}. Секция \`[data-block-id="${child.id}"]\` ("${child.name}") — ${formatBlockDescription(child)}`);
    const nested = flattenAll(child).slice(1);
    for (const grand of nested) {
      lines.push(`   - \`[data-block-id="${grand.id}"]\` ("${grand.name}"): ${formatBlockDescription(grand)}`);
    }
    stepIndex++;
  }
  lines.push('');

  lines.push('## Полный список блоков (для точечных промптов по каждому блоку)');
  for (const b of blocks) {
    lines.push(`- \`${b.selector}\` — ${b.description}`);
  }
  lines.push('');

  lines.push('## Известные ограничения MVP-конвертации');
  lines.push('- Градиенты, векторные контуры (VECTOR/BOOLEAN_OPERATION детали) и маски не переносятся — только сплошная заливка/обводка/радиус/тень.');
  lines.push('- Раскладка воспроизводит фиксированный размер импортированного фрейма, а не responsive-поведение (constraints/hug/fill не читаются).');
  lines.push('- Изображения внутри узла с IMAGE-заливкой экспортируются как рендер самого узла (не как исходный ассет через imageRef).');

  return lines.join('\n');
}

// === Figma REST fetch (subtree + image export) ===============================

async function fetchNodeSubtree(fileKey: string, nodeId: string, token: string): Promise<FigmaNode> {
  const url = `https://api.figma.com/v1/files/${fileKey}/nodes?${new URLSearchParams({ ids: nodeId }).toString()}`;
  const res = await fetch(url, { headers: buildAuthHeaders(token) });
  if (res.status === 401 || res.status === 403) {
    throw new FigmaConfigError('Figma отклонила токен (401/403). Проверьте, что Figma-токен в Настройках (или FIGMA_TOKEN в .env) актуален и не истёк.');
  }
  if (!res.ok) {
    throw new FigmaApiError(`Не удалось получить узел из Figma (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as FigmaNodesResponse;
  if (json.err) {
    throw new FigmaApiError(`Figma API вернул ошибку: ${json.err}`);
  }
  const entry = json.nodes?.[nodeId];
  if (!entry?.document) {
    throw new FigmaApiError(`Figma не вернула узел для node-id "${nodeId}". Проверьте, что этот узел существует и не был удалён.`);
  }
  return entry.document;
}

function collectImageExportIds(block: FigmaBlock, out: string[]): void {
  if (block.imageFill) out.push(block.id);
  for (const c of block.children) collectImageExportIds(c, out);
}

/**
 * Renders every block whose own fill is an IMAGE paint via GET /v1/images
 * (the node itself, at 2x PNG — block.id IS the raw Figma node id, see
 * convertNode) and downloads each into `<outDir>/images/`. Returns a map of
 * block.id -> path (relative to outDir) suitable for a `url(...)` reference
 * from preview.html sitting alongside it.
 */
async function exportAndDownloadImages(fileKey: string, nodeIds: string[], token: string, outDir: string): Promise<Record<string, string>> {
  if (nodeIds.length === 0) return {};

  const url = `https://api.figma.com/v1/images/${fileKey}?${new URLSearchParams({ ids: nodeIds.join(','), format: 'png', scale: '2' }).toString()}`;
  const res = await fetch(url, { headers: buildAuthHeaders(token) });
  if (res.status === 401 || res.status === 403) {
    throw new FigmaConfigError('Figma отклонила токен при экспорте изображений (401/403).');
  }
  if (!res.ok) {
    throw new FigmaApiError(`Не удалось экспортировать изображения из Figma (HTTP ${res.status}).`);
  }
  const json = (await res.json()) as FigmaImagesResponse;
  if (json.err) {
    // shortcut: an image-export error degrades to "no images" rather than
    // failing the whole import — the preview still renders (background
    // color placeholders), just without the image fills.
    return {};
  }

  await fs.mkdir(path.join(outDir, 'images'), { recursive: true });
  const map: Record<string, string> = {};
  for (const nodeId of nodeIds) {
    const imgUrl = json.images?.[nodeId];
    if (!imgUrl) continue; // shortcut: a failed single render is skipped, not fatal
    const imgRes = await fetch(imgUrl);
    if (!imgRes.ok) continue;
    const buf = Buffer.from(await imgRes.arrayBuffer());
    // nodeId (e.g. "1:23") is filesystem-unsafe as-is — sanitize for the filename only, the map key stays the real block id.
    const safeName = nodeId.replace(/[^a-z0-9]/gi, '-');
    const filename = `images/${safeName}.png`;
    await fs.writeFile(path.join(outDir, filename), buf);
    map[nodeId] = filename;
  }
  return map;
}

// === orchestration ============================================================

function slugifyForDir(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

/**
 * End-to-end: figma.com URL -> a written preview.html (+ exported images)
 * under `<runsDir>/figma-<id>/`, plus the block tree, implementation
 * prompt, and flat block summaries. `token` must already be resolved by the
 * caller (session -> persisted -> .env — see server/secrets.ts), exactly
 * like fetchFigmaReferenceImage's `preResolvedToken`.
 */
export async function importFigmaFile(figmaUrl: string, token: string, runsDir: string): Promise<FigmaImportResult> {
  const parsed = parseFigmaUrl(figmaUrl);
  if (!parsed) {
    throw new FigmaConfigError(
      'Не удалось распознать ссылку на Figma. Ожидается URL вида https://www.figma.com/file/<key>/... или /design/<key>/..., в идеале с ?node-id=...',
    );
  }

  const nodeId = parsed.nodeId ?? (await resolveFirstTopLevelFrameId(parsed.fileKey, token));
  const rootNode = await fetchNodeSubtree(parsed.fileKey, nodeId, token);
  const { root } = nodeTreeToBlockTree(rootNode);

  const importId = `figma-${slugifyForDir(parsed.fileKey)}-${nodeId.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}`;
  const outDir = path.join(runsDir, importId);
  await fs.mkdir(outDir, { recursive: true });

  const imageExportIds: string[] = [];
  collectImageExportIds(root, imageExportIds);
  const imageMap = await exportAndDownloadImages(parsed.fileKey, imageExportIds, token, outDir);

  const html = blockTreeToHtml(root, { title: rootNode.name, imageMap });
  await fs.writeFile(path.join(outDir, 'preview.html'), html, 'utf8');

  const blocks = buildBlockSummaries(root, imageMap);
  const steps = buildImplementationPrompt(root, blocks, { sourceUrl: figmaUrl });

  return {
    previewUrl: `/runs/${importId}/preview.html`,
    blockTree: root,
    html,
    steps,
    blocks,
  };
}
