'use client';
import { useState } from 'react';

const NAMES = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil', 'Pandey ji', 'Sandeep', 'Admin'];

export default function Login() {
  const [name, setName] = useState(NAMES[0]);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr('');
    if (!pin) { setErr('Enter your PIN'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'error');
      localStorage.setItem('wa_name', j.name);
      localStorage.setItem('wa_token', j.token);
      // Each role lands on its own app: Pandey ji -> motor, Sandeep -> sale,
      // Admin -> order book, everyone else -> Home
      location.href = j.name === 'Pandey ji' ? '/motor'
        : j.name === 'Sandeep' ? '/sale'
        : j.name === 'Admin' ? '/ob'
        : '/made';
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="card">
        <h1 style={{ marginBottom: 6 }}>Winding App</h1>
        <div className="note" style={{ marginBottom: 18 }}>Contractor login</div>
        <select className="sel" value={name} onChange={e => setName(e.target.value)}>
          {NAMES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <input className="pin" type="password" inputMode="numeric" placeholder="PIN"
          value={pin} onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') go(); }} />
        <div className="err">{err}</div>
        <button className="btn" disabled={busy} onClick={go}>{busy ? 'Checking...' : 'Log in'}</button>
      </div>
    </div>
  );
}
