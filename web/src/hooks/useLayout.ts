import { useEffect, useState } from 'react';

export type Layout = 'desktop' | 'drawer' | 'tablet' | 'mobile';

/** Responsive breakpoints of the app *window* (not the compared site's own breakpoints). */
export function layoutFor(width: number): Layout {
  if (width >= 1180) return 'desktop';
  if (width >= 920) return 'drawer';
  if (width >= 670) return 'tablet';
  return 'mobile';
}

/** Derives the app-shell layout from window.innerWidth on mount + resize. */
export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(() => (typeof window === 'undefined' ? 'desktop' : layoutFor(window.innerWidth)));

  useEffect(() => {
    function onResize() {
      setLayout((prev) => {
        const next = layoutFor(window.innerWidth);
        return next === prev ? prev : next;
      });
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return layout;
}
