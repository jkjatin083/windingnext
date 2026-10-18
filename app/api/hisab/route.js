// GET /api/hisab - read-only Tally-style ledger: stamping received/made/left
// and stators made/given/held, per type.
import { db, verify, WHO, holds, midOut, stampStock } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = verify(req);
  if (!me || !WHO.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const midP = midOut(sql).then(r => r, () => null);
    const [hold, stamp] = await Promise.all([
      holds(sql, me),
      stampStock(sql, me, midP).catch(() => ({}))
    ]);
    return Response.json({ stamp, holds: hold });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
