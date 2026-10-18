'use client';
import { useEffect, useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { START, fmt, dm, todayIST, myMade, windStock, cleanNote, sum } from '../../components/motor';

const red = { color: 'var(--red)', fontWeight: 700 };
const smallBtn = { padding: '4px 10px', fontSize: 12, border: '1px solid var(--line)', borderRadius: 12, background: '#fff', color: 'var(--ink)', cursor: 'pointer' };

export default function MotorMake() {
  const { data: M, err, reload } = useApi('/api/motor');
  const { data: IS } = useApi('/api/issues');
  const [me, setMe] = useState('');
  const [src, setSrc] = useState('');
  const [ordId, setOrdId] = useState('');
  const [qty, setQty] = useState('');
  const [kup, setKup] = useState('');
  const [d, setD] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [serr, setSerr] = useState('');
  const [toast, setToast] = useState('');
  const [ed, setEd] = useState(null);
  const [eq, setEq] = useState(''); const [edt, setEdt] = useState(''); const [ek, setEk] = useState(''); const [en, setEn] = useState('');
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
  const sp = src.split('|');
  const c = sp[0], t = sp.slice(1).join('|');
  const cur = ws.find(x => x.c === c && x.t === t);
  const av = cur ? cur.recv - cur.disp : 0;
  const q = Number(qty) || 0;
  const kq = Number(kup) || 0;

  // Orders for the chosen winding: motors still to make
  let ords = ORD.filter(o => o.contractor === c);
  const same = ords.filter(o => o.stator_type === t);
  if (same.length) ords = same;
  ords = ords.map(o => ({ ...o, left: o.qty - o.made })).filter(o => o.left > 0);

  function problem() {
    if (!src || !(q > 0)) return null;
    if (q > av) return 'Not enough winding: only ' + fmt(av) + ' available, you entered ' + fmt(q) + '.';
    if (d && myMade(rows, me).some(r => r.d === d && r.party === c && r.stype === t && r.qty === q && (r.kuppa || 0) === kq)) return 'Duplicate: this motors entry is already saved.';
    return null; // PARTS_CHECK off, same as live app2.html
  }
  function ordProblem() {
    if (!src || !ords.length) return null;
    if (!ordId) return 'Select the order first';
    const o = ords.find(x => String(x.id) === String(ordId));
    if (o && q > o.left) return 'This order has only ' + fmt(o.left) + ' motors left to make, you entered ' + fmt(q) + '.';
    return null;
  }
  const pr = problem(), po = ordProblem();

  async function save() {
    setSerr('');
    if (!src) { setSerr('Select the winding (contractor - type) first'); return; }
    if (!(q > 0)) { setSerr('Enter the number of motors made'); return; }
    if (pr) { setSerr(pr); return; }
    if (po) { setSerr(po); return; }
    if (!d || d < START) { setSerr('Date must be 1 Oct 2026 or later'); return; }
    if (kq < 0 || kq > q) { setSerr('Motors with kuppa cannot be more than motors made'); return; }
    setBusy(true);
    try {
      const r = await postJson('/api/motor', { action: 'add', kind: 'made', party: c, stype: t, qty: q, kuppa: kq, d, note, issue_id: Number(ordId) || null });
      if (!r) return;
      setQty(''); setKup(''); setSrc(''); setOrdId(''); setNote('');
      setToast('Saved'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setSerr(e.message); }
    setBusy(false);
  }

  function openEdit(r) {
    setEd(r); setEq(String(r.qty)); setEdt(r.d); setEk(String(r.kuppa || 0)); setEn(cleanNote(r.note)); setEerr('');
  }
  async function saveEdit() {
    if (!ed) return;
    setEerr(''); setEbusy(true);
    try {
      const r = await postJson('/api/motor', { action: 'edit', id: ed.id, qty: Number(eq), d: edt, note: en, kuppa: Number(ek) || 0 });
      if (!r) return;
      setEd(null);
      setToast('Saved'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setEerr(e.message); }
    setEbusy(false);
  }

  const ml = myMade(rows, me).slice().sort((a, b) => b.d.localeCompare(a.d) || b.id - a.id);
  const today = todayIST();

  return (
    <div className="w">
      {toast ? <div id="toast">{toast}</div> : null}
      <Top date={dm(d || today)} />
      <h1>Motors made</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!M && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {M ? (
        <>
          <div className="card">
            <div className="lab">Winding received (from App 1)</div>
            {ws.length ? (
              <>
                <table>
                  <thead><tr><th>From</th><th>Type</th><th>Received</th><th>Motors made</th><th>Available</th></tr></thead>
                  <tbody>
                    {ws.map(x => (
                      <tr key={x.c + '|' + x.t}>
                        <td>{x.c}</td><td>{x.t}</td><td>{fmt(x.recv)}</td><td>{fmt(x.disp)}</td>
                        <td style={x.recv - x.disp < 0 ? red : {}}>{fmt(x.recv - x.disp)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td colSpan="2" style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>Total</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(sum(ws.map(x => x.recv)))}</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(sum(ws.map(x => x.disp)))}</td>
                      <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(sum(ws.map(x => x.recv - x.disp)))}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="note">Available = winding received from the contractor - motors already made from it.</div>
              </>
            ) : <div className="note">No winding received yet.</div>}
          </div>
          <div className="card">
            <div className="lab">Winding to use</div>
            {ws.length ? ws.map(x => (
              <div key={x.c + '|' + x.t} className={'tile' + (src === x.c + '|' + x.t ? ' on' : '')} onClick={() => { setSrc(x.c + '|' + x.t); setOrdId(''); }}>
                <span className="r"></span>
                <div className="t"><b>{x.c} - {x.t}</b><small>available</small></div>
                <span className="n">{fmt(x.recv - x.disp)}</span>
              </div>
            )) : <div className="note">Nothing to choose yet</div>}
            {src ? (
              <div className="note">
                Winding available: <b>{fmt(av)}</b>
                {q > 0 ? <> &nbsp; After these motors: <b style={av - q < 0 ? red : {}}>{fmt(av - q)}</b></> : null}
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
                  <span className="n">{fmt(o.left)} left</span>
                </div>
              )) : <div className="note">No open order for this winding</div>}
            </div>
          ) : null}
          <div className="card qty">
            <div className="lab">Motors made</div>
            <input className="num" type="number" inputMode="numeric" min="1" placeholder="0" value={qty} onChange={e => setQty(e.target.value)} />
            <div className="qs">
              <button onClick={() => setQty(String((+qty || 0) + 50))}>+50</button>
              <button onClick={() => setQty(String((+qty || 0) + 100))}>+100</button>
              <button onClick={() => setQty(String((+qty || 0) + 500))}>+500</button>
            </div>
            <div className="note" style={{ marginTop: 12 }}>Winding + bush + capacitor + cover (+ kuppa) = motor.</div>
          </div>
          <div className="card">
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab">Date</div>
                <input className="sel" type="date" min={START} value={d} onChange={e => setD(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="lab">Kuppa (optional)</div>
                <input className="sel" type="number" inputMode="numeric" min="0" placeholder="0" value={kup} onChange={e => setKup(e.target.value)} />
              </div>
            </div>
            <div className="lab">Note (optional)</div>
            <input className="sel" maxLength={100} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="card">
            <div className="lab">Motors made entries</div>
            {ml.length ? (
              <table>
                <thead><tr><th>Date</th><th>Motors</th><th></th></tr></thead>
                <tbody>
                  {ml.map(r => (
                    <tr key={r.id}>
                      <td>{dm(r.d)} <span className="note" style={{ margin: 0 }}>{r.party} - {r.stype}</span>
                        {r.kuppa ? <span className="note" style={{ margin: 0 }}> (kuppa {fmt(r.kuppa)})</span> : null}
                        {r.kind === 'dispatch' ? <span className="note" style={{ margin: 0 }}> (old entry)</span> : null}
                        {cleanNote(r.note) ? <span className="note" style={{ margin: 0, display: 'block' }}>{cleanNote(r.note)}</span> : null}
                      </td>
                      <td>{fmt(r.qty)}</td>
                      <td>{r.kind === 'made' && r.d === today ? <button style={smallBtn} onClick={() => openEdit(r)}>Edit</button> : null}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>Total</td>
                    <td style={{ fontWeight: 700, borderTop: '1.5px solid var(--ink)' }}>{fmt(sum(ml.map(r => r.qty)))}</td>
                    <td style={{ borderTop: '1.5px solid var(--ink)' }}></td>
                  </tr>
                </tbody>
              </table>
            ) : <div className="note">Nothing yet.</div>}
          </div>
        </>
      ) : null}
      <div className="sticky" style={{ bottom: 70 }}><div>
        <div className="err">{serr || pr || po || ''}</div>
        <button className="btn" disabled={busy || !M || !!pr || !!po} onClick={save}>Save motors made</button>
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
            <div className="lab">Motors with kuppa</div>
            <input className="sel" type="number" inputMode="numeric" value={ek} onChange={e => setEk(e.target.value)} />
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
