'use client';
import { useEffect, useState } from 'react';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Hisab() {
  const [R, setR] = useState(null);
  const [err, setErr] = useState('');
  const [me, setMe] = useState('');

  useEffect(() => {
    const TOKEN = localStorage.getItem('wa_token');
    const NAME = localStorage.getItem('wa_name');
    if (!TOKEN) { location.href = '/'; return; }
    setMe(NAME || '');
    fetch('/api/hisab', { headers: { Authorization: 'Bearer ' + TOKEN } })
      .then(async r => {
        if (r.status === 401) { localStorage.removeItem('wa_token'); location.href = '/'; return null; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'error');
        return j;
      })
      .then(j => { if (j) setR(j); })
      .catch(e => setErr(e.message));
  }, []);

  function logout() {
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_name');
    location.href = '/';
  }

  const stampKeys = R ? Object.keys(R.stamp || {}).sort() : [];
  const holdKeys = R ? Object.keys(R.holds || {}).sort() : [];

  return (
    <div className="w">
      <div className="top">
        <div className="who"><div className="av">{(me || '?')[0]}</div><div><small>Hello</small><b>{me}</b></div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="chipd">{dm(new Date().toISOString().slice(0, 10))}</div>
          <a className="lo" href="#" onClick={e => { e.preventDefault(); logout(); }}>Log out</a>
        </div>
      </div>
      <h1>Hisab</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!R && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {R ? (
        <>
          {stampKeys.length ? (
            <div className="card">
              <div className="lab">Stamping hisab</div>
              <table>
                <thead><tr><th>Type</th><th>Received</th><th>Made</th><th>Left</th></tr></thead>
                <tbody>
                  {stampKeys.map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(R.stamp[k].recv)}</td><td>{fmt(R.stamp[k].made)}</td><td className="g">{fmt(R.stamp[k].bal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {holdKeys.length ? (
            <div className="card">
              <div className="lab">Stator hisab</div>
              <table>
                <thead><tr><th>Type</th><th>Made</th><th>Given</th><th>Held</th></tr></thead>
                <tbody>
                  {holdKeys.map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(R.holds[k].made)}</td><td>{fmt(R.holds[k].given)}</td><td className="g">{fmt(R.holds[k].held)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!stampKeys.length && !holdKeys.length ? <div className="card"><div className="note">No entries yet.</div></div> : null}
          <div className="note">Numbers counted from 1 Oct 2026.</div>
        </>
      ) : null}
      <nav>
        <a href="/home"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z"/></svg>Home</a>
        <a href="/entries"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h14M4 11h14M4 16h14"/></svg>Entries</a>
        <a href="/hisab" className="on"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V9M11 18V4M18 18v-6"/></svg>Hisab</a>
      </nav>
    </div>
  );
}
