import type { BreakpointError, BreakpointResult, CompareResponse, HotRegion, StyleDiffEntry } from './types.js';
import { isBreakpointError } from './types.js';

export type PromptInput = Omit<CompareResponse, 'claudePrompt'>;

const CATEGORY_ORDER: StyleDiffEntry['category'][] = ['color', 'typography', 'spacing', 'layout'];
const CATEGORY_LABEL_RU: Record<StyleDiffEntry['category'], string> = {
  color: 'Цвета',
  typography: 'Типографика',
  spacing: 'Отступы',
  layout: 'Layout / позиционирование',
};

function describeHotRegions(regions: HotRegion[], gridCols: number, gridRows: number): string {
  if (regions.length === 0) return 'заметных сконцентрированных зон различий не обнаружено';

  const words = new Set<string>();
  for (const r of regions) {
    const colFrac = gridCols > 1 ? r.col / (gridCols - 1) : 0;
    const rowFrac = gridRows > 1 ? r.row / (gridRows - 1) : 0;
    const horiz = colFrac < 0.34 ? 'слева' : colFrac < 0.67 ? 'по центру' : 'справа';
    const vert = rowFrac < 0.34 ? 'сверху' : rowFrac < 0.67 ? 'в середине' : 'снизу';
    words.add(`${vert} ${horiz}`);
  }
  return Array.from(words).join(', ');
}

function formatStyleDiffBullets(entries: StyleDiffEntry[]): string[] {
  const byCategory = new Map<StyleDiffEntry['category'], StyleDiffEntry[]>();
  for (const e of entries) {
    if (!byCategory.has(e.category)) byCategory.set(e.category, []);
    byCategory.get(e.category)!.push(e);
  }
  const lines: string[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = byCategory.get(cat);
    if (!items || items.length === 0) continue;
    lines.push(`  **${CATEGORY_LABEL_RU[cat]}:**`);
    for (const item of items) {
      lines.push(`  - ${item.label}: \`${item.reference}\` → \`${item.target}\``);
    }
  }
  return lines;
}

function scoreBadge(score: number): string {
  const pct = Math.round(score * 100);
  if (pct >= 95) return `${pct}% (хорошо)`;
  if (pct >= 85) return `${pct}% (есть расхождения)`;
  return `${pct}% (сильно расходится)`;
}

export function buildClaudePrompt(run: PromptInput): string {
  const lines: string[] = [];

  lines.push(
    'You are a senior frontend engineer. The implemented site below must match the reference design. Fix the CSS/markup to eliminate the discrepancies.',
  );
  lines.push('');
  lines.push('## Контекст');
  lines.push(
    `- Референс: ${run.referenceType === 'url' ? run.referenceUrl : 'загруженное изображение (мокап)'}`,
  );
  lines.push(`- Целевой сайт: ${run.targetUrl}`);
  lines.push(`- Брейкпоинты: ${run.breakpoints.map((b) => b.breakpoint).join(', ')}px`);
  lines.push(`- Средний коэффициент совпадения: ${Math.round(run.summary.avgScore * 100)}%`);
  if (run.summary.worstBreakpoint !== null) {
    lines.push(`- Худший брейкпоинт: ${run.summary.worstBreakpoint}px`);
  }
  lines.push('');

  const ok = run.breakpoints.filter((b): b is BreakpointResult => !isBreakpointError(b));
  const errored = run.breakpoints.filter((b): b is BreakpointError => isBreakpointError(b));

  const sorted = [...ok].sort((a, b) => a.score - b.score);

  lines.push('## Расхождения по брейкпоинтам (от худшего к лучшему)');
  lines.push('');
  for (const bp of sorted) {
    lines.push(`### ${bp.breakpoint}px — совпадение ${scoreBadge(bp.score)}`);
    lines.push(`- Зона концентрации различий: ${describeHotRegions(bp.hotRegions, 6, 4)}`);
    lines.push(`- Изображения: \`${bp.refImg}\` (референс), \`${bp.targetImg}\` (цель), \`${bp.diffImg}\` (diff)`);
    if (bp.styleDiff.length > 0) {
      lines.push('- Конкретные расхождения стилей:');
      lines.push(...formatStyleDiffBullets(bp.styleDiff));
    } else {
      lines.push(
        '- Структурированный style-diff недоступен для этой пары (референс — изображение, а не URL); ориентируйтесь на diff-изображение и hot-зоны выше.',
      );
    }
    lines.push('');
  }

  if (errored.length > 0) {
    lines.push('## Брейкпоинты с ошибками (не удалось сравнить)');
    for (const e of errored) {
      lines.push(`- ${e.breakpoint}px: ${e.error}`);
    }
    lines.push('');
  }

  lines.push('## Чеклист исправлений (приоритет: цвета → типографика → отступы → layout)');
  let checklistIndex = 1;
  for (const bp of sorted) {
    if (bp.styleDiff.length === 0) continue;
    const byCategory = new Map<StyleDiffEntry['category'], StyleDiffEntry[]>();
    for (const e of bp.styleDiff) {
      if (!byCategory.has(e.category)) byCategory.set(e.category, []);
      byCategory.get(e.category)!.push(e);
    }
    for (const cat of CATEGORY_ORDER) {
      const items = byCategory.get(cat);
      if (!items) continue;
      for (const item of items) {
        lines.push(
          `${checklistIndex}. [${bp.breakpoint}px, ${CATEGORY_LABEL_RU[cat]}] ${item.label}: изменить с \`${item.target}\` на \`${item.reference}\``,
        );
        checklistIndex++;
      }
    }
  }
  if (checklistIndex === 1) {
    lines.push(
      '- Структурированных style-diff расхождений нет (сравнение по изображению) — используйте diff-изображения и hot-зоны выше как ориентир для правок вёрстки и стилей.',
    );
  }

  return lines.join('\n');
}
