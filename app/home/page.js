'use client';
import Link from 'next/link';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Home() {
  const { data: H, err } = useApi('/api/home');
  const od = H && H.issues && H.issues.length ? H.issues[0] : null;
  const pc = od && od.qty ? Math.min(100, Math.round(100 * od.wound / od.qty)) : 0;
  const stampKeys = H ? Object.keys(H.stamp || {}).sort() : [];
  const me = H ? H.me : '';

  return (
    <div className="w">
      <Top date={H ? dm(H.today) : ''} />
      <h1>Home</h1>
      <div className="ab">
        <Link className="btn" href="/made">Made today</Link>
        <Link className="btn dk" href="/give">Give to {me === 'Sunil' ? 'Sunil' : 'Pandey ji'}</Link>
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
      <Nav />
    </div>
  );
}
