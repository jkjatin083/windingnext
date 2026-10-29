'use client';
// Contractor App 1 - Give to Pandey ji. Exact port of the live app1.html
// Give tab: order chips, stators-you-hold tiles, big quantity, hold-after.
// Save now shows a full-screen result: animated success only after the server
// confirms, "not sure if saved" on a dropped connection, "not added" only on
// a clear server refusal (components/saved.js). Before saving, a UPI-style
// confirm sheet asks once (components/upi.js).
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import SavedOverlay, { nowIST } from '../../components/saved';
import { ConfirmSheet } from '../../components/upi';
import { fmt, dm, todayIST } from '../../components/motor';

export default function Give() {
  const { data: H, err, reload } = useApi('/api/c?view=home');
  const [sel, setSel] = useState({ issue: null, stype: null });
  const [qty, setQty] = useState('');
  const [err2, setErr2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [snap, setSnap] = useState(null); // confirm-sheet content; sheet open while non-null

  const me = H ? H.me : '';
  const NEXT = me === 'Sunil' ? 'Sunil (ready)' : 'Pandey ji';
  const od = H ? (H.issues.find(x => x.id === sel.issue) || H.issues[0] || null) : null;
  const bal = t => (((H && H.holds) || {})[t] || { held: 0 }).held;
  const names = H ? Array.from(new Set(Object.keys(H.stamp || {}).concat(Object.keys(H.holds || {})).concat(od && od.stator_type ? [od.stator_type] : []))) : [];
  const opts = names.map(t => [t, bal(t)]).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  // default type: the order's stamping if held, else the first type held
  const stype = sel.stype && bal(sel.stype) > 0 ? sel.stype
    : (od && od.stator_type && bal(od.stator_type) > 0 ? od.stator_type : ((opts.find(o => o[1] > 0) || [null])[0]));
  const hold = stype ? bal(stype) : 0;
  const after = hold - (+qty || 0);

  // UPI-style: Give first opens the confirm sheet; save() only runs on Confirm.
  function ask() {
    if (!H) return;
    setErr2('');
    const q = +qty;
    if (!stype) { setErr2('Choose the stamping type'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr2('Enter a whole number above 0'); return; }
    setSnap({
      hero: [fmt(q), 'stators to give'],
      title: 'Confirm giving?',
      sub: 'Once saved, these leave your hold.',
      rows: [
        ['Type', stype],
        ['To', me === 'Sunil' ? "Sunil's own motors" : 'Pandey ji'],
        ['In hand after', fmt(Math.max(0, after))],
        ['Order', od ? 'Order #' + od.order_no : 'No order'],
        ['Date', dm(H.today)],
      ],
    });
  }

  async function confirm() {
    try { await save(); } finally { setSnap(null); }
  }

  async function save() {
    if (busy) return; // double-tap guard
    setErr2('');
    const q = +qty;
    if (!stype) { setErr2('Choose the stamping type'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr2('Enter a whole number above 0'); return; }
    setBusy(true);
    const label = stype;
    try {
      const res = await postJson('/api/c', { action: 'give', stype, qty: q, issue_id: od ? od.id : null });
      if (!res) { setBusy(false); return; } // login expired - redirecting to login, show nothing
      if (res.ok !== true) { setDone({ view: 'unknown', qty: q, note: 'Server problem while saving', rows: [['Your entry', fmt(q) + '  \u00b7  ' + label], ['Status', 'Unknown', '#b54708']] }); setBusy(false); return; }
      // Server confirmed the save (res.ok === true) - only now show the success animation.
      const fresh = await reload();
      const rows = [['Stamping type', label]];
      if (fresh) rows.push(['You still hold', fmt(Math.max(0, ((fresh.holds || {})[stype] || { held: 0 }).held)), '#0e9f83']);
      rows.push(['Time', nowIST()]);
      setDone({ view: 'success', qty: q, title: 'Given to ' + NEXT + ' - saved', rows });
      setQty('');
    } catch (e) {
      if (e && e.rejected) setDone({ view: 'rejected', qty: q, reason: e.message, rows: [['Your entry', fmt(q) + '  -+  ' + label], ['Status', 'Not added', '#b3261e']] });
      else setDone({ view: 'unknown', qty: q, note: e && e.serverError ? 'Server problem while saving' : 'Internet dropped while saving', rows: [['Your entry', fmt(q) + '  -+  ' + label], ['Status', 'Unknown', '#b54708']] });
    }
    setBusy(false);
  }

  return (
    <div className="w">
      <Top date={H ? dm(H.today) : dm(todayIST())} />
      <h1>Give to {NEXT}</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!H && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {H ? (
        <>
          {H.issues.length > 1 ? (
            <div className="oc">
              {H.issues.map(i => (
                <button key={i.id} className={od && i.id === od.id ? 'on' : ''} onClick={() => setSel({ issue: i.id, stype: null })}>#{i.order_no} | {i.winding_type}</button>
              ))}
            </div>
          ) : null}
          {!od ? (
            <div className="card"><div className="lab">Order</div>
              <div className="ord"><div><b>No open order</b><small>Ask Jatin to issue an order</small></div></div>
            </div>
          ) : (
            <div className="card"><div className="lab">Order</div>
              <div className="ord">
                <div><b>#{od.order_no}</b><small>{od.winding_type}</small></div>
                <span className="pill">{fmt(od.left)} left</span>
              </div>
              <div className="bar"><i style={{ width: (od.qty ? Math.min(100, Math.round(100 * od.wound / od.qty)) : 0) + '%' }} /></div>
              <div className="bl"><span>{fmt(od.wound)} wound</span><span>{fmt(od.qty)}</span></div>
              {od.stator_type ? <div className="need"><span>Order stamping</span><b>{od.stator_type}</b></div> : null}
            </div>
          )}
          <div className="card"><div className="lab">Stators you hold, by stamping</div>
            {opts.length ? (
              <div>
                {opts.map(o => (
                  <div key={o[0]} className={'tile' + (o[0] === stype ? ' on' : '') + (o[1] <= 0 ? ' dim' : '')}
                    onClick={() => { if (o[1] > 0) setSel({ ...sel, stype: o[0] }); }}>
                    <span className="r"></span>
                    <div className="t"><b>{o[0]}</b><small>{o[1] > 0 ? 'ready to give' : 'none with you'}</small></div>
                    <span className="n">{fmt(Math.max(0, o[1]))}</span>
                  </div>
                ))}
              </div>
            ) : <div className="note">No winding types yet.</div>}
          </div>
          <div className="card qty"><div className="lab">Stators given</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String((+qty || 0) + 500))}>+500</button>
              <button onClick={() => setQty(String(Math.max(0, hold)))}>All {fmt(Math.max(0, hold))}</button>
            </div>
            <div className="info"><span>You hold</span><b>{fmt(hold)}</b></div>
            <div className="info" style={{ border: 0, margin: 0, paddingTop: 4 }}>
              <span>After giving</span><b style={{ color: after < 0 ? '#b3261e' : undefined }}>{fmt(after)}</b>
            </div>
          </div>
        </>
      ) : null}
      <div className="sticky" style={{ bottom: 70 }}><div>
        <div className="err">{err2}</div>
        <button className="btn dk" disabled={busy} onClick={ask}>Give</button>
      </div></div>
      <ConfirmSheet
        open={!!snap}
        title={snap ? snap.title : ''} sub={snap ? snap.sub : ''} hero={snap ? snap.hero : null}
        rows={snap ? snap.rows : []} busy={busy}
        onCancel={() => setSnap(null)}
        onConfirm={confirm}
      />
      {done ? <SavedOverlay {...done} onClose={() => setDone(null)} /> : null}
      <Nav />
    </div>
  );
}
