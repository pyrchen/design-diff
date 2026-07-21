import type { RefObject } from 'react';

/** Screen-space selection ring around the selected block — positioned imperatively by useCanvasEngine, scales with zoom via recompute (not CSS transform). */
export function SelectionRing({ ringRef }: { ringRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      ref={ringRef}
      style={{
        position: 'absolute',
        display: 'none',
        border: '2px solid var(--scan)',
        borderRadius: 9,
        boxShadow: '0 0 0 4px var(--scan-soft)',
        pointerEvents: 'none',
        zIndex: 55,
        transition: 'opacity .15s var(--ease)',
      }}
    />
  );
}
