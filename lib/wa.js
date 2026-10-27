// WhatsApp alert helpers: phone numbers, message wording, which alerts an entry
// should create, and the one-statement save that stores the entry AND its alerts
// together (so an entry can never be saved without its alerts, or the reverse).
import { START } from './core';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// A give where the contractor is the party themself (Sunil fits his own windings
// for motor production). Such messages skip the "From/To" lines.
const selfGive = r => !!(r.party && r.party === r.contractor);

// Returns digits with country code (91xxxxxxxxxx) or '' when it does not look valid.
export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) d = '91' + d;
  return /^91[6-9]\d{9}$/.test(d) ? d : '';
}

export function fmtQty(n) {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

export function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1] : String(s || '');
}

// The message text. Wording is in ONE place: change it here only.
// row: a wa_outbox row. opts.test = true adds a TEST line (test mode).
export function renderBody(row, opts) {
  const o = opts || {};
  let t;
  if (row.event === 'test') {
    t = 'Test message from Winding App. If you can read this, alerts are working.';
  } else if (row.event === 'made') {
    t = ['Winding entry saved',
      'Contractor: ' + row.contractor,
      'Winding type: ' + row.wtype,
      'Made: ' + fmtQty(row.qty) + ' pcs'];
    if (row.bal_after !== null && row.bal_after !== undefined) t.push('In hand now: ' + fmtQty(row.bal_after) + ' pcs');
    t.push('Date: ' + fmtDate(row.d));
    t = t.join('\n');
  } else if (row.event === 'edited') {
    // Edit from the admin Entries tab: old qty, if different, is shown first.
    const oldQ = row.old_qty === null || row.old_qty === undefined ? null : Number(row.old_qty);
    const chg = oldQ !== null && oldQ !== row.qty ? fmtQty(oldQ) + ' -> ' + fmtQty(row.qty) : fmtQty(row.qty);
    const note = 'If this looks wrong, tell Jatin.';
    if (row.kind === 'sent') {
      t = selfGive(row)
        ? ['Winding entry corrected',
          'Contractor: ' + row.contractor,
          'Winding type: ' + row.wtype,
          'Given for own motors: ' + chg + ' pcs']
        : ['Given entry corrected',
          'From: ' + row.contractor,
          'To: ' + (row.party || '-'),
          'Winding type: ' + row.wtype,
          'Given: ' + chg + ' pcs'];
    } else {
      t = ['Winding entry corrected',
        'Contractor: ' + row.contractor,
        'Winding type: ' + row.wtype,
        'Made: ' + chg + ' pcs'];
    }
    if (row.bal_after !== null && row.bal_after !== undefined) t.push('In hand now: ' + fmtQty(row.bal_after) + ' pcs');
    t.push('Date: ' + fmtDate(row.d));
    t.push(note);
    t = t.join('\n');
  } else if (row.event === 'deleted') {
    const note = 'If this looks wrong, tell Jatin.';
    if (row.kind === 'sent') {
      t = selfGive(row)
        ? ['Winding entry deleted',
          'Contractor: ' + row.contractor,
          'Winding type: ' + row.wtype,
          'Removed: ' + fmtQty(row.qty) + ' pcs (given for own motors)']
        : ['Given entry deleted',
          'From: ' + row.contractor,
          'To: ' + (row.party || '-'),
          'Winding type: ' + row.wtype,
          'Removed: ' + fmtQty(row.qty) + ' pcs (given earlier)'];
    } else {
      t = ['Winding entry deleted',
        'Contractor: ' + row.contractor,
        'Winding type: ' + row.wtype,
        'Removed: ' + fmtQty(row.qty) + ' pcs (made earlier)'];
    }
    if (row.bal_after !== null && row.bal_after !== undefined) t.push('In hand now: ' + fmtQty(row.bal_after) + ' pcs');
    t.push('Date: ' + fmtDate(row.d));
    t.push(note);
    t = t.join('\n');
  } else {
    t = selfGive(row)
      ? ['Winding given for ' + row.contractor + "'s own motors",
        'Winding type: ' + row.wtype,
        'Given: ' + fmtQty(row.qty) + ' pcs']
      : ['Given to ' + row.party,
        'From: ' + row.contractor,
        'To: ' + row.party,
        'Winding type: ' + row.wtype,
        'Given: ' + fmtQty(row.qty) + ' pcs'];
    if (row.bal_after !== null && row.bal_after !== undefined) t.push('In hand now: ' + fmtQty(row.bal_after) + ' pcs');
    t.push('Date: ' + fmtDate(row.d));
    t = t.join('\n');
  }
  if (o.test && row.event !== 'test') t = 'TEST - this would go to ' + row.recipient + '\n\n' + t;
  return t;
}

// Who should get an alert for this entry. Returns [] when alerts are off.
// Throws if the alert tables are missing (callers then save the entry the old way).
export async function alertPlan(sql, kind, contractor, party) {
  const s = (await sql`SELECT enabled, test_mode FROM wa_alert_settings WHERE id = 1`)[0];
  if (!s || !s.enabled) return [];
  const contacts = await sql`SELECT name, phone, alerts_on FROM wa_contacts`;
  const want = kind === 'wound' ? [[contractor, true]] : [[contractor, true], [party, false]];
  const seen = {}; const plan = [];
  for (const [name, withBal] of want) {
    if (!name || seen[name]) continue;
    seen[name] = true;
    const c = contacts.find(x => x.name === name);
    if (c && !c.alerts_on) continue;
    const ok = s.test_mode || (c && normPhone(c.phone));
    plan.push({ recipient: name, status: ok ? 'queued' : 'no_number', with_bal: withBal });
  }
  return plan;
}

// Saves the entry (+ its order link) + its alerts in ONE statement = one transaction.
// e: {kind, contractor, party, stype, qty, d, note}; issue: {id, winding_type} or null.
// Stock in hand after = the app's own held figure (made minus given for this
// contractor and stamping type from 1 Oct) +/- this entry.
export async function insertWithAlerts(sql, e, issue, wtype, plan) {
  const delta = e.kind === 'wound' ? e.qty : -e.qty;
  const issueId = issue ? issue.id : null;
  const issueWt = issue ? issue.winding_type : null;
  const r = await sql`
    WITH e AS (
      INSERT INTO wa_entries (kind, contractor, party, stype, qty, d, note)
      VALUES (${e.kind}, ${e.contractor}, ${e.party}, ${e.stype}, ${e.qty}, ${e.d}::date, ${e.note})
      RETURNING id
    ), m AS (
      INSERT INTO ca_meta (entry_id, issue_id, winding_type)
      SELECT e.id, ${issueId}::int, ${issueWt}::text FROM e WHERE ${issue ? 1 : 0}::int = 1
      RETURNING entry_id
    ), o AS (
      INSERT INTO wa_outbox (entry_id, event, recipient, status, kind, contractor, party, wtype, qty, d, bal_after)
      SELECT e.id, ${e.kind === 'wound' ? 'made' : 'given'}::text, r.recipient, r.status,
             ${e.kind}::text, ${e.contractor}::text, ${e.party}::text, ${wtype}::text, ${e.qty}::numeric, ${e.d}::date,
             CASE WHEN r.with_bal THEN (
               SELECT COALESCE(SUM(CASE WHEN x.kind = 'wound' THEN x.qty ELSE -x.qty END), 0)
               FROM wa_entries x
               WHERE x.deleted = false AND x.contractor = ${e.contractor}::text AND x.d >= ${START}::date
                 AND x.stype = ${e.stype}::text AND x.kind IN ('wound','sent')
             ) + ${delta}::numeric END
      FROM e, jsonb_to_recordset(${JSON.stringify(plan)}::jsonb) AS r(recipient text, status text, with_bal boolean)
      RETURNING id
    )
    SELECT e.id FROM e`;
  return r[0].id;
}

// One-tap "signal" to the local WhatsApp sender: a message on a private topic that
// the sender is subscribed to, so it asks the website for the alert right now
// instead of waiting for the next scheduled poll. Fire quietly - sending always
// works through the normal poll even when this is missed, disabled or unconfigured.
export async function kick() {
  const t = (process.env.WA_KICK_TOPIC || '').trim();
  if (t.length < 30) return;
  try {
    await fetch('https://ntfy.sh/' + encodeURIComponent(t), {
      method: 'POST',
      body: 'kick',
      headers: { Priority: 'min', Title: 'New WhatsApp alert queued' },
      signal: AbortSignal.timeout(3000)
    });
  } catch (e) { /* the scheduled poll will pick the alert up anyway */ }
}
