'use client';
import {useState,useEffect} from 'react';
import {useApi,postJson,clearApiCache} from './store';
import {fmt,dm,todayIST} from './motor';
const red={color:'var(--red)'};
function Effect({label,before,after}){return <div style={{display:'flex',justifyContent:'space-between',gap:12,padding:'6px 0',fontSize:13}}><span>{label}</span><b style={{textAlign:'right',...(before!==after?red:{})}}>{fmt(before)} → {fmt(after)}</b></div>}
export default function Rejections({admin=false,showAdd=true,from='',to='',who='',stype=''}){
 const {data,err,reload}=useApi('/api/rejections');
 const [open,setOpen]=useState(false),[form,setForm]=useState({contractor:'',stype:'',qty:'',d:todayIST(),reason:''}),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false),[reverse,setReverse]=useState(null),[why,setWhy]=useState('');
 function begin(){setForm({contractor:'',stype:'',qty:'',d:todayIST(),reason:''});setPreview(null);setError('');setUncertain(false);setOpen(true)}
 useEffect(()=>{if(!admin)return;window.addEventListener('open-rejection',begin);return()=>window.removeEventListener('open-rejection',begin)},[admin]);
 const change=v=>{setForm(f=>({...f,...v}));setPreview(null);setError('')};
 const rows=(data?.rows||[]).filter(r=>(!from||r.d>=from)&&(!to||r.d<=to)&&(!who||r.contractor===who||r.recipient===who)&&(!stype||r.stype===stype));
 async function act(action){
  setBusy(true);setError('');
  try{
   const j=await postJson('/api/rejections',action==='reverse'?{action,reference:reverse.reference,reason:why}:{action,...form,...(action==='save'?preview:{})});
   if(action==='preview'){setPreview(j);setUncertain(false)}
   else{clearApiCache();await reload();window.dispatchEvent(new Event('focus'));setNotice(action==='reverse'||j?.status==='cancelled'?'Rejection reversed. Both stator accounts restored.':'Rejection saved. Both stator accounts updated. Check WhatsApp alerts for delivery status.');setOpen(false);setPreview(null);setReverse(null);setUncertain(false)}
  }catch(e){setError(e.message+(e.unknown?' Outcome uncertain. Retry the same action with the same reference; do not add another entry.':''));if(e.unknown&&action!=='preview')setUncertain(true);else if(action==='save'){setUncertain(false);setPreview(null)}}finally{setBusy(false)}
 }
 const p=preview?.preview;
 return <>
 {admin&&showAdd&&<button className="btn s" style={{marginBottom:12}} onClick={()=>{setForm({contractor:'',stype:'',qty:'',d:todayIST(),reason:''});setPreview(null);setError('');setUncertain(false);setOpen(true)}}>+ Add rejection</button>}
 {notice&&<div className="good">{notice}</div>}
 {err&&<div className="card" role="alert" style={red}>Rejection history unavailable: {err}</div>}
 {data&&<div className="card"><div className="lab" style={red}>Rejections · {fmt(rows.filter(r=>r.status==='confirmed').reduce((n,r)=>n+Number(r.qty),0))} pcs</div>
 {!rows.length&&<p className="note">No rejections in this view.</p>}
 {rows.map(r=><div key={r.reference} style={{padding:'12px 0',borderTop:'1px solid var(--line)'}}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,...red}}><b>{dm(r.d)} · {r.status==='cancelled'?'Rejection reversed':'Rejection'}</b><b>{r.status==='cancelled'?'Restored ':'−'}{fmt(r.qty)} pcs</b></div>
 <p style={{fontSize:13,...red,marginTop:6}}>{r.contractor} · {r.stype}</p><p style={{fontSize:13,...red,marginTop:6}}>Comment: {r.reason}</p>
 <p className="note">At {r.recipient}. {r.origin==='admin'?'Added by Admin':'Final Record Return'}. {r.status==='cancelled'?'Both accounts restored. Comment: '+r.reversal_reason:'Good Made and accepted Give reduced together; contractor-held stock unchanged.'}</p>
 <small style={{display:'block',fontSize:11,color:'var(--mute)',overflowWrap:'anywhere'}}>Reference: {r.reference}</small>
 {admin&&r.origin==='admin'&&r.status==='confirmed'&&<button className="lnk" style={{marginTop:8}} onClick={()=>{setReverse(r);setWhy('');setError('');setUncertain(false)}}>Reverse with comment</button>}
 </div>)}
 <p className="note">Each rejection counts once. Net source totals are restated on the original Made/Give dates; rejection history uses the rejection date. No extra subtraction from these net totals.</p></div>}
 {(open||reverse)&&<div className="ov" role="dialog" aria-modal="true" aria-label={reverse?'Reverse rejection':'Add rejection'}><div className="sheet" style={{maxHeight:'92dvh',overflowY:'auto'}}>
 {reverse?<><h3>Reverse this rejection?</h3><p className="note">{reverse.contractor} · {reverse.stype} · {fmt(reverse.qty)} pcs</p><p className="note">Restore both stator accounts. Contractor-held stock and wire kg stay unchanged. Blocked if a later final wire return already used this rejection.</p><label className="l">Reversal comment</label><textarea style={{width:'100%',minHeight:70,border:'1px solid var(--line)',borderRadius:12,padding:12,font:'inherit',fontSize:14}} className="f" disabled={busy||uncertain} maxLength={300} value={why} onChange={e=>setWhy(e.target.value)}/></>:p?<><h3>Reject {fmt(p.qty)} {p.contractor} stators?</h3><p className="note">{p.stype} · at Pandey ji · {dm(p.d)}</p>
 <div className="lab" style={{marginTop:12}}>Contractor account</div><Effect label="Good Made" before={p.made_before} after={p.made_after}/><Effect label="Accepted Give" before={p.given_before} after={p.given_after}/><Effect label="Still held by contractor" before={p.held_before} after={p.held_after}/>
 <div className="lab" style={{marginTop:16}}>Pandey ji · from {p.contractor}</div><Effect label="Accepted received" before={p.received_before} after={p.received_after}/><Effect label="Already used for motors" before={p.motors} after={p.motors}/><Effect label="Available stators" before={p.available_before} after={p.available_after}/><p style={{fontSize:13,marginTop:12,...red}}>Comment: {form.reason}</p>
 <p className="note">One rejection, both accounts. Original entries stay in history. Wire kg and stamping unchanged. No rupee deduction calculated. WhatsApp alerts go to the contractor and Pandey ji under existing alert settings.</p></>:<><h3>Add entry · Rejection</h3><p className="note">Admin only. Reject stators received by Pandey ji but not yet assembled.</p>
 <label className="l">Contractor</label><select className="sel" value={form.contractor} onChange={e=>change({contractor:e.target.value,stype:''})}><option value="">Choose contractor</option>{[...new Set((data?.pick||[]).map(x=>x.contractor))].map(c=><option key={c}>{c}</option>)}</select>
 <label className="l">Stator item</label><select className="sel" value={form.stype} onChange={e=>change({stype:e.target.value})}><option value="">Choose item</option>{(data?.pick||[]).filter(x=>x.contractor===form.contractor).map(x=><option key={x.stype} value={x.stype}>{x.stype} · {fmt(x.available)} at Pandey ji</option>)}</select>
 <p className="note">Preview checks matching source/order and rejection date. Already rejected, assembled or unmatched stock is unavailable.</p>
 <label className="l">Rejected quantity</label><input className="f" aria-label="Rejected quantity" type="number" min="1" step="1" value={form.qty} onChange={e=>change({qty:e.target.value})}/>
 <label className="l">Date</label><input className="f" type="date" min="2026-10-01" max={todayIST()} value={form.d} onChange={e=>change({d:e.target.value})}/>
 <label className="l">Comment</label><textarea style={{width:'100%',minHeight:70,border:'1px solid var(--line)',borderRadius:12,padding:12,font:'inherit',fontSize:14}} className="f" aria-label="Rejection comment" maxLength={300} value={form.reason} onChange={e=>change({reason:e.target.value})}/></>}
 {error&&<p role="alert" style={{...red,fontSize:13,margin:'12px 0'}}>{error}</p>}
 <button className="btn" disabled={busy} style={{marginTop:12,background:p||reverse?'var(--red)':'var(--a)'}} onClick={()=>act(reverse?'reverse':p?'save':'preview')}>{busy?'Checking...':uncertain?'Retry same action':reverse?'Confirm reversal':p?'Add rejection':'Preview rejection'}</button>
 {!uncertain&&<button className="lnk" disabled={busy} style={{display:'block',margin:'12px auto 0'}} onClick={()=>{if(preview)setPreview(null);else{setOpen(false);setReverse(null)}setError('')}}>{p?'Back':'Cancel'}</button>}
 </div></div>}
 </>;
}
