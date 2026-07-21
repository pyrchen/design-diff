import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

/** Generic pill segmented control (source type, view mode) — active = --elevated bg. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  const padding = size === 'sm' ? '6px 0' : '6px 13px';
  return (
    <div
      style={{
        display: 'flex',
        background: size === 'sm' ? 'var(--surface)' : 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: size === 'sm' ? 9 : 10,
        padding: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            style={{
              flex: size === 'sm' ? 1 : undefined,
              display: size === 'sm' ? undefined : 'flex',
              alignItems: 'center',
              gap: size === 'sm' ? undefined : 6,
              padding,
              borderRadius: 7,
              fontSize: size === 'sm' ? 11 : 12,
              fontWeight: 500,
              background: active ? 'var(--elevated)' : 'transparent',
              color: active ? 'var(--text)' : opt.disabled ? 'var(--text3)' : 'var(--text2)',
              transition: 'all .15s var(--ease)',
              opacity: opt.disabled ? 0.55 : 1,
              cursor: opt.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
