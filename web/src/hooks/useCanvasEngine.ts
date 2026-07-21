import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Layout } from './useLayout';
import { BOARD_GAP, BOARD_H } from '../lib/sampleContent';

export type AppState = 'idle' | 'running' | 'results';
export type ViewMode = 'side' | 'overlay' | 'diff';

/** Screen-space fractional box [0..1] of a diff region over the target render area. */
export interface EngineRegion {
  l: number;
  t: number;
  w: number;
  h: number;
}

export interface UseCanvasEngineParams {
  appState: AppState;
  viewMode: ViewMode;
  bp: number;
  layout: Layout;
  selected: number | null;
  regions: EngineRegion[];
  onDeselect: () => void;
  onEscape: () => void;
  /**
   * Board content height in board-space px. Defaults to BOARD_H (720, the
   * sample/mock board's fixed height). Real API results have a natural
   * aspect ratio (screenshots, esp. fullPage captures, are rarely 720px
   * tall) — callers pass the measured height once the target image loads so
   * zoom/fit and the minimap size the content correctly.
   */
  boardHeight?: number;
}

/**
 * The view transform {z, px, py} intentionally lives OUTSIDE React state (a
 * mutable ref) and is applied imperatively to the DOM every frame for 60fps
 * pan/zoom — per the handoff's "State Management" section. Pin/ring/callout
 * positions are likewise recomputed each frame from the target area's live
 * getBoundingClientRect() rather than baked into the transformed world (or
 * they'd shrink with zoom). Only `selected`/`viewMode`/`bp`/etc. — values
 * that affect what's rendered, not where it sits on screen — live in React
 * state, owned by the caller (useConsoleState) and passed in here as props.
 */
export function useCanvasEngine(params: UseCanvasEngineParams) {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const view = useRef({ z: 0.5, px: 60, py: 40 });
  const fitKeyRef = useRef('');
  const fitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const worldElRef = useRef<HTMLDivElement | null>(null);

  const vpRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const zoomTextRef = useRef<HTMLSpanElement | null>(null);
  const mmRectRef = useRef<HTMLDivElement | null>(null);
  const tgtAreaRef = useRef<HTMLDivElement | null>(null);
  const overlaySplitRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const calloutRef = useRef<HTMLDivElement | null>(null);
  const connLineRef = useRef<SVGLineElement | null>(null);
  const pinRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const [panning, setPanning] = useState(false);

  const contentDims = useCallback(() => {
    const { bp, viewMode, boardHeight } = paramsRef.current;
    const cw = viewMode === 'side' ? bp * 2 + BOARD_GAP : bp;
    const ch = (boardHeight ?? BOARD_H) + 46;
    return { cw, ch, bw: bp };
  }, []);

  const updateOverlay = useCallback(() => {
    const { appState, viewMode, selected, regions } = paramsRef.current;
    if (appState !== 'results' || viewMode === 'overlay') return;
    const area = tgtAreaRef.current;
    const vp = vpRef.current;
    if (!area || !vp) return;
    const R = area.getBoundingClientRect();
    const V = vp.getBoundingClientRect();

    regions.forEach((rd, i) => {
      const el = pinRefs.current[i];
      if (!el) return;
      const bx = R.left + rd.l * R.width - V.left;
      const by = R.top + rd.t * R.height - V.top;
      const visible = bx > -40 && bx < V.width + 40 && by > -40 && by < V.height + 40;
      el.style.display = visible ? 'flex' : 'none';
      el.style.left = `${bx}px`;
      el.style.top = `${by}px`;
    });

    const ring = ringRef.current;
    const callout = calloutRef.current;
    const conn = connLineRef.current;
    if (selected == null) {
      if (ring) ring.style.display = 'none';
      return;
    }
    const rd = regions[selected];
    if (!rd) {
      if (ring) ring.style.display = 'none';
      return;
    }
    const bx = R.left + rd.l * R.width - V.left;
    const by = R.top + rd.t * R.height - V.top;
    const bw2 = rd.w * R.width;
    const bh2 = rd.h * R.height;
    if (ring) {
      ring.style.display = 'block';
      ring.style.left = `${bx}px`;
      ring.style.top = `${by}px`;
      ring.style.width = `${bw2}px`;
      ring.style.height = `${bh2}px`;
    }
    if (callout) {
      const cardW = 288;
      const cardH = callout.offsetHeight || 210;
      const pad = 14;
      let cx = bx + bw2 + 26;
      if (cx + cardW > V.width - pad) cx = bx - cardW - 26;
      if (cx < pad) cx = pad;
      let cy = by - 6;
      if (cy + cardH > V.height - pad) cy = V.height - pad - cardH;
      if (cy < pad) cy = pad;
      callout.style.left = `${cx}px`;
      callout.style.top = `${cy}px`;
      if (conn) {
        const fromX = bx + (cx > bx ? bw2 : 0);
        const fromY = by + bh2 / 2;
        const toX = cx < bx ? cx + cardW : cx;
        const toY = cy + 30;
        conn.setAttribute('x1', String(fromX));
        conn.setAttribute('y1', String(fromY));
        conn.setAttribute('x2', String(toX));
        conn.setAttribute('y2', String(toY));
      }
    }
  }, []);

  const applyTransform = useCallback(() => {
    const w = worldElRef.current;
    if (w) w.style.transform = `translate(${view.current.px}px,${view.current.py}px) scale(${view.current.z})`;
    const g = gridRef.current;
    if (g) {
      g.style.backgroundSize = `${24 * view.current.z}px ${24 * view.current.z}px`;
      g.style.backgroundPosition = `${view.current.px}px ${view.current.py}px`;
    }
    const zEl = zoomTextRef.current;
    if (zEl) zEl.textContent = `${Math.round(view.current.z * 100)}%`;

    const { cw, ch } = contentDims();
    const mm = mmRectRef.current;
    const vp = vpRef.current;
    if (mm && vp) {
      const s = Math.min(120 / cw, 80 / ch);
      const vx = -view.current.px / view.current.z;
      const vy = -view.current.py / view.current.z;
      const vw = vp.clientWidth / view.current.z;
      const vh = vp.clientHeight / view.current.z;
      mm.style.left = `${6 + vx * s}px`;
      mm.style.top = `${6 + vy * s}px`;
      mm.style.width = `${Math.max(6, vw * s)}px`;
      mm.style.height = `${Math.max(6, vh * s)}px`;
    }
    updateOverlay();
  }, [contentDims, updateOverlay]);

  const fit = useCallback(() => {
    if (paramsRef.current.appState !== 'results') return;
    const vp = vpRef.current;
    if (!vp || !vp.clientWidth || !worldElRef.current) {
      clearTimeout(fitTimerRef.current);
      fitTimerRef.current = setTimeout(fit, 60);
      return;
    }
    const { cw, ch } = contentDims();
    const z = Math.max(0.08, Math.min(1.3, Math.min((vp.clientWidth - 90) / cw, (vp.clientHeight - 90) / ch)));
    view.current.z = z;
    view.current.px = (vp.clientWidth - cw * z) / 2;
    view.current.py = Math.max(24, (vp.clientHeight - ch * z) / 2);
    applyTransform();
  }, [applyTransform, contentDims]);

  const worldRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      worldElRef.current = el;
      if (el) requestAnimationFrame(fit);
    },
    [fit],
  );

  const zoomAt = useCallback(
    (cx: number, cy: number, f: number) => {
      const nz = Math.max(0.08, Math.min(3, view.current.z * f));
      view.current.px = cx - (cx - view.current.px) * (nz / view.current.z);
      view.current.py = cy - (cy - view.current.py) * (nz / view.current.z);
      view.current.z = nz;
      applyTransform();
    },
    [applyTransform],
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (paramsRef.current.appState !== 'results') return;
      e.preventDefault();
      const vp = vpRef.current;
      if (!vp) return;
      const r = vp.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    },
    [zoomAt],
  );

  const onCanvasDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (paramsRef.current.appState !== 'results') return;
      const sx = e.clientX;
      const sy = e.clientY;
      const startPx = view.current.px;
      const startPy = view.current.py;
      let moved = false;

      function move(ev: MouseEvent) {
        if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 3) moved = true;
        view.current.px = startPx + (ev.clientX - sx);
        view.current.py = startPy + (ev.clientY - sy);
        applyTransform();
      }
      function up() {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        setPanning(false);
        if (!moved) paramsRef.current.onDeselect();
      }
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      setPanning(true);
    },
    [applyTransform],
  );

  const stopDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const zoomIn = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1.2);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1 / 1.2);
  }, [zoomAt]);

  const zoomFit = useCallback(() => fit(), [fit]);

  const zoom1 = useCallback(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const { cw } = contentDims();
    view.current.z = 1;
    view.current.px = (vp.clientWidth - cw) / 2;
    view.current.py = 24;
    applyTransform();
  }, [applyTransform, contentDims]);

  const startOverlayDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cont = overlaySplitRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const bw = paramsRef.current.bp;

    function move(ev: MouseEvent) {
      let f = (ev.clientX - rect.left) / rect.width;
      f = Math.max(0, Math.min(1, f));
      cont!.style.setProperty('--dd-split', `${(f * 100).toFixed(1)}%`);
      if (readoutRef.current) readoutRef.current.textContent = `x=${Math.round(f * bw)}px · ${Math.round(f * 100)}%`;
    }
    move(e.nativeEvent);
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  const setPinRef = useCallback(
    (i: number) => (el: HTMLButtonElement | null) => {
      pinRefs.current[i] = el;
    },
    [],
  );

  // Mount: staggered fit passes (matches the prototype's [0,160,400]ms
  // schedule — the first pass often runs before fonts/images finish
  // reflowing the board, so later passes correct any residual drift),
  // resize -> refit, Escape -> deselect.
  useEffect(() => {
    const timers = [0, 160, 400].map((t) => setTimeout(() => fit(), t));
    function onResize() {
      fit();
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') paramsRef.current.onEscape();
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeydown);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(fitTimerRef.current);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeydown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fit whenever bp/viewMode/appState/layout change (a real content-shape
  // change); otherwise just re-apply the existing transform (e.g. a
  // selection change, which only needs updateOverlay()).
  const fitKey = `${params.bp}|${params.viewMode}|${params.appState}|${params.layout}|${params.boardHeight ?? BOARD_H}`;
  useEffect(() => {
    if (fitKey !== fitKeyRef.current) {
      fitKeyRef.current = fitKey;
      requestAnimationFrame(() => fit());
    } else {
      applyTransform();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Selection changed: reposition ring/callout/connector immediately.
  useEffect(() => {
    requestAnimationFrame(() => updateOverlay());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.selected]);

  const cursor = useMemo(() => (params.appState === 'results' ? (panning ? 'grabbing' : 'grab') : 'default'), [params.appState, panning]);

  return {
    vpRef,
    worldRefCallback,
    gridRef,
    zoomTextRef,
    mmRectRef,
    tgtAreaRef,
    overlaySplitRef,
    readoutRef,
    ringRef,
    calloutRef,
    connLineRef,
    setPinRef,
    onWheel,
    onCanvasDown,
    stopDown,
    zoomIn,
    zoomOut,
    zoomFit,
    zoom1,
    startOverlayDrag,
    panning,
    cursor,
    contentDims,
  };
}
