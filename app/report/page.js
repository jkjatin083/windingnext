'use client';
// Contractor App 1 - Report. Exact port of the live app1.html Report tab:
// Date / Type / Order segments with the same cards, bars and tables.
import { useState } from 'react';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';

export default function Report() {
  const { data: R, err } = useApi('/api/c?view=report');
  const [rtab, setRtab] = useState('date');

  let byType = [];
  if (R && rtab === 'type') {
    const o = {};
    R.rows.forEach(r => {
      const k = r.stype + '|' + r.wt;
      const x = o[k] || (o[k] = { s: r.stype, w: r.wt, m: 0, g: 0 });
      x.m += r.made; x.g += r.given;
    });
    byType = Object.values(o);
  }

  // Ledger for the Date tab: one block per winding (stype), entries oldest to
  // newest, each with made (Cr) / given (Dr) and the running balance in hand.
  const led = rows => {
    const g = {};
    (rows || []).forEach(r => {
      const x = g[r.stype] || (g[r.stype] = { s: r.stype, w: {}, rows: [], made: 0, given: 0, held: 0, last: '' });
      x.rows.push(r);
      x.made += r.made; x.given += r.given; x.held = r.held;
      if (r.d > x.last) x.last = r.d;
      if (r.wt && r.wt !== '-') x.w[r.wt] = 1;
    });
    return Object.values(g)
      .map(x => ({ ...x, wts: Object.keys(x.w).join(' + ') || 'no order link' }))
      .sort((a, b) => (a.last < b.last ? 1 : -1));
  };

  return (
    <div className="w">
      <Top date={R ? dm(R.to) : dm(todayIST())} />
      <div className="seg">
        {[['date', 'Date'], ['type', 'Type'], ['order', 'Order']].map(t => (
          <button key={t[0]} className={rtab === t[0] ? 'on' : ''} onClick={() => setRtab(t[0])}>{t[1]}</button>
        ))}
      </div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!R && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {R && rtab === 'date' ? (
        <>
          <div className="kp">
            <div className="card a"><small>Made</small><b>{fmt(R.rows.reduce((a, r) => a + r.made, 0))}</b></div>
            <div className="card"><small>Given</small><b>{fmt(R.rows.reduce((a, r) => a + r.given, 0))}</b></div>
            <div className="card a"><small>Held now</small><b>{fmt(Object.values(R.holds || {}).reduce((a, x) => a + x.held, 0))}</b></div>
          </div>
          {Object.keys(R.stamp || {}).length ? (
            <div className="card"><div className="lab">Stamping with me</div>
              <table>
                <thead><tr><th>Type</th><th>Received</th><th>Made</th><th>Left</th></tr></thead>
                <tbody>
                  {Object.keys(R.stamp).sort().map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(R.stamp[k].recv)}</td><td>{fmt(R.stamp[k].made)}</td><td className="g">{fmt(R.stamp[k].bal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="card"><div className="lab">Winding ledger | {dm(R.from)} - {dm(R.to)}</div>
            {!R.rows.length ? <div className="note">No entries yet.</div> : null}
            {led(R.rows).map((w, i) => (
              <div key={w.s} style={{ margin: i ? '18px 0 0' : '0' }}>
                <div className="ord">
                  <div><b>{w.s}</b><small>{w.wts}</small></div>
                  <span className="pill">{fmt(w.held)} in hand</span>
                </div>
                <table>
                  <thead><tr><th>Date</th><th>Made (Cr)</th><th>Given (Dr)</th><th>Balance</th></tr></thead>
                  <tbody>
                    {w.rows.map((r, j) => (
                      <tr key={j}>
                        <td>{dm(r.d)}</td>
                        <td style={{ color: 'var(--a)' }}>{r.made ? fmt(r.made) : ''}</td>
                        <td style={{ color: 'var(--red)' }}>{r.given ? fmt(r.given) : ''}</td>
                        <td><b>{fmt(r.held)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bl"><span>Total made {fmt(w.made)}</span><span>Total given {fmt(w.given)}</span></div>
              </div>
            ))}
            <div className="note">Made = add (Cr), Given = remove (Dr). Balance is what is in the contractor's hand after that date, for that winding.</div>
          </div>
        </>
      ) : null}
      {R && rtab === 'type' ? (
        <>
          {!byType.length ? <div className="card"><div className="note">No entries yet.</div></div> : null}
          {byType.map(x => (
            <div className="card" key={x.s + '|' + x.w}>
              <div className="ord">
                <div><b>{x.s}</b><small>{x.w}</small></div>
                <span className="pill">{fmt(x.m - x.g)} held</span>
              </div>
              <div className="bar"><i style={{ width: (x.m ? Math.min(100, Math.round(100 * x.g / x.m)) : 0) + '%' }} /></div>
              <div className="bl"><span>made {fmt(x.m)}</span><span>given {fmt(x.g)}</span></div>
            </div>
          ))}
          <div className="note">Bar = given / made</div>
        </>
      ) : null}
      {R && rtab === 'order' ? (
        <>
          {!R.orders.length ? <div className="card"><div className="note">No orders issued yet.</div></div> : null}
          {R.orders.map((o, i) => (
            <div className="card" key={i}>
              <div className="ord">
                <div><b>Order #{o.order_no}</b><small>{o.stator_type || ''} | {o.winding_type}{o.due ? ' | due ' + dm(o.due) : ''}</small></div>
                <span className="pill">{fmt(Math.max(0, o.qty - o.wound))} left</span>
              </div>
              <div className="bar"><i style={{ width: Math.min(100, Math.round(100 * o.wound / o.qty)) + '%' }} /></div>
              <div className="bl"><span>wound {fmt(o.wound)} | given {fmt(o.given)}</span><span>{fmt(o.qty)}</span></div>
            </div>
          ))}
        </>
      ) : null}
      <Nav />
    </div>
  );
}
