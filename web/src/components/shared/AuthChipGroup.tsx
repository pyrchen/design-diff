import type { AuthMethod } from '../../lib/captureForm';

const METHODS: { value: AuthMethod; label: string }[] = [
  { value: 'none', label: 'Без авторизации' },
  { value: 'cookie', label: 'Cookie' },
  { value: 'bearer', label: 'Заголовок (Bearer)' },
  { value: 'basic', label: 'Basic' },
];

/** Auth-method chip group — selected = green outline + --green-soft (per handoff). */
export function AuthChipGroup({ value, onChange }: { value: AuthMethod; onChange: (m: AuthMethod) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {METHODS.map((m) => {
        const active = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            className="ddmono"
            style={{
              padding: '4px 9px',
              borderRadius: 7,
              fontSize: 10,
              border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
              background: active ? 'var(--green-soft)' : 'transparent',
              color: active ? 'var(--green)' : 'var(--text2)',
              transition: 'all .15s var(--ease)',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
