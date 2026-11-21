import { recipe, validateSelection, consumed, lotLedger, take, ordered } from './wire-math.mjs';

// Plan on a copy. Reductions go back to their original lots, then increases
// draw FIFO from selected lots. Other runs and unaffected allocations stay put.
export function rerateRun(state, runId, rows, selectedIds) {
 const body=structuredClone(state),run=body.runs.find(r=>r.id===runId&&r.status==='open');
 if(!run)throw Error('Run not open');
 const rates=recipe(rows),entries=run.entries.filter(e=>!e.deleted);
 if(entries.length&&Object.keys(run.recipe).sort().join()!==Object.keys(rates).sort().join())throw Error('After Made exists, keep the same gauges/metals. Finish this run before changing wire types.');
 const ids=validateSelection(body,selectedIds,rates);
 if(run.entries.length&&run.issue_ids.some(id=>!ids.includes(id)))throw Error('Keep previously selected lots after Made exists; add more lots if needed');
 const beforeLots=lotLedger(state),beforeUsed=consumed(entries),needs=[];
 const qty=entries.reduce((n,e)=>n+Number(e.qty),0);
 if(!Number.isSafeInteger(qty)||qty<0)throw Error('Invalid Made quantity');
 for(const entry of entries){
  const old=consumed([entry]);
  // A corrupt or incomplete allocation must not become a silent stock credit.
  const allocated={};for(const a of entry.allocations||[]){
   if(a.kind!=='consumed'||!Number.isSafeInteger(a.mg)||a.mg<0||body.accepted[a.issue_id]?.key!==a.key||!ids.includes(a.issue_id))throw Error('Made wire allocations need Admin review before changing this recipe');
   allocated[a.key]=(allocated[a.key]||0)+a.mg;
  }
  for(const k of new Set([...Object.keys(old),...Object.keys(allocated)]))if((old[k]||0)!==(allocated[k]||0))throw Error('Made wire allocations do not match its saved grams. Ask Admin to review.');
  const extra={};
  for(const k of new Set([...Object.keys(old),...Object.keys(rates)])){
   const target=Number(entry.qty)*(rates[k]||0);if(!Number.isSafeInteger(target)||target<0)throw Error('Consumption overflow');
   let release=(old[k]||0)-target;
   if(release>0){
    // Release newest source allocations first; keep older FIFO allocations.
    for(const id of ordered(body,ids).reverse())for(let i=(entry.allocations||[]).length-1;i>=0&&release>0;i--){const a=entry.allocations[i];if(a.key!==k||a.issue_id!==id)continue;const n=Math.min(a.mg,release);a.mg-=n;release-=n;}
    if(release)throw Error('Could not return wire to its original lots');
   }else if(release<0)extra[k]=-release;
  }
  entry.allocations=(entry.allocations||[]).filter(a=>a.mg>0);needs.push({entry,extra});
 }
 const releasedLots=lotLedger(body),pools=Object.fromEntries(Object.entries(releasedLots).map(([id,p])=>[id,p.left]));
 const gauges=Object.keys(rates).map(k=>{
  const before=ids.filter(id=>body.accepted[id].key===k).reduce((n,id)=>n+beforeLots[id].left,0);
  const afterUsed=qty*rates[k];if(!Number.isSafeInteger(afterUsed))throw Error('Consumption overflow');
  const delta=afterUsed-(beforeUsed[k]||0),after=before-delta;
  const oldRates=[...new Set(entries.map(e=>e.rates[k]))].sort((a,b)=>a-b);
  return {key:k,old_rates:oldRates,rate:rates[k],before_used:beforeUsed[k]||0,after_used:afterUsed,delta,before,after,shortage:Math.max(0,-after)};
 });
 const preview={run_id:run.id,stype:run.stype,qty,entry_count:entries.length,gauges,can_apply:gauges.every(g=>!g.shortage)};
 if(!preview.can_apply)return {preview,body:null,rates,issue_ids:ids};
 for(const {entry,extra} of needs){entry.allocations.push(...take(body,ids,extra,'consumed',pools));entry.rates={...rates};}
 run.issue_ids=ids;run.recipe=rates;
 body.recipes=body.recipes||{};body.recipes[run.stype]={...body.recipes[run.stype],recipe:rates,issue_ids:ids};
 for(const p of Object.values(lotLedger(body)))if(p.left<0)throw Error('Recipe would overdraw a wire lot');
 return {preview,body,rates,issue_ids:ids};
}
