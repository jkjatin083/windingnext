'use client';
// Admin: Winding types. Add a winding type that has no sale order and choose
// which contractors see it as a tile on their Made screen. Hide / Show only.
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { dm, todayIST } from '../../components/motor';

export default function WTypes() {
  const { data: D, err, reload } = useApi('/api/wtypes');
  const [name, setName] = useState('');
  const [who, setWho] = useState(null); // null = everyone ticked
  const [err2, setErr2] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const people = D ? D.people : [];
  const ticked = who || people;
  const flip = p => setWho(ticked.includes(p) ? ticked.filter(x => x !== p) : [...ticked, p]);

  async function add() {
    setErr2(''); setBusy(true);
    try {
      await postJson('/api/wtypes', { action: 'add', name, who: ticked });
      setName(''); setWho(null);
      setToast('Added'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setErr2(e.message); }
    setBusy(false);
  }
  async function toggle(t) {
    try { await postJson('/api/wtypes', { action: t.hidden ? 'show' : 'hide', id: t.id }); await reload(); }
    catch (e) { setErr2(e.message); }
  }
  const label = t => t.who === '*' ? 'All' : t.who.split(',').join(', ');

  return (
    <div className="w">
      {toast ? <div id="toast">{toast}</div> : null}
      <Top date={dm(todayIST())} />
      <h1>Winding types</h1>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      <div className="card"><div className="lab">Add winding type</div>
        <div className="note" style={{ marginBottom: 8 }}>Only admin can add. It shows in Made entry for the contractors you pick.</div>
        <input className="num" style={{ fontSize: 16, textAlign: 'left' }} type="text" placeholder="e.g. 6 Soot (36) FA" value={name} onChange={e => setName(e.target.value)} />
        <div className="lab" style={{ marginTop: 12 }}>Show to contractors</div>
        <div>
          {people.map(p => (
            <span key={p} className={'ech' + (ticked.includes(p) ? ' on' : '')} onClick={() => flip(p)}>{p}</span>
          ))}
        </div>
        <div className="err">{err2}</div>
        <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={add}>{busy ? 'Saving...' : 'Add type'}</button>
      </div>
      <div className="card"><div className="lab">Types added by admin</div>
        {!D ? <div className="note">Loading...</div> : null}
        {D && !D.types.length ? <div className="note">None yet</div> : null}
        {D ? D.types.map(t => (
          <div key={t.id} className="ord" style={{ padding: '10px 0', borderBottom: '1px solid #eef0f2', opacity: t.hidden ? 0.5 : 1 }}>
            <div><b>{t.name}</b><small>{label(t)}{t.hidden ? ' | hidden' : ''}</small></div>
            <a href="#" className="lo" onClick={e => { e.preventDefault(); toggle(t); }}>{t.hidden ? 'Show' : 'Hide'}</a>
          </div>
        )) : null}
        <div className="note" style={{ marginTop: 8 }}>Types from Sandeep's orders still come automatically. This list is only for types without an order.</div>
      </div>
      <Nav />
    </div>
  );
}
