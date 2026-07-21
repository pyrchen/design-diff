import type { RefObject } from 'react';
import { Crosshair } from 'lucide-react';
import { BoardContent, type BoardContentSpec } from './BoardContent';

/**
 * The signature Overlay Inspector: target underneath, reference clipped by
 * `clip-path: inset(0 calc(100% - var(--dd-split)) 0 0)`, a draggable
 * glowing scan line + ⊕ crosshair handle (42px), and a mono readout chip.
 */
export function OverlayInspector({
  splitRef,
  readoutRef,
  onStartDrag,
  targetContent,
  refContent,
  bw,
  onTargetImgLoad,
}: {
  splitRef: RefObject<HTMLDivElement | null>;
  readoutRef: RefObject<HTMLDivElement | null>;
  onStartDrag: (e: React.MouseEvent) => void;
  targetContent: BoardContentSpec;
  refContent: BoardContentSpec;
  bw: number;
  onTargetImgLoad?: (naturalWidth: number, naturalHeight: number) => void;
}) {
  return (
    <div ref={splitRef} style={{ position: 'absolute', inset: 0, ['--dd-split' as string]: '50%' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <BoardContent content={targetContent} onImgLoad={onTargetImgLoad} />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'inset(0 calc(100% - var(--dd-split)) 0 0)',
          pointerEvents: 'none',
          boxShadow: 'inset -1px 0 0 var(--scan)',
        }}
      >
        <BoardContent content={refContent} />
      </div>
      <div
        onMouseDown={onStartDrag}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 'var(--dd-split)', width: 34, transform: 'translateX(-50%)', cursor: 'ew-resize', zIndex: 6 }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: 2,
            transform: 'translateX(-50%)',
            background: 'var(--scan)',
            boxShadow: '0 0 14px var(--scan)',
            animation: 'ddscanpulse 1.8s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '2px solid var(--scan)',
            boxShadow: 'var(--sh2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--scan)',
          }}
        >
          <Crosshair size={18} strokeWidth={2} aria-hidden="true" />
        </div>
        <div
          ref={readoutRef}
          className="ddmono"
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            background: 'var(--elevated)',
            border: '1px solid var(--scan)',
            color: 'var(--text)',
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 8,
            boxShadow: 'var(--sh1)',
          }}
        >
          x={Math.round(bw / 2)}px · 50%
        </div>
      </div>
    </div>
  );
}
