import { Figma as FigmaIcon, GitCompare, Link2, Moon, Settings as GearIcon, Sun, ArrowRight } from 'lucide-react';
import { Mark } from './shared/Mark';
import { ScoreChip } from './shared/ScoreChip';
import type { Theme } from '../hooks/useTheme';

export function CommandBar({
  theme,
  onToggleTheme,
  onOpenSettings,
  onCompare,
  comparing,
  refLabel,
  targetLabel,
  wide,
  bpCount,
  worstBp,
  avgScore,
  figmaModeActive,
  onToggleFigmaMode,
}: {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onCompare: () => void;
  comparing: boolean;
  refLabel: string;
  targetLabel: string;
  wide: boolean;
  bpCount: number;
  worstBp: number | null;
  avgScore: number | null;
  /** Feature 4 (Figma import) console toggle — reachable from every layout, unlike ActivityRail (hidden on mobile). */
  figmaModeActive: boolean;
  onToggleFigmaMode: () => void;
}) {
  return (
    <header
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
        background: 'var(--surface)',
        backdropFilter: 'blur(22px) saturate(150%)',
        borderBottom: '1px solid var(--hair)',
        zIndex: 30,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
        <Mark size={19} strokeWidth={1.7} />
        <span className="ddmono" style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: '-.02em' }}>
          design-diff
        </span>
      </div>
      <div style={{ width: 1, height: 22, background: 'var(--hair)', flexShrink: 0 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          padding: '6px 11px',
          minWidth: 0,
          maxWidth: 400,
          flex: 1,
        }}
      >
        <Link2 size={14} strokeWidth={2} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
        <span className="ddmono" style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {refLabel}
        </span>
        <ArrowRight size={13} strokeWidth={2} style={{ color: 'var(--text3)', flexShrink: 0 }} aria-hidden="true" />
        <span className="ddmono" style={{ fontSize: 12, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {targetLabel}
        </span>
      </div>
      <div style={{ flex: 1 }} />
      {wide && avgScore != null && (
        <div
          className="ddmono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 11px',
            borderRadius: 8,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            flexShrink: 0,
            fontSize: 11.5,
            color: 'var(--text2)',
          }}
        >
          <span>{bpCount} bp</span>
          <span style={{ width: 1, height: 11, background: 'var(--hair)' }} />
          <span style={{ color: 'var(--text3)' }}>худший</span>
          <span style={{ color: 'var(--red)' }}>{worstBp}</span>
        </div>
      )}
      {avgScore != null && (
        <div title="Среднее совпадение">
          <ScoreChip score={avgScore} />
        </div>
      )}
      <button
        type="button"
        onClick={onToggleFigmaMode}
        title={figmaModeActive ? 'Вернуться к сравнению' : 'Импорт из Figma'}
        aria-pressed={figmaModeActive}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 33,
          padding: wide ? '0 11px' : 0,
          width: wide ? undefined : 33,
          justifyContent: 'center',
          borderRadius: 9,
          background: figmaModeActive ? 'var(--scan-soft)' : 'var(--bg)',
          border: `1px solid ${figmaModeActive ? 'var(--scan)' : 'var(--border)'}`,
          color: figmaModeActive ? 'var(--scan)' : 'var(--text2)',
          fontSize: 12,
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        <FigmaIcon size={15} strokeWidth={1.9} aria-hidden="true" />
        {wide && <span>Figma</span>}
      </button>
      <button
        type="button"
        onClick={onToggleTheme}
        title="Сменить тему"
        style={{
          width: 33,
          height: 33,
          borderRadius: 9,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text2)',
          flexShrink: 0,
        }}
      >
        {theme === 'dark' ? <Sun size={16} strokeWidth={1.9} aria-hidden="true" /> : <Moon size={16} strokeWidth={1.9} aria-hidden="true" />}
      </button>
      {wide && (
        <button
          type="button"
          className="ddmono"
          title="Палитра команд"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            height: 33,
            padding: '0 10px',
            borderRadius: 9,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          ⌘K
        </button>
      )}
      <button
        type="button"
        onClick={onOpenSettings}
        title="Настройки"
        style={{
          width: 33,
          height: 33,
          borderRadius: 9,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text2)',
          flexShrink: 0,
        }}
      >
        <GearIcon size={17} strokeWidth={1.8} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onCompare}
        disabled={comparing}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          height: 34,
          padding: '0 16px',
          borderRadius: 10,
          background: 'var(--accent-grad)',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13.5,
          boxShadow: '0 4px 14px -2px var(--scan-soft), var(--sh1)',
          flexShrink: 0,
          opacity: comparing ? 0.7 : 1,
          cursor: comparing ? 'not-allowed' : 'pointer',
        }}
      >
        <GitCompare size={15} strokeWidth={2.1} aria-hidden="true" />
        <span>{comparing ? 'Сравниваю…' : 'Сравнить'}</span>
      </button>
    </header>
  );
}
