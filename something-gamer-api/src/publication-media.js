import {mediaStore} from './media-store.js';
import {validateMediaSignature} from './security.js';
import {consumeRate} from './limits.js';
import {getDocument} from './firestore-store.js';
const MAX=20*1024*1024, TYPES=new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/aac','audio/x-m4a','audio/wav']);
export const mediaId=v=>typeof v==='string'&&/^[a-f0-9]{48}$/.test(v);
export async function boundedBytes(body,max=MAX){
 if(body instanceof ArrayBuffer){if(body.byteLength>max)throw new Error('MEDIA_TOO_LARGE');return new Uint8Array(body);}
 const reader=body?.getReader();if(!reader)throw new Error('MEDIA_NOT_READY');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max)throw new Error('MEDIA_TOO_LARGE');chunks.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function configured(env){if(!env.SG_DB||(!env.SG_MEDIA&&!env.SG_AUTH))throw new Error('MEDIA_NOT_CONFIGURED');}
export async function quarantineUpload(request,env,user,review){
 configured(env);if(env.PUBLIC_MEDIA_ENABLED!=='true')throw new Error('MEDIA_NOT_CONFIGURED');
 const purpose=new URL(request.url).searchParams.get('purpose')||'post';if(!['post','profile','market','report'].includes(purpose))throw new Error('INVALID_MEDIA_CONTEXT');
 const contextId=new URL(request.url).searchParams.get('contextId')||null;
 if(purpose==='report'&&(!contextId||!/^[A-Za-z0-9_-]{1,128}$/.test(contextId)))throw new Error('INVALID_MEDIA_CONTEXT');
 const type=(request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();if(!TYPES.has(type))throw new Error('MEDIA_TYPE_NOT_ALLOWED');
 if(Number(request.headers.get('Content-Length'))>MAX)throw new Error('MEDIA_TOO_LARGE');await consumeRate(env,user.uid,'uploads');
 const bytes=await boundedBytes(request.body);if(!bytes.length)throw new Error('MEDIA_TOO_LARGE');validateMediaSignature(bytes,type);
 const id=[...crypto.getRandomValues(new Uint8Array(24))].map(n=>n.toString(16).padStart(2,'0')).join(''),now=Date.now(),store=mediaStore(env);
 // Reserve capacity durably before storing bytes. KV is never an authority.
 const reserved=await env.SG_DB.prepare(`INSERT INTO quarantined_media(id,owner_uid,purpose,content_type,size,sha256,created_at,expires_at,context_id)
 SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM quarantined_media WHERE state!='deleted')+?<=1073741824
 AND (SELECT COALESCE(SUM(size),0) FROM quarantined_media WHERE owner_uid=? AND created_at>?) + ?<=67108864 RETURNING id`).bind(id,user.uid,purpose,type,bytes.length,await digest(bytes),now,now+86400000,contextId,bytes.length,user.uid,now-86400000,bytes.length).first();
 if(!reserved)throw new Error('MEDIA_RATE_LIMITED');
 try{
  await store.put(id,bytes,type,{persistent:true});
  let decision={state:'pending_review'};
  if(purpose!=='report'&&review){try{decision=await review(bytes,type);}catch{decision={state:'pending_review',reason:'MODERATION_UNAVAILABLE'};}}
  if(!['approved','rejected','pending_review'].includes(decision?.state))decision={state:'pending_review',reason:'MODERATION_UNAVAILABLE'};
  await env.SG_DB.prepare('UPDATE quarantined_media SET state=?,reason=? WHERE id=?').bind(decision.state,decision.reason||'',id).run();
  if(decision.state==='rejected'){await store.delete(id);throw new Error('CONTENT_REJECTED');}
  return {ok:true,mediaId:id,url:`${new URL(request.url).origin}/media/${id}`,contentType:type,size:bytes.length,state:decision.state};
 }catch(error){
  await store.delete(id).catch(()=>{});await env.SG_DB.prepare("UPDATE quarantined_media SET state='deleted' WHERE id=?").bind(id).run().catch(()=>{});throw error;
 }
}
export async function mediaRecord(env,id){configured(env);if(!mediaId(id))throw new Error('INVALID_MEDIA_CONTEXT');const row=await env.SG_DB.prepare("SELECT * FROM quarantined_media WHERE id=? AND state!='deleted'").bind(id).first();if(!row)throw new Error('MEDIA_NOT_FOUND');return row;}
export async function checkedObject(env,row){
 const body=await mediaStore(env).get(row.id);if(!body)throw new Error('MEDIA_NOT_READY');const bytes=await boundedBytes(body,MAX);
 if(bytes.length!==row.size||await digest(bytes)!==row.sha256)throw new Error('MEDIA_NOT_READY');return bytes;
}
const response=(bytes,type)=>new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
export async function previewQuarantine(env,id,user,{admin=false}={}){
 const row=await mediaRecord(env,id);if(!admin&&row.owner_uid!==user.uid)throw new Error('FORBIDDEN');
 if(row.state==='rejected')throw new Error('MEDIA_NOT_FOUND');return response(await checkedObject(env,row),row.content_type);
}
export async function serveApprovedMedia(request,env,id){
 if(env.PUBLIC_MEDIA_ENABLED!=='true')throw new Error('MEDIA_NOT_CONFIGURED');const row=await mediaRecord(env,id);
 if(row.state!=='approved'||row.purpose==='report')throw new Error('MEDIA_NOT_FOUND');
 const url=`${new URL(request.url).origin}/media/${id}`;
 let linked=false;
 if(row.purpose==='post'&&row.bound_post){const post=await getDocument(env,`posts/${row.bound_post}`);linked=post?.uid===row.owner_uid&&post?.mediaId===id&&post?.mediaUrl===url;}
 if(row.purpose==='profile'){const owner=await getDocument(env,`users/${row.owner_uid}`);linked=owner?.photoURL===url;}
 // Legacy listings retain their flow, but only approved bytes can be linked.
 if(row.purpose==='market'){
  const {ownedDocuments}=await import('./firestore-store.js');const posts=await ownedDocuments(env,'marketListings','sellerUid',row.owner_uid);linked=posts.some(p=>p.status==='active'&&p.imageUrl===url);
 }
 if(!linked)throw new Error('MEDIA_NOT_FOUND');return response(await checkedObject(env,row),row.content_type);
}
export async function discardQuarantine(env,id,user){
 const row=await mediaRecord(env,id);if(row.owner_uid!==user.uid)throw new Error('FORBIDDEN');
 if(row.bound_post)throw new Error('RESOURCE_CONFLICT');await mediaStore(env).delete(id);await env.SG_DB.prepare("UPDATE quarantined_media SET state='deleted' WHERE id=?").bind(id).run();return {ok:true};
}
// Only this new namespace is cleaned. Never sweep legacy objects or delete
// when Firestore availability leaves publication state uncertain.
export async function expireQuarantine(env){
 if(!env.SG_DB||(!env.SG_MEDIA&&!env.SG_AUTH))return;
 const rows=(await env.SG_DB.prepare("SELECT * FROM quarantined_media WHERE state!='deleted' AND expires_at<? LIMIT 30").bind(Date.now()).all()).results;
 for(const row of rows){try{
  let keep=false;
  if(row.bound_post)keep=Boolean(await getDocument(env,`posts/${row.bound_post}`));
  const owner=await getDocument(env,`users/${row.owner_uid}`),url=`${env.API_URL}/media/${row.id}`;
  if(row.purpose==='report'&&row.context_id){const report=await getDocument(env,`reports/${row.context_id}`);keep ||= report?.fromUid===row.owner_uid&&report?.evidenceURLs?.includes(url);}
  keep ||= owner?.photoURL===url || owner?.pendingPhotoURL===url && Date.now()-row.created_at<30*86400000;
  const pending=await env.SG_DB.prepare("SELECT id FROM post_submissions WHERE owner_uid=? AND state='pending_review' AND json_extract(payload,'$.mediaId')=? AND created_at>? LIMIT 1").bind(row.owner_uid,row.id,Date.now()-30*86400000).first();keep ||= Boolean(pending);
  if(row.purpose==='market'){const {ownedDocuments}=await import('./firestore-store.js');keep ||= (await ownedDocuments(env,'marketListings','sellerUid',row.owner_uid)).some(p=>p.imageUrl===url);}
  if(keep){await env.SG_DB.prepare('UPDATE quarantined_media SET expires_at=? WHERE id=?').bind(Date.now()+86400000,row.id).run();continue;}
  await mediaStore(env).delete(row.id);await env.SG_DB.prepare("UPDATE quarantined_media SET state='deleted' WHERE id=?").bind(row.id).run();
 }catch{/* Unknown remote state keeps bytes private for a later retry. */}}
}
