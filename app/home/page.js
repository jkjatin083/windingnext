'use client';
import { useEffect, useState } from 'react';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Home() {
  const [H, setH] = useState(null);
  const [err, setErr] = useState('');
  const [me, setMe] = useState('');

  useEffect(() => {
    const TOKEN = localStorage.getItem('wa_token');
    const NAME = localStorage.getItem('wa_name');
    if (!TOKEN) { location.href = '/'; return; }
    setMe(NAME || '');
    fetch('/api/home', { headers: { Authorization: 'Bearer ' + TOKEN } })
      .then(async r => {
        if (r.status === 401) { localStorage.removeItem('wa_token'); location.href = '/'; return null; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'error');
        return j;
      })
      .then(j => { if (j) setH(j); })
      .catch(e => setErr(e.message));
  }, []);

  function logout() {
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_name');
    location.href = '/';
  }

  const od = H && H.issues && H.issues.length ? H.issues[0] : null;
  const pc = od && od.qty ? Math.min(100, Math.round(100 * od.wound / od.qty)) : 0;
  const stampKeys = H ? Object.keys(H.stamp || {}).sort() : [];

  return (
    <div className="w">
      <div className="top">
        <div className="who"><div className="av">{(me || '?')[0]}</div><div><small>Hello</small><b>{me}</b></div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="chipd">{H ? dm(H.today) : ''}</div>
          <a className="lo" href="#" onClick={e => { e.preventDefault(); logout(); }}>Log out</a>
        </div>
      </div>
      <h1>Home</h1>
      <div className="ab">
        <a className="btn" href="/made">Made today</a>
        <a className="btn dk" href="/give">Give to {me === 'Sunil' ? 'Sunil' : 'Pandey ji'}</a>
      </div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!H && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {H ? (
        <>
          {od ? (
            <div className="card">
              <div className="lab">Order</div>
              <div className="ord"><div><b>#{od.order_no}</b><small>{od.winding_type}</small></div><span className="pill">{fmt(od.left)} left</span></div>
              <div className="bar"><i style={{ width: pc + '%' }}></i></div>
              <div className="bl"><span>{fmt(od.wound)} wound</span><span>{fmt(od.qty)}</span></div>
              {od.stator_type ? <div className="need"><span>Order stamping</span><b>{od.stator_type}</b></div> : null}
            </div>
          ) : (
            <div className="card"><div className="lab">Order</div><div className="ord"><div><b>No open order</b><small>Ask Jatin to issue an order</small></div></div></div>
          )}
          <div className="card">
            <div className="lab">Made today</div>
            <div className="big">{fmt(H.madeToday)}</div>
          </div>
          {stampKeys.length ? (
            <div className="card">
              <div className="lab">Stamping with me</div>
              <table>
                <thead><tr><th>Type</th><th>Received</th><th>Made</th><th>Left</th></tr></thead>
                <tbody>
                  {stampKeys.map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(H.stamp[k].recv)}</td><td>{fmt(H.stamp[k].made)}</td><td className="g">{fmt(H.stamp[k].bal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
      <nav>
        <a href="/home" className="on"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l8-7 8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H4a1 1 0 0 1-1-1z"/></svg>Home</a>
        <a href="/entries"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h14M4 11h14M4 16h14"/></svg>Entries</a>
        <a href="/hisab"><svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 18V9M11 18V4M18 18v-6"/></svg>Hisab</a>
      </nav>
    </div>
  );
}
