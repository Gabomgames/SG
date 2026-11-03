import {legacyPrivateObject,legacyChatObject} from '../../legacy-media-policy.js';
import {authorizeConversation} from './private-media.js';
import {serverToken} from './firestore-server.js';
import {boundedBytes} from './publication-media.js';
import {validateMediaSignature} from './security.js';
function buckets(env){return env.FIREBASE_STORAGE_BUCKET?[env.FIREBASE_STORAGE_BUCKET]:[`${env.FIREBASE_PROJECT_ID}.firebasestorage.app`,`${env.FIREBASE_PROJECT_ID}.appspot.com`];}
async function readObject(env,parsed){
 // Fixed GCS host and canonical object name: never fetch a client URL/token.
 const upstream=await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.object)}?alt=media`,{
  headers:{Authorization:`Bearer ${await serverToken(env,'https://www.googleapis.com/auth/devstorage.read_only')}`},redirect:'error',signal:AbortSignal.timeout(20000)});
 if([403,404].includes(upstream.status))throw new Error('MEDIA_NOT_FOUND');if(!upstream.ok)throw new Error('MEDIA_NOT_READY');
 const type=(upstream.headers.get('Content-Type')||'').split(';')[0];
 if(!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|webm|ogg|wav|aac|x-m4a))$/.test(type))throw new Error('MEDIA_TYPE_NOT_ALLOWED');
 const bytes=await boundedBytes(upstream.body,25*1024*1024);validateMediaSignature(bytes,type);
 return new Response(bytes,{headers:{'Content-Type':type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}});
}
export async function readLegacyChat(request,env,user){
 const {url}=await request.json(),parsed=legacyChatObject(url,buckets(env));if(!parsed)throw new Error('INVALID_MEDIA_CONTEXT');
 const context=await authorizeConversation(request,env,`conversations/${parsed.conversationId}`,user);
 const members=(context.members?.arrayValue?.values||[]).map(v=>v.stringValue);
 if(!members.includes(parsed.ownerUid)||!members.includes(user.uid))throw new Error('FORBIDDEN');
 return readObject(env,parsed);
}
// Only invoked behind requireAdmin: UID allowlist, signed admin claim, recent
// Firebase MFA and a verified Cloudflare Access assertion.
export async function readLegacyAdmin(request,env){
 const {url}=await request.json(),parsed=legacyPrivateObject(url,buckets(env));if(!parsed)throw new Error('INVALID_MEDIA_CONTEXT');
 return readObject(env,parsed);
}
