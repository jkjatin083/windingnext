'use client';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';

const fmt = n => Number(n || 0).toLocaleString('en-IN');
const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export default function Hisab() {
  const { data: R, err } = useApi('/api/hisab');
  const stampKeys = R ? Object.keys(R.stamp || {}).sort() : [];
  const holdKeys = R ? Object.keys(R.holds || {}).sort() : [];

  return (
    <div className="w">
      <Top date={dm(new Date().toISOString().slice(0, 10))} />
      <h1>Hisab</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!R && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {R ? (
        <>
          {stampKeys.length ? (
            <div className="card">
              <div className="lab">Stamping hisab</div>
              <table>
                <thead><tr><th>Type</th><th>Received</th><th>Made</th><th>Left</th></tr></thead>
                <tbody>
                  {stampKeys.map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(R.stamp[k].recv)}</td><td>{fmt(R.stamp[k].made)}</td><td className="g">{fmt(R.stamp[k].bal)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {holdKeys.length ? (
            <div className="card">
              <div className="lab">Stator hisab</div>
              <table>
                <thead><tr><th>Type</th><th>Made</th><th>Given</th><th>Held</th></tr></thead>
                <tbody>
                  {holdKeys.map(k => (
                    <tr key={k}><td>{k}</td><td>{fmt(R.holds[k].made)}</td><td>{fmt(R.holds[k].given)}</td><td className="g">{fmt(R.holds[k].held)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!stampKeys.length && !holdKeys.length ? <div className="card"><div className="note">No entries yet.</div></div> : null}
          <div className="note">Numbers counted from 1 Oct 2026.</div>
        </>
      ) : null}
      <Nav />
    </div>
  );
}
