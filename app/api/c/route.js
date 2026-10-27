// /api/c - Contractor app (App 1). Exact port of the live api/c.js:
// GET ?view=home (order card, stamping types, holds, today's count),
// GET ?view=report (date/type/order hisaab), POST made/give entries.
import { db, verify, START, todayIST, holds, midOut, stampStock, openIssues } from '../../../lib/core';
import { alertPlan, insertWithAlerts, kick } from '../../../lib/wa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contractors who use this page (App 1). Pandey ji uses the motor app.
const WHO1 = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil'];
function normParty(p) {
  const k = String(p || '').toLowerCase().replace(/[^a-z]/g, '');
  return WHO1.find(c => c.toLowerCase() === k) || null;
}

// Stamping/winding names this contractor has seen (own entries + Midland outward)
async function stampTypes(sql, me, mid) {
  const set = new Set();
  const a = await sql`SELECT DISTINCT stype FROM wa_entries WHERE deleted = false AND contractor = ${me} AND stype IS NOT NULL AND kind IN ('wound','stamp_in','transfer','sent')`;
  a.forEach(x => x.stype && set.add(x.stype));
  try {
    const m = mid !== undefined ? await mid : await midOut(sql);
    if (m) m.forEach(x => { if (normParty(x.party_name) === me) set.add(x.item); });
  } catch (e) { /* Midland not readable: use own entries only */ }
  return [...set].sort();
}

// Winding types added by admin (Winding types tab) that this contractor can see
async function addedFor(sql, me) {
  try {
    const r = await sql`SELECT name, who FROM wa_wtypes WHERE hidden = false ORDER BY name`;
    return r.filter(x => x.who === '*' || String(x.who).split(',').includes(me)).map(x => x.name);
  } catch (e) { return []; }
}

export async function GET(req) {
  const me = verify(req);
  if (!me || !WHO1.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const today = todayIST();
    const sp = new URL(req.url).searchParams;
    const view = sp.get('view') || 'home';
    if (view === 'home') {
      const midP = midOut(sql).then(r => r, () => null);
      const [iss, t, types, hold, stamp, added] = await Promise.all([
        openIssues(sql, me),
        sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries WHERE deleted = false AND contractor = ${me} AND kind = 'wound' AND d = ${today}::date`,
        stampTypes(sql, me, midP),
        holds(sql, me),
        stampStock(sql, me, midP).catch(() => ({})),
        addedFor(sql, me)
      ]);
      return Response.json({ me, today, types, holds: hold, stamp, added, issues: iss.rows, issueErr: iss.err || null, madeToday: t[0].v });
    }
    if (view === 'report') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('from') || '') ? sp.get('from') : START;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.get('to') || '') ? sp.get('to') : today;
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
      // running held per stamping type, counted from START, then cut to the date range
      const run = {};
      const out = [];
      for (const r of rows) {
        run[r.stype] = (run[r.stype] || 0) + r.made - r.given;
        if (r.d >= from && r.d <= to) out.push({ ...r, held: run[r.stype] });
      }
      const iss = await openIssues(sql, me);
      let orders = [];
      try {
        orders = await sql`SELECT o.order_no, o.winding_type, o.stator_type, i.qty::float AS qty, to_char(o.due,'YYYY-MM-DD') AS due,
            COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind='wound'),0)::float AS wound,
            COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind='sent'),0)::float AS given
          FROM ca_issues i JOIN ca_orders o ON o.id = i.order_id WHERE i.contractor = ${me} ORDER BY i.id DESC`;
      } catch (e) { /* tables not created yet */ }
      return Response.json({ from, to, rows: out, orders, holds: await holds(sql, me), stamp: await stampStock(sql, me).catch(() => ({})), open: iss.rows.length });
    }
    return Response.json({ error: 'Invalid view' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  const me = verify(req);
  if (!me || !WHO1.includes(me)) return Response.json({ error: 'Please log in' }, { status: 401 });
  try {
    const sql = db();
    const today = todayIST();
    const b = await req.json().catch(() => ({}));
    const kind = b.action === 'give' ? 'sent' : (b.action === 'made' ? 'wound' : null);
    if (!kind) return Response.json({ error: 'Invalid action' }, { status: 400 });
    const qty = Number(b.qty);
    let stype = String(b.stype || '').trim().slice(0, 60);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 1000000) return Response.json({ error: 'Enter a whole number above 0' }, { status: 400 });
    const iss = await openIssues(sql, me);
    let issue = null;
    const opening = kind === 'wound' && b.opening;
    if (opening) {
      const hh = (await holds(sql, me))[stype] || (await addedFor(sql, me)).includes(stype);
      if (!stype || !hh) return Response.json({ error: 'Choose the opening stock item' }, { status: 400 });
    }
    if (iss.rows.length && !opening) {
      const id = parseInt(b.issue_id, 10);
      issue = iss.rows.find(x => x.id === id) || (iss.rows.length === 1 ? iss.rows[0] : null);
      if (!issue) return Response.json({ error: 'Choose the order' }, { status: 400 });
      if (kind === 'wound' && qty > issue.left) return Response.json({ error: 'Only ' + issue.left + ' left in order ' + issue.order_no }, { status: 409 });
    }
    if (kind === 'wound' && issue && issue.stator_type && !opening) stype = issue.stator_type;
    if (!stype) return Response.json({ error: kind === 'wound' ? 'No order issued' : 'Choose the stamping type' }, { status: 400 });
    if (kind === 'sent') {
      const h = (await holds(sql, me))[stype] || { held: 0 };
      if (qty > h.held) return Response.json({ error: 'You hold only ' + h.held + ' of ' + stype + '. Cannot give ' + qty }, { status: 409 });
    }
    const dup = await sql`SELECT id FROM wa_entries WHERE deleted = false AND kind = ${kind} AND contractor = ${me}
      AND d = ${today}::date AND stype = ${stype} AND qty = ${qty} LIMIT 1`;
    if (dup.length) return Response.json({ error: 'Same entry is already saved today. Ask Jatin to edit it, or enter a different number.' }, { status: 409 });
    const party = kind === 'sent' ? (me === 'Sunil' ? 'Sunil' : 'Pandey ji') : null;
    // WhatsApp alerts: who should be told about this entry (empty = alerts off or tables not created yet).
    let plan = [];
    try { plan = await alertPlan(sql, kind, me, party); } catch (e) { plan = []; }
    if (plan.length) {
      // Entry + order link + alerts are saved together in one statement, then tap the PC sender.
      const id = await insertWithAlerts(sql, { kind, contractor: me, party, stype, qty, d: today, note: 'via contractor app' },
        issue ? { id: issue.id, winding_type: issue.winding_type } : null, (issue && issue.winding_type) || stype, plan);
      await kick();
      return Response.json({ ok: true, id });
    }
    const r = await sql`INSERT INTO wa_entries (kind, contractor, party, stype, qty, d, note)
      VALUES (${kind}, ${me}, ${party}, ${stype}, ${qty}, ${today}::date, ${'via contractor app'}) RETURNING id`;
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

