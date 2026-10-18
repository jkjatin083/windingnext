'use client';
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Top from '../../components/top';
import Link from 'next/link';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Made() {
  const { data: H, err: loadErr, reload } = useApi('/api/home');
  const [err, setErr] = useState('');
  const [issueId, setIssueId] = useState(null);
  const [open, setOpen] = useState(null);
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  function showToast(t) { setToast(t); setTimeout(() => setToast(''), 2500); }

  async function save() {
    setErr('');
    const q = +qty;
    const stype = effOpen || (shownCur && shownCur.stator_type) || null;
    if (!stype) { setErr(mi.length || oth.length ? 'Choose the order' : 'No order issued'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr('Enter a whole number above 0'); return; }
    setBusy(true);
    try {
      await postJson('/api/entry', { action: 'made', stype, qty: q, issue_id: effOpen ? null : (shownCur && shownCur.id), opening: effOpen ? 1 : 0 });
      showToast('Saved');
      setQty('');
      await reload();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  const mi = H ? (H.issues || []).filter(i => i.left > 0) : [];
  const oth = H ? Object.keys(H.holds || {}).filter(k => (H.holds[k].held || 0) > 0 && !mi.some(i => i.stator_type === k)).sort() : [];
  const cur = open ? null : (mi.find(i => i.id === issueId) || mi[0] || null);
  const effOpen = open || (!cur && oth.length ? oth[0] : null);
  const shownCur = effOpen ? null : cur;
  const od = shownCur;
  const pc = od && od.qty ? Math.min(100, Math.round(100 * od.wound / od.qty)) : 0;
  const sm = { fontSize: 10, color: '#98a2b3', display: 'block', marginTop: 2 };
  const gn = { color: '#0e9f83', fontWeight: 700 };

  return (
    <div className="w">
      {toast ? <div id="toast" style={{ display: 'block' }}>{toast}</div> : null}
      <Top date={H ? dm(H.today) : ''} />
      <h1>Made today</h1>
      {loadErr ? <div className="card"><div className="err">{loadErr}</div></div> : null}
      {!H && !loadErr ? <div className="card"><div className="note">Loading...</div></div> : null}
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
          ) : null}
          {!mi.length && !oth.length ? (
            <div className="card"><div className="lab">Stators</div><div className="note">No order issued</div></div>
          ) : (
            <div className="card">
              <div className="lab">Stators</div>
              {mi.map(i => {
                const st = i.stator_type || '';
                const on = shownCur && i.id === shownCur.id;
                return (
                  <div key={i.id} className={'tile' + (on ? ' on' : '')} onClick={() => { setIssueId(i.id); setOpen(null); }}>
                    <span className="r"></span>
                    <div className="t"><b>{i.winding_type}</b>
                      <small style={sm}>Order #{i.order_no} | stamping available {fmt(Math.max(0, ((H.stamp || {})[st] || { bal: 0 }).bal))}</small>
                    </div>
                    <span className="n" style={gn}>{fmt(Math.max(0, ((H.holds || {})[st] || { held: 0 }).held))}</span>
                  </div>
                );
              })}
              {oth.length ? <div className="lab" style={{ marginTop: 14 }}>Opening stock (no order)</div> : null}
              {oth.map(k => (
                <div key={k} className={'tile' + (effOpen === k ? ' on' : '')} onClick={() => { setOpen(k); setIssueId(null); }}>
                  <span className="r"></span>
                  <div className="t"><b>{k}</b><small style={sm}>Opening stock | stamping available 0</small></div>
                  <span className="n" style={gn}>{fmt(H.holds[k].held)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="card qty">
            <div className="lab">Stators made</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0"
              value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String((+qty || 0) + 500))}>+500</button>
              <button onClick={() => setQty(String((+qty || 0) + 1000))}>+1,000</button>
            </div>
            <div className="info"><span>Made today so far</span><b>{fmt(H.madeToday)}</b></div>
          </div>
        </>
      ) : null}
      <div className="sticky"><div>
        <div className="err">{err}</div>
        <button className="btn" disabled={busy || !H} onClick={save}>Save</button>
        <div style={{ textAlign: 'center', marginTop: 8 }}><Link className="lo" href="/home">Back to Home</Link></div>
      </div></div>
    </div>
  );
}
