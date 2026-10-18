// POST /api/login - name + PIN. Contractors use the wa_users PIN store
// (same as the live app). Admin uses the ADMIN_PIN environment variable
// and gets an ADMIN token (12 hours), same as the live admin page.
import { db, LOGIN_WHO, sign, hashPin, safeEq } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const b = await req.json().catch(() => ({}));
    const name = String(b.name || '').trim(), pin = String(b.pin || '').trim();

    // Admin: PIN lives in the ADMIN_PIN environment variable (Vercel
    // Project Settings -> Environment Variables), not in the database.
    if (name === 'Admin') {
      const want = String(process.env.ADMIN_PIN || '').trim();
      if (!want) return Response.json({ error: 'Admin PIN is not set on this app yet. Add ADMIN_PIN in Vercel.' }, { status: 401 });
      if (pin !== want) return Response.json({ error: 'Wrong name or PIN' }, { status: 401 });
      return Response.json({ token: sign('ADMIN', 12), name: 'Admin' });
    }

    if (!LOGIN_WHO.includes(name)) return Response.json({ error: 'Wrong name or PIN' }, { status: 401 });
    const sql = db();
    const rows = await sql`SELECT * FROM wa_users WHERE name = ${name}`;
    const row = rows[0];
    if (row && row.locked_until && new Date(row.locked_until) > new Date()) {
      return Response.json({ error: 'Too many wrong PINs. Try again in 10 minutes.' }, { status: 429 });
    }
    let ok = false;
    if (!row || !row.hash) return Response.json({ error: 'PIN is not set yet. Ask Jatin to set it.' }, { status: 401 });
    ok = safeEq(hashPin(pin, row.salt), row.hash);
    if (!ok) {
      const f = (row ? row.fails : 0) + 1;
      if (f >= 5) {
        await sql`INSERT INTO wa_users (name, fails, locked_until) VALUES (${name}, 0, now() + interval '10 minutes')
                  ON CONFLICT (name) DO UPDATE SET fails = 0, locked_until = now() + interval '10 minutes'`;
      } else {
        await sql`INSERT INTO wa_users (name, fails) VALUES (${name}, ${f})
                  ON CONFLICT (name) DO UPDATE SET fails = ${f}`;
      }
      return Response.json({ error: 'Wrong name or PIN' }, { status: 401 });
    }
    await sql`INSERT INTO wa_users (name, fails) VALUES (${name}, 0)
              ON CONFLICT (name) DO UPDATE SET fails = 0, locked_until = NULL`;
    return Response.json({ token: sign(name, 24 * 30), name });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
