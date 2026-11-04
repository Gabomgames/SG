import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateMediaResolver} from '../private-media-client.js';
const reference='https://api.test/private-media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(fetcher){
 let user={uid:'alice',getIdToken:async()=> 'alice-test-token'};const created=[],revoked=[],requests=[],waits=[];
 const client=createPrivateMediaResolver({currentUser:()=>user,baseUrl:'https://api.test',headers:async()=>({'X-Firebase-AppCheck':'fixture'}),fetcher:async(...args)=>{requests.push(args);return fetcher(...args);},createUrl:blob=>{assert.ok(blob instanceof Blob);const url='blob:local-test/'+created.length;created.push(url);return url;},revokeUrl:url=>revoked.push(url),wait:async ms=>{waits.push(ms);}});
 return {client,created,revoked,requests,waits,setUser:next=>{user=next;}};
}
test('S03 cliente entrega blob privado e revoga os URLs da conversa',async()=>{
 const f=fixture(async()=>new Response('synthetic bytes'));const url=await f.client.resolve(reference);assert.equal(url,f.created[0]);assert.equal(f.requests[0][0],'https://api.test/media/read');assert.equal(f.requests[0][1].cache,'no-store');assert.equal(f.requests[0][1].headers.Authorization,'Bearer alice-test-token');assert.equal(f.requests[0][1].headers['X-Firebase-AppCheck'],'fixture');f.client.revoke();assert.deepEqual(f.revoked,[url]);
});
test('S03 cliente não envia token antigo ao gateway legado',async()=>{
 const f=fixture(async()=>new Response('synthetic bytes'));await f.client.resolve('https://firebasestorage.googleapis.com/v0/b/demo-sg.appspot.com/o/chat%2Falice%2Falice_bob%2Ftest.png?alt=media&token=synthetic-old-token');assert.equal(f.requests[0][0],'https://api.test/media/legacy/read');assert.equal(f.requests[0][1].body.includes('synthetic-old-token'),false);
});
test('S03 resposta HTTP pendente não atravessa troca de conta',async()=>{
 const reply=deferred(),f=fixture(()=>reply.promise),promise=f.client.resolve(reference),denied=assert.rejects(promise,/sessão ou a conversa mudou/);await settle();f.setUser({uid:'bob'});reply.resolve(new Response('private bytes'));await denied;assert.equal(f.created.length,0);
});
test('S03 logout durante leitura do corpo não cria novo blob privado',async()=>{
 const body=deferred(),f=fixture(async()=>({status:200,ok:true,blob:()=>body.promise})),promise=f.client.resolve(reference),denied=assert.rejects(promise,/sessão ou a conversa mudou/);await settle();f.setUser(null);f.client.synchronize();body.resolve(new Blob(['private bytes']));await denied;assert.equal(f.created.length,0);
});
test('S03 troca de conversa invalida resposta pendente mesmo com o mesmo UID',async()=>{
 const reply=deferred(),f=fixture(()=>reply.promise),promise=f.client.resolve(reference),denied=assert.rejects(promise,/sessão ou a conversa mudou/);await settle();f.client.revoke();reply.resolve(new Response('private bytes'));await denied;assert.equal(f.created.length,0);
});
test('S03 troca direta de conta revoga os blobs já exibidos',async()=>{
 const f=fixture(async()=>new Response('private bytes')),url=await f.client.resolve(reference);f.setUser({uid:'bob'});f.client.synchronize();assert.deepEqual(f.revoked,[url]);
});
test('S03 mantém retry de disponibilidade com autorização renovada',async()=>{
 let calls=0;const f=fixture(async()=>++calls===1?new Response('',{status:503}):new Response('private bytes'));await f.client.resolve(reference);assert.equal(f.requests.length,2);assert.deepEqual(f.waits,[400]);assert.ok(f.requests.every(r=>r[1].headers.Authorization==='Bearer alice-test-token'));
});
test('S03 erro de autorização e URL de outra origem não criam blobs',async()=>{
 const f=fixture(async()=>new Response('',{status:403}));await assert.rejects(()=>f.client.resolve(reference),/acesso indisponível/);await assert.rejects(()=>f.client.resolve(reference.replace('api.test','other.test')),/inválida/);assert.equal(f.created.length,0);assert.equal(f.requests.length,1);
});
