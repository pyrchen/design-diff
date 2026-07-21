import type { CSSProperties } from 'react';
import { BrowserFrame } from './BrowserFrame';
import { BoardContent, type BoardContentSpec } from './BoardContent';

export function RefBoard({
  wrapStyle,
  bw,
  boardHeight,
  bpLabel,
  refFileLabel,
  content,
}: {
  wrapStyle: CSSProperties;
  bw: number;
  boardHeight: number;
  bpLabel: string;
  refFileLabel: string;
  content: BoardContentSpec;
}) {
  return (
    <div style={{ ...wrapStyle, width: bw }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, marginBottom: 16, color: 'var(--text2)' }}>
        <span className="ddmono" style={{ fontSize: 16 }}>
          Референс · {refFileLabel} · {bpLabel}
        </span>
      </div>
      <BrowserFrame label={refFileLabel} height={boardHeight}>
        <BoardContent content={content} />
      </BrowserFrame>
    </div>
  );
}
