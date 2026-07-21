import type { CSSProperties } from 'react';
import type { Layout } from '../../hooks/useLayout';
import type { FigmaBlockSummary, FigmaImportResult } from '../../types';
import { FigmaSetupPanel } from './FigmaSetupPanel';
import { FigmaPreviewBoard } from './FigmaPreviewBoard';
import { FigmaBlockPanel } from './FigmaBlockPanel';

/**
 * Figma-import console (Feature 4) — takes over the same three-pane slot
 * (setup | board | inspector) the compare console uses, matching its column
 * proportions (300px | 1fr | 372px on desktop) via its own inner grid rather
 * than touching lib/middleGridLayout.ts, which stays compare-specific.
 *
 * Per-block selection is a plain block LIST (FigmaBlockPanel's accordion
 * rows), not iframe-click hit-testing — see FigmaBlockPanel.tsx's header
 * comment for why that's the deliberate MVP choice here.
 */
export function FigmaImportView({
  wrapStyle,
  layout,
  figmaUrl,
  onFigmaUrlChange,
  onImport,
  loading,
  error,
  result,
  expandedBlockId,
  onToggleBlock,
  copiedBlockId,
  onCopyBlockPrompt,
  stepsCopied,
  onCopySteps,
  onSaveStepsMd,
}: {
  wrapStyle: CSSProperties;
  layout: Layout;
  figmaUrl: string;
  onFigmaUrlChange: (v: string) => void;
  onImport: () => void;
  loading: boolean;
  error: string;
  result: FigmaImportResult | null;
  expandedBlockId: string | null;
  onToggleBlock: (id: string) => void;
  copiedBlockId: string | null;
  onCopyBlockPrompt: (block: FigmaBlockSummary) => void;
  stepsCopied: boolean;
  onCopySteps: () => void;
  onSaveStepsMd: () => void;
}) {
  // shortcut: only true desktop gets the 3-column side-by-side layout;
  // drawer/tablet/mobile all fall back to a single stacked, scrollable
  // column rather than reproducing ContextPanel/Inspector's own
  // absolute-overlay-drawer behavior (lib/middleGridLayout.ts) for this
  // feature too — acceptable for an MVP import/preview flow that isn't the
  // primary compare workflow those drawers were built for.
  const stacked = layout !== 'desktop';

  return (
    <div
      style={{
        ...wrapStyle,
        display: 'grid',
        gridTemplateColumns: stacked ? '1fr' : '300px 1fr 372px',
        gridTemplateRows: stacked ? 'auto auto auto' : 'minmax(0,1fr)',
        overflow: stacked ? 'auto' : 'hidden',
        minHeight: 0,
      }}
    >
      <div
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(22px) saturate(150%)',
          borderRight: stacked ? 'none' : '1px solid var(--hair)',
          borderBottom: stacked ? '1px solid var(--hair)' : 'none',
          minHeight: 0,
          overflow: stacked ? 'visible' : 'hidden',
        }}
      >
        <FigmaSetupPanel figmaUrl={figmaUrl} onFigmaUrlChange={onFigmaUrlChange} onImport={onImport} loading={loading} error={error} hasResult={!!result} />
      </div>

      <main style={{ minHeight: stacked ? 420 : 0, background: 'var(--canvasbg)' }}>
        <FigmaPreviewBoard result={result} loading={loading} />
      </main>

      <aside
        style={{
          background: 'var(--surface)',
          backdropFilter: 'blur(22px) saturate(150%)',
          borderLeft: stacked ? 'none' : '1px solid var(--hair)',
          borderTop: stacked ? '1px solid var(--hair)' : 'none',
          minHeight: stacked ? 320 : 0,
          overflow: 'hidden',
        }}
      >
        <FigmaBlockPanel
          result={result}
          sourceFigmaUrl={figmaUrl}
          expandedBlockId={expandedBlockId}
          onToggleBlock={onToggleBlock}
          copiedBlockId={copiedBlockId}
          onCopyBlockPrompt={onCopyBlockPrompt}
          stepsCopied={stepsCopied}
          onCopySteps={onCopySteps}
          onSaveStepsMd={onSaveStepsMd}
        />
      </aside>
    </div>
  );
}
