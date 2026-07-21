import type { RefObject } from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';

export function ZoomHud({
  zoomTextRef,
  onZoomOut,
  onZoomIn,
  onFit,
  onOne,
  stopDown,
}: {
  zoomTextRef: RefObject<HTMLSpanElement | null>;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  onOne: () => void;
  stopDown: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onMouseDown={stopDown}
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 11,
        padding: 4,
        boxShadow: 'var(--sh2)',
        zIndex: 20,
      }}
    >
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Уменьшить"
        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}
      >
        <Minus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <span ref={zoomTextRef} className="ddmono" style={{ minWidth: 48, textAlign: 'center', fontSize: 12, color: 'var(--text)' }} />
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Увеличить"
        style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text2)' }}
      >
        <Plus size={15} strokeWidth={2} aria-hidden="true" />
      </button>
      <span style={{ width: 1, height: 18, background: 'var(--border2)', margin: '0 4px' }} />
      <button
        type="button"
        onClick={onFit}
        className="ddmono"
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 9px', height: 28, borderRadius: 8, color: 'var(--text2)', fontSize: 11.5 }}
      >
        <Maximize size={13} strokeWidth={1.9} aria-hidden="true" />
        Вписать
      </button>
      <button type="button" onClick={onOne} className="ddmono" style={{ padding: '0 9px', height: 28, borderRadius: 8, color: 'var(--text2)', fontSize: 11.5 }}>
        1:1
      </button>
    </div>
  );
}
