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
// reload() returns the fresh data (or null if the refresh failed).
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
    .then(j => { if (j) { cache[path] = j; setData(j); } return j; })
    .catch(e => { setErr(e.message); return null; });
  return { data, err, reload };
}

// POST helper with the same auth handling. After a successful save, call
// reload() from useApi so every screen's cache is fresh.
// Error tagging so screens can be honest about what happened:
//   e.rejected = true  -> the server answered 4xx and REFUSED before
//                         writing (validation, over limit, duplicate).
//                         Nothing was added, retry is safe.
//   e.unknown  = true  -> connection dropped, unreadable reply, or a 5xx
//                         (a 5xx can happen AFTER the entry was saved).
//                         The save MAY have happened. Check before retrying.
export async function postJson(path, body) {
  let r;
  try {
    r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
  } catch (e) { e.unknown = true; throw e; }
  if (r.status === 401) {
    clearApiCache();
    localStorage.removeItem('wa_token');
    location.href = '/';
    return null;
  }
  let j = null;
  try { j = await r.json(); } catch (e) { const x = new Error('Bad server reply'); x.unknown = true; x.serverError = true; throw x; }
  if (!r.ok) {
    const x = new Error((j && j.error) || 'Server error ' + r.status);
    // 4xx = the server checked and REFUSED before writing (validation, over
    // limit, same-day duplicate): nothing was added, retry is safe.
    // 5xx = something failed inside the server; the entry MAY already be in
    // (e.g. entry saved but the alert kick failed). Treat as unknown.
    if (r.status >= 400 && r.status < 500) x.rejected = true; else { x.unknown = true; x.serverError = true; }
    throw x;
  }
  return j;
}
