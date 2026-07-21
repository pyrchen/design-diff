import { useEffect, useState } from 'react';
import { KeyRound, Moon, Sun, X } from 'lucide-react';
import { deleteToken, fetchSettings, makeTokenId, putSettings } from '../../settingsApi';
import type { NamedToken, SecretsView } from '../../settingsTypes';
import { TokenRow } from './TokenRow';
import { Toggle } from '../shared/Toggle';
import type { Theme } from '../../hooks/useTheme';

type AddKind = NamedToken['kind'] | null;

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '7px 10px',
  fontSize: 12,
  outline: 'none',
};

export function SettingsModal({ onClose, theme, onToggleTheme }: { onClose: () => void; theme: Theme; onToggleTheme: () => void }) {
  const [view, setView] = useState<SecretsView | null>(null);
  const [error, setError] = useState('');
  const [editingFigma, setEditingFigma] = useState(false);
  const [figmaInput, setFigmaInput] = useState('');
  const [addKind, setAddKind] = useState<AddKind>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newHeaderName, setNewHeaderName] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((v) => {
        if (!cancelled) setView(v);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveFigmaToken() {
    try {
      const v = await putSettings({ figmaToken: figmaInput.trim() || null, remember: view?.remember ?? false });
      setView(v);
      setEditingFigma(false);
      setFigmaInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function resetFigmaToken() {
    try {
      const v = await putSettings({ figmaToken: null, remember: view?.remember ?? false });
      setView(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleRemember() {
    try {
      const v = await putSettings({ remember: !(view?.remember ?? false) });
      setView(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function saveNewToken() {
    if (!addKind || !newLabel.trim() || !newValue.trim()) return;
    const token: NamedToken = {
      id: makeTokenId(),
      label: newLabel.trim(),
      kind: addKind,
      value: newValue,
      headerName: addKind === 'header' ? newHeaderName.trim() || undefined : undefined,
    };
    try {
      const v = await putSettings({ tokens: [token], remember: view?.remember ?? false });
      setView(v);
      setAddKind(null);
      setNewLabel('');
      setNewValue('');
      setNewHeaderName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeToken(id: string) {
    try {
      const v = await deleteToken(id);
      setView(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px,100%)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 18,
          boxShadow: 'var(--sh2)',
          animation: 'ddfade .2s var(--ease)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 19px', borderBottom: '1px solid var(--hair)' }}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Настройки</span>
          <button type="button" onClick={onClose} style={{ color: 'var(--text3)', display: 'flex' }} aria-label="Закрыть настройки">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div style={{ padding: 19, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', background: 'var(--red-soft)', padding: '8px 10px', borderRadius: 8 }}>{error}</p>
          )}

          <div>
            <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em', marginBottom: 11 }}>
              Figma-токен
            </div>
            {editingFigma ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="ddmono"
                  style={inputStyle}
                  placeholder="figd_..."
                  value={figmaInput}
                  onChange={(e) => setFigmaInput(e.target.value)}
                  autoFocus
                />
                <button type="button" onClick={saveFigmaToken} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--accent-grad)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  Сохранить
                </button>
                <button type="button" onClick={() => setEditingFigma(false)} style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12 }}>
                  Отмена
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className="ddmono" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 12 }}>
                  <span style={{ color: view?.figmaToken.set ? 'var(--green)' : 'var(--text3)', display: 'flex' }}>
                    <KeyRound size={14} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <span style={{ color: 'var(--text2)' }}>{view?.figmaToken.set ? `figd_••••••••••••••••${view.figmaToken.last4}` : 'не задан'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFigma(true)}
                  style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 12, fontWeight: 500 }}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  onClick={resetFigmaToken}
                  disabled={!view?.figmaToken.set}
                  style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--red-soft)', color: 'var(--red)', fontSize: 12, fontWeight: 600, opacity: view?.figmaToken.set ? 1 : 0.5 }}
                >
                  Сбросить
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="ddmono" style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.11em', marginBottom: 11 }}>
              Именованные токены
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {view?.tokens.map((t) => (
                <TokenRow key={t.id} token={t} onDelete={() => removeToken(t.id)} />
              ))}
              {addKind && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                  <input className="ddmono" style={inputStyle} placeholder="имя (label)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} autoFocus />
                  {addKind === 'header' && (
                    <input className="ddmono" style={inputStyle} placeholder="имя заголовка (напр. X-Auth-Token)" value={newHeaderName} onChange={(e) => setNewHeaderName(e.target.value)} />
                  )}
                  <input className="ddmono" style={inputStyle} type="password" placeholder="значение" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={saveNewToken} style={{ padding: '7px 11px', borderRadius: 9, background: 'var(--accent-grad)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                      Сохранить
                    </button>
                    <button type="button" onClick={() => setAddKind(null)} style={{ padding: '7px 11px', borderRadius: 9, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 11 }}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                <button type="button" onClick={() => setAddKind('bearer')} className="ddmono" style={{ padding: '7px 11px', borderRadius: 9, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text2)', fontSize: 11 }}>
                  + Bearer
                </button>
                <button type="button" onClick={() => setAddKind('header')} className="ddmono" style={{ padding: '7px 11px', borderRadius: 9, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text2)', fontSize: 11 }}>
                  + Заголовок
                </button>
                <button type="button" onClick={() => setAddKind('cookie')} className="ddmono" style={{ padding: '7px 11px', borderRadius: 9, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text2)', fontSize: 11 }}>
                  + Cookie
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: '1px solid var(--hair)', paddingTop: 18 }}>
            <button type="button" onClick={onToggleTheme} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text)' }}>Тема</span>
              <span className="ddmono" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 9, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text2)', fontSize: 11.5 }}>
                {theme === 'dark' ? <Sun size={16} strokeWidth={1.9} aria-hidden="true" /> : <Moon size={16} strokeWidth={1.9} aria-hidden="true" />}
                {theme === 'dark' ? 'Тёмная' : 'Светлая'}
              </span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: 'var(--text)', textAlign: 'left' }}>
                Запомнить настройки авторизации
                <br />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>между запусками (хранится локально)</span>
              </span>
              <Toggle checked={view?.remember ?? false} onChange={toggleRemember} label="Запомнить настройки авторизации" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
