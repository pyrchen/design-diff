import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Columns2, Copy as OverlayIcon, History, ScanLine, TriangleAlert } from 'lucide-react';
import type { Layout } from '../../hooks/useLayout';
import { useCanvasEngine, type AppState, type ViewMode } from '../../hooks/useCanvasEngine';
import { getActiveBoardData } from '../../lib/boardData';
import { isNotableElementDiff, mapElementDiff } from '../../lib/mapElementDiff';
import type { RecentPair } from '../../lib/recentPairs';
import {
  BOARD_GAP,
  BOARD_H,
  KIND_META,
  SAMPLE_RECENT_PAIRS,
  SAMPLE_REGIONS,
  SAMPLE_SCORES,
  scoreColorVar,
  type Breakpoint,
  type SampleRegion,
} from '../../lib/sampleContent';
import type { CompareResponse } from '../../types';
import { Mark } from '../shared/Mark';
import { ScoreChip } from '../shared/ScoreChip';
import { Landing } from '../Landing';
import { RefBoard } from './RefBoard';
import { BrowserFrame } from './BrowserFrame';
import { DiffLayer } from './DiffLayer';
import { OverlayInspector } from './OverlayInspector';
import { InspectPin } from './InspectPin';
import { SelectionRing } from './SelectionRing';
import { InspectCallout } from './InspectCallout';
import { ZoomHud } from './ZoomHud';
import { Minimap } from './Minimap';
import type { BoardContentSpec } from './BoardContent';

export interface CanvasProps {
  wrapStyle: CSSProperties;
  appState: AppState;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  bp: number;
  breakpoints: number[];
  onBpChange: (bp: number) => void;
  layout: Layout;
  selected: number | null;
  onSelectRegion: (i: number) => void;
  onDeselect: () => void;
  result: CompareResponse | null;
  refFileLabel: string;
  targetFileLabel: string;
  runPct: number;
  pointCopied: boolean;
  onCopyPointPrompt: (region: SampleRegion) => void;
  /** Real recent-pairs history (Gap 3) — empty until at least one compare has completed on this device. */
  recentPairs: RecentPair[];
  /** A real recent pair was clicked — repopulate the setup form (never auto-run). */
  onSelectRecentPair: (pair: RecentPair) => void;
  /** A sample/demo chip was clicked (shown only while recentPairs is empty) — preserves the prototype's original affordance of jumping straight to the demo results view. */
  onSelectSampleRecentPair: () => void;
  /** Reports the current region list up so Inspector (a sibling pane) can render the exact same list — pins and inspector rows share indices for bidirectional selection sync. */
  onRegionsChange: (regions: SampleRegion[]) => void;
}

function scoreForBp(result: CompareResponse | null, bp: number): number | null {
  if (!result) return SAMPLE_SCORES[bp as Breakpoint] ?? null;
  const found = result.breakpoints.find((b) => b.breakpoint === bp);
  if (!found) return null;
  return 'error' in found ? null : Math.round(found.score * 100);
}

export function Canvas(props: CanvasProps) {
  const { appState, viewMode, bp, layout, selected, result } = props;
  const activeData = useMemo(() => getActiveBoardData(result, bp), [result, bp]);
  const [targetNaturalSize, setTargetNaturalSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setTargetNaturalSize({ width: 0, height: 0 });
  }, [bp, result?.runId]);

  const regions: SampleRegion[] = useMemo(() => {
    if (activeData.kind === 'sample') return SAMPLE_REGIONS;
    if (activeData.kind === 'real') {
      if (!targetNaturalSize.width || !targetNaturalSize.height) return [];
      return activeData.breakpoint.elementDiffs
        .filter(isNotableElementDiff)
        .map((entry) => ({ entry, mapped: mapElementDiff(entry) }))
        .filter(({ mapped }) => !!mapped.anchorBox)
        .map(({ entry, mapped }) => {
          const box = mapped.anchorBox!;
          return {
            l: Math.max(0, Math.min(1, box.x / targetNaturalSize.width)),
            t: Math.max(0, Math.min(1, box.y / targetNaturalSize.height)),
            w: Math.max(0.01, Math.min(1, box.width / targetNaturalSize.width)),
            h: Math.max(0.01, Math.min(1, box.height / targetNaturalSize.height)),
            kind: mapped.kind,
            sel: mapped.tag,
            title: mapped.text,
            rows: mapped.rows,
            sourceEntry: entry,
          } satisfies SampleRegion;
        });
    }
    return [];
  }, [activeData, targetNaturalSize]);

  const boardHeight = activeData.kind === 'real' && targetNaturalSize.height ? (bp * targetNaturalSize.height) / targetNaturalSize.width : BOARD_H;

  const { onRegionsChange } = props;
  useEffect(() => {
    onRegionsChange(regions);
  }, [regions, onRegionsChange]);

  const engine = useCanvasEngine({
    appState,
    viewMode,
    bp,
    layout,
    selected,
    regions,
    boardHeight,
    onDeselect: props.onDeselect,
    onEscape: props.onDeselect,
  });

  const refContent: BoardContentSpec =
    activeData.kind === 'real' ? { kind: 'image', src: activeData.breakpoint.refImg, alt: 'Референс' } : { kind: 'mock', variant: 'ref' };
  const targetContent: BoardContentSpec =
    activeData.kind === 'real' ? { kind: 'image', src: activeData.breakpoint.targetImg, alt: 'Целевой' } : { kind: 'mock', variant: 'target' };

  const activeScore = activeData.kind === 'real' ? Math.round(activeData.breakpoint.score * 100) : (SAMPLE_SCORES[bp as Breakpoint] ?? null);

  const isSide = appState === 'results' && viewMode === 'side';
  const isOverlay = appState === 'results' && viewMode === 'overlay';
  const isDiff = appState === 'results' && viewMode === 'diff';
  const pinsOn = appState === 'results' && !isOverlay && activeData.kind !== 'error';

  // Gap 4: real state-mismatch banner — mirrors the sample-only (bp===390)
  // demo trigger, but for a real result it's driven by the actual
  // parity.status computed server-side (server/state.ts buildParityReport),
  // wired only when parityGate!=='off'. When a divergence carries a box we
  // position the banner over it (fractions of the target's natural size);
  // otherwise fall back to the same fixed decorative box the demo uses.
  const realParity = activeData.kind === 'real' ? activeData.breakpoint.parity : undefined;
  const showMismatch = !isOverlay && ((activeData.kind === 'sample' && bp === 390) || realParity?.status === 'mismatch');
  const mismatchBoxStyle = (() => {
    const fallback = { left: '24%', top: '26%', width: '52%', height: '46%' };
    if (!realParity || realParity.status !== 'mismatch' || !targetNaturalSize.width || !targetNaturalSize.height) return fallback;
    const withBox = realParity.divergences.find((d) => d.box);
    if (!withBox?.box) return fallback;
    const { x, y, width, height } = withBox.box;
    return {
      left: `${Math.max(0, Math.min(96, (x / targetNaturalSize.width) * 100))}%`,
      top: `${Math.max(0, Math.min(96, (y / targetNaturalSize.height) * 100))}%`,
      width: `${Math.max(4, Math.min(100, (width / targetNaturalSize.width) * 100))}%`,
      height: `${Math.max(4, Math.min(100, (height / targetNaturalSize.height) * 100))}%`,
    };
  })();

  const selectedRegion = selected != null ? regions[selected] : null;

  const contentDims = engine.contentDims();
  const mmS = Math.min(120 / contentDims.cw, 80 / contentDims.ch);
  const mmBoards = isSide
    ? [
        { left: 6, top: 6, width: bp * mmS, height: boardHeight * mmS, accent: 'var(--border2)' },
        { left: 6 + (bp + BOARD_GAP) * mmS, top: 6, width: bp * mmS, height: boardHeight * mmS, accent: 'var(--red)' },
      ]
    : [{ left: 6, top: 6, width: bp * mmS, height: boardHeight * mmS, accent: 'var(--red)' }];

  const onTargetImgLoad = (w: number, h: number) => setTargetNaturalSize({ width: w, height: h });

  return (
    <main style={props.wrapStyle}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
        {appState === 'results' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderBottom: '1px solid var(--hair)',
              background: 'var(--surface)',
              backdropFilter: 'blur(22px) saturate(150%)',
              flexShrink: 0,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {props.breakpoints.map((w) => {
                const active = w === bp;
                const s = scoreForBp(result, w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => props.onBpChange(w)}
                    className="ddmono"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      padding: '5px 11px',
                      borderRadius: 9,
                      fontSize: 11.5,
                      border: `1px solid ${active ? 'var(--scan)' : 'var(--border)'}`,
                      background: active ? 'var(--scan-soft)' : 'var(--bg)',
                      color: 'var(--text)',
                      transition: 'all .15s var(--ease)',
                    }}
                  >
                    <span>{w}</span>
                    {s != null ? (
                      <ScoreChip score={s} size="sm" />
                    ) : (
                      <TriangleAlert size={11} strokeWidth={2.1} style={{ color: 'var(--red)' }} aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 2 }}>
              {(
                [
                  { k: 'side' as const, label: 'Рядом', icon: <Columns2 size={14} strokeWidth={1.9} aria-hidden="true" /> },
                  { k: 'overlay' as const, label: 'Наложение', icon: <OverlayIcon size={14} strokeWidth={1.9} aria-hidden="true" /> },
                  { k: 'diff' as const, label: 'Diff', icon: <ScanLine size={14} strokeWidth={1.9} aria-hidden="true" /> },
                ]
              ).map((v) => {
                const active = viewMode === v.k;
                return (
                  <button
                    key={v.k}
                    type="button"
                    onClick={() => props.onViewModeChange(v.k)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 13px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 500,
                      background: active ? 'var(--elevated)' : 'transparent',
                      color: active ? 'var(--text)' : 'var(--text2)',
                      transition: 'all .15s var(--ease)',
                    }}
                  >
                    {v.icon}
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          ref={engine.vpRef}
          onMouseDown={engine.onCanvasDown}
          onWheel={engine.onWheel}
          style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--canvasbg)', minHeight: 0, cursor: engine.cursor }}
        >
          <div
            ref={engine.gridRef}
            style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(var(--dot) 1.2px,transparent 1.2px)', pointerEvents: 'none' }}
          />

          {appState === 'idle' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                textAlign: 'center',
                gap: 24,
              }}
            >
              <Mark size={94} strokeWidth={1.1} pulse style={{ opacity: 0.9 }} />
              <div style={{ maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 11 }}>
                <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Готово к сравнению</div>
                <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
                  Вставьте референс и целевой сайт — покажу все расхождения по брейкпоинтам и соберу промпт для Claude.
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
                <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.12em' }}>
                  Недавние пары
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
                  {props.recentPairs.length > 0
                    ? props.recentPairs.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => props.onSelectRecentPair(p)}
                          className="ddmono"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            borderRadius: 10,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            fontSize: 11.5,
                            color: 'var(--text2)',
                            boxShadow: 'var(--sh1)',
                            transition: 'all .15s var(--ease)',
                          }}
                          title="Заполнить форму настройки этой парой (без автозапуска)"
                        >
                          <History size={13} strokeWidth={2} style={{ color: 'var(--text3)' }} aria-hidden="true" />
                          {p.referenceLabel} ⇄ {p.targetLabel}
                        </button>
                      ))
                    : SAMPLE_RECENT_PAIRS.map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={props.onSelectSampleRecentPair}
                          className="ddmono"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 14px',
                            borderRadius: 10,
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            fontSize: 11.5,
                            color: 'var(--text2)',
                            boxShadow: 'var(--sh1)',
                            transition: 'all .15s var(--ease)',
                          }}
                        >
                          <History size={13} strokeWidth={2} style={{ color: 'var(--text3)' }} aria-hidden="true" />
                          {label}
                        </button>
                      ))}
                </div>
              </div>
            </div>
          )}

          {appState === 'running' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 32,
                gap: 28,
              }}
            >
              <div style={{ position: 'relative', width: 'min(560px,80%)', aspectRatio: '16/10', borderRadius: 16, overflow: 'hidden', background: '#fff', boxShadow: 'var(--board-sh)' }}>
                <div style={{ position: 'absolute', inset: 0, opacity: 0.55, pointerEvents: 'none' }}>
                  <Landing variant="target" />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    height: '34%',
                    top: '-30%',
                    background: 'linear-gradient(180deg,transparent,var(--scan-soft),transparent)',
                    borderTop: '2px solid var(--scan)',
                    borderBottom: '2px solid var(--scan)',
                    animation: 'ddsweep 1.6s linear infinite',
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, width: 'min(560px,80%)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span className="ddmono" style={{ fontSize: 13, color: 'var(--text2)' }}>
                    Снимаю {bp}px…
                  </span>
                  <span className="ddmono" style={{ fontSize: 24, fontWeight: 600, color: 'var(--scan)' }}>
                    {props.runPct}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--track)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${props.runPct}%`, background: 'var(--scan)', borderRadius: 3, transition: 'width .25s var(--ease)' }} />
                </div>
              </div>
            </div>
          )}

          {appState === 'results' && (
            <div ref={engine.worldRefCallback} style={{ position: 'absolute', top: 0, left: 0, transformOrigin: '0 0', willChange: 'transform' }}>
              {activeData.kind === 'error' ? (
                <div style={{ position: 'absolute', left: 0, top: 0, width: bp }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, marginBottom: 16, color: 'var(--text2)' }}>
                    <span className="ddmono" style={{ fontSize: 16 }}>
                      {props.targetFileLabel} · {bp}px
                    </span>
                  </div>
                  <div
                    style={{
                      background: 'var(--elevated)',
                      border: '1px solid var(--red)',
                      borderRadius: 14,
                      padding: 20,
                      color: 'var(--red)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                    }}
                  >
                    <TriangleAlert size={18} strokeWidth={2} style={{ flexShrink: 0 }} aria-hidden="true" />
                    <span style={{ fontSize: 13, lineHeight: 1.5 }}>{activeData.message}</span>
                  </div>
                </div>
              ) : (
                <>
                  {isSide && (
                    <RefBoard
                      wrapStyle={{ position: 'absolute', left: 0, top: 0 }}
                      bw={bp}
                      boardHeight={boardHeight}
                      bpLabel={`${bp}px`}
                      refFileLabel={props.refFileLabel}
                      content={refContent}
                    />
                  )}
                  <div style={{ position: 'absolute', left: isSide ? bp + BOARD_GAP : 0, top: 0, width: bp }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 30, marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text2)' }}>
                        <span className="ddmono" style={{ fontSize: 16 }}>
                          Целевой · {props.targetFileLabel} · {bp}px
                        </span>
                      </div>
                      {activeScore != null && (
                        <span className="ddmono" style={{ fontSize: 16, color: scoreColorVar(activeScore), fontWeight: 600 }}>
                          {activeScore}%
                        </span>
                      )}
                    </div>
                    <BrowserFrame label={props.targetFileLabel} height={boardHeight}>
                      <div ref={engine.tgtAreaRef} style={{ position: 'relative', height: boardHeight }}>
                        {isOverlay ? (
                          <OverlayInspector
                            splitRef={engine.overlaySplitRef}
                            readoutRef={engine.readoutRef}
                            onStartDrag={engine.startOverlayDrag}
                            targetContent={targetContent}
                            refContent={refContent}
                            bw={bp}
                            onTargetImgLoad={onTargetImgLoad}
                          />
                        ) : (
                          <>
                            <DiffLayer
                              content={targetContent}
                              isDiffMode={isDiff}
                              regions={regions}
                              selected={selected}
                              onImgLoad={onTargetImgLoad}
                            />
                            {showMismatch && (
                              <div
                                style={{
                                  position: 'absolute',
                                  ...mismatchBoxStyle,
                                  border: '2px dashed var(--amber)',
                                  borderRadius: 10,
                                  background:
                                    'repeating-linear-gradient(45deg,var(--amber-soft),var(--amber-soft) 10px,transparent 10px,transparent 20px)',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  justifyContent: 'flex-end',
                                  padding: 8,
                                  pointerEvents: 'none',
                                }}
                              >
                                <span
                                  className="ddmono"
                                  style={{ fontSize: 12, background: 'var(--amber)', color: '#1a1204', padding: '3px 9px', borderRadius: 6, fontWeight: 600 }}
                                >
                                  исключено
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </BrowserFrame>
                  </div>
                </>
              )}
            </div>
          )}

          {pinsOn && (
            <>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 54, overflow: 'visible' }}>
                <line
                  ref={engine.connLineRef}
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={0}
                  stroke="var(--scan)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  style={{ display: selected != null ? 'block' : 'none' }}
                />
              </svg>
              <SelectionRing ringRef={engine.ringRef} />
              {regions.map((r, i) => (
                <InspectPin
                  key={i}
                  n={i + 1}
                  selected={selected === i}
                  kindColor={KIND_META[r.kind].color}
                  title={r.sel}
                  setRef={engine.setPinRef(i)}
                  onSelect={() => props.onSelectRegion(i)}
                />
              ))}
              {selectedRegion && (
                <InspectCallout
                  calloutRef={engine.calloutRef}
                  selector={selectedRegion.sel}
                  title={selectedRegion.title}
                  kind={selectedRegion.kind}
                  rows={selectedRegion.rows}
                  pointCopied={props.pointCopied}
                  onCopyPointPrompt={() => props.onCopyPointPrompt(selectedRegion)}
                  onDeselect={props.onDeselect}
                />
              )}
            </>
          )}

          {appState === 'results' && (
            <>
              <ZoomHud
                zoomTextRef={engine.zoomTextRef}
                onZoomOut={engine.zoomOut}
                onZoomIn={engine.zoomIn}
                onFit={engine.zoomFit}
                onOne={engine.zoom1}
                stopDown={engine.stopDown}
              />
              <Minimap boards={mmBoards} mmRectRef={engine.mmRectRef} stopDown={engine.stopDown} />
              <div
                className="ddmono"
                style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: 16,
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '5px 12px',
                  borderRadius: 9,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--sh1)',
                  fontSize: 10.5,
                  color: 'var(--text3)',
                }}
              >
                <Mark size={13} strokeWidth={2} />
                кликните пин, чтобы сверить блок
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

