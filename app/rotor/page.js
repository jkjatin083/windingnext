'use client';
// Admin Order Book - Rotor: Midland stock vs open-order need.
// Port of the live orderbook.html rotor tab.
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';
import { Bi } from '../../components/ob';

export default function Rotor() {
  const { data: D, err } = useApi('/api/orderbook');
  const R = D ? D.rotor : [];
  const st = R.reduce((a, r) => a + Math.max(0, r.stock), 0), nd = R.reduce((a, r) => a + r.need, 0);

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Rotor</h1>
      <div className="sub">Stock from Midland. Need = quantity of open orders with this rotor not yet wound.</div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D ? (
        <>
          <div className="kp">
            <div className="card a"><small>In stock</small><b>{fmt(st)}</b></div>
            <div className="card"><small>Needed</small><b>{fmt(nd)}</b></div>
          </div>
          {!R.length ? <div className="card mut">No rotor stock or rotor orders yet.</div> : (
            <div className="card">
              <div className="lab">Rotor by type</div>
              {R.map(r => (
                <Bi key={r.name} lab={r.name} have={Math.max(0, r.stock)} tot={r.need || Math.max(0, r.stock)}
                  sub={r.need > r.stock ? 'Short ' + fmt(r.need - r.stock) : (r.need ? 'Covered' : 'No open orders')}
                  short={r.need > r.stock} />
              ))}
            </div>
          )}
        </>
      ) : null}
      <Nav />
    </div>
  );
}
