// Sample landing mock rendered inside the canvas boards — reimplemented from
// Landing.dc.html. Reference variant: Georgia + blue #0F62FE. Target variant:
// Arial + red #E63946. Placeholder content representing "the site being
// compared", not part of the product UI — kept verbatim per the handoff.

export function Landing({ variant }: { variant: 'ref' | 'target' }) {
  return variant === 'ref' ? <LandingRef /> : <LandingTarget />;
}

function LandingRef() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#ffffff', color: '#0b1220', fontFamily: 'Georgia,"Times New Roman",serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 38px', borderBottom: '1px solid #eef0f3' }}>
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-.02em' }}>
          Nova<span style={{ color: '#0F62FE' }}>.</span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 24,
            alignItems: 'center',
            fontFamily: "'Fira Sans',Arial,sans-serif",
            fontSize: 13.5,
            color: '#3b4453',
            fontWeight: 500,
          }}
        >
          <span>Продукт</span>
          <span>Цены</span>
          <span>Клиенты</span>
          <span style={{ border: '1.5px solid #0F62FE', color: '#0F62FE', padding: '8px 18px', borderRadius: 8, fontWeight: 600 }}>Войти</span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
          gap: 40,
          padding: '60px 38px',
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Fira Sans',Arial,sans-serif",
              fontSize: 12,
              letterSpacing: '.16em',
              textTransform: 'uppercase',
              color: '#0F62FE',
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            Платформа роста
          </div>
          <h1 style={{ fontSize: 46, lineHeight: 1.08, fontWeight: 700, margin: '0 0 18px', letterSpacing: '-.01em' }}>Дизайн, который продаёт</h1>
          <p style={{ fontFamily: "'Fira Sans',Arial,sans-serif", fontSize: 15.5, lineHeight: 1.6, color: '#55606f', margin: '0 0 30px', maxWidth: 440 }}>
            Соберите лендинг, который превращает трафик в клиентов. Быстрые макеты, аналитика и A/B-тесты в одном месте.
          </p>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontFamily: "'Fira Sans',Arial,sans-serif" }}>
            <span style={{ background: '#0F62FE', color: '#fff', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700 }}>
              Начать бесплатно
            </span>
            <span style={{ color: '#0F62FE', fontSize: 14.5, fontWeight: 600 }}>Смотреть демо →</span>
          </div>
        </div>
        <div style={{ height: 280, borderRadius: 16, background: 'linear-gradient(135deg,#e8efff,#f4f7ff)', border: '1px solid #e2e9f7' }} />
      </div>
    </div>
  );
}

function LandingTarget() {
  return (
    <div style={{ width: '100%', height: '100%', background: '#ffffff', color: '#12161d', fontFamily: 'Arial,Helvetica,sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 30px', borderBottom: '1px solid #f0eded' }}>
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.01em' }}>
          Nova<span style={{ color: '#E63946' }}>.</span>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 13, color: '#48505b', fontWeight: 500 }}>
          <span>Продукт</span>
          <span>Цены</span>
          <span>Клиенты</span>
          <span style={{ border: '1.5px solid #E63946', color: '#E63946', padding: '6px 14px', borderRadius: 6, fontWeight: 700 }}>Войти</span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          gap: 28,
          padding: '40px 30px',
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#E63946', fontWeight: 700, marginBottom: 14 }}>
            Платформа роста
          </div>
          <h1 style={{ fontSize: 34, lineHeight: 1.12, fontWeight: 700, margin: '0 0 14px', letterSpacing: '-.005em' }}>Дизайн, который продаёт</h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#5b636e', margin: '0 0 22px', maxWidth: 400 }}>
            Соберите лендинг, который превращает трафик в клиентов. Быстрые макеты, аналитика и A/B-тесты в одном месте.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ background: '#E63946', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700 }}>
              Начать бесплатно
            </span>
            <span style={{ color: '#E63946', fontSize: 14, fontWeight: 600 }}>Смотреть демо →</span>
          </div>
        </div>
        <div style={{ height: 230, borderRadius: 12, background: 'linear-gradient(135deg,#ffecec,#fff5f5)', border: '1px solid #f7dede' }} />
      </div>
    </div>
  );
}
