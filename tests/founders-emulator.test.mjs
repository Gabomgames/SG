// Actual Firestore transaction test. Auth identities here are synthetic stubs;
// this does not certify a production Firebase Auth/App Check integration.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import service from '../functions/founders.js';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085'||process.env.GCLOUD_PROJECT!=='demo-sg')throw new Error('Use somente demo-sg em 127.0.0.1:8085.');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore,Timestamp}=require('firebase-admin/firestore');
let app,db;
before(async()=>{
 app=initializeApp({projectId:'demo-sg'},'founder-isolated-test');db=getFirestore(app);
 const response=await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-sg/databases/(default)/documents',{method:'DELETE'});
 assert.equal(response.ok,true,'isolated emulator reset must succeed');
});
after(async()=>{await db?.terminate();if(app)await deleteApp(app);});
test('Firestore atomically grants at most 50 founder awards under concurrent requests',async()=>{
 await db.doc('founderCampaigns/launch').set({enabled:true,launchAt:Timestamp.fromMillis(Date.now()-1000),granted:0});
 const accounts=new Map();
 for(let i=0;i<64;i++){
  const uid=`emulator-founder-${i}`;accounts.set(uid,{uid,email:`emulator-founder-${i}@example.test`,emailVerified:true,providerData:[{providerId:'password'}]});
  await db.doc(`users/${uid}`).set({uid,moderation:{status:'active'}});
 }
 const api=service.createFoundersService({db,auth:{getUser:async uid=>accounts.get(uid)},Timestamp,enabled:()=>true});
 const results=await Promise.all([...accounts.keys()].map(uid=>api.sync(uid)));
 assert.equal(results.filter(r=>r.status==='active').length,50);
 assert.equal(results.filter(r=>r.status==='exhausted').length,14);
 const grants=await db.collection('founderGrants').get();assert.equal(grants.size,50);
 const campaign=(await db.doc('founderCampaigns/launch').get()).data();assert.equal(campaign.granted,50);assert.equal(campaign.closed,true);
 const winner=grants.docs[0].id;
 await Promise.all(Array.from({length:8},()=>api.sync(winner)));
 assert.equal((await db.collection('notifications').get()).size,50);
 assert.equal((await db.doc('founderCampaigns/launch').get()).data().granted,50);
});
