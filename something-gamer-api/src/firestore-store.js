import {serverToken,field} from './firestore-server.js';
export function decodeField(value){
 if('nullValue' in value)return null;
 if('timestampValue' in value){const ms=Date.parse(value.timestampValue);return {seconds:Math.floor(ms/1000),nanoseconds:(ms%1000)*1000000};}
 if('arrayValue' in value)return (value.arrayValue.values||[]).map(decodeField);
 if('mapValue' in value)return decodeFields(value.mapValue.fields||{});
 if('integerValue' in value)return Number(value.integerValue);
 if('doubleValue' in value)return value.doubleValue;
 if('booleanValue' in value)return value.booleanValue;
 return value.stringValue||'';
}
export const decodeFields=fields=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decodeField(v)]));
export function safeId(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(value))throw new Error('INVALID_ADMIN_ACTION');return value;}
const base=env=>`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
async function send(env,suffix,options={}){
 const response=await fetch(`https://firestore.googleapis.com/v1/${base(env)}${suffix}`,{
  ...options,signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${await serverToken(env)}`,'Content-Type':'application/json'}
 });
 if(response.status===404)return null;
 if(response.status===409||response.status===412)throw new Error('RESOURCE_CONFLICT');
 if(!response.ok)throw new Error('FIRESTORE_FAILED');
 return response.json();
}
export async function getDocument(env,path){const value=await send(env,`/${path}`);return value?{id:value.name.split('/').pop(),...decodeFields(value.fields||{}),_updateTime:value.updateTime}:null;}
export async function listDocuments(env,collection,{cursor='',size=100}={}){
 const out=await send(env,`/${collection}?pageSize=${Math.min(100,size)}${cursor?`&pageToken=${encodeURIComponent(cursor)}`:''}`);
 return {items:(out?.documents||[]).map(d=>({id:d.name.split('/').pop(),...decodeFields(d.fields||{})})),cursor:out?.nextPageToken||''};
}
export function patchWrite(env,path,data,{updateTime='',create=false}={}){
 return {update:{name:`${base(env)}/${path}`,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,field(v)]))},
  updateMask:{fieldPaths:Object.keys(data)},...(updateTime?{currentDocument:{updateTime}}:create?{currentDocument:{exists:false}}:{})};
}
export async function commitDocuments(env,writes){return send(env,':commit',{method:'POST',body:JSON.stringify({writes})});}
export async function ownedDocuments(env,collection,ownerField,uid){
 const rows=await send(env,':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:ownerField},op:'EQUAL',value:field(uid)}},limit:100}})});
 return (rows||[]).filter(x=>x.document).map(x=>({id:x.document.name.split('/').pop(),...decodeFields(x.document.fields||{})}));
}
export async function auditedCommit(env,actor,action,target,writes,reason=''){
 const audit=patchWrite(env,`adminAuditLogs/${crypto.randomUUID()}`,{actorUid:actor.uid,action,targetId:target,reason:String(reason).slice(0,500),createdAt:new Date()}, {create:true});
 return commitDocuments(env,[...writes,audit]);
}
