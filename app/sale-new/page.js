'use client';
// Sale orders - New order (Sandeep). Port of the live sale.html new-order form:
// customer with suggestions, one or more motor lines, type pickers in a sheet.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import Sheet from '../../components/sheet';
import { fmt, dm, todayIST } from '../../components/motor';

const newLine = () => ({ stator_type: '', winding_type: '', motor_type: '', rotor_item: '', qty: '' });
const blank = () => ({ customer: '', due: '', order_date: todayIST(), lines: [newLine()], cur: 0 });
const lineText = l => [l.stator_type, l.winding_type, l.motor_type, l.rotor_item ? 'rotor ' + l.rotor_item : ''].filter(Boolean).join(' | ');
const lineOk = l => l.stator_type && l.winding_type && l.motor_type && Number(l.qty) > 0 && Number(l.qty) === Math.floor(Number(l.qty));

function PF({ label, val, ph, onClick }) {
  return (
    <div className="inp" onClick={onClick}>
      <div><small>{label}</small><span className={val ? '' : 'ph'}>{val || ph || 'Choose'}</span></div>
      <span className="c">&#9662;</span>
    </div>
  );
}

export default function NewOrder() {
  const { data: D, err, reload } = useApi('/api/sale');
  const [me, setMe] = useState('');
  const [F, setF] = useState(blank);
  const [sheet, setSheet] = useState(null);
  const [sug, setSug] = useState(false);
  const [serr, setSerr] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const n = localStorage.getItem('wa_name') || '';
    setMe(n);
    if (n && n !== 'Sandeep') location.href = '/home';
  }, []);

  const L = F.lines, l = L[F.cur], multi = L.length > 1;

  function custList() {
    const m = {};
    (D && D.customers || []).forEach(c => { const k = c.trim().toLowerCase(); if (k && !m[k]) m[k] = c.trim(); });
    (D && D.orders || []).forEach(o => { const c = String(o.customer || '').trim(), k = c.toLowerCase(); if (k && !m[k]) m[k] = c; });
    return Object.values(m);
  }
  const q = F.customer.trim().toLowerCase();
  const all = custList();
  const hits = q
    ? all.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).sort((a, b) => (a.toLowerCase().startsWith(q) ? 0 : 1) - (b.toLowerCase().startsWith(q) ? 0 : 1) || a.localeCompare(b)).slice(0, 30)
    : all.slice().sort((a, b) => a.localeCompare(b));

  function setLine(i, patch) {
    const lines = F.lines.slice();
    lines[i] = { ...lines[i], ...patch };
    setF({ ...F, lines });
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
    setLine(F.cur, { [sheet.field]: val });
    setSheet(null);
    if (added) await reload();
  }

  function addLine() {
    setSerr('');
    if (!lineOk(l)) { setSerr('Fill this motor first (stamping, winding, motor, quantity)'); return; }
    if (L.length >= 20) return;
    setF({ ...F, lines: [...L, newLine()], cur: L.length });
  }

  function removeLine(i) {
    const lines = L.filter((_, n) => n !== i);
    setF({ ...F, lines, cur: Math.min(F.cur, lines.length - 1) });
  }

  async function save() {
    setSerr('');
    if (!F.customer.trim()) { setSerr('Enter the customer'); return; }
    for (let i = 0; i < L.length; i++) {
      if (!lineOk(L[i])) {
        setF({ ...F, cur: i });
        setSerr((multi ? 'Motor ' + (i + 1) + ': ' : '') + 'Choose stamping, winding, motor and a whole quantity above 0');
        return;
      }
    }
    setBusy(true);
    try {
      const j = await postJson('/api/sale', {
        action: 'add', customer: F.customer, due: F.due, order_date: F.order_date,
        lines: L.map(x => ({ stator_type: x.stator_type, winding_type: x.winding_type, motor_type: x.motor_type, rotor_item: x.rotor_item, qty: Number(x.qty) }))
      });
      if (!j) return;
      await reload();
      router.push('/orders');
    } catch (e) { setSerr(e.message); }
    setBusy(false);
  }

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>New order</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!D && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {D ? (
        <>
          <div className="fl" style={{ position: 'relative' }}>
            <small>Customer</small>
            <input className="f" value={F.customer} placeholder="Customer name"
              onChange={e => { setF({ ...F, customer: e.target.value }); setSug(true); }}
              onFocus={() => setSug(true)}
              onBlur={() => setTimeout(() => {
                setSug(false);
                const k = (F.customer || '').trim().toLowerCase();
                const ex = all.find(c => c.toLowerCase() === k);
                if (ex) setF(f2 => ({ ...f2, customer: ex }));
              }, 150)} />
            {sug && hits.length ? (
              <div className="sg">
                {hits.map(c => (
                  <div key={c} onMouseDown={e => { e.preventDefault(); setF({ ...F, customer: c }); setSug(false); }}>{c}<small>existing</small></div>
                ))}
              </div>
            ) : null}
          </div>
          {L.map((x, i) => i !== F.cur ? (
            <div className="card" key={i}>
              <div className="ord">
                <div><b>Motor {i + 1}</b><small>{lineText(x) || 'Not filled yet'}</small></div>
                <div style={{ textAlign: 'right' }}>
                  <b>{x.qty ? fmt(x.qty) : '-'}</b><br />
                  <button className="lnk g" onClick={() => setF({ ...F, cur: i })}>Edit</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" key={i} style={multi ? { boxShadow: '0 0 0 1.5px var(--a)' } : {}}>
              {multi ? (
                <div className="ord">
                  <div className="lab" style={{ color: 'var(--a)' }}>Motor {i + 1}</div>
                  <button className="lnk" onClick={() => removeLine(i)}>Remove</button>
                </div>
              ) : null}
              <PF label="Stamping type" val={x.stator_type} onClick={() => setSheet(sheetFor('stator_type'))} />
              <PF label="Winding type" val={x.winding_type} onClick={() => setSheet(sheetFor('winding_type'))} />
              <PF label="Motor type" val={x.motor_type} onClick={() => setSheet(sheetFor('motor_type'))} />
              <PF label="Rotor type (optional)" val={x.rotor_item} ph="None" onClick={() => setSheet(sheetFor('rotor_item'))} />
              <div className="qty">
                <div className="lab">Quantity</div>
                <input className="num" type="number" inputMode="numeric" min="1" placeholder="0"
                  value={x.qty} onChange={e => setLine(i, { qty: e.target.value })} />
                <div className="qs">
                  <button onClick={() => setLine(i, { qty: String((+x.qty || 0) + 100) })}>+100</button>
                  <button onClick={() => setLine(i, { qty: String((+x.qty || 0) + 500) })}>+500</button>
                  <button onClick={() => setLine(i, { qty: String((+x.qty || 0) + 1000) })}>+1,000</button>
                </div>
              </div>
            </div>
          ))}
          <div className="addm" onClick={addLine}>+ Add another motor</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="fl" style={{ flex: 1 }}>
              <small>Due date (optional)</small>
              <input className="f" type="date" value={F.due} onChange={e => setF({ ...F, due: e.target.value })} />
            </div>
            <div className="fl" style={{ flex: 1 }}>
              <small>Order date</small>
              <input className="f" type="date" max={todayIST()} value={F.order_date} onChange={e => setF({ ...F, order_date: e.target.value })} />
            </div>
          </div>
        </>
      ) : null}
      <div className="sticky" style={{ bottom: 70 }}><div>
        <div className="err">{serr}</div>
        <button className="btn" disabled={busy || !D} onClick={save}>{multi ? 'Save ' + L.length + ' orders' : 'Save order'}</button>
      </div></div>
      {sheet ? <Sheet title={sheet.title} list={sheet.list} current={l[sheet.field] || (sheet.field === 'rotor_item' ? '(none)' : '')} addKind={sheet.addKind} onPick={pick} onClose={() => setSheet(null)} /> : null}
      <Nav />
    </div>
  );
}
