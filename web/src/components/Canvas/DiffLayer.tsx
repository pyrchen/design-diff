import { KIND_META, type DiffKind } from '../../lib/sampleContent';
import { BoardContent, type BoardContentSpec } from './BoardContent';

export interface WorldRegion {
  l: number;
  t: number;
  w: number;
  h: number;
  kind: DiffKind;
}

/**
 * World-space diff regions drawn directly over the target board (Рядом/Diff
 * view modes — Наложение uses OverlayInspector instead). Only the region the
 * cursor is currently over (`hovered`) and the clicked one (`selected`) ever
 * get an outline — with real element-diff counts running into the hundreds
 * on dense pages, drawing all of them at once buries the page under noise
 * instead of helping you find anything. Canvas.tsx owns the hover hit-test
 * (mousemove over the target board, nearest/smallest region under the
 * cursor wins) and treats a click on the highlighted region exactly like
 * the old numbered-pin click: it opens the same point-compare callout.
 */
export function DiffLayer({
  content,
  isDiffMode,
  regions,
  selected,
  hovered,
  onImgLoad,
}: {
  content: BoardContentSpec;
  isDiffMode: boolean;
  regions: WorldRegion[];
  selected: number | null;
  hovered: number | null;
  onImgLoad?: (naturalWidth: number, naturalHeight: number) => void;
}) {
  return (
    <>
      <BoardContent content={content} onImgLoad={onImgLoad} />
      {isDiffMode && <div style={{ position: 'absolute', inset: 0, background: 'var(--red-soft)', pointerEvents: 'none' }} />}
      {regions.map((rg, i) => {
        const on = selected === i;
        const hoverOnly = !on && hovered === i;
        if (!on && !hoverOnly) return null;
        const meta = KIND_META[rg.kind];
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${rg.l * 100}%`,
              top: `${rg.t * 100}%`,
              width: `${rg.w * 100}%`,
              height: `${rg.h * 100}%`,
              border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? 'var(--scan)' : meta.color}`,
              borderRadius: 8,
              background: on ? 'var(--scan-soft)' : meta.soft,
              pointerEvents: 'none',
              transition: 'border-color .12s var(--ease)',
            }}
          />
        );
      })}
    </>
  );
}
