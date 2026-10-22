// GET/POST /api/wtypes - Admin only. List, add, edit, hide/show winding types
// that have no sale order. Contractors see the visible ones as tiles on Made.
import { db, verify } from '../../../lib/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WHO1 = ['Suman', 'Dinesh', 'Ajeet', 'Siraj', 'Sunil'];

export async function GET(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const types = await sql`SELECT id, name, who, hidden FROM wa_wtypes ORDER BY hidden, id DESC`;
    return Response.json({ types, people: WHO1 });
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
      const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!name) return Response.json({ error: 'Enter the winding type name' }, { status: 400 });
      const list = Array.isArray(b.who) ? b.who.filter(x => WHO1.includes(x)) : [];
      if (!list.length) return Response.json({ error: 'Choose at least one contractor' }, { status: 400 });
      const who = list.length === WHO1.length ? '*' : list.join(',');
      const dup = await sql`SELECT id FROM wa_wtypes WHERE lower(name) = lower(${name}) LIMIT 1`;
      if (dup.length) return Response.json({ error: 'This type is already in the list' }, { status: 409 });
      await sql`INSERT INTO wa_wtypes (name, who) VALUES (${name}, ${who})`;
      return Response.json({ ok: true });
    }
    if (b.action === 'edit') {
      const id = parseInt(b.id, 10);
      if (!id) return Response.json({ error: 'Invalid type' }, { status: 400 });
      const name = String(b.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      if (!name) return Response.json({ error: 'Enter the winding type name' }, { status: 400 });
      let who = null;
      if (Array.isArray(b.who)) {
        const list = b.who.filter(x => WHO1.includes(x));
        if (!list.length) return Response.json({ error: 'Choose at least one contractor' }, { status: 400 });
        who = list.length === WHO1.length ? '*' : list.join(',');
      }
      const dup = await sql`SELECT id FROM wa_wtypes WHERE lower(name) = lower(${name}) AND id <> ${id} LIMIT 1`;
      if (dup.length) return Response.json({ error: 'This type is already in the list' }, { status: 409 });
      if (who === null) await sql`UPDATE wa_wtypes SET name = ${name} WHERE id = ${id}`;
      else await sql`UPDATE wa_wtypes SET name = ${name}, who = ${who} WHERE id = ${id}`;
      return Response.json({ ok: true });
    }
    if (b.action === 'hide' || b.action === 'show') {
      const id = parseInt(b.id, 10);
      if (!id) return Response.json({ error: 'Invalid type' }, { status: 400 });
      await sql`UPDATE wa_wtypes SET hidden = ${b.action === 'hide'} WHERE id = ${id}`;
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
