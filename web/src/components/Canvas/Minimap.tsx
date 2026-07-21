import type { CSSProperties, RefObject } from 'react';

export interface MinimapBoard {
  left: number;
  top: number;
  width: number;
  height: number;
  accent: string;
}

export function Minimap({ boards, mmRectRef, stopDown }: { boards: MinimapBoard[]; mmRectRef: RefObject<HTMLDivElement | null>; stopDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={stopDown}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: 132,
        height: 92,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 11,
        boxShadow: 'var(--sh2)',
        padding: 6,
        overflow: 'hidden',
        zIndex: 20,
      }}
    >
      {boards.map((b, i) => {
        const style: CSSProperties = {
          position: 'absolute',
          left: b.left,
          top: b.top,
          width: b.width,
          height: b.height,
          borderRadius: 2,
          background: 'var(--elevated)',
          border: `1px solid ${b.accent}`,
        };
        return <div key={i} style={style} />;
      })}
      <div ref={mmRectRef} style={{ position: 'absolute', border: '1.5px solid var(--scan)', background: 'var(--scan-soft)', borderRadius: 3, pointerEvents: 'none' }} />
    </div>
  );
}
