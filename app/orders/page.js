'use client';
// Sale orders - Orders list + edit (Sandeep). Port of the live sale.html
// orders tab (All / Open / Waiting / Closed) and the edit form.
import { useEffect, useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import Sheet from '../../components/sheet';
import { fmt, dm, todayIST } from '../../components/motor';

function PF({ label, val, ph, onClick }) {
  return (
    <div className="inp" onClick={onClick}>
      <div><small>{label}</small><span className={val ? '' : 'ph'}>{val || ph || 'Choose'}</span></div>
      <span className="c">&#9662;</span>
    </div>
  );
}

export default function Orders() {
  const { data: D, err, reload } = useApi('/api/sale');
  const [me, setMe] = useState('');
  const [ltab, setLtab] = useState('all');
  const [EF, setEF] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [serr, setSerr] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Sandeep') location.href = '/home';
  }, []);

  const orders = D ? (D.orders || []) : [];
  const os = orders.filter(o => ltab === 'all' || (ltab === 'new' ? !o.issued && !o.cancelled : (ltab === 'closed' ? o.closed && !o.cancelled : (o.issued > 0 && !o.closed && !o.cancelled))));

  // group consecutive orders: same customer, same date, none cancelled
  const grp = [];
  os.forEach(o => {
    const g = grp[grp.length - 1];
    if (g && g[0].customer === o.customer && g[0].created === o.created && !o.cancelled && !g[0].cancelled) g.push(o);
    else grp.push([o]);
  });

  function openEdit(o) {
    setEF({
      id: o.id, no: o.order_no, issued: o.issued || 0, customer: o.customer || '',
      stator_type: o.stator_type || '', winding_type: o.winding_type || '',
      motor_type: o.motor_type || '', rotor_item: o.rotor_item || '',
      qty: o.qty, due: o.due || '', order_date: o.created || todayIST()
    });
    setSerr('');
  }

  function sheetFor(field) {
    const DD = D || { stamps: [], winding: [], motor: [], rotors: [] };
    const conf = {
      stator_type: { title: 'Stamping type', list: DD.stamps || [], addKind: null },
      winding_type: { title: 'Winding type', list: DD.winding || [], addKind: 'winding' },
      motor_type: { title: 'Motor type', list: DD.motor || [], addKind: 'motor' },
      rotor_item: { title: 'Rotor type', list: ['(none)'].concat(DD.rotors || []), addKind: null }
    }[field];
    return { field, ...conf };
  }

  async function pick(v, added) {
    const val = sheet.field === 'rotor_item' && v === '(none)' ? '' : v;
    setEF({ ...EF, [sheet.field]: val });
    setSheet(null);
    if (added) await reload();
  }

  async function saveEdit() {
    setSerr('');
    const qq = Number(EF.qty);
    if (!EF.customer.trim()) { setSerr('Enter the customer'); return; }
    if (!EF.stator_type || !EF.winding_type || !EF.motor_type) { setSerr('Choose stamping, winding and motor type'); return; }
    if (!(qq > 0) || qq !== Math.floor(qq)) { setSerr('Enter a whole quantity above 0'); return; }
    if (qq < EF.issued) { setSerr('Already issued ' + fmt(EF.issued) + '. Quantity cannot be below that'); return; }
    setBusy(true);
    try {
      const r = await postJson('/api/sale', {
        action: 'edit', id: EF.id, customer: EF.customer, stator_type: EF.stator_type,
        winding_type: EF.winding_type, motor_type: EF.motor_type, rotor_item: EF.rotor_item,
        qty: qq, due: EF.due, order_date: EF.order_date
      });
      if (!r) return;
      setToast('Saved order #' + EF.no); setTimeout(() => setToast(''), 2600);
      setEF(null);
      await reload();
    } catch (e) { setSerr(e.message); }
    setBusy(false);
  }

  const line = o => (
    <small>{o.created ? dm(o.created) + ' | ' : ''}{o.stator_type} | {o.winding_type} | {o.motor_type}{o.rotor_item ? ' | rotor ' + o.rotor_item : ''}{o.due ? ' | due ' + dm(o.due) : ''}</small>
  );

  return (
    <div className="w">
      {toast ? <div id="toast">{toast}</div> : null}
      <Top date={dm(todayIST())} />
      <h1>{EF ? 'Edit order #' + EF.no : 'Orders'}</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D && !EF ? (
        <>
          <div className="tabs">
            {[['all', 'All'], ['open', 'Open'], ['new', 'Waiting'], ['closed', 'Closed']].map(t => (
              <button key={t[0]} className={ltab === t[0] ? 'on' : ''} onClick={() => setLtab(t[0])}>{t[1]}</button>
            ))}
          </div>
          {!os.length ? <div className="card"><div className="note" style={{ margin: 0 }}>No orders here.</div></div> : null}
          {grp.map((g, gi) => g.length === 1 ? (
            <div className="card" key={g[0].id}>
              <div className="ord">
                <div><b>#{g[0].order_no} {g[0].customer}{g[0].cancelled ? ' (cancelled)' : ''}</b>{line(g[0])}</div>
                <div style={{ textAlign: 'right' }}>
                  <b>{fmt(g[0].qty)}</b>
                  <small>{g[0].issued ? fmt(g[0].issued) + ' issued' : 'waiting'}</small>
                </div>
              </div>
              {!g[0].cancelled ? <div style={{ textAlign: 'right', marginTop: 6 }}><button className="lnk g" onClick={() => openEdit(g[0])}>Edit</button></div> : null}
            </div>
          ) : (
            <div className="card" key={gi}>
              <div className="ord">
                <div><b>{g[0].customer}</b><small>{dm(g[0].created)} | {g.length} orders | {fmt(g.reduce((a, o) => a + o.qty, 0))} total</small></div>
              </div>
              {g.map((o, i) => (
                <div className={'row' + (i ? '' : ' f')} style={{ marginTop: i ? 0 : 8 }} key={o.id}>
                  <div><b>#{o.order_no}</b><small>{o.stator_type} | {o.winding_type} | {o.motor_type}{o.rotor_item ? ' | rotor ' + o.rotor_item : ''}{o.due ? ' | due ' + dm(o.due) : ''}</small></div>
                  <div style={{ textAlign: 'right' }}>
                    <b>{fmt(o.qty)}</b>
                    <small>{o.issued ? fmt(o.issued) + ' issued' : 'waiting'}</small>
                    {!o.cancelled ? <button className="lnk g" onClick={() => openEdit(o)}>Edit</button> : null}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      ) : null}
      {D && EF ? (
        <>
          <div style={{ marginBottom: 6 }}><button className="lnk g" onClick={() => setEF(null)}>&lsaquo; Back</button></div>
          <div className="sub">All fields can be changed</div>
          <div className="fl">
            <small>Customer</small>
            <input className="f" value={EF.customer} placeholder="Customer name" onChange={e => setEF({ ...EF, customer: e.target.value })} />
          </div>
          <div className="card">
            <PF label="Stamping type" val={EF.stator_type} onClick={() => setSheet(sheetFor('stator_type'))} />
            <PF label="Winding type" val={EF.winding_type} onClick={() => setSheet(sheetFor('winding_type'))} />
            <PF label="Motor type" val={EF.motor_type} onClick={() => setSheet(sheetFor('motor_type'))} />
            <PF label="Rotor type (optional)" val={EF.rotor_item} ph="None" onClick={() => setSheet(sheetFor('rotor_item'))} />
            <div className="qty">
              <div className="lab">Quantity</div>
              <input className="num" type="number" inputMode="numeric" min="1" placeholder="0"
                value={EF.qty} onChange={e => setEF({ ...EF, qty: e.target.value })} />
              <div className="qs">
                <button onClick={() => setEF({ ...EF, qty: String((+EF.qty || 0) + 100) })}>+100</button>
                <button onClick={() => setEF({ ...EF, qty: String((+EF.qty || 0) + 500) })}>+500</button>
                <button onClick={() => setEF({ ...EF, qty: String((+EF.qty || 0) + 1000) })}>+1,000</button>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="fl" style={{ flex: 1 }}>
              <small>Due date (optional)</small>
              <input className="f" type="date" value={EF.due} onChange={e => setEF({ ...EF, due: e.target.value })} />
            </div>
            <div className="fl" style={{ flex: 1 }}>
              <small>Order date</small>
              <input className="f" type="date" max={todayIST()} value={EF.order_date} onChange={e => setEF({ ...EF, order_date: e.target.value })} />
            </div>
          </div>
          {EF.issued > 0 ? <div className="good">Already issued to contractors: {fmt(EF.issued)} of {fmt(EF.qty)}. Quantity cannot go below {fmt(EF.issued)}.</div> : null}
          <div className="sticky" style={{ bottom: 70 }}><div>
            <div className="err">{serr}</div>
            <button className="btn" disabled={busy} onClick={saveEdit}>Save changes</button>
          </div></div>
        </>
      ) : null}
      {sheet ? <Sheet title={sheet.title} list={sheet.list} current={EF[sheet.field] || (sheet.field === 'rotor_item' ? '(none)' : '')} addKind={sheet.addKind} onPick={pick} onClose={() => setSheet(null)} /> : null}
      <Nav />
    </div>
  );
}
