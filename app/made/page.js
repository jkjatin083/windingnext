'use client';
// Contractor App 1 - Made today. Exact port of the live app1.html Made tab:
// order card, stator tiles (order + opening stock), big quantity, quick adds.
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

export default function Made() {
  const { data: H, err, reload } = useApi('/api/c?view=home');
  const [sel, setSel] = useState({ issue: null, open: null });
  const [qty, setQty] = useState('');
  const [err2, setErr2] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [snap, setSnap] = useState(null); // confirm-sheet content; sheet open while non-null

  const mi = H ? H.issues.filter(i => i.left > 0) : [];
  const added = H ? (H.added || []) : [];
  const oth = H ? Object.keys(H.holds || {}).filter(k => (H.holds[k].held || 0) > 0 && !mi.some(i => i.stator_type === k) && !added.includes(k)).sort().map(k => [k, H.holds[k].held]) : [];
  // winding types added by admin (no order): shown even when the count is 0
  const adm = added.filter(n => !mi.some(i => i.stator_type === n)).map(n => [n, Math.max(0, ((H.holds || {})[n] || { held: 0 }).held)]);
  const all = [...oth, ...adm];
  // default selection: first open order, else first opening-stock / admin-added item
  const cur = sel.open ? null : (mi.find(i => i.id === sel.issue) || mi[0] || null);
  const open = sel.open && all.find(o => o[0] === sel.open) ? sel.open : (!cur && all.length ? all[0][0] : sel.open);
  const od = open ? null : cur;
  const stype = open || (cur && cur.stator_type) || null;

  // UPI-style: Save first opens the confirm sheet; save() only runs on Confirm.
  function ask() {
    if (!H) return;
    setErr2('');
    const q = +qty;
    if (!stype) { setErr2(mi.length || all.length ? 'Choose the order' : 'No order issued'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr2('Enter a whole number above 0'); return; }
    const held = Math.max(0, ((H.holds || {})[stype] || { held: 0 }).held);
    setSnap({
      hero: [fmt(q), 'stators made'],
      title: 'Confirm made?',
      sub: 'One last look, then it goes to your stock.',
      rows: [
        ['Type', stype],
        ['To', 'Your own stock'],
        ['In hand after', fmt(held + q)],
        [open ? 'Stock' : 'Order', open ? 'Opening stock (no order)' : 'Order #' + cur.order_no],
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
    if (!stype) { setErr2(mi.length || all.length ? 'Choose the order' : 'No order issued'); return; }
    if (!(q > 0) || q !== Math.floor(q)) { setErr2('Enter a whole number above 0'); return; }
    setBusy(true);
    const label = open ? open : (cur ? cur.winding_type : '');
    try {
      const res = await postJson('/api/c', { action: 'made', stype, qty: q, issue_id: open ? null : (cur && cur.id), opening: open ? 1 : 0 });
      if (!res) { setBusy(false); return; } // login expired - redirecting to login, show nothing
      if (res.ok !== true) { setDone({ view: 'unknown', qty: q, note: 'Server problem while saving', rows: [['Your entry', fmt(q) + '  \u00b7  ' + label], ['Status', 'Unknown', '#b54708']] }); setBusy(false); return; }
      // Server confirmed the save (res.ok === true) - only now show the success animation.
      const fresh = await reload();
      const rows = [['Winding type', label]];
      const iss = !open && cur && fresh ? (fresh.issues || []).find(i => i.id === cur.id) : null;
      if (iss) rows.push(['Order', '#' + iss.order_no + '  -+  ' + fmt(iss.left) + ' left']);
      if (fresh) {
        rows.push(['Made today', fmt(fresh.madeToday)]);
        rows.push(['You now hold', fmt(Math.max(0, ((fresh.holds || {})[stype] || { held: 0 }).held)), '#0e9f83']);
      }
      rows.push(['Time', nowIST()]);
      setDone({ view: 'success', qty: q, title: 'Stators made - saved', rows });
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
      <h1>Made today</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!H && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {H ? (
        <>
          {!open ? (
            !od ? (
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
            )
          ) : null}
          {!mi.length && !all.length ? (
            <div className="card"><div className="lab">Stators</div><div className="note">No order issued</div></div>
          ) : (
            <div className="card"><div className="lab">Stators</div>
              <div>
                {mi.map(i => {
                  const st = i.stator_type || '';
                  return (
                    <div key={i.id} className={'tile' + (cur && i.id === cur.id && !open ? ' on' : '')} onClick={() => setSel({ issue: i.id, open: null })}>
                      <span className="r"></span>
                      <div className="t"><b>{i.winding_type}</b>
                        <small style={{ fontSize: 10, color: '#98a2b3', display: 'block', marginTop: 2 }}>Order #{i.order_no} | stamping available {fmt(Math.max(0, ((H.stamp || {})[st] || { bal: 0 }).bal))}</small>
                      </div>
                      <span className="n" style={{ color: '#0e9f83', fontWeight: 700 }}>{fmt(Math.max(0, ((H.holds || {})[st] || { held: 0 }).held))}</span>
                    </div>
                  );
                })}
                {oth.length ? <div className="lab" style={{ marginTop: 14 }}>Opening stock (no order)</div> : null}
                {oth.map(o => (
                  <div key={o[0]} className={'tile' + (open === o[0] ? ' on' : '')} onClick={() => setSel({ issue: null, open: o[0] })}>
                    <span className="r"></span>
                    <div className="t"><b>{o[0]}</b>
                      <small style={{ fontSize: 10, color: '#98a2b3', display: 'block', marginTop: 2 }}>Opening stock | stamping available 0</small>
                    </div>
                    <span className="n" style={{ color: '#0e9f83', fontWeight: 700 }}>{fmt(o[1])}</span>
                  </div>
                ))}
                {adm.length ? <div className="lab" style={{ marginTop: 14 }}>Added by admin (no order)</div> : null}
                {adm.map(o => (
                  <div key={o[0]} className={'tile' + (open === o[0] ? ' on' : '')} onClick={() => setSel({ issue: null, open: o[0] })}>
                    <span className="r"></span>
                    <div className="t"><b>{o[0]}</b>
                      <small style={{ fontSize: 10, color: '#98a2b3', display: 'block', marginTop: 2 }}>Added by admin | stamping available 0</small>
                    </div>
                    <span className="n" style={{ color: '#0e9f83', fontWeight: 700 }}>{fmt(o[1])}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="card qty"><div className="lab">Stators made</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String((+qty || 0) + 500))}>+500</button>
              <button onClick={() => setQty(String((+qty || 0) + 1000))}>+1,000</button>
            </div>
            <div className="info"><span>Made today so far</span><b>{fmt(H.madeToday)}</b></div>
          </div>
        </>
      ) : null}
      <div className="sticky" style={{ bottom: 70 }}><div>
        <div className="err">{err2}</div>
        <button className="btn" disabled={busy} onClick={ask}>Save</button>
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
