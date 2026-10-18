// GET/POST /api/admin - Admin user management. Port of the live api/admin.js:
// list people and whether their PIN is set, set a 4-6 digit PIN for anyone,
// and "open" the app as that person (12-hour token).
import crypto from 'node:crypto';
import { db, NAMES, verify, sign, hashPin } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const rows = await sql`SELECT name, (hash IS NOT NULL) AS has_pin FROM wa_users`;
    const m = {}; rows.forEach(r => { m[r.name] = r.has_pin; });
    return Response.json({ users: NAMES.map(n => ({ name: n, hasPin: !!m[n] })) });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const b = await req.json().catch(() => ({}));
    if (!NAMES.includes(b.name)) return Response.json({ error: 'Invalid name' }, { status: 400 });
    if (b.action === 'setpin') {
      const pin = String(b.pin || '');
      if (!/^\d{4,6}$/.test(pin)) return Response.json({ error: 'PIN must be 4 to 6 digits' }, { status: 400 });
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = hashPin(pin, salt);
      await sql`INSERT INTO wa_users (name, salt, hash, fails, locked_until, updated_at) VALUES (${b.name}, ${salt}, ${hash}, 0, NULL, now())
                ON CONFLICT (name) DO UPDATE SET salt = ${salt}, hash = ${hash}, fails = 0, locked_until = NULL, updated_at = now()`;
      return Response.json({ ok: true });
    }
    if (b.action === 'open') {
      return Response.json({ token: sign(b.name, 12), name: b.name });
    }
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
