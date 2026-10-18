// GET /api/home - read-only summary for the contractor home screen.
import { db, verify, WHO, todayIST, holds, midOut, stampStock, openIssues } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = verify(req);
  if (!me || !WHO.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const today = todayIST();
    const midP = midOut(sql).then(r => r, () => null);
    const [iss, t, hold, stamp] = await Promise.all([
      openIssues(sql, me),
      sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries WHERE deleted = false AND contractor = ${me} AND kind = 'wound' AND d = ${today}::date`,
      holds(sql, me),
      stampStock(sql, me, midP).catch(() => ({}))
    ]);
    return Response.json({ me, today, holds: hold, stamp, issues: iss.rows, madeToday: t[0].v });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
