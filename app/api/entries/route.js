// GET /api/entries - read-only date-wise entry list with running held,
// same numbers as the live app's report.
import { db, verify, WHO, todayIST, holds, START } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = verify(req);
  if (!me || !WHO.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const today = todayIST();
    let rows;
    try {
      rows = await sql`SELECT to_char(e.d,'YYYY-MM-DD') AS d, e.stype, COALESCE(m.winding_type,'-') AS wt, o.order_no,
          COALESCE(SUM(CASE WHEN e.kind='wound' THEN e.qty END),0)::float AS made,
          COALESCE(SUM(CASE WHEN e.kind='sent' THEN e.qty END),0)::float AS given
        FROM wa_entries e LEFT JOIN ca_meta m ON m.entry_id = e.id
          LEFT JOIN ca_issues i ON i.id = m.issue_id LEFT JOIN ca_orders o ON o.id = i.order_id
        WHERE e.deleted = false AND e.contractor = ${me} AND e.kind IN ('wound','sent') AND e.d >= ${START}::date
        GROUP BY e.d, e.stype, m.winding_type, o.order_no ORDER BY e.d, e.stype`;
    } catch (e) {
      rows = await sql`SELECT to_char(e.d,'YYYY-MM-DD') AS d, e.stype, '-' AS wt, NULL AS order_no,
          COALESCE(SUM(CASE WHEN e.kind='wound' THEN e.qty END),0)::float AS made,
          COALESCE(SUM(CASE WHEN e.kind='sent' THEN e.qty END),0)::float AS given
        FROM wa_entries e WHERE e.deleted = false AND e.contractor = ${me} AND e.kind IN ('wound','sent') AND e.d >= ${START}::date
        GROUP BY e.d, e.stype ORDER BY e.d, e.stype`;
    }
    // running held per stamping type, counted from START
    const run = {};
    const out = [];
    for (const r of rows) {
      run[r.stype] = (run[r.stype] || 0) + r.made - r.given;
      out.push({ ...r, held: run[r.stype] });
    }
    const hold = await holds(sql, me);
    const heldNow = Object.values(hold).reduce((a, x) => a + x.held, 0);
    const made = rows.reduce((a, r) => a + r.made, 0);
    const given = rows.reduce((a, r) => a + r.given, 0);
    return Response.json({ from: START, to: today, rows: out, made, given, heldNow });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
