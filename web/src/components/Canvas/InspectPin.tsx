/**
 * Screen-space numbered pin (1–4). Position (left/top/display) is set
 * imperatively by useCanvasEngine's updateOverlay() every transform frame
 * from the target area's live getBoundingClientRect() — NOT derived from
 * React state/props — so the pin stays a constant screen size through
 * zoom/pan instead of shrinking with the world.
 */
export function InspectPin({
  n,
  selected,
  kindColor,
  title,
  setRef,
  onSelect,
}: {
  n: number;
  selected: boolean;
  kindColor: string;
  title: string;
  setRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
}) {
  const size = selected ? 30 : 26;
  return (
    <button
      ref={setRef}
      type="button"
      title={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      style={{
        position: 'absolute',
        display: 'none',
        zIndex: 56,
        transform: 'translate(-50%,-50%)',
        width: size,
        height: size,
        borderRadius: '50%',
        background: selected ? 'var(--scan)' : 'var(--surface)',
        border: `2px solid ${selected ? 'var(--scan)' : kindColor}`,
        color: selected ? '#fff' : kindColor,
        fontFamily: "'Fira Code',monospace",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: 'var(--sh2)',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'ddpin .2s var(--ease)',
      }}
    >
      {n}
    </button>
  );
}
