// GET/POST /api/wa-admin - Admin only: WhatsApp alert settings, numbers and the alert log.
import { db, verify, WHO } from '../../../lib/core';
import { normPhone, renderBody } from '../../../lib/wa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    let s;
    try { s = (await sql`SELECT enabled, test_mode, test_phone, expire_minutes, monthly_cap, sender_seen,
        CASE WHEN sender_seen IS NULL THEN NULL ELSE extract(epoch FROM (now() - sender_seen))::int END AS seen_ago
        FROM wa_alert_settings WHERE id = 1`)[0]; }
    catch (e) { return Response.json({ error: 'Run the WhatsApp alerts SQL in Neon first (wa_alerts.sql).' }, { status: 500 }); }
    const [contacts, log, cnt] = await Promise.all([
      sql`SELECT name, phone, alerts_on FROM wa_contacts`,
      sql`SELECT id, event, recipient, status, error, kind, contractor, party, wtype, qty::float AS qty, to_char(d, 'YYYY-MM-DD') AS d,
            bal_after::float AS bal_after, attempts,
            to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'DD Mon HH12:MI am') AS at
          FROM wa_outbox ORDER BY id DESC LIMIT 40`,
      sql`SELECT
            count(*) FILTER (WHERE status = 'queued')::int AS waiting,
            count(*) FILTER (WHERE status IN ('sent','delivered') AND sent_at >= date_trunc('month', now()))::int AS month_sent
          FROM wa_outbox`
    ]);
    const cm = {}; contacts.forEach(c => { cm[c.name] = c; });
    return Response.json({
      settings: s,
      waiting: cnt[0].waiting, monthSent: cnt[0].month_sent,
      people: WHO.map(n => ({ name: n, phone: (cm[n] && cm[n].phone) || '', alerts_on: cm[n] ? cm[n].alerts_on : true })),
      log: log.map(r => ({ id: r.id, at: r.at, status: r.status, error: r.error, recipient: r.recipient, event: r.event,
        what: r.event === 'test' ? 'Test message' : (r.event === 'edited' ? 'Corrected to ' : r.event === 'deleted' ? 'Removed ' : (r.event === 'made' ? 'Made ' : 'Given ')) + r.qty,
        text: renderBody(r, {}) }))
    });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}

export async function POST(req) {
  if (verify(req) !== 'ADMIN') return Response.json({ error: 'Admin login needed' }, { status: 401 });
  try {
    const sql = db();
    const b = await req.json().catch(() => ({}));
    if (b.action === 'settings') {
      const tp = String(b.test_phone || '').trim();
      const ph = tp ? normPhone(tp) : '';
      if (tp && !ph) return Response.json({ error: 'Test number is not valid. Use a 10 digit mobile number.' }, { status: 400 });
      if (b.enabled && b.test_mode && !ph) return Response.json({ error: 'Enter your test number first (test mode sends only to it).' }, { status: 400 });
      const cap = Math.max(1, Math.min(100000, parseInt(b.monthly_cap, 10) || 1500));
      const exp = Math.max(5, Math.min(1440, parseInt(b.expire_minutes, 10) || 120));
      await sql`UPDATE wa_alert_settings SET enabled = ${!!b.enabled}, test_mode = ${!!b.test_mode}, test_phone = ${ph || null},
        monthly_cap = ${cap}, expire_minutes = ${exp} WHERE id = 1`;
      return Response.json({ ok: true });
    }
    if (b.action === 'contact') {
      const name = String(b.name || '');
      if (!WHO.includes(name)) return Response.json({ error: 'Unknown person' }, { status: 400 });
      const raw = String(b.phone || '').trim();
      const ph = raw ? normPhone(raw) : '';
      if (raw && !ph) return Response.json({ error: 'Number is not valid. Use a 10 digit mobile number.' }, { status: 400 });
      await sql`INSERT INTO wa_contacts (name, phone, alerts_on) VALUES (${name}, ${ph || null}, ${!!b.alerts_on})
        ON CONFLICT (name) DO UPDATE SET phone = EXCLUDED.phone, alerts_on = EXCLUDED.alerts_on`;
      return Response.json({ ok: true });
    }
    if (b.action === 'resend') {
      const id = parseInt(b.id, 10);
      const r = await sql`UPDATE wa_outbox SET status = 'queued', error = NULL, created_at = now()
        WHERE id = ${id} AND status IN ('failed','unsure','expired','no_number') RETURNING id`;
      if (!r.length) return Response.json({ error: 'This alert cannot be resent' }, { status: 409 });
      return Response.json({ ok: true });
    }
    if (b.action === 'test') {
      const s = (await sql`SELECT test_phone FROM wa_alert_settings WHERE id = 1`)[0];
      if (!s || !normPhone(s.test_phone)) return Response.json({ error: 'Save your test number first.' }, { status: 400 });
      await sql`INSERT INTO wa_outbox (entry_id, event, recipient, status) VALUES (0, 'test', 'Test number', 'queued')`;
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
