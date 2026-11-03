// S01 integration tests: these run only against the real local Firestore Emulator.
// Positive controls prevent a blanket denial/rate-limit failure from masquerading as a fix.
import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp,Timestamp,writeBatch} from 'firebase/firestore';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8085'||process.env.GCLOUD_PROJECT!=='demo-sg')throw new Error('Use somente demo-sg em 127.0.0.1:8085.');
let env;
const voter='audit-user',author='audit-author';
const profile=uid=>({uid,name:uid,username:uid,photoURL:'',moderation:{status:'active'},legal:{termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16',acceptedAt:Timestamp.now()}});
const as=(uid=voter)=>env.authenticatedContext(uid).firestore();
const ballot=(option=0,patch={})=>({uid:voter,option,updatedAt:serverTimestamp(),...patch});
function post(patch={}){return {uid:voter,authorName:voter,authorUsername:voter,authorPhoto:'',authorVerified:false,authorAccountType:'gamer',authorBadgeTheme:'blue',authorBadges:{},type:'poll',title:'Qual jogo?',description:'Enquete de teste',tags:[],pollOptions:['A','B'],mediaUrl:'',mediaType:'',mediaId:'',createdAt:serverTimestamp(),...patch};}
async function publish(data,db=as()){
 const proof={...data};delete proof.createdAt;await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'publicationApprovals','audit-new-post'),{uid:voter,post:proof,used:false,expiresAt:Timestamp.fromMillis(Date.now()+60000)}));
 const batch=writeBatch(db);batch.set(doc(db,'posts','audit-new-post'),data);batch.set(doc(db,'limites',voter),{post:serverTimestamp()});batch.update(doc(db,'publicationApprovals','audit-new-post'),{used:true,usedAt:serverTimestamp()});return batch.commit();
}
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-sg',firestore:{host:'127.0.0.1',port:8085,rules:readFileSync(new URL('../../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const uid of [voter,author,'audit-other','audit-banned','audit-stale'])await setDoc(doc(db,'users',uid),profile(uid));
  await updateDoc(doc(db,'users','audit-banned'),{moderation:{status:'banned'}});
  await updateDoc(doc(db,'users','audit-stale'),{'legal.termsVersion':'old'});
  await setDoc(doc(db,'posts','audit-poll'),{uid:author,type:'poll',pollOptions:['A','B']});
  await setDoc(doc(db,'posts','audit-text'),{uid:author,type:'text',description:'Texto',pollOptions:['A','B']});
  await setDoc(doc(db,'events','audit-event'),{ownerUid:voter});
  await setDoc(doc(db,'events','other-event'),{ownerUid:author});
 });
});
for(const options of [['A','B'],['A','B','C'],['A','B','C','D']])test(`cria enquete legítima com ${options.length} opções`,async()=>{await assertSucceeds(publish(post({pollOptions:options})));});
const invalidOptions=[['opção única',['A']],['lista vazia',[]],['mais de quatro',['A','B','C','D','E']],['mapa',{0:'A',1:'B'}],['objeto em opção',['A',{}]],['número em opção',['A',2]],['opção vazia',['A','']],['só espaços',['A','   ']],['bordas em branco',['A',' B ']],['opções duplicadas',['A','A']],['duplicadas em caixa diferente',['A','a']],['rótulo longo',['A','B'.repeat(91)]],['quebra de linha',['A','B\nC']]];
for(const [label,options] of invalidOptions)test(`rejeita enquete: ${label}`,async()=>{await assertFails(publish(post({pollOptions:options})));});
test('rejeita enquete sem opções',async()=>{const data=post();delete data.pollOptions;await assertFails(publish(data));});
test('rótulo só com separadores Unicode é rejeitado',async()=>{await assertFails(publish(post({pollOptions:['A','\u00a0\u00a0']})));});
for(const type of ['text','image','video','news'])test(`preserva criação legítima de ${type}`,async()=>{
 const data=post({type,pollOptions:[],tags:['gaming'],mediaUrl:['image','video'].includes(type)?'https://example.test/fixture':''});
 if(type==='news')data.eventId='audit-event';await assertSucceeds(publish(data));
});
test('preserva schema antigo que omite metadados opcionais',async()=>{
 const data=post({type:'text'});for(const key of ['pollOptions','tags','mediaUrl','mediaType','mediaId'])delete data[key];await assertSucceeds(publish(data));
});
for(const patch of [{admin:true},{likeCount:999},{founderGrant:{status:'active'}},{uid:author},{authorVerified:true},{type:'unknown',pollOptions:[]},{tags:'gaming'},{tags:Array(11).fill('tag')},{tags:['tag',{}]},{tags:['A'.repeat(91)]},{mediaType:{}},{mediaId:123},{mediaUrl:'javascript:alert(1)'},{mediaUrl:'https://example.test/'+ 'x'.repeat(2048)},{eventId:{}},{eventId:'other-event'},{createdAt:Timestamp.fromMillis(0)}])test(`rejeita schema/autoria de post: ${JSON.stringify(patch).slice(0,75)}`,async()=>{await assertFails(publish(post(patch)));});
test('post não-enquete não armazena opções ocultas',async()=>{await assertFails(publish(post({type:'text'})));});
for(const eventId of ['other-event','missing-event'])test(`notícia não forja evento ${eventId}`,async()=>{await assertFails(publish(post({type:'news',pollOptions:[],eventId})));});
test('schema não elimina a limitação de frequência',async()=>{
 await assertSucceeds(publish(post()));const next=post();delete next.createdAt;await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'publicationApprovals','second'),{uid:voter,post:next,used:false,expiresAt:Timestamp.fromMillis(Date.now()+60000)}));const batch=writeBatch(as());batch.set(doc(as(),'posts','second'),post());batch.set(doc(as(),'limites',voter),{post:serverTimestamp()});batch.update(doc(as(),'publicationApprovals','second'),{used:true,usedAt:serverTimestamp()});await assertFails(batch.commit());
});
for(const option of [0,1,'A','B'])test(`voto legítimo ${JSON.stringify(option)} permanece válido`,async()=>{await assertSucceeds(setDoc(doc(as(),'posts','audit-poll','votes',voter),ballot(option)));});
for(const option of [-1,2,999,0.5,'1','C','',null,{},[]])test(`rejeita opção de voto ${JSON.stringify(option)}`,async()=>{await assertFails(setDoc(doc(as(),'posts','audit-poll','votes',voter),ballot(option)));});
for(const patch of [{uid:author},{admin:true},{count:999},{updatedAt:Timestamp.fromMillis(0)}])test(`rejeita payload/autoria de voto ${JSON.stringify(patch)}`,async()=>{await assertFails(setDoc(doc(as(),'posts','audit-poll','votes',voter),ballot(0,patch)));});
test('voto sem carimbo do servidor é rejeitado',async()=>{const data=ballot();delete data.updatedAt;await assertFails(setDoc(doc(as(),'posts','audit-poll','votes',voter),data));});
for(const id of ['missing','audit-text'])test(`não vota em ${id}`,async()=>{await assertFails(setDoc(doc(as(),'posts',id,'votes',voter),ballot()));});
test('não usa caminho de outro eleitor',async()=>{await assertFails(setDoc(doc(as(),'posts','audit-poll','votes',author),ballot()));});
test('somente dono do voto pode alterá-lo ou retirá-lo; novo valor continua validado',async()=>{
 const ref=doc(as(),'posts','audit-poll','votes',voter);await assertSucceeds(setDoc(ref,ballot()));
 await assertSucceeds(updateDoc(ref,{option:1,updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{option:999,updatedAt:serverTimestamp()}));
 const foreign=doc(as(author),'posts','audit-poll','votes',voter);
 await assertFails(updateDoc(foreign,{option:0,updatedAt:serverTimestamp()}));await assertFails(deleteDoc(foreign));
 await assertSucceeds(deleteDoc(ref));assert.equal((await getDoc(ref)).exists(),false);
});
test('leituras e votos textuais de documentos antigos são preservados',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await setDoc(doc(ctx.firestore(),'posts','legacy'),{uid:author,type:'poll',pollOptions:['0','1','C','D','E'],legacyField:true});
  await setDoc(doc(ctx.firestore(),'posts','legacy','votes',voter),{uid:voter,option:'1',updatedAt:Timestamp.now()});
 });
 const db=as();await assertSucceeds(getDoc(doc(db,'posts','legacy')));const ref=doc(db,'posts','legacy','votes',voter);
 assert.equal((await assertSucceeds(getDoc(ref))).data().option,'1');await assertSucceeds(updateDoc(ref,{option:4,updatedAt:serverTimestamp()}));
});
test('eleitor pode retirar seu voto órfão depois da remoção do post',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'posts','missing','votes',voter),{uid:voter,option:0,updatedAt:Timestamp.now()}));
 await assertSucceeds(deleteDoc(doc(as(),'posts','missing','votes',voter)));
});
for(const uid of ['audit-banned','audit-stale'])test(`${uid} não vota`,async()=>{await assertFails(setDoc(doc(as(uid),'posts','audit-poll','votes',uid),{uid,option:0,updatedAt:serverTimestamp()}));});
test('anônimo não cria post nem voto',async()=>{
 const db=env.unauthenticatedContext().firestore();await assertFails(publish(post(),db));await assertFails(setDoc(doc(db,'posts','audit-poll','votes',voter),ballot()));
});
for(const direction of ['author','voter'])test(`bloqueio ${direction} impede voto sem afetar quem não foi bloqueado`,async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'users',direction==='author'?author:voter,'blocks',direction==='author'?voter:author),{createdAt:Timestamp.now()}));
 await assertFails(setDoc(doc(as(),'posts','audit-poll','votes',voter),ballot()));
 const other='audit-other';await assertSucceeds(setDoc(doc(as(other),'posts','audit-poll','votes',other),{uid:other,option:0,updatedAt:serverTimestamp()}));
});

// S02: these controls exercise receipt semantics in the real rule engine.
async function receipt(postId='s02-post',patch={}){const data=post({type:'text',pollOptions:[]});const canonical={...data};delete canonical.createdAt;await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'publicationApprovals',postId),{uid:voter,post:canonical,used:false,expiresAt:Timestamp.fromMillis(Date.now()+60000),...patch}));return data;}
function receiptBatch(data,postId='s02-post',receiptId=postId){const db=as(),batch=writeBatch(db);batch.set(doc(db,'posts',postId),data);batch.set(doc(db,'limites',voter),{post:serverTimestamp()});batch.update(doc(db,'publicationApprovals',receiptId),{used:true,usedAt:serverTimestamp()});return batch.commit();}
test('S02 publicação direta sem aprovação do backend é negada',async()=>{const db=as(),batch=writeBatch(db);batch.set(doc(db,'posts','s02-post'),post({type:'text',pollOptions:[]}));batch.set(doc(db,'limites',voter),{post:serverTimestamp()});await assertFails(batch.commit());});
test('S02 cliente não fabrica aprovação nem consome recibo sozinho',async()=>{
 const db=as();await assertFails(setDoc(doc(db,'publicationApprovals','fake'),{uid:voter,used:false,post:{},expiresAt:Timestamp.fromMillis(Date.now()+60000)}));
 await receipt();await assertFails(updateDoc(doc(db,'publicationApprovals','s02-post'),{used:true,usedAt:serverTimestamp()}));
});
test('S02 recibo válido publica e consome em um lote; replay em outro ID é negado',async()=>{const data=await receipt();await assertSucceeds(receiptBatch(data));assert.equal((await getDoc(doc(as(),'publicationApprovals','s02-post'))).data().used,true);await env.withSecurityRulesDisabled(ctx=>deleteDoc(doc(ctx.firestore(),'limites',voter)));await assertFails(receiptBatch(data,'replay','s02-post'));});
for(const patch of [{expiresAt:Timestamp.fromMillis(0)},{uid:author},{used:true}])test(`S02 rejeita recibo ${Object.keys(patch)[0]}`,async()=>{const data=await receipt('s02-post',patch);await assertFails(receiptBatch(data));});
for(const change of [{description:'conteúdo alterado'},{mediaUrl:'https://evil.test/replaced'},{authorVerified:true}])test(`S02 conteúdo autorizado não pode mudar ${Object.keys(change)[0]}`,async()=>{const data=await receipt();await assertFails(receiptBatch({...data,...change}));});
test('S02 expiração de selo é conferida na publicação nova',async()=>{
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'users',voter),{verification:{status:'active',expiresAt:Timestamp.fromMillis(1)}}));
 const data=await receipt();await assertSucceeds(receiptBatch(data));
});
test('S02 recibo não pode ser lido por outra conta ou listado',async()=>{await receipt();await assertSucceeds(getDoc(doc(as(),'publicationApprovals','s02-post')));await assertFails(getDoc(doc(as(author),'publicationApprovals','s02-post')));});

// Exercise the production REST write shape against the actual local Emulator,
// including preconditions and an empty update mask plus timestamp transform.
import {publicationStore} from '../../something-gamer-api/src/publication.js';
test('S02 publicação administrativa REST cria post/recibo/auditoria atomicamente e preserva outros limites',async()=>{
 const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateKey=Buffer.from(await crypto.subtle.exportKey('pkcs8',key.privateKey)).toString('base64');
 const config={FIREBASE_PROJECT_ID:'demo-sg',FIRESTORE_SERVICE_ACCOUNT:JSON.stringify({project_id:'demo-sg',client_email:'emulator-only@example.test',private_key:privateKey})};
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'limites',voter),{mensagem:Timestamp.fromMillis(1234)}));
 const original=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);
  if(url.origin==='https://oauth2.googleapis.com')return Response.json({access_token:'local-emulator-owner'});
  if(url.origin==='https://firestore.googleapis.com'){url.protocol='http:';url.host='127.0.0.1:8085';return original(url,{...init,headers:{...init.headers,Authorization:'Bearer owner'}});}
  if(url.hostname==='127.0.0.1'&&url.port==='8085')return original(input,init);
  throw Error('External request forbidden in emulator tests');
 };
 try{const data=post({type:'text',pollOptions:[]});delete data.createdAt;await publicationStore(config).publish('admin-rest',voter,data,{uid:'test-admin'},'Revisão isolada do teste real de regras.');}finally{globalThis.fetch=original;}
 const [created,approval,limits]=await Promise.all([getDoc(doc(as(),'posts','admin-rest')),getDoc(doc(as(),'publicationApprovals','admin-rest')),getDoc(doc(as(),'limites',voter))]);
 assert.equal(created.data().uid,voter);assert.ok(created.data().createdAt instanceof Timestamp);assert.equal(approval.data().used,true);assert.equal(limits.data().mensagem.toMillis(),1234);assert.ok(limits.data().post instanceof Timestamp);
});
