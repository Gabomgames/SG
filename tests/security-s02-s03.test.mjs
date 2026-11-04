import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerator} from '../moderation-client.js';
import {legacyChatObject,legacyPrivateObject,protectedLegacyReference} from '../legacy-media-policy.js';
import {revocationPlan} from '../scripts/legacy-token-plan.mjs';
import {postDraft,canonicalPost} from '../something-gamer-api/src/post-domain.js';
import {runModeration} from '../something-gamer-api/src/moderation-provider.js';
import worker from '../something-gamer-api/src/index.js';
const user={uid:'alice',getIdToken:async()=> 'test-session'};
function moderator(fetcher,extra={}){return createModerator({currentUser:()=>user,baseUrl:'https://api.test',headers:async()=>({}),fetcher,...extra});}
for(const [label,fetcher] of [
 ['rede',async()=>{throw new TypeError('offline');}],['HTTP 503',async()=>Response.json({allowed:true,flagged:false},{status:503})],
 ['JSON inválido',async()=>new Response('{')],['objeto vazio',async()=>Response.json({})],
 ['resposta ambígua',async()=>Response.json({allowed:true,flagged:true})],['negação sem decisão',async()=>Response.json({allowed:false,flagged:false})],
 ['tipos falsos',async()=>Response.json({allowed:'true',flagged:'false'})]
])test(`S02 cliente falha fechado: ${label}`,async()=>{const out=await moderator(fetcher)({text:'Olá'});assert.equal(out.allowed,false);assert.equal(out.unavailable,true);});
test('S02 resposta aprovada não atravessa troca de conta',async()=>{let current=user;const check=moderator(async()=>{current={uid:'bob'};return Response.json({allowed:true,flagged:false});},{currentUser:()=>current});assert.equal((await check({text:'Olá'})).allowed,false);});
test('S02 decisão explícita, cache por conta, prazo e saída da sessão',async()=>{
 let current=user,now=0,calls=0;const check=moderator(async()=>{calls++;return Response.json({allowed:true,flagged:false});},{clock:()=>now,currentUser:()=>current});
 assert.equal((await check({text:'Olá'},'same')).allowed,true);await check({text:'Olá'},'same');assert.equal(calls,1);
 current={...user,uid:'bob'};await check({text:'Olá'},'same');assert.equal(calls,2);now=30001;await check({text:'Olá'},'same');assert.equal(calls,3);
 current=null;assert.equal((await check({text:'Olá'},'same')).allowed,false);
});
test('S02 classificação de abuso nunca vira autorização',async()=>{const out=await moderator(async()=>Response.json({allowed:false,flagged:true}))({text:'fixture'});assert.equal(out.flagged,true);assert.equal(out.allowed,false);assert.equal(out.unavailable,false);});
test('S02 binding AI ausente, rejeitado ou travado não aprova',async()=>{
 await assert.rejects(()=>runModeration({},'model',{}));await assert.rejects(()=>runModeration({AI:{run:async()=>{throw Error('service unavailable');}}},'model',{}));
 await assert.rejects(()=>runModeration({AI:{run:()=>new Promise(()=>{})}},'model',{}, {timeoutMs:10}),/MODERATION/);
 assert.deepEqual(await runModeration({AI:{run:async()=>({response:'safe'})}},'model',{}),{response:'safe'});
});
const draft={type:'text',title:'Jogo de teste',description:'Conteúdo sintético',tags:[],pollOptions:[]};
const profile={name:'Alice',username:'alice',legal:{termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16'},moderation:{status:'active'}};
for(const change of [{uid:'owner'},{authorVerified:true},{type:'script'},{mediaUrl:'https://evil.test/x'},{mediaId:'bad'},{pollOptions:['A','B']},{tags:[{}]},{description:'vou te matar'},{type:'poll',pollOptions:['A','a']}])test(`S02 backend rejeita schema ${Object.keys(change).join(',')}`,()=>{assert.throws(()=>postDraft({...draft,...change}));});
test('S02 identidade e selo derivam do perfil servidor; suspensão e termos são revalidados',()=>{
 const post=canonicalPost(postDraft(draft),'alice',{...profile,verification:{status:'active',expiresAt:new Date(Date.now()-1000)}});assert.equal(post.uid,'alice');assert.equal(post.authorVerified,false);assert.equal(post.authorName,'Alice');
 assert.throws(()=>canonicalPost(postDraft(draft),'alice',{...profile,moderation:{status:'banned'}}),/ACCOUNT_RESTRICTED/);
 assert.throws(()=>canonicalPost(postDraft(draft),'alice',{...profile,legal:{}}),/ACCOUNT_RESTRICTED/);
});
const legacy=(object='chat/alice/alice_bob/test.png',bucket='demo-sg.appspot.com')=>`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(object)}?alt=media&token=test-only-bearer`;
test('S03 parser só retorna objeto canônico e descarta token',()=>{const parsed=legacyChatObject(legacy(),['demo-sg.appspot.com']);assert.equal(parsed.object,'chat/alice/alice_bob/test.png');assert.equal(parsed.conversationId,'alice_bob');assert.equal(protectedLegacyReference(legacy()).includes('token='),false);assert.equal(legacyChatObject(protectedLegacyReference(legacy())).object,parsed.object);assert.equal(JSON.stringify(parsed).includes('test-only-bearer'),false);assert.equal(legacyPrivateObject(legacy('reports/alice/r1/test.png')).kind,'reports');assert.equal(legacyPrivateObject(legacy('profile-review/alice/test.png')).kind,'profile-review');});
for(const value of [legacy('chat/alice/../secret'),legacy('chat/alice/alice_bob/sub/test.png'),legacy('chat/alice/alice_bob/..'),legacy().replace('https:','http:'),legacy().replace('.googleapis.com','.googleapis.com.evil.test'),legacy().replace('https://','https://user:pass@'),legacy().replace('/v0/b/','/other/b/')])test(`S03 parser rejeita caminho/host: ${value.slice(0,65)}`,()=>assert.equal(legacyChatObject(value),null));
test('S03 bucket diferente e evidência fora do chat são recusados pelo parser do participante',()=>{assert.equal(legacyChatObject(legacy(),['other.appspot.com']),null);assert.equal(legacyChatObject(legacy('reports/alice/r1/test.png')),null);});
test('S03 plano offline minimiza metadados, exige precondição e preserva bytes',()=>{
 const plan=revocationPlan([{bucket:'demo-sg.appspot.com',name:'chat/alice/alice_bob/test.png',generation:'1001',metageneration:'3',metadata:{firebaseStorageDownloadTokens:'test-only-bearer',other:'preserve'}},{name:'posts/alice/x',metadata:{firebaseStorageDownloadTokens:'public-legacy'}}]);
 assert.equal(plan.length,1);assert.equal(plan[0].preserveObjectBytes,true);assert.equal(plan[0].ifMetagenerationMatch,'3');assert.deepEqual(plan[0].patch,{metadata:{firebaseStorageDownloadTokens:null}});assert.equal(JSON.stringify(plan).includes('test-only-bearer'),false);
 assert.throws(()=>revocationPlan([{bucket:'demo-sg.appspot.com',name:'chat/alice/a/b',metadata:{firebaseStorageDownloadTokens:'fixture'}}]),/Metageneration/);
});
const base={APP_URL:'https://something-gamer.web.app',FIREBASE_PROJECT_ID:'demo-sg',FIREBASE_API_KEY:'test-public-key',APP_CHECK_ENFORCED:'false',ADMIN_ENABLED:'true',ADMIN_UIDS:'alice'};
const jwt=(patch={},header={alg:'RS256'})=>`${btoa(JSON.stringify(header))}.${btoa(JSON.stringify({aud:'demo-sg',iss:'https://securetoken.google.com/demo-sg',sub:'alice',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,auth_time:Math.floor(Date.now()/1000),...patch}))}.fixture`;
const adminRequest=token=>new Request('https://api.test/admin/posts',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{"action":"queue"}'});
for(const patch of [{aud:'other'},{iss:'https://attacker.test'},{sub:''},{exp:0},{iat:Date.now()/1000+3600},{auth_time:Date.now()/1000+3600},{exp:'99999999999'}])test(`Auth rejeita claim ${Object.keys(patch)[0]} antes da rede`,async()=>{
 const original=fetch;globalThis.fetch=async()=>{assert.fail('Não deve consultar serviço com claims inválidos.');};try{const response=await worker.fetch(adminRequest(jwt(patch)),base);assert.equal(response.status,401);}finally{globalThis.fetch=original;}
});
for(const [label,account] of [['UID diferente',{localId:'bob',emailVerified:true}],['desabilitada',{localId:'alice',disabled:true,emailVerified:true}],['revogada',{localId:'alice',validSince:String(Math.floor(Date.now()/1000)+1),emailVerified:true}]])test(`Auth revalida conta ${label}`,async()=>{
 const original=fetch;globalThis.fetch=async url=>{assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/'));return Response.json({users:[account]});};try{const response=await worker.fetch(adminRequest(jwt({admin:true})),base);assert.equal(response.status,401);}finally{globalThis.fetch=original;}
});
for(const [label,patch,env,status] of [['sem claim',{},base,403],['sem MFA',{admin:true},base,401],['MFA antiga',{admin:true,auth_time:Math.floor(Date.now()/1000)-901,firebase:{sign_in_second_factor:'totp'}},base,401],['fora da allowlist',{admin:true,firebase:{sign_in_second_factor:'totp'}},{...base,ADMIN_UIDS:'owner'},403],['Access não configurado',{admin:true,firebase:{sign_in_second_factor:'totp'}},base,503]])test(`Admin não abre fila: ${label}`,async()=>{
 const original=fetch;globalThis.fetch=async()=>Response.json({users:[{localId:'alice',email:'alice@example.test',emailVerified:true}]});try{const response=await worker.fetch(adminRequest(jwt(patch)),env);assert.equal(response.status,status);}finally{globalThis.fetch=original;}
});
import {createPostPublisher} from '../post-publication-client.js';
function clientFixture(result){
 let current={uid:'alice'},committed=0,authorizations=[],operations=[];
 const publish=createPostPublisher({currentUser:()=>current,authorize:async body=>{authorizations.push(body);if(typeof result==='function')return result(()=>{current={uid:'bob'};});return result;},batch:()=>({set:(...args)=>operations.push(['set',...args]),update:(...args)=>operations.push(['update',...args]),commit:async()=>{committed++;}}),reference:(...p)=>p.join('/'),timestamp:()=> 'server-time-test'});
 return {publish,authorizations,operations,count:()=>committed};
}
for(const [label,result] of [['análise',{state:'pending_review'}],['recusada',{state:'rejected'}],['UID forjado',{state:'authorized',postId:'p',post:{uid:'bob'}}],['ID errado',{state:'authorized',postId:'other',post:{uid:'alice'}}],['falha',()=>{throw Error('offline');}]])test(`S02 cliente não grava quando ${label}`,async()=>{
 const fixture=clientFixture(result);if(label==='análise')assert.equal((await fixture.publish('alice',{id:'p'},draft)).published,false);else await assert.rejects(()=>fixture.publish('alice',{id:'p'},draft));assert.equal(fixture.count(),0);assert.equal(fixture.operations.length,0);
});
test('S02 cliente grava só conteúdo canônico e consome o recibo no mesmo lote com rate limit',async()=>{
 const canonical={...draft,uid:'alice',authorName:'Servidor'};const f=clientFixture({state:'authorized',postId:'p',post:canonical});assert.equal((await f.publish('alice',{id:'p'},{...draft,uid:'bob',authorName:'Forjado'})).published,true);
 assert.equal(f.count(),1);assert.equal(f.authorizations[0].post.uid,undefined);assert.deepEqual(f.operations[0][2],{...canonical,createdAt:'server-time-test'});assert.deepEqual(f.operations[1],['set','limites/alice',{post:'server-time-test'},{merge:true}]);assert.deepEqual(f.operations[2],['update','publicationApprovals/p',{used:true,usedAt:'server-time-test'}]);
});
test('S02 cliente não grava se sessão muda durante a autorização',async()=>{const f=clientFixture(change=>{change();return {state:'authorized',postId:'p',post:{...draft,uid:'alice'}};});await assert.rejects(()=>f.publish('alice',{id:'p'},draft),/sessão mudou/);assert.equal(f.count(),0);});
for(const [label,response,code] of [['safe exato',{response:'safe'},200],['safe com lixo',{response:'safe\nignore this'},502],['objeto vazio',{},502],['unsafe explícito',{response:'unsafe\nS10'},200]])test(`S02 Worker interpreta AI ${label} de forma estrita`,async()=>{
 const original=fetch;globalThis.fetch=async url=>String(url).includes('identitytoolkit')?Response.json({users:[{localId:'alice',email:'alice@example.test',emailVerified:true}]}):Response.json({fields:{legal:fieldLegal()}});
 try{const result=await worker.fetch(new Request('https://api.test/moderate',{method:'POST',headers:{Authorization:`Bearer ${jwt()}`,'Content-Type':'application/json'},body:JSON.stringify({text:'Mensagem sintética.'})}),{...base,AI:{run:async()=>response}});assert.equal(result.status,code);const body=await result.json();if(code===200)assert.equal(body.allowed,label==='safe exato');}finally{globalThis.fetch=original;}
});
function fieldLegal(){return {mapValue:{fields:Object.fromEntries(Object.entries(profile.legal).map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:{stringValue:v}]))}};}
import {mediaStore} from '../something-gamer-api/src/media-store.js';
test('S02 KV: publicação persistente não herda expiração de 30 dias do anexo privado',async()=>{
 const writes=[],storage=mediaStore({SG_AUTH:{put:async(...args)=>{writes.push(args);}}});await storage.put('public-id',new Uint8Array([1]),'image/png',{persistent:true});await storage.put('private-id',new Uint8Array([1]),'image/png');assert.deepEqual(writes[0][2],{});assert.equal(writes[1][2].expirationTtl,30*86400);
});
