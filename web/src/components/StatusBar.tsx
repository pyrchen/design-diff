import { X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { AppState } from '../hooks/useCanvasEngine';

export function StatusBar({
  wrapStyle,
  appState,
  statusColor,
  dotColor,
  pulsing,
  statusText,
  statusRight,
  slow,
  onCancel,
}: {
  wrapStyle: CSSProperties;
  appState: AppState;
  statusColor: string;
  dotColor: string;
  pulsing: boolean;
  statusText: string;
  statusRight: string;
  slow: boolean;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: '100%',
        padding: '0 14px',
        background: 'var(--surface)',
        backdropFilter: 'blur(22px) saturate(150%)',
        borderTop: '1px solid var(--hair)',
        fontSize: 11.5,
        ...wrapStyle,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: statusColor }}>
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: dotColor,
            ...(pulsing ? { animation: 'ddpulse 1.4s infinite' } : {}),
          }}
        />
        <span className="ddmono">{statusText}</span>
      </span>
      {slow && (
        <span className="ddmono" style={{ color: 'var(--amber)', fontSize: 10.5 }}>
          всё ещё работаю…
        </span>
      )}
      <div style={{ flex: 1 }} />
      <span className="ddmono" style={{ color: 'var(--text3)', fontSize: 10.5 }}>
        {statusRight}
      </span>
      {appState === 'running' && (
        <button
          type="button"
          onClick={onCancel}
          className="ddmono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 10px',
            borderRadius: 7,
            background: 'var(--red-soft)',
            color: 'var(--red)',
            fontSize: 10.5,
            fontWeight: 600,
          }}
        >
          <X size={11} strokeWidth={2.2} aria-hidden="true" />
          Отмена
        </button>
      )}
    </div>
  );
}
