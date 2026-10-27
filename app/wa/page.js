'use client';
// Admin: WhatsApp alerts. Numbers, test mode, on/off and the alert log.
import { useState, useEffect } from 'react';
import { useApi, postJson } from '../../components/store';
import Nav from '../../components/nav';
import Top from '../../components/top';
import { dm, todayIST } from '../../components/motor';

const ST = {
  queued: ['Waiting', 'a'], sending: ['Sending', 'a'], sent: ['Sent', 'g'], delivered: ['Delivered', 'g'],
  failed: ['Failed', 'r'], unsure: ['Not sure', 'a'], expired: ['Expired', ''], no_number: ['No number', ''], cancelled: ['Cancelled', '']
};
const CAN_RESEND = ['failed', 'unsure', 'expired', 'no_number'];

export default function WaAlerts() {
  const { data, err, reload } = useApi('/api/wa-admin');
  const [S, setS] = useState(null);
  const [nums, setNums] = useState({});
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null);
  const flash = t => { setMsg(t); setTimeout(() => setMsg(''), 3500); };

  useEffect(() => {
    if (data && !S) setS({ enabled: data.settings.enabled, test_mode: data.settings.test_mode, test_phone: data.settings.test_phone || '', monthly_cap: data.settings.monthly_cap, expire_minutes: data.settings.expire_minutes });
    if (data) setNums(n => { const o = { ...n }; data.people.forEach(p => { if (!(p.name in o)) o[p.name] = { phone: p.phone, on: p.alerts_on }; }); return o; });
  }, [data]);

  async function saveSettings(next) {
    const v = { ...S, ...next };
    if (next.test_mode === false && !confirm('Test mode OFF: alerts will go to the real contractors. Continue?')) return;
    try { await postJson('/api/wa-admin', { action: 'settings', ...v }); setS(v); flash('Saved'); reload(); }
    catch (e) { flash(e.message); }
  }
  async function saveContact(name, patch) {
    const v = { ...(nums[name] || { phone: '', on: true }), ...patch };
    setNums(n => ({ ...n, [name]: v }));
    try { await postJson('/api/wa-admin', { action: 'contact', name, phone: v.phone, alerts_on: v.on }); flash('Saved ' + name); reload(); }
    catch (e) { flash(e.message); }
  }
  async function act(a, extra, ok) {
    try { await postJson('/api/wa-admin', { action: a, ...extra }); flash(ok); reload(); }
    catch (e) { flash(e.message); }
  }
  function resend(r) {
    const warn = r.status === 'unsure' ? 'This one may already have reached the phone. Check first. Send again?' : 'Send this alert again?';
    if (confirm(warn)) act('resend', { id: r.id }, 'Queued again');
  }

  const st = data ? data.settings : null;
  const seen = st && st.seen_ago !== null && st.seen_ago !== undefined ? st.seen_ago : null;
  // Fresh enough compared to the sender's own reported rhythm (1.6x + slack), not a fixed 90 s.
  const online = seen !== null && seen < (st && st.poll_seconds ? st.poll_seconds * 1.6 + 30 : 90);
  const seenText = seen === null ? 'Never connected' : (seen < 60 ? 'just now' : seen < 3600 ? Math.round(seen / 60) + ' min ago' : Math.round(seen / 3600) + ' h ago');

  return (
    <div className="w">
      <Top date={dm(todayIST())} />
      <h1>WhatsApp alerts</h1>
      {msg ? <div className="good">{msg}</div> : null}
      {err ? <div className="card"><div className="err">{err}</div></div> : null}
      {!data && !err ? <div className="card"><div className="note">Loading...</div></div> : null}
      {data && S ? (
        <>
          <div className="card">
            <div className="ord"><div><b>Send alerts</b><small>Off = no new alerts are created</small></div>
              <input type="checkbox" checked={!!S.enabled} onChange={e => saveSettings({ enabled: e.target.checked })} style={{ width: 24, height: 24 }} />
            </div>
            <div className="ord" style={{ marginTop: 14 }}><div><b>Test mode</b><small>On = every alert goes only to the test number below</small></div>
              <input type="checkbox" checked={!!S.test_mode} onChange={e => saveSettings({ test_mode: e.target.checked })} style={{ width: 24, height: 24 }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input className="f" style={{ marginBottom: 0, flex: 1 }} inputMode="tel" placeholder="Your test number" value={S.test_phone} onChange={e => setS({ ...S, test_phone: e.target.value })} />
              <button className="btn s" onClick={() => saveSettings({})}>Save</button>
              <button className="btn o s" onClick={() => act('test', {}, 'Test message queued')}>Send test</button>
            </div>
            <div className="note" style={{ marginTop: 12 }}>
              Sender: <b style={{ color: online ? 'var(--a)' : 'var(--red)' }}>{online ? 'Connected' : 'Not connected'}</b> - computer last seen {seenText} - {data.waiting} waiting - {data.monthSent} sent this month (limit {S.monthly_cap})
            </div>
          </div>

          <div className="card">
            <b>Numbers</b>
            {data.people.map(p => {
              const v = nums[p.name] || { phone: p.phone, on: p.alerts_on };
              return (
                <div className="row" key={p.name} style={{ gap: 8 }}>
                  <b style={{ width: 78 }}>{p.name}</b>
                  <input className="f" style={{ marginBottom: 0, flex: 1 }} inputMode="tel" placeholder="Add number" value={v.phone}
                    onChange={e => setNums(n => ({ ...n, [p.name]: { ...v, phone: e.target.value } }))} onBlur={() => { if (v.phone !== p.phone) saveContact(p.name, {}); }} />
                  <input type="checkbox" checked={!!v.on} onChange={e => saveContact(p.name, { on: e.target.checked })} style={{ width: 22, height: 22 }} />
                </div>
              );
            })}
            <div className="note">Tick = alerts on for that person. The number saves when you leave the box.</div>
          </div>

          <div className="card">
            <b>Recent alerts</b>
            {data.log.length === 0 ? <div className="note">Nothing yet.</div> : data.log.map(r => {
              const t = ST[r.status] || [r.status, ''];
              return (
                <div className="row" key={r.id} style={{ alignItems: 'flex-start' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                  <div><b style={{ fontSize: 14 }}>{r.what}</b><small>{r.at} - {r.recipient}{r.error ? ' - ' + r.error : ''}</small>
                    {open === r.id ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, margin: '8px 0 0', color: 'var(--mute)' }}>{r.text}</pre> : null}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={'tag ' + (t[1] === 'r' ? '' : t[1])} style={t[1] === 'r' ? { background: '#fee4e2', color: 'var(--red)' } : undefined}>{t[0]}</span>
                    {CAN_RESEND.includes(r.status) ? <div><button className="btn o s" style={{ marginTop: 6 }} onClick={e => { e.stopPropagation(); resend(r); }}>Resend</button></div> : null}
                  </div>
                </div>
              );
            })}
            <div className="note">Sent = WhatsApp accepted it. Delivered = it reached the phone. Not sure = check before Resend. Tap a row to see the text.</div>
          </div>
        </>
      ) : null}
      <Nav />
    </div>
  );
}
