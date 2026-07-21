/** Decorative violet radial-glow background layer — z-index 0, opacity 0 in light theme, disabled under reduced-motion (animation itself is gated globally via @media in index.css-level rules; here we simply respect the theme). */
export function Glows({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', opacity: theme === 'light' ? 0 : 1 }}
    >
      <div
        style={{
          position: 'absolute',
          top: '-18%',
          left: '-12%',
          width: '52%',
          height: '58%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,92,255,.16), transparent 70%)',
          filter: 'blur(40px)',
          animation: 'ddglow 22s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-24%',
          right: '-10%',
          width: '50%',
          height: '60%',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,123,255,.1), transparent 72%)',
          filter: 'blur(44px)',
          animation: 'ddglow 28s ease-in-out infinite reverse',
        }}
      />
    </div>
  );
}
