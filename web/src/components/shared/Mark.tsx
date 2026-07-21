import { Crosshair } from 'lucide-react';
import type { CSSProperties } from 'react';

/**
 * The ⊕ registration-mark signature — a Lucide `crosshair` (circle + 4
 * ticks). Used for the wordmark, the overlay-inspector handle, the empty
 * state, and the callout header (per handoff "Assets").
 */
export function Mark({
  size = 19,
  strokeWidth = 1.7,
  color = 'var(--scan)',
  pulse = false,
  style,
}: {
  size?: number;
  strokeWidth?: number;
  color?: string;
  pulse?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Crosshair
      size={size}
      strokeWidth={strokeWidth}
      style={{ color, display: 'flex', animation: pulse ? 'ddscanpulse 3s ease-in-out infinite' : undefined, ...style }}
      aria-hidden="true"
    />
  );
}
