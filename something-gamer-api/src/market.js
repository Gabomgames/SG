import {decorateProducts,createProfessionalListing,discoveryApi,distanceKm} from './market-discovery.js';
import {consumeRate} from './limits.js';
import {listingInput,quote,cents,transition,validateMarketplacePayment} from './market-domain.js';
import {sellerCredentials,mpRequest,hash} from './seller-oauth.js';
import {checkoutUrl,verifyWebhook} from './payment-domain.js';
import {getDocument,patchWrite,commitDocuments} from './firestore-store.js';
const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(v))throw new Error('INVALID_MARKET_INPUT');return v;};
function configured(env,charge=false){if(!env.SG_DB)throw new Error('MARKET_NOT_CONFIGURED');if(charge&&(env.MARKET_CHECKOUT_ENABLED!=='true'||env.MARKETPLACE_APPROVED!=='true'))throw new Error('MARKET_CHECKOUT_DISABLED');}
const product=(env,value)=>env.SG_DB.prepare('SELECT * FROM market_products WHERE id=?').bind(id(value)).first();
const savedOrder=(env,value)=>env.SG_DB.prepare('SELECT * FROM market_orders WHERE id=?').bind(id(value)).first();
function publicProduct(p){return {id:p.id,sellerUid:p.seller_uid,title:p.title,description:p.description,category:p.category,condition:p.condition,imageUrl:p.image_url,location:p.location,price:p.price_cents/100,priceCents:p.price_cents,stock:p.stock-p.reserved,shippingCents:p.shipping_cents,returnPolicy:p.return_policy,status:p.status,createdAt:p.created_at};}
function orderView(o){return {...o,amount:o.total_cents/100,status:o.state,commission:o.commission_cents/100};}
async function audit(env,uid,action,target,result,statements){await env.SG_DB.batch([...statements,env.SG_DB.prepare('INSERT INTO admin_audit(id,actor_uid,action,target_id,result,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),uid,action,target,String(result).slice(0,500),Date.now())]);}
async function negotiationRoom(env,buyer,seller,productId){
 if(buyer===seller)throw new Error('FORBIDDEN');
 const members=[buyer,seller].sort(),conversationId=`market_${await hash(JSON.stringify(members))}`;
 const blocked=await Promise.all([getDocument(env,`users/${buyer}/blocks/${seller}`),getDocument(env,`users/${seller}/blocks/${buyer}`)]);
 if(blocked.some(Boolean))throw new Error('FORBIDDEN');
 const prior=await getDocument(env,`conversations/${conversationId}`);
 if(prior&&JSON.stringify(prior.members)!==JSON.stringify(members))throw new Error('FORBIDDEN');
 await commitDocuments(env,[patchWrite(env,`conversations/${conversationId}`,{members,kind:'market',marketProductId:productId,updatedAt:new Date()},prior?{updateTime:prior._updateTime}:{create:true})]);
 return conversationId;
}
async function mirrorOffer(env,offer,actor){
 if(!env.FIRESTORE_SERVICE_ACCOUNT)return false;
 const cid=await negotiationRoom(env,offer.buyer_uid,offer.seller_uid,offer.product_id);
 const person=await getDocument(env,`users/${actor}`),now=new Date(),mid=`offer_${offer.id}_${offer.updated_at}`;
 if(await getDocument(env,`conversations/${cid}/messages/${mid}`)){
  await env.SG_DB.prepare('UPDATE market_offers SET mirror_pending=0 WHERE id=? AND updated_at=?').bind(offer.id,offer.updated_at).run();return true;
 }
 await commitDocuments(env,[patchWrite(env,`conversations/${cid}/messages/${mid}`,{uid:actor,authorName:String(person?.name||'Contato do Market').slice(0,60),type:'market_offer',text:'Proposta registrada no Now Market.',mediaUrl:'',createdAt:now,clientCreatedAt:now.getTime(),offer:{id:offer.id,productId:offer.product_id,amountCents:offer.amount_cents,quantity:offer.quantity,state:offer.state}}, {create:true}),patchWrite(env,`conversations/${cid}`,{lastMessage:'Nova atividade de negociação',lastSenderUid:actor,updatedAt:now})]);
 await env.SG_DB.prepare('UPDATE market_offers SET mirror_pending=0 WHERE id=? AND updated_at=?').bind(offer.id,offer.updated_at).run();return true;
}
export async function marketApi(request,env,user){
 await consumeRate(env,user.uid,'market');
 configured(env);const body=await request.json(),action=new URL(request.url).pathname.slice('/market/'.length);
 if(['favorites','insights','activity','report','shareGroups'].includes(action))return discoveryApi(env,user,body,action);
 if(action==='catalog'){
  const term=String(body.term||'').trim().slice(0,100),category=String(body.category||''),condition=String(body.condition||''),cursor=body.cursor||{createdAt:Number.MAX_SAFE_INTEGER,id:''};
  if(!Number.isSafeInteger(cursor.createdAt)||typeof cursor.id!=='string')throw new Error('INVALID_MARKET_INPUT');
  const geo=body.geo;if(geo&&(!Number.isFinite(geo.lat)||!Number.isFinite(geo.lng)||Math.abs(geo.lat)>90||Math.abs(geo.lng)>180||!Number.isFinite(geo.radius)||geo.radius<1||geo.radius>250))throw new Error('INVALID_MARKET_INPUT');const delta=geo?geo.radius/111:0,lon=geo?delta/Math.max(.01,Math.cos(geo.lat*Math.PI/180)):0;
  const result=await env.SG_DB.prepare(`SELECT p.* FROM market_products p LEFT JOIN market_details g ON g.product_id=p.id WHERE p.status='active'
   AND (?='' OR instr(lower(title||' '||description||' '||COALESCE(g.tags,'')),lower(?))>0) AND (?='' OR category=?) AND (?='' OR condition=?)
   AND (? IS NULL OR (g.lat BETWEEN ? AND ? AND g.lng BETWEEN ? AND ?)) AND (?='' OR EXISTS(SELECT 1 FROM market_favorites f WHERE f.product_id=p.id AND f.uid=?)) AND price_cents>=? AND price_cents<=? AND (p.created_at<? OR (p.created_at=? AND p.id>?)) ORDER BY p.created_at DESC,p.id ASC LIMIT 25`)
   .bind(term,term,category,category,condition,condition,geo?.lat??null,(geo?.lat||0)-delta,(geo?.lat||0)+delta,(geo?.lng||0)-lon,(geo?.lng||0)+lon,body.savedOnly===true?user.uid:'',user.uid,Number.isSafeInteger(body.minCents)?body.minCents:0,Number.isSafeInteger(body.maxCents)?body.maxCents:5000000,cursor.createdAt,cursor.createdAt,cursor.id).all();
  const rows=result.results.slice(0,24),last=rows.at(-1);return {ok:true,items:(await decorateProducts(env,rows.map(publicProduct))).filter(p=>!geo||(p.lat!=null&&distanceKm(geo,p)<=geo.radius)),cursor:result.results.length>24?{createdAt:last.created_at,id:last.id}:null,mediaEnabled:env.SOCIAL_MEDIA_ENABLED==='true',checkoutEnabled:env.MARKET_CHECKOUT_ENABLED==='true'&&env.MARKETPLACE_APPROVED==='true'};
 }
 if(action==='product'){const row=await product(env,body.id);if(!row||row.status!=='active')throw new Error('RESOURCE_NOT_FOUND');return {ok:true,item:(await decorateProducts(env,[publicProduct(row)]))[0]};}
 if(action==='mine'){const rows=await env.SG_DB.prepare('SELECT * FROM market_products WHERE seller_uid=? ORDER BY created_at DESC LIMIT 100').bind(user.uid).all();return {ok:true,items:await decorateProducts(env,rows.results.map(publicProduct))};}
 if(action==='chat'){
  const p=await product(env,body.productId);if(!p||p.status!=='active'||p.seller_uid===user.uid)throw new Error('RESOURCE_NOT_FOUND');
  return {ok:true,conversationId:await negotiationRoom(env,user.uid,p.seller_uid,p.id),sellerUid:p.seller_uid};
 }
 if(action==='listing/create'){
  const data=listingInput(body),key=id(body.idempotencyKey),now=Date.now(),productId=`${user.uid}_${key}`;
  if(productId.length>128)throw new Error('INVALID_MARKET_INPUT');
  await createProfessionalListing(env,user,body,data,productId,now);return {ok:true,item:(await decorateProducts(env,[publicProduct(await product(env,productId))]))[0]};
 }
 if(action==='listing/update'){
  const p=await product(env,body.id);if(!p||p.seller_uid!==user.uid)throw new Error('RESOURCE_NOT_FOUND');
  const detail=await env.SG_DB.prepare('SELECT review_state FROM market_details WHERE product_id=?').bind(p.id).first();if(body.status==='active'&&detail&&detail.review_state!=='approved')throw new Error('FORBIDDEN');
  if(!['active','paused','removed'].includes(body.status))throw new Error('INVALID_MARKET_INPUT');
  if(body.stock!==undefined&&(!Number.isInteger(body.stock)||body.stock<p.reserved||body.stock>10000))throw new Error('INVALID_MARKET_INPUT');
  await env.SG_DB.prepare('UPDATE market_products SET status=?,stock=?,updated_at=? WHERE id=? AND seller_uid=?').bind(body.status,body.stock??p.stock,Date.now(),p.id,user.uid).run();return {ok:true};
 }
 if(action==='offers/create'){
  const p=await product(env,body.productId);if(!p||p.status!=='active'||p.seller_uid===user.uid)throw new Error('RESOURCE_NOT_FOUND');
  const quantity=Number(body.quantity);if(!Number.isInteger(quantity)||quantity<1||quantity>20||quantity>p.stock-p.reserved)throw new Error('INVALID_MARKET_INPUT');
  cents(body.amountCents,p.price_cents);const offerId=crypto.randomUUID(),now=Date.now();await env.SG_DB.prepare('INSERT INTO market_offers(id,product_id,buyer_uid,seller_uid,amount_cents,quantity,last_actor,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(offerId,p.id,user.uid,p.seller_uid,body.amountCents,quantity,user.uid,now+7*86400000,now,now).run();
  let chatMirrored=false;try{chatMirrored=await mirrorOffer(env,await env.SG_DB.prepare('SELECT * FROM market_offers WHERE id=?').bind(offerId).first(),user.uid);}catch{}
  return {ok:true,id:offerId,chatMirrored};
 }
 if(action==='offers/list'){const rows=await env.SG_DB.prepare('SELECT f.*,p.title FROM market_offers f JOIN market_products p ON p.id=f.product_id WHERE (buyer_uid=? OR f.seller_uid=?) ORDER BY f.created_at DESC LIMIT 100').bind(user.uid,user.uid).all();return {ok:true,offers:rows.results};}
 if(action==='offers/respond'){
  const f=await env.SG_DB.prepare('SELECT * FROM market_offers WHERE id=?').bind(id(body.id)).first();
  if(!f||![f.buyer_uid,f.seller_uid].includes(user.uid))throw new Error('RESOURCE_NOT_FOUND');
  if(!['proposed','countered'].includes(f.state)||f.expires_at<Date.now()||f.last_actor===user.uid)throw new Error('RESOURCE_CONFLICT');
  if(!['accepted','rejected','countered'].includes(body.decision))throw new Error('INVALID_MARKET_INPUT');
  const price=body.decision==='countered'?cents(body.amountCents,(await product(env,f.product_id)).price_cents):f.amount_cents;
  const out=await env.SG_DB.prepare('UPDATE market_offers SET state=?,amount_cents=?,last_actor=?,updated_at=?,mirror_pending=1 WHERE id=? AND state=? AND updated_at=? RETURNING id').bind(body.decision,price,user.uid,Date.now(),f.id,f.state,f.updated_at).first();if(!out)throw new Error('RESOURCE_CONFLICT');
  let chatMirrored=false;try{chatMirrored=await mirrorOffer(env,await env.SG_DB.prepare('SELECT * FROM market_offers WHERE id=?').bind(f.id).first(),user.uid);}catch{}
  return {ok:true,chatMirrored};
 }
 if(action==='orders/create'){
  configured(env,true);const key=id(body.idempotencyKey);
  const requestHash=await hash(JSON.stringify((Array.isArray(body.items)?body.items:[]).map(x=>({productId:x.productId,quantity:x.quantity,offerId:x.offerId||null})).sort((a,b)=>String(a.productId).localeCompare(String(b.productId)))));
  let existing=await env.SG_DB.prepare('SELECT * FROM market_orders WHERE buyer_uid=? AND client_key=?').bind(user.uid,key).first();if(existing){if(existing.request_hash!==requestHash)throw new Error('IDEMPOTENCY_CONFLICT');return {ok:true,order:orderView(existing),reused:true};}
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>20||new Set(body.items.map(x=>x.productId)).size!==body.items.length)throw new Error('INVALID_MARKET_INPUT');
  const items=[];let seller='',shipping=0;
  for(const input of body.items){const p=await product(env,input.productId);if(!p||p.status!=='active'||p.seller_uid===user.uid)throw new Error('RESOURCE_NOT_FOUND');if(seller&&p.seller_uid!==seller)throw new Error('MULTIPLE_SELLERS');seller=p.seller_uid;shipping=Math.max(shipping,p.shipping_cents);let price=p.price_cents,offerId=null;
   if(input.offerId){const f=await env.SG_DB.prepare('SELECT * FROM market_offers WHERE id=?').bind(id(input.offerId)).first();if(!f||f.product_id!==p.id||f.buyer_uid!==user.uid||f.state!=='accepted'||f.expires_at<Date.now()||f.quantity!==input.quantity)throw new Error('RESOURCE_CONFLICT');price=f.amount_cents;offerId=f.id;}
   items.push({productId:p.id,unitCents:price,quantity:input.quantity,title:p.title,offerId});}
  const calculation=quote(items,shipping),now=Date.now(),orderId=crypto.randomUUID();await sellerCredentials(env,seller);
  try{await env.SG_DB.batch([env.SG_DB.prepare('INSERT INTO market_orders(id,buyer_uid,seller_uid,client_key,request_hash,subtotal_cents,shipping_cents,commission_cents,total_cents,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(orderId,user.uid,seller,key,requestHash,calculation.subtotalCents,shipping,calculation.commissionCents,calculation.totalCents,now+30*60000,now,now),...items.map(x=>env.SG_DB.prepare('INSERT INTO market_order_items(order_id,product_id,quantity,unit_cents,title,offer_id) VALUES (?,?,?,?,?,?)').bind(orderId,x.productId,x.quantity,x.unitCents,x.title,x.offerId))]);}
  catch(error){existing=await env.SG_DB.prepare('SELECT * FROM market_orders WHERE buyer_uid=? AND client_key=?').bind(user.uid,key).first();if(existing){if(existing.request_hash!==requestHash)throw new Error('IDEMPOTENCY_CONFLICT');return {ok:true,order:orderView(existing),reused:true};}throw new Error('RESOURCE_CONFLICT');}
  return {ok:true,order:orderView(await savedOrder(env,orderId))};
 }
 if(action==='orders/checkout'){
  configured(env,true);const order=await savedOrder(env,body.id);if(!order||order.buyer_uid!==user.uid)throw new Error('RESOURCE_NOT_FOUND');if(order.state!=='awaiting_payment'||order.expires_at<=Date.now())throw new Error('RESOURCE_CONFLICT');
  if(order.checkout_url)return {ok:true,checkoutUrl:order.checkout_url};
  const seller=await sellerCredentials(env,order.seller_uid),rows=(await env.SG_DB.prepare('SELECT * FROM market_order_items WHERE order_id=?').bind(order.id).all()).results;
  const payload={external_reference:`sgm_${order.id}`,items:rows.map(x=>({id:x.product_id,title:x.title,currency_id:'BRL',quantity:x.quantity,unit_price:x.unit_cents/100})),marketplace_fee:order.commission_cents/100,
   shipments:{cost:order.shipping_cents/100,mode:'not_specified'},notification_url:`${env.API_URL}/market/webhook`,payer:{email:user.email},back_urls:{success:`${env.APP_URL}/marketplace.html?payment=returned`,pending:`${env.APP_URL}/marketplace.html?payment=pending`,failure:`${env.APP_URL}/marketplace.html?payment=failure`},expires:true,expiration_date_to:new Date(order.expires_at).toISOString()};
  const preference=await mpRequest('/checkout/preferences',seller.token,{method:'POST',headers:{'X-Idempotency-Key':order.id},body:JSON.stringify(payload)});
  const checkout=checkoutUrl(env.PAYMENT_ENV==='test'?preference.sandbox_init_point:preference.init_point,env.PAYMENT_ENV==='test');
  await env.SG_DB.prepare('UPDATE market_orders SET preference_id=?,checkout_url=?,updated_at=? WHERE id=? AND checkout_url IS NULL').bind(String(preference.id),checkout,Date.now(),order.id).run();return {ok:true,checkoutUrl:(await savedOrder(env,order.id)).checkout_url};
 }
 if(action==='orders/list'){const rows=await env.SG_DB.prepare('SELECT * FROM market_orders WHERE buyer_uid=? OR seller_uid=? ORDER BY created_at DESC LIMIT 100').bind(user.uid,user.uid).all();return {ok:true,orders:rows.results.map(orderView)};}
 if(action==='orders/transition'){
  const order=await savedOrder(env,body.id);if(!order)throw new Error('RESOURCE_NOT_FOUND');const next=transition(order,user.uid,body.state),tracking=String(body.tracking||'').trim();
  if(next==='shipped'&&(tracking.length<3||tracking.length>120))throw new Error('INVALID_MARKET_INPUT');
  const row=await env.SG_DB.prepare('UPDATE market_orders SET state=?,tracking=CASE WHEN ?=\'shipped\' THEN ? ELSE tracking END,updated_at=? WHERE id=? AND state=? RETURNING id').bind(next,next,tracking,Date.now(),order.id,order.state).first();if(!row)throw new Error('RESOURCE_CONFLICT');
  await audit(env,user.uid,'market_transition',order.id,next,next==='delivered'?[env.SG_DB.prepare('INSERT OR IGNORE INTO market_delivery_receipts VALUES (?,?)').bind(order.id,Date.now())]:[]);return {ok:true};
 }
 if(action==='returns/list'){return {ok:true,items:(await env.SG_DB.prepare('SELECT r.*,o.seller_uid FROM market_returns r JOIN market_orders o ON o.id=r.order_id WHERE r.buyer_uid=? OR o.seller_uid=? ORDER BY r.created_at DESC LIMIT 100').bind(user.uid,user.uid).all()).results};}
 if(action==='returns/request'){
  const order=await savedOrder(env,body.orderId),reason=String(body.reason||'').trim();if(!order||order.buyer_uid!==user.uid||order.state!=='delivered'||reason.length<10||reason.length>1000)throw new Error('INVALID_MARKET_INPUT');const receipt=await env.SG_DB.prepare('SELECT delivered_at FROM market_delivery_receipts WHERE order_id=?').bind(order.id).first();if(Date.now()-(receipt?.delivered_at||order.updated_at)>7*86400000)throw new Error('RESOURCE_CONFLICT');
  await env.SG_DB.prepare('INSERT OR IGNORE INTO market_returns(order_id,buyer_uid,reason,created_at,updated_at) VALUES (?,?,?,?,?)').bind(order.id,user.uid,reason,Date.now(),Date.now()).run();return {ok:true};
 }
 if(action==='returns/update'){
  const row=await env.SG_DB.prepare('SELECT r.*,o.seller_uid FROM market_returns r JOIN market_orders o ON o.id=r.order_id WHERE r.order_id=?').bind(id(body.orderId)).first();if(!row)throw new Error('RESOURCE_NOT_FOUND');const seller=row.seller_uid===user.uid,buyer=row.buyer_uid===user.uid;
  const valid=(seller&&row.state==='requested'&&['approved','rejected'].includes(body.state))||(buyer&&row.state==='approved'&&body.state==='in_transit')||(seller&&row.state==='in_transit'&&body.state==='received');if(!valid)throw new Error('FORBIDDEN');const tracking=String(body.tracking||'').trim(),reason=String(body.reason||'').trim();if(tracking.length>120||reason.length>500||(body.state==='in_transit'&&tracking.length<3)||(['approved','rejected'].includes(body.state)&&reason.length<10))throw new Error('INVALID_MARKET_INPUT');
  const saved=await env.SG_DB.prepare('UPDATE market_returns SET state=?,tracking=?,decision_reason=?,updated_at=? WHERE order_id=? AND state=? RETURNING order_id').bind(body.state,tracking||row.tracking,reason||row.decision_reason,Date.now(),row.order_id,row.state).first();if(!saved)throw new Error('RESOURCE_CONFLICT');return {ok:true};
 }
 if(action==='reviews/create'){
  const order=await savedOrder(env,body.orderId);if(!order||order.buyer_uid!==user.uid||order.state!=='delivered')throw new Error('RESOURCE_NOT_FOUND');
  if(!Number.isInteger(body.rating)||body.rating<1||body.rating>5||String(body.comment||'').length>1000)throw new Error('INVALID_MARKET_INPUT');
  await env.SG_DB.prepare('INSERT INTO market_reviews(order_id,buyer_uid,seller_uid,rating,comment,created_at) VALUES (?,?,?,?,?,?)').bind(order.id,user.uid,order.seller_uid,body.rating,String(body.comment||''),Date.now()).run();return {ok:true};
 }
 if(action==='reviews/list'){const rows=await env.SG_DB.prepare('SELECT rating,comment,created_at FROM market_reviews WHERE seller_uid=? ORDER BY created_at DESC LIMIT 50').bind(id(body.sellerUid)).all();return {ok:true,reviews:rows.results};}
 if(action==='disputes/open'){
  const order=await savedOrder(env,body.orderId),why=String(body.reason||'').trim();if(!order||![order.buyer_uid,order.seller_uid].includes(user.uid))throw new Error('RESOURCE_NOT_FOUND');transition(order,user.uid,'disputed');if(why.length<10||why.length>1000)throw new Error('INVALID_MARKET_INPUT');
  const now=Date.now();await audit(env,user.uid,'market_dispute',order.id,'opened',[env.SG_DB.prepare('INSERT INTO market_dispute_context VALUES (?,?)').bind(order.id,order.state),env.SG_DB.prepare('INSERT INTO market_disputes(id,order_id,opened_by,reason,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),order.id,user.uid,why,now,now),env.SG_DB.prepare('UPDATE market_orders SET state=\'disputed\',updated_at=? WHERE id=? AND state=?').bind(now,order.id,order.state)]);return {ok:true};
 }
 throw new Error('INVALID_MARKET_INPUT');
}
export async function marketWebhook(request,env){
 const signed=await verifyWebhook(request,env.MERCADOPAGO_WEBHOOK_SECRET);configured(env);
 if(!/^\d{1,25}$/.test(signed.id))return {ok:true,ignored:true};
 // Conta da plataforma pode consultar pagamento de marketplace autorizado; conferir vendedor depois.
 if(!env.MERCADOPAGO_ACCESS_TOKEN)throw new Error('MARKET_NOT_CONFIGURED');
 const initial=await mpRequest(`/v1/payments/${signed.id}`,env.MERCADOPAGO_ACCESS_TOKEN);
 if(!/^sgm_[a-f0-9-]{36}$/.test(initial.external_reference||''))return {ok:true,ignored:true};
 const order=await savedOrder(env,initial.external_reference.slice(4));if(!order)return {ok:true,ignored:true};
 const seller=await sellerCredentials(env,order.seller_uid),payment=await mpRequest(`/v1/payments/${signed.id}`,seller.token);
 const status=validateMarketplacePayment(payment,order,seller.collectorId,env.PAYMENT_ENV),event=`${signed.id}:${signed.requestId}:${signed.ts}`;
 let next=order.state;if(['refunded','charged_back'].includes(status))next=status==='refunded'?'refunded':'disputed';else if(status==='approved'&&order.state==='awaiting_payment')next=order.expires_at>Date.now()?'paid':'disputed';else if(status==='approved'&&order.state==='cancelled')next='disputed';else if(['cancelled','rejected'].includes(status)&&order.state==='awaiting_payment')next='cancelled';
 // Um evento atrasado não volta a disponibilizar pedido estornado/disputado.
 await env.SG_DB.batch([env.SG_DB.prepare('INSERT OR IGNORE INTO market_payment_events(event_key,order_id,status,received_at) VALUES (?,?,?,?)').bind(event,order.id,status,Date.now()),env.SG_DB.prepare(`UPDATE market_orders SET state=CASE WHEN state='refunded' THEN 'refunded' WHEN state='disputed' AND ?<>'refunded' THEN 'disputed' WHEN state=? THEN ? ELSE state END,payment_id=COALESCE(payment_id,?),updated_at=? WHERE id=? AND (payment_id IS NULL OR payment_id=?)`).bind(next,order.state,next,String(payment.id),Date.now(),order.id,String(payment.id))]);
 return {ok:true};
}
export async function marketRefund(request,env,admin){
 configured(env,true);const body=await request.json(),order=await savedOrder(env,body.orderId),why=String(body.reason||'').trim();
 if(!order||!order.payment_id||!['paid','packing','shipped','delivered','disputed'].includes(order.state)||why.length<10||why.length>500)throw new Error('INVALID_MARKET_INPUT');
 await env.SG_DB.prepare('INSERT OR IGNORE INTO market_refunds(id,order_id,requested_by,reason,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),order.id,admin.uid,why,Date.now(),Date.now()).run();
 const row=await env.SG_DB.prepare('SELECT * FROM market_refunds WHERE order_id=?').bind(order.id).first();if(row.state==='completed')return {ok:true,reused:true};
 const seller=await sellerCredentials(env,order.seller_uid),refund=await mpRequest(`/v1/payments/${order.payment_id}/refunds`,seller.token,{method:'POST',headers:{'X-Idempotency-Key':row.id},body:'{}'});
 if(!refund.id||refund.status!=='approved')throw new Error('MERCADOPAGO_FAILED');
 await audit(env,admin.uid,'market_refund',order.id,'approved',[env.SG_DB.prepare('UPDATE market_refunds SET state=\'completed\',provider_id=?,updated_at=? WHERE id=?').bind(String(refund.id),Date.now(),row.id),env.SG_DB.prepare('UPDATE market_orders SET state=\'refunded\',updated_at=? WHERE id=?').bind(Date.now(),order.id),env.SG_DB.prepare("UPDATE market_returns SET state='refunded',updated_at=? WHERE order_id=?").bind(Date.now(),order.id),env.SG_DB.prepare("UPDATE market_disputes SET state='resolved',updated_at=? WHERE order_id=?").bind(Date.now(),order.id)]);return {ok:true};
}
export async function expireMarket(env){if(!env.SG_DB)return;if(env.FIRESTORE_SERVICE_ACCOUNT){const pending=(await env.SG_DB.prepare('SELECT * FROM market_offers WHERE mirror_pending=1 ORDER BY updated_at LIMIT 10').all()).results;for(const offer of pending){try{await mirrorOffer(env,offer,offer.last_actor);}catch{console.warn(JSON.stringify({event:'market_chat_mirror_failed',id:offer.id}));}}}await env.SG_DB.prepare('UPDATE market_orders SET state=\'cancelled\',updated_at=? WHERE state=\'awaiting_payment\' AND expires_at<?').bind(Date.now(),Date.now()).run();await env.SG_DB.prepare('DELETE FROM seller_oauth WHERE expires_at<?').bind(Date.now()-86400000).run();}

export async function resolveDispute(request,env,admin){
 configured(env);const b=await request.json(),order=await savedOrder(env,b.orderId),reason=String(b.reason||'').trim();if(!order||reason.length<10||reason.length>500||!['resume','refunded'].includes(b.decision))throw new Error('INVALID_MARKET_INPUT');
 let next='refunded';if(b.decision==='resume'){if(order.state!=='disputed'||!order.payment_id)throw new Error('RESOURCE_CONFLICT');const prior=await env.SG_DB.prepare('SELECT prior_state FROM market_dispute_context WHERE order_id=?').bind(order.id).first();if(!prior||!['paid','packing','shipped','delivered'].includes(prior.prior_state))throw new Error('RESOURCE_CONFLICT');const seller=await sellerCredentials(env,order.seller_uid),payment=await mpRequest(`/v1/payments/${order.payment_id}`,seller.token);if(validateMarketplacePayment(payment,order,seller.collectorId,env.PAYMENT_ENV)!=='approved')throw new Error('PAYMENT_MISMATCH');next=prior.prior_state;}
 else {const refund=await env.SG_DB.prepare('SELECT state FROM market_refunds WHERE order_id=?').bind(order.id).first();if(order.state!=='refunded'||refund?.state!=='completed')throw new Error('RESOURCE_CONFLICT');}
 await audit(env,admin.uid,'dispute_resolution',order.id,b.decision,[env.SG_DB.prepare('INSERT INTO market_dispute_decisions VALUES (?,?,?,?,?)').bind(order.id,admin.uid,b.decision,reason,Date.now()),env.SG_DB.prepare('UPDATE market_orders SET state=?,updated_at=? WHERE id=? AND state=?').bind(next,Date.now(),order.id,order.state),env.SG_DB.prepare("UPDATE market_disputes SET state='resolved',updated_at=? WHERE order_id=?").bind(Date.now(),order.id)]);return {ok:true};
}
