import { Check, ChevronDown, Copy } from 'lucide-react';
import type { FigmaBlockSummary, FigmaImportResult } from '../../types';
import { buildFigmaBlockPrompt } from '../../lib/figmaBlockPrompt';
import { PromptFooter } from '../Inspector/PromptFooter';

/**
 * One block row — click to expand an accordion with its exact style set and
 * a "copy prompt for this block" button. Chosen over iframe-click hit-testing
 * (see FigmaImportView.tsx header comment) as the MVP per-block selection
 * mechanism: the preview iframe loads the actual runs/figma-<id>/preview.html
 * by URL rather than injected markup, so wiring a postMessage-based click
 * bridge would mean adding a script to the generated page and a listener
 * here — real effort for a target this MVP explicitly permits skipping.
 */
function FigmaBlockRow({
  block,
  expanded,
  onToggle,
  onCopy,
  copied,
  sourceUrl,
}: {
  block: FigmaBlockSummary;
  expanded: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  sourceUrl: string;
}) {
  return (
    <div
      style={{
        background: expanded ? 'var(--scan-soft)' : 'var(--bg)',
        border: `1px solid ${expanded ? 'var(--scan)' : 'var(--border)'}`,
        borderRadius: 11,
        overflow: 'hidden',
        transition: 'all .15s var(--ease)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        style={{
          width: '100%',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 11px',
        }}
      >
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          style={{ color: 'var(--text3)', flexShrink: 0, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform .15s var(--ease)' }}
          aria-hidden="true"
        />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="ddmono" style={{ display: 'block', fontSize: 11, color: 'var(--scan)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {block.selector}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{block.description}</span>
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '0 11px 11px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <pre
            className="ddmono"
            style={{
              margin: 0,
              maxHeight: 140,
              overflow: 'auto',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 10px',
              fontSize: 10,
              lineHeight: 1.6,
              color: 'var(--text2)',
              whiteSpace: 'pre-wrap',
            }}
          >
            {buildFigmaBlockPrompt(block, sourceUrl)}
          </pre>
          <button
            type="button"
            onClick={onCopy}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '7px 10px',
              borderRadius: 8,
              background: copied ? 'var(--green)' : 'var(--accent-grad)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {copied ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={12} strokeWidth={2} aria-hidden="true" />}
            {copied ? 'Скопировано' : 'Копировать промпт блока'}
          </button>
        </div>
      )}
    </div>
  );
}

export function FigmaBlockPanel({
  result,
  sourceFigmaUrl,
  expandedBlockId,
  onToggleBlock,
  copiedBlockId,
  onCopyBlockPrompt,
  stepsCopied,
  onCopySteps,
  onSaveStepsMd,
}: {
  result: FigmaImportResult | null;
  /** The Figma URL the user actually pasted (for the block prompt's "Source:" line) — result.previewUrl points at OUR runs/ dir, not Figma. */
  sourceFigmaUrl: string;
  expandedBlockId: string | null;
  onToggleBlock: (id: string) => void;
  copiedBlockId: string | null;
  onCopyBlockPrompt: (block: FigmaBlockSummary) => void;
  stepsCopied: boolean;
  onCopySteps: () => void;
  onSaveStepsMd: () => void;
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: '14px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Блоки</span>
        <span className="ddmono" style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', padding: '2px 8px', borderRadius: 6 }}>
          {result?.blocks.length ?? 0}
        </span>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {!result && <p style={{ fontSize: 12, color: 'var(--text3)' }}>Импортируйте фрейм, чтобы увидеть список блоков.</p>}
        {result?.blocks.map((b) => (
          <FigmaBlockRow
            key={b.id}
            block={b}
            expanded={expandedBlockId === b.id}
            onToggle={() => onToggleBlock(b.id)}
            onCopy={() => onCopyBlockPrompt(b)}
            copied={copiedBlockId === b.id}
            sourceUrl={sourceFigmaUrl}
          />
        ))}
        <div style={{ height: 4 }} />
      </div>
      <PromptFooter
        title="План реализации"
        promptText={result?.steps ?? 'Импортируйте фрейм, чтобы собрать план реализации.'}
        copied={stepsCopied}
        onCopy={onCopySteps}
        onSaveMd={onSaveStepsMd}
      />
    </div>
  );
}
