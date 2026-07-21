import { Figma as FigmaIcon } from 'lucide-react';
import { Mark } from '../shared/Mark';
import { BrowserFrame } from '../Canvas/BrowserFrame';
import type { FigmaImportResult } from '../../types';

/**
 * Center board of the Figma-import console — renders the actual working
 * preview (blockTreeToHtml's output) inside the app's existing browser-chrome
 * frame, exactly like a compare board.
 *
 * Uses `src={previewUrl}` (the server-written, statically-served
 * runs/figma-<id>/preview.html) rather than `srcDoc={html}` — the generated
 * markup references exported image fills via *relative* `images/<id>.png`
 * paths, which only resolve correctly when the document is actually loaded
 * from its own runs/figma-<id>/ directory; a srcDoc iframe's relative URLs
 * resolve against the PARENT document's location instead (no <base> tag),
 * which would 404 every image. Loading by URL sidesteps that entirely.
 *
 * The iframe is `sandbox`ed since it renders markup derived from
 * third-party (the user's Figma file) content — no scripts of ours run
 * inside it (the generated page has none), but the sandbox is
 * defense-in-depth against a maliciously-named Figma layer trying to smuggle
 * markup into the `characters`/`name` fields (both are HTML-escaped
 * server-side already, but a belt-and-suspenders sandbox costs nothing here).
 */
export function FigmaPreviewBoard({ result, loading }: { result: FigmaImportResult | null; loading: boolean }) {
  if (!result) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, textAlign: 'center' }}>
        <Mark size={80} strokeWidth={1.1} pulse={loading} style={{ opacity: 0.85 }} />
        <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{loading ? 'Импортирую фрейм…' : 'Готово к импорту из Figma'}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6 }}>
            {loading
              ? 'Забираю дерево узлов, экспортирую изображения и собираю рабочий превью — обычно несколько секунд.'
              : 'Вставьте ссылку на фрейм слева и нажмите «Импортировать» — здесь появится рабочий HTML/CSS-превью.'}
          </div>
        </div>
      </div>
    );
  }

  const width = Math.max(1, Math.round(result.blockTree.position.width));
  const height = Math.max(1, Math.round(result.blockTree.position.height));

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', justifyContent: 'center' }}>
      <div style={{ width, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--text2)' }}>
          <FigmaIcon size={14} strokeWidth={2} aria-hidden="true" />
          <span className="ddmono" style={{ fontSize: 12 }}>
            {result.blockTree.name} · {width}×{height}px
          </span>
        </div>
        <BrowserFrame label={`preview.html · ${result.blocks.length} блоков`} height={height}>
          <iframe
            title={`Figma-превью: ${result.blockTree.name}`}
            src={result.previewUrl}
            sandbox="allow-same-origin"
            style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
          />
        </BrowserFrame>
      </div>
    </div>
  );
}
