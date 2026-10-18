'use client';
import { useEffect, useState } from 'react';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { START, fmt, dm, todayIST, myMade, myDisp, myMid, windStock, totals, sum } from '../../components/motor';

const red = { color: 'var(--red)', fontWeight: 700 };
const green = { color: 'var(--a)', fontWeight: 700 };
const tot = { fontWeight: 700, borderTop: '1.5px solid var(--ink)' };

export default function Report() {
  const { data: M, err } = useApi('/api/motor');
  const { data: MD, err: merr } = useApi('/api/midland');
  const [me, setMe] = useState('');
  const [fromD, setFromD] = useState('');
  const [toD, setToD] = useState('');

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Pandey ji' && n !== 'Sunil') location.href = '/home';
  }, []);

  const rows = M ? M.rows : [];
  const mid = MD ? (MD.rows || []) : [];
  const from = fromD || START, to = toD || '9999-12-31';
  const t = totals(rows, mid, me);

  // ---- Cover / kuppa blocks (all-time when no date filter, else range) ----
  function coverBlock() {
    const rowsC = myMid(mid, me, 'cover').filter(r => !fromD || (r.date >= from && r.date <= to));
    const by = {}; rowsC.forEach(r => { by[r.item] = (by[r.item] || 0) + r.qty; });
    const ks = Object.keys(by).sort();
    const liya = sum(myMid(mid, me, 'cover').map(r => r.qty));
    return (
      <>
        <div className="lab" style={{ marginTop: 14 }}>Cover</div>
        {ks.length ? (
          <table><tbody>{ks.map(k => <tr key={k}><td>{k}</td><td>{fmt(by[k])}</td></tr>)}</tbody></table>
        ) : <div className="note">None issued since 1 Oct.</div>}
        {!fromD ? (
          <>
            <table>
              <thead><tr><th></th><th>Received</th><th>Used</th><th>Balance</th></tr></thead>
              <tbody><tr>
                <td style={tot}>Total</td><td style={tot}>{fmt(liya)}</td><td style={tot}>{fmt(t.cov)}</td>
                <td style={{ ...tot, ...(liya - t.cov < 0 ? red : {}) }}>{fmt(liya - t.cov)}</td>
              </tr></tbody>
            </table>
            <div className="note">Used = motors made x 2 (automatic)</div>
          </>
        ) : null}
      </>
    );
  }

  function kuppaBlock(range) {
    // range = null -> all time; otherwise {from, to}
    let by = {}, liya = 0, laga = 0, open = 0;
    if (!range) {
      myMid(mid, me, 'kuppa').forEach(r => { by[r.item] = (by[r.item] || 0) + r.qty; });
      liya = sum(Object.values(by));
      laga = t.kup;
    } else {
      const byD = {};
      const g = dd => byD[dd] || (byD[dd] = { m: 0, k: 0, l: 0 });
      myMid(mid, me, 'kuppa').forEach(r => { g(r.date).l += r.qty; });
      myMade(rows, me).forEach(r => { g(r.d).m += r.qty; g(r.d).k += (r.kuppa || 0); });
      Object.keys(byD).forEach(dd => {
        const x = byD[dd];
        if (dd < range.from) open += x.l - x.k;
        else if (dd <= range.to) { liya += x.l; laga += x.k; }
      });
      myMid(mid, me, 'kuppa').filter(r => r.date >= range.from && r.date <= range.to).forEach(r => { by[r.item] = (by[r.item] || 0) + r.qty; });
    }
    const bacha = open + liya - laga;
    const ks = Object.keys(by).sort();
    return (
      <>
        <div className="lab" style={{ marginTop: 14 }}>Kuppa</div>
        {ks.length ? (
          <table><tbody>{ks.map(k => <tr key={k}><td>{k}</td><td>{fmt(by[k])}</td></tr>)}</tbody></table>
        ) : <div className="note">None issued since 1 Oct.</div>}
        <table>
          {!range ? (
            <>
              <thead><tr><th></th><th>Received</th><th>Used</th><th>Balance</th></tr></thead>
              <tbody><tr>
                <td style={tot}>Total</td><td style={tot}>{fmt(liya)}</td><td style={tot}>{fmt(laga)}</td>
                <td style={{ ...tot, ...(liya - laga < 0 ? red : {}) }}>{fmt(liya - laga)}</td>
              </tr></tbody>
            </>
          ) : (
            <tbody>
              {open ? <tr><td>Opening balance</td><td>{fmt(open)}</td></tr> : null}
              <tr><td>Received</td><td>{fmt(liya)}</td></tr>
              <tr><td>Used (motors with kuppa x 1)</td><td>{fmt(laga)}</td></tr>
              <tr><td style={tot}>Balance</td><td style={{ ...tot, ...(bacha < 0 ? red : {}) }}>{fmt(bacha)}</td></tr>
            </tbody>
          )}
        </table>
        {!range ? <div className="note">Used = motors with kuppa x 1 (automatic)</div> : null}
      </>
    );
  }

  // ---- Date-wise running balance (from 1 Oct) ----
  const byD = {};
  const gd = dd => byD[dd] || (byD[dd] = { b: 0, c: 0, m: 0 });
  mid.filter(r => r.contractor === me).forEach(r => { if (r.category === 'bush') gd(r.date).b += r.qty; else if (r.category === 'capacitor') gd(r.date).c += r.qty; });
  myMade(rows, me).forEach(r => { gd(r.d).m += r.qty; });
  let rb = 0, rc = 0;
  const list = Object.keys(byD).sort().map(dd => { const x = byD[dd]; rb += x.b - 2 * x.m; rc += x.c - x.m; return { d: dd, ...x, rb, rc }; });
  const vis = list.filter(x => x.d >= from && x.d <= to);
  const S = { b: sum(vis.map(x => x.b)), c: sum(vis.map(x => x.c)), m: sum(vis.map(x => x.m)) };
  const open = { b: 0, c: 0 };
  list.filter(x => x.d < from).forEach(x => { open.b += x.b - 2 * x.m; open.c += x.c - x.m; });
  const cb = open.b + S.b - 2 * S.m, cc = open.c + S.c - S.m;

  const ws2 = windStock(rows, me, from, to);
  const dd = myMade(rows, me).filter(r => r.d >= from && r.d <= to);
  const xd = myDisp(rows, me).filter(r => r.d >= from && r.d <= to);

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Report</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {merr ? <div className="card"><div className="err">Could not load bush/capacitor from Midland: {merr}</div></div> : null}
      {MD && MD.extraError ? <div className="card"><div className="err">Could not load kuppa: {MD.extraError}</div></div> : null}
      {!M && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {M ? (
        <>
          <div className="card">
            <div className="lab">Parts: Bush and Capacitor</div>
            <table>
              <thead><tr><th></th><th>Received</th><th>Used</th><th>Balance</th></tr></thead>
              <tbody>
                <tr><td>Bush 034</td><td>{fmt(t.b)}</td><td>{fmt(t.bl)}</td><td style={t.b - t.bl < 0 ? red : {}}>{fmt(t.b - t.bl)}</td></tr>
                <tr><td>Capacitor</td><td>{fmt(t.c)}</td><td>{fmt(t.cl)}</td><td style={t.c - t.cl < 0 ? red : {}}>{fmt(t.c - t.cl)}</td></tr>
              </tbody>
            </table>
            <div className="note">Received = issued from Midland since 1 Oct. Used = motors made x 2 bush, x 1 capacitor (automatic).</div>
            {coverBlock()}
            {kuppaBlock(null)}
          </div>
          <div className="card">
            <div className="lab">Parts report</div>
            <div className="note">Rule: 1 motor = 2 bush + 1 capacitor + 2 cover. Kuppa only in the motors entered. Parts are used when motors are made.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab">From</div>
                <input className="sel" type="date" min={START} value={fromD} onChange={e => setFromD(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab">To</div>
                <input className="sel" type="date" min={START} value={toD} onChange={e => setToD(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="card">
            <div className="lab">Bush 034</div>
            <table><tbody>
              <tr><td>Received</td><td>{fmt(S.b)}</td></tr>
              <tr><td>Used ({fmt(S.m)} motors made x 2)</td><td>{fmt(2 * S.m)}</td></tr>
              {open.b ? <tr><td>Opening balance</td><td>{fmt(open.b)}</td></tr> : null}
              <tr><td style={tot}>Balance</td><td style={{ ...tot, ...(cb < 0 ? red : {}) }}>{fmt(cb)}</td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="lab">Capacitor (total)</div>
            <table><tbody>
              <tr><td>Received</td><td>{fmt(S.c)}</td></tr>
              <tr><td>Used ({fmt(S.m)} motors made x 1)</td><td>{fmt(S.m)}</td></tr>
              {open.c ? <tr><td>Opening balance</td><td>{fmt(open.c)}</td></tr> : null}
              <tr><td style={tot}>Balance</td><td style={{ ...tot, ...(cc < 0 ? red : {}) }}>{fmt(cc)}</td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="lab">Date-wise</div>
            {vis.length ? (
              <>
                <table>
                  <thead><tr><th>Date</th><th>Bush in</th><th>Cap in</th><th>Motors made</th><th>Bush bal.</th><th>Cap bal.</th></tr></thead>
                  <tbody>
                    {vis.map(x => (
                      <tr key={x.d}>
                        <td>{dm(x.d)}</td><td>{x.b ? fmt(x.b) : '-'}</td><td>{x.c ? fmt(x.c) : '-'}</td><td>{x.m ? fmt(x.m) : '-'}</td>
                        <td style={x.rb < 0 ? red : {}}>{fmt(x.rb)}</td><td style={x.rc < 0 ? red : {}}>{fmt(x.rc)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={tot}>Total</td><td style={tot}>{fmt(S.b)}</td><td style={tot}>{fmt(S.c)}</td><td style={tot}>{fmt(S.m)}</td>
                      <td style={tot}></td><td style={tot}></td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">in = received from Midland. made = motors made. bal. = balance.</div>
              </>
            ) : <div className="note">Nothing in this date range.</div>}
          </div>
          <div className="card">
            <div className="lab">Check</div>
            <div>Bush: {fmt(open.b + S.b)} - {fmt(2 * S.m)} = {fmt(cb)} <span style={green}>OK</span></div>
            <div>Capacitor: {fmt(open.c + S.c)} - {fmt(S.m)} = {fmt(cc)} <span style={green}>OK</span></div>
            {(cb < 0 || cc < 0) ? <div style={{ ...red, marginTop: 6 }}>Negative balance: received is too low or motors made was entered too high. Please check.</div> : null}
          </div>
          <div className="card">
            <div className="lab">Winding received by contractor</div>
            {ws2.length ? (
              <>
                <table>
                  <thead><tr><th>From</th><th>Type</th><th>Received</th><th>Motors made</th><th>Available</th></tr></thead>
                  <tbody>
                    {ws2.map(x => (
                      <tr key={x.c + '|' + x.t}>
                        <td>{x.c}</td><td>{x.t}</td><td>{fmt(x.recvR)}</td><td>{fmt(x.dispR)}</td><td>{fmt(x.recv - x.disp)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan="2" style={tot}>Total</td>
                      <td style={tot}>{fmt(sum(ws2.map(x => x.recvR)))}</td>
                      <td style={tot}>{fmt(sum(ws2.map(x => x.dispR)))}</td>
                      <td style={tot}>{fmt(sum(ws2.map(x => x.recv - x.disp)))}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">Received and Motors made follow the date filter. Available is the current total.</div>
              </>
            ) : <div className="note">No winding received yet.</div>}
          </div>
          <div className="card">
            <div className="lab">Motors made by date</div>
            {dd.length ? (
              <table>
                <thead><tr><th>Date</th><th>Winding</th><th>Motors</th><th>With kuppa</th></tr></thead>
                <tbody>
                  {dd.map(r => (
                    <tr key={r.id}>
                      <td>{dm(r.d)}</td><td>{r.party} - {r.stype}</td><td>{fmt(r.qty)}</td><td>{r.kuppa ? fmt(r.kuppa) : '-'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan="2" style={tot}>Total</td>
                    <td style={tot}>{fmt(sum(dd.map(r => r.qty)))}</td>
                    <td style={tot}>{fmt(sum(dd.map(r => r.kuppa || 0)))}</td>
                  </tr>
                </tbody>
              </table>
            ) : <div className="note">No motors made in this range.</div>}
          </div>
          <div className="card">
            <div className="lab">Motors summary</div>
            <table><tbody>
              <tr><td>Made (all time)</td><td>{fmt(t.motors)}</td></tr>
              <tr><td>Dispatched (all time)</td><td>{fmt(t.sent)}</td></tr>
              <tr><td style={tot}>In hand</td><td style={{ ...tot, ...(t.hand < 0 ? red : {}) }}>{fmt(t.hand)}</td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <div className="lab">Motor dispatch by date</div>
            {xd.length ? (
              <table>
                <thead><tr><th>Date</th><th>Winding</th><th>Motors</th></tr></thead>
                <tbody>
                  {xd.map(r => (
                    <tr key={r.id}>
                      <td>{dm(r.d)}</td><td>{r.party ? r.party + ' - ' + r.stype : '-'}</td><td>{fmt(r.qty)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan="2" style={tot}>Total</td>
                    <td style={tot}>{fmt(sum(xd.map(r => r.qty)))}</td>
                  </tr>
                </tbody>
              </table>
            ) : <div className="note">No dispatch in this range.</div>}
          </div>
          <div className="card">
            {fromD || toD ? (
              <>
                {coverBlock()}
                {kuppaBlock({ from, to })}
              </>
            ) : (
              <>
                <div className="lab">Cover and kuppa (date range)</div>
                <div className="note">Choose From and To dates above to see the range-wise cover and kuppa hisab.</div>
              </>
            )}
          </div>
        </>
      ) : null}
      <Nav />
    </div>
  );
}
