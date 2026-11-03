import {getDocument,patchWrite,commitDocuments,auditedCommit} from './firestore-store.js';
import {mediaRecord,checkedObject,digest} from './publication-media.js';
import {postDraft,canonicalPost} from './post-domain.js';
import {consumeRate} from './limits.js';
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw new Error('INVALID_POST_INPUT');return v;};
export function publicationStore(env){return {
 get:path=>getDocument(env,path),
 async authorize(postId,uid,post){
  const path=`publicationApprovals/${postId}`,prior=await getDocument(env,path);
  if(prior?.used)return {used:true};
  if(prior&&prior.uid!==uid)throw new Error('FORBIDDEN');
  await commitDocuments(env,[patchWrite(env,path,{uid,post,used:false,expiresAt:new Date(Date.now()+600000)},prior?{updateTime:prior._updateTime}:{create:true})]);
  return {used:false};
 },
 async audit(actor,postId,action,reason){await auditedCommit(env,actor,action,postId,[],reason);},
 async publish(postId,uid,post,actor,reason){
  const [existing,profile,limit,approval]=await Promise.all([getDocument(env,`posts/${postId}`),getDocument(env,`users/${uid}`),getDocument(env,`limites/${uid}`),getDocument(env,`publicationApprovals/${postId}`)]);
  if(existing){if(existing.uid!==uid)throw new Error('FORBIDDEN');for(const key of ['type','title','description','mediaId','eventId'])if((existing[key]||'')!==(post[key]||''))throw new Error('RESOURCE_CONFLICT');return;}
  post=canonicalPost(post,uid,profile);
  if(limit?.post?.seconds*1000>Date.now()-20000)throw new Error('RATE_LIMITED');
  let event;
  if(post.eventId){event=await getDocument(env,`events/${id(post.eventId)}`);if(event?.ownerUid!==uid)throw new Error('FORBIDDEN');}
  const p=patchWrite(env,`posts/${postId}`,post,{create:true});p.updateTransforms=[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}];
  const l=patchWrite(env,`limites/${uid}`,{},limit?{updateTime:limit._updateTime}:{create:true});l.updateTransforms=[{fieldPath:'post',setToServerValue:'REQUEST_TIME'}];
  const a=patchWrite(env,`publicationApprovals/${postId}`,{uid,post,used:true,expiresAt:new Date(Date.now()+600000)},approval?{updateTime:approval._updateTime}:{create:true});a.updateTransforms=[{fieldPath:'usedAt',setToServerValue:'REQUEST_TIME'}];
  await auditedCommit(env,actor,'post_publication_review',postId,[...(event?[{verify:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/events/${post.eventId}`,currentDocument:{updateTime:event._updateTime}}]:[]),{verify:`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${uid}`,currentDocument:{updateTime:profile._updateTime}},p,l,a],reason);
 }
};}
export async function authorizePost(request,env,user,moderate,{store=publicationStore(env)}={}){
 if(env.POST_MODERATION_ENABLED!=='true'||!env.SG_DB)throw new Error('PUBLICATION_NOT_CONFIGURED');
 await consumeRate(env,user.uid,'posts');const body=await request.json(),postId=id(body.postId),draft=postDraft(body.post);
 const hash=await digest(new TextEncoder().encode(JSON.stringify(draft)));
 const before=await env.SG_DB.prepare('SELECT * FROM post_submissions WHERE id=?').bind(postId).first();
 if(before&&(before.owner_uid!==user.uid||before.draft_hash!==hash))throw new Error('IDEMPOTENCY_CONFLICT');
 const [profile,existing]=await Promise.all([store.get(`users/${user.uid}`),store.get(`posts/${postId}`)]);
 const post=canonicalPost(draft,user.uid,profile);
 if(existing){if(existing.uid!==user.uid||!before)throw new Error('RESOURCE_CONFLICT');await env.SG_DB.prepare("UPDATE post_submissions SET state='published' WHERE id=? AND owner_uid=?").bind(postId,user.uid).run();return {ok:true,state:'published',postId};}
 if(draft.eventId){id(draft.eventId);const event=await store.get(`events/${draft.eventId}`);if(event?.ownerUid!==user.uid)throw new Error('FORBIDDEN');}
 const now=Date.now();
 const inserted=await env.SG_DB.prepare('INSERT OR IGNORE INTO post_submissions(id,owner_uid,draft_hash,payload,created_at,updated_at) VALUES (?,?,?,?,?,?) RETURNING id').bind(postId,user.uid,hash,JSON.stringify(post),now,now).first();
 const prior=await env.SG_DB.prepare('SELECT * FROM post_submissions WHERE id=?').bind(postId).first();
 if(prior.owner_uid!==user.uid||prior.draft_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
 if(['pending_review','rejected','reviewing'].includes(prior.state))return {ok:true,state:prior.state==='reviewing'?'pending_review':prior.state,postId};
 if(!inserted){const lease=await env.SG_DB.prepare("UPDATE post_submissions SET state='processing',updated_at=? WHERE id=? AND (state='authorized' OR (state='processing' AND updated_at<?)) RETURNING id").bind(now,postId,now-60000).first();if(!lease)return {ok:true,state:'pending_review',postId};}
 let media;
 if(draft.mediaId){
  media=await mediaRecord(env,draft.mediaId);if(media.owner_uid!==user.uid||media.purpose!=='post')throw new Error('FORBIDDEN');
  if(media.state==='rejected')throw new Error('CONTENT_REJECTED');
  if((draft.type==='image'&&!media.content_type.startsWith('image/'))||(draft.type==='video'&&!media.content_type.startsWith('video/')))throw new Error('INVALID_POST_INPUT');
  post.mediaUrl=`${env.API_URL}/media/${media.id}`;post.mediaType=media.content_type;
  const bound=await env.SG_DB.prepare('UPDATE quarantined_media SET bound_post=?,expires_at=? WHERE id=? AND (bound_post IS NULL OR bound_post=?) RETURNING id').bind(postId,Date.now()+30*86400000,media.id,postId).first();if(!bound)throw new Error('RESOURCE_CONFLICT');
 }

 let safe=false,reason='MODERATION_UNAVAILABLE';
 if(!media||media.state==='approved')try{const result=await moderate([draft.title,draft.description,...draft.tags,...draft.pollOptions].filter(Boolean).join('\n'));safe=result?.flagged===false;reason=result?.flagged===true?'CONTENT_REJECTED':'MODERATION_UNAVAILABLE';}catch{}
 if(!safe){
  const state=reason==='CONTENT_REJECTED'?'rejected':'pending_review';await env.SG_DB.prepare('UPDATE post_submissions SET state=?,reason=?,payload=?,updated_at=? WHERE id=?').bind(state,reason,JSON.stringify(post),now,postId).run();return {ok:true,state,postId};
 }
 const receipt=await store.authorize(postId,user.uid,post);
 if(receipt.used){await env.SG_DB.prepare("UPDATE post_submissions SET state='rejected',reason='ALREADY_CONSUMED' WHERE id=?").bind(postId).run();return {ok:true,state:'removed',postId};}
 await env.SG_DB.prepare("UPDATE post_submissions SET state='authorized',payload=?,updated_at=? WHERE id=?").bind(JSON.stringify(post),now,postId).run();
 return {ok:true,state:'authorized',postId,post};
}
export async function postsMine(request,env,user,{store=publicationStore(env)}={}){
 if(!env.SG_DB)throw new Error('PUBLICATION_NOT_CONFIGURED');
 const rows=(await env.SG_DB.prepare("SELECT id,state,created_at FROM post_submissions WHERE owner_uid=? AND state!='published' ORDER BY created_at DESC LIMIT 25").bind(user.uid).all()).results;
 const items=[];
 for(const row of rows){
  if(row.state==='authorized'){
   const published=await store.get(`posts/${row.id}`);
   if(published?.uid===user.uid){await env.SG_DB.prepare("UPDATE post_submissions SET state='published' WHERE id=? AND state='authorized'").bind(row.id).run();continue;}
  }
  items.push(row);
 }
 return {ok:true,items};
}
export async function reviewPosts(request,env,admin,{store=publicationStore(env)}={}){
 if(!env.SG_DB||env.POST_MODERATION_ENABLED!=='true')throw new Error('PUBLICATION_NOT_CONFIGURED');const body=await request.json();
 if(body.action==='queue'){await env.SG_DB.prepare("UPDATE post_submissions SET state='pending_review' WHERE state IN ('processing','reviewing') AND updated_at<?").bind(Date.now()-120000).run();return {ok:true,items:(await env.SG_DB.prepare("SELECT * FROM post_submissions WHERE state='pending_review' ORDER BY created_at LIMIT 50").all()).results.map(row=>({...row,payload:JSON.parse(row.payload)}))};}
 if(!['approve','reject'].includes(body.action)||typeof body.reason!=='string'||body.reason.trim().length<10||body.reason.length>500)throw new Error('INVALID_REVIEW');
 const postId=id(body.id),row=await env.SG_DB.prepare("UPDATE post_submissions SET state='reviewing',updated_at=? WHERE id=? AND state='pending_review' RETURNING *").bind(Date.now(),postId).first();if(!row)throw new Error('RESOURCE_CONFLICT');
 try{
 if(body.action==='reject'){await store.audit(admin,postId,'post_publication_rejected',body.reason);await env.SG_DB.prepare("UPDATE post_submissions SET state='rejected',reason=?,updated_at=? WHERE id=?").bind(body.reason,Date.now(),postId).run();return {ok:true,state:'rejected'};}
 const data=JSON.parse(row.payload),profile=await store.get(`users/${row.owner_uid}`),post=canonicalPost(postDraft(Object.fromEntries(Object.entries(data).filter(([k])=>['type','title','description','tags','pollOptions','mediaId','mediaUrl','mediaType','eventId'].includes(k)))),row.owner_uid,profile);
 if(post.mediaId){const media=await mediaRecord(env,post.mediaId);if(media.owner_uid!==row.owner_uid||media.bound_post!==postId||media.purpose!=='post')throw new Error('FORBIDDEN');await checkedObject(env,media);await env.SG_DB.prepare("UPDATE quarantined_media SET state='approved',reason=? WHERE id=?").bind(body.reason,media.id).run();}
 await store.publish(postId,row.owner_uid,post,admin,body.reason);
 await env.SG_DB.prepare("UPDATE post_submissions SET state='published',reason=?,updated_at=? WHERE id=?").bind(body.reason,Date.now(),postId).run();return {ok:true,state:'published',postId};
 }catch(error){await env.SG_DB.prepare("UPDATE post_submissions SET state='pending_review' WHERE id=? AND state='reviewing'").bind(postId).run();throw error;}
}
