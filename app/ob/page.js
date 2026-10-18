'use client';
// Admin Order Book - Overview. Port of the live orderbook.html overview tab.
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';
import { Bi, woundOf, K } from '../../components/ob';

export default function ObOverview() {
  const { data: D, err } = useApi('/api/orderbook');
  const O = D ? (D.overview || {}) : {};

  // demand by winding type: order qty vs wound
  const w = {};
  (D ? D.orders : []).forEach(o => {
    const k = o.winding_type || '-';
    const x = w[k] || (w[k] = { q: 0, m: 0 });
    x.q += o.qty; x.m += woundOf(D, o.id);
  });
  const wk = Object.keys(w).sort();
  // stamping demand: left to wind vs stamping held by contractors
  const s = {};
  (D ? D.orders : []).forEach(o => {
    const k = K(o.stator_type); if (!k) return;
    const x = s[k] || (s[k] = { n: o.stator_type, need: 0, have: 0 });
    x.need += Math.max(0, o.qty - woundOf(D, o.id));
  });
  (D ? D.demand : []).forEach(d => d.rows.forEach(r => { const k = K(r.type); if (s[k]) s[k].have += r.holds; }));
  const sk = Object.keys(s).filter(k => s[k].need > 0).sort();

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Overview</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D && O.error ? <div className="card"><div className="err">Could not load overview: {O.error}</div></div> : null}
      {D && !O.error ? (
        <>
          <div className="kp">
            <div className="card a"><small>Ready stators</small><b>{fmt(O.ready_stators || 0)}</b></div>
            <div className="card a"><small>Ready motors</small><b>{fmt(O.ready_motors || 0)}</b></div>
          </div>
          <div className="card">
            <div className="lab">Ready motors - who has them</div>
            {(O.motors || []).map((m, i) => (
              <div key={m.name}>
                <div className={'row' + (i ? '' : ' f')}>
                  <div><b>{m.name}</b><small>made {fmt(m.made)} | dispatched {fmt(m.sent)}</small></div>
                  <span>{fmt(m.ready)}</span>
                </div>
                {m.from.map(f => (
                  <div className="row ty" key={f.name}><div><b>from {f.name}</b></div><span>{fmt(f.ready)}</span></div>
                ))}
              </div>
            ))}
          </div>
          <div className="card">
            <div className="lab">Ready stators - by contractor</div>
            {!(O.stators || []).length ? <div className="mut">No stators wound yet.</div> : null}
            {(O.stators || []).map((s2, i) => (
              <div key={s2.name}>
                <div className={'row' + (i ? '' : ' f')}>
                  <div>
                    <b>{s2.name}</b>
                    <small>wound {fmt(s2.wound)} | given {fmt(s2.given)}{s2.name === 'Sunil' ? ' | kept with himself' : ''}</small>
                    {s2.oldest_days != null && s2.ready > 0 ? <small className={s2.oldest_days >= 5 ? 'old' : ''}>oldest ready: {s2.oldest_days} day{s2.oldest_days === 1 ? '' : 's'}</small> : null}
                  </div>
                  <span>{fmt(s2.ready)}</span>
                </div>
                {s2.types.length > 1 ? s2.types.map(t => (
                  <div className="row ty" key={t.name}><div><b>{t.name}</b></div><span>{fmt(t.ready)}</span></div>
                )) : null}
              </div>
            ))}
          </div>
          {(O.inhand || []).length ? (
            <div className="card">
              <div className="lab">Ready stators - by Pandey ji / Sunil</div>
              {O.inhand.map((m, i) => (
                <div key={m.name}>
                  <div className={'row' + (i ? '' : ' f')}>
                    <div><b>{m.name}</b><small>stators in hand, not yet made into motors</small></div>
                    <span>{fmt(m.total)}</span>
                  </div>
                  {m.rows.map(r => (
                    <div className="row ty" key={r.name}><div><b>from {r.name}</b></div><span>{fmt(r.ready)}</span></div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {wk.length ? (
            <div className="card">
              <div className="lab">Demand by winding type</div>
              {wk.map(k => <Bi key={k} lab={k} have={w[k].m} tot={w[k].q} sub={fmt(Math.max(0, w[k].q - w[k].m)) + ' left to wind'} />)}
            </div>
          ) : null}
          {sk.length ? (
            <div className="card">
              <div className="lab">Stamping demand vs stock with contractors</div>
              {sk.map(k => (
                <Bi key={k} lab={s[k].n} have={Math.min(s[k].have, s[k].need)} tot={s[k].need}
                  sub={s[k].have >= s[k].need ? 'Enough stamping with contractors' : 'Short ' + fmt(s[k].need - s[k].have) + ' (have ' + fmt(s[k].have) + ')'}
                  short={s[k].have < s[k].need} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      <Nav />
    </div>
  );
}
