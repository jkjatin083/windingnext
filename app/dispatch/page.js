'use client';
import { useEffect, useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { START, fmt, dm, todayIST, myMade, myDisp, windStock, cleanNote, sum } from '../../components/motor';

const red = { color: 'var(--red)', fontWeight: 700 };
const smallBtn = { padding: '4px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 12, background: '#fff', color: 'var(--ink)', cursor: 'pointer' };

export default function Dispatch() {
  const { data: M, err, reload } = useApi('/api/motor');
  const { data: IS } = useApi('/api/issues');
  const [me, setMe] = useState('');
  const [src, setSrc] = useState('');
  const [ordId, setOrdId] = useState('');
  const [qty, setQty] = useState('');
  const [d, setD] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [serr, setSerr] = useState('');
  const [toast, setToast] = useState('');
  const [ed, setEd] = useState(null);
  const [eq, setEq] = useState(''); const [edt, setEdt] = useState(''); const [en, setEn] = useState('');
  const [eerr, setEerr] = useState(''); const [ebusy, setEbusy] = useState(false);

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Pandey ji' && n !== 'Sunil') location.href = '/home';
    setD(todayIST());
  }, []);

  const rows = M ? M.rows : [];
  const ORD = IS ? (IS.issues || []) : [];
  const ws = windStock(rows, me);
  const hw = ws.filter(x => x.disp > 0 || x.sent > 0);
  const sp = src.split('|');
  const c = sp[0], t = sp.slice(1).join('|');
  const cur = hw.find(x => x.c === c && x.t === t);
  const hand = cur ? cur.disp - cur.sent : 0;
  const q = Number(qty) || 0;
  const totMade = sum(myMade(rows, me).map(r => r.qty));
  const totSent = sum(myDisp(rows, me).map(r => r.qty));

  // Orders for the chosen winding: motors made and not yet dispatched
  let ords = ORD.filter(o => o.contractor === c);
  const same = ords.filter(o => o.stator_type === t);
  if (same.length) ords = same;
  ords = ords.map(o => ({ ...o, left: o.made - o.sent })).filter(o => o.left > 0);

  function problem() {
    if (!src || !(q > 0)) return null;
    if (q > hand) return 'Not enough motors in hand for this winding: only ' + fmt(hand) + ', you entered ' + fmt(q) + '.';
    if (d && myDisp(rows, me).some(r => r.d === d && r.party === c && r.stype === t && r.qty === q && r.kind === 'mdispatch')) return 'Duplicate: this dispatch is already saved.';
    return null;
  }
  function ordProblem() {
    if (!src || !ords.length) return null;
    if (!ordId) return 'Select the order first';
    const o = ords.find(x => String(x.id) === String(ordId));
    if (o && q > o.left) return 'This order has only ' + fmt(o.left) + ' motors ready to dispatch, you entered ' + fmt(q) + '.';
    return null;
  }
  const pr = problem(), po = ordProblem();

  async function save() {
    setSerr('');
    if (!src) { setSerr('Select the winding (contractor - type) first'); return; }
    if (!(q > 0)) { setSerr('Enter the number of motors dispatched'); return; }
    if (pr) { setSerr(pr); return; }
    if (po) { setSerr(po); return; }
    if (!d || d < START) { setSerr('Date must be 1 Oct 2026 or later'); return; }
    setBusy(true);
    try {
      const r = await postJson('/api/motor', { action: 'add', kind: 'mdispatch', party: c, stype: t, qty: q, d, note, issue_id: Number(ordId) || null });
      if (!r) return;
      setQty(''); setSrc(''); setOrdId(''); setNote('');
      setToast('Saved'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setSerr(e.message); }
    setBusy(false);
  }

  function openEdit(r) {
    setEd(r); setEq(String(r.qty)); setEdt(r.d); setEn(cleanNote(r.note)); setEerr('');
  }
  async function saveEdit() {
    if (!ed) return;
    setEerr(''); setEbusy(true);
    try {
      const r = await postJson('/api/motor', { action: 'edit', id: ed.id, qty: Number(eq), d: edt, note: en });
      if (!r) return;
      setEd(null);
      setToast('Saved'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setEerr(e.message); }
    setEbusy(false);
  }

  const dl = myDisp(rows, me).slice().sort((a, b) => b.d.localeCompare(a.d) || b.id - a.id);
  const today = todayIST();

  return (
    <div className="w">
      {toast ? <div id="toast">{toast}</div> : null}
      <Top date={dm(d || today)} />
      <h1>Dispatch</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!M && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {M ? (
        <>
          <div className="card">
            <div className="lab">Motors in hand</div>
            {hw.length ? (
              <>
                <table>
                  <thead><tr><th>Winding</th><th>Made</th><th>Dispatched</th><th>In hand</th></tr></thead>
                  <tbody>
                    {hw.map(x => (
                      <tr key={x.c + '|' + x.t}>
                        <td>{x.c} - {x.t}</td><td>{fmt(x.disp)}</td><td>{fmt(x.sent)}</td>
                        <td style={x.disp - x.sent < 0 ? red : {}}>{fmt(x.disp - x.sent)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>Total</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(totMade)}</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(totSent)}</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)', ...(totMade - totSent < 0 ? red : {}) }}>{fmt(totMade - totSent)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">In hand = motors made - motors dispatched, for each winding.</div>
              </>
            ) : <div className="note">No motors made yet.</div>}
          </div>
          <div className="card">
            <div className="lab">Motors in hand, by winding</div>
            {hw.length ? hw.map(x => (
              <div key={x.c + '|' + x.t} className={'tile' + (src === x.c + '|' + x.t ? ' on' : '')} onClick={() => { setSrc(x.c + '|' + x.t); setOrdId(''); }}>
                <span className="r"></span>
                <div className="t"><b>{x.c} - {x.t}</b><small>motors in hand</small></div>
                <span className="n">{fmt(x.disp - x.sent)}</span>
              </div>
            )) : <div className="note">Nothing to choose yet</div>}
            {src ? (
              <div className="note">
                Motors in hand for this winding: <b>{fmt(hand)}</b>
                {q > 0 ? <> &nbsp; After this dispatch: <b style={hand - q < 0 ? red : {}}>{fmt(hand - q)}</b></> : null}
              </div>
            ) : null}
          </div>
          {src ? (
            <div className="card">
              <div className="lab">For which order</div>
              {ords.length ? ords.map(o => (
                <div key={o.id} className={'tile' + (String(ordId) === String(o.id) ? ' on' : '')} onClick={() => setOrdId(String(o.id))}>
                  <span className="r"></span>
                  <div className="t"><b>#{o.order_no} {o.customer}</b><small>{[o.motor_type, o.winding_type].filter(Boolean).join(' - ')}</small></div>
                  <span className="n">{fmt(o.left)} ready</span>
                </div>
              )) : <div className="note">No open order for this winding</div>}
            </div>
          ) : null}
          <div className="card qty">
            <div className="lab">Motors dispatched</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 50))}>+50</button>
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String(hand))}>All</button>
            </div>
          </div>
          <div className="card">
            <div className="lab">Date</div>
            <input className="sel" type="date" min={START} value={d} onChange={e => setD(e.target.value)} />
            <div className="lab">Note (optional)</div>
            <input className="sel" maxLength={100} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="card">
            <div className="lab">Dispatch entries</div>
            {dl.length ? (
              <table>
                <thead><tr><th>Date</th><th>Motors</th><th></th></tr></thead>
                <tbody>
                  {dl.map(r => (
                    <tr key={r.id}>
                      <td>{dm(r.d)}
                        {r.party ? <span className="note" style={{ margin: 0 }}> {r.party} - {r.stype}{r.kind === 'dispatch' ? ' (old entry)' : ''}</span> : null}
                        {cleanNote(r.note) ? <span className="note" style={{ margin: 0, display: 'block' }}>{cleanNote(r.note)}</span> : null}
                      </td>
                      <td>{fmt(r.qty)}</td>
                      <td>{r.kind === 'mdispatch' && r.d === today ? <button style={smallBtn} onClick={() => openEdit(r)}>Edit</button> : null}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>Total</td>
                    <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(totSent)}</td>
                    <td style={{ borderTop: '1.5px solid var(--ink)' }}></td>
                  </tr>
                </tbody>
              </table>
            ) : <div className="note">Nothing yet.</div>}
          </div>
        </>
      ) : null}
      <div className="sticky"><div>
        <div className="err">{serr || pr || po || ''}</div>
        <button className="btn dk" disabled={busy || !M || !!pr || !!po} onClick={save}>Save dispatch</button>
      </div></div>
      {ed ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, width: '100%', maxWidth: 420 }}>
            <div className="lab" style={{ marginBottom: 8 }}>Edit entry</div>
            <div className="note">{ed.party} - {ed.stype}</div>
            <div className="lab">Quantity</div>
            <input className="sel" type="number" inputMode="numeric" value={eq} onChange={e => setEq(e.target.value)} />
            <div className="lab">Date</div>
            <input className="sel" type="date" min={START} value={edt} onChange={e => setEdt(e.target.value)} />
            <div className="lab">Note (optional)</div>
            <input className="sel" maxLength={100} value={en} onChange={e => setEn(e.target.value)} />
            <div className="err">{eerr}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button style={{ ...smallBtn, flex: 1, padding: '10px 14px', fontSize: 14 }} onClick={() => setEd(null)}>Cancel</button>
              <button style={{ ...smallBtn, flex: 1, padding: '10px 14px', fontSize: 14, background: 'var(--a)', color: '#fff', border: 0 }} disabled={ebusy} onClick={saveEdit}>Save changes</button>
            </div>
          </div>
        </div>
      ) : null}
      <Nav />
    </div>
  );
}
