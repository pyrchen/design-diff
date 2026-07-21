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

const GRID_COLS = 6;
const GRID_ROWS = 4;
const HOT_REGION_THRESHOLD = 0.08;

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

/**
 * shortcut: grid-based hot regions (6x4 cells, threshold on fraction of
 * pixelmatch-highlighted pixels per cell) instead of proper connected-
 * component blob detection — upgrade to CV bounding boxes if per-element
 * precision is needed.
 */
function computeHotRegions(diffBuffer: Buffer, width: number, height: number): HotRegion[] {
  if (width === 0 || height === 0) return [];

  const cellW = width / GRID_COLS;
  const cellH = height / GRID_ROWS;
  const diffCounts: number[][] = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));
  const totalCounts: number[][] = Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));

  for (let y = 0; y < height; y++) {
    const row = Math.min(GRID_ROWS - 1, Math.floor(y / cellH));
    for (let x = 0; x < width; x++) {
      const col = Math.min(GRID_COLS - 1, Math.floor(x / cellW));
      const idx = (y * width + x) * 4;
      const r = diffBuffer[idx];
      const g = diffBuffer[idx + 1];
      const b = diffBuffer[idx + 2];
      const a = diffBuffer[idx + 3];
      // pixelmatch (default, non-mask mode) paints actual diffs with a
      // dominant-red highlight color and renders untouched areas as a
      // dimmed grayscale (r≈g≈b) copy of the source — so "dominant red" is
      // a reliable signal for an actual pixel difference.
      const isDiff = a > 0 && r > 100 && r > g + 30 && r > b + 30;
      totalCounts[row][col]++;
      if (isDiff) diffCounts[row][col]++;
    }
  }

  const regions: HotRegion[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const total = totalCounts[row][col] || 1;
      const fraction = diffCounts[row][col] / total;
      if (fraction >= HOT_REGION_THRESHOLD) {
        regions.push({
          col,
          row,
          fraction,
          xPct: (col / GRID_COLS) * 100,
          yPct: (row / GRID_ROWS) * 100,
          wPct: (1 / GRID_COLS) * 100,
          hPct: (1 / GRID_ROWS) * 100,
        });
      }
    }
  }

  return regions.sort((a, b) => b.fraction - a.fraction);
}
