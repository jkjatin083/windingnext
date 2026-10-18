'use client';
// Admin Entries: every entry of every app, with filters, edit (qty/date),
// soft delete, and admin add (wound / given to Pandey ji).
// Port of the live orderbook.html entries tab.
import { useState } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { fmt, dm, todayIST } from '../../components/motor';

const CH = [['all', 'All'], ['contractors', 'Contractors'], ['motors', 'Motors'], ['deleted', 'Deleted']];

export default function EAdmin() {
  const [EF, setEF] = useState({ app: 'all', who: '', type: '', from: '', to: '' });
  const q = Object.keys(EF).filter(k => EF[k] && !(k === 'app' && EF[k] === 'all')).map(k => k + '=' + encodeURIComponent(EF[k])).join('&');
  const path = '/api/e' + (q ? '?' + q : '');
  const { data: ER, err, reload } = useApi(path);
  const [sheet, setSheet] = useState(null); // {mode:'edit'|'delete'|'add', row?}
  const [eq, setEq] = useState(''); const [ed, setEd] = useState('');
  const [ae, setAe] = useState({ contractor: '', entry: '', issue_id: null, opening_name: null, qty: '', d: todayIST() });
  const [eer, setEer] = useState('');
  const [busy, setBusy] = useState(false);

  function openSheet(mode, row) {
    setEer(''); setBusy(false);
    if (row) { setEq(String(row.qty)); setEd(row.d); }
    if (mode === 'add') setAe({ contractor: '', entry: '', issue_id: null, opening_name: null, qty: '', d: todayIST() });
    setSheet({ mode, row });
  }
  async function save() {
    setBusy(true);
    try {
      const m = sheet.mode;
      if (m === 'edit') await postJson('/api/e', { action: 'edit', id: sheet.row.id, qty: eq.valueOf(), d: ed });
      else if (m === 'delete') await postJson('/api/e', { action: 'delete', id: sheet.row.id });
      else await postJson('/api/e', { action: 'add', contractor: ae.contractor, entry: ae.entry, issue_id: ae.issue_id, opening_name: ae.opening_name, qty: ae.qty, d: ae.d });
      setSheet(null);
      reload();
    } catch (e) { setEer(e.message); setBusy(false); }
  }

  const P = ER ? ER.pick : null;
  const issueList = P ? P.issues.filter(i => i.contractor === ae.contractor) : [];
  const openList = P ? P.opening.filter(i => i.contractor === ae.contractor) : [];

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Entries</h1>
      <div style={{ textAlign: 'right', marginBottom: 10 }}>
        <button className="btn s" onClick={() => openSheet('add')}>+ Add entry</button>
      </div>
      {CH.map(c => (
        <span key={c[0]} className={'ech' + (EF.app === c[0] ? ' on' : '')} onClick={() => setEF({ ...EF, app: c[0] })}>{c[1]}</span>
      ))}
      {ER ? (
        <div className="ef">
          <select value={EF.who} onChange={e => setEF({ ...EF, who: e.target.value })}>
            <option value="">Everyone</option>
            {ER.people.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={EF.type} onChange={e => setEF({ ...EF, type: e.target.value })}>
            <option value="">All types</option>
            {ER.types.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <input type="date" value={EF.from} onChange={e => setEF({ ...EF, from: e.target.value })} />
          <input type="date" value={EF.to} onChange={e => setEF({ ...EF, to: e.target.value })} />
        </div>
      ) : null}
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!ER && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {ER ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 8 }}>
            {ER.total} entries{ER.total > ER.rows.length ? ' (showing latest ' + ER.rows.length + ')' : ''}
          </div>
          {!ER.rows.length ? <div className="card">No entries</div> : null}
          {ER.rows.map(r => (
            <div className="ec" key={r.id}>
              <div className="a"><span>{r.text}</span><span>{fmt(r.qty)}</span></div>
              <small>{r.contractor}{r.stype ? ' - ' + r.stype : ''} - {dm(r.d)}{r.kuppa ? ' - kuppa ' + fmt(r.kuppa) : ''}</small>
              {r.deleted ? <small>Deleted</small> : (
                <div className="b">
                  <button onClick={() => openSheet('edit', r)}>Edit</button>
                  <button className="dl" onClick={() => openSheet('delete', r)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </>
      ) : null}

      {sheet && sheet.mode !== 'add' ? (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            {sheet.mode === 'edit' ? (
              <>
                <h3 style={{ margin: '0 0 4px' }}>Edit entry</h3>
                <div style={{ color: 'var(--mute)', fontSize: 13 }}>{sheet.row.text} - {sheet.row.contractor}{sheet.row.stype ? ' - ' + sheet.row.stype : ''}</div>
                <label className="l">Quantity</label>
                <input className="f" type="number" inputMode="numeric" value={eq} onChange={e => setEq(e.target.value)} />
                <label className="l">Date</label>
                <input className="f" type="date" value={ed} max={todayIST()} min="2026-10-01" onChange={e => setEd(e.target.value)} />
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 4px' }}>Delete this entry?</h3>
                <div style={{ fontSize: 14, marginTop: 6 }}>{sheet.row.text} - {fmt(sheet.row.qty)}<br />
                  <span style={{ color: 'var(--mute)', fontSize: 13 }}>{sheet.row.contractor}{sheet.row.stype ? ' - ' + sheet.row.stype : ''} - {dm(sheet.row.d)}</span></div>
                <div style={{ color: 'var(--mute)', fontSize: 12.5, marginTop: 8 }}>It is hidden from all apps and kept in the Deleted list and audit log.</div>
              </>
            )}
            <div className="er">{eer}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className={'bt ' + (sheet.mode === 'edit' ? 'p' : 'r')} style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? 'Saving...' : (sheet.mode === 'edit' ? 'Save' : 'Delete')}</button>
              <button className="bt" onClick={() => setSheet(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {sheet && sheet.mode === 'add' ? (
        <div className="ov" onClick={e => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet" style={{ maxHeight: '92vh', overflow: 'auto' }}>
            <h3 style={{ margin: '0 0 4px' }}>Add entry</h3>
            <div style={{ color: 'var(--mute)', fontSize: 12.5 }}>Admin only. Made or Given to Pandey ji.</div>
            <label className="l">Contractor</label>
            <select className="sel" style={{ marginBottom: 0 }} value={ae.contractor} onChange={e => setAe({ ...ae, contractor: e.target.value, issue_id: null, opening_name: null })}>
              <option value="">Select contractor</option>
              {P.contractors.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            <label className="l">Entry type</label>
            <select className="sel" style={{ marginBottom: 0 }} value={ae.entry} onChange={e => setAe({ ...ae, entry: e.target.value })}>
              <option value="">Select type</option>
              <option value="made">Made</option>
              <option value="given">Given to Pandey ji</option>
            </select>
            <label className="l">Stators</label>
            <div>
              {!ae.contractor ? <div style={{ color: 'var(--mute)', fontSize: 13 }}>Select contractor first</div> : null}
              {ae.contractor && !issueList.length && !openList.length ? <div style={{ color: 'var(--mute)', fontSize: 13 }}>No order issued</div> : null}
              {issueList.map(i => (
                <div key={i.id} className={'tile' + (ae.issue_id === i.id ? ' on' : '')} onClick={() => setAe({ ...ae, issue_id: i.id, opening_name: null })}>
                  <span className="r"></span>
                  <div className="t2" style={{ flex: 1 }}>
                    <b style={{ fontSize: 15 }}>{i.winding_type}</b>
                    <small style={{ display: 'block', fontSize: 10, color: '#98a2b3', marginTop: 2 }}>Order #{i.order_no} | stamping available {fmt(i.stamp)}</small>
                  </div>
                  <span style={{ color: '#0e9f83', fontWeight: 700 }}>{fmt(i.avail)}</span>
                </div>
              ))}
              {openList.length ? <label className="l">Opening stock (no order)</label> : null}
              {openList.map(i => (
                <div key={i.name} className={'tile' + (ae.opening_name === i.name ? ' on' : '')} onClick={() => setAe({ ...ae, opening_name: i.name, issue_id: null })}>
                  <span className="r"></span>
                  <div className="t2" style={{ flex: 1 }}>
                    <b style={{ fontSize: 15 }}>{i.name}</b>
                    <small style={{ display: 'block', fontSize: 10, color: '#98a2b3', marginTop: 2 }}>Opening stock | stamping available 0</small>
                  </div>
                  <span style={{ color: '#0e9f83', fontWeight: 700 }}>{fmt(i.avail)}</span>
                </div>
              ))}
            </div>
            <label className="l">Quantity</label>
            <input className="f" type="number" inputMode="numeric" placeholder="0" value={ae.qty} onChange={e => setAe({ ...ae, qty: e.target.value })} />
            <label className="l">Date</label>
            <input className="f" type="date" value={ae.d} min="2026-10-01" max={todayIST()} onChange={e => setAe({ ...ae, d: e.target.value })} />
            <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 10 }}>Blocked if a balance would go negative or it repeats an entry. Saved in the audit log.</div>
            <div className="er">{eer}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="bt p" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Add entry'}</button>
              <button className="bt" onClick={() => setSheet(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}
      <Nav />
    </div>
  );
}
