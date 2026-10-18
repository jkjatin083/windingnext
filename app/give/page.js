'use client';
import { useEffect, useState } from 'react';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Give() {
  const [H, setH] = useState(null);
  const [err, setErr] = useState('');
  const [me, setMe] = useState('');
  const [issueId, setIssueId] = useState(null);
  const [stype, setStype] = useState(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const NEXT = me === 'Sunil' ? 'Sunil (ready)' : 'Pandey ji';
  function token() { return localStorage.getItem('wa_token'); }

  function load() {
    const TOKEN = token();
    if (!TOKEN) { location.href = '/'; return; }
    return fetch('/api/home', { headers: { Authorization: 'Bearer ' + TOKEN } })
      .then(async r => {
        if (r.status === 401) { localStorage.removeItem('wa_token'); location.href = '/'; return null; }
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'error');
        return j;
      })
      .then(j => { if (j) setH(j); })
      .catch(e => setErr(e.message));
  }

  useEffect(() => {
    setMe(localStorage.getItem('wa_name') || '');
    load();
  }, []);

  function showToast(t) { setToast(t); setTimeout(() => setToast(''), 2500); }

  async function save() {
    setErr('');
    const q = +qty;
    if (!selType) { setErr('Choose the stamping type'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr('Enter a whole number above 0'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ action: 'give', stype: selType, qty: q, issue_id: od ? od.id : null })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'error');
      showToast('Saved');
      setQty('');
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const issues = H ? (H.issues || []) : [];
  const od = issues.find(x => x.id === issueId) || issues[0] || null;
  const bal = t => ((H && H.holds && H.holds[t]) || { held: 0 }).held;
  const names = H ? Array.from(new Set(
    Object.keys(H.stamp || {}).concat(Object.keys(H.holds || {})).concat(od && od.stator_type ? [od.stator_type] : [])
  )) : [];
  const opts = names.map(t => [t, bal(t)]).sort((x, y) => (y[1] - x[1]) || x[0].localeCompare(y[0]));
  // selected stamping: keep current if it has balance, else order stamping, else first with balance
  let selType = stype && names.includes(stype) ? stype : null;
  if (!selType || bal(selType) <= 0) {
    selType = od && od.stator_type && bal(od.stator_type) > 0
      ? od.stator_type
      : (opts.find(o => o[1] > 0) || [null])[0];
  }
  const hold = selType ? bal(selType) : 0;
  const q = +qty || 0;

  return (
    <div className="w">
      {toast ? <div id="toast" style={{ display: 'block' }}>{toast}</div> : null}
      <div className="top">
        <div className="who"><div className="av">{(me || '?')[0]}</div><div><small>Hello</small><b>{me}</b></div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="chipd">{H ? dm(H.today) : ''}</div>
          <a className="lo" href="/home">Back</a>
        </div>
      </div>
      <h1>Give to {NEXT}</h1>
      {!H && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {H ? (
        <>
          {issues.length > 1 ? (
            <div className="oc">
              {issues.map(i => (
                <button key={i.id} className={od && i.id === od.id ? 'on' : ''} onClick={() => setIssueId(i.id)}>
                  #{i.order_no} | {i.winding_type}
                </button>
              ))}
            </div>
          ) : null}
          {od ? (
            <div className="card">
              <div className="lab">Order</div>
              <div className="ord"><div><b>#{od.order_no}</b><small>{od.winding_type}</small></div><span className="pill">{fmt(od.left)} left</span></div>
              <div className="bar"><i style={{ width: (od.qty ? Math.min(100, Math.round(100 * od.wound / od.qty)) : 0) + '%' }}></i></div>
              <div className="bl"><span>{fmt(od.wound)} wound</span><span>{fmt(od.qty)}</span></div>
              {od.stator_type ? <div className="need"><span>Order stamping</span><b>{od.stator_type}</b></div> : null}
            </div>
          ) : (
            <div className="card"><div className="lab">Order</div><div className="ord"><div><b>No open order</b><small>Ask Jatin to issue an order</small></div></div></div>
          )}
          <div className="card">
            <div className="lab">Stators you hold, by stamping</div>
            {opts.length ? opts.map(o => (
              <div key={o[0]}
                className={'tile' + (o[0] === selType ? ' on' : '') + (o[1] <= 0 ? ' dim' : '')}
                onClick={() => { if (o[1] > 0) setStype(o[0]); }}>
                <span className="r"></span>
                <div className="t"><b>{o[0]}</b><small>{o[1] > 0 ? 'ready to give' : 'none with you'}</small></div>
                <span className="n">{fmt(Math.max(0, o[1]))}</span>
              </div>
            )) : <div className="note">No winding types yet.</div>}
          </div>
          <div className="card qty">
            <div className="lab">Stators given</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0"
              value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String((+qty || 0) + 500))}>+500</button>
              <button onClick={() => setQty(String(Math.max(0, hold)))}>All {fmt(Math.max(0, hold))}</button>
            </div>
            <div className="info"><span>You hold</span><b>{fmt(hold)}</b></div>
            <div className="info" style={{ border: 0, margin: 0, paddingTop: 4 }}>
              <span>After giving</span>
              <b style={{ color: hold - q < 0 ? '#b3261e' : undefined }}>{fmt(hold - q)}</b>
            </div>
          </div>
        </>
      ) : null}
      <div className="sticky"><div>
        <div className="err">{err}</div>
        <button className="btn dk" disabled={busy || !H} onClick={save}>Give</button>
      </div></div>
    </div>
  );
}
