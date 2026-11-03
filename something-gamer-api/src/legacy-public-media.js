import {getDocument,auditedCommit} from './firestore-store.js';
import {boundedBytes,digest,mediaId} from './publication-media.js';
import {mediaStore} from './media-store.js';
import {validateMediaSignature} from './security.js';
// Explicit, reviewable adoption of an existing immutable KV object. No sweep,
// no new upload, no legacy deletion and no publication without admin review.
export async function adoptLegacyPublic(request,env,admin){
 if(env.PUBLIC_MEDIA_ENABLED!=='true'||!env.SG_DB||!env.SG_AUTH?.getWithMetadata)throw new Error('MEDIA_NOT_CONFIGURED');
 const b=await request.json();
 if(!mediaId(b.id)||!['post','profile','market','report'].includes(b.purpose)||typeof b.resourceId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(b.resourceId)||typeof b.reason!=='string'||b.reason.trim().length<10||b.reason.length>500)throw new Error('INVALID_REVIEW');
 const old=await env.SG_AUTH.getWithMetadata(`media:${b.id}`,{type:'arrayBuffer'});
 if(!old?.value||!old.metadata?.uid)throw new Error('MEDIA_NOT_FOUND');
 const uid=old.metadata.uid,url=`${env.API_URL}/media/${b.id}`;
 const collection={post:'posts',profile:'users',market:'marketListings',report:'reports'}[b.purpose],doc=await getDocument(env,`${collection}/${b.resourceId}`);
 const linked=b.purpose==='post'?doc?.uid===uid&&doc?.mediaId===b.id&&doc?.mediaUrl===url:b.purpose==='profile'?b.resourceId===uid&&(doc?.photoURL===url||doc?.pendingPhotoURL===url):b.purpose==='market'?doc?.sellerUid===uid&&doc?.imageUrl===url:doc?.fromUid===uid&&doc?.evidenceURLs?.includes(url);
 if(!linked)throw new Error('FORBIDDEN');
 const bytes=await boundedBytes(old.value),type=String(old.metadata.contentType||'');validateMediaSignature(bytes,type);
 const existing=await env.SG_DB.prepare('SELECT id FROM quarantined_media WHERE id=?').bind(b.id).first();if(existing)throw new Error('RESOURCE_CONFLICT');
 await auditedCommit(env,admin,'legacy_media_adoption',b.id,[],b.reason);
 await mediaStore(env).put(b.id,bytes,type,{persistent:true});
 await env.SG_DB.prepare("INSERT INTO quarantined_media(id,owner_uid,purpose,content_type,size,sha256,state,created_at,expires_at,bound_post,context_id,reason) VALUES (?,?,?,?,?,?,'approved',?,?,?,?,?)").bind(b.id,uid,b.purpose,type,bytes.length,await digest(bytes),Date.now(),Date.now()+86400000,b.purpose==='post'?b.resourceId:null,b.purpose==='report'?b.resourceId:null,b.reason).run();
 return {ok:true,id:b.id,state:'approved'};
}
