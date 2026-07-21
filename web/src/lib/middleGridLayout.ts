import type { CSSProperties } from 'react';
import type { Layout } from '../hooks/useLayout';

export type DrawerOpen = 'context' | 'inspector' | null;
export type MobileTab = 'setup' | 'canvas' | 'diffs' | 'status';

export interface MiddleGridLayout {
  rootRows: string;
  midCols: string;
  railWrap: CSSProperties;
  contextWrap: CSSProperties;
  canvasWrap: CSSProperties;
  inspectorWrap: CSSProperties;
  /** Mobile-only 4th pane ("Status" tab) — undefined on every other layout (status lives in the footer there instead). */
  statusPaneWrap?: CSSProperties;
  footerWrap: CSSProperties;
  scrimShow: boolean;
}

const shrink: CSSProperties = { minWidth: 0 };
const drawerBase: CSSProperties = { position: 'absolute', top: 0, bottom: 0, zIndex: 50, boxShadow: 'var(--sh2)' };

/**
 * Computes the app-shell grid template + per-pane wrap styles for the
 * current responsive layout. Ported from the prototype's renderVals()
 * layout branch — see the handoff "Layout — App Shell" + "Responsive
 * breakpoints" sections for the exact column/row specs this encodes.
 */
export function computeMiddleGridLayout(layout: Layout, drawerOpen: DrawerOpen, mobileTab: MobileTab): MiddleGridLayout {
  let rootRows = '53px 1fr 28px';
  let midCols = '56px 300px 1fr 372px';
  let railWrap: CSSProperties = { display: 'block' };
  let contextWrap: CSSProperties = {};
  let canvasWrap: CSSProperties = {};
  let inspectorWrap: CSSProperties = {};
  let statusPaneWrap: CSSProperties | undefined;

  if (layout === 'desktop') {
    contextWrap = { display: 'block', ...shrink };
    canvasWrap = { display: 'block', ...shrink };
    inspectorWrap = { display: 'block', ...shrink };
  } else if (layout === 'drawer') {
    midCols = '56px 1fr 372px';
    canvasWrap = { gridColumn: '2', ...shrink };
    inspectorWrap = { gridColumn: '3', ...shrink };
    contextWrap = drawerOpen === 'context' ? { ...drawerBase, left: '56px', width: '300px' } : { display: 'none' };
  } else if (layout === 'tablet') {
    midCols = '56px 1fr';
    canvasWrap = { gridColumn: '2', ...shrink };
    contextWrap = drawerOpen === 'context' ? { ...drawerBase, left: '56px', width: '312px' } : { display: 'none' };
    inspectorWrap = drawerOpen === 'inspector' ? { ...drawerBase, right: 0, width: '352px' } : { display: 'none' };
  } else {
    rootRows = '48px 1fr 56px';
    midCols = '1fr';
    railWrap = { display: 'none' };
    const pane = (name: MobileTab): CSSProperties => (mobileTab === name ? { display: 'block', gridColumn: '1', gridRow: '1' } : { display: 'none' });
    contextWrap = pane('setup');
    canvasWrap = pane('canvas');
    inspectorWrap = pane('diffs');
    // Deviation from the literal prototype markup: there, the "Status" tab's
    // content and the tab bar itself both live in the 56px footer row at
    // once, which doesn't fit. Here the footer stays a persistent tab bar
    // (so the user can always switch away) and "Status" gets its own pane
    // in the main grid area instead, like the other three tabs.
    statusPaneWrap = pane('status');
  }

  const footerWrap: CSSProperties = { gridColumn: '1 / -1', position: 'relative', zIndex: 1 };
  const scrimShow = (layout === 'drawer' || layout === 'tablet') && !!drawerOpen;

  return { rootRows, midCols, railWrap, contextWrap, canvasWrap, inspectorWrap, statusPaneWrap, footerWrap, scrimShow };
}
