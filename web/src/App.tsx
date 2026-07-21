import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompareParams } from './api';
import type { CompareResponse, FigmaBlockSummary, FigmaImportResult, ReferenceType } from './types';
import { buildCaptureOptions, cloneCaptureFormState } from './lib/captureForm';
import { useCaptureForm } from './hooks/useCaptureForm';
import { useTheme } from './hooks/useTheme';
import { useLayout } from './hooks/useLayout';
import type { AppState, ViewMode } from './hooks/useCanvasEngine';
import { computeMiddleGridLayout, type DrawerOpen, type MobileTab } from './lib/middleGridLayout';
import { getActiveBoardData } from './lib/boardData';
import { getStyleGroups } from './lib/styleGroups';
import { startCompareStream, type CompareStreamHandle } from './lib/jobStream';
import { loadRecentPairs, saveRecentPair, type RecentPair } from './lib/recentPairs';
import { buildElementPointPrompt } from './lib/pointPrompt';
import { buildFigmaBlockPrompt } from './lib/figmaBlockPrompt';
import { importFigma } from './figmaImportApi';
import { BREAKPOINTS, SAMPLE_AVG_SCORE, SAMPLE_PROMPT, SAMPLE_WORST_BP, samplePointPrompt, type SampleRegion } from './lib/sampleContent';
import { Glows } from './components/Glows';
import { CommandBar } from './components/CommandBar';
import { ActivityRail } from './components/ActivityRail';
import { ContextPanel } from './components/ContextPanel/ContextPanel';
import type { BpProgress } from './components/ContextPanel/BreakpointMatrix';
import { Canvas } from './components/Canvas/Canvas';
import { Inspector } from './components/Inspector/Inspector';
import { FigmaImportView } from './components/FigmaImport/FigmaImportView';
import { StatusBar } from './components/StatusBar';
import { MobileTabBar } from './components/MobileTabBar';
import { SettingsModal } from './components/SettingsModal/SettingsModal';

/** Which top-level console is shown in the middle three-pane slot — the original compare workflow, or the Figma-import workflow (Feature 4). Orthogonal to `appState`/`viewMode` (those stay compare-specific). */
type ConsoleMode = 'compare' | 'figma';

function shortLabel(url: string, fallback: string): string {
  const trimmed = url.trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

/**
 * Builds a Record<number, T> from a key list — used instead of
 * `Object.fromEntries(keys.map(k => [k, v]))`, whose array-literal-of-tuples
 * argument silently falls back to Object.fromEntries' `any`-returning
 * overload (TS doesn't infer `[K, T]` tuples from a bare `.map()` callback
 * without contextual typing) and would quietly erase type-checking here.
 */
function recordFromKeys<T>(keys: readonly number[], value: (key: number) => T): Record<number, T> {
  const out: Record<number, T> = {};
  for (const key of keys) out[key] = value(key);
  return out;
}

const VIEW_MODE_LABEL: Record<ViewMode, string> = { side: 'рядом', overlay: 'наложение', diff: 'diff' };

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const layout = useLayout();

  const [appState, setAppState] = useState<AppState>('idle');
  const [viewMode, setViewModeRaw] = useState<ViewMode>('side');
  const [bp, setBpRaw] = useState<number>(1440);
  const [selected, setSelected] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState<DrawerOpen>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('canvas');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [consoleMode, setConsoleMode] = useState<ConsoleMode>('compare');

  // --- Figma import (Feature 4) ---------------------------------------------
  const [figmaImportUrl, setFigmaImportUrl] = useState('');
  const [figmaImportResult, setFigmaImportResult] = useState<FigmaImportResult | null>(null);
  const [figmaImportLoading, setFigmaImportLoading] = useState(false);
  const [figmaImportError, setFigmaImportError] = useState('');
  const [expandedFigmaBlockId, setExpandedFigmaBlockId] = useState<string | null>(null);
  const [copiedFigmaBlockId, setCopiedFigmaBlockId] = useState<string | null>(null);
  const [figmaStepsCopied, setFigmaStepsCopied] = useState(false);
  const figmaBlockCopyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const figmaStepsCopyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // --- Setup form state (wires the real POST /api/compare) -----------------
  const [referenceType, setReferenceType] = useState<ReferenceType>('url');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [activeBreakpoints, setActiveBreakpoints] = useState<Record<number, boolean>>({ 1440: true, 1024: true, 768: true, 390: true });
  const [customWidths, setCustomWidths] = useState<number[]>([]);
  const [customWidthInput, setCustomWidthInput] = useState('');
  const [fullPage, setFullPage] = useState(false);
  const [referenceCapture, setReferenceCapture] = useCaptureForm();
  const [targetCapture, setTargetCapture] = useCaptureForm();
  const [refCapOpen, setRefCapOpen] = useState(false);
  const [tgtCapOpen, setTgtCapOpen] = useState(false);

  const selectedBreakpoints = useMemo(
    () => [...BREAKPOINTS.filter((p) => activeBreakpoints[p]), ...customWidths].sort((a, b) => b - a),
    [activeBreakpoints, customWidths],
  );

  // --- Compare lifecycle -----------------------------------------------------
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [compareError, setCompareError] = useState('');
  const [runPct, setRunPct] = useState(0);
  const [slow, setSlow] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [pointCopied, setPointCopied] = useState(false);
  // Real per-breakpoint status for the BreakpointMatrix (Gap 1), driven by
  // SSE step/breakpoint events — see runCompare() below.
  const [bpProgress, setBpProgress] = useState<Record<number, BpProgress>>({});
  // Real recent-pairs history (Gap 3), persisted to localStorage on each
  // successful compare — see lib/recentPairs.ts.
  const [recentPairs, setRecentPairs] = useState<RecentPair[]>(() => loadRecentPairs());

  // Only drives the elapsed-seconds clock now — runPct comes from real SSE
  // events (see runCompare), not a simulated ramp.
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const runStartRef = useRef<number>(0);
  const runBreakpointCountRef = useRef<number>(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointCopyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const streamRef = useRef<CompareStreamHandle | null>(null);
  const stalledRef = useRef(false);

  useEffect(
    () => () => {
      clearInterval(progressTimerRef.current);
      clearTimeout(copyTimerRef.current);
      clearTimeout(pointCopyTimerRef.current);
      clearTimeout(figmaBlockCopyTimerRef.current);
      clearTimeout(figmaStepsCopyTimerRef.current);
      streamRef.current?.cancel();
    },
    [],
  );

  const setBp = useCallback((next: number) => {
    setBpRaw(next);
    setSelected(null);
  }, []);
  const setViewMode = useCallback((next: ViewMode) => {
    setViewModeRaw(next);
    setSelected(null);
  }, []);

  // Esc closes the settings modal (in addition to useCanvasEngine's own Esc
  // -> deselect-pin handling, which keeps firing underneath — harmless).
  useEffect(() => {
    if (!settingsOpen) return;
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false);
    }
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [settingsOpen]);

  function stopProgressTimer() {
    clearInterval(progressTimerRef.current);
    progressTimerRef.current = undefined;
  }

  async function runCompare() {
    // The Compare button (CommandBar) stays visible even while the Figma-
    // import console is showing (Feature 4) — running a compare should jump
    // the user back to the compare console so they actually see it happen.
    setConsoleMode('compare');
    if (selectedBreakpoints.length === 0) {
      setCompareError('Выберите хотя бы один брейкпоинт.');
      return;
    }
    if (!targetUrl.trim()) {
      setCompareError('Укажите URL целевого сайта.');
      return;
    }
    if (referenceType === 'url' && !referenceUrl.trim()) {
      setCompareError('Укажите URL референса или переключитесь на другой источник.');
      return;
    }
    if (referenceType === 'image' && !imageFile) {
      setCompareError('Загрузите изображение референса.');
      return;
    }
    if (referenceType === 'figma' && !figmaUrl.trim()) {
      setCompareError('Укажите ссылку на Figma-файл (frame).');
      return;
    }

    // The Compare button is disabled while appState==='running' (see
    // CommandBar `comparing` prop), so a live stream shouldn't exist here —
    // guard defensively against any lingering handle anyway.
    streamRef.current?.cancel();
    streamRef.current = null;

    setCompareError('');
    setSelected(null);
    setAppState('running');
    setRunPct(0);
    setSlow(false);
    setElapsedSeconds(0);
    stalledRef.current = false;
    runStartRef.current = Date.now();
    runBreakpointCountRef.current = selectedBreakpoints.length;
    setBpProgress(recordFromKeys(selectedBreakpoints, () => ({ status: 'queued' as const })));

    stopProgressTimer();
    progressTimerRef.current = setInterval(() => {
      setElapsedSeconds(Math.round((Date.now() - runStartRef.current) / 1000));
    }, 250);

    // Captured up front so the async SSE handlers below (which may run long
    // after the user could have edited the form again) always describe
    // *this* run, not whatever the form currently holds.
    const capturedImageFile = imageFile;
    const params: CompareParams = {
      referenceType,
      referenceUrl: referenceType === 'url' ? referenceUrl.trim() : undefined,
      figmaUrl: referenceType === 'figma' ? figmaUrl.trim() : undefined,
      targetUrl: targetUrl.trim(),
      breakpoints: selectedBreakpoints,
      fullPage,
      image: referenceType === 'image' ? imageFile : null,
      referenceCapture: referenceType === 'url' ? buildCaptureOptions(referenceCapture) : undefined,
      targetCapture: buildCaptureOptions(targetCapture),
    };

    function bumpPct(next: number) {
      const clamped = Math.max(0, Math.min(100, Math.round(next)));
      setRunPct((p) => Math.max(p, clamped));
      setSlow(stalledRef.current || clamped > 68);
    }

    try {
      const handle = await startCompareStream(params, {
        onJob: (event) => {
          bumpPct(event.pct);
          if (event.status === 'error') {
            stopProgressTimer();
            streamRef.current = null;
            setAppState('idle');
            setRunPct(0);
            setSlow(false);
            setCompareError(event.error ?? 'Сравнение завершилось с ошибкой.');
          }
          // 'cancelled' is driven locally by cancelRun() (which already
          // flips appState synchronously); 'done' is followed immediately
          // by the onResult flip to 'results' below and needs no handling
          // here beyond the pct bump above.
        },
        onStep: (event) => {
          bumpPct(event.pct);
          if (event.breakpoint == null) return;
          const bp = event.breakpoint;
          setBpProgress((prev) => {
            const cur = prev[bp];
            if (!cur || cur.status === 'done' || cur.status === 'error') return prev; // never downgrade a terminal per-bp state
            if (event.status === 'error') return { ...prev, [bp]: { status: 'error' } };
            if (cur.status === 'queued') return { ...prev, [bp]: { status: 'running' } };
            return prev;
          });
        },
        onStall: () => {
          stalledRef.current = true;
          setSlow(true);
        },
        onBreakpoint: (event) => {
          setBpProgress((prev) => ({ ...prev, [event.result.breakpoint]: { status: 'done', score: Math.round(event.result.score * 100) } }));
        },
        onResult: (event) => {
          stopProgressTimer();
          setElapsedSeconds(Math.round((Date.now() - runStartRef.current) / 1000));
          setRunPct(100);
          setResult(event.response);
          setBp(event.response.summary.worstBreakpoint ?? event.response.breakpoints[0]?.breakpoint ?? selectedBreakpoints[0]);
          setAppState('results');
          streamRef.current = null;

          const referenceLabel = shortLabel(
            params.referenceType === 'url'
              ? (params.referenceUrl ?? '')
              : params.referenceType === 'figma'
                ? (params.figmaUrl ?? '')
                : (capturedImageFile?.name ?? 'изображение'),
            'a.html',
          );
          const targetLabel = shortLabel(params.targetUrl, 'b.html');
          setRecentPairs(
            saveRecentPair({
              referenceLabel,
              targetLabel,
              params: {
                referenceType: params.referenceType,
                referenceUrl: params.referenceUrl,
                figmaUrl: params.figmaUrl,
                targetUrl: params.targetUrl,
                breakpoints: params.breakpoints,
                fullPage: params.fullPage,
              },
            }),
          );
        },
        onTransportError: (message) => {
          stopProgressTimer();
          streamRef.current = null;
          setAppState('idle');
          setRunPct(0);
          setSlow(false);
          setCompareError(message);
        },
      });
      streamRef.current = handle;
    } catch (err) {
      stopProgressTimer();
      setAppState('idle');
      setRunPct(0);
      setSlow(false);
      setCompareError(err instanceof Error ? err.message : String(err));
    }
  }

  function cancelRun() {
    stopProgressTimer();
    streamRef.current?.cancel();
    streamRef.current = null;
    setRunPct(0);
    setSlow(false);
    setAppState(result ? 'results' : 'idle');
  }

  function newComparison() {
    stopProgressTimer();
    streamRef.current?.cancel();
    streamRef.current = null;
    setAppState('idle');
    setRunPct(0);
    setSlow(false);
    setSelected(null);
  }

  /** A real recent pair (Gap 3) was clicked — repopulate the setup form, never auto-run. */
  function applyRecentPair(pair: RecentPair) {
    const { params } = pair;
    const knownWidths = BREAKPOINTS as readonly number[]; // widen for a plain numeric membership check below
    setReferenceType(params.referenceType);
    setReferenceUrl(params.referenceUrl ?? '');
    setFigmaUrl(params.figmaUrl ?? '');
    setTargetUrl(params.targetUrl);
    setActiveBreakpoints(recordFromKeys(BREAKPOINTS, (w) => params.breakpoints.includes(w)));
    setCustomWidths(params.breakpoints.filter((w) => !knownWidths.includes(w)).sort((a, b) => b - a));
    setFullPage(params.fullPage);
  }

  /** A sample/demo chip was clicked (shown only while there's no real history yet) — mirrors the prototype's own recent-pairs affordance by jumping straight to the sample/demo results view. */
  function selectSampleRecentPair() {
    setAppState('results');
  }

  // --- Prompt copy/save --------------------------------------------------
  const promptText = result ? result.claudePrompt : SAMPLE_PROMPT;

  function copyPrompt() {
    navigator.clipboard?.writeText(promptText).catch(() => undefined);
    setCopied(true);
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1600);
  }

  function saveMd() {
    const blob = new Blob([promptText], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const refSlug = shortLabel(referenceType === 'url' ? referenceUrl : referenceType === 'figma' ? figmaUrl : imageFile?.name ?? 'a', 'a').replace(
      /[^a-z0-9.-]+/gi,
      '-',
    );
    const targetSlug = shortLabel(targetUrl, 'b').replace(/[^a-z0-9.-]+/gi, '-');
    a.download = `design-diff_${refSlug}-vs-${targetSlug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  // --- Figma import (Feature 4) ---------------------------------------------
  async function runFigmaImport() {
    const url = figmaImportUrl.trim();
    if (!url) {
      setFigmaImportError('Вставьте ссылку на фрейм в Figma.');
      return;
    }
    setFigmaImportLoading(true);
    setFigmaImportError('');
    try {
      const result = await importFigma(url);
      setFigmaImportResult(result);
      setExpandedFigmaBlockId(null);
    } catch (err) {
      setFigmaImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setFigmaImportLoading(false);
    }
  }

  function toggleFigmaBlock(id: string) {
    setExpandedFigmaBlockId((prev) => (prev === id ? null : id));
  }

  function copyFigmaBlockPrompt(block: FigmaBlockSummary) {
    const text = buildFigmaBlockPrompt(block, figmaImportUrl.trim());
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopiedFigmaBlockId(block.id);
    clearTimeout(figmaBlockCopyTimerRef.current);
    figmaBlockCopyTimerRef.current = setTimeout(() => setCopiedFigmaBlockId(null), 1600);
  }

  function copyFigmaSteps() {
    if (!figmaImportResult) return;
    navigator.clipboard?.writeText(figmaImportResult.steps).catch(() => undefined);
    setFigmaStepsCopied(true);
    clearTimeout(figmaStepsCopyTimerRef.current);
    figmaStepsCopyTimerRef.current = setTimeout(() => setFigmaStepsCopied(false), 1600);
  }

  function saveFigmaStepsMd() {
    if (!figmaImportResult) return;
    const blob = new Blob([figmaImportResult.steps], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const slug = shortLabel(figmaImportResult.blockTree.name, 'figma-import').replace(/[^a-z0-9.-]+/gi, '-');
    a.download = `figma-import_${slug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function copyPointPrompt(region: SampleRegion) {
    // Real regions (Canvas.tsx regions memo) carry the original ElementDiffEntry
    // as sourceEntry — format a surgical, server-consistent instruction from
    // it; the sample/demo regions never set sourceEntry, so they keep using
    // the fixed demo text.
    const text = region.sourceEntry ? buildElementPointPrompt(region.sourceEntry, targetFileLabel, refFileLabel) : samplePointPrompt(region);
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setPointCopied(true);
    clearTimeout(pointCopyTimerRef.current);
    pointCopyTimerRef.current = setTimeout(() => setPointCopied(false), 1600);
  }

  // --- Derived display data ------------------------------------------------
  const refFileLabel = shortLabel(referenceType === 'url' ? referenceUrl : referenceType === 'figma' ? figmaUrl : (imageFile?.name ?? ''), 'a.html');
  const targetFileLabel = shortLabel(targetUrl, 'b.html');

  const avgScore = appState === 'results' ? (result ? Math.round(result.summary.avgScore * 100) : SAMPLE_AVG_SCORE) : null;
  const worstBp = appState === 'results' ? (result ? result.summary.worstBreakpoint : SAMPLE_WORST_BP) : null;
  const bpCountForCommandBar = appState === 'results' ? (result ? result.breakpoints.length : BREAKPOINTS.length) : 0;

  const canvasBreakpoints = result ? result.breakpoints.map((b) => b.breakpoint) : appState === 'running' ? selectedBreakpoints : BREAKPOINTS;

  const activeData = useMemo(() => getActiveBoardData(result, bp), [result, bp]);
  const styleGroups = useMemo(() => getStyleGroups(activeData), [activeData]);

  // Inspector needs the SAME region list (and indices) the Canvas pins use,
  // for bidirectional selection sync — Canvas recomputes this internally
  // too (it also needs live natural-image-size for real screenshots), so we
  // mirror just enough here for the Inspector's list. For the sample/demo
  // and error cases this is exact; for real results with images still
  // loading it's momentarily empty until Canvas measures the target image,
  // same as the pins themselves.
  const [regionsForInspector, setRegionsForInspector] = useState<SampleRegion[]>([]);

  // --- Middle grid layout ---------------------------------------------------
  const gridLayout = computeMiddleGridLayout(layout, drawerOpen, mobileTab);

  function toggleContextDrawer() {
    setDrawerOpen((d) => (d === 'context' ? null : 'context'));
  }
  function toggleInspectorDrawer() {
    setDrawerOpen((d) => (d === 'inspector' ? null : 'inspector'));
  }
  function closeDrawer() {
    setDrawerOpen(null);
  }

  // --- Status bar text -------------------------------------------------------
  const totalBp = appState === 'running' ? runBreakpointCountRef.current : bpCountForCommandBar;
  // Real count from SSE-driven per-bp status (bpProgress), not a pct-based approximation.
  const doneCount = appState === 'running' ? Object.values(bpProgress).filter((s) => s.status === 'done' || s.status === 'error').length : 0;
  let statusColor = 'var(--text2)';
  let dotColor = 'var(--text3)';
  let pulsing = false;
  let statusText = '';
  let statusRight = '';
  if (appState === 'idle') {
    statusText = 'Готов к сравнению — вставьте пару и нажмите «Сравнить»';
    statusRight = '—';
  } else if (appState === 'running') {
    statusColor = 'var(--scan)';
    dotColor = 'var(--scan)';
    pulsing = true;
    statusText = `Сравниваю · ${bp}px · снимок ${doneCount}/${totalBp} bp · ${formatMMSS(elapsedSeconds)}`;
    statusRight = `${doneCount}/${totalBp} bp готово`;
  } else {
    statusColor = 'var(--green)';
    dotColor = 'var(--green)';
    pulsing = true;
    statusText = result
      ? `Готово · среднее ${avgScore}% · худший ${worstBp}px · ${bpCountForCommandBar} bp · ${formatMMSS(elapsedSeconds)}`
      : 'Готово · демо-данные · среднее 76% · худший 390px · 4 bp';
    statusRight = `${VIEW_MODE_LABEL[viewMode]} · ${bp}px`;
  }

  const setupProps = {
    referenceType,
    onReferenceTypeChange: setReferenceType,
    referenceUrl,
    onReferenceUrlChange: setReferenceUrl,
    figmaUrl,
    onFigmaUrlChange: setFigmaUrl,
    imageFile,
    onImageFileChange: setImageFile,
    targetUrl,
    onTargetUrlChange: setTargetUrl,
    referenceCapture,
    onReferenceCaptureChange: setReferenceCapture,
    refCapOpen,
    onToggleRefCapOpen: () => setRefCapOpen((v) => !v),
    targetCapture,
    onTargetCaptureChange: setTargetCapture,
    tgtCapOpen,
    onToggleTgtCapOpen: () => setTgtCapOpen((v) => !v),
    onCopyRefToTarget: () => {
      setTargetCapture(cloneCaptureFormState(referenceCapture));
      setTgtCapOpen(true);
    },
    onCopyTargetToRef: () => {
      setReferenceCapture(cloneCaptureFormState(targetCapture));
      setRefCapOpen(true);
    },
    activeBreakpoints,
    onToggleBreakpoint: (w: number) => setActiveBreakpoints((s) => ({ ...s, [w]: !s[w] })),
    customWidths,
    onRemoveCustomWidth: (w: number) => setCustomWidths((ws) => ws.filter((x) => x !== w)),
    customWidthInput,
    onCustomWidthInputChange: setCustomWidthInput,
    onAddCustomWidth: () => {
      const n = Number(customWidthInput);
      if (!Number.isFinite(n) || n < 200 || n > 4000) return;
      setCustomWidths((ws) => (ws.includes(n) ? ws : [...ws, n].sort((a, b) => b - a)));
      setCustomWidthInput('');
    },
    fullPage,
    onFullPageChange: setFullPage,
  };

  const statusBarNode = (
    <StatusBar
      wrapStyle={{}}
      appState={appState}
      statusColor={statusColor}
      dotColor={dotColor}
      pulsing={pulsing}
      statusText={statusText}
      statusRight={statusRight}
      slow={slow && appState === 'running'}
      onCancel={cancelRun}
    />
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'Fira Sans',system-ui,sans-serif",
        fontSize: 14,
        lineHeight: 1.5,
        display: 'grid',
        gridTemplateRows: gridLayout.rootRows,
        userSelect: 'none',
      }}
    >
      <Glows theme={theme} />

      <CommandBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onCompare={runCompare}
        comparing={appState === 'running'}
        refLabel={refFileLabel}
        targetLabel={targetFileLabel}
        wide={layout === 'desktop' || layout === 'drawer'}
        bpCount={bpCountForCommandBar}
        worstBp={worstBp}
        avgScore={avgScore}
        figmaModeActive={consoleMode === 'figma'}
        onToggleFigmaMode={() => setConsoleMode((m) => (m === 'figma' ? 'compare' : 'figma'))}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: gridLayout.midCols,
          gridTemplateRows: 'minmax(0,1fr)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {gridLayout.scrimShow && (
          <div onClick={closeDrawer} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(2px)' }} />
        )}

        <ActivityRail
          layout={layout}
          viewMode={viewMode}
          onToggleContextDrawer={toggleContextDrawer}
          onToggleInspectorDrawer={toggleInspectorDrawer}
          onSetDiffView={() => setViewMode('diff')}
          onNewComparison={newComparison}
        />

        {consoleMode === 'figma' ? (
          <FigmaImportView
            wrapStyle={{ gridColumn: layout === 'mobile' ? '1 / -1' : '2 / -1', minHeight: 0, overflow: 'hidden' }}
            layout={layout}
            figmaUrl={figmaImportUrl}
            onFigmaUrlChange={setFigmaImportUrl}
            onImport={runFigmaImport}
            loading={figmaImportLoading}
            error={figmaImportError}
            result={figmaImportResult}
            expandedBlockId={expandedFigmaBlockId}
            onToggleBlock={toggleFigmaBlock}
            copiedBlockId={copiedFigmaBlockId}
            onCopyBlockPrompt={copyFigmaBlockPrompt}
            stepsCopied={figmaStepsCopied}
            onCopySteps={copyFigmaSteps}
            onSaveStepsMd={saveFigmaStepsMd}
          />
        ) : (
          <>
            <ContextPanel
              wrapStyle={gridLayout.contextWrap}
              running={appState === 'running'}
              runPct={runPct}
              breakpoints={canvasBreakpoints}
              bpStatuses={bpProgress}
              setupProps={setupProps}
            />

            <Canvas
              wrapStyle={gridLayout.canvasWrap}
              appState={appState}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              bp={bp}
              breakpoints={canvasBreakpoints}
              onBpChange={setBp}
              layout={layout}
              selected={selected}
              onSelectRegion={setSelected}
              onDeselect={() => setSelected(null)}
              result={result}
              refFileLabel={refFileLabel}
              targetFileLabel={targetFileLabel}
              runPct={runPct}
              pointCopied={pointCopied}
              onCopyPointPrompt={copyPointPrompt}
              recentPairs={recentPairs}
              onSelectRecentPair={applyRecentPair}
              onSelectSampleRecentPair={selectSampleRecentPair}
              onRegionsChange={setRegionsForInspector}
            />

            <Inspector
              wrapStyle={gridLayout.inspectorWrap}
              regions={regionsForInspector}
              selected={selected}
              onSelectRegion={setSelected}
              styleGroups={styleGroups}
              promptText={promptText}
              copied={copied}
              onCopyPrompt={copyPrompt}
              onSaveMd={saveMd}
            />
          </>
        )}

        {gridLayout.statusPaneWrap && <div style={gridLayout.statusPaneWrap}>{statusBarNode}</div>}
      </div>

      <footer style={gridLayout.footerWrap}>
        {layout === 'mobile' ? <MobileTabBar active={mobileTab} onChange={setMobileTab} /> : statusBarNode}
      </footer>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} theme={theme} onToggleTheme={toggleTheme} />}

      {compareError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: layout === 'mobile' ? 64 : 44,
            transform: 'translateX(-50%)',
            zIndex: 200,
            maxWidth: '90%',
            background: 'var(--elevated)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            borderRadius: 10,
            padding: '10px 14px',
            fontSize: 12.5,
            boxShadow: 'var(--sh2)',
          }}
        >
          {compareError}
        </div>
      )}
    </div>
  );
}
