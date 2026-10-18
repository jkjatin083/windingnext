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

export default function Entries() {
  const { data: R, err } = useApi('/api/entries');

  return (
    <div className="w">
      <Top date={R ? dm(R.to) : ''} />
      <h1>Entries</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!R && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {R ? (
        <>
          <div className="kp">
            <div className="card a"><small>Made</small><b>{fmt(R.made)}</b></div>
            <div className="card"><small>Given</small><b>{fmt(R.given)}</b></div>
            <div className="card a"><small>Held now</small><b>{fmt(R.heldNow)}</b></div>
          </div>
          <div className="card">
            <div className="lab">Entries | {dm(R.from)} - {dm(R.to)}</div>
            {!R.rows.length ? <div className="note">No entries yet.</div> : null}
            {R.rows.slice().reverse().map((r, i) => (
              <div className="row" key={i}>
                <div><b>{dm(r.d)} | {r.stype}</b><small>{r.wt} | made {fmt(r.made)} | given {fmt(r.given)}</small></div>
                <span style={{ color: 'var(--a)' }}>{fmt(r.held)} held</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <Nav />
    </div>
  );
}
