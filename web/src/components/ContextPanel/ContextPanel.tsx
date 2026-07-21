import type { CSSProperties } from 'react';
import { BreakpointMatrix, type BpProgress } from './BreakpointMatrix';
import { SetupView, type SetupViewProps } from './SetupView';

export function ContextPanel({
  wrapStyle,
  running,
  runPct,
  breakpoints,
  bpStatuses,
  setupProps,
}: {
  wrapStyle: CSSProperties;
  running: boolean;
  runPct: number;
  breakpoints: number[];
  bpStatuses: Record<number, BpProgress>;
  setupProps: SetupViewProps;
}) {
  return (
    <aside style={wrapStyle}>
      <div
        style={{
          height: '100%',
          background: 'var(--surface)',
          backdropFilter: 'blur(22px) saturate(150%)',
          borderRight: '1px solid var(--hair)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{running ? 'Матрица брейкпоинтов' : 'Настройка'}</span>
          <span className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
            {running ? `${breakpoints.length} bp` : 'a ⇄ b'}
          </span>
        </div>
        {running ? <BreakpointMatrix breakpoints={breakpoints} runPct={runPct} statuses={bpStatuses} /> : <SetupView {...setupProps} />}
      </div>
    </aside>
  );
}
