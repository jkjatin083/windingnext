'use client';
// Full-screen result screen after a contractor taps Save / Give.
// The success animation appears ONLY after the server confirms the save.
// Three states:
//   success  - server confirmed the save: teal tick animation + entry summary.
//   unknown  - connection dropped mid-save: the entry MAY already be in.
//              Never says "not added" and never retries blindly; the
//              contractor checks the Report tab first (avoids double entries).
//   rejected - the server clearly refused (e.g. over the order limit):
//              nothing was added, retry is safe, quantity stays filled in.
import { useRouter } from 'next/navigation';
import { fmt } from './motor';

// "28 Oct, 10:42 am" in IST for the summary card.
export function nowIST() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
}

const CSS = `
.sv-wrap{position:fixed;inset:0;z-index:40;background:var(--bg);max-width:460px;margin:0 auto;display:flex;flex-direction:column}
.sv-mid{flex:1;display:flex;flex-direction:column;align-items:center;padding:56px 18px 0;overflow-y:auto}
.sv-ckwrap{position:relative;width:120px;height:120px;margin-bottom:6px;flex:none}
.sv-ring{position:absolute;inset:0;border-radius:50%;border:2px solid var(--a);opacity:0;animation:svRip .6s ease-out .25s both}
.sv-ring.r2{animation-delay:.4s}
.sv-ck{position:absolute;inset:16px;border-radius:50%;background:var(--a);display:grid;place-items:center;box-shadow:0 6px 18px rgba(14,159,131,.35);animation:svPop .25s ease-out both}
.sv-ckwrap.plain .sv-ck{position:relative;inset:auto;width:88px;height:88px;margin:16px auto}
.sv-ck.sv-amb{background:var(--amb);box-shadow:0 6px 18px rgba(181,71,8,.3)}
.sv-ck.sv-red{background:var(--red);box-shadow:0 6px 18px rgba(179,38,30,.3)}
.sv-ck svg path.tick{stroke-dasharray:1;stroke-dashoffset:1;animation:svDraw .35s ease-out .25s forwards}
.sv-qty{font-size:46px;font-weight:700;letter-spacing:-.02em;margin-top:14px;animation:svUp .3s ease-out .15s both}
.sv-h{font-size:30px;font-weight:700;margin-top:10px;letter-spacing:-.02em}
.sv-sub{color:var(--mute);font-size:15px;margin-top:4px;text-align:center;animation:svUp .3s ease-out .2s both}
.sv-card{background:#fff;border-radius:20px;padding:6px 16px;margin-top:22px;width:100%;box-shadow:0 1px 2px rgba(16,24,40,.05),0 0 0 1px var(--line);animation:svUp .3s ease-out .35s both}
.sv-row{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-top:1px solid var(--line);font-size:14px;gap:10px}
.sv-row:first-of-type{border-top:0}
.sv-row span{color:var(--mute)}
.sv-row b{font-size:14.5px;font-weight:600;text-align:right}
.sv-box{border-radius:14px;padding:12px 14px;font-size:13px;width:100%;margin-top:14px;line-height:1.5;text-align:center;animation:svUp .3s ease-out .4s both}
.sv-boxa{background:var(--amb2);color:var(--amb)}
.sv-boxr{background:#fef1f0;color:var(--red)}
.sv-sticky{padding:14px 18px}
@keyframes svPop{0%{transform:scale(0)}70%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes svDraw{to{stroke-dashoffset:0}}
@keyframes svRip{0%{transform:scale(.6);opacity:.5}100%{transform:scale(1.2);opacity:0}}
@keyframes svUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}
`;

const TICK = <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path className="tick" d="M4.5 12.5l5 5 10-11" pathLength="1" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const QUESTION = <svg width="42" height="42" viewBox="0 0 24 24" fill="none"><path d="M9.5 9a2.6 2.6 0 1 1 3.6 2.4c-.9.4-1.6 1-1.6 2.1v.6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/><circle cx="11.5" cy="17.4" r="1.8" fill="#fff"/></svg>;
const EXCLAIM = <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 6.5v7" stroke="#fff" strokeWidth="3" strokeLinecap="round"/><circle cx="12" cy="17.4" r="1.9" fill="#fff"/></svg>;

// view: 'success' | 'unknown' | 'rejected'
// rows: [label, value, optional color] triples for the summary card
export default function SavedOverlay({ view, qty, title, rows, reason, note, onClose }) {
  const router = useRouter();
  const ok = view === 'success', unk = view === 'unknown';
  return (
    <div className="sv-wrap">
      <style>{CSS}</style>
      <div className="sv-mid">
        <div className={'sv-ckwrap' + (ok ? '' : ' plain')}>
          {ok ? (<>
            <div className="sv-ring"></div>
            <div className="sv-ring r2"></div>
            <div className="sv-ck">{TICK}</div>
          </>) : (
            <div className={'sv-ck ' + (unk ? 'sv-amb' : 'sv-red')}>{unk ? QUESTION : EXCLAIM}</div>
          )}
        </div>
        {ok ? (<>
          <div className="sv-qty">+{fmt(qty)}</div>
          <div className="sv-sub">{title}</div>
        </>) : (<>
          <div className="sv-h">{unk ? 'Not sure if saved' : "Couldn't save"}</div>
          <div className="sv-sub">{unk ? (note || 'Internet dropped while saving') : reason}</div>
        </>)}
        <div className="sv-card">
          {(rows || []).map((r, i) => (
            <div className="sv-row" key={i}><span>{r[0]}</span><b style={r[2] ? { color: r[2] } : undefined}>{r[1]}</b></div>
          ))}
        </div>
        {unk ? <div className="sv-box sv-boxa">The entry may have saved before the connection dropped. Check the Report tab first - if {fmt(qty)} is not there, come back and try again. This avoids a double entry.</div> : null}
        {view === 'rejected' ? <div className="sv-box sv-boxr">The server refused this entry, so nothing was added. Your {fmt(qty)} is still filled in - fix it and try again.</div> : null}
      </div>
      <div className="sv-sticky">
        {ok ? <button className="btn" onClick={onClose}>Done</button> : null}
        {unk ? <button className="btn" onClick={() => { onClose(); router.push('/report'); }}>Check Report</button> : null}
        {view === 'rejected' ? <button className="btn" style={{ background: 'var(--red)' }} onClick={onClose}>Try again</button> : null}
      </div>
    </div>
  );
}
