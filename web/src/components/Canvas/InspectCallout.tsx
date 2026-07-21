import type { RefObject } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { Mark } from '../shared/Mark';
import { KIND_META, type DiffKind } from '../../lib/sampleContent';
import type { MappedRow } from '../../lib/mapElementDiff';

export function InspectCallout({
  calloutRef,
  selector,
  title,
  kind,
  rows,
  pointCopied,
  onCopyPointPrompt,
  onDeselect,
}: {
  calloutRef: RefObject<HTMLDivElement | null>;
  selector: string;
  title: string;
  kind: DiffKind;
  rows: MappedRow[];
  pointCopied: boolean;
  onCopyPointPrompt: () => void;
  onDeselect: () => void;
}) {
  const meta = KIND_META[kind];
  return (
    <div
      ref={calloutRef}
      style={{
        position: 'absolute',
        zIndex: 60,
        width: 288,
        background: 'var(--elevated)',
        border: '1px solid var(--border2)',
        borderRadius: 14,
        boxShadow: 'var(--sh2)',
        overflow: 'hidden',
        animation: 'ddfade .16s var(--ease)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderBottom: '1px solid var(--hair)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Mark size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
          <span className="ddmono" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--scan)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selector}
          </span>
        </span>
        <button type="button" onClick={onDeselect} style={{ color: 'var(--text3)', display: 'flex', flexShrink: 0 }} aria-label="Закрыть">
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div style={{ padding: '11px 13px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="ddmono"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 6, background: meta.soft, color: meta.color }}
          >
            {meta.label}
          </span>
          <span className="ddmono" style={{ fontSize: 10.5, color: 'var(--text3)' }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => (
            <div key={i} className="ddmono" style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
              <span style={{ color: 'var(--text3)', minWidth: 70, flexShrink: 0 }}>{r.k}</span>
              {r.ca && <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: r.ca }} />}
              <span style={{ color: 'var(--info)' }}>{r.a}</span>
              <span style={{ color: 'var(--text3)' }}>→</span>
              {r.cb && <span style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, background: r.cb }} />}
              <span style={{ color: 'var(--red)' }}>{r.b}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onCopyPointPrompt}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: 8,
            borderRadius: 9,
            background: pointCopied ? 'var(--green)' : 'var(--accent-grad)',
            color: '#fff',
            fontSize: 11.5,
            fontWeight: 600,
            transition: 'background .2s var(--ease)',
          }}
        >
          {pointCopied ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={12} strokeWidth={2} aria-hidden="true" />}
          {pointCopied ? 'Скопировано' : 'Точечный промпт'}
        </button>
      </div>
    </div>
  );
}
