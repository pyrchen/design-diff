import type { CSSProperties } from 'react';
import { Crop, History, Keyboard, Layers, Monitor, PanelLeft, Plus } from 'lucide-react';
import type { Layout } from '../hooks/useLayout';
import type { ViewMode } from '../hooks/useCanvasEngine';

export function ActivityRail({
  layout,
  viewMode,
  onToggleContextDrawer,
  onToggleInspectorDrawer,
  onSetDiffView,
  onNewComparison,
}: {
  layout: Layout;
  viewMode: ViewMode;
  onToggleContextDrawer: () => void;
  onToggleInspectorDrawer: () => void;
  onSetDiffView: () => void;
  onNewComparison: () => void;
}) {
  if (layout === 'mobile') return null;

  const items: { label: string; icon: React.ReactNode; onClick: () => void; active?: boolean }[] = [
    { label: 'Панели', icon: <PanelLeft size={19} strokeWidth={1.8} aria-hidden="true" />, onClick: layout === 'desktop' ? () => {} : onToggleContextDrawer },
    {
      label: 'Слои / инспектор',
      icon: <Layers size={19} strokeWidth={1.8} aria-hidden="true" />,
      onClick: layout === 'tablet' ? onToggleInspectorDrawer : () => {},
    },
    { label: 'Брейкпоинты', icon: <Monitor size={19} strokeWidth={1.8} aria-hidden="true" />, onClick: () => {} },
    { label: 'Область сравнения', icon: <Crop size={19} strokeWidth={1.8} aria-hidden="true" />, onClick: onSetDiffView, active: viewMode === 'diff' },
    { label: 'История', icon: <History size={19} strokeWidth={1.8} aria-hidden="true" />, onClick: onNewComparison },
    { label: 'Горячие клавиши', icon: <Keyboard size={19} strokeWidth={1.8} aria-hidden="true" />, onClick: () => {} },
  ];

  const wrapStyle: CSSProperties = { display: 'block' };

  return (
    <nav style={wrapStyle}>
      <div
        style={{
          height: '100%',
          background: 'var(--surface)',
          backdropFilter: 'blur(22px) saturate(150%)',
          borderRight: '1px solid var(--hair)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '11px 0',
          gap: 4,
        }}
      >
        <button
          type="button"
          onClick={onNewComparison}
          title="Новое сравнение"
          style={{
            width: 38,
            height: 38,
            borderRadius: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: 'var(--accent-grad)',
            marginBottom: 7,
            boxShadow: '0 4px 14px -2px var(--scan-soft), var(--sh1)',
          }}
        >
          <Plus size={19} strokeWidth={2.2} aria-hidden="true" />
        </button>
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            title={item.label}
            style={{
              position: 'relative',
              width: 38,
              height: 38,
              borderRadius: 11,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: item.active ? 'var(--scan)' : 'var(--text3)',
              background: item.active ? 'var(--scan-soft)' : 'transparent',
              transition: 'color .15s var(--ease), background .15s var(--ease)',
            }}
          >
            {item.icon}
          </button>
        ))}
      </div>
    </nav>
  );
}
