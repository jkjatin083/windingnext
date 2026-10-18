'use client';
// Shared bits for the admin Order Book screens: the labelled progress bar
// used on every card, and the per-order wound/given totals.
import { fmt } from './motor';

export function Bi({ lab, have, tot, sub, short }) {
  const pc = tot > 0 ? Math.max(0, Math.min(100, Math.round(100 * have / tot))) : 0;
  return (
    <div className="bi">
      <div className="h"><span>{lab}</span><span className={short ? 'am' : ''}>{fmt(have)} / {fmt(tot)}</span></div>
      <div className={'bar' + (short ? ' am' : '')}><i style={{ width: pc + '%' }} /></div>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

export const woundOf = (D, oid) => (D.issues || []).filter(i => i.order_id === oid).reduce((a, i) => a + i.wound, 0);
export const givenOf = (D, oid) => (D.issues || []).filter(i => i.order_id === oid).reduce((a, i) => a + i.given, 0);
export const K = t => String(t || '').trim().toUpperCase();
