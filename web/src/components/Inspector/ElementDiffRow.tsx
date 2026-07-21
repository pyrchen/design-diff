import { KIND_META, type DiffKind } from '../../lib/sampleContent';
import type { MappedRow } from '../../lib/mapElementDiff';

export function ElementDiffRow({
  tag,
  text,
  kind,
  rows,
  selected,
  onClick,
}: {
  tag: string;
  text: string;
  kind: DiffKind;
  rows: MappedRow[];
  selected: boolean;
  onClick: () => void;
}) {
  const meta = KIND_META[kind];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: selected ? 'var(--scan-soft)' : 'var(--bg)',
        border: `1px solid ${selected ? 'var(--scan)' : 'var(--border)'}`,
        borderLeft: `3px solid ${meta.color}`,
        borderRadius: 11,
        padding: '10px 11px',
        transition: 'all .15s var(--ease)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: rows.length ? 7 : 0 }}>
        <span className="ddmono" style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <span style={{ color: 'var(--scan)' }}>{tag}</span> <span style={{ color: 'var(--text2)', fontWeight: 400 }}>{text}</span>
        </span>
        <span className="ddmono" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: meta.color, flexShrink: 0, paddingLeft: 6 }}>
          {meta.label}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map((p, i) => (
          <div key={i} className="ddmono" style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10.5 }}>
            <span style={{ color: 'var(--text3)', minWidth: 74 }}>{p.k}</span>
            <span style={{ color: 'var(--info)' }}>{p.a}</span>
            <span style={{ color: 'var(--text3)' }}>→</span>
            <span style={{ color: 'var(--red)' }}>{p.b}</span>
          </div>
        ))}
      </div>
    </button>
  );
}
