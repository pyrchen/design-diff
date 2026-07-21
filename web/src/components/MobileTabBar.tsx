import { Columns2, Monitor, PanelLeft, ScanLine } from 'lucide-react';
import type { MobileTab } from '../lib/middleGridLayout';

const TABS: { k: MobileTab; label: string; icon: React.ReactNode }[] = [
  { k: 'setup', label: 'Setup', icon: <PanelLeft size={18} strokeWidth={1.9} aria-hidden="true" /> },
  { k: 'canvas', label: 'Canvas', icon: <Columns2 size={18} strokeWidth={1.9} aria-hidden="true" /> },
  { k: 'diffs', label: 'Diffs', icon: <ScanLine size={18} strokeWidth={1.9} aria-hidden="true" /> },
  { k: 'status', label: 'Status', icon: <Monitor size={18} strokeWidth={1.9} aria-hidden="true" /> },
];

export function MobileTabBar({ active, onChange }: { active: MobileTab; onChange: (t: MobileTab) => void }) {
  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--surface)', backdropFilter: 'blur(22px) saturate(150%)', borderTop: '1px solid var(--hair)' }}>
      {TABS.map((t) => {
        const activeTab = active === t.k;
        return (
          <button
            key={t.k}
            type="button"
            onClick={() => onChange(t.k)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: activeTab ? 'var(--scan)' : 'var(--text3)',
              fontSize: 10,
            }}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
