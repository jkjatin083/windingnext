'use client';
// Sale orders - Overview (Sandeep). Port of the live sale.html overview tab.
import { useEffect, useState } from 'react';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';

export default function SaleOverview() {
  const { data: D, err } = useApi('/api/sale');
  const [me, setMe] = useState('');

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Sandeep') location.href = '/home';
  }, []);

  const O = D ? (D.overview || {}) : {};
  const wait = D ? (D.orders || []).filter(o => !o.cancelled && !o.issued) : [];

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
            <div className="card a"><small>Ready motors</small><b>{fmt(O.ready_motors || 0)}</b></div>
            <div className="card a"><small>Ready stators</small><b>{fmt(O.ready_stators || 0)}</b></div>
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
            <div className="lab">Ready wound stators - by contractor</div>
            {!(O.stators || []).length ? <div className="note" style={{ margin: 0 }}>No stators wound yet.</div> : null}
            {(O.stators || []).map((s, i) => (
              <div key={s.name}>
                <div className={'row' + (i ? '' : ' f')}>
                  <div>
                    <b>{s.name}</b>
                    <small>wound {fmt(s.wound)} | given {fmt(s.given)}{s.name === 'Sunil' ? ' | kept with himself' : ''}</small>
                    {s.oldest_days != null && s.ready > 0 ? <small className={s.oldest_days >= 5 ? 'old' : ''}>oldest ready: {s.oldest_days} day{s.oldest_days === 1 ? '' : 's'}</small> : null}
                  </div>
                  <span>{fmt(s.ready)}</span>
                </div>
                {s.types.length > 1 ? s.types.map(t => (
                  <div className="row ty" key={t.name}><div><b>{t.name}</b></div><span>{fmt(t.ready)}</span></div>
                )) : null}
              </div>
            ))}
          </div>
          {O.inhand && O.inhand.length ? (
            <div className="card">
              <div className="lab">Ready wound stators - by Pandey ji / Sunil</div>
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
          {wait.length ? (
            <div className="card">
              <div className="lab">Orders waiting (not issued)</div>
              {wait.map((o, i) => (
                <div className={'row' + (i ? '' : ' f')} key={o.id}>
                  <div><b>#{o.order_no} {o.customer}</b><small>{o.created ? dm(o.created) + ' | ' : ''}{o.winding_type} | {o.stator_type}</small></div>
                  <span style={{ color: 'var(--mute)' }}>{fmt(o.qty)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      <Nav />
    </div>
  );
}
