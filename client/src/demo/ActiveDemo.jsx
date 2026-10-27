import { useState } from 'react';

const styles = {
  shell: {
    minHeight: 520, padding: 20, display: 'grid', placeItems: 'center',
    boxSizing: 'border-box', background: '#f3f4f7', color: '#202530',
    colorScheme: 'light', fontFamily: '"Segoe UI", system-ui, sans-serif',
  },
  card: {
    width: '100%', maxWidth: 360, padding: 24, boxSizing: 'border-box',
    background: '#ffffff', border: '1px solid #e5e7ee', borderRadius: 16,
    boxShadow: '0 12px 36px rgba(30, 35, 55, 0.06)',
  },
  headingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  mark: {
    display: 'grid', placeItems: 'center', width: 28, height: 28, flexShrink: 0,
    borderRadius: 8, background: '#ede9fe', color: '#6d28d9', fontSize: 17, fontWeight: 700,
  },
  heading: { margin: 0, fontSize: 24, lineHeight: 1.25, fontWeight: 650, letterSpacing: '-0.7px' },
  intro: { margin: '0 0 22px', color: '#596273', fontSize: 12, lineHeight: 1.5 },
  field: { marginBottom: 16 },
  fieldText: { margin: '0 0 7px', color: '#394150', fontSize: 12, lineHeight: 1.4, fontWeight: 600 },
  input: {
    width: '100%', height: 42, padding: '0 12px', boxSizing: 'border-box',
    background: '#ffffff', color: '#202530', border: '1px solid #d9dce5',
    borderRadius: 7, font: 'inherit', fontSize: 13,
  },
  passwordWrap: { position: 'relative' },
  reveal: {
    position: 'absolute', right: 2, top: 2, width: 38, height: 38,
    display: 'grid', placeItems: 'center', padding: 0, border: 0,
    background: 'transparent', color: '#586174', cursor: 'pointer', borderRadius: 5,
  },
  submit: {
    width: '100%', minHeight: 42, border: 0, borderRadius: 7, background: '#6d3cdd',
    color: '#ffffff', font: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  helper: { margin: '14px 0 0', color: '#a3a8b5', fontSize: 11, textAlign: 'center', lineHeight: 1.5 },
  status: { margin: 0, color: '#414b5c', fontSize: 11, lineHeight: 1.5 },
};

export default function LoginDemo() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    setMessage('Demo only — no credentials are sent or stored.');
  }

  return (
    <main data-testid="active-demo" data-demo-ready="true" style={styles.shell}>
      <div style={styles.card}>
        <div style={styles.headingRow}>
          <h1 style={styles.heading}>Welcome back</h1>
          <div aria-hidden="true" style={styles.mark}>a.</div>
        </div>
        <p style={styles.intro}>Sign in to your Acme Studio workspace.</p>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div style={styles.field}>
            {/* Deliberate defect: visual text is not an associated label. */}
            <p style={styles.fieldText}>Email address</p>
            <input id="demo-email" type="email" defaultValue="alex@acme.studio" style={styles.input} />
          </div>
          <div style={{ ...styles.field, marginBottom: 20 }}>
            <p style={styles.fieldText}>Password</p>
            <div style={styles.passwordWrap}>
              <input
                id="demo-password"
                type={showPassword ? 'text' : 'password'}
                defaultValue="accessfixdemo"
                style={{ ...styles.input, paddingRight: 44 }}
              />
              {/* Deliberate defect: this icon button has no accessible name. */}
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={styles.reveal}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                  {showPassword && <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.5" />}
                </svg>
              </button>
            </div>
          </div>
          <button type="submit" style={styles.submit}>Sign in</button>
        </form>
        {/* Deliberate defect: helper text has low contrast on the white card. */}
        <p style={styles.helper}>Your next great idea starts here.</p>
        <p role="status" style={{ ...styles.status, marginTop: message ? 8 : 0 }}>{message}</p>
      </div>
    </main>
  );
}
