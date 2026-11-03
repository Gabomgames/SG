import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ref as storageRef,uploadBytes,getBytes,getDownloadURL} from 'firebase/storage';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,updateDoc,serverTimestamp,Timestamp,collection,getDocs,query,where,orderBy,limit} from 'firebase/firestore';
if(process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199'||process.env.GCLOUD_PROJECT!=='demo-sg') throw new Error('Testes Firestore exigem o emulador local 127.0.0.1:8085; produção não é permitida.');
let env;
const legal={termsAccepted:true,termsVersion:'2026-09-16',privacyVersion:'2026-09-16',communityRulesVersion:'2026-09-16',acceptedAt:Timestamp.now()};
const listing={sellerUid:'alice',sellerName:'Alice',title:'Console real',price:100,category:'Consoles',condition:'Usado',description:'Produto físico',location:'Região',imageUrl:'',lat:null,lng:null,locationRadius:10,locationPrecision:'approximate',locationCity:'',status:'active',featured:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
const message=()=>({uid:'alice',authorName:'Alice',authorUsername:'alice',authorPhoto:'',authorVerified:false,authorAccountType:'gamer',authorBadgeTheme:'blue',authorBadges:{},type:'text',text:'Olá Bob',mediaUrl:'',clientCreatedAt:Date.now(),createdAt:serverTimestamp(),clientId:'m1'});
const as=uid=>env.authenticatedContext(uid).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-sg',firestore:{host:'127.0.0.1',port:8085,rules:fs.readFileSync('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:9199,rules:fs.readFileSync('storage.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await Promise.all(['alice','bob','eve'].map(uid=>setDoc(doc(db,'users',uid),{uid,name:uid==='alice'?'Alice':uid,username:uid,photoURL:'',legal,moderation:{status:'active'}})));await setDoc(doc(db,'friendships','alice_bob'),{members:['alice','bob'],gamerStatus:'accepted'});await setDoc(doc(db,'conversations','alice_bob'),{members:['alice','bob'],updatedAt:Timestamp.now()});await setDoc(doc(db,'servers','private'),{ownerUid:'alice',name:'Privado',members:['alice'],visibility:'private',createdAt:Timestamp.now()});await setDoc(doc(db,'servers','public'),{ownerUid:'alice',name:'Público',members:['alice'],visibility:'public',createdAt:Timestamp.now()})})});
test('participante lê conversa; terceiro e anônimo não',async()=>{await assertSucceeds(getDoc(doc(as('alice'),'conversations','alice_bob')));await assertFails(getDoc(doc(as('eve'),'conversations','alice_bob')));await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'conversations','alice_bob')))});
test('mensagem persiste com autoria validada',async()=>{const ref=doc(as('alice'),'conversations','alice_bob','messages','m1');await assertSucceeds(setDoc(ref,message()));const snap=await assertSucceeds(getDoc(doc(as('bob'),'conversations','alice_bob','messages','m1')));assert.equal(snap.data().text,'Olá Bob')});
test('terceiro não escreve, nem lê histórico',async()=>{await assertFails(setDoc(doc(as('eve'),'conversations','alice_bob','messages','m1'),{...message(),uid:'eve'}));await assertFails(getDocs(collection(as('eve'),'conversations','alice_bob','messages')))});
test('forjar autor, selo ou campo extra é negado',async()=>{for(const change of [{authorName:'Admin'},{authorVerified:true},{admin:true},{uid:'bob'}])await assertFails(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),{...message(),...change}))});
test('resposta limitada e criada corretamente',async()=>{await assertSucceeds(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),{...message(),replyTo:{id:'older',authorName:'Bob',text:'Mensagem anterior'}}));await assertFails(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m2'),{...message(),replyTo:{text:'x'.repeat(121)}}))});
test('bloqueio bidirecional impede nova leitura e envio',async()=>{await assertSucceeds(setDoc(doc(as('bob'),'users','bob','blocks','alice'),{createdAt:serverTimestamp()}));await assertFails(getDoc(doc(as('alice'),'conversations','alice_bob')));await assertFails(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),message()));await assertSucceeds(getDocs(collection(as('bob'),'users','bob','blocks')))});
test('recibos não podem forjar leitura alheia ou futura',async()=>{await assertSucceeds(updateDoc(doc(as('alice'),'conversations','alice_bob'),{'reads.alice':serverTimestamp()}));await assertFails(updateDoc(doc(as('alice'),'conversations','alice_bob'),{'reads.bob':serverTimestamp()}));await assertFails(updateDoc(doc(as('alice'),'conversations','alice_bob'),{'reads.alice':Timestamp.fromMillis(Date.now()+86400000)}))});
test('membros da conversa não podem ser trocados',async()=>{await assertFails(updateDoc(doc(as('alice'),'conversations','alice_bob'),{members:['alice','eve']}))});
test('painel: claim admin não libera leitura/escrita direta global',async()=>{const db=env.authenticatedContext('alice',{admin:true}).firestore();await assertFails(getDoc(doc(db,'users','bob')));await assertFails(setDoc(doc(db,'users','bob'),{verification:{status:'active'}},{merge:true}));await assertFails(setDoc(doc(db,'adminAuditLogs','fake'),{action:'fake'}))});
test('conhecer ID não permite entrar em servidor privado',async()=>{await assertFails(updateDoc(doc(as('bob'),'servers','private'),{members:['alice','bob'],updatedAt:serverTimestamp()}));await assertSucceeds(updateDoc(doc(as('bob'),'servers','public'),{members:['alice','bob'],updatedAt:serverTimestamp()}))});
test('convite individual permite entrada privada e expiração impede',async()=>{await assertSucceeds(setDoc(doc(as('alice'),'serverInvites','private_bob'),{serverId:'private',toUid:'bob',createdAt:serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+60000)}));await assertSucceeds(updateDoc(doc(as('bob'),'servers','private'),{members:['alice','bob'],updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(as('eve'),'servers','private'),{members:['alice','bob','eve'],updatedAt:serverTimestamp()}))});
test('dono não pode remover a si nem transferir dono pelo cliente',async()=>{await assertFails(updateDoc(doc(as('alice'),'servers','private'),{members:[],updatedAt:serverTimestamp()}));await assertFails(updateDoc(doc(as('alice'),'servers','private'),{ownerUid:'bob',members:['bob'],updatedAt:serverTimestamp()}))});
test('market publica anúncio real; preço e destaque forjados são negados',async()=>{const db=as('alice');await assertSucceeds(setDoc(doc(db,'marketListings','valid'),listing));await assertFails(setDoc(doc(db,'marketListings','negative'),{...listing,price:-1}));await assertFails(setDoc(doc(db,'marketListings','fake'),{...listing,featured:true}));await assertFails(setDoc(doc(db,'marketListings','unknown'),{...listing,sold:true}));await assertFails(updateDoc(doc(db,'marketListings','valid'),{price:-1,updatedAt:serverTimestamp()}))});
test('seller alheio não altera anúncio e cliente não cria pedido pago',async()=>{await assertSucceeds(setDoc(doc(as('alice'),'marketListings','valid'),listing));await assertFails(updateDoc(doc(as('bob'),'marketListings','valid'),{price:1,updatedAt:serverTimestamp()}));await assertFails(setDoc(doc(as('bob'),'marketOrders','order'),{buyerUid:'bob',sellerUid:'alice',status:'paid'}))});
test('nenhuma localização exata pública em novo anúncio',async()=>{await assertFails(setDoc(doc(as('alice'),'marketListings','exact'),{...listing,locationPrecision:'exact',lat:10.123456,lng:20.123456}))});
test('fila de verificação e benefícios financeiros só pelo servidor',async()=>{await assertFails(setDoc(doc(as('alice'),'verificationRequests','alice'),{uid:'alice',status:'pending'}));await assertFails(updateDoc(doc(as('alice'),'users','alice'),{monetization:{seller_pro:{status:'active'}}}))});
test('clientes não concedem vagas, alteram contador ou removem bloqueio antifraude',async()=>{
 for(const path of [['founderCampaigns','launch'],['founderGrants','alice'],['founderEmails','fixture-hash'],['founderRisk','alice']])await assertFails(setDoc(doc(as('alice'),...path),{enabled:true,granted:0,status:'active'}));
 for(const field of ['founderGrant','paidVerification'])await assertFails(updateDoc(doc(as('alice'),'users','alice'),{[field]:{status:'active'}}));
});
test('cadastro não pode forjar concessão fundadora ou verificação paga',async()=>{
 for(const field of ['founderGrant','paidVerification'])await assertFails(setDoc(doc(as('newbie'),'users','newbie'),{uid:'newbie',name:'Newbie',username:'newbie',bio:'',[field]:{status:'active'}}));
});
test('concessão fundadora só é lida pelo destinatário ou administrador',async()=>{
 await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'founderGrants','alice'),{uid:'alice',status:'active'}));
 await assertSucceeds(getDoc(doc(as('alice'),'founderGrants','alice')));
 await assertFails(getDoc(doc(as('bob'),'founderGrants','alice')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'founderGrants','alice')));
 await assertFails(getDoc(doc(as('alice'),'founderCampaigns','launch')));
});
test('coleção de mensagens comunitárias legada sem membership está bloqueada',async()=>{await assertFails(getDocs(collection(as('alice'),'communityMessages')));await assertFails(setDoc(doc(as('alice'),'communityMessages','m1'),{uid:'alice',text:'teste'}))});
test('consulta inbox ordenada continua permitida',async()=>{await assertSucceeds(getDocs(query(collection(as('alice'),'conversations'),where('members','array-contains','alice'),orderBy('updatedAt','desc'),limit(100))))});
test('reações e edição próprias continuam funcionais',async()=>{await assertSucceeds(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),message()));await assertSucceeds(updateDoc(doc(as('bob'),'conversations','alice_bob','messages','m1'),{'reactions.bob':'👍'}));await assertSucceeds(updateDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),{text:'Olá, editado',edited:true,editedAt:serverTimestamp()}));await assertFails(updateDoc(doc(as('bob'),'conversations','alice_bob','messages','m1'),{text:'Forjado',edited:true,editedAt:serverTimestamp()}))});
test('cadastro não pode atribuir plano ou papel administrativo',async()=>{const db=as('new-user'),data={uid:'new-user',name:'Novo',username:'novo',ageVerified:true,birthDate:'1990-01-01',legal:{...legal,acceptedAt:serverTimestamp()}};await assertSucceeds(setDoc(doc(db,'users','new-user'),data));await env.clearFirestore();await assertFails(setDoc(doc(db,'users','new-user'),{...data,monetization:{seller_pro:{status:'active'}}}))});
test('preferências de conversa são privadas e não permitem acessar conta alheia',async()=>{const value={path:'conversations/alice_bob',muted:true,archived:true,hiddenIds:['m1'],updatedAt:serverTimestamp()};await assertSucceeds(setDoc(doc(as('alice'),'users','alice','chatPreferences','alice_bob'),value));await assertFails(getDoc(doc(as('bob'),'users','alice','chatPreferences','alice_bob')));await assertFails(setDoc(doc(as('bob'),'users','alice','chatPreferences','alice_bob'),value));});
test('silenciar impede aviso, preservando mensagem e leitura autorizada',async()=>{await assertSucceeds(setDoc(doc(as('bob'),'users','bob','chatPreferences','alice_bob'),{path:'conversations/alice_bob',muted:true,archived:false,hiddenIds:[],updatedAt:serverTimestamp()}));await assertSucceeds(setDoc(doc(as('alice'),'conversations','alice_bob','messages','m1'),message()));await assertSucceeds(getDoc(doc(as('bob'),'conversations','alice_bob','messages','m1')));await assertFails(setDoc(doc(as('alice'),'notifications','msg_m1'),{toUid:'bob',fromUid:'alice',type:'message',conversationId:'alice_bob',title:'Nova mensagem',message:'Abra a conversa.',special:false,read:false,createdAt:serverTimestamp()}));});
test('anexos novos exigem endereço privado e recusam URL externa ou promessa de visualização única',async()=>{const m={...message(),type:'image',text:'',mediaUrl:'https://something-gamer-api.something-gamer-nowtech.workers.dev/private-media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'};await assertSucceeds(setDoc(doc(as('alice'),'conversations','alice_bob','messages','image'),m));await assertFails(setDoc(doc(as('alice'),'conversations','alice_bob','messages','unsafe'),{...m,mediaUrl:'https://evil.example/private.png'}));await assertFails(setDoc(doc(as('alice'),'conversations','alice_bob','messages','once'),{...m,viewOnce:true}));});
test('negociação Market exige sala criada pelo servidor e respeita bloqueio',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'conversations','market_test'),{members:['alice','eve'],kind:'market',updatedAt:Timestamp.now()}));
 await assertSucceeds(setDoc(doc(as('alice'),'conversations','market_test','messages','m1'),message()));
 await assertFails(getDoc(doc(as('bob'),'conversations','market_test')));
 await assertFails(setDoc(doc(as('alice'),'conversations','forged_market'),{members:['alice','eve'],kind:'market',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(as('alice'),'conversations','market_test','messages','fake'),{...message(),type:'market_offer',offerId:'fake'}));
 await assertSucceeds(setDoc(doc(as('eve'),'users','eve','blocks','alice'),{createdAt:serverTimestamp()}));
 await assertFails(getDoc(doc(as('alice'),'conversations','market_test')));
});
test('canal de equipe protege mensagens e cargo não pode ser elevado pelo cliente',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'servers','private'),{members:['alice','bob','eve'],roles:{bob:'moderator'}});await setDoc(doc(db,'servers','private','channels','staff'),{name:'equipe',audience:'staff',createdAt:Timestamp.now()});await setDoc(doc(db,'servers','private','channels','staff','messages','staff-message'),{text:'Somente equipe'});});
 await assertSucceeds(getDoc(doc(as('bob'),'servers','private','channels','staff','messages','staff-message')));await assertFails(getDoc(doc(as('eve'),'servers','private','channels','staff','messages','staff-message')));await assertFails(updateDoc(doc(as('eve'),'servers','private'),{roles:{eve:'moderator'}}));
});
test('entrada com aprovação não aceita inclusão direta e pedido não pode ser forjado',async()=>{
 await env.withSecurityRulesDisabled(ctx=>updateDoc(doc(ctx.firestore(),'servers','public'),{joinMode:'approval'}));await assertFails(updateDoc(doc(as('bob'),'servers','public'),{members:['alice','bob'],updatedAt:serverTimestamp()}));await assertFails(setDoc(doc(as('bob'),'serverJoinRequests','public_bob'),{serverId:'public',uid:'bob',state:'approved'}));
});
test('sinalização de voz exige sessões ativas e impede leitura por terceiro',async()=>{
 const aliceSession='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',bobSession='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'servers','private'),{members:['alice','bob','eve']});await setDoc(doc(db,'servers','private','channels','voice'),{name:'voz',kind:'voice',audience:'all',createdAt:Timestamp.now()});await setDoc(doc(db,'servers','private','channels','voice','voice','room'),{members:{alice:{session:aliceSession,expiresAt:Date.now()+90000},bob:{session:bobSession,expiresAt:Date.now()+90000}}});});
 const signal={fromUid:'alice',toUid:'bob',fromSession:aliceSession,toSession:bobSession,kind:'offer',payload:'{"type":"offer","sdp":"fixture"}',createdAt:serverTimestamp()};const path=['servers','private','channels','voice','voiceSignals','s1'];
 await assertSucceeds(setDoc(doc(as('alice'),...path),signal));await assertSucceeds(getDoc(doc(as('bob'),...path)));await assertFails(getDoc(doc(as('eve'),...path)));await assertFails(setDoc(doc(as('eve'),'servers','private','channels','voice','voiceSignals','s2'),{...signal,fromUid:'eve'}));await assertFails(setDoc(doc(as('alice'),'servers','private','channels','voice','voice','room'),{members:{eve:{session:'fake',expiresAt:Date.now()+90000}}}));
});

test('espectador acompanha canal mas não envia mensagens ou altera enquetes',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'servers','private'),{members:['alice','bob'],roles:{bob:'observer'}});await setDoc(doc(db,'servers','private','channels','general'),{name:'geral',kind:'text',audience:'all'});await setDoc(doc(db,'servers','private','channels','general','polls','p1'),{question:'Qual jogo?',options:['A','B'],counts:[0,0]});await setDoc(doc(db,'servers','private','channels','general','messages','m1'),{text:'Mensagem'});});
 await assertSucceeds(getDoc(doc(as('bob'),'servers','private','channels','general','messages','m1')));await assertFails(setDoc(doc(as('bob'),'servers','private','channels','general','messages','m2'),{...message(),uid:'bob',authorName:'bob'}));await assertSucceeds(getDoc(doc(as('bob'),'servers','private','channels','general','polls','p1')));await assertFails(updateDoc(doc(as('bob'),'servers','private','channels','general','polls','p1'),{counts:[100,0]}));await assertFails(setDoc(doc(as('bob'),'servers','private','channels','general','polls','p1','votes','bob'),{option:0}));
});

test('Now Bot protege respostas do quiz e pontuação não pode ser alterada pelo cliente',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{const db=ctx.firestore();await updateDoc(doc(db,'servers','private'),{members:['alice','bob']});await setDoc(doc(db,'servers','private','channels','games'),{name:'jogos',kind:'text',audience:'all'});await setDoc(doc(db,'servers','private','channels','games','botGames','bob'),{answer:'GPU',completed:false});await setDoc(doc(db,'servers','private','channels','games','scores','bob'),{uid:'bob',points:1});});
 await assertFails(getDoc(doc(as('bob'),'servers','private','channels','games','botGames','bob')));await assertSucceeds(getDoc(doc(as('alice'),'servers','private','channels','games','scores','bob')));await assertFails(updateDoc(doc(as('bob'),'servers','private','channels','games','scores','bob'),{points:1000}));
});

// Real Storage Emulator only: prove why deploying deny rules does not revoke
// previously issued bearer URLs. No production requests or object deletion.
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
test('S03 Storage: cliente não cria objetos públicos nem privados por fallback',async()=>{
 for(const name of ['posts/alice/new.png','profiles/alice/new.png','chat/alice/alice_bob/new.png','reports/alice/r1/new.png','profile-review/alice/new.png'])await assertFails(uploadBytes(storageRef(env.authenticatedContext('alice').storage('gs://demo-sg.appspot.com'),name),png,{contentType:'image/png'}));
});
test('S03 Storage: leitura pública legada autorizada é preservada; privada direta é negada',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{for(const name of ['posts/alice/legacy.png','chat/alice/alice_bob/legacy.png'])await uploadBytes(storageRef(ctx.storage('gs://demo-sg.appspot.com'),name),png,{contentType:'image/png'});});
 await assertSucceeds(getBytes(storageRef(env.authenticatedContext('alice').storage('gs://demo-sg.appspot.com'),'posts/alice/legacy.png')));
 await assertFails(getBytes(storageRef(env.unauthenticatedContext().storage('gs://demo-sg.appspot.com'),'posts/alice/legacy.png')));
 await assertFails(getBytes(storageRef(env.authenticatedContext('alice').storage('gs://demo-sg.appspot.com'),'chat/alice/alice_bob/legacy.png')));
});
test('S03 Storage: token antigo atravessa regras; rotação local revoga URL e preserva bytes',async()=>{
 let url;
 await env.withSecurityRulesDisabled(async ctx=>{const file=storageRef(ctx.storage('gs://demo-sg.appspot.com'),'chat/alice/alice_bob/token-fixture.png');await uploadBytes(file,png,{contentType:'image/png'});url=await getDownloadURL(file);});
 const target=new URL(url);assert.equal(target.hostname,'127.0.0.1');assert.equal(target.port,'9199');
 const before=await fetch(url);assert.equal(before.status,200);assert.deepEqual(new Uint8Array(await before.arrayBuffer()),png);
 const oldToken=target.searchParams.get('token');assert.ok(oldToken);target.search='';target.searchParams.set('delete_token',oldToken);
 const revoked=await fetch(target,{method:'POST',headers:{Authorization:'Bearer owner'}});assert.equal(revoked.status,200);
 assert.equal((await fetch(url)).status,403);
 const bytes=await fetch('http://127.0.0.1:9199/storage/v1/b/demo-sg.appspot.com/o/'+encodeURIComponent('chat/alice/alice_bob/token-fixture.png')+'?alt=media',{headers:{Authorization:'Bearer owner'}});
 assert.equal(bytes.status,200);assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()),png);
 // Emulator token API is used here. Real GCS metadata PATCH/preconditions and
 // IAM still require a separately authorized staging check (not simulated).
});
