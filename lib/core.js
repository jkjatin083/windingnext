// Shared server code: login tokens, PIN check, and the same read-only
// database queries the live winding app uses. Nothing here writes entries.
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const NAMES = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil', 'Pandey ji', 'Sandeep'];
// Only App 1 contractors can log in to this new app in phase 1.
export const WHO = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil'];
export const START = '2026-10-01';

export const db = () => neon(process.env.DATABASE_URL);

export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function key() {
  return crypto.createHash('sha256').update('wa-auth:' + (process.env.DATABASE_URL || '')).digest();
}
function b64(s) { return Buffer.from(s).toString('base64url'); }

export function sign(name, hours) {
  const body = b64(JSON.stringify({ n: name, exp: Date.now() + hours * 3600 * 1000 }));
  const mac = crypto.createHmac('sha256', key()).update(body).digest('base64url');
  return body + '.' + mac;
}

// Returns the logged-in name (or 'ADMIN'), or null. Same token format as the live app.
export function verify(req) {
  try {
    const h = String(req.headers.get('authorization') || '');
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const [body, mac] = t.split('.');
    if (!body || !mac) return null;
    const want = crypto.createHmac('sha256', key()).update(body).digest('base64url');
    const a = Buffer.from(mac), b = Buffer.from(want);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    if (p.n !== 'ADMIN' && !NAMES.includes(p.n)) return null;
    return p.n;
  } catch (e) { return null; }
}

export function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
export function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function normParty(p) {
  const k = String(p || '').toLowerCase().replace(/[^a-z]/g, '');
  return WHO.find(c => c.toLowerCase() === k) || null;
}

// Per stamping type: stators made (wound) and given (sent) by this contractor
export async function holds(sql, me) {
  const r = await sql`SELECT stype,
      COALESCE(SUM(CASE WHEN kind = 'wound' THEN qty END),0)::float AS made,
      COALESCE(SUM(CASE WHEN kind = 'sent' THEN qty END),0)::float AS given
    FROM wa_entries WHERE deleted = false AND contractor = ${me} AND d >= ${START}::date AND kind IN ('wound','sent')
    GROUP BY stype`;
  const o = {};
  r.forEach(x => { o[x.stype] = { made: x.made, given: x.given, held: x.made - x.given }; });
  return o;
}

// One shared read of Midland stamping OUTWARD rows
export async function midOut(sql) {
  return await sql`SELECT t.party_name, t.quantity::float AS q, i.name AS item FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id
      WHERE upper(t.transaction_type) = 'OUTWARD' AND i.category IN ('STAMPING', 'AIRY STAMPING') AND t.transaction_date >= ${START}::date`;
}

// Stamping with this contractor, per type: received minus stators made
export async function stampStock(sql, me, mid) {
  const o = {};
  const g = t => o[t] || (o[t] = { recv: 0, made: 0, bal: 0 });
  try {
    const m = mid !== undefined ? await mid : await midOut(sql);
    if (m) m.forEach(x => { if (normParty(x.party_name) === me) g(x.item).recv += x.q; });
  } catch (e) { /* Midland not readable */ }
  const w = await sql`SELECT kind, contractor, party, stype, qty::float AS q FROM wa_entries
    WHERE deleted = false AND d >= ${START}::date AND stype IS NOT NULL
      AND ((contractor = ${me} AND kind IN ('stamp_in','wound','transfer')) OR (party = ${me} AND kind = 'transfer'))`;
  w.forEach(x => {
    if (x.kind === 'stamp_in') g(x.stype).recv += x.q;
    else if (x.kind === 'wound') g(x.stype).made += x.q;
    else if (x.kind === 'transfer') { if (x.party === me) g(x.stype).recv += x.q; else g(x.stype).recv -= x.q; }
  });
  Object.values(o).forEach(x => { x.bal = x.recv - x.made; });
  return o;
}

// Open orders issued to this contractor, with wound/given progress
export async function openIssues(sql, me) {
  let rows = [];
  try {
    rows = await sql`SELECT i.id, i.qty::float AS qty, o.order_no, o.winding_type, o.motor_type, o.stator_type,
        to_char(o.due, 'YYYY-MM-DD') AS due,
        COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id
                  WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'wound'),0)::float AS wound,
        COALESCE((SELECT SUM(e.qty) FROM ca_meta m JOIN wa_entries e ON e.id = m.entry_id
                  WHERE m.issue_id = i.id AND e.deleted = false AND e.kind = 'sent'),0)::float AS given
      FROM ca_issues i JOIN ca_orders o ON o.id = i.order_id
      WHERE i.contractor = ${me} AND i.closed = false ORDER BY i.id`;
  } catch (e) { return { rows: [], err: String(e.message || e) }; }
  return { rows: rows.map(r => ({ ...r, left: Math.max(0, r.qty - r.wound) })).filter(r => r.left > 0 || r.given < r.wound) };
}
