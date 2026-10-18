'use client';
// Admin Order Book - Contractors: stamping and rotor readiness per
// contractor against the winding issued to them.
// Port of the live orderbook.html demand tab.
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';
import { Bi } from '../../components/ob';

export default function Demand() {
  const { data: D, err } = useApi('/api/orderbook');

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Contractors</h1>
      <div className="sub">All bars are out of the winding issued to that contractor.</div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D && D.midlandError ? <div className="err">Midland not readable: {D.midlandError}</div> : null}
      {D && !D.demand.length ? <div className="card mut">No issued orders yet.</div> : null}
      {D ? D.demand.map(d => {
        const sShort = d.stampHave < d.qty, rShort = d.rotorNeed > 0 && d.rotorHave < d.rotorNeed, ok = !sShort && !rShort;
        return (
          <div className="card" key={d.contractor}>
            <div className="ord">
              <div><b>{d.contractor}</b><small>Issued {fmt(d.qty)} winding</small></div>
              <span className={'tag ' + (ok ? 'g' : 'a')}>{ok ? 'Ready' : 'Short'}</span>
            </div>
            <Bi lab="Stators made" have={d.wound} tot={d.qty} sub={fmt(d.left) + ' still to wind'} />
            <Bi lab="Stamping from Midland" have={d.stampHave} tot={d.qty}
              sub={sShort ? 'Short ' + fmt(d.qty - d.stampHave) + ' for ' + fmt(d.qty) : 'Covered for ' + fmt(d.qty)} short={sShort} />
            {d.rotorNeed > 0 ? (
              <Bi lab="Rotor from Midland" have={d.rotorHave} tot={d.rotorNeed}
                sub={rShort ? 'Short ' + fmt(d.rotorNeed - d.rotorHave) + ' for ' + fmt(d.rotorNeed) + ' (shared stock)' : 'Covered for ' + fmt(d.rotorNeed)} short={rShort} />
            ) : (
              <div className="bi">
                <div className="h"><span>Rotor from Midland</span><span style={{ color: 'var(--mute)' }}>-</span></div>
                <small>No rotor type chosen in these orders</small>
              </div>
            )}
            <table>
              <thead><tr><th>Stamping</th><th>Need</th><th>Holds</th><th>Send</th></tr></thead>
              <tbody>
                {d.rows.map(r => (
                  <tr key={r.type}>
                    <td>{r.type}</td>
                    <td>{r.need ? fmt(r.need) : '-'}</td>
                    <td>{fmt(r.holds)}</td>
                    <td>{r.send > 0 ? <b className="red">{fmt(r.send)}</b> : (r.need ? <span className="t">ok</span> : <span className="mut">not needed</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }) : null}
      <Nav />
    </div>
  );
}
