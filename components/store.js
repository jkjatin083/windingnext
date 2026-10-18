'use client';
// Tiny shared data store for the app. Each screen's data is kept in a
// module-level cache, so switching tabs with the bottom nav is INSTANT
// (shows the last data) while fresh data loads quietly in the background.
// No more full-page reloads between screens.
import { useEffect, useState } from 'react';

const cache = {};

export function clearApiCache() {
  Object.keys(cache).forEach(k => delete cache[k]);
}

function authHeaders() {
  const t = localStorage.getItem('wa_token');
  return t ? { Authorization: 'Bearer ' + t } : {};
}

async function fetchJson(path) {
  const r = await fetch(path, { headers: authHeaders(), cache: 'no-store' });
  if (r.status === 401) {
    clearApiCache();
    localStorage.removeItem('wa_token');
    location.href = '/';
    return null;
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'error');
  return j;
}

// useApi('/api/home') -> { data, err, reload }
// data shows cached value instantly on first render when available.
export function useApi(path) {
  const [data, setData] = useState(cache[path] || null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    if (!localStorage.getItem('wa_token')) { location.href = '/'; return; }
    if (cache[path]) setData(cache[path]);
    fetchJson(path)
      .then(j => { if (j && live) { cache[path] = j; setData(j); } })
      .catch(e => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [path]);
  const reload = () => fetchJson(path)
    .then(j => { if (j) { cache[path] = j; setData(j); } })
    .catch(e => setErr(e.message));
  return { data, err, reload };
}

// POST helper with the same auth handling. After a successful save, call
// reload() from useApi so every screen's cache is fresh.
export async function postJson(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body)
  });
  if (r.status === 401) {
    clearApiCache();
    localStorage.removeItem('wa_token');
    location.href = '/';
    return null;
  }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'error');
  return j;
}
