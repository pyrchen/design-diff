import { Trash2 } from 'lucide-react';
import type { NamedToken } from '../../settingsTypes';

const KIND_LABEL: Record<NamedToken['kind'], string> = { bearer: 'Bearer', header: 'Заголовок', cookie: 'Cookie', raw: 'Raw' };

export function TokenRow({ token, onDelete }: { token: Omit<NamedToken, 'value'> & { last4: string }; onDelete: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>
      <span className="ddmono" style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 6, background: 'var(--track)', color: 'var(--text2)' }}>
        {KIND_LABEL[token.kind]}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500 }}>{token.label}</span>
      <span className="ddmono" style={{ flex: 1, fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        ••••{token.last4}
      </span>
      <button type="button" onClick={onDelete} style={{ color: 'var(--text3)', display: 'flex' }} aria-label={`Удалить токен ${token.label}`}>
        <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
      </button>
    </div>
  );
}
