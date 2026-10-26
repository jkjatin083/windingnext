// GET/POST /api/e - Admin entries: list, edit (quantity / date), soft delete,
// and add (wound / given to Pandey ji). Port of the live api/e.js.
// Balances are checked so a change can never make a stock go below zero,
// and every change is written to the audit log.
import { db, verify, START } from '../../../lib/core';
import { alertPlan, insertWithAlerts } from '../../../lib/wa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP1 = ['stamp_in', 'wound', 'sent', 'transfer'];
const APP2 = ['made', 'mdispatch', 'dispatch'];
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const CONTRACTORS = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil'];
const nz = s => String(s == null ? '' : s).trim().toLowerCase();
const fmt = n => Number(n).toLocaleString('en-IN');

function label(r) {
  switch (r.kind) {
    case 'wound': return 'Made (wound)';
    case 'sent': return 'Given to ' + (r.party || '-');
    case 'transfer': return 'Stamping given to ' + (r.party || '-');
    case 'stamp_in': return 'Stamping received';
    case 'made': return 'Motors made from ' + (r.party || '-');
    case 'mdispatch': return 'Motors dispatched (' + (r.party || '-') + ')';
    case 'dispatch': return 'Dispatch (old)';
    default: return r.kind;
  }
}

// Balances that must never go below zero, computed from a list of live entries.
function balances(rows) {
  const out = {};
  const add = (k, v, text) => { const o = out[k] || (out[k] = { v: 0, text }); o.v += v; };
  rows.forEach(r => {
    const q = Number(r.qty), t = r.stype || '-';
    if (r.kind === 'wound') add('held|' + nz(r.contractor) + '|' + nz(t), q, r.contractor + ' would hold less than 0 of ' + t);
    if (r.kind === 'sent') {
      add('held|' + nz(r.contractor) + '|' + nz(t), -q, r.contractor + ' would hold less than 0 of ' + t);
      if (r.party) add('wind|' + nz(r.party) + '|' + nz(r.contractor) + '|' + nz(t), q, r.party + ' would have less than 0 winding from ' + r.contractor + ' - ' + t + ' (already used for motors)');
    }
    if ((r.kind === 'made' || r.kind === 'dispatch') && r.party) {
      add('wind|' + nz(r.contractor) + '|' + nz(r.party) + '|' + nz(t), -q, r.contractor + ' would have less than 0 winding from ' + r.party + ' - ' + t + ' (already used for motors)');
      if (r.kind === 'made') add('hand|' + nz(r.contractor) + '|' + nz(r.party) + '|' + nz(t), q, r.contractor + ' would have motors dispatched that are more than made (' + r.party + ' - ' + t + ')');
    }
    if (r.kind === 'mdispatch' && r.party) add('hand|' + nz(r.contractor) + '|' + nz(r.party) + '|' + nz(t), -q, r.contractor + ' would have motors dispatched that are more than made (' + r.party + ' - ' + t + ')');
  });
  return out;
}
// Block only if the change makes a balance negative AND worse than it was before (old data issues do not trap you).
function violation(before, after) {
  const B = balances(before), A = balances(after);
  for (const k of Object.keys(A)) {
    const b = B[k] ? B[k].v : 0;
    if (A[k].v < -1e-9 && A[k].v < b - 1e-9) return A[k].text + ' (' + fmt(A[k].v) + ')';
  }
  return null;
}

async function liveRows(sql) {
  return await sql`SELECT id, kind, contractor, party, stype, qty::float AS qty, to_char(d, 'YYYY-MM-DD') AS d, note
    FROM wa_entries WHERE deleted = false AND d >= ${START}::date ORDER BY d, id`;
}

export async function GET(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const q = Object.fromEntries(new URL(req.url).searchParams.entries());
    const showDeleted = q.app === 'deleted';
    const rows = await sql`SELECT e.id, e.kind, e.contractor, e.party, e.stype, e.qty::float AS qty, to_char(e.d, 'YYYY-MM-DD') AS d, e.note, e.deleted
      FROM wa_entries e WHERE e.d >= ${START}::date AND e.deleted = ${showDeleted} ORDER BY e.d DESC, e.id DESC LIMIT 600`;
    let kup = {};
    try { (await sql`SELECT entry_id, kuppa_qty::float AS k FROM wa_dispatch_kuppa`).forEach(x => { kup[x.entry_id] = x.k; }); } catch (e) { /* table missing */ }
    let out = rows.map(r => ({ ...r, text: label(r), kuppa: kup[r.id] || 0 }));
    const people = Array.from(new Set(out.map(r => r.contractor).filter(Boolean))).sort();
    const types = Array.from(new Set(out.map(r => r.stype).filter(Boolean))).sort();
    if (q.app === 'contractors') out = out.filter(r => APP1.includes(r.kind));
    if (q.app === 'motors') out = out.filter(r => APP2.includes(r.kind));
    if (q.who) out = out.filter(r => r.contractor === q.who);
    if (q.type) out = out.filter(r => r.stype === q.type);
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) out = out.filter(r => r.d >= q.from);
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) out = out.filter(r => r.d <= q.to);
    let pickIssues = [], pickOpening = [];
    const live = await liveRows(sql);
    let mid = [];
    try { mid = await sql`SELECT t.party_name, t.quantity::float AS q, i.name AS item FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id
        WHERE upper(t.transaction_type) = 'OUTWARD' AND i.category IN ('STAMPING', 'AIRY STAMPING') AND t.transaction_date >= ${START}::date`; } catch (er) { /* Midland not readable */ }
    const sb = {}, hd = {};
    const key = (c, t) => nz(c) + '|' + nz(t);
    try {
      pickIssues = await sql`SELECT i.id, i.contractor, o.order_no, o.winding_type, o.stator_type,
          (i.qty - COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'wound'),0))::float AS left
        FROM ca_issues i JOIN ca_orders o ON o.id = i.order_id WHERE i.closed = false AND o.cancelled = false ORDER BY i.contractor, i.id`;
      mid.forEach(x => { const c = CONTRACTORS.find(n => nz(n) === String(x.party_name || '').toLowerCase().replace(/[^a-z]/g, '')); if (c) sb[key(c, x.item)] = (sb[key(c, x.item)] || 0) + x.q; });
      live.forEach(r => {
        if (!r.stype) return;
        if (r.kind === 'stamp_in') sb[key(r.contractor, r.stype)] = (sb[key(r.contractor, r.stype)] || 0) + r.qty;
        if (r.kind === 'wound') { sb[key(r.contractor, r.stype)] = (sb[key(r.contractor, r.stype)] || 0) - r.qty; hd[key(r.contractor, r.stype)] = (hd[key(r.contractor, r.stype)] || 0) + r.qty; }
        if (r.kind === 'sent') hd[key(r.contractor, r.stype)] = (hd[key(r.contractor, r.stype)] || 0) - r.qty;
        if (r.kind === 'transfer') { sb[key(r.contractor, r.stype)] = (sb[key(r.contractor, r.stype)] || 0) - r.qty; if (r.party) sb[key(r.party, r.stype)] = (sb[key(r.party, r.stype)] || 0) + r.qty; }
      });
      const nm = {}, hq = {};
      live.forEach(r => { if (r.stype && (r.kind === 'wound' || r.kind === 'sent')) { nm[key(r.contractor, r.stype)] = [r.contractor, r.stype]; hq[key(r.contractor, r.stype)] = (hq[key(r.contractor, r.stype)] || 0) + (r.kind === 'wound' ? r.qty : -r.qty); } });
      Object.keys(hq).forEach(k => {
        const [c, t] = nm[k];
        if (hq[k] > 0 && !pickIssues.some(i => i.contractor === c && i.left > 0 && nz(i.stator_type) === nz(t))) pickOpening.push({ contractor: c, name: t, avail: hq[k] });
      });
      pickIssues = pickIssues.map(i => ({ ...i, stamp: Math.max(0, sb[key(i.contractor, i.stator_type)] || 0), avail: Math.max(0, hd[key(i.contractor, i.stator_type)] || 0) }));
    } catch (er) { /* order tables missing */ }
    // Winding types added by admin (Types tab, no sale order) follow their own
    // assigned contractors here, exactly like the tiles on the Made screen.
    const pickAdded = [];
    try {
      const wt = await sql`SELECT name, who FROM wa_wtypes WHERE hidden = false`;
      for (const w of wt) {
        for (const c of (w.who === '*' ? CONTRACTORS.slice() : String(w.who).split(',').filter(x => CONTRACTORS.includes(x)))) {
          if (pickIssues.some(i => i.contractor === c && i.left > 0 && nz(i.stator_type) === nz(w.name))) continue;
          if (pickOpening.some(o => o.contractor === c && nz(o.name) === nz(w.name))) continue;
          pickAdded.push({ contractor: c, name: w.name, avail: Math.max(0, hd[key(c, w.name)] || 0) });
        }
      }
    } catch (er) { /* winding types table missing */ }
    return Response.json({ rows: out.slice(0, 200), people, types, total: out.length, pick: { contractors: CONTRACTORS, issues: pickIssues, opening: pickOpening.sort((a, b) => a.name.localeCompare(b.name)), added: pickAdded.sort((a, b) => a.name.localeCompare(b.name)) } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const b = await req.json().catch(() => ({}));
    if (b.action === 'add') {
      // Admin add: only Made (wound) and Given to Pandey ji (sent). No motors, no stamping entries.
      const kind = b.entry === 'made' ? 'wound' : (b.entry === 'given' ? 'sent' : null);
      const who = String(b.contractor || '').trim();
      let stype = '';
      const qty = Number(b.qty), d = String(b.d || '');
      if (!kind) return Response.json({ error: 'Choose entry type' }, { status: 400 });
      if (!CONTRACTORS.includes(who)) return Response.json({ error: 'Choose the contractor' }, { status: 400 });
      const openName = String(b.opening_name || '').trim().slice(0, 60);
      let isu = [];
      if (openName) {
        const held = (await liveRows(sql)).filter(r => nz(r.contractor) === nz(who) && nz(r.stype) === nz(openName) && (r.kind === 'wound' || r.kind === 'sent'));
        // A winding type added in the Types tab (no entries yet) is allowed too.
        let wa = null;
        try { wa = (await sql`SELECT name FROM wa_wtypes WHERE hidden = false AND lower(name) = lower(${openName})
            AND (${who} = '*' OR ${who} = ANY(string_to_array(who, ','))) LIMIT 1`)[0] || null; } catch (er) { /* wtypes table missing */ }
        if (!held.length && !wa) return Response.json({ error: 'Choose the opening stock item of this contractor' }, { status: 400 });
        stype = wa ? wa.name : held[0].stype;
      } else {
        isu = await sql`SELECT i.id, i.qty::float AS iq, o.stator_type, o.winding_type,
            COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'wound'),0)::float AS wound
          FROM ca_issues i JOIN ca_orders o ON o.id = i.order_id WHERE i.id = ${parseInt(b.issue_id, 10) || 0} AND i.contractor = ${who} AND i.closed = false AND o.cancelled = false`;
        if (!isu.length) return Response.json({ error: 'Choose the winding (order) of this contractor' }, { status: 400 });
        stype = isu[0].stator_type || '';
        if (!stype) return Response.json({ error: 'This order has no stamping type' }, { status: 400 });
      }
      if (!(qty > 0) || qty > 10000000 || qty !== Math.floor(qty)) return Response.json({ error: 'Enter a whole number above 0' }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < START) return Response.json({ error: 'Date must be 1 Oct 2026 or later' }, { status: 400 });
      if (d > todayIST()) return Response.json({ error: 'Date cannot be in the future' }, { status: 400 });
      try { await sql`SELECT 1 FROM wa_audit LIMIT 1`; } catch (er) { return Response.json({ error: 'Audit table is missing. Run the audit SQL in Neon first. Nothing was changed.' }, { status: 500 }); }
      const party = kind === 'sent' ? (who === 'Sunil' ? 'Sunil' : 'Pandey ji') : null;
      const rows0 = await liveRows(sql);
      const dup0 = rows0.find(r => r.kind === kind && nz(r.contractor) === nz(who) && nz(r.party) === nz(party) && nz(r.stype) === nz(stype) && r.qty === qty && r.d === d);
      if (dup0) return Response.json({ error: 'Same entry already exists on that date (#' + dup0.id + '). That would be a double entry.' }, { status: 409 });
      if (isu.length && kind === 'wound' && isu[0].wound + qty > isu[0].iq) return Response.json({ error: 'Only ' + fmt(isu[0].iq - isu[0].wound) + ' left in this order' }, { status: 409 });
      const bad0 = violation(rows0, rows0.concat([{ id: -1, kind, contractor: who, party, stype, qty, d }]));
      if (bad0) return Response.json({ error: 'Not allowed: ' + bad0 }, { status: 409 });
      // WhatsApp alerts: who should be told (empty = alerts off or tables not created yet).
      let plan = [];
      try { plan = await alertPlan(sql, kind, who, party); } catch (er) { plan = []; }
      let ins;
      if (plan.length) {
        // Entry + order link + alerts are saved together in one statement.
        const nid = await insertWithAlerts(sql, { kind, contractor: who, party, stype, qty, d, note: 'added by admin' },
          isu.length ? { id: isu[0].id, winding_type: isu[0].winding_type } : null, (isu.length && isu[0].winding_type) || stype, plan);
        ins = [{ id: nid }];
      } else {
        ins = await sql`INSERT INTO wa_entries (kind, contractor, party, stype, qty, d, note) VALUES (${kind}, ${who}, ${party}, ${stype}, ${qty}, ${d}::date, ${'added by admin'}) RETURNING id`;
      }
      try {
        if (isu.length && !plan.length) await sql`INSERT INTO ca_meta (entry_id, issue_id, winding_type) VALUES (${ins[0].id}, ${isu[0].id}, ${isu[0].winding_type})`;
        await sql`INSERT INTO wa_audit (entry_id, action, old_value, new_value, by_who) VALUES (${ins[0].id}, 'add', ${null}, ${JSON.stringify({ kind, contractor: who, party, stype, qty, d, issue_id: isu.length ? isu[0].id : null, opening: !!openName })}, 'Jatin (admin)')`;
      } catch (er) {
        await sql`UPDATE wa_entries SET deleted = true WHERE id = ${ins[0].id}`;
        if (plan.length) { try { await sql`UPDATE wa_outbox SET status = 'cancelled' WHERE entry_id = ${ins[0].id} AND status = 'queued'`; } catch (e2) { /* ignore */ } }
        return Response.json({ error: 'Could not save the order link or audit log. Nothing was added.' }, { status: 500 });
      }
      return Response.json({ ok: true, id: ins[0].id });
    }
    const id = parseInt(b.id, 10);
    if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 });
    if (b.action !== 'edit' && b.action !== 'delete') return Response.json({ error: 'Invalid action' }, { status: 400 });

    try { await sql`SELECT 1 FROM wa_audit LIMIT 1`; } catch (e) { return Response.json({ error: 'Audit table is missing. Run the audit SQL in Neon first. Nothing was changed.' }, { status: 500 }); }

    const all = await liveRows(sql);
    const cur = all.find(r => r.id === id);
    if (!cur) return Response.json({ error: 'Entry not found (already deleted?)' }, { status: 404 });
    let after, newQty = cur.qty, newD = cur.d;

    if (b.action === 'edit') {
      newQty = Number(b.qty); newD = String(b.d || cur.d);
      if (!(newQty > 0) || newQty > 10000000 || newQty !== Math.floor(newQty)) return Response.json({ error: 'Enter a whole number above 0' }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newD) || newD < START) return Response.json({ error: 'Date must be 1 Oct 2026 or later' }, { status: 400 });
      if (newD > todayIST()) return Response.json({ error: 'Date cannot be in the future' }, { status: 400 });
      if (newQty === cur.qty && newD === cur.d) return Response.json({ error: 'Nothing changed' }, { status: 400 });
      if ((cur.kind === 'made' || cur.kind === 'dispatch') && newQty > cur.qty) return Response.json({ error: 'Motors made cannot be increased here, because bush, capacitor and cover stock is not rechecked. Delete this entry and ask the contractor to enter it again.' }, { status: 409 });
      if (cur.kind === 'made') {
        try {
          const k = await sql`SELECT kuppa_qty::float AS k FROM wa_dispatch_kuppa WHERE entry_id = ${id}`;
          if (k.length && k[0].k > newQty) return Response.json({ error: 'Motors with kuppa (' + fmt(k[0].k) + ') cannot be more than motors made' }, { status: 409 });
        } catch (e) { /* no kuppa table */ }
      }
      const dup = all.find(r => r.id !== id && r.kind === cur.kind && nz(r.contractor) === nz(cur.contractor) && nz(r.party) === nz(cur.party) && nz(r.stype) === nz(cur.stype) && r.qty === newQty && r.d === newD);
      if (dup) return Response.json({ error: 'Same entry already exists on that date (#' + dup.id + '). That would be a double entry.' }, { status: 409 });
      if (cur.kind === 'wound') {
        try {
          const iss = await sql`SELECT i.id, i.qty::float AS qty FROM ca_meta m JOIN ca_issues i ON i.id = m.issue_id WHERE m.entry_id = ${id}`;
          if (iss.length) {
            const o = await sql`SELECT COALESCE(SUM(e.qty),0)::float AS v FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id WHERE m.issue_id = ${iss[0].id} AND e.deleted = false AND e.kind = 'wound' AND e.id <> ${id}`;
            if (o[0].v + newQty > iss[0].qty) return Response.json({ error: 'This is more than the order quantity issued to this contractor (' + fmt(iss[0].qty) + ')' }, { status: 409 });
          }
        } catch (e) { /* order tables missing */ }
      }
      after = all.map(r => r.id === id ? { ...r, qty: newQty, d: newD } : r);
    } else {
      after = all.filter(r => r.id !== id);
    }
    const bad = violation(all, after);
    if (bad) return Response.json({ error: 'Not allowed: ' + bad }, { status: 409 });

    const oldV = { qty: cur.qty, d: cur.d, kind: cur.kind, contractor: cur.contractor, party: cur.party, stype: cur.stype };
    const newV = b.action === 'edit' ? { qty: newQty, d: newD } : { deleted: true };
    await sql`INSERT INTO wa_audit (entry_id, action, old_value, new_value, by_who) VALUES (${id}, ${b.action}, ${JSON.stringify(oldV)}, ${JSON.stringify(newV)}, 'Jatin (admin)')`;
    if (b.action === 'edit') {
      await sql`UPDATE wa_entries SET qty = ${newQty}, d = ${newD}::date WHERE id = ${id} AND deleted = false`;
    } else {
      await sql`UPDATE wa_entries SET deleted = true WHERE id = ${id} AND deleted = false`;
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
