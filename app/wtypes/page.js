'use client';
// Admin: Winding types. Add a winding type that has no sale order and choose
// which contractors see it as a tile on their Made screen. Edit / Hide / Show.
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { dm, todayIST } from '../../components/motor';

export default function WTypes() {
  const { data: D, err, reload } = useApi('/api/wtypes');
  const [name, setName] = useState('');
  const [who, setWho] = useState(null); // null = everyone ticked
  const [edit, setEdit] = useState(null); // { id, name, who: [] } while editing
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
  function startEdit(t) {
    setErr2('');
    setEdit({ id: t.id, name: t.name, who: t.who === '*' ? [...people] : String(t.who).split(',') });
  }
  async function saveEdit() {
    setErr2(''); setBusy(true);
    try {
      await postJson('/api/wtypes', { action: 'edit', id: edit.id, name: edit.name, who: edit.who });
      setEdit(null);
      setToast('Saved'); setTimeout(() => setToast(''), 2500);
      await reload();
    } catch (e) { setErr2(e.message); }
    setBusy(false);
  }
  async function toggle(t) {
    try { await postJson('/api/wtypes', { action: t.hidden ? 'show' : 'hide', id: t.id }); await reload(); }
    catch (e) { setErr2(e.message); }
  }
  const label = t => t.who === '*' ? 'All' : t.who.split(',').join(', ');
  const flipEdit = p => setEdit({ ...edit, who: edit.who.includes(p) ? edit.who.filter(x => x !== p) : [...edit.who, p] });

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
          edit && edit.id === t.id ? (
            <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid #eef0f2' }}>
              <div className="ord">
                <div><b>{t.name}</b><small>Editing</small></div>
                <a href="#" className="lo" style={{ display: 'inline', marginTop: 0 }} onClick={e => { e.preventDefault(); setEdit(null); }}>Cancel</a>
              </div>
              <input className="num" style={{ fontSize: 16, textAlign: 'left', marginTop: 8 }} type="text" placeholder="Type name" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
              <div className="lab" style={{ marginTop: 12 }}>Show to contractors</div>
              <div>
                {people.map(p => (
                  <span key={p} className={'ech' + (edit.who.includes(p) ? ' on' : '')} onClick={() => flipEdit(p)}>{p}</span>
                ))}
              </div>
              <button className="btn s" style={{ marginTop: 6 }} disabled={busy} onClick={saveEdit}>{busy ? 'Saving...' : 'Save changes'}</button>
            </div>
          ) : (
            <div key={t.id} className="ord" style={{ padding: '10px 0', borderBottom: '1px solid #eef0f2', opacity: t.hidden ? 0.5 : 1 }}>
              <div><b>{t.name}</b><small>{label(t)}{t.hidden ? ' | hidden' : ''}</small></div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', flex: 'none' }}>
                <a href="#" className="lo" style={{ display: 'inline', marginTop: 0 }} onClick={e => { e.preventDefault(); startEdit(t); }}>Edit</a>
                <a href="#" className="lo" style={{ display: 'inline', marginTop: 0 }} onClick={e => { e.preventDefault(); toggle(t); }}>{t.hidden ? 'Show' : 'Hide'}</a>
              </div>
            </div>
          )
        )) : null}
        <div className="note" style={{ marginTop: 8 }}>Types from Sandeep's orders still come automatically. This list is only for types without an order.</div>
      </div>
      <Nav />
    </div>
  );
}
