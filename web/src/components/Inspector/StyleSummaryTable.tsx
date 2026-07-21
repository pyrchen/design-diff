import { Droplet, LayoutGrid, Ruler, Type } from 'lucide-react';
import type { UnifiedStyleGroup } from '../../lib/styleGroups';

const CATEGORY_ICON: Record<UnifiedStyleGroup['category'], React.ReactNode> = {
  color: <Droplet size={14} strokeWidth={1.9} aria-hidden="true" />,
  typography: <Type size={14} strokeWidth={1.9} aria-hidden="true" />,
  spacing: <Ruler size={14} strokeWidth={1.9} aria-hidden="true" />,
  layout: <LayoutGrid size={14} strokeWidth={1.9} aria-hidden="true" />,
};

export function StyleSummaryTable({ groups }: { groups: UnifiedStyleGroup[] }) {
  if (groups.length === 0) return null;
  return (
    <div style={{ padding: 14 }}>
      <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em', margin: '0 2px 9px' }}>
        Сводка стилей
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {groups.map((g) => (
          <div key={g.category} style={{ borderBottom: '1px solid var(--hair)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--bg)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, fontWeight: 500 }}>
                <span style={{ display: 'flex', color: 'var(--text3)' }}>{CATEGORY_ICON[g.category]}</span>
                {g.name}
              </span>
              <span className="ddmono" style={{ fontSize: 10, color: 'var(--red)', background: 'var(--red-soft)', padding: '1px 7px', borderRadius: 6 }}>
                {g.rows.length}
              </span>
            </div>
            <div style={{ padding: '3px 12px 9px' }}>
              {g.rows.map((r, i) => (
                <div key={i} className="ddmono" style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 10, padding: '2px 0' }}>
                  <span style={{ color: 'var(--text3)', minWidth: 96, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.k}</span>
                  <span style={{ color: 'var(--info)', whiteSpace: 'nowrap' }}>{r.a}</span>
                  <span style={{ color: 'var(--text3)' }}>→</span>
                  <span style={{ color: 'var(--red)', whiteSpace: 'nowrap' }}>{r.b}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
