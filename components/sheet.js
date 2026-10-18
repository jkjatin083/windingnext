'use client';
// Bottom-sheet picker for the sale order form (stamping / winding / motor /
// rotor type). Winding and motor allow adding a brand-new value, same as live.
import { useState } from 'react';
import { postJson } from './store';

export default function Sheet({ title, list, current, onPick, addKind, onClose }) {
  const [nv, setNv] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function add() {
    const v = nv.trim();
    if (!v) return;
    setBusy(true); setErr('');
    try {
      const r = await postJson('/api/sale', { action: 'option', kind: addKind, val: v });
      if (!r) return;
      onPick(v, true);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="ov" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="lab">{title}</div>
        <div style={{ maxHeight: '46vh', overflow: 'auto' }}>
          {list.map(x => (
            <div key={x} className={'opt' + (x === current ? ' on' : '')} onClick={() => onPick(x, false)}><span>{x}</span></div>
          ))}
        </div>
        {addKind ? (
          <>
            <label className="l">Add new</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input className="f" placeholder="type new value" style={{ margin: 0 }} value={nv} onChange={e => setNv(e.target.value)} />
              <button className="btn s" disabled={busy} onClick={add}>Add</button>
            </div>
            <div className="err">{err}</div>
          </>
        ) : null}
        <div style={{ marginTop: 14 }}><button className="btn s o" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
