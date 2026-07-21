// Gap 2: a real, surgical per-element ("Точечный") prompt for the selected
// pin/callout, built from the actual ElementDiffEntry the pin represents —
// as opposed to samplePointPrompt() (sampleContent.ts), which is fixed demo
// text for the idle/sample state only.
import type { ElementDiffEntry } from '../types';

const GEOMETRY_LABELS: { key: 'dx' | 'dy' | 'dw' | 'dh'; describe: (v: number) => string }[] = [
  { key: 'dx', describe: (v) => `сдвинут по горизонтали на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dy', describe: (v) => `сдвинут по вертикали на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dw', describe: (v) => `ширина отличается на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dh', describe: (v) => `высота отличается на ${v > 0 ? '+' : ''}${v}px` },
];

/**
 * Client-side mirror of server/prompt.ts's formatElementDiffLine — same
 * wording so the point prompt reads consistently with the full run's
 * claudePrompt if the user copies both. Kept in sync manually (same
 * "duplicated from server" convention as web/src/types.ts).
 */
function formatElementDiffLine(e: ElementDiffEntry): string {
  if (e.status === 'missing') {
    return `ОТСУТСТВУЕТ в целевом сайте: ${e.label} (был в референсе на позиции x=${e.refBox?.x}, y=${e.refBox?.y})`;
  }
  if (e.status === 'extra') {
    return `ЛИШНИЙ элемент в целевом сайте (нет в референсе): ${e.label} (позиция x=${e.targetBox?.x}, y=${e.targetBox?.y})`;
  }

  const parts: string[] = [];
  for (const s of e.styleDeltas) {
    parts.push(`${s.prop} \`${s.target}\`→\`${s.reference}\``);
  }
  if (e.geometryDelta?.significant) {
    const g = e.geometryDelta;
    const geomParts = GEOMETRY_LABELS.filter(({ key }) => Math.abs(g[key]) > 3).map(({ key, describe }) => describe(g[key]));
    parts.push(...geomParts);
  }
  return `${e.label}: ${parts.join('; ')}`;
}

/** Surgical, paste-ready per-element fix instruction for one selected real diff. */
export function buildElementPointPrompt(entry: ElementDiffEntry, targetLabel: string, refLabel: string): string {
  const summary = formatElementDiffLine(entry);
  return `Fix ${entry.label} in ${targetLabel} to match the reference (${refLabel}):\n- ${summary}`;
}
