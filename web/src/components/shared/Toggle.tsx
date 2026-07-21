/** Green-when-on pill toggle (fullPage / remember / freezeAnimations). */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 12,
        background: checked ? 'var(--green)' : 'var(--border2)',
        position: 'relative',
        transition: 'background .2s var(--ease)',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .2s var(--ease)',
          boxShadow: '0 1px 2px rgba(0,0,0,.4)',
        }}
      />
    </button>
  );
}
