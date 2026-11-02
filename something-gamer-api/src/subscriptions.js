import {consumeRate} from './limits.js';
import {mpRequest} from './seller-oauth.js';
import {verifyWebhook,checkoutUrl,cents} from './payment-domain.js';
import {ownedDocuments} from './firestore-store.js';
export const SUBSCRIPTION_PLANS=Object.freeze({creator_plus:{price:1990,name:'Creator+',benefits:['Identificação Creator+','Relatório dos seus posts e exportação CSV']},seller_pro:{price:2490,name:'Seller Pro',benefits:['Identificação Seller Pro','Relatório e exportação dos seus pedidos']},community_pro:{price:2990,name:'Community Pro',benefits:['Identificação Community Pro','Relatório e exportação das suas comunidades']}});
export function monthAfter(milliseconds){const date=new Date(milliseconds),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,end));return date.getTime();}
function configured(env,charge=false){if(!env.SG_DB||!env.MERCADOPAGO_ACCESS_TOKEN||!env.MERCADOPAGO_COLLECTOR_ID)throw new Error('SUBSCRIPTIONS_NOT_CONFIGURED');if(charge&&env.SUBSCRIPTIONS_ENABLED!=='true')throw new Error('SUBSCRIPTIONS_DISABLED');if((env.PAYMENT_ENV==='test')!==String(env.MERCADOPAGO_ACCESS_TOKEN).startsWith('TEST-'))throw new Error('PAYMENT_ENV_MISMATCH');}
export async function entitlement(env,uid,plan){if(!env.SG_DB)return false;return Boolean(await env.SG_DB.prepare(`SELECT c.payment_id FROM subscription_charges c JOIN subscriptions s ON s.id=c.subscription_id
 WHERE s.uid=? AND s.plan=? AND c.status='approved' AND c.expires_at>? LIMIT 1`).bind(uid,plan,Date.now()).first());}
export async function subscriptionApi(request,env,user){
 await consumeRate(env,user.uid,'subscriptions');
 configured(env);const body=await request.json(),action=new URL(request.url).pathname.slice('/subscriptions/'.length);
 if(action==='list'){
  const rows=await env.SG_DB.prepare(`SELECT s.*,MAX(CASE WHEN c.status='approved' THEN c.expires_at ELSE NULL END) AS paid_until FROM subscriptions s LEFT JOIN subscription_charges c ON s.id=c.subscription_id WHERE s.uid=? GROUP BY s.id ORDER BY s.created_at DESC LIMIT 30`).bind(user.uid).all();
  return {ok:true,enabled:env.SUBSCRIPTIONS_ENABLED==='true',plans:SUBSCRIPTION_PLANS,subscriptions:rows.results.map(s=>({id:s.id,plan:s.plan,status:s.status,active:s.paid_until>Date.now(),expiresAt:s.paid_until,checkoutUrl:s.checkout_url}))};
 }
 if(action==='create'){
  configured(env,true);const plan=SUBSCRIPTION_PLANS[body.plan],key=String(body.idempotencyKey||'');
  if(!plan||body.consent!==true||body.consentVersion!=='sg-recurring-2026-10'||!/^[a-z0-9-]{16,80}$/i.test(key))throw new Error('INVALID_SUBSCRIPTION');
  let row=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE uid=? AND client_key=?').bind(user.uid,key).first();
  if(row&&row.plan!==body.plan)throw new Error('IDEMPOTENCY_CONFLICT');
  if(!row){
   const current=await env.SG_DB.prepare('SELECT id FROM subscriptions WHERE uid=? AND plan=? AND status IN (\'pending\',\'authorized\') LIMIT 1').bind(user.uid,body.plan).first();
   if(current)throw new Error('RESOURCE_CONFLICT');
   const id=crypto.randomUUID(),now=Date.now();await env.SG_DB.prepare('INSERT INTO subscriptions(id,uid,plan,client_key,reference,price_cents,consent_version,consented_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,user.uid,body.plan,key,`sgs_${id}`,plan.price,body.consentVersion,now,now,now).run();row=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE id=?').bind(id).first();
  }
  if(row.checkout_url)return {ok:true,id:row.id,checkoutUrl:row.checkout_url};
  const out=await mpRequest('/preapproval',env.MERCADOPAGO_ACCESS_TOKEN,{method:'POST',headers:{'X-Idempotency-Key':row.id},body:JSON.stringify({reason:`Something Gamer — ${plan.name}`,external_reference:row.reference,payer_email:user.email,back_url:`${env.APP_URL}/monetization.html?subscription=returned`,auto_recurring:{frequency:1,frequency_type:'months',transaction_amount:plan.price/100,currency_id:'BRL'},status:'pending'})});
  if(!/^[a-zA-Z0-9-]{8,128}$/.test(String(out.id)))throw new Error('MERCADOPAGO_FAILED');const url=checkoutUrl(out.init_point,env.PAYMENT_ENV==='test');
  await env.SG_DB.prepare('UPDATE subscriptions SET provider_id=?,checkout_url=?,updated_at=? WHERE id=? AND provider_id IS NULL').bind(String(out.id),url,Date.now(),row.id).run();return {ok:true,id:row.id,checkoutUrl:url};
 }
 if(action==='cancel'){
  const row=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE id=? AND uid=?').bind(String(body.id||''),user.uid).first();if(!row)throw new Error('RESOURCE_NOT_FOUND');
  if(row.status==='cancelled')return {ok:true,reused:true};
  const out=await mpRequest(`/preapproval/${encodeURIComponent(row.provider_id)}`,env.MERCADOPAGO_ACCESS_TOKEN,{method:'PUT',body:JSON.stringify({status:'cancelled'})});if(out.status!=='cancelled'||String(out.id)!==row.provider_id)throw new Error('MERCADOPAGO_FAILED');
  await env.SG_DB.prepare('UPDATE subscriptions SET status=\'cancelled\',updated_at=? WHERE id=?').bind(Date.now(),row.id).run();return {ok:true};
 }
 if(action==='tools'){
  if(!SUBSCRIPTION_PLANS[body.plan]||!await entitlement(env,user.uid,body.plan))throw new Error('FORBIDDEN');
  if(body.plan==='seller_pro'){const result=await env.SG_DB.prepare('SELECT id,subtotal_cents,shipping_cents,commission_cents,state,created_at FROM market_orders WHERE seller_uid=? ORDER BY created_at DESC LIMIT 1000').bind(user.uid).all();return {ok:true,rows:result.results,scope:'Até 1.000 pedidos mais recentes'};}
  // Somente dados pertencentes ao titular; sem conteúdo privado de terceiros.
  const collection=body.plan==='creator_plus'?'posts':'servers',field=body.plan==='creator_plus'?'uid':'ownerUid';
  const rows=(await ownedDocuments(env,collection,field,user.uid)).map(x=>({id:x.id,title:x.title||x.name||String(x.text||'').slice(0,80),createdAt:x.createdAt,members:Array.isArray(x.members)?x.members.length:undefined,likes:Array.isArray(x.likes)?x.likes.length:undefined}));
  return {ok:true,rows,scope:'Até 100 registros próprios retornados pelo banco. Este relatório não representa totais de toda a plataforma.'};
 }
 throw new Error('INVALID_SUBSCRIPTION');
}
export async function reconcileSubscription(env,row){
 const remote=await mpRequest(`/preapproval/${encodeURIComponent(row.provider_id)}`,env.MERCADOPAGO_ACCESS_TOKEN);
 const plan=SUBSCRIPTION_PLANS[row.plan];if(remote.external_reference!==row.reference||String(remote.id)!==row.provider_id||remote.auto_recurring?.currency_id!=='BRL'||cents(remote.auto_recurring.transaction_amount)!==plan.price)throw new Error('PAYMENT_MISMATCH');
 if(!['pending','authorized','paused','cancelled'].includes(remote.status))throw new Error('PAYMENT_MISMATCH');
 await env.SG_DB.prepare('UPDATE subscriptions SET status=CASE WHEN status=\'cancelled\' THEN status ELSE ? END,updated_at=? WHERE id=?').bind(remote.status,Date.now(),row.id).run();
}
export async function subscriptionWebhook(request,env){
 const signed=await verifyWebhook(request,env.MERCADOPAGO_WEBHOOK_SECRET);configured(env);const url=new URL(request.url),topic=url.searchParams.get('type')||url.searchParams.get('topic')||(request.method==='POST'?(await request.json()).type:'');
 if(!/^[a-zA-Z0-9-]{1,128}$/.test(signed.id))return {ok:true,ignored:true};
 if(topic==='subscription_preapproval'){
  const row=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE provider_id=?').bind(signed.id).first();if(row)await reconcileSubscription(env,row);return {ok:true};
 }
 if(topic!=='subscription_authorized_payment')return {ok:true,ignored:true};
 const authorized=await mpRequest(`/authorized_payments/${encodeURIComponent(signed.id)}`,env.MERCADOPAGO_ACCESS_TOKEN),row=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE provider_id=?').bind(String(authorized.preapproval_id||'')).first();
 if(!row||!authorized.payment?.id)return {ok:true,ignored:true};
 const payment=await mpRequest(`/v1/payments/${encodeURIComponent(authorized.payment.id)}`,env.MERCADOPAGO_ACCESS_TOKEN),price=SUBSCRIPTION_PLANS[row.plan].price;
 if(String(payment.id)!==String(authorized.payment.id)||payment.currency_id!=='BRL'||cents(payment.transaction_amount)!==price||String(payment.collector_id)!==String(env.MERCADOPAGO_COLLECTOR_ID)||payment.live_mode!==(env.PAYMENT_ENV==='production'))throw new Error('PAYMENT_MISMATCH');
 if(!['approved','pending','in_process','rejected','cancelled','refunded','charged_back'].includes(payment.status))throw new Error('PAYMENT_MISMATCH');
 const paid=payment.date_approved?Date.parse(payment.date_approved):null;if(payment.status==='approved'&&(!Number.isFinite(paid)||paid>Date.now()+60000))throw new Error('PAYMENT_MISMATCH');
 await env.SG_DB.prepare(`INSERT INTO subscription_charges(payment_id,subscription_id,status,amount_cents,paid_at,expires_at,updated_at) VALUES (?,?,?,?,?,?,?)
  ON CONFLICT(payment_id) DO UPDATE SET status=CASE WHEN status IN ('refunded','charged_back') THEN status WHEN status='approved' AND excluded.status IN ('pending','in_process') THEN status ELSE excluded.status END,paid_at=COALESCE(paid_at,excluded.paid_at),expires_at=COALESCE(expires_at,excluded.expires_at),updated_at=excluded.updated_at WHERE subscription_id=excluded.subscription_id`)
  .bind(String(payment.id),row.id,payment.status,price,paid,paid?monthAfter(paid):null,Date.now()).run();return {ok:true};
}
export async function reconcileSubscriptions(env){if(!env.SG_DB||!env.MERCADOPAGO_ACCESS_TOKEN)return;const rows=await env.SG_DB.prepare('SELECT * FROM subscriptions WHERE provider_id IS NOT NULL AND status IN (\'pending\',\'authorized\') ORDER BY updated_at LIMIT 20').all();for(const row of rows.results){try{await reconcileSubscription(env,row);}catch{console.warn(JSON.stringify({event:'subscription_reconciliation_failed',id:row.id}));}}}
