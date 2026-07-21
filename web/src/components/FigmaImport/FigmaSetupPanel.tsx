import { Link2, Loader2, Sparkles } from 'lucide-react';

/**
 * Left panel of the Figma-import console (Feature 4) — mirrors
 * ContextPanel/SourceCard's visual language (dark card, ddmono labels,
 * pill-bordered URL field) without depending on its CaptureOptions-specific
 * props, since this feature has nothing to authenticate against besides the
 * Figma token itself (resolved server-side from Settings, see
 * figmaImportApi.ts).
 */
export function FigmaSetupPanel({
  figmaUrl,
  onFigmaUrlChange,
  onImport,
  loading,
  error,
  hasResult,
}: {
  figmaUrl: string;
  onFigmaUrlChange: (v: string) => void;
  onImport: () => void;
  loading: boolean;
  error: string;
  hasResult: boolean;
}) {
  return (
    <div style={{ overflowY: 'auto', padding: '4px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em' }}>
        Импорт из Figma
      </div>

      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 13, padding: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, margin: 0 }}>
          Вставьте ссылку на фрейм в Figma — соберу рабочий HTML/CSS-превью, план реализации по секциям и список блоков для точечных промптов.
        </p>

        <label htmlFor="figma-import-url" style={{ fontSize: 11, color: 'var(--text3)' }}>
          Ссылка на Figma-фрейм
        </label>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 9,
            padding: '8px 10px',
          }}
        >
          <Link2 size={14} strokeWidth={2} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
          <input
            id="figma-import-url"
            className="ddmono"
            value={figmaUrl}
            onChange={(e) => onFigmaUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loading) {
                e.preventDefault();
                onImport();
              }
            }}
            placeholder="figma.com/design/<fileKey>/Name?node-id=1-2"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'inherit', width: '100%', fontSize: 11 }}
          />
        </div>

        <button
          type="button"
          onClick={onImport}
          disabled={loading || !figmaUrl.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            padding: 10,
            borderRadius: 10,
            background: 'var(--accent-grad)',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 600,
            boxShadow: 'var(--sh1)',
            opacity: loading || !figmaUrl.trim() ? 0.6 : 1,
            cursor: loading || !figmaUrl.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? <Loader2 size={14} strokeWidth={2.2} className="dd-spin" aria-hidden="true" /> : <Sparkles size={14} strokeWidth={2.1} aria-hidden="true" />}
          {loading ? 'Импортирую…' : hasResult ? 'Импортировать заново' : 'Импортировать'}
        </button>

        {error && (
          <p role="alert" style={{ fontSize: 11.5, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 10px', borderRadius: 8, margin: 0 }}>
            {error}
          </p>
        )}

        <p style={{ fontSize: 10.5, color: 'var(--text3)', lineHeight: 1.5, margin: 0 }}>
          Токен Figma берётся из Настроек (или FIGMA_TOKEN в .env) — тот же, что для источника «Figma» в сравнении.
        </p>
      </div>
    </div>
  );
}
