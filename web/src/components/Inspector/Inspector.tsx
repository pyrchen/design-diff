import type { CSSProperties } from 'react';
import type { SampleRegion } from '../../lib/sampleContent';
import type { UnifiedStyleGroup } from '../../lib/styleGroups';
import { ruPlural } from '../../lib/pluralize';
import { ElementDiffRow } from './ElementDiffRow';
import { StyleSummaryTable } from './StyleSummaryTable';
import { PromptFooter } from './PromptFooter';

export function Inspector({
  wrapStyle,
  regions,
  selected,
  onSelectRegion,
  styleGroups,
  promptText,
  copied,
  onCopyPrompt,
  onSaveMd,
}: {
  wrapStyle: CSSProperties;
  regions: SampleRegion[];
  selected: number | null;
  onSelectRegion: (i: number) => void;
  styleGroups: UnifiedStyleGroup[];
  promptText: string;
  copied: boolean;
  onCopyPrompt: () => void;
  onSaveMd: () => void;
}) {
  return (
    <aside style={wrapStyle}>
      <div
        style={{
          height: '100%',
          background: 'var(--surface)',
          backdropFilter: 'blur(22px) saturate(150%)',
          borderLeft: '1px solid var(--hair)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Расхождения</span>
          <span className="ddmono" style={{ fontSize: 10, color: 'var(--red)', background: 'var(--red-soft)', padding: '2px 8px', borderRadius: 6 }}>
            {regions.length} {ruPlural(regions.length, 'элемент', 'элемента', 'элементов')}
          </span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {regions.length > 0 && (
            <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {regions.map((r, i) => (
                <ElementDiffRow key={i} tag={r.sel} text={r.title} kind={r.kind} rows={r.rows} selected={selected === i} onClick={() => onSelectRegion(i)} />
              ))}
            </div>
          )}
          {regions.length === 0 && (
            <p style={{ padding: '0 14px', fontSize: 12, color: 'var(--text3)' }}>Структурированных расхождений нет.</p>
          )}
          <StyleSummaryTable groups={styleGroups} />
        </div>
        <PromptFooter promptText={promptText} copied={copied} onCopy={onCopyPrompt} onSaveMd={onSaveMd} />
      </div>
    </aside>
  );
}
