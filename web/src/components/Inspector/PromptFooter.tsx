import { Check, Copy, Download } from 'lucide-react';
import { Mark } from '../shared/Mark';

export function PromptFooter({
  promptText,
  copied,
  onCopy,
  onSaveMd,
  title = 'Промпт для Claude',
}: {
  promptText: string;
  copied: boolean;
  onCopy: () => void;
  onSaveMd: () => void;
  /** Defaults to the original compare-feature label — Figma import (FigmaPromptPanel) passes its own. */
  title?: string;
}) {
  const kb = (new Blob([promptText]).size / 1024).toFixed(1);
  return (
    <div style={{ borderTop: '1px solid var(--hair)', background: 'var(--elevated)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px 7px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
          <Mark size={15} strokeWidth={2} />
          {title}
        </span>
        <span className="ddmono" style={{ fontSize: 9.5, color: 'var(--text3)' }}>
          md · {kb} KB
        </span>
      </div>
      <div
        className="ddmono"
        style={{
          margin: '0 13px',
          maxHeight: 92,
          overflowY: 'auto',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '9px 11px',
          fontSize: 10.5,
          lineHeight: 1.6,
          color: 'var(--text2)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {promptText}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '11px 13px 13px' }}>
        <button
          type="button"
          onClick={onCopy}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: 10,
            borderRadius: 10,
            background: copied ? 'var(--green)' : 'var(--accent-grad)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            boxShadow: 'var(--sh1)',
            transition: 'background .2s var(--ease)',
          }}
        >
          {copied ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={13} strokeWidth={2} aria-hidden="true" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </button>
        <button
          type="button"
          onClick={onSaveMd}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '10px 14px',
            borderRadius: 10,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <Download size={13} strokeWidth={2} aria-hidden="true" />
          .md
        </button>
      </div>
    </div>
  );
}
