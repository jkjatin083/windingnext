'use client';
// Sale orders - Status timeline (Sandeep). Port of the live sale.html status tab.
import { useEffect, useState } from 'react';
import { useApi } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';

const SUBS = {
  'Order': 'Order received',
  'Winding': 'Wound by contractors',
  'Motor': 'Made by Pandey ji / Sunil',
  'Ready to dispatch': 'Automatic',
  'Dispatched': 'Dispatched to customer',
  'Order completed': 'All dispatched'
};

export default function Status() {
  const { data: D, err } = useApi('/api/sale');
  const [me, setMe] = useState('');

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Sandeep') location.href = '/home';
  }, []);

  const orders = D ? (D.orders || []).filter(o => !o.cancelled) : [];

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Status</h1>
      <div className="sub">The line stops at the current step. Date = day that step finished. Ready to dispatch is automatic when all motors are made (Pandey ji / Sunil entries).</div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D && !orders.length ? <div className="card"><div className="note" style={{ margin: 0 }}>No orders yet.</div></div> : null}
      {D ? orders.map(o => {
        const p = (D.pipe || []).find(x => x.id === o.id);
        const st = p ? p.stages : [{ k: 'Order', done: true, date: o.created }, { k: 'Winding' }, { k: 'Motor' }, { k: 'Ready to dispatch' }, { k: 'Dispatched' }, { k: 'Order completed' }];
        const cur = st.findIndex(s => !s.done), all = cur < 0;
        return (
          <div className="card" key={o.id}>
            <div className="ord">
              <div><b>#{o.order_no} {o.customer}</b><small>{fmt(o.qty)} | {o.stator_type} | {o.winding_type}</small></div>
              <span className={all ? 'tag g' : 'pill'}>{all ? 'Completed' : st[cur].k}</span>
            </div>
            <div className="tl">
              {st.map((s, i) => {
                const cls = s.done ? 'd' : (i === cur ? 'c' : '');
                const cnt = ['Winding', 'Motor', 'Dispatched'].includes(s.k);
                const right = s.done ? dm(s.date) : (cnt ? fmt(s.n || 0) + ' / ' + fmt(o.qty) : '-');
                const sub = s.done && cnt ? fmt(o.qty) + ' / ' + fmt(o.qty) : SUBS[s.k];
                return (
                  <div className={'s ' + cls} key={s.k}>
                    <i>{s.done ? '✓' : (i === cur ? '•' : '')}</i>
                    <div className="x">
                      <div><b>{s.k}</b><small>{sub}</small></div>
                      <span className={cls ? '' : 'm'}>{right}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }) : null}
      <Nav />
    </div>
  );
}
