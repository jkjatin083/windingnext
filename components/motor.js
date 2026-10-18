'use client';
// Shared motor-app math for the Make / Dispatch / Report screens.
// Same calculations as the live app2.html.

export const START = '2026-10-01';

export const fmt = n => Number(n || 0).toLocaleString('en-IN');

export const dm = d => {
  if (!d) return '';
  const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return +d.slice(8, 10) + ' ' + m[+d.slice(5, 7) - 1];
};

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export const sum = a => a.reduce((s, x) => s + x, 0);

// Entries saved from this app carry this note marker; hide it on screen.
export const cleanNote = n => String(n || '').replace(/ \| via next app$/, '').replace(/^via next app$/, '');

// Motors made = 'made' entries + old 'dispatch' entries that had a winding
// (those count as made AND dispatched, same as the live app)
export const myMade = (rows, me) => rows.filter(r => r.contractor === me && (r.kind === 'made' || (r.kind === 'dispatch' && r.party && r.stype)));
export const myDisp = (rows, me) => rows.filter(r => (r.kind === 'dispatch' || r.kind === 'mdispatch') && r.contractor === me);
export const myMid = (mid, me, cat) => mid.filter(r => r.contractor === me && r.category === cat);

// Winding received from each contractor: received - motors made = available.
// recvR/dispR are the same numbers limited to a date range (for the report).
export function windStock(rows, me, from, to) {
  const m = {};
  const g = (c, t) => m[c + '|' + t] || (m[c + '|' + t] = { c, t, recv: 0, disp: 0, sent: 0, recvR: 0, dispR: 0 });
  rows.filter(r => r.kind === 'sent' && r.party === me).forEach(r => { const x = g(r.contractor, r.stype); x.recv += r.qty; if (from && r.d >= from && r.d <= to) x.recvR += r.qty; });
  myMade(rows, me).forEach(r => { const x = g(r.party, r.stype); x.disp += r.qty; if (from && r.d >= from && r.d <= to) x.dispR += r.qty; });
  myDisp(rows, me).filter(r => r.party && r.stype).forEach(r => { g(r.party, r.stype).sent += r.qty; });
  return Object.values(m).sort((a, b) => (a.c + a.t).localeCompare(b.c + b.t));
}

// Parts and motor totals: 1 motor = 2 bush + 1 capacitor + 2 cover (+ kuppa entered)
export function totals(rows, mid, me) {
  const motors = sum(myMade(rows, me).map(r => r.qty)), sent = sum(myDisp(rows, me).map(r => r.qty));
  const b = sum(myMid(mid, me, 'bush').map(r => r.qty)), c = sum(myMid(mid, me, 'capacitor').map(r => r.qty));
  return { motors, sent, hand: motors - sent, b, c, bl: motors * 2, cl: motors, cov: motors * 2, kup: sum(myMade(rows, me).map(r => r.kuppa || 0)) };
}
