import type { CSSProperties, ReactNode } from 'react';

const dotStyle: CSSProperties = { width: 11, height: 11, borderRadius: '50%', background: '#dfe1e5' };

/** The browser-chrome frame every board renders inside (radius 18, traffic-light dots + address label). */
export function BrowserFrame({ label, height, children }: { label: string; height: number; children: ReactNode }) {
  return (
    <div style={{ width: '100%', borderRadius: 18, overflow: 'hidden', background: '#fff', boxShadow: 'var(--board-sh)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: '#f1f2f4', borderBottom: '1px solid rgba(0,0,0,.06)' }}>
        <span style={dotStyle} />
        <span style={dotStyle} />
        <span style={dotStyle} />
        <span className="ddmono" style={{ marginLeft: 10, fontSize: 12, color: '#9aa1ac' }}>
          {label}
        </span>
      </div>
      <div style={{ height, position: 'relative', overflow: 'hidden' }}>{children}</div>
    </div>
  );
}
