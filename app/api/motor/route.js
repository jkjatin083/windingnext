// Motor app API (Pandey ji + Sunil): winding received, motors made, dispatch.
// Port of the live app's api/wa.js: same tables (wa_entries, wa_dispatch_kuppa,
// ca_meta) and same rules - no negative winding, no over-dispatch, no same-day
// duplicates. PARTS_CHECK is one flag, same as the live app (off for old data).
// Unlike live wa.js GET, this route does not load Midland stamping rows -
// the motor screens only use wa_entries rows (parts come from /api/midland).
import { db, verify, START, todayIST } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PARTS_CHECK = false; // same switch as live api/wa.js - set true to block motor saves when parts are short
const MOTOR_WHO = ['Pandey ji', 'Sunil'];
const CONTRACTORS = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil', 'Pandey ji'];

// Midland mein party ka naam alag alag likha ho sakta hai (Pandayji / Pandey ji ...)
function normParty(p) {
  const k = String(p || '').toLowerCase().replace(/[^a-z]/g, '');
  if (k === 'pandayji' || k === 'pandeyji') return 'Pandey ji';
  return CONTRACTORS.find(c => c.toLowerCase().replace(/[^a-z]/g, '') === k) || null;
}

function partOf(x) {
  const n = String(x.name || ''), c = String(x.category || '');
  if (/^bush 034$/i.test(n.trim())) return 'bush';
  if (/capacitor/i.test(n) || /capacitor/i.test(c)) return 'capacitor';
  if (/^(paper|hardware)$/i.test(c.trim()) || /rivit/i.test(n)) return null;
  if (/kuppa/i.test(n) || /kuppa/i.test(c)) return 'kuppa';
  if (/cover/i.test(n) || /cover/i.test(c)) return 'cover';
  return null;
}

async function motorsInHand(sql, me, src, stype) {
  const m = await sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries
    WHERE deleted = false AND kind = 'made' AND contractor = ${me}
      AND (${src}::text IS NULL OR (party = ${src} AND stype = ${stype}))`;
  const x = await sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries
    WHERE deleted = false AND kind = 'mdispatch' AND contractor = ${me}
      AND (${src}::text IS NULL OR (party = ${src} AND stype = ${stype}))`;
  return { made: m[0].v, sent: x[0].v };
}

async function checkDispatch(sql, me, qty, d, src, stype) {
  if (!src || !stype) return 'Select the winding (contractor - type) first';
  const dup = await sql`SELECT id FROM wa_entries WHERE deleted = false AND kind = 'mdispatch' AND contractor = ${me}
    AND d = ${d}::date AND party = ${src} AND stype = ${stype} AND qty = ${qty} LIMIT 1`;
  if (dup.length) return 'Duplicate: the same dispatch (date, winding, motors) is already saved';
  const h = await motorsInHand(sql, me, src, stype);
  if (qty > h.made - h.sent) return 'Not enough motors in hand for ' + src + ' - ' + stype + ': ' + (h.made - h.sent) + ' available, you entered ' + qty;
  return null;
}

async function windAvail(sql, me, src, stype, excludeSentAmount) {
  const a = await sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries
    WHERE deleted = false AND kind = 'sent' AND party = ${me} AND contractor = ${src} AND stype = ${stype}`;
  const b = await sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries
    WHERE deleted = false AND kind IN ('made', 'dispatch') AND contractor = ${me} AND party = ${src} AND stype = ${stype}`;
  return a[0].v - (excludeSentAmount || 0) - b[0].v;
}

async function checkMade(sql, me, qty, kq, d, src, stype) {
  if (!src || !stype) return 'Select the winding (contractor - type) first';
  // 1) double entry
  let dup;
  try {
    dup = await sql`SELECT e.id FROM wa_entries e LEFT JOIN wa_dispatch_kuppa k ON k.entry_id = e.id
      WHERE e.deleted = false AND e.kind IN ('made', 'dispatch') AND e.contractor = ${me} AND e.d = ${d}::date
        AND e.party = ${src} AND e.stype = ${stype} AND e.qty = ${qty} AND COALESCE(k.kuppa_qty,0) = ${kq} LIMIT 1`;
  } catch (e) {
    dup = await sql`SELECT id FROM wa_entries WHERE deleted = false AND kind IN ('made', 'dispatch') AND contractor = ${me}
      AND d = ${d}::date AND party = ${src} AND stype = ${stype} AND qty = ${qty} LIMIT 1`;
  }
  if (dup.length) return 'Duplicate: the same motors entry (date, winding, motors) is already saved';
  // 2) winding available
  const av = await windAvail(sql, me, src, stype, 0);
  if (qty > av) return 'Not enough winding: ' + av + ' available from ' + src + ' - ' + stype + ', you entered ' + qty;
  // 3) parts balances must not go negative
  if (!PARTS_CHECK) return null;
  const mo = await sql`SELECT COALESCE(SUM(qty),0)::float AS v FROM wa_entries WHERE deleted = false AND kind IN ('made', 'dispatch') AND party IS NOT NULL AND contractor = ${me}`;
  let ku = 0;
  try {
    const k = await sql`SELECT COALESCE(SUM(k.kuppa_qty),0)::float AS v FROM wa_dispatch_kuppa k
      JOIN wa_entries e ON e.id = k.entry_id WHERE e.deleted = false AND e.kind IN ('made', 'dispatch') AND e.party IS NOT NULL AND e.contractor = ${me}`;
    ku = k[0].v;
  } catch (e) { /* table not created yet */ }
  const recv = { bush: 0, capacitor: 0, kuppa: 0, cover: 0 };
  let m;
  try {
    m = await sql`SELECT t.party_name, t.quantity::float AS qty, i.name AS name, i.category AS category
      FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id
      WHERE upper(t.transaction_type) = 'OUTWARD' AND t.transaction_date >= ${START}::date`;
  } catch (e) {
    return 'Could not check parts stock in Midland, so the entry was not saved: ' + String(e.message || e);
  }
  for (const x of m) {
    if (normParty(x.party_name) !== me) continue;
    const p = partOf(x);
    if (p) recv[p] += x.qty;
  }
  const M = mo[0].v + qty, K = ku + kq;
  const need = { bush: 2 * M, capacitor: M, kuppa: K, cover: 2 * M };
  const short = [];
  for (const p of ['bush', 'capacitor', 'kuppa', 'cover']) {
    if (recv[p] - need[p] < 0) short.push(p + ' (received ' + recv[p] + ', needed ' + need[p] + ')');
  }
  if (short.length) return 'Not enough parts to make these motors: ' + short.join('; ') + '. Record the parts issue in Midland first.';
  return null;
}

// Returns { status, body } so both POST add and the edit flow can use it.
async function addEntry(sql, me, b) {
  const kind = b.kind;
  if (kind !== 'made' && kind !== 'mdispatch') return { status: 400, body: { error: 'Invalid entry type' } };
  const qty = Number(b.qty);
  const d = String(b.d || '');
  if (!(qty > 0) || qty > 10000000) return { status: 400, body: { error: 'Invalid quantity' } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < START) return { status: 400, body: { error: 'Date must be 1 Oct 2026 or later' } };
  const stype = String(b.stype || '').trim().slice(0, 60);
  if (!stype) return { status: 400, body: { error: 'Enter the stamping type' } };
  const party = String(b.party || '');
  if (!CONTRACTORS.includes(party)) return { status: 400, body: { error: 'Invalid winding contractor' } };
  const kq = Number(b.kuppa || 0);
  if (kind === 'made') {
    if (kq < 0 || kq > qty) return { status: 400, body: { error: 'Motors with kuppa cannot be more than motors made' } };
    const why = await checkMade(sql, me, qty, kq, d, party, stype);
    if (why) return { status: 409, body: { error: why } };
  } else {
    const why = await checkDispatch(sql, me, qty, d, party, stype);
    if (why) return { status: 409, body: { error: why } };
  }
  const note = (b.note ? String(b.note).trim().slice(0, 100) + ' | via next app' : 'via next app');
  const r = await sql`INSERT INTO wa_entries (kind, contractor, party, stype, qty, d, note)
    VALUES (${kind}, ${me}, ${party}, ${stype}, ${qty}, ${d}::date, ${note}) RETURNING id`;
  // ORDER TAG: link this entry to the order issued to that winding contractor
  if (Number(b.issue_id) > 0) {
    try {
      await sql`INSERT INTO ca_meta (entry_id, issue_id) SELECT ${r[0].id}, i.id FROM ca_issues i WHERE i.id = ${Number(b.issue_id)} AND i.contractor = ${party} ON CONFLICT DO NOTHING`;
    } catch (e) { /* order tables not ready */ }
  }
  if (kind === 'made' && kq > 0) {
    try {
      await sql`INSERT INTO wa_dispatch_kuppa (entry_id, kuppa_qty) VALUES (${r[0].id}, ${kq})`;
    } catch (e) {
      await sql`UPDATE wa_entries SET deleted = true WHERE id = ${r[0].id}`;
      return { status: 500, body: { error: 'Kuppa could not be saved: ' + String(e.message || e) } };
    }
  }
  return { status: 200, body: { ok: true, id: r[0].id } };
}

export async function GET(req) {
  const me = verify(req);
  if (!me || me === 'ADMIN') return Response.json({ error: 'Please log in' }, { status: 401 });
  if (!MOTOR_WHO.includes(me)) return Response.json({ error: 'Only Pandey ji or Sunil use the motor app' }, { status: 403 });
  try {
    const sql = db();
    const rows = await sql`
      SELECT id, kind, contractor, party, stype, qty::float AS qty,
             to_char(d, 'YYYY-MM-DD') AS d, note
      FROM wa_entries
      WHERE deleted = false AND d >= ${START}::date
        AND (contractor = ${me} OR (party = ${me} AND kind IN ('transfer', 'sent')))
      ORDER BY d, id`;
    try {
      const k = await sql`SELECT entry_id, kuppa_qty::float AS k FROM wa_dispatch_kuppa`;
      const km = {}; k.forEach(x => { km[x.entry_id] = x.k; });
      rows.forEach(r => { if ((r.kind === 'made' || r.kind === 'dispatch') && km[r.id]) r.kuppa = km[r.id]; });
    } catch (e) { /* kuppa table not made yet: treat kuppa as 0 */ }
    return Response.json({ start: START, rows });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  const me = verify(req);
  if (!me || me === 'ADMIN') return Response.json({ error: 'Please log in' }, { status: 401 });
  if (!MOTOR_WHO.includes(me)) return Response.json({ error: 'Only Pandey ji or Sunil use the motor app' }, { status: 403 });
  try {
    const sql = db();
    const b = await req.json().catch(() => ({}));
    if (b.action === 'del') {
      // Same as the live app: app users cannot delete; admin deletes from the admin Entries tab.
      return Response.json({ error: 'Only admin (Jatin) can delete entries' }, { status: 403 });
    }
    if (b.action === 'add') {
      const r = await addEntry(sql, me, b);
      return Response.json(r.body, { status: r.status });
    }
    if (b.action === 'edit') {
      const id = parseInt(b.id, 10);
      if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 });
      const c = await sql`SELECT kind, contractor, party, stype, to_char(d, 'YYYY-MM-DD') AS d FROM wa_entries WHERE id = ${id} AND deleted = false`;
      if (!c.length || c[0].contractor !== me) return Response.json({ error: 'Entry not found for this person' }, { status: 403 });
      const cur = c[0];
      // Same rule as live: contractors can edit only today's entries (admin edits come from the admin Entries tab)
      const td = todayIST();
      if (cur.d !== td) return Response.json({ error: 'You can only edit today\'s entries. Ask Jatin to edit older ones.' }, { status: 403 });
      if (String(b.d || '') !== td) return Response.json({ error: 'The date must stay today. Ask Jatin to change the date.' }, { status: 403 });
      if (cur.kind === 'dispatch') return Response.json({ error: 'Old dispatch entries cannot be edited. Ask Jatin.' }, { status: 400 });
      if (cur.kind !== 'made' && cur.kind !== 'mdispatch') return Response.json({ error: 'This entry cannot be edited here' }, { status: 400 });
      const nb = { kind: cur.kind, party: cur.party, stype: cur.stype, qty: b.qty, d: b.d, note: b.note, kuppa: cur.kind === 'made' ? b.kuppa : 0 };
      await sql`UPDATE wa_entries SET deleted = true WHERE id = ${id}`;
      const r2 = await addEntry(sql, me, nb);
      const undo = async (nid) => {
        if (nid) await sql`UPDATE wa_entries SET deleted = true WHERE id = ${nid}`;
        await sql`UPDATE wa_entries SET deleted = false WHERE id = ${id}`;
      };
      if (r2.status !== 200) { await undo(null); return Response.json(r2.body, { status: r2.status }); }
      const nid = r2.body.id;
      const ne = await sql`SELECT party, stype FROM wa_entries WHERE id = ${nid}`;
      for (const k of [{ p: cur.party, s: cur.stype }, { p: ne[0].party, s: ne[0].stype }]) {
        if (cur.kind === 'made') {
          const h = await motorsInHand(sql, me, k.p, k.s);
          if (h.made - h.sent < 0) { await undo(nid); return Response.json({ error: 'Cannot save: motors were already dispatched from this winding' }, { status: 409 }); }
          if ((await windAvail(sql, me, k.p, k.s, 0)) < 0) { await undo(nid); return Response.json({ error: 'Cannot save: winding would go negative' }, { status: 409 }); }
        }
      }
      try { await sql`INSERT INTO ca_meta (entry_id, issue_id) SELECT ${nid}, issue_id FROM ca_meta WHERE entry_id = ${id} ON CONFLICT DO NOTHING`; } catch (e) { /* keep the order tag on edit */ }
      return Response.json({ ok: true, id: nid });
    }
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
