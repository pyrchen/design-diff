import { KIND_META, type DiffKind } from '../../lib/sampleContent';
import { BoardContent, type BoardContentSpec } from './BoardContent';

export interface WorldRegion {
  l: number;
  t: number;
  w: number;
  h: number;
  kind: DiffKind;
}

/** World-space diff regions drawn directly over the target board (Рядом/Diff view modes — Наложение uses OverlayInspector instead). */
export function DiffLayer({
  content,
  isDiffMode,
  regions,
  selected,
  onImgLoad,
}: {
  content: BoardContentSpec;
  isDiffMode: boolean;
  regions: WorldRegion[];
  selected: number | null;
  onImgLoad?: (naturalWidth: number, naturalHeight: number) => void;
}) {
  return (
    <>
      <BoardContent content={content} onImgLoad={onImgLoad} />
      {isDiffMode && <div style={{ position: 'absolute', inset: 0, background: 'var(--red-soft)', pointerEvents: 'none' }} />}
      {regions.map((rg, i) => {
        const meta = KIND_META[rg.kind];
        const on = selected === i;
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
              background: isDiffMode ? meta.soft : on ? 'var(--scan-soft)' : 'transparent',
              pointerEvents: 'none',
              transition: 'all .18s var(--ease)',
            }}
          />
        );
      })}
    </>
  );
}
