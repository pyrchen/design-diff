// Figma import (Feature 4): a real, surgical per-block prompt for the
// selected block in the imported preview — deterministic, client-side, no
// network/model call. Mirrors pointPrompt.ts's own pattern for the compare
// feature's per-element prompt.
import type { FigmaBlockSummary } from '../types';

/** Surgical, paste-ready per-block implementation instruction for one block from a Figma import. */
export function buildFigmaBlockPrompt(block: FigmaBlockSummary, sourceUrl?: string): string {
  const styleLines = Object.entries(block.styleSet)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');

  const lines: string[] = [];
  lines.push(`Implement the block matching selector \`${block.selector}\` (${block.description}) exactly as specified below.`);
  if (sourceUrl) lines.push(`Source: Figma (${sourceUrl}).`);
  lines.push('');
  lines.push('```css');
  lines.push(`${block.selector} {`);
  lines.push(styleLines);
  lines.push('}');
  lines.push('```');
  if (block.text) {
    lines.push('');
    lines.push(`Text content: "${block.text}"`);
  }
  return lines.join('\n');
}
