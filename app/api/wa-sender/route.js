// POST /api/wa-sender - used ONLY by the small WhatsApp program on Jatin's computer.
// It is protected by a long secret (Vercel env WA_SENDER_SECRET), not by a PIN.
//   {action:'poll'}                               -> check in, get at most one alert to send
//   {action:'report', id, result, wa_message_id?, error?}   result: sent | failed | unsure
//   {action:'receipt', wa_message_id, status:'delivered'}   WhatsApp says it reached the phone
import { db, safeEq } from '../../../lib/core';
import { normPhone, renderBody } from '../../../lib/wa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  const secret = process.env.WA_SENDER_SECRET || '';
  if (secret.length < 16) return Response.json({ error: 'WA_SENDER_SECRET is not set on Vercel' }, { status: 503 });
  if (!safeEq(req.headers.get('x-wa-secret') || '', secret)) return Response.json({ error: 'Not allowed' }, { status: 401 });
  try {
    const sql = db();
    const b = await req.json().catch(() => ({}));

    if (b.action === 'poll') {
      // Sender tells us its check-in rhythm so the admin page can judge "connected" fairly.
      const ps = parseInt(b.poll_seconds, 10);
      const pollSec = Number.isFinite(ps) && ps >= 20 && ps <= 7200 ? ps : null;
      await sql`UPDATE wa_alert_settings SET sender_seen = now(), poll_seconds = COALESCE(${pollSec}, poll_seconds) WHERE id = 1`;
      const s = (await sql`SELECT enabled, test_mode, test_phone, expire_minutes, monthly_cap FROM wa_alert_settings WHERE id = 1`)[0];
      if (!s) return Response.json({ error: 'Run the WhatsApp alerts SQL first' }, { status: 500 });
      // old waiting alerts are not sent late
      await sql`UPDATE wa_outbox SET status = 'expired' WHERE status = 'queued' AND created_at < now() - (${s.expire_minutes}::int * interval '1 minute')`;
      // an alert claimed but never reported back = outcome unknown (never auto-retried)
      await sql`UPDATE wa_outbox SET status = 'unsure', error = 'No result came back from the computer' WHERE status = 'sending' AND claimed_at < now() - interval '3 minutes'`;
      const used = (await sql`SELECT count(*)::int AS n FROM wa_outbox WHERE status IN ('sent','delivered') AND sent_at >= date_trunc('month', now())`)[0].n;
      if (used >= s.monthly_cap) return Response.json({ item: null, note: 'Monthly limit reached' });
      for (let tries = 0; tries < 5; tries++) {
        const c = await sql`UPDATE wa_outbox SET status = 'sending', claimed_at = now(), attempts = attempts + 1
          WHERE id = (SELECT id FROM wa_outbox WHERE status = 'queued' AND (${!!s.enabled}::boolean OR event = 'test') ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
          RETURNING id, event, recipient, kind, contractor, party, wtype, qty::float AS qty, to_char(d, 'YYYY-MM-DD') AS d, bal_after::float AS bal_after,
            old_qty::float AS old_qty, to_char(old_d, 'YYYY-MM-DD') AS old_d`;
        if (!c.length) return Response.json({ item: null });
        const row = c[0];
        let phone = '';
        if (row.event === 'test' || s.test_mode) phone = normPhone(s.test_phone);
        else {
          const k = (await sql`SELECT phone, alerts_on FROM wa_contacts WHERE name = ${row.recipient}`)[0];
          if (k && k.alerts_on) phone = normPhone(k.phone);
          else if (k && !k.alerts_on) { await sql`UPDATE wa_outbox SET status = 'cancelled', error = 'Alerts turned off for this person' WHERE id = ${row.id}`; continue; }
        }
        if (!phone) { await sql`UPDATE wa_outbox SET status = 'no_number', error = 'No valid number' WHERE id = ${row.id}`; continue; }
        return Response.json({ item: { id: row.id, phone, text: renderBody(row, { test: !!s.test_mode }) } });
      }
      return Response.json({ item: null });
    }

    if (b.action === 'report') {
      const id = parseInt(b.id, 10);
      if (!id) return Response.json({ error: 'Invalid id' }, { status: 400 });
      const err = String(b.error || '').slice(0, 300) || null;
      const mid = b.wa_message_id ? String(b.wa_message_id).slice(0, 120) : null;
      if (b.result === 'sent') await sql`UPDATE wa_outbox SET status = 'sent', wa_message_id = ${mid}, sent_at = now(), error = NULL WHERE id = ${id} AND status IN ('sending','unsure')`;
      else if (b.result === 'failed') await sql`UPDATE wa_outbox SET status = 'failed', error = ${err} WHERE id = ${id} AND status = 'sending'`;
      else await sql`UPDATE wa_outbox SET status = 'unsure', error = ${err} WHERE id = ${id} AND status = 'sending'`;
      return Response.json({ ok: true });
    }

    if (b.action === 'receipt') {
      const mid = String(b.wa_message_id || '').slice(0, 120);
      if (!mid) return Response.json({ error: 'Invalid message id' }, { status: 400 });
      await sql`UPDATE wa_outbox SET status = 'delivered', delivered_at = now() WHERE wa_message_id = ${mid} AND status IN ('sent','unsure')`;
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 500 });
  }
}
