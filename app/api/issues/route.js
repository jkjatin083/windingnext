// GET /api/issues - orders issued to winding contractors, so motor entries
// (Pandey ji / Sunil) can be tagged to an order. Port of the live app's api/t.js.
import { db, verify } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = verify(req);
  if (me !== 'Pandey ji' && me !== 'Sunil' && me !== 'ADMIN') return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const issues = await sql`SELECT i.id, i.contractor, i.qty::int AS qty, o.order_no, o.customer, o.stator_type, o.winding_type, o.motor_type,
        COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'made'),0)::int AS made,
        COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'mdispatch'),0)::int AS sent
      FROM ca_issues i JOIN ca_orders o ON o.id = i.order_id
      WHERE o.cancelled = false AND i.closed = false ORDER BY i.id`;
    return Response.json({ issues });
  } catch (e) {
    return Response.json({ issues: [] });
  }
}
