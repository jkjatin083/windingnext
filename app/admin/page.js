'use client';
// Admin home: set anyone's PIN and open the app as that person.
// Port of the live admin.html.
import { useState } from 'react';
import Link from 'next/link';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { dm, todayIST } from '../../components/motor';

const APP1 = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil'];
const APP2 = ['Pandey ji', 'Sunil'];
const SALE = ['Sandeep'];

export default function Admin() {
  const { data, err, reload } = useApi('/api/admin');
  const [pins, setPins] = useState({});
  const [msg, setMsg] = useState('');

  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  async function setPin(n) {
    try {
      await postJson('/api/admin', { action: 'setpin', name: n, pin: pins[n] || '' });
      flash('PIN saved for ' + n);
      setPins(p => ({ ...p, [n]: '' }));
      reload();
    } catch (e) { flash(e.message); }
  }
  async function openAs(n, href) {
    try {
      const r = await postJson('/api/admin', { action: 'open', name: n });
      localStorage.setItem('wa_token', r.token);
      localStorage.setItem('wa_name', r.name);
      location.href = href;
    } catch (e) { flash(e.message); }
  }

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>Admin</h1>
      {msg ? <div className="good">{msg}</div> : null}
      <Link className="btn" href="/ob" style={{ marginBottom: 14 }}>Order Book (issue, stamping demand, rotor)</Link>
      <Link className="btn o" href="/wa" style={{ marginBottom: 14 }}>WhatsApp alerts</Link>
      <div className="note">Set a 4 to 6 digit PIN for each person. They log in with name + PIN and see only their own data. "Open" lets you view or enter as that person.</div>
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!data && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {data ? data.users.map(u => (
        <div className="card" key={u.name}>
          <div className="ord">
            <b>{u.name}</b>
            <span className={'tag ' + (u.hasPin ? 'g' : 'a')}>{u.hasPin ? 'PIN set' : 'No PIN yet'}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input className="f" style={{ marginBottom: 0, flex: 1 }} type="password" inputMode="numeric" maxLength={6} placeholder="New PIN"
              value={pins[u.name] || ''} onChange={e => setPins(p => ({ ...p, [u.name]: e.target.value }))} />
            <button className="btn s" onClick={() => setPin(u.name)}>Set PIN</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            {APP1.includes(u.name) ? <button className="btn o s" onClick={() => openAs(u.name, '/home')}>Open App 1</button> : null}
            {APP2.includes(u.name) ? <button className="btn o s" onClick={() => openAs(u.name, '/motor')}>Open App 2</button> : null}
            {SALE.includes(u.name) ? <button className="btn o s" onClick={() => openAs(u.name, '/sale')}>Open Sale Orders</button> : null}
          </div>
        </div>
      )) : null}
      <Nav />
    </div>
  );
}
