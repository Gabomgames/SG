import test from 'node:test';
import assert from 'node:assert/strict';
import service from '../functions/founders.js';
import policy from '../functions/founders-domain.js';
import {FounderStore} from './fixtures/founder-store.mjs';
const NOW=1800000000000;
function setup({enabled=true,launched=true}={}){
  const db=new FounderStore(),accounts=new Map();let now=NOW;
  db.put('founderCampaigns/launch',{enabled:true,launchAt:new Date(launched?NOW-1000:NOW+1000),granted:0});
  const api=service.createFoundersService({db,auth:{getUser:async uid=>accounts.get(uid)},Timestamp:{fromMillis:n=>new Date(n)},enabled:()=>enabled,clock:()=>now});
  function add(uid,email=`${uid}@example.test`,extra={}){accounts.set(uid,{uid,email,emailVerified:true,disabled:false,providerData:[{providerId:'password'}],...extra});db.put(`users/${uid}`,{uid,moderation:{status:'active'}});}
  return {db,accounts,api,add,advance:ms=>{now+=ms;}};
}
test('80 concurrent eligible accounts receive exactly 50 atomic awards',async()=>{
  const s=setup();for(let i=0;i<80;i++)s.add(`u${i}`);
  const results=await Promise.all([...s.accounts.keys()].map(uid=>s.api.sync(uid)));
  assert.equal(results.filter(r=>r.status==='active').length,50);
  assert.equal(results.filter(r=>r.status==='exhausted').length,30);
  assert.equal(s.db.records.get('founderCampaigns/launch').granted,50);
  assert.equal(s.db.records.get('founderCampaigns/launch').closed,true);
  assert.ok(s.db.retries>0,'test must exercise transaction conflicts');
  const grants=[...s.db.records.entries()].filter(([p])=>p.startsWith('founderGrants/')).map(([,g])=>g).sort((a,b)=>a.sequence-b.sequence);
  assert.deepEqual(grants.map(g=>g.sequence),Array.from({length:50},(_,i)=>i+1));
  for(let i=1;i<grants.length;i++)assert.ok(grants[i].eligibleAt>grants[i-1].eligibleAt);
});
test('concurrent duplicate calls cannot consume additional slots or notifications',async()=>{
  const s=setup();s.add('alice');await Promise.all(Array.from({length:30},()=>s.api.sync('alice')));
  assert.equal(s.db.records.get('founderCampaigns/launch').granted,1);
  assert.equal([...s.db.records.keys()].filter(p=>p.startsWith('notifications/')).length,1);
});
test('disabled promotion and beta before launch consume no slots',async()=>{
  for(const opts of [{enabled:false},{launched:false}]){const s=setup(opts);s.add('beta');await s.api.sync('beta');assert.equal(s.db.records.get('founderCampaigns/launch').granted,0);assert.equal(s.db.records.has('founderGrants/beta'),false);}
});
test('unverified disabled anonymous and suspicious accounts do not hold up legitimate accounts',async()=>{
  const s=setup();s.add('unverified','a@example.test',{emailVerified:false});s.add('disabled','b@example.test',{disabled:true});s.add('anonymous','c@example.test',{providerData:[]});s.add('risk');s.db.put('founderRisk/risk',{reviewRequired:true});s.add('legitimate');
  for(const uid of ['unverified','disabled','anonymous','risk'])assert.notEqual((await s.api.sync(uid)).status,'active');
  assert.equal((await s.api.sync('legitimate')).status,'active');assert.equal(s.db.records.get('founderCampaigns/launch').granted,1);
});
test('normalized email aliases cannot win twice under distinct UIDs',async()=>{
  const s=setup();s.add('a','Found.er+one@gmail.com');s.add('b','founder@googlemail.com');
  const results=await Promise.all([s.api.sync('a'),s.api.sync('b')]);
  assert.equal(results.filter(r=>r.status==='active').length,1);assert.equal(results.filter(r=>r.status==='duplicate_identity').length,1);
});
test('award contains exactly 365 free days and updates private/public badge and welcome notice atomically',async()=>{
  const s=setup();s.add('alice');await s.api.sync('alice');const grant=s.db.records.get('founderGrants/alice');
  assert.equal(grant.expiresAt-grant.startedAt,365*86400000);assert.equal(grant.amountCents,0);assert.equal(grant.autoRenew,false);
  assert.equal(s.db.records.get('users/alice').verification.status,'active');assert.deepEqual(s.db.records.get('publicProfiles/alice').verification,s.db.records.get('users/alice').verification);
  assert.match(s.db.records.get('notifications/founder-alice').message,/365 dias gratuitos/);
});
test('transaction failure cannot consume a slot or leave a partial entitlement',async()=>{
  const s=setup();s.add('alice');s.db.put('notifications/founder-alice',{fixture:true});
  await assert.rejects(s.api.sync('alice'),/ALREADY_EXISTS/);
  assert.equal(s.db.records.get('founderCampaigns/launch').granted,0);assert.equal(s.db.records.has('founderGrants/alice'),false);
});
test('paid reviews and refunds remain separate from the founder entitlement',async()=>{
  const s=setup();s.add('alice');await s.api.sync('alice');
  await s.api.writePaid('alice',{status:'pending',reviewed:false,provider:'mercado_pago_order',orderId:'fixture-order'});
  let data=s.db.records.get('users/alice');assert.equal(data.verification.status,'active');assert.equal(data.paidVerification.status,'pending');assert.equal(data.paidVerification.reviewed,false);
  await s.api.writePaid('alice',{status:'suspended',paymentStatus:'revoked'});data=s.db.records.get('users/alice');assert.equal(data.paidVerification.status,'suspended');assert.equal(data.verification.status,'active');
  s.advance(366*86400000);await s.api.expire();data=s.db.records.get('users/alice');assert.equal(data.verification.status,'suspended');assert.equal(data.founderGrant.status,'expired');
});
test('longer paid benefit is not shortened and administrative revocation cannot regrant a founder slot',async()=>{
  const s=setup();s.add('alice');const paid={status:'active',expiresAt:new Date(NOW+500*86400000),provider:'mercado_pago_order'};s.db.put('users/alice',{uid:'alice',verification:paid});
  await s.api.sync('alice');assert.equal(+s.db.records.get('users/alice').verification.expiresAt,+paid.expiresAt);
  await s.api.writePaid('alice',{status:'suspended'},{revokeFounder:true});assert.equal((await s.api.sync('alice')).status,'revoked');assert.equal(s.db.records.get('founderCampaigns/launch').granted,1);
  assert.equal(policy.effectiveVerification({status:'active'},{status:'active',expiresAt:new Date(NOW+1)},NOW).expiresAt,null,'an existing unlimited paid benefit must not become undefined or shorter');
});
test('corrupt counter fails closed and expired grants never produce an active badge',async()=>{
  const s=setup();s.add('alice');s.db.put('founderCampaigns/launch',{enabled:true,launchAt:new Date(NOW-1),granted:49.5});await assert.rejects(s.api.sync('alice'),/COUNTER_INVALID/);
  assert.equal(policy.effectiveVerification({status:'pending'},{status:'active',expiresAt:new Date(NOW-1)},NOW).status,'pending');
  assert.equal(policy.effectiveVerification({status:'pending'},{status:'active',expiresAt:'invalid'},NOW).status,'pending');
});
