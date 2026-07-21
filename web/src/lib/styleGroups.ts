import type { StyleDiffCategory, StyleDiffEntry } from '../types';
import { SAMPLE_STYLE_GROUPS } from './sampleContent';
import type { ActiveBoardData } from './boardData';

export interface UnifiedStyleGroup {
  category: StyleDiffCategory;
  name: string;
  rows: { k: string; a: string; b: string }[];
}

const CATEGORY_LABEL: Record<StyleDiffCategory, string> = {
  color: 'Цвета',
  typography: 'Типографика',
  spacing: 'Отступы',
  layout: 'Layout',
};
const CATEGORY_ORDER: StyleDiffCategory[] = ['color', 'typography', 'spacing', 'layout'];

export function getStyleGroups(activeData: ActiveBoardData): UnifiedStyleGroup[] {
  if (activeData.kind === 'sample') {
    return CATEGORY_ORDER.map((c) => ({ category: c, name: SAMPLE_STYLE_GROUPS[c].name, rows: SAMPLE_STYLE_GROUPS[c].rows }));
  }
  if (activeData.kind === 'error') return [];

  const entries: StyleDiffEntry[] = activeData.breakpoint.styleDiff;
  const grouped = new Map<StyleDiffCategory, StyleDiffEntry[]>();
  for (const e of entries) {
    if (!grouped.has(e.category)) grouped.set(e.category, []);
    grouped.get(e.category)!.push(e);
  }
  return CATEGORY_ORDER.filter((c) => grouped.has(c)).map((c) => ({
    category: c,
    name: CATEGORY_LABEL[c],
    rows: grouped.get(c)!.map((e) => ({ k: e.label, a: String(e.reference), b: String(e.target) })),
  }));
}
