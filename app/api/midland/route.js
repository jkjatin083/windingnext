// GET /api/midland - parts received from Midland (bush, capacitor, cover, kuppa)
// for the logged-in motor contractor. Port of the live app's api/midland.js.
// READ-ONLY: bush/capacitor come from Midland's open route, cover/kuppa from
// the shared database. Nothing is ever written to Midland.
import { db, verify } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MOTOR_WHO = ['Pandey ji', 'Sunil'];
const BASE = process.env.MIDLAND_URL || 'https://midlandmetals.vercel.app';

export async function GET(req) {
  const me = verify(req);
  if (!me || me === 'ADMIN') return Response.json({ error: 'Please log in' }, { status: 401 });
  if (!MOTOR_WHO.includes(me)) return Response.json({ error: 'Only Pandey ji or Sunil use the motor app' }, { status: 403 });
  try {
    const r = await fetch(`${BASE}/api/contractor-outward?from=2026-10-01`);
    if (!r.ok) return Response.json({ error: 'Midland returned ' + r.status }, { status: 502 });
    const j = await r.json();
    const rows = (j.rows || [])
      .filter(x => (x.category === 'bush' || x.category === 'capacitor') &&
                   x.contractor === me &&
                   x.date >= '2026-10-01')
      .map(x => ({ date: x.date, contractor: x.contractor, category: x.category, item: x.item, qty: Number(x.qty) }));
    // Cover / kuppa: Midland DB se, sirf SELECT (open route mein ye nahi aate)
    let extraError = null;
    try {
      const sql = db();
      const m = await sql`
        SELECT t.party_name, t.quantity::float AS qty, i.name AS item, i.category AS cat,
               to_char(t.transaction_date::date, 'YYYY-MM-DD') AS d
        FROM inventory_transactions t
        JOIN inventory_items i ON i.id = t.item_id
        WHERE upper(t.transaction_type) = 'OUTWARD'
          AND t.transaction_date >= '2026-10-01'::date
          AND (i.name ILIKE '%cover%' OR i.name ILIKE '%kuppa%' OR i.category ILIKE '%cover%' OR i.category ILIKE '%kuppa%')
          AND upper(i.category) NOT IN ('PAPER', 'HARDWARE')
          AND i.name NOT ILIKE '%rivit%'`;
      for (const x of m) {
        const k = String(x.party_name || '').toLowerCase().replace(/[^a-z]/g, '');
        const who = (k === 'pandayji' || k === 'pandeyji') ? 'Pandey ji' : (k === 'sunil' ? 'Sunil' : null);
        if (!who || who !== me) continue;
        const isK = /kuppa/i.test(x.item) || /kuppa/i.test(x.cat);
        rows.push({ date: x.d, contractor: who, category: isK ? 'kuppa' : 'cover', item: x.item, qty: Number(x.qty) });
      }
    } catch (e) {
      extraError = String(e.message || e);
    }
    return Response.json({ rows, extraError });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
