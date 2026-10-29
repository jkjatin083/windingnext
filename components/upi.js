'use client';
// UPI-style confirm sheet: a bottom sheet that asks the contractor to look
// over an entry once before it is written. The result screen is SavedOverlay
// (components/saved.js); this component only handles the "pehle confirm karo"
// step. Nothing is posted from here - the page does that on Confirm.

export function ConfirmSheet({ open, title, sub, hero, rows, okText = 'Confirm & Save', busy, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="upi-mask" onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="upi-sheet">
        <div className="upi-grip" />
        <h3>{title}</h3>
        {sub ? <p className="upi-sub">{sub}</p> : null}
        {hero ? <div className="upi-hero"><div className="upi-big">{hero[0]}</div><div className="upi-cap">{hero[1]}</div></div> : null}
        <div className="upi-rows">
          {rows.map((r, i) => <div className="upi-row" key={i}><span>{r[0]}</span><b>{r[1]}</b></div>)}
        </div>
        <div className="upi-actions">
          <button className="bt" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="bt p" onClick={onConfirm} disabled={busy}>{busy ? 'Saving...' : okText}</button>
        </div>
      </div>
    </div>
  );
}
