import crypto from 'node:crypto';
import {db,verify,WHO} from '../../../lib/core';
import {rejectionRows} from '../../../lib/rejections';
import {digest} from '../../../lib/wire-store';
import {kick} from '../../../lib/wa';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req){
 const me=verify(req);if(me!=='ADMIN'&&!WHO.includes(me))return Response.json({error:'Please log in'},{status:401});
 try{
  const rows=await rejectionRows(me);let pick=[];
  if(me==='ADMIN')pick=await db()`SELECT s.contractor,s.stype,SUM(s.qty)::float-COALESCE((SELECT SUM(m.qty) FROM wn_effective_entries m WHERE m.contractor='Pandey ji' AND m.party=s.contractor AND m.stype=s.stype AND m.kind IN ('made','dispatch') AND NOT m.deleted AND m.d>='2026-10-01'),0)::float AS available
   FROM wn_effective_entries s WHERE s.kind='sent' AND s.party='Pandey ji' AND NOT s.deleted AND s.d>='2026-10-01' GROUP BY s.contractor,s.stype ORDER BY s.contractor,s.stype`;
  return Response.json({rows,pick},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e.message},{status:500})}
}
export async function POST(req){
 let writing=false;
 if(verify(req)!=='ADMIN')return Response.json({error:'Admin login needed'},{status:403});
 try{
  const b=await req.json(),sql=db();
  if(b.action==='reverse'){
   if(!/^[0-9a-f-]{36}$/i.test(b.reference||''))throw Error('Choose a rejection');
   writing=true;const r=await sql`SELECT wn_manual_rejection_reverse(${b.reference}::uuid,${String(b.reason||'')}) AS result`;await kick();return Response.json(r[0].result);
  }
  if(!['preview','save'].includes(b.action))throw Error('Unknown rejection action');
  const qty=Number(b.qty),reason=String(b.reason||'').trim(),d=String(b.d||'');
  if(!Number.isSafeInteger(qty)||qty<=0)throw Error('Enter a whole rejection quantity above zero');
  if(reason.length<2||reason.length>300)throw Error('Add a comment (2 to 300 characters)');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error('Choose a rejection date');
  if(b.action==='preview'){
   const pl=(await sql`SELECT wn_manual_rejection_plan(${b.contractor},${b.stype},${qty},${d}::date) AS plan`)[0].plan;
   const reference=crypto.randomUUID(),token=digest({reference,plan:pl,reason});
   return Response.json({preview:pl,reference,token});
  }
  if(!b.preview||!b.reference||b.token!==digest({reference:b.reference,plan:b.preview,reason}))throw Error('Preview this rejection before saving');
  writing=true;const r=await sql`SELECT wn_manual_rejection_save(${b.reference}::uuid,${b.contractor},${b.stype},${qty},${d}::date,${reason},${JSON.stringify(b.preview)}::jsonb) AS result`;
  await kick();return Response.json(r[0].result);
 }catch(e){return Response.json({error:e.message},{status:!writing||e.code==='P0001'||String(e.code||'').startsWith('22')?409:503})}
}
