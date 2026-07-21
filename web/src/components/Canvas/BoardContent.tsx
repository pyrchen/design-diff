import type { CSSProperties } from 'react';
import { Landing } from '../Landing';

export type BoardContentSpec = { kind: 'mock'; variant: 'ref' | 'target' } | { kind: 'image'; src: string; alt: string };

export function BoardContent({
  content,
  style,
  onImgLoad,
}: {
  content: BoardContentSpec;
  style?: CSSProperties;
  onImgLoad?: (naturalWidth: number, naturalHeight: number) => void;
}) {
  if (content.kind === 'mock') {
    return (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...style }}>
        <Landing variant={content.variant} />
      </div>
    );
  }
  return (
    <img
      src={content.src}
      alt={content.alt}
      onLoad={(e) => onImgLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 'auto', pointerEvents: 'none', ...style }}
    />
  );
}
