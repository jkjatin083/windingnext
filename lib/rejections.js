import {db} from './core';
export async function rejectionRows(me){
 const sql=db();
 return sql`SELECT h.reference::text,h.contractor,h.qty,h.status,h.origin,
  COALESCE(h.entry_date,(h.confirmed_at AT TIME ZONE 'Asia/Kolkata')::date,(h.created_at AT TIME ZONE 'Asia/Kolkata')::date)::text AS d,
  COALESCE(h.reason,'Final Record Return') AS reason,COALESCE(h.item,x.stype,'Unknown item') AS stype,
  COALESCE(h.recipient,x.recipient,'Pandey ji') AS recipient,h.reversal_reason,h.reversed_at
  FROM wn_stator_rejections h LEFT JOIN LATERAL (
   SELECT MIN(e.stype) AS stype,MIN(e.party) FILTER(WHERE l.kind='sent') AS recipient
   FROM wn_stator_rejection_links l JOIN wa_entries e ON e.id=l.entry_id WHERE l.reference=h.reference
  ) x ON true WHERE h.status IN ('confirmed','cancelled') AND (h.status='confirmed' OR h.origin='admin')
   AND (${me}='ADMIN' OR h.contractor=${me} OR COALESCE(h.recipient,x.recipient)=${me})
  ORDER BY COALESCE(h.entry_date,h.confirmed_at::date,h.created_at::date) DESC,h.created_at DESC`;
}
