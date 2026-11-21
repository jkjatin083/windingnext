import crypto from 'node:crypto';
import { rerateRun } from './wire-rerate.mjs';
import { db, WHO, todayIST } from './core';
import { calculate, syncIssues, recipe, reconcile, allocateReturn, validateSelection, addMade, gaugeOf, lotLedger, nativeSettlement, kg, singleScrapReturn } from './wire-math.mjs';
export const wireEnabled=()=>process.env.WIRE_TRACKING_ENABLED==='true';
export const PEOPLE=['Suman','Dinesh','Ajeet','Siraj','Sunil','Khalender','Anil'];
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
export const digest=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
export async function remote(fn,args={}){
 const url=process.env.WIRELEDGER_SUPABASE_URL,secret=process.env.WIRELEDGER_SERVICE_ROLE_KEY;
 if(!url||!secret)throw Error('Admin must configure the server-only WireLedger connection first');
 if(!/^https:\/\/[^/]+\.supabase\.co\/?$/.test(url))throw Error('Invalid WireLedger Supabase URL');
 let r;try{r=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:secret,...(secret.startsWith('eyJ')?{Authorization:'Bearer '+secret}:{}),'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',signal:AbortSignal.timeout(25000)});}catch(e){const x=Error('WireLedger response is uncertain. Keep this return pending and retry the same send.');x.uncertain=true;throw x;}
 const j=await r.json().catch(()=>null);
 if(!r.ok){const e=Error(j?.message||'WireLedger refused the request');e.definite=r.status>=400&&r.status<500&&![408,429].includes(r.status);if(!e.definite)e.uncertain=true;throw e;}
 if(!j){const e=Error('WireLedger response could not be read; check the pending send.');e.uncertain=true;throw e;}
 return j;
}
export async function snapshot(){return remote('wn_bridge_snapshot');}
export async function rawAccount(name){const r=await db()`SELECT version,body FROM wn_wire_accounts WHERE contractor=${name}`;return r[0]||null;}
export async function commit(name,row,body,actor,action){
 body.available=calculate(body).left;
 const r=await db()`SELECT wn_wire_commit(${name},${row?.version||0},${JSON.stringify(body)}::jsonb,${actor},${action}) AS version`;
 return {version:r[0].version,body};
}
function idFor(s,name){const a=s.contractors.filter(c=>String(c.name).trim().toLowerCase()===name.toLowerCase());if(a.length!==1)throw Error('Admin must resolve the contractor identity in WireLedger');return a[0].id;}
function finishPending(body,result){
 const s=structuredClone(body),p=s.pending,r=s.runs.find(r=>r.id===p.run_id);
 Object.assign(r,p.settlement,{status:'closed',return_ref:p.id,return_id:result.return_id,closed_at:new Date().toISOString()});
 s.events.push({type:'return_sent',at:new Date().toISOString(),reference:p.id,return_id:result.return_id});s.pending=null;return s;
}
export async function refreshWire(name,actor=name){
 if(!wireEnabled())return null;
 let row=await rawAccount(name);if(!row)return null;
 const snap=await snapshot();
 if(row.body.pending){
  const found=snap.sent.find(x=>x.reference===row.body.pending.id);
  if(found)row=await commit(name,row,finishPending(row.body,found),actor,'recover confirmed return');
  else return {...row,snapshot:snap};
 }
 let body=syncIssues(row.body,snap.issues,row.body.contractor_id,snap.linked);
 body.events=body.events||[];
 row=await commit(name,row,body,actor,'refresh live issues');
 return {...row,snapshot:snap};
}
export async function wireView(name){
 let row=await refreshWire(name);let snap=row?.snapshot||await snapshot();const id=row?.body.contractor_id||idFor(snap,name);
 if(!row){let body=syncIssues({contractor_id:id,accepted:{},runs:[],events:[],pending:null,conflicts:[],recipes:{}},snap.issues,id,snap.linked);row=await commit(name,null,body,name,'import unreturned issues');}
 const issues=snap.issues.filter(i=>i.contractor_id===id).map(i=>({...i,lot_number:snap.lots.find(l=>l.id===i.lot_id)?.lot_number||'Unknown lot'}));
 const sql=db();const types=await sql`SELECT name FROM wa_wtypes WHERE hidden=false AND (who='*' OR ${name}=ANY(string_to_array(who,','))) UNION SELECT DISTINCT stype AS name FROM wa_entries WHERE contractor=${name} AND deleted=false AND stype IS NOT NULL UNION SELECT o.stator_type AS name FROM ca_issues i JOIN ca_orders o ON o.id=i.order_id WHERE i.contractor=${name} AND i.closed=false AND o.cancelled=false`;
 const manual_rejected={};for(const r of row.body.runs.filter(r=>r.status==='open'))manual_rejected[r.id]=Number((await db()`SELECT wn_manual_run_rejected(${name},${r.id}) AS qty`)[0].qty);
 return {name,version:row.version,account:row.body,manual_rejected,issues,types:types.map(t=>t.name).filter(Boolean),contractor_id:id};
}
// Full history read, not the Admin list endpoint's 600-row window.
async function untrackedMade(name,stype,s){
 const rows=await db()`SELECT id,qty::float AS qty,to_char(d,'YYYY-MM-DD') AS d,note FROM wa_entries WHERE contractor=${name} AND stype=${stype} AND kind='wound' AND deleted=false ORDER BY d,id`;
 const seen=new Set(s.runs.flatMap(r=>r.entries.map(e=>String(e.id))));return rows.filter(e=>!seen.has(String(e.id)));
}
function historyItem(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en-IN');}
function historyPlan(s,snap,rows,rates,stype,includeIds=[],checked=false){
 const included=[],flagged=[],reviewed=[];const selected=new Set((Array.isArray(includeIds)?includeIds:[]).map(String));
 if(selected.size!==(includeIds||[]).length)throw Error('Choose each source entry once');
 const seen=new Set(s.runs.flatMap(r=>r.entries.map(e=>String(e.id))));
 for(const id of selected)if(seen.has(id)||!rows.some(e=>String(e.id)===id))throw Error('Selected Made is already tracked or no longer eligible. Reload.');
 for(const e of rows){
  let reason='',opening=/opening/i.test(e.note||''),candidates=[];
  if(opening)reason='Opening stock, not new production';
  else {candidates=(snap.legacy_returns||[]).filter(r=>r.contractor_id===s.contractor_id&&(!historyItem(r.stator_item_name)||historyItem(r.stator_item_name)===historyItem(stype))&&r.return_date>=e.d&&(r.wires||[]).some(w=>{try{return gaugeOf({...w,id:r.id}) in rates;}catch{return true;}}));
   if(candidates.length)reason='Possibly included in an earlier WireLedger return: '+candidates.map(r=>(r.stator_item_name||'Unnamed item, identity needs review')+' ('+r.return_date+')').join(', ');
  }
  if(selected.has(String(e.id))){
   if(opening)throw Error('Opening stock cannot be added as new wire-consuming production');
   if(!reason)throw Error('Selected Made no longer needs an override. Reload the preview.');
   if(!checked)throw Error('Confirm these exact Made entries were not counted in the listed WireLedger returns');
   const decision={...e,reason,return_candidates:candidates,reviewed_include:true};included.push(decision);reviewed.push(decision);
  }else if(reason)flagged.push({...e,reason,opening,return_candidates:candidates});else included.push(e);
 }
 return {included,flagged,reviewed,qty:included.reduce((n,e)=>n+Number(e.qty),0)};
}
export async function command(name,b,actor){
 if(actor!=='ADMIN'&&actor!==name)throw Error('You can only change your own wire account');
 const raw=await rawAccount(name);if(!raw)throw Error('Open My wire to load your account first');
 if(Number(b.version)!==Number(raw.version))throw Error('Wire account changed. Reload before continuing.');
 let row=await refreshWire(name,actor),s=structuredClone(row.body);
 if(b.action==='retry')return sendPending(name,row,actor);
 if(s.pending)throw Error('A return is pending. Retry its confirmation first.');
 if(s.conflicts.length)throw Error(s.conflicts.join(' / '));
 if(['start','start_preview'].includes(b.action)){
  const stype=String(b.stype||'').trim();if(!stype||stype.length>60)throw Error('Choose a winding type');
  // Only use winding types the contractor can already see in the app.
  const sql=db();const known=await sql`SELECT name FROM wa_wtypes WHERE hidden=false AND name=${stype} AND (who='*' OR ${name}=ANY(string_to_array(who,','))) UNION SELECT stype AS name FROM wa_entries WHERE contractor=${name} AND stype=${stype} AND deleted=false UNION SELECT o.stator_type AS name FROM ca_issues i JOIN ca_orders o ON o.id=i.order_id WHERE i.contractor=${name} AND o.stator_type=${stype} AND i.closed=false AND o.cancelled=false`;
  if(!known.length)throw Error('This winding type is not assigned to your account');
  if(s.recipes?.[stype])throw Error('Recipe already activated. New lots and new Made use the saved recipe automatically; use Runs to edit it.');
  const rates=recipe(b.rows),issue_ids=validateSelection(s,b.issue_ids,rates);
  const historical=await untrackedMade(name,stype,s),plan=historyPlan(s,row.snapshot,historical,rates,stype,b.include_entry_ids||[],b.include_checked===true);
  const candidate=structuredClone(s),runId='preview';candidate.runs.push({id:runId,stype,recipe:rates,issue_ids,entries:[],status:'open',started_at:new Date().toISOString(),excluded_history:plan.flagged,reviewed_included:plan.reviewed});
  for(const e of plan.included)addMade(candidate,runId,{...e,historical:true});
  const selectedBefore={},selectedAfter={},beforeLots=lotLedger(s),afterLots=lotLedger(candidate);for(const id of issue_ids){const k=s.accepted[id].key;selectedBefore[k]=(selectedBefore[k]||0)+beforeLots[id].left;selectedAfter[k]=(selectedAfter[k]||0)+afterLots[id].left;}
  const preview={selected_before:selectedBefore,selected_after:selectedAfter,qty:plan.qty,entries:plan.included,flagged:plan.flagged,reviewed:plan.reviewed,used:Object.fromEntries(Object.entries(rates).map(([k,v])=>[k,plan.qty*v])),before:calculate(s).left,after:calculate(candidate).left,lots:lotLedger(candidate)};
  const token=digest({historical,plan,rates,issue_ids,accepted:s.accepted,runs:s.runs});
  if(b.action==='start_preview')return {activation:preview,token,version:row.version};
  if(!b.token||token!==b.token)throw Error('Made, rates or source changed. Review activation again.');
  if(plan.flagged.length&&!b.exclude_flagged)throw Error('Flagged historical entries need review. Explicitly exclude them or cancel activation.');
  candidate.runs[candidate.runs.length-1].id=crypto.randomUUID();candidate.recipes=candidate.recipes||{};candidate.recipes[stype]={recipe:rates,issue_ids,activated_at:new Date().toISOString()};
  candidate.events.push({at:new Date().toISOString(),type:'activate_recipe',historical_entries:plan.included.map(e=>e.id),excluded_history:plan.flagged,reviewed_included:plan.reviewed,actor});
  candidate.available=calculate(candidate).left;
  const result=await db()`SELECT wn_wire_activate(${name},${row.version},${stype},${JSON.stringify(historical)}::jsonb,${JSON.stringify(candidate)}::jsonb,${actor}) AS version`;
  return {ok:true,version:result[0].version};

 }else if(b.action==='resume'){
  const t=s.recipes?.[b.stype];if(!t)throw Error('Set the initial recipe first');if(s.runs.some(r=>r.stype===b.stype&&r.status==='open'))throw Error('Run already open');
  s.runs.push({id:crypto.randomUUID(),stype:b.stype,recipe:structuredClone(t.recipe),issue_ids:[...t.issue_ids],entries:[],status:'open',started_at:new Date().toISOString()});
 }else if(['recipe','recipe_preview'].includes(b.action)){
  const plan=rerateRun(s,b.run_id,b.rows,b.issue_ids);
  const token=digest({run_id:b.run_id,rates:plan.rates,issue_ids:plan.issue_ids,accepted:s.accepted,runs:s.runs,recipes:s.recipes});
  if(b.action==='recipe_preview')return {recipe_preview:plan.preview,token:plan.preview.can_apply?token:null,version:row.version};
  if(!b.token||b.token!==token)throw Error('Made, recipe or wire lots changed. Preview the recipe again.');
  if(!plan.preview.can_apply)throw Error('Not enough selected wire. Add or select matching lots, then preview again.');
  s=plan.body;
  s.events.push({at:new Date().toISOString(),type:'recipe_rerate_all',run:b.run_id,rates:plan.rates,qty:plan.preview.qty,gauges:plan.preview.gauges,actor});
 }else if(b.action==='exclude_entry'||b.action==='include_entry'){
  if(actor!=='ADMIN')throw Error('Only Admin can change which Made entries count for wire');
  const r=s.runs.find(r=>r.id===b.run_id&&r.status==='open');if(!r)throw Error('Run not open');
  const eid=String(b.entry_id??'').trim();if(!eid)throw Error('Choose a Made entry');
  r.excluded_history=Array.isArray(r.excluded_history)?r.excluded_history:[];
  if(b.action==='exclude_entry'){
   const i=r.entries.findIndex(e=>String(e.id)===eid);if(i<0)throw Error('That Made entry is not in this run. Reload.');
   const e=r.entries[i];
   r.entries.splice(i,1);
   r.excluded_history.push({id:e.id,qty:e.qty,d:e.d,note:e.note||'',rates:e.rates,reason:String(b.reason||'Excluded by Admin').slice(0,200),excluded_at:new Date().toISOString(),excluded_by:actor});
   s.events.push({at:new Date().toISOString(),type:'exclude_entry',run:r.id,stype:r.stype,entry:e.id,qty:e.qty,actor});
  }else{
   const i=r.excluded_history.findIndex(e=>String(e.id)===eid);if(i<0)throw Error('That Made entry is not excluded in this run. Reload.');
   const x=r.excluded_history[i];
   if(/opening/i.test(x.reason||''))throw Error('Opening stock cannot be added as new wire-consuming production');
   const row=(await db()`SELECT id,qty::float AS qty,to_char(d,'YYYY-MM-DD') AS d,note FROM wa_entries WHERE id=${Number(eid)} AND contractor=${name} AND kind='wound' AND deleted=false`)[0];
   if(!row)throw Error('The original Made entry no longer exists or is deleted');
   r.excluded_history.splice(i,1);
   addMade(s,r.id,{...row});
   s.events.push({at:new Date().toISOString(),type:'include_entry',run:r.id,stype:r.stype,entry:row.id,qty:row.qty,actor});
  }
 }else if(['preview','send'].includes(b.action)){
  const r=s.runs.find(r=>r.id===b.run_id&&r.status==='open');if(!r)throw Error('Only an open run can record return');const override=b.override?recipe(b.override):null;
  if(Object.values(b.fields||{}).some(f=>Number(f.rejection||0)!==0))throw Error('Save returned unused wire as leftover. Classify stock or rejection later in WireLedger.');
  const rejectedQty=Number(b.rejected_qty||0);if(!Number.isSafeInteger(rejectedQty)||rejectedQty<0)throw Error('Rejected stators must be a non-negative whole number');
  const alreadyRejected=Number((await db()`SELECT wn_manual_run_rejected(${name},${r.id}) AS qty`)[0].qty);
  const grossQty=r.entries.filter(e=>!e.deleted).reduce((n,e)=>n+Number(e.qty),0);if(rejectedQty+alreadyRejected>=grossQty)throw Error('At least one good stator is required by the existing WireLedger return. All-rejected runs need Admin review.');
  const planResult=await db()`SELECT wn_rejection_plan(${name},${b.run_id},${rejectedQty}) AS plan`;const rejectionPlan=planResult[0].plan;
  const result=singleScrapReturn(s,b.run_id,b.fields,rejectedQty,override,rejectionPlan,alreadyRejected);
  result.rejection_plan=rejectionPlan;
  if(rejectedQty>0&&b.scrap_checked!==true)throw Error('Check the Scrap estimate against the weighed wire before confirming');
  const sourceIds=[...new Set(r.issue_ids)];
  const payload={qty:result.good_qty,gross_qty:grossQty,rejected_qty:rejectedQty,already_rejected_qty:alreadyRejected,rejection_plan:rejectionPlan,gross_used:result.original_used,date:todayIST(),stator_item:r.stype,fields:result.fields,settlement_mode:result.settlement_mode,allocations:result.allocations,final_used:result.final_used,difference:result.difference,kept:result.kept,expected_issues:sourceIds.map(id=>row.snapshot.issues.find(i=>i.id===id))};
  const token=digest({payload,run:r.entries,available:calculate(s).left});
  if(b.action==='preview')return {preview:result,token,version:row.version};
  if(!b.token||b.token!==token)throw Error('Return or stock changed. Preview it again before sending.');
  const id=crypto.randomUUID();s.pending={id,run_id:r.id,payload,settlement:result,created_at:new Date().toISOString()};
  row=await commit(name,row,s,actor,'freeze return before sending');return sendPending(name,row,actor);
 }else throw Error('Unknown wire action');
 row=await commit(name,row,s,actor,b.action);return {ok:true,version:row.version};
}
async function sendPending(name,row,actor){
 const p=row.body.pending;if(p&&p.settlement?.settlement_mode!=='calculated_carry')throw Error('An earlier return is pending. Check its WireLedger confirmation before continuing; do not send a new return.');if(!p)return {ok:true,note:'No pending return'};
 let result;try{result=await remote('wn_bridge_send',{p_reference:p.id,p_contractor:row.body.contractor_id,p_payload:p.payload});}
 catch(e){
  if(e.definite){const s=structuredClone(row.body);s.events.push({at:new Date().toISOString(),type:'return_refused',reference:p.id,reason:e.message});s.pending=null;await commit(name,row,s,actor,'return refused, nothing committed remotely');}
  throw e;
 }
 if(result.ok!==true||result.reference!==p.id)throw Error('Return confirmation incomplete. Retry the pending send.');
 await commit(name,row,finishPending(row.body,result),actor,'confirmed WireLedger return');
 return {ok:true,return_id:result.return_id,reference:p.id};
}
