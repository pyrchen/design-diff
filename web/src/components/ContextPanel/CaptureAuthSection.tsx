import { ChevronDown, Copy } from 'lucide-react';
import type { CaptureFormState } from '../../lib/captureForm';
import { hasAuthConfigured } from '../../lib/captureForm';
import { AuthChipGroup } from '../shared/AuthChipGroup';
import { Toggle } from '../shared/Toggle';

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '6px 9px',
  fontSize: 11,
  outline: 'none',
};

const labelStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--text2)', marginBottom: 4, display: 'block' };

/** The "Захват и авторизация" collapsible row + panel (per-side capture options + auth). */
export function CaptureAuthSection({
  label,
  open,
  onToggleOpen,
  state,
  onChange,
  onCopyToOther,
}: {
  label: string;
  open: boolean;
  onToggleOpen: () => void;
  state: CaptureFormState;
  onChange: (next: CaptureFormState) => void;
  onCopyToOther: () => void;
}) {
  const authed = hasAuthConfigured(state);

  function patch(partial: Partial<CaptureFormState>) {
    onChange({ ...state, ...partial });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggleOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 9,
          color: 'var(--text2)',
          fontSize: 11.5,
          fontWeight: 500,
        }}
        aria-expanded={open}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text2)' }}>Захват и авторизация</span>
        <span style={{ display: 'flex', transition: 'transform .2s var(--ease)', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          <ChevronDown size={13} strokeWidth={2} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.1em' }}>Способ авторизации</span>
            <button
              type="button"
              onClick={onCopyToOther}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--text2)' }}
              title="Скопировать в другую сторону"
            >
              <Copy size={11} strokeWidth={2} aria-hidden="true" />
              Скопировать
            </button>
          </div>
          <AuthChipGroup value={state.authMethod} onChange={(m) => patch({ authMethod: m })} />

          {state.authMethod === 'cookie' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {state.cookies.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 5 }}>
                  <input
                    className="ddmono"
                    style={inputStyle}
                    placeholder="имя"
                    value={c.name}
                    onChange={(e) => {
                      const cookies = [...state.cookies];
                      cookies[i] = { ...cookies[i], name: e.target.value };
                      patch({ cookies });
                    }}
                  />
                  <input
                    className="ddmono"
                    style={inputStyle}
                    placeholder="значение"
                    value={c.value}
                    onChange={(e) => {
                      const cookies = [...state.cookies];
                      cookies[i] = { ...cookies[i], value: e.target.value };
                      patch({ cookies });
                    }}
                  />
                  <input
                    className="ddmono"
                    style={inputStyle}
                    placeholder="домен (опц.)"
                    value={c.domain}
                    onChange={(e) => {
                      const cookies = [...state.cookies];
                      cookies[i] = { ...cookies[i], domain: e.target.value };
                      patch({ cookies });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ cookies: state.cookies.filter((_, idx) => idx !== i) })}
                    aria-label="Удалить cookie"
                    style={{ color: 'var(--text3)', padding: '0 6px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => patch({ cookies: [...state.cookies, { name: '', value: '', domain: '', path: '' }] })}
                style={{ fontSize: 10.5, color: 'var(--scan)', textAlign: 'left' }}
              >
                + Добавить cookie
              </button>
              <p style={{ fontSize: 10, color: 'var(--text3)' }}>Домен не обязателен — если не указан, будет взят из URL {label}.</p>
            </div>
          )}

          {state.authMethod === 'bearer' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div>
                <label style={labelStyle}>Токен</label>
                <input
                  className="ddmono"
                  type="password"
                  autoComplete="off"
                  style={inputStyle}
                  placeholder="eyJhbGciOi..."
                  value={state.bearerToken}
                  onChange={(e) => patch({ bearerToken: e.target.value })}
                />
              </div>
              {state.bearerHeaders.map((h, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 5 }}>
                  <input
                    className="ddmono"
                    style={inputStyle}
                    placeholder="доп. заголовок"
                    value={h.name}
                    onChange={(e) => {
                      const headers = [...state.bearerHeaders];
                      headers[i] = { ...headers[i], name: e.target.value };
                      patch({ bearerHeaders: headers });
                    }}
                  />
                  <input
                    className="ddmono"
                    style={inputStyle}
                    placeholder="значение"
                    value={h.value}
                    onChange={(e) => {
                      const headers = [...state.bearerHeaders];
                      headers[i] = { ...headers[i], value: e.target.value };
                      patch({ bearerHeaders: headers });
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => patch({ bearerHeaders: state.bearerHeaders.filter((_, idx) => idx !== i) })}
                    aria-label="Удалить заголовок"
                    style={{ color: 'var(--text3)', padding: '0 6px' }}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => patch({ bearerHeaders: [...state.bearerHeaders, { name: '', value: '' }] })}
                style={{ fontSize: 10.5, color: 'var(--scan)', textAlign: 'left' }}
              >
                + Добавить заголовок
              </button>
            </div>
          )}

          {state.authMethod === 'basic' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <label style={labelStyle}>Логин</label>
                <input className="ddmono" style={inputStyle} value={state.basicUsername} onChange={(e) => patch({ basicUsername: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Пароль</label>
                <input
                  className="ddmono"
                  type="password"
                  autoComplete="off"
                  style={inputStyle}
                  value={state.basicPassword}
                  onChange={(e) => patch({ basicPassword: e.target.value })}
                />
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--hair)', paddingTop: 8 }}>
            <label style={labelStyle}>Скрыть перед снимком (селекторы)</label>
            <textarea
              className="ddmono"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }}
              placeholder="#cookie-banner, .chat-widget"
              value={state.hideSelectors}
              onChange={(e) => patch({ hideSelectors: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Кликнуть перед снимком (напр. «Принять cookies»)</label>
            <textarea
              className="ddmono"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' as const }}
              placeholder="#accept-cookies, .modal-close"
              value={state.dismissSelectors}
              onChange={(e) => patch({ dismissSelectors: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <div>
              <label style={labelStyle}>Ожидание загрузки</label>
              <select
                className="ddmono"
                style={inputStyle}
                value={state.waitUntil}
                onChange={(e) => patch({ waitUntil: e.target.value as CaptureFormState['waitUntil'] })}
              >
                <option value="networkidle">networkidle</option>
                <option value="load">load</option>
                <option value="domcontentloaded">domcontentloaded</option>
              </select>
            </div>
            <div className="ddmono" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text2)' }}>
              <span>Доп. пауза, мс</span>
              <input
                className="ddmono"
                type="number"
                min={0}
                max={60000}
                style={{ ...inputStyle, width: 72, textAlign: 'right' }}
                value={state.waitMs}
                onChange={(e) => patch({ waitMs: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Ждать селектор (опц.)</label>
            <input
              className="ddmono"
              style={inputStyle}
              placeholder=".hero-loaded"
              value={state.waitForSelector}
              onChange={(e) => patch({ waitForSelector: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Toggle checked={state.freezeAnimations} onChange={(v) => patch({ freezeAnimations: v })} label="Замораживать анимации" />
            <span style={{ fontSize: 10.5, color: 'var(--text2)' }}>Замораживать анимации перед снимком</span>
          </div>
          <div>
            <label style={labelStyle}>Снимать только один блок (CSS-селектор, опц.)</label>
            <input
              className="ddmono"
              style={inputStyle}
              placeholder=".hero, #pricing-table"
              value={state.clipSelector}
              onChange={(e) => patch({ clipSelector: e.target.value })}
            />
          </div>
          <p style={{ fontSize: 10, color: 'var(--text3)' }}>
            Авторизация применяется только к «{label}» — значения остаются локально и никуда, кроме указанного URL, не отправляются.
          </p>
          {authed && (
            <span
              className="ddmono"
              style={{
                alignSelf: 'flex-start',
                fontSize: 9.5,
                padding: '2px 8px',
                borderRadius: 6,
                background: 'var(--green-soft)',
                color: 'var(--green)',
              }}
            >
              Авторизовано
            </span>
          )}
        </div>
      )}
    </div>
  );
}
