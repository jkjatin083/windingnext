'use client';
// Admin Order Book - the book itself: open/done orders with progress bars
// and the Issue sheet (give order quantity to a contractor).
// Port of the live orderbook.html book tab + issue sheet.
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';
import { Bi, woundOf, givenOf } from '../../components/ob';

export default function Book() {
  const { data: D, err, reload } = useApi('/api/orderbook');
  const [filt, setFilt] = useState('open');
  const [issuing, setIssuing] = useState(null); // order being issued
  const [pick, setPick] = useState(null);
  const [qty, setQty] = useState('');
  const [ie, setIe] = useState('');
  const [busy, setBusy] = useState(false);

  const L = (D ? D.orders : []).map(o => ({ o, w: woundOf(D, o.id), g: givenOf(D, o.id) }));
  const isDone = x => x.g >= x.o.qty;
  const list = L.filter(x => filt === 'all' || (filt === 'done') === isDone(x));

  function openIssue(o) {
    setPick(null); setQty(String(o.qty - o.issued)); setIe(''); setIssuing(o);
  }
  async function doIssue() {
    if (!pick) { setIe('Choose a contractor'); return; }
    setBusy(true);
    try {
      await postJson('/api/orderbook', { action: 'issue', order_id: issuing.id, contractor: pick, qty: Number(qty) });
      setIssuing(null);
      await reload();
    } catch (e) { setIe(e.message); setBusy(false); }
  }

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Order Book</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D ? (
        <>
          <div className="tabs">
            {[['open', 'Open'], ['done', 'Done'], ['all', 'All']].map(t => (
              <button key={t[0]} className={filt === t[0] ? 'on' : ''} onClick={() => setFilt(t[0])}>{t[1]}</button>
            ))}
          </div>
          {!list.length ? <div className="card mut">Nothing here.</div> : null}
          {list.map(x => {
            const o = x.o, left = o.qty - o.issued, mine = D.issues.filter(i => i.order_id === o.id), used = mine.filter(i => i.used);
            return (
              <div className="card" key={o.id}>
                <div className="ord">
                  <div>
                    <b>#{o.order_no} {o.customer}</b>
                    <small>{o.created ? dm(o.created) + ' | ' : ''}{o.stator_type} | {o.winding_type} | {o.motor_type}{o.due ? ' | due ' + dm(o.due) : ''}</small>
                  </div>
                  <span className={isDone(x) ? 'tag g' : (o.issued ? 'pill' : 'tag')}>{isDone(x) ? 'Done' : (o.issued ? 'In progress' : 'New')}</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Bi lab="Stamping given" have={o.stamp_given || 0} tot={o.qty} />
                  <Bi lab="Stators wound" have={x.w} tot={o.qty} />
                  <Bi lab="Given to Pandey ji" have={x.g} tot={o.qty} />
                </div>
                {(o.stamp_rows || []).length ? (
                  <div className="mut" style={{ marginTop: 10 }}>
                    Stamping given: {o.stamp_rows.map(r => r.contractor + ' - ' + r.type + ' x ' + fmt(r.given) + (r.given < r.issued ? ' (of ' + fmt(r.issued) + ')' : '')).join(' | ')}
                  </div>
                ) : null}
                {mine.length ? (
                  <div className="mut" style={{ marginTop: 10 }}>
                    {mine.map(i => i.contractor + ' ' + fmt(i.wound) + ' / ' + fmt(i.qty) + ' wound').join(' | ')}
                  </div>
                ) : null}
                {used.length ? (
                  <div className="need"><span>Used a different stamping</span><span className="tag a">{used.map(i => i.used).join(', ')}</span></div>
                ) : null}
                {left > 0 ? (
                  <div className="need"><span>{fmt(left)} left to issue</span><button className="btn" onClick={() => openIssue(o)}>Issue</button></div>
                ) : null}
              </div>
            );
          })}
        </>
      ) : null}
      {issuing ? (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) setIssuing(null); }}>
          <div className="sheet">
            <div className="mut" style={{ marginBottom: 12 }}>Issue order #{issuing.order_no} | {issuing.stator_type} | {issuing.winding_type} | {fmt(issuing.qty - issuing.issued)} left</div>
            {D.contractors.map(c => {
              const d = D.demand.find(x => x.contractor === c), h = d ? d.rows.reduce((a, r) => a + r.holds, 0) : 0;
              return (
                <div key={c} className={'tile' + (pick === c ? ' on' : '')} onClick={() => setPick(c)}>
                  <span className="r"></span>
                  <span className="t2">{c}</span>
                  <small>{d ? 'left ' + fmt(d.left) + ' | holds ' + fmt(h) : 'no open order'}</small>
                </div>
              );
            })}
            <label className="l">Quantity to issue</label>
            <input className="f" type="number" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} />
            <div className="err">{ie}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn" style={{ flex: 1, padding: 15 }} disabled={busy} onClick={doIssue}>{busy ? 'Saving...' : 'Issue'}</button>
              <button className="btn o" onClick={() => setIssuing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      <Nav />
    </div>
  );
}
