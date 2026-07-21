import type {
  BreakpointError,
  BreakpointResult,
  CompareResponse,
  DiffProvenance,
  ElementDiffEntry,
  HotRegion,
  ParityReport,
  StyleDiffEntry,
} from './types.js';
import { isBreakpointError } from './types.js';
import { describeDivergence } from './state.js';

export type PromptInput = Omit<CompareResponse, 'claudePrompt'>;

const CATEGORY_ORDER: StyleDiffEntry['category'][] = ['color', 'typography', 'spacing', 'layout'];
const CATEGORY_LABEL_RU: Record<StyleDiffEntry['category'], string> = {
  color: 'Цвета',
  typography: 'Типографика',
  spacing: 'Отступы',
  layout: 'Layout / позиционирование',
};

function describeHotRegions(regions: HotRegion[]): string {
  if (regions.length === 0) return 'заметных сконцентрированных зон различий не обнаружено';

  const words = new Set<string>();
  for (const r of regions) {
    const centerXPct = r.xPct + r.wPct / 2;
    const centerYPct = r.yPct + r.hPct / 2;
    const horiz = centerXPct < 34 ? 'слева' : centerXPct < 67 ? 'по центру' : 'справа';
    const vert = centerYPct < 34 ? 'сверху' : centerYPct < 67 ? 'в середине' : 'снизу';
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

const GEOMETRY_LABELS: { key: 'dx' | 'dy' | 'dw' | 'dh'; describe: (v: number) => string }[] = [
  { key: 'dx', describe: (v) => `сдвинут по горизонтали на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dy', describe: (v) => `сдвинут по вертикали на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dw', describe: (v) => `ширина отличается на ${v > 0 ? '+' : ''}${v}px` },
  { key: 'dh', describe: (v) => `высота отличается на ${v > 0 ? '+' : ''}${v}px` },
];

/** Formats one `elementDiffs` entry as a surgical, single-line bullet. */
function formatElementDiffLine(e: ElementDiffEntry): string {
  if (e.status === 'missing') {
    return `- ОТСУТСТВУЕТ в целевом сайте: ${e.label} (был в референсе на позиции x=${e.refBox?.x}, y=${e.refBox?.y})`;
  }
  if (e.status === 'extra') {
    return `- ЛИШНИЙ элемент в целевом сайте (нет в референсе): ${e.label} (позиция x=${e.targetBox?.x}, y=${e.targetBox?.y})`;
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
  return `- ${e.label}: ${parts.join('; ')}`;
}

// --- Engine Phase-1: state-parity trust banner + provenance footer --------

/** Prepended when parity.status==='mismatch' — names which side had which overlay open/closed and notes the quarantine. */
function formatStateMismatchBanner(parity: ParityReport, untrusted: boolean | undefined): string[] {
  const lines: string[] = [];
  lines.push('> **STATE-MISMATCH:** перед сравнением состояния сторон не совпадали — часть результата может быть артефактом состояния, а не дизайна.');
  for (const d of parity.divergences) {
    lines.push(`>   - ${describeDivergence(d)}`);
  }
  if (untrusted) {
    lines.push('>   - зоны, пересекающиеся с этими расхождениями, исключены из hot-regions/element-diff ниже (parityGate=flag, quarantine).');
  }
  return lines;
}

/** "By what means" trust footer — the settings the diff for this breakpoint was actually produced under. */
function formatProvenanceLine(p: DiffProvenance): string {
  return `- Provenance: pixelThreshold=${p.pixelThreshold}, includeAA=${p.includeAA}, alignment=${p.alignment}, elementMatch=${p.elementMatch}, manifestHash=${p.stateManifestHash ?? 'n/a'}, refHeight=${p.refHeight}px, targetHeight=${p.targetHeight}px`;
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
    `- Референс: ${run.referenceType === 'url' ? run.referenceUrl : run.referenceType === 'figma' ? `Figma (${run.referenceUrl})` : 'загруженное изображение (мокап)'}`,
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

    if (bp.parity && bp.parity.status === 'mismatch') {
      lines.push(...formatStateMismatchBanner(bp.parity, bp.untrusted));
    }

    lines.push(`- Зона концентрации различий: ${describeHotRegions(bp.hotRegions)} (${bp.hotRegions.length} обл.)`);
    lines.push(`- Изображения: \`${bp.refImg}\` (референс), \`${bp.targetImg}\` (цель), \`${bp.diffImg}\` (diff)`);

    if (bp.provenance) {
      lines.push(formatProvenanceLine(bp.provenance));
    }

    if (bp.elementDiffs.length > 0) {
      lines.push('- Расхождения по элементам (surgical, приоритет — сверху):');
      for (const e of bp.elementDiffs) {
        lines.push(`  ${formatElementDiffLine(e)}`);
      }
    }

    if (bp.styleDiff.length > 0) {
      lines.push('- Агрегированные расхождения стилей страницы (палитра/типографика/отступы/layout):');
      lines.push(...formatStyleDiffBullets(bp.styleDiff));
    } else if (bp.elementDiffs.length === 0) {
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

  lines.push('## Чеклист исправлений (приоритет: цвета → типографика → отступы → layout, худший брейкпоинт — первым)');
  let checklistIndex = 1;
  for (const bp of sorted) {
    for (const e of bp.elementDiffs) {
      lines.push(`${checklistIndex}. [${bp.breakpoint}px] ${formatElementDiffLine(e).replace(/^-\s*/, '')}`);
      checklistIndex++;
    }
  }
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
          `${checklistIndex}. [${bp.breakpoint}px, ${CATEGORY_LABEL_RU[cat]}, агрегат] ${item.label}: изменить с \`${item.target}\` на \`${item.reference}\``,
        );
        checklistIndex++;
      }
    }
  }
  if (checklistIndex === 1) {
    lines.push(
      '- Структурированных расхождений (ни по элементам, ни агрегированных) нет (сравнение по изображению) — используйте diff-изображения и hot-зоны выше как ориентир для правок вёрстки и стилей.',
    );
  }

  return lines.join('\n');
}
