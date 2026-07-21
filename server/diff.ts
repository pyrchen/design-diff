import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { RawImage } from './normalize.js';
import type { HotRegion } from './types.js';

export interface DiffResult {
  score: number;
  numDiffPixels: number;
  diffPng: Buffer;
  hotRegions: HotRegion[];
}

export async function computeDiff(ref: RawImage, target: RawImage): Promise<DiffResult> {
  const { width, height } = ref;
  const out = Buffer.alloc(width * height * 4);

  const numDiffPixels = pixelmatch(ref.data, target.data, out, width, height, {
    threshold: 0.1,
    includeAA: false,
  });

  const score = width * height > 0 ? 1 - numDiffPixels / (width * height) : 1;
  const diffPng = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const hotRegions = computeHotRegions(out, width, height);

  return { score, numDiffPixels, diffPng, hotRegions };
}

// --- Feature 2: connected-component hot regions -----------------------------
//
// Replaces the old 6x4 grid-cell heuristic with real connected-component
// bounding boxes over the pixelmatch diff mask (8-connectivity, classic
// two-pass label + union-find), so hot regions actually cluster on the
// changed UI elements instead of uniform cells.

// shortcut: heuristic constants — tuned for typical page screenshots, not
// derived from any formal analysis. Bump MIN_COMPONENT_PIXELS/MIN_COMPONENT_DIM
// if screenshots are very high-res and noise starts showing through; bump
// MERGE_DISTANCE_PX if a single visual change is being split into several
// adjacent boxes (e.g. text glyphs of the same re-styled paragraph).
const MIN_COMPONENT_PIXELS = 20;
const MIN_COMPONENT_DIM = 3;
const MERGE_DISTANCE_PX = 12;
const TOP_N_REGIONS = 16;

class UnionFind {
  private parent: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    for (let i = 0; i < size; i++) this.parent[i] = i;
  }

  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

interface ComponentBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  count: number;
}

/**
 * pixelmatch (default, non-mask mode) paints actual diffs with a dominant-red
 * highlight color and renders untouched areas as a dimmed grayscale (r≈g≈b)
 * copy of the source — so "dominant red" is a reliable signal for an actual
 * pixel difference.
 */
function buildDiffMask(diffBuffer: Buffer, width: number, height: number): Uint8Array {
  const size = width * height;
  const mask = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    const idx = i * 4;
    const r = diffBuffer[idx];
    const g = diffBuffer[idx + 1];
    const b = diffBuffer[idx + 2];
    const a = diffBuffer[idx + 3];
    mask[i] = a > 0 && r > 100 && r > g + 30 && r > b + 30 ? 1 : 0;
  }
  return mask;
}

/** Two-pass 8-connected component labeling over the diff mask. */
function labelComponents(mask: Uint8Array, width: number, height: number): ComponentBox[] {
  const size = width * height;
  const labels = new Int32Array(size); // 0 = unlabeled/background
  const uf = new UnionFind(size + 1);
  let nextLabel = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;

      const neighbors: number[] = [];
      if (x > 0 && mask[i - 1]) neighbors.push(labels[i - 1]);
      if (y > 0) {
        if (mask[i - width]) neighbors.push(labels[i - width]);
        if (x > 0 && mask[i - width - 1]) neighbors.push(labels[i - width - 1]);
        if (x < width - 1 && mask[i - width + 1]) neighbors.push(labels[i - width + 1]);
      }

      if (neighbors.length === 0) {
        labels[i] = nextLabel;
        nextLabel++;
      } else {
        const minLabel = Math.min(...neighbors);
        labels[i] = minLabel;
        for (const n of neighbors) uf.union(n, minLabel);
      }
    }
  }

  const boxes = new Map<number, ComponentBox>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      const root = uf.find(labels[i]);
      let box = boxes.get(root);
      if (!box) {
        box = { minX: x, minY: y, maxX: x, maxY: y, count: 0 };
        boxes.set(root, box);
      }
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
      box.count++;
    }
  }

  return Array.from(boxes.values());
}

function boxesAreCloseOrOverlapping(a: ComponentBox, b: ComponentBox, margin: number): boolean {
  return (
    a.minX - margin <= b.maxX &&
    b.minX - margin <= a.maxX &&
    a.minY - margin <= b.maxY &&
    b.minY - margin <= a.maxY
  );
}

/** Iteratively merges boxes that overlap or are within `mergeDistance` px of each other. */
function mergeNearbyBoxes(boxes: ComponentBox[], mergeDistance: number): ComponentBox[] {
  let list = boxes.slice();
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < list.length && !mergedAny; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!boxesAreCloseOrOverlapping(list[i], list[j], mergeDistance)) continue;
        const merged: ComponentBox = {
          minX: Math.min(list[i].minX, list[j].minX),
          minY: Math.min(list[i].minY, list[j].minY),
          maxX: Math.max(list[i].maxX, list[j].maxX),
          maxY: Math.max(list[i].maxY, list[j].maxY),
          count: list[i].count + list[j].count,
        };
        const next = list.filter((_, idx) => idx !== i && idx !== j);
        next.push(merged);
        list = next;
        mergedAny = true;
        break;
      }
    }
  }
  return list;
}

function computeHotRegions(diffBuffer: Buffer, width: number, height: number): HotRegion[] {
  if (width === 0 || height === 0) return [];

  const mask = buildDiffMask(diffBuffer, width, height);
  let boxes = labelComponents(mask, width, height);

  boxes = boxes.filter(
    (b) => b.count >= MIN_COMPONENT_PIXELS && b.maxX - b.minX + 1 >= MIN_COMPONENT_DIM && b.maxY - b.minY + 1 >= MIN_COMPONENT_DIM,
  );

  boxes = mergeNearbyBoxes(boxes, MERGE_DISTANCE_PX);

  const totalArea = width * height;
  const regions: HotRegion[] = boxes.map((b) => {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    return {
      xPct: (b.minX / width) * 100,
      yPct: (b.minY / height) * 100,
      wPct: (w / width) * 100,
      hPct: (h / height) * 100,
      areaPct: ((w * h) / totalArea) * 100,
    };
  });

  regions.sort((a, b) => b.areaPct - a.areaPct);
  return regions.slice(0, TOP_N_REGIONS);
}
