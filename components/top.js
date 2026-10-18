'use client';
// Shared top bar: avatar, name, date chip, log out.
import { useEffect, useState } from 'react';
import { clearApiCache } from './store';

export default function Top({ date }) {
  const [me, setMe] = useState('');
  useEffect(() => { setMe(localStorage.getItem('wa_name') || ''); }, []);
  function logout() {
    clearApiCache();
    localStorage.removeItem('wa_token');
    localStorage.removeItem('wa_name');
    location.href = '/';
  }
  return (
    <div className="top">
      <div className="who"><div className="av">{(me || '?')[0]}</div><div><small>Hello</small><b>{me}</b></div></div>
      <div style={{ textAlign: 'right' }}>
        <div className="chipd">{date || ''}</div>
        <a className="lo" href="#" onClick={e => { e.preventDefault(); logout(); }}>Log out</a>
      </div>
    </div>
  );
}
