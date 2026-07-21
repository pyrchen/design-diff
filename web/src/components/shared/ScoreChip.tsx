import { CircleCheck, TriangleAlert } from 'lucide-react';
import { scoreBand } from '../../lib/sampleContent';

/**
 * Score badge — green >=95% / amber 85-95% / red <85%. Always pairs the
 * color with an icon AND the numeric text (never color alone), per the
 * handoff's a11y note.
 */
export function ScoreChip({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const band = scoreBand(score);
  const color = band === 'good' ? 'var(--green)' : band === 'warn' ? 'var(--amber)' : 'var(--red)';
  const soft = band === 'good' ? 'var(--green-soft)' : band === 'warn' ? 'var(--amber-soft)' : 'var(--red-soft)';
  const Icon = band === 'bad' ? TriangleAlert : CircleCheck;
  const fontSize = size === 'sm' ? 11 : 13;
  return (
    <span
      className="ddmono"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: size === 'sm' ? '2px 7px' : '5px 11px',
        borderRadius: size === 'sm' ? 6 : 8,
        background: soft,
        color,
        fontWeight: 600,
        fontSize,
      }}
    >
      <Icon size={size === 'sm' ? 11 : 13} strokeWidth={2.1} aria-hidden="true" />
      {Math.round(score)}%
    </span>
  );
}
