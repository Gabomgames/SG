import {consumeRate} from './limits.js';
import { validateMediaSignature } from './security.js';
import {mediaStore} from './media-store.js';
const LIMIT=8*1024*1024,DAILY=64*1024*1024;
const TYPES=new Set(['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','audio/webm','audio/ogg','audio/mpeg','audio/mp4']);
export function conversationPath(value){
 if(typeof value!=='string'||!(/^(conversations\/[a-zA-Z0-9_-]{3,260}|servers\/[a-zA-Z0-9_-]{1,128}\/channels\/[a-zA-Z0-9_-]{1,128})$/).test(value))throw new Error('INVALID_MEDIA_CONTEXT');
 return value;
}
// Usa o token do participante: as Security Rules autorizam cada acesso, inclusive bloqueios.
export async function authorizeConversation(request,env,path,user,{write=false,type=''}={}){
 conversationPath(path);
 const base=`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/`;
 const read=async p=>{
  const response=await fetch(base+p,{headers:{Authorization:request.headers.get('Authorization')},signal:AbortSignal.timeout(10000)});
  if([403,404].includes(response.status))throw new Error('FORBIDDEN');
  if(!response.ok)throw new Error('FIRESTORE_FAILED');
  return (await response.json()).fields||{};
 };
 const context=await read(path);
 if(write){
  const profile=await read(`users/${encodeURIComponent(user.uid)}`),moderation=profile.moderation?.mapValue?.fields;
  if(['banned','suspended'].includes(moderation?.status?.stringValue))throw new Error('ACCOUNT_RESTRICTED');
  if(path.startsWith('conversations/')&&context.kind?.stringValue!=='market'){
   const friendship=await read(`friendships/${path.split('/')[1]}`);
   if(!type.startsWith('audio/')&&friendship.gamerStatus?.stringValue!=='accepted')throw new Error('FORBIDDEN');
  }else if(path.startsWith('servers/')){
   const server=await read(path.split('/').slice(0,2).join('/'));
   if(['mutedUids','bannedUids'].some(k=>(server[k]?.arrayValue?.values||[]).some(v=>v.stringValue===user.uid)))throw new Error('FORBIDDEN');
  }
 }
}
function configured(env){if((!env.SG_MEDIA&&!env.SG_AUTH)||!env.SG_DB)throw new Error('PRIVATE_MEDIA_NOT_CONFIGURED');}
export async function uploadPrivate(request,env,user){
 await consumeRate(env,user.uid,'uploads');
 configured(env);
 const url=new URL(request.url),path=conversationPath(url.searchParams.get('conversation'));
 const type=(request.headers.get('Content-Type')||'').toLowerCase().split(';')[0];
 if(!TYPES.has(type))throw new Error('MEDIA_TYPE_NOT_ALLOWED');
 if(Number(request.headers.get('Content-Length'))>LIMIT)throw new Error('MEDIA_TOO_LARGE');
 await authorizeConversation(request,env,path,user,{write:true,type});
 const reader=request.body?.getReader(),parts=[];let size=0;
 if(!reader)throw new Error('MEDIA_TOO_LARGE');
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw new Error('MEDIA_TOO_LARGE');}parts.push(value);}
 if(!size)throw new Error('MEDIA_TOO_LARGE');
 const bytes=new Uint8Array(size);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length;}
 validateMediaSignature(bytes,type);
 const day=new Date().toISOString().slice(0,10);
 const quota=await env.SG_DB.prepare(`INSERT INTO media_quota(uid,day,bytes) VALUES (?,?,?)
  ON CONFLICT(uid,day) DO UPDATE SET bytes=bytes+excluded.bytes WHERE bytes+excluded.bytes<=?
  RETURNING bytes`).bind(user.uid,day,size,DAILY).first();
 if(!quota)throw new Error('MEDIA_RATE_LIMITED');
 const id=crypto.randomUUID(),now=Date.now(),expires=now+30*86400000;
 try{
  await mediaStore(env).put(id,bytes,type);
  const stored=await env.SG_DB.prepare('INSERT INTO private_media(id,owner_uid,conversation,content_type,size,created_at,expires_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM private_media)+?<=943718400 RETURNING id').bind(id,user.uid,path,type,size,now,expires,size).first();if(!stored)throw new Error('MEDIA_RATE_LIMITED');
 }catch(error){await mediaStore(env).delete(id).catch(()=>{});throw error;}
 return {ok:true,id,url:`${url.origin}/private-media/${id}`,contentType:type,size,expiresAt:expires};
}
export async function readPrivate(request,env,user){
 configured(env);const body=await request.json();
 if(!/^[a-f0-9-]{36}$/.test(body.id||''))throw new Error('INVALID_MEDIA_CONTEXT');
 const row=await env.SG_DB.prepare('SELECT * FROM private_media WHERE id=?').bind(body.id).first();
 if(!row||row.expires_at<=Date.now())throw new Error('MEDIA_NOT_FOUND');
 await authorizeConversation(request,env,row.conversation,user);
 const object=await mediaStore(env).get(row.id);
 if(!object)throw new Error('MEDIA_NOT_READY');
 return new Response(object,{headers:{'Content-Type':row.content_type,'Content-Length':String(row.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
}
export async function deletePrivate(request,env,user){
 configured(env);const {id}=await request.json();if(!/^[a-f0-9-]{36}$/.test(id||''))throw new Error('INVALID_MEDIA_CONTEXT');
 const row=await env.SG_DB.prepare('SELECT * FROM private_media WHERE id=?').bind(id).first();
 if(!row||row.owner_uid!==user.uid)throw new Error('MEDIA_NOT_FOUND');
 await mediaStore(env).delete(id);await env.SG_DB.prepare('DELETE FROM private_media WHERE id=? AND owner_uid=?').bind(id,user.uid).run();return {ok:true};
}
export async function expirePrivate(env){
 if(!env.SG_DB||(!env.SG_MEDIA&&!env.SG_AUTH))return;
 const rows=await env.SG_DB.prepare('SELECT id FROM private_media WHERE expires_at<=? LIMIT 50').bind(Date.now()).all();
 for(const row of rows.results){await mediaStore(env).delete(row.id);await env.SG_DB.prepare('DELETE FROM private_media WHERE id=?').bind(row.id).run();}
 await env.SG_DB.prepare('DELETE FROM api_limits WHERE period<?').bind(new Date(Date.now()-7*86400000).toISOString().slice(0,10)).run();
 await env.SG_DB.prepare('DELETE FROM media_quota WHERE day<?').bind(new Date(Date.now()-7*86400000).toISOString().slice(0,10)).run();
}
