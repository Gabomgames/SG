import test from 'node:test';
import assert from 'node:assert/strict';
import {mirrorVerification,field} from '../something-gamer-api/src/firestore-server.js';
import {decodeField} from '../something-gamer-api/src/firestore-store.js';
test('Firestore timestamp serialization retains millisecond expiry precision',()=>{
 const date=new Date('2026-11-02T12:00:00.123Z');
 assert.deepEqual(field(decodeField(field(date))),field(date));
});
async function credentials(){
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateKey=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
 return {FIREBASE_PROJECT_ID:'demo-sg',FIRESTORE_SERVICE_ACCOUNT:JSON.stringify({project_id:'demo-sg',client_email:`fixture-${crypto.randomUUID()}@example.test`,private_key:privateKey})};
}
test('paid mirror retains founder badge and retries a concurrent grant conflict',async t=>{
 const env=await credentials(),old=globalThis.fetch;let reads=0,commits=0,last;
 t.after(()=>{globalThis.fetch=old;});
 globalThis.fetch=async(url,options={})=>{
  const text=String(url);
  if(text==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-only-fixture-token'});
  if(text.endsWith('/users/alice')){reads++;return Response.json({name:'projects/demo-sg/databases/(default)/documents/users/alice',updateTime:`2026-11-02T00:00:0${reads}Z`,fields:{founderGrant:field({status:'active',expiresAt:new Date(Date.now()+365*86400000)})}});}
  if(text.endsWith(':commit')){commits++;last=JSON.parse(options.body);return commits===1?new Response('',{status:409}):Response.json({});}
  throw new Error('Unexpected test request');
 };
 await mirrorVerification({uid:'alice',state:'revoked',review:'approved',order_id:'fixture-order',plan:'monthly',expires_at:null},env);
 assert.equal(commits,2);assert.equal(reads,2);
 const user=last.writes[0];assert.equal(user.update.fields.verification.mapValue.fields.status.stringValue,'active');assert.equal(user.update.fields.paidVerification.mapValue.fields.status.stringValue,'suspended');assert.ok(user.currentDocument.updateTime);
 assert.equal(last.writes[2].update.fields.status.stringValue,'suspended','paid queue must not inherit promotional approval');
});
test('paid mirror fails closed when the authoritative profile version is missing',async t=>{
 const env=await credentials(),old=globalThis.fetch;let commits=0;t.after(()=>{globalThis.fetch=old;});
 globalThis.fetch=async(url)=>{if(String(url)==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fixture'});if(String(url).endsWith(':commit'))commits++;return new Response('',{status:404});};
 await assert.rejects(mirrorVerification({uid:'alice',state:'pending'},env),/FIRESTORE_FAILED/);assert.equal(commits,0);
});
