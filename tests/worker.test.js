import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../something-gamer-api/src/index.js';
import {createOrder,webhookOrder} from '../something-gamer-api/src/payments.js';
const base={APP_URL:'https://something-gamer.web.app',FIREBASE_PROJECT_ID:'something-gamer',FIREBASE_API_KEY:'public-test-key',APP_CHECK_ENFORCED:'false'};
const claims={aud:'something-gamer',iss:'https://securetoken.google.com/something-gamer',sub:'alice',auth_time:Math.floor(Date.now()/1000)};
const token=`${btoa('{}')}.${btoa(JSON.stringify(claims))}.fixture`;
const request=(path,body={},extra={})=>new Request(`https://api.example${path}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
const originalFetch=globalThis.fetch;
function mockAuth(){globalThis.fetch=async url=>{
 if(String(url).startsWith('https://identitytoolkit.googleapis.com/'))return Response.json({users:[{localId:'alice',email:'alice@example.test',emailVerified:true}]});
 if(String(url).includes('firestore.googleapis.com'))return Response.json({fields:{legal:{mapValue:{fields:{termsAccepted:{booleanValue:true},termsVersion:{stringValue:'2026-09-16'},privacyVersion:{stringValue:'2026-09-16'},communityRulesVersion:{stringValue:'2026-09-16'}}}}}});
 throw new Error('UNEXPECTED_NETWORK');
}}
async function signedNumeric(){const id='123456',ts='1727890000',rid='connectivity-test';const sig=createHmac('sha256','fixture').update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex');return new Request(`https://api.example/payments/webhook?data.id=${id}`,{method:'POST',headers:{'x-signature':`ts=${ts},v1=${sig}`,'x-request-id':rid},body:JSON.stringify({data:{id}})})}
test('Worker rejeita Origin malicioso antes de tocar persistência',async()=>{const r=await worker.fetch(request('/payments/create',{}, {Origin:'https://evil.example'}),base);assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null)});
test('CORS local negado por padrão',async()=>{const r=await worker.fetch(request('/payments/create',{}, {Origin:'http://localhost:5500'}),base);assert.equal(r.status,403)});
test('webhook sem assinatura retorna 401 e não consulta provedor',async()=>{const r=await worker.fetch(request('/payments/webhook?data.id=ORD01TESTORDER001'),{...base,MERCADOPAGO_WEBHOOK_SECRET:'fixture'});assert.equal(r.status,401);assert.equal((await r.json()).code,'INVALID_WEBHOOK_SIGNATURE')});
test('webhook sem secret não modifica estado',async()=>{const r=await worker.fetch(await signedNumeric(),base);assert.equal(r.status,503)});
test('simulador assinado testa conectividade, não Order nem pagamento',async()=>{const r=await worker.fetch(await signedNumeric(),{...base,MERCADOPAGO_WEBHOOK_SECRET:'fixture'});assert.equal(r.status,200);assert.equal((await r.json()).ignored,true)});
test('consulta financeira anônima retorna 401',async()=>{const r=await worker.fetch(new Request('https://api.example/payments/list',{method:'POST',body:'{}'}),base);assert.equal(r.status,401)});
test('D1 ausente desabilita pagamento autenticado',async()=>{mockAuth();try{const r=await worker.fetch(request('/payments/create',{plan:'monthly'}),base);assert.equal(r.status,503);assert.equal((await r.json()).code,'PAYMENT_STORAGE_NOT_CONFIGURED')}finally{globalThis.fetch=originalFetch}});
test('health não anuncia compras ou anexos privados habilitados',async()=>{const r=await worker.fetch(new Request('https://api.example/health'),base);const data=await r.json();assert.equal(data.payments,false);assert.equal(data.privateMedia,false);assert.equal(data.marketplaceCheckout,false);assert.equal(r.headers.get('Cache-Control'),'no-store')});
test('novos uploads privados falham antes de gravação',async()=>{mockAuth();try{const env={...base,SG_AUTH:{get:async()=>null,put:()=>assert.fail('KV não deve receber arquivo privado')}};const r=await worker.fetch(new Request('https://api.example/media/upload?scope=private',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])}),env);assert.equal(r.status,503);assert.equal((await r.json()).code,'PRIVATE_MEDIA_NOT_CONFIGURED')}finally{globalThis.fetch=originalFetch}});
test('mídia legada não fica pública antes da revisão do armazenamento',async()=>{const r=await worker.fetch(new Request('https://api.example/media/'+'a'.repeat(48)),base);assert.equal(r.status,503);assert.equal(r.headers.get('Cache-Control'),'no-store')});
test('repetição de checkout usa mesma referência e chave no provedor',async()=>{
 let row=null,calls=0;const db={prepare(sql){let args=[];const stmt={bind(...a){args=a;return stmt},async run(){if(sql.startsWith('INSERT'))row ||= {id:args[0],uid:args[1],client_key:args[2],plan:args[3],days:args[4],amount_cents:args[5],reference:args[6],state:'created',created_at:args[7]};else if(sql.startsWith('UPDATE'))Object.assign(row,{order_id:args[0],checkout_url:args[1],state:'pending'});return{}},async first(){return row}};return stmt}};
 const env={...base,SG_DB:db,PAYMENTS_ENABLED:'true',PAYMENT_ENV:'test',MERCADOPAGO_COLLECTOR_ID:'123',MERCADOPAGO_WEBHOOK_SECRET:'fixture',FIRESTORE_SERVICE_ACCOUNT:'test-not-a-secret'};
 const user={uid:'alice',email:'alice@example.test'},body={plan:'monthly',idempotencyKey:'11111111-1111-1111-1111-111111111111'};
 const provider=async(path,e,init)=>{calls++;assert.equal(init.headers['X-Idempotency-Key'],row.id);const payload=JSON.parse(init.body);assert.equal(payload.total_amount,'14.90');assert.equal(payload.external_reference,row.reference);return{id:'ORD01TESTORDER001',checkout_url:'https://sandbox.mercadopago.com.br/checkout'}};
 const a=await createOrder(request('/payments/create',body),env,user,provider);const b=await createOrder(request('/payments/create',body),env,user,provider);assert.equal(a.orderId,b.orderId);assert.equal(calls,1);assert.equal(b.reused,true);
 await assert.rejects(()=>createOrder(request('/payments/create',{...body,plan:'annual'}),env,user,provider),/IDEMPOTENCY_CONFLICT/);
});
test('conta comum não acessa financeiro, revisão de ADS ou reembolso',async()=>{mockAuth();try{for(const path of ['/admin/payments','/admin/commerce','/adminApi','/ads/review','/market/refund','/market/disputes/resolve','/admin/social','/admin/social/media']){const response=await worker.fetch(request(path,{}),{...base,ADMIN_UIDS:'owner',ADMIN_ENABLED:'true'});assert.equal(response.status,403,path);}}finally{globalThis.fetch=originalFetch;}});
