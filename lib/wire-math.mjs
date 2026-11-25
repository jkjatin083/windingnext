// Integer milligrams. Database trigger uses the same FIFO lot allocation rules.
export function fixed(value, places, label='Quantity') {
 const s=String(value??'').trim();if(!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(s))throw Error(`${label}: use a non-negative number with at most ${places} decimals`);
 const[a,b='']=s.split('.'),n=Number(a)*10**places+Number(b.padEnd(places,'0'));if(!Number.isSafeInteger(n)||n>1e13)throw Error(label+' is too large');return n;
}
export const kg=v=>fixed(v,6,'kg');export const grams=v=>fixed(v,3,'grams per stator');export const fmtKg=v=>(Number(v)/1e6).toFixed(Number(v)%1000?6:3);
export function key(metal,gauge){if(!['aluminium','copper'].includes(metal))throw Error('Choose aluminium or copper');const g=String(gauge||'').trim();if(!/^\d{1,2}$/.test(g))throw Error('Use a numeric gauge');return metal+'|'+Number(g);}
export function gaugeOf(i){const m=String(i.gauge_swg||'').trim().match(/^(\d{1,2})(?:\s*\(leftover\))?$/i);if(!m)throw Error('Unmapped issue gauge: '+i.id);return key(i.material_type,m[1]);}
export function recipe(rows){if(!Array.isArray(rows)||!rows.length||rows.length>8)throw Error('Add 1 to 8 wire rows');const o={};for(const r of rows){const k=key(r.metal,r.gauge),v=grams(r.grams);if(!v)throw Error('Grams must be above zero');o[k]=(o[k]||0)+v;}return o;}
export function sumMaps(...maps){const o={};for(const m of maps)for(const[k,v]of Object.entries(m||{}))o[k]=(o[k]||0)+Number(v);return o;}
export const minus=(a,b)=>sumMaps(a,Object.fromEntries(Object.entries(b||{}).map(([k,v])=>[k,-v])));
export function consumed(es){let o={};for(const e of es||[])if(!e.deleted){for(const[k,v]of Object.entries(e.rates)){const n=Number(e.qty)*v;if(!Number.isSafeInteger(n))throw Error('Consumption overflow');o[k]=(o[k]||0)+n;}}return o;}
export function finalUse(r,rates){if(!rates)return consumed(r.entries);const q=r.entries.filter(e=>!e.deleted).reduce((n,e)=>n+Number(e.qty),0);return Object.fromEntries(Object.entries(rates).map(([k,v])=>[k,q*v]));}
export function lotLedger(s){const o={};for(const[id,i]of Object.entries(s.accepted||{}))o[id]={...i,used:0,physical:0,difference:0,left:i.mg};for(const r of s.runs||[]){const as=r.status==='closed'?r.allocations:r.entries.filter(e=>!e.deleted).flatMap(e=>e.allocations||[]);for(const a of as||[]){if(!o[a.issue_id])throw Error('Wire source missing from history');const p=o[a.issue_id];p.left-=a.mg;if(a.kind==='consumed')p.used+=a.mg;else if(a.kind==='difference')p.difference+=a.mg;else p.physical+=a.mg;}}return o;}
export function calculate(s){const credit={},used={},returned={},variance={},left={};for(const p of Object.values(lotLedger(s))){const k=p.key;credit[k]=(credit[k]||0)+p.mg;used[k]=(used[k]||0)+p.used;returned[k]=(returned[k]||0)+p.physical;variance[k]=(variance[k]||0)+p.difference;left[k]=(left[k]||0)+p.left;}return{credit,used,returned,variance,left};}
export function ordered(s,ids){return [...new Set(ids)].sort((a,b)=>{const x=s.accepted[a],y=s.accepted[b];if(!x||!y)throw Error('Issue not in account');return String(x.source.issue_date).localeCompare(String(y.source.issue_date))||String(x.source.created_at).localeCompare(String(y.source.created_at))||a.localeCompare(b);});}
export function validateSelection(s,ids,rates){if(!Array.isArray(ids)||!ids.length)throw Error('Select issued lots');const a=ordered(s,ids),ks=Object.keys(rates).sort();if(a.some(id=>!ks.includes(s.accepted[id].key))||ks.some(k=>!a.some(id=>s.accepted[id].key===k)))throw Error('Selected lots must match every recipe gauge and metal');return a;}
export function take(s,ids,needs,kind='consumed',available=null){const pools=available||Object.fromEntries(Object.entries(lotLedger(s)).map(([id,p])=>[id,p.left])),out=[];for(const[k,v]of Object.entries(needs)){let rest=v;if(!Number.isSafeInteger(rest)||rest<0)throw Error('Invalid wire amount');for(const id of ordered(s,ids)){if(s.accepted[id].key!==k)continue;const n=Math.min(Math.max(0,pools[id]||0),rest);if(n){out.push({issue_id:id,key:k,kind,mg:n});pools[id]-=n;rest-=n;}}if(rest)throw Error('Not enough selected wire for '+k);}return out;}
export function addMade(s,runId,e){if(!Number.isSafeInteger(Number(e.qty))||Number(e.qty)<0)throw Error('Made must be a whole non-negative stator count');const r=s.runs.find(r=>r.id===runId&&r.status==='open');if(!r)throw Error('Run not open');if(s.runs.some(r=>r.entries.some(x=>String(x.id)===String(e.id))))throw Error('Made already tracked');const rates={...r.recipe};const allocations=take(s,r.issue_ids,Object.fromEntries(Object.entries(rates).map(([k,v])=>[k,e.qty*v])));r.entries.push({...e,rates,allocations});return s;}
export function fingerprint(i){return JSON.stringify([i.contractor_id,i.lot_id,i.material_type,i.gauge_swg,String(i.issued_weight_kg),i.issue_date,i.no_of_boxes]);}
export function syncIssues(state,issues,contractorId,linked=[]){const s=structuredClone(state),all=new Map(issues.map(i=>[i.id,i])),returned=new Set(linked),now=new Date().toISOString();s.conflicts=[];s.recipes=s.recipes||{};const ledger=lotLedger(s);for(const[id,p]of Object.entries(s.accepted||{})){const i=all.get(id);if(!i||i.contractor_id!==contractorId){s.conflicts.push('Issue deleted or reassigned: '+id);continue;}let k;try{k=gaugeOf(i);}catch(e){s.conflicts.push(e.message);continue;}if(k!==p.key){s.conflicts.push('Issue gauge/metal changed: '+id);continue;}if(returned.has(id)){s.conflicts.push('An imported issue was included in a separate WireLedger return: '+id);continue;}if(p.fingerprint!==fingerprint(i)){s.events.push({at:now,type:'source_edit',issue:id,previous:p.source,next:i});s.accepted[id]={...p,mg:kg(i.issued_weight_kg),source:i,fingerprint:fingerprint(i)};}}
 for(const i of issues){if(i.contractor_id!==contractorId||returned.has(i.id)||s.accepted[i.id])continue;try{const k=gaugeOf(i),mg=kg(i.issued_weight_kg);if(mg>0){s.accepted[i.id]={key:k,mg,source:i,fingerprint:fingerprint(i),imported_at:now};for(const t of Object.values(s.recipes))if(k in t.recipe&&!t.issue_ids.includes(i.id))t.issue_ids.push(i.id);for(const r of s.runs)if(r.status==='open'&&k in r.recipe&&!r.issue_ids.includes(i.id))r.issue_ids.push(i.id);}}catch(e){s.conflicts.push(e.message);}}
 for(const[id,p]of Object.entries(lotLedger(s)))if(p.left<0)s.conflicts.push('Issue reduced below its used/settled amount: '+id+' ('+fmtKg(p.left)+' kg)');s.checked_at=now;return s;}
export function reconcile(s,runId,fields,override=null){const r=s.runs.find(r=>r.id===runId&&r.status==='open');if(!r)throw Error('Run not open');if(!r.entries.some(e=>!e.deleted&&e.qty>0))throw Error('No Made in this run');const estimated=consumed(r.entries),fin=finalUse(r,override);if(Object.keys(fin).sort().join()!==Object.keys(estimated).sort().join())throw Error('Keep the same gauges/metals at final return');if(Object.keys(fields||{}).sort().join()!==Object.keys(fin).sort().join())throw Error('Return fields must match the recipe gauges');const adjustment=minus(fin,estimated),ledger=lotLedger(s),bal={},physical={},kept={},difference={},normalized={};for(const id of r.issue_ids){const p=ledger[id];bal[p.key]=(bal[p.key]||0)+p.left;}for(const k of Object.keys(fin)){const f=fields[k];if(!f)throw Error('Fill all return categories');if(kg(f.rejection||'0')!==0)throw Error('Classify rejection later in WireLedger');physical[k]=kg(f.leftover)+kg(f.scrap);kept[k]=(bal[k]||0)-(adjustment[k]||0)-physical[k];if(kept[k]<0)throw Error('Returned wire and final use exceed the available selected wire for '+k);difference[k]=kept[k];kept[k]=0;const dismantled=kg(f.dismantled||'0');if(dismantled>fin[k])throw Error('Dismantled scrap exceeds gross consumption for '+k);normalized[k]={leftover:f.leftover,scrap:f.scrap,dismantled:String(dismantled/1e6),rejection:'0',kept:String(kept[k]/1000000)};}return{estimated,final_used:fin,adjustment,physical,kept,difference,fields:normalized,settlement_mode:'difference_writeoff',difference_measured:false};}
export function allocateReturn(s,result,runId){
 const r=s.runs.find(r=>r.id===runId),copy=structuredClone(s);copy.runs=copy.runs.filter(x=>x.id!==runId);
 const pools=Object.fromEntries(Object.entries(lotLedger(copy)).map(([id,p])=>[id,p.left])),out=[];
 // A negative difference is an explicit excess credit, allocated before physical returns.
 for(const[k,d]of Object.entries(result.difference))if(d<0){const id=ordered(s,r.issue_ids).find(id=>s.accepted[id].key===k);out.push({issue_id:id,key:k,kind:'difference',mg:d});pools[id]-=d;}
 out.push(...take(s,r.issue_ids,result.final_used,'consumed',pools));
 for(const k of Object.keys(result.final_used)){const f=result.fields[k];for(const kind of ['leftover','rejection','scrap'])out.push(...take(s,r.issue_ids,{[k]:kg(f[kind])},kind,pools));if(result.difference[k]>=0)out.push(...take(s,r.issue_ids,{[k]:result.difference[k]},'difference',pools));}
 return out;
}

// Native WireLedger treats consumed and scrap as disjoint. Local history does not.
export function nativeSettlement(result){
 const out=structuredClone(result),net={},fields={},allocations=[];
 for(const [k,v] of Object.entries(result.final_used)){
  let remain=kg(result.fields[k].dismantled||'0');net[k]=v-remain;
  fields[k]={...result.fields[k],scrap:String((kg(result.fields[k].scrap)+remain)/1e6)};
  for(const a of result.allocations.filter(a=>a.key===k)){
   if(a.kind==='consumed'){const n=Math.min(remain,a.mg);if(a.mg-n)allocations.push({...a,mg:a.mg-n});if(n)allocations.push({...a,kind:'scrap',mg:n,from_consumed:true});remain-=n;}
   else allocations.push({...a});
  }
  if(remain)throw Error('Dismantled scrap has no consumed source allocation');
 }
 return {final_used:net,fields,allocations};
}

// One editable total Scrap field. The rejected portion reclassifies already-used
// wire; any amount above its recipe estimate is additional loose-wire scrap.
export function singleScrapReturn(s,runId,fields,rejectedQty,override=null,plan=null,alreadyRejected=0){
 const r=s.runs.find(r=>r.id===runId&&r.status==='open');if(!r)throw Error('Run not open');
 const q=r.entries.filter(e=>!e.deleted).reduce((n,e)=>n+Number(e.qty),0),rq=Number(rejectedQty||0),prior=Number(alreadyRejected||0);
 if(!Number.isSafeInteger(prior)||prior<0||!Number.isSafeInteger(rq)||rq<0||rq+prior>=q)throw Error('Rejected count must leave at least one good stator');
 const original=finalUse(r,override),caps={};
 if(plan){for(const p of plan.filter(p=>p.kind==='wound')){const e=r.entries.find(e=>String(e.id)===String(p.entry_id));for(const k of Object.keys(original))caps[k]=(caps[k]||0)+Number(p.qty)*(override?.[k]??e?.rates[k]??0);}}
 else for(const[k,v]of Object.entries(original))caps[k]=Math.round(v*rq/q);
 const normalized={},included={},net={};
 for(const[k,v]of Object.entries(original)){const f=fields[k];if(!f)throw Error('Fill all Scrap and Leftover fields');const total=kg(f.scrap);included[k]=Math.min(total,caps[k]||0);net[k]=v-included[k];normalized[k]={leftover:f.leftover,scrap:String((total-included[k])/1e6),rejection:'0',dismantled:String(included[k]/1e6)};}
 const result=reconcile(s,runId,normalized,override);result.allocations=allocateReturn(s,result,runId);
 const native=nativeSettlement(result);
 return {...result,final_used:native.final_used,fields:Object.fromEntries(Object.entries(native.fields).map(([k,f])=>[k,{...f,dismantled:String(included[k]/1e6)}])),allocations:native.allocations,original_used:original,scrap_estimate:caps,dismantled_used:included,display_mode:'wireledger_fields_v1',gross_qty:q,rejected_qty:rq,already_rejected_qty:prior,good_qty:q-rq-prior};
}
