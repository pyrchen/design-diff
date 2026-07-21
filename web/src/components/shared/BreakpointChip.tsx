/** The context-panel breakpoint selection chip (1440/1024/768/390). */
export function BreakpointChip({ width, active, onClick }: { width: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ddmono"
      style={{
        padding: '5px 11px',
        borderRadius: 9,
        fontSize: 11.5,
        border: `1px solid ${active ? 'var(--scan)' : 'var(--border)'}`,
        background: active ? 'var(--scan-soft)' : 'var(--surface)',
        color: active ? 'var(--text)' : 'var(--text2)',
        transition: 'all .15s var(--ease)',
      }}
    >
      {width}
    </button>
  );
}
