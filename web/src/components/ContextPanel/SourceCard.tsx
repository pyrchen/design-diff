import { useRef, useState } from 'react';
import { Link2, Lock, Unlock, Upload } from 'lucide-react';
import type { ReferenceType } from '../../types';
import type { CaptureFormState } from '../../lib/captureForm';
import { hasAuthConfigured } from '../../lib/captureForm';
import { SegmentedControl } from '../shared/SegmentedControl';
import { CaptureAuthSection } from './CaptureAuthSection';

const SOURCES: { value: ReferenceType; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'image', label: 'Изображение' },
  { value: 'figma', label: 'Figma' },
];

const urlFieldStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 9,
  padding: '8px 10px',
  fontSize: 11,
  color: 'var(--text)',
  width: '100%',
  outline: 'none',
};

export function SourceCard({
  title,
  source,
  onSourceChange,
  allowNonUrlSources = true,
  urlValue,
  onUrlChange,
  urlPlaceholder,
  figmaValue,
  onFigmaChange,
  imageFile,
  onImageFile,
  capture,
  onCaptureChange,
  capOpen,
  onToggleCapOpen,
  onCopyToOther,
  captureLabel,
}: {
  title: string;
  source: ReferenceType;
  onSourceChange: (s: ReferenceType) => void;
  allowNonUrlSources?: boolean;
  urlValue: string;
  onUrlChange: (v: string) => void;
  urlPlaceholder: string;
  figmaValue?: string;
  onFigmaChange?: (v: string) => void;
  imageFile?: File | null;
  onImageFile?: (f: File | null) => void;
  capture: CaptureFormState;
  onCaptureChange: (s: CaptureFormState) => void;
  capOpen: boolean;
  onToggleCapOpen: () => void;
  onCopyToOther: () => void;
  captureLabel: string;
}) {
  const authed = hasAuthConfigured(capture);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 13, padding: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 600, fontSize: 12.5 }}>{title}</span>
        <span className="ddmono" style={{ display: 'flex', alignItems: 'center', gap: 4, color: authed ? 'var(--green)' : 'var(--text3)', fontSize: 10 }}>
          {authed ? <Lock size={12} strokeWidth={2} aria-hidden="true" /> : <Unlock size={12} strokeWidth={2} aria-hidden="true" />}
          {authed ? 'авторизован' : 'нет авторизации'}
        </span>
      </div>

      <div style={{ marginBottom: 9 }}>
        <SegmentedControl
          options={SOURCES.map((s) => ({ ...s, disabled: !allowNonUrlSources && s.value !== 'url', title: !allowNonUrlSources && s.value !== 'url' ? 'Только URL поддерживается для целевого сайта' : undefined }))}
          value={source}
          onChange={onSourceChange}
        />
      </div>

      {source === 'url' && (
        <div style={urlFieldStyle}>
          <Link2 size={14} strokeWidth={2} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            className="ddmono"
            value={urlValue}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder={urlPlaceholder}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', width: '100%', fontSize: 11 }}
          />
        </div>
      )}

      {source === 'image' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onImageFile?.(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            borderRadius: 9,
            border: `1.5px dashed ${dragging ? 'var(--scan)' : 'var(--border2)'}`,
            background: dragging ? 'var(--scan-soft)' : 'var(--surface)',
            padding: '18px 10px',
            fontSize: 11,
            color: 'var(--text2)',
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          <Upload size={16} strokeWidth={1.8} style={{ color: 'var(--text3)' }} aria-hidden="true" />
          {imageFile ? <span style={{ color: 'var(--text)' }}>{imageFile.name}</span> : <span>Перетащите изображение или нажмите</span>}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={(e) => onImageFile?.(e.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {source === 'figma' && (
        <div style={urlFieldStyle}>
          <Link2 size={14} strokeWidth={2} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            className="ddmono"
            value={figmaValue ?? ''}
            onChange={(e) => onFigmaChange?.(e.target.value)}
            placeholder="figma.com/design/<fileKey>/Name?node-id=1-2"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', width: '100%', fontSize: 11 }}
          />
        </div>
      )}

      {source === 'url' && (
        <CaptureAuthSection
          label={captureLabel}
          open={capOpen}
          onToggleOpen={onToggleCapOpen}
          state={capture}
          onChange={onCaptureChange}
          onCopyToOther={onCopyToOther}
        />
      )}
    </div>
  );
}
