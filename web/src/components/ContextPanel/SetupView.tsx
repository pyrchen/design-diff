import type { ReferenceType } from '../../types';
import type { CaptureFormState } from '../../lib/captureForm';
import { SourceCard } from './SourceCard';
import { BreakpointChip } from '../shared/BreakpointChip';
import { Toggle } from '../shared/Toggle';
import { BREAKPOINTS } from '../../lib/sampleContent';

export interface SetupViewProps {
  referenceType: ReferenceType;
  onReferenceTypeChange: (t: ReferenceType) => void;
  referenceUrl: string;
  onReferenceUrlChange: (v: string) => void;
  figmaUrl: string;
  onFigmaUrlChange: (v: string) => void;
  imageFile: File | null;
  onImageFileChange: (f: File | null) => void;
  targetUrl: string;
  onTargetUrlChange: (v: string) => void;
  referenceCapture: CaptureFormState;
  onReferenceCaptureChange: (s: CaptureFormState) => void;
  refCapOpen: boolean;
  onToggleRefCapOpen: () => void;
  targetCapture: CaptureFormState;
  onTargetCaptureChange: (s: CaptureFormState) => void;
  tgtCapOpen: boolean;
  onToggleTgtCapOpen: () => void;
  onCopyRefToTarget: () => void;
  onCopyTargetToRef: () => void;
  activeBreakpoints: Record<number, boolean>;
  onToggleBreakpoint: (bp: number) => void;
  customWidths: number[];
  onRemoveCustomWidth: (bp: number) => void;
  customWidthInput: string;
  onCustomWidthInputChange: (v: string) => void;
  onAddCustomWidth: () => void;
  fullPage: boolean;
  onFullPageChange: (v: boolean) => void;
}

export function SetupView(props: SetupViewProps) {
  return (
    <div style={{ overflowY: 'auto', padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em' }}>
          Источники
        </div>

        <SourceCard
          title="Референс"
          source={props.referenceType}
          onSourceChange={props.onReferenceTypeChange}
          urlValue={props.referenceUrl}
          onUrlChange={props.onReferenceUrlChange}
          urlPlaceholder="https://example.com/a.html"
          figmaValue={props.figmaUrl}
          onFigmaChange={props.onFigmaUrlChange}
          imageFile={props.imageFile}
          onImageFile={props.onImageFileChange}
          capture={props.referenceCapture}
          onCaptureChange={props.onReferenceCaptureChange}
          capOpen={props.refCapOpen}
          onToggleCapOpen={props.onToggleRefCapOpen}
          onCopyToOther={props.onCopyRefToTarget}
          captureLabel="референса"
        />

        <SourceCard
          title="Целевой сайт"
          source="url"
          onSourceChange={() => {}}
          allowNonUrlSources={false}
          urlValue={props.targetUrl}
          onUrlChange={props.onTargetUrlChange}
          urlPlaceholder="https://example.com/b.html"
          capture={props.targetCapture}
          onCaptureChange={props.onTargetCaptureChange}
          capOpen={props.tgtCapOpen}
          onToggleCapOpen={props.onToggleTgtCapOpen}
          onCopyToOther={props.onCopyTargetToRef}
          captureLabel="целевого сайта"
        />
      </div>

      <div style={{ height: 1, background: 'var(--hair)', margin: '1px 0' }} />

      <div>
        <div className="ddmono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.11em', color: 'var(--text3)', marginBottom: 10 }}>
          Брейкпоинты
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {BREAKPOINTS.map((bp) => (
            <BreakpointChip key={bp} width={bp} active={!!props.activeBreakpoints[bp]} onClick={() => props.onToggleBreakpoint(bp)} />
          ))}
          {props.customWidths.map((w) => (
            <button
              key={`custom-${w}`}
              type="button"
              onClick={() => props.onRemoveCustomWidth(w)}
              className="ddmono"
              style={{
                padding: '5px 11px',
                borderRadius: 9,
                fontSize: 11.5,
                border: '1px solid var(--scan)',
                background: 'var(--scan-soft)',
                color: 'var(--text)',
              }}
              title="Убрать свою ширину"
            >
              {w} ×
            </button>
          ))}
          <div
            className="ddmono"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 6px 3px 11px',
              borderRadius: 9,
              fontSize: 11.5,
              border: '1px dashed var(--border2)',
              background: 'transparent',
              color: 'var(--text2)',
            }}
          >
            <input
              value={props.customWidthInput}
              onChange={(e) => props.onCustomWidthInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  props.onAddCustomWidth();
                }
              }}
              type="number"
              min={200}
              max={4000}
              placeholder="своя ширина"
              style={{ width: 74, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: 11.5 }}
            />
            <button type="button" onClick={props.onAddCustomWidth} style={{ color: 'var(--scan)', fontWeight: 600 }} aria-label="Добавить ширину">
              +
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 13, fontSize: 12, color: 'var(--text2)' }}>
          <span>Полная страница</span>
          <Toggle checked={props.fullPage} onChange={props.onFullPageChange} label="Полная страница" />
        </div>
      </div>
    </div>
  );
}
