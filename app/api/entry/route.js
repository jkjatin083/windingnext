// POST /api/entry - contractor entries: "Made" (wound) and "Give" (sent).
// Exact port of the live app's api/c.js POST: same tables (wa_entries, ca_meta),
// same rules (no negative held, no more than order left, no same-day duplicates).
import { db, verify, WHO, todayIST, holds, openIssues, START } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const me = verify(req);
  if (!me || !WHO.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const today = todayIST();
    const b = await req.json().catch(() => ({}));
    const kind = b.action === 'give' ? 'sent' : (b.action === 'made' ? 'wound' : null);
    if (!kind) return Response.json({ error: 'Invalid action' }, { status: 400 });
    const qty = Number(b.qty);
    let stype = String(b.stype || '').trim().slice(0, 60);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1000000) {
      return Response.json({ error: 'Enter a whole number above 0' }, { status: 400 });
    }
    // winding type from the order issued by Sandeep
    const iss = await openIssues(sql, me);
    let issue = null;
    const opening = kind === 'wound' && b.opening;
    if (opening) {
      // opening stock: no order, winding already held under this stamping name
      const hh = (await holds(sql, me))[stype];
      if (!stype || !hh) return Response.json({ error: 'Choose the opening stock item' }, { status: 400 });
    }
    if (iss.rows.length && !opening) {
      const id = parseInt(b.issue_id, 10);
      issue = iss.rows.find(x => x.id === id) || (iss.rows.length === 1 ? iss.rows[0] : null);
      if (!issue) return Response.json({ error: 'Choose the order' }, { status: 400 });
      if (kind === 'wound' && qty > issue.left) {
        return Response.json({ error: 'Only ' + issue.left + ' left in order ' + issue.order_no }, { status: 409 });
      }
    }
    if (kind === 'wound' && issue && issue.stator_type && !opening) stype = issue.stator_type;
    if (!stype) return Response.json({ error: kind === 'wound' ? 'No order issued' : 'Choose the stamping type' }, { status: 400 });
    if (kind === 'sent') {
      const h = (await holds(sql, me))[stype] || { held: 0 };
      if (qty > h.held) {
        return Response.json({ error: 'You hold only ' + h.held + ' of ' + stype + '. Cannot give ' + qty }, { status: 409 });
      }
    }
    const dup = await sql`SELECT id FROM wa_entries WHERE deleted = false AND kind = ${kind} AND contractor = ${me}
      AND d = ${today}::date AND stype = ${stype} AND qty = ${qty} LIMIT 1`;
    if (dup.length) {
      return Response.json({ error: 'Same entry is already saved today. Ask Jatin to edit it, or enter a different number.' }, { status: 409 });
    }
    const party = kind === 'sent' ? (me === 'Sunil' ? 'Sunil' : 'Pandey ji') : null;
    const r = await sql`INSERT INTO wa_entries (kind, contractor, party, stype, qty, d, note)
      VALUES (${kind}, ${me}, ${party}, ${stype}, ${qty}, ${today}::date, ${'via next app'}) RETURNING id`;
    if (issue) {
      try {
        await sql`INSERT INTO ca_meta (entry_id, issue_id, winding_type) VALUES (${r[0].id}, ${issue.id}, ${issue.winding_type})`;
      } catch (e) {
        await sql`UPDATE wa_entries SET deleted = true WHERE id = ${r[0].id}`;
        return Response.json({ error: 'Could not save the order link: ' + String(e.message || e) }, { status: 500 });
      }
    }
    return Response.json({ ok: true, id: r[0].id });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
