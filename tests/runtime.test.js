import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {marketApi as realMarketApi} from '../something-gamer-api/src/market.js';
import {reviewMarket as fixtureReviewMarket} from '../something-gamer-api/src/market-discovery.js';
// Existing financial fixtures are explicitly approved by the test administrator, never by client code.
async function marketApi(request,env,user){if(new URL(request.url).pathname.endsWith('/listing/create')){const body=await request.clone().json();if(body.professional!==true){const result=await realMarketApi(new Request(request.url,{method:'POST',body:JSON.stringify({...body,physicalPolicy:true,deliveryMode:'combined'})}),env,user);await fixtureReviewMarket(env,{uid:'test-admin'},{action:'approve',id:result.item.id,reason:'Produto de fixture revisado pelo administrador de teste.',mediaReviewed:true});return realMarketApi(new Request('https://api.test/market/product',{method:'POST',body:JSON.stringify({id:result.item.id})}),env,user);}}return realMarketApi(request,env,user);}
import {encryptCredentials} from '../something-gamer-api/src/seller-oauth.js';
import {uploadPrivate,readPrivate,deletePrivate} from '../something-gamer-api/src/private-media.js';
let mf,db,bucket,env;const originalFetch=globalThis.fetch;
const req=(path,body)=>new Request(`https://api.test/market/${path}`,{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify(body)});
before(async()=>{
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'sg-tests',modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:['SG_DB'],r2Buckets:['SG_MEDIA'],compatibilityDate:'2026-09-11'}]}));
 db=await mf.getD1Database('SG_DB');bucket=await mf.getR2Bucket('SG_MEDIA');
 // D1 exec não aceita statements multilinha; prepare executa cada bloco SQL completo.
 const migrations=fs.readdirSync('something-gamer-api/migrations').sort().map(p=>fs.readFileSync(`something-gamer-api/migrations/${p}`,'utf8')).join('\n');
 const statements=migrations.replace(/^--.*$/gm,'').match(/CREATE TRIGGER[^\n]*END;|CREATE TRIGGER[\s\S]*?^END;|CREATE(?: TABLE| INDEX)[\s\S]*?;/gm)||[];
 for(const sql of statements)await db.prepare(sql).run();
 env={SG_DB:db,SG_MEDIA:bucket,FIREBASE_PROJECT_ID:'demo',PAYMENT_ENV:'test',MARKET_CHECKOUT_ENABLED:'true',MARKETPLACE_APPROVED:'true',MP_CLIENT_ID:'fixture',MP_CLIENT_SECRET:'fixture',API_URL:'https://api.test',SERVICE_DATA_KEY:btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))};
 const credentials=await encryptCredentials({access_token:'fixture-token',refresh_token:'fixture-refresh'},env,'seller');
 await db.prepare('INSERT INTO seller_accounts VALUES (?,?,?,?,?,?)').bind('seller','55',credentials,Date.now()+86400000,'test',Date.now()).run();
});
after(async()=>{globalThis.fetch=originalFetch;await mf?.dispose();});
const listing={idempotencyKey:'product-one',title:'Console real',description:'Produto físico',category:'Consoles',condition:'Usado',returnPolicy:'Entrega e devolução via suporte',stock:1,priceCents:10000,shippingCents:2500};
test('D1 real: publicação, preço do servidor, comissão e reserva idempotente',async()=>{
 const created=await marketApi(req('listing/create',listing),env,{uid:'seller'});assert.equal(created.item.stock,1);
 const body={idempotencyKey:'checkout-alice',items:[{productId:created.item.id,quantity:1,unitCents:1}]};
 const first=await marketApi(req('orders/create',body),env,{uid:'alice'});assert.equal(first.order.total_cents,12500);assert.equal(first.order.commission_cents,1000);
 const again=await marketApi(req('orders/create',body),env,{uid:'alice'});assert.equal(again.order.id,first.order.id);
 assert.equal((await db.prepare('SELECT reserved FROM market_products WHERE id=?').bind(created.item.id).first()).reserved,1);
 await assert.rejects(()=>marketApi(req('orders/create',{...body,idempotencyKey:'other-checkout'}),env,{uid:'bob'}),/RESOURCE_CONFLICT/);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM market_orders').first()).n,1);
});
test('D1 real: estranho não cancela, comprador cancela e libera estoque',async()=>{
 const order=await db.prepare('SELECT * FROM market_orders LIMIT 1').first();
 await assert.rejects(()=>marketApi(req('orders/transition',{id:order.id,state:'cancelled'}),env,{uid:'eve'}),/FORBIDDEN/);
 await marketApi(req('orders/transition',{id:order.id,state:'cancelled'}),env,{uid:'alice'});
 assert.equal((await db.prepare('SELECT reserved FROM market_products LIMIT 1').first()).reserved,0);
});
test('D1 real: proposta, contraproposta, aceite e preço combinado no pedido',async()=>{
 const p=await db.prepare('SELECT id FROM market_products LIMIT 1').first();
 const f=await marketApi(req('offers/create',{productId:p.id,amountCents:8500,quantity:1}),env,{uid:'bob'});
 await marketApi(req('offers/respond',{id:f.id,decision:'countered',amountCents:9000}),env,{uid:'seller'});
 await assert.rejects(()=>marketApi(req('offers/respond',{id:f.id,decision:'accepted'}),env,{uid:'seller'}),/RESOURCE_CONFLICT/);
 await marketApi(req('offers/respond',{id:f.id,decision:'accepted'}),env,{uid:'bob'});
 const out=await marketApi(req('orders/create',{idempotencyKey:'negotiated-bob',items:[{productId:p.id,quantity:1,offerId:f.id}]}),env,{uid:'bob'});
 assert.equal(out.order.total_cents,11500);assert.equal(out.order.commission_cents,900);
});
test('R2 real: mídia privada só entregue após autorização; bloqueio revoga novas leituras',async()=>{
 let blocked=false;globalThis.fetch=async(url)=>{if(blocked)return new Response('{}',{status:403});return Response.json({fields:String(url).includes('/friendships/')?{gamerStatus:{stringValue:'accepted'}}:{}});};
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0]);
 const request=new Request('https://api.test/media/upload?scope=private&conversation=conversations/alice_bob',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'image/png'},body:bytes});
 const uploaded=await uploadPrivate(request,env,{uid:'alice'});
 const read=()=>new Request('https://api.test/media/read',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({id:uploaded.id})});
 const response=await readPrivate(read(),env,{uid:'bob'});assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 blocked=true;await assert.rejects(()=>readPrivate(read(),env,{uid:'bob'}),/FORBIDDEN/);
 blocked=false;await assert.rejects(()=>deletePrivate(read(),env,{uid:'bob'}),/MEDIA_NOT_FOUND/);
 await deletePrivate(read(),env,{uid:'alice'});await assert.rejects(()=>readPrivate(read(),env,{uid:'bob'}),/MEDIA_NOT_FOUND/);
 globalThis.fetch=originalFetch;
});

test('D1 real: anúncio só ativa após revisão; impressão e clique deduplicados',async()=>{
 const {adsApi,reviewAd}=await import('../something-gamer-api/src/ads.js');
 const adReq=(path,body)=>new Request(`https://api.test/ads/${path}`,{method:'POST',body:JSON.stringify(body)});
 const created=await adsApi(adReq('create',{name:'Campanha real de teste',headline:'Conheça meu perfil',creativeText:'Conteúdo gamer',budgetCents:1000,durationDays:2,targetId:'owner',targetType:'profile',policyAccepted:true}),env,{uid:'owner'});
 await assert.rejects(()=>reviewAd(adReq('review',{id:created.id,decision:'approved',reason:'Criativo revisado conforme política.'}),env,{uid:'admin'}),/RESOURCE_CONFLICT/);
 assert.equal((await adsApi(adReq('serve',{}),env,{uid:'viewer'})).ad,null);
 // Fixture financeira controlada no teste; cliente de produção não possui acesso ao D1.
 await db.prepare("UPDATE ad_campaigns SET state='pending_review',payment_state='approved' WHERE id=?").bind(created.id).run();
 await reviewAd(adReq('review',{id:created.id,decision:'approved',reason:'Criativo revisado conforme política.'}),env,{uid:'admin'});
 const served=(await adsApi(adReq('serve',{}),env,{uid:'viewer'})).ad;assert.ok(served);
 assert.equal((await adsApi(adReq('impression',{deliveryId:served.deliveryId}),env,{uid:'other-viewer'})).recorded,false);
 assert.equal((await adsApi(adReq('impression',{deliveryId:served.deliveryId}),env,{uid:'viewer'})).recorded,true);
 assert.equal((await adsApi(adReq('impression',{deliveryId:served.deliveryId}),env,{uid:'viewer'})).recorded,false);
 assert.equal((await adsApi(adReq('click',{deliveryId:served.deliveryId}),env,{uid:'viewer'})).recorded,true);
 assert.equal((await adsApi(adReq('click',{deliveryId:served.deliveryId}),env,{uid:'viewer'})).recorded,false);
 assert.equal((await db.prepare('SELECT spent_cents FROM ad_campaigns WHERE id=?').bind(created.id).first()).spent_cents,1);
});
test('D1 real: orçamento de ADS nunca ultrapassa o saldo',async()=>{
 const {adsApi}=await import('../something-gamer-api/src/ads.js');const adReq=(path,body)=>new Request(`https://api.test/ads/${path}`,{method:'POST',body:JSON.stringify(body)});
 const row=await db.prepare('SELECT id FROM ad_campaigns LIMIT 1').first();await db.prepare('UPDATE ad_campaigns SET spent_cents=budget_cents-1 WHERE id=?').bind(row.id).run();
 const a=(await adsApi(adReq('serve',{}),env,{uid:'viewer-a'})).ad,b=(await adsApi(adReq('serve',{}),env,{uid:'viewer-b'})).ad;
 await adsApi(adReq('impression',{deliveryId:a.deliveryId}),env,{uid:'viewer-a'});
 await assert.rejects(()=>adsApi(adReq('impression',{deliveryId:b.deliveryId}),env,{uid:'viewer-b'}),/AD_BUDGET_EXHAUSTED/);
 const campaign=await db.prepare('SELECT spent_cents,budget_cents FROM ad_campaigns WHERE id=?').bind(row.id).first();assert.equal(campaign.spent_cents,campaign.budget_cents);
 assert.equal((await adsApi(adReq('serve',{}),env,{uid:'viewer-c'})).ad,null);
});
test('D1 real: autorização recorrente não concede benefício; só pagamento confirmado vigente',async()=>{
 const {entitlement}=await import('../something-gamer-api/src/subscriptions.js');const now=Date.now();
 await db.prepare("INSERT INTO subscriptions(id,uid,plan,client_key,reference,price_cents,consent_version,consented_at,created_at,updated_at,status) VALUES ('s1','creator','creator_plus','intent-one','sgs_s1',1990,'test-only',?,?,?,'authorized')").bind(now,now,now).run();
 assert.equal(await entitlement(env,'creator','creator_plus'),false);
 await db.prepare("INSERT INTO subscription_charges VALUES ('payment1','s1','approved',1990,?,?,?)").bind(now,now+86400000,now).run();assert.equal(await entitlement(env,'creator','creator_plus'),true);assert.equal(await entitlement(env,'stranger','creator_plus'),false);
 await db.prepare("UPDATE subscription_charges SET status='refunded' WHERE payment_id='payment1'").run();assert.equal(await entitlement(env,'creator','creator_plus'),false);
});

test('D1 real + provedor isolado: webhook assinado, repetição e estorno não restauram estoque/benefício',async()=>{
 const {marketWebhook}=await import('../something-gamer-api/src/market.js'),{createHmac}=await import('node:crypto');const order=await db.prepare("SELECT * FROM market_orders WHERE buyer_uid='bob' LIMIT 1").first();
 env.MERCADOPAGO_ACCESS_TOKEN='TEST-platform-fixture';env.MERCADOPAGO_WEBHOOK_SECRET='signed-fixture';
 let status='approved';globalThis.fetch=async(url)=>{assert.match(String(url),/^https:\/\/api\.mercadopago\.com\/v1\/payments\/17$/);return Response.json({id:17,external_reference:`sgm_${order.id}`,currency_id:'BRL',collector_id:55,transaction_amount:order.total_cents/100,live_mode:false,status,fee_details:[{type:'application_fee',amount:order.commission_cents/100}]});};
 const signed=()=>{const ts='1727890000',rid='runtime-fixture',signature=createHmac('sha256','signed-fixture').update(`id:17;request-id:${rid};ts:${ts};`).digest('hex');return new Request('https://api.test/market/webhook?data.id=17',{headers:{'x-request-id':rid,'x-signature':`ts=${ts},v1=${signature}`}});};
 await marketWebhook(signed(),env);await marketWebhook(signed(),env);assert.equal((await db.prepare('SELECT state FROM market_orders WHERE id=?').bind(order.id).first()).state,'paid');assert.equal((await db.prepare('SELECT stock,reserved FROM market_products LIMIT 1').first()).stock,0);
 status='refunded';await marketWebhook(signed(),env);status='approved';await marketWebhook(signed(),env);assert.equal((await db.prepare('SELECT state FROM market_orders WHERE id=?').bind(order.id).first()).state,'refunded');assert.equal((await db.prepare('SELECT stock FROM market_products LIMIT 1').first()).stock,0);globalThis.fetch=originalFetch;
});
test('D1 real + provedor isolado: cobrança recorrente confirmada, estorno e replay',async()=>{
 const {subscriptionWebhook,entitlement}=await import('../something-gamer-api/src/subscriptions.js'),{createHmac}=await import('node:crypto');await db.prepare("UPDATE subscriptions SET provider_id='preapproval1' WHERE id='s1'").run();env.MERCADOPAGO_COLLECTOR_ID='55';let status='approved';
 globalThis.fetch=async url=>{if(String(url).endsWith('/authorized_payments/42'))return Response.json({preapproval_id:'preapproval1',payment:{id:99}});assert.ok(String(url).endsWith('/v1/payments/99'));return Response.json({id:99,currency_id:'BRL',transaction_amount:19.9,collector_id:55,live_mode:false,status,date_approved:new Date(Date.now()-1000).toISOString()});};
 const signed=()=>{const ts='1727890000',rid='subscription-fixture',sig=createHmac('sha256','signed-fixture').update(`id:42;request-id:${rid};ts:${ts};`).digest('hex');return new Request('https://api.test/subscriptions/webhook?data.id=42&type=subscription_authorized_payment',{headers:{'x-request-id':rid,'x-signature':`ts=${ts},v1=${sig}`}});};
 await subscriptionWebhook(signed(),env);assert.equal(await entitlement(env,'creator','creator_plus'),true);status='refunded';await subscriptionWebhook(signed(),env);status='approved';await subscriptionWebhook(signed(),env);assert.equal(await entitlement(env,'creator','creator_plus'),false);globalThis.fetch=originalFetch;
});

test('Stories: revisão, autoria, expiração, métricas deduplicadas e comentário moderado',async()=>{
 const {socialApi,socialAdmin}=await import('../something-gamer-api/src/social.js');
 const call=(action,b,uid='creator')=>socialApi(new Request(`https://api.test/social/${action}`,{method:'POST',body:JSON.stringify(b)}),env,{uid},async()=>true);
 const created=await call('create',{kind:'story',caption:'Story real',publicConsent:true,idempotencyKey:'story-test-one'});
 assert.equal(created.state,'pending_review');assert.equal((await call('list',{kind:'story'},'alice')).items.length,0);
 await assert.rejects(()=>call('delete',{id:created.id},'alice'),/FORBIDDEN/);
 await socialAdmin(new Request('https://api.test/admin/social',{method:'POST',body:JSON.stringify({id:created.id,state:'published',reason:'Conteúdo revisado'})}),env,{uid:'admin'});
 assert.equal((await call('list',{kind:'story'},'alice')).items.length,1);
 await call('like',{id:created.id,liked:true},'alice');await call('like',{id:created.id,liked:true},'alice');await call('view',{id:created.id},'alice');await call('view',{id:created.id},'alice');
 const row=(await call('list',{kind:'story'},'alice')).items[0];assert.equal(row.likes,1);assert.equal(row.views,1);
 await call('comment',{id:created.id,text:'Comentário permitido',commentId:'comment-fixture'},'alice');assert.equal((await call('comments',{id:created.id},'alice')).items.length,1);
 await db.prepare('UPDATE social_content SET expires_at=? WHERE id=?').bind(Date.now()-1,created.id).run();assert.equal((await call('list',{kind:'story'},'alice')).items.length,0);await assert.rejects(()=>call('like',{id:created.id,liked:true},'alice'),/RESOURCE_NOT_FOUND/);
});
test('ADS consentimento é revogável e segmentação exclui usuários não consentidos',async()=>{
 const {adsApi}=await import('../something-gamer-api/src/ads.js');const adreq=(p,b)=>new Request(`https://api.test/ads/${p}`,{method:'POST',body:JSON.stringify(b)});
 await adsApi(adreq('preferences',{save:true,consent:true,region:'blumenau',interests:['hardware']}),env,{uid:'target-user'});
 const saved=await adsApi(adreq('preferences',{}),env,{uid:'target-user'});assert.equal(saved.preferences.consent,true);
 await adsApi(adreq('preferences',{save:true,consent:false,region:'blumenau',interests:['hardware']}),env,{uid:'target-user'});
 const revoked=await adsApi(adreq('preferences',{}),env,{uid:'target-user'});assert.equal(revoked.preferences.region,'');assert.deepEqual(revoked.preferences.interests,[]);
 const id='targeted-campaign';await db.prepare("INSERT INTO ad_campaigns(id,owner_uid,name,headline,body,target_url,budget_cents,duration_days,reference,state,payment_state,reviewed_by,ends_at,created_at,updated_at) VALUES (?,?,'Campanha','Título','Texto','https://app.test',1000,7,?,'active','approved','admin',?,?,?)").bind(id,'seller','target-ref',Date.now()+86400000,Date.now(),Date.now()).run();await db.prepare('INSERT INTO ad_creatives VALUES (?,NULL,?,?,?, ?,NULL)').bind(id,'story','consented','blumenau','["hardware"]').run();
 assert.equal((await adsApi(adreq('serve',{placement:'story'}),env,{uid:'target-user'})).ad,null);
 await adsApi(adreq('preferences',{save:true,consent:true,region:'blumenau',interests:['hardware']}),env,{uid:'target-user'});assert.equal((await adsApi(adreq('serve',{placement:'story'}),env,{uid:'target-user'})).ad.headline,'Título');
});
test('mídia social nova não abre anexos privados e exige revisão para leitura pública',async()=>{
 const {uploadSocial,socialMedia,socialApi,socialAdmin}=await import('../something-gamer-api/src/social.js');const bytes=new Uint8Array([255,216,255,1,2]);const upload=await uploadSocial(new Request('https://api.test/media/upload',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:bytes}),{...env,SOCIAL_MEDIA_ENABLED:'true'},{uid:'creator'});
 await assert.rejects(()=>socialMedia(env,upload.id),/MEDIA_NOT_FOUND/);assert.equal((await socialMedia(env,upload.id,{user:{uid:'creator'}})).status,200);
 const row=await socialApi(new Request('https://api.test/social/create',{method:'POST',body:JSON.stringify({kind:'post',caption:'Foto',mediaId:upload.id,publicConsent:true,idempotencyKey:'photo-test'})}),env,{uid:'creator'});
 await socialAdmin(new Request('https://api.test/admin/social',{method:'POST',body:JSON.stringify({id:row.id,state:'published',reason:'Foto revisada'})}),env,{uid:'admin'});assert.equal((await socialMedia(env,upload.id)).status,200);
 await socialApi(new Request('https://api.test/social/delete',{method:'POST',body:JSON.stringify({id:row.id})}),env,{uid:'creator'});await assert.rejects(()=>socialMedia(env,upload.id),/MEDIA_NOT_FOUND/);
});
test('conversão ADS só conta produto comprado e pagamento; estorno retira a conversão',async()=>{
 const {adsApi}=await import('../something-gamer-api/src/ads.js');const made=await marketApi(req('listing/create',{...listing,idempotencyKey:'conversion-product',stock:2}),env,{uid:'seller'});
 const cid='conversion-campaign',now=Date.now();await db.prepare("INSERT INTO ad_campaigns(id,owner_uid,name,headline,body,target_url,budget_cents,duration_days,reference,state,created_at,updated_at) VALUES (?,?,'Campanha conversão','Título','Texto','https://app.test',1000,7,?,'active',?,?)").bind(cid,'seller','conversion-ref',now,now).run();await db.prepare('INSERT INTO ad_creatives VALUES (?,NULL,\'feed\',\'broad\',\'\',\'[]\',?)').bind(cid,made.item.id).run();await db.prepare('INSERT INTO ad_delivery(id,campaign_id,viewer_uid,expires_at,day,viewed_at,clicked_at) VALUES (?,?,?,?,?,?,?)').bind('conversion-delivery',cid,'conversion-buyer',now+86400000,'2026-10-09',now-2000,now-1000).run();
 const order=await marketApi(req('orders/create',{idempotencyKey:'conversion-checkout',items:[{productId:made.item.id,quantity:1}]}),env,{uid:'conversion-buyer'});assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM ad_conversions WHERE order_id=?').bind(order.order.id).first()).n,0);
 await db.prepare("UPDATE market_orders SET state='paid',updated_at=? WHERE id=?").bind(Date.now(),order.order.id).run();assert.equal((await db.prepare('SELECT value_cents FROM ad_conversions WHERE order_id=?').bind(order.order.id).first()).value_cents,10000);
 const listReq=()=>new Request('https://api.test/ads/list',{method:'POST',body:'{}'});const before=await adsApi(listReq(),env,{uid:'seller'});assert.equal(before.campaigns.find(c=>c.id===cid).conversions,1);await db.prepare("UPDATE market_orders SET state='refunded' WHERE id=?").bind(order.order.id).run();const after=await adsApi(listReq(),env,{uid:'seller'});assert.equal(after.campaigns.find(c=>c.id===cid).conversions,0);
});
test('devolução exige comprador, entrega confirmada e transições corretas',async()=>{
 const made=await marketApi(req('listing/create',{...listing,idempotencyKey:'return-product',stock:2}),env,{uid:'seller'});const order=await marketApi(req('orders/create',{idempotencyKey:'return-checkout',items:[{productId:made.item.id,quantity:1}]}),env,{uid:'return-buyer'});await db.prepare("UPDATE market_orders SET state='paid' WHERE id=?").bind(order.order.id).run();
 await marketApi(req('orders/transition',{id:order.order.id,state:'packing'}),env,{uid:'seller'});await marketApi(req('orders/transition',{id:order.order.id,state:'shipped',tracking:'transportadora ABC123'}),env,{uid:'seller'});await marketApi(req('orders/transition',{id:order.order.id,state:'delivered'}),env,{uid:'return-buyer'});
 await assert.rejects(()=>marketApi(req('returns/request',{orderId:order.order.id,reason:'Produto com problema'}),env,{uid:'eve'}),/INVALID_MARKET_INPUT/);await marketApi(req('returns/request',{orderId:order.order.id,reason:'Produto com problema'}),env,{uid:'return-buyer'});
 await assert.rejects(()=>marketApi(req('returns/update',{orderId:order.order.id,state:'received'}),env,{uid:'return-buyer'}),/FORBIDDEN/);await marketApi(req('returns/update',{orderId:order.order.id,state:'approved',reason:'Retorno autorizado pelo vendedor'}),env,{uid:'seller'});await marketApi(req('returns/update',{orderId:order.order.id,state:'in_transit',tracking:'retorno ABC123'}),env,{uid:'return-buyer'});await marketApi(req('returns/update',{orderId:order.order.id,state:'received'}),env,{uid:'seller'});assert.equal((await marketApi(req('returns/list',{}),env,{uid:'return-buyer'})).items[0].state,'received');
});
test('disputa não pode ser marcada como reembolsada sem refund confirmado',async()=>{
 const {resolveDispute}=await import('../something-gamer-api/src/market.js');const order=await db.prepare("SELECT * FROM market_orders WHERE buyer_uid='return-buyer'").first();await marketApi(req('disputes/open',{orderId:order.id,reason:'Problema não resolvido na entrega'}),env,{uid:'return-buyer'});await assert.rejects(()=>resolveDispute(new Request('https://api.test/market/disputes/resolve',{method:'POST',body:JSON.stringify({orderId:order.id,decision:'refunded',reason:'Solicitação sem comprovante de refund'})}),env,{uid:'admin'}),/RESOURCE_CONFLICT/);assert.equal((await db.prepare('SELECT state FROM market_orders WHERE id=?').bind(order.id).first()).state,'disputed');
});

test('Now ADS hierárquico: ownership, campanha idempotente e limites atômicos diário/conjunto',async()=>{
 const {adsApi,reviewAd}=await import('../something-gamer-api/src/ads.js');const {manageNowAds,runNowRules}=await import('../something-gamer-api/src/now-ads.js');const owner={uid:'native-owner'},now=Date.now();await db.prepare("UPDATE ad_campaigns SET state='paused' WHERE state='active'").run();
 const body={action:'campaign',key:'native-campaign',name:'Campanha SG',objective:'traffic',allocation:'campaign',budgetCents:1000,dailyCents:2,days:7,policyAccepted:true},c=await manageNowAds(env,owner,body);assert.equal((await manageNowAds(env,owner,body)).id,c.id);await assert.rejects(()=>manageNowAds(env,owner,{...body,budgetCents:2000}),/RESOURCE_CONFLICT/);await assert.rejects(()=>manageNowAds(env,owner,{...body,key:'bad-objective',objective:'members'}),/INVALID_AD_INPUT/);
 const makeSet=(key,placement)=>({action:'set',key,campaignId:c.id,name:'Conjunto '+key,budgetCents:1000,dailyCents:1,startsAt:now-1000,endsAt:now+86400000,placements:[placement]});await assert.rejects(()=>manageNowAds(env,{uid:'intruder'},makeSet('foreign','feed')),/FORBIDDEN/);const s=await manageNowAds(env,owner,makeSet('first','feed')),s2=await manageNowAds(env,owner,makeSet('second','story'));for(const [i,set]of [s,s2].entries())await manageNowAds(env,owner,{action:'ad',key:'native-ad-'+i,setId:set.id,name:'Anúncio '+i,headline:'Conheça meu perfil',format:'text',targetType:'profile',targetId:owner.uid});
 await db.prepare("UPDATE ad_campaigns SET state='pending_review',payment_state='approved' WHERE id=?").bind(c.id).run();const req=(action,b)=>new Request('https://api.test/ads/'+action,{method:'POST',body:JSON.stringify(b)});await reviewAd(req('review',{id:c.id,decision:'approved',reason:'Todos os anúncios foram revisados.'}),env,{uid:'admin'});
 const a=(await adsApi(req('serve',{placement:'feed'}),env,{uid:'native-a'})).ad,b=(await adsApi(req('serve',{placement:'feed'}),env,{uid:'native-b'})).ad;assert.ok(a);assert.ok(b);await adsApi(req('impression',{deliveryId:a.deliveryId}),env,{uid:'native-a'});await assert.rejects(()=>adsApi(req('impression',{deliveryId:b.deliveryId}),env,{uid:'native-b'}),/AD_BUDGET_EXHAUSTED/);assert.equal((await db.prepare('SELECT viewed_at FROM ad_delivery WHERE id=?').bind(b.deliveryId).first()).viewed_at,null);const story=(await adsApi(req('serve',{placement:'story'}),env,{uid:'native-c'})).ad;assert.ok(story);await adsApi(req('impression',{deliveryId:story.deliveryId}),env,{uid:'native-c'});assert.equal((await db.prepare('SELECT spent_cents FROM ad_campaigns WHERE id=?').bind(c.id).first()).spent_cents,2);assert.equal((await adsApi(req('serve',{placement:'story'}),env,{uid:'native-d'})).ad,null);
 await manageNowAds(env,owner,{action:'rule',campaignId:c.id,name:'Pausar sem venda',spendCents:2,minSales:1});await runNowRules(env);assert.equal((await db.prepare('SELECT state FROM ad_campaigns WHERE id=?').bind(c.id).first()).state,'paused');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM now_rule_log WHERE campaign_id=?').bind(c.id).first()).n,1);
});
test('Now ADS: público semelhante recusa origem insuficiente e leads não aceitam entrega de outro usuário',async()=>{
 const {manageNowAds,nowLead}=await import('../something-gamer-api/src/now-ads.js');const owner={uid:'native-owner'},c=await db.prepare('SELECT campaign_id FROM now_campaigns LIMIT 1').first();await assert.rejects(()=>manageNowAds(env,owner,{action:'audience',name:'Semelhantes',kind:'lookalike',sourceCampaign:c.campaign_id}),/AUDIENCE_TOO_SMALL/);await assert.rejects(()=>manageNowAds(env,{uid:'intruder'},{action:'leads',campaignId:c.campaign_id}),/FORBIDDEN/);await assert.rejects(()=>nowLead(env,{uid:'intruder'},{deliveryId:'anything',name:'Contato',email:'x@example.test',consent:true,consentVersion:'now-leads-2026-10'}),/FORBIDDEN/);
});
test('Market: anúncio profissional não abre fotos antes da revisão e preserva localização aproximada',async()=>{
 const {reviewMarket}=await import('../something-gamer-api/src/market-discovery.js');const now=Date.now(),mediaId='professional-photo';await db.prepare('INSERT INTO social_media VALUES (?,?,?,?,?,?)').bind(mediaId,'seller','image/png',10,now,now+86400000).run();
 const input={...listing,idempotencyKey:'professional-product',professional:true,physicalPolicy:true,lat:-26.91944,lng:-49.06612,precision:'approximate',deliveryMode:'combined',tags:['console'],mediaIds:[mediaId]},made=await marketApi(req('listing/create',input),env,{uid:'seller'});assert.equal(made.item.reviewState,'pending');assert.equal(made.item.lat,-26.92);assert.equal(made.item.photos.length,0);assert.equal((await marketApi(req('listing/create',input),env,{uid:'seller'})).item.id,made.item.id);await assert.rejects(()=>marketApi(req('listing/create',{...input,title:'Outro produto'}),env,{uid:'seller'}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(()=>marketApi(req('listing/update',{id:made.item.id,status:'active'}),env,{uid:'seller'}),/FORBIDDEN/);await assert.rejects(()=>reviewMarket(env,{uid:'admin'},{action:'approve',id:made.item.id,reason:'Fotos e descrição analisadas.'}),/INVALID/);await reviewMarket(env,{uid:'admin'},{action:'approve',id:made.item.id,reason:'Fotos e descrição analisadas.',mediaReviewed:true});const p=(await marketApi(req('product',{id:made.item.id}),env,{uid:'buyer'})).item;assert.equal(p.photos.length,1);assert.ok(p.photos[0].endsWith(mediaId));const {manageNowAds}=await import("../something-gamer-api/src/now-ads.js");const catalog=await manageNowAds(env,{uid:"seller"},{action:"catalog"});assert.ok(catalog.items.find(x=>x.id===p.id).image_url.endsWith(mediaId));
 const nearby=await marketApi(req('catalog',{geo:{lat:-26.92,lng:-49.07,radius:10}}),env,{uid:'buyer'});assert.ok(nearby.items.some(x=>x.id===p.id));const far=await marketApi(req('catalog',{geo:{lat:0,lng:0,radius:10}}),env,{uid:'buyer'});assert.equal(far.items.length,0);await marketApi(req('favorites',{productId:p.id,saved:true}),env,{uid:'buyer'});await marketApi(req('activity',{productId:p.id,kind:'view'}),env,{uid:'buyer'});await marketApi(req('activity',{productId:p.id,kind:'view'}),env,{uid:'buyer'});const stats=(await marketApi(req('insights',{}),env,{uid:'seller'})).items.find(x=>x.id===p.id);assert.equal(stats.saves,1);assert.equal(stats.views,1);
});

test('Now Call SFU: grant de espectador não publica, sala limita 25 e revogação respeita servidor',async()=>{
 const {sfuGrant,revokeSfu}=await import('../something-gamer-api/src/now-call.js');const config={...env,CALL_SFU_ENABLED:'true',CALL_SFU_URL:'wss://media.example.test',CALL_SFU_API_KEY:'test-key',CALL_SFU_API_SECRET:'test-secret'},calls=[];const before=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://media.example.test/twirp/'));calls.push({url:String(url),payload:JSON.parse(options.body)});return new Response('{}',{status:200,headers:{'Content-Type':'application/json'}});};
 try{const grant=await sfuGrant(config,{uid:'spectator'},'server-one','voice-one','session-one',false),claims=JSON.parse(Buffer.from(grant.token.split('.')[1],'base64url').toString());assert.equal(grant.capacity,25);assert.equal(claims.video.canPublish,false);assert.equal(claims.video.canSubscribe,true);assert.equal(claims.video.room,grant.room);assert.equal(claims.sub,'spectator');assert.equal(claims.exp-claims.iat,95);assert.equal(calls[0].payload.max_participants,25);await sfuGrant(config,{uid:'spectator'},'other-server','other-channel','other-session',true);await revokeSfu(config,'server-one','spectator');const remains=(await db.prepare('SELECT * FROM now_call_sessions WHERE uid=?').bind('spectator').all()).results;assert.equal(remains.length,1);assert.equal(remains[0].server_id,'other-server');}finally{globalThis.fetch=before;}
});

test('Now ADS leads: contato exige clique e consentimento; exportação só do anunciante',async()=>{
 const {manageNowAds,nowLead}=await import('../something-gamer-api/src/now-ads.js'),{adsApi,reviewAd}=await import('../something-gamer-api/src/ads.js');await db.prepare("UPDATE ad_campaigns SET state='paused' WHERE state='active'").run();const owner={uid:'lead-owner'},now=Date.now(),c=await manageNowAds(env,owner,{action:'campaign',key:'lead-campaign',name:'Cadastro para evento',objective:'leads',allocation:'campaign',budgetCents:1000,dailyCents:1000,days:7,policyAccepted:true}),set=await manageNowAds(env,owner,{action:'set',key:'lead-set',campaignId:c.id,name:'Público amplo',budgetCents:1000,dailyCents:1000,startsAt:now-1000,endsAt:now+86400000,placements:['feed']});await assert.rejects(()=>manageNowAds(env,owner,{action:'ad',key:'wrong-lead',setId:set.id,name:'Destino errado',headline:'Cadastre-se',format:'text',targetType:'profile',targetId:owner.uid}),/INVALID_AD_INPUT/);await manageNowAds(env,owner,{action:'ad',key:'lead-ad',setId:set.id,name:'Cadastro SG',headline:'Cadastre-se no evento',format:'text',targetType:'lead'});await db.prepare("UPDATE ad_campaigns SET state='pending_review',payment_state='approved' WHERE id=?").bind(c.id).run();const r=(path,b)=>new Request('https://api.test/ads/'+path,{method:'POST',body:JSON.stringify(b)});await reviewAd(r('review',{id:c.id,decision:'approved',reason:'Texto e destino revisados.'}),env,{uid:'admin'});const user={uid:'lead-viewer'},ad=(await adsApi(r('serve',{placement:'feed'}),env,user)).ad;assert.ok(ad.url.includes('now-lead.html'));const contact={deliveryId:ad.deliveryId,name:'Contato de teste',email:'contact@example.test',phone:'',consent:true,consentVersion:'now-leads-2026-10'};await assert.rejects(()=>nowLead(env,user,contact),/FORBIDDEN/);await adsApi(r('impression',{deliveryId:ad.deliveryId}),env,user);await adsApi(r('click',{deliveryId:ad.deliveryId}),env,user);await assert.rejects(()=>nowLead(env,user,{...contact,consent:false}),/INVALID/);await nowLead(env,user,contact);await nowLead(env,user,contact);assert.equal((await manageNowAds(env,owner,{action:'leads',campaignId:c.id})).items.length,1);await assert.rejects(()=>manageNowAds(env,user,{action:'leads',campaignId:c.id}),/FORBIDDEN/);
});
