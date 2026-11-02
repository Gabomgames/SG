import {manageNowAds,nativeServe,saveNowProfile,nowEvent,nowLead,runNowRules} from './now-ads.js';
import {consumeRate} from './limits.js';
import {verifyWebhook,validOrderId,checkoutUrl,cents} from './payment-domain.js';
import {mpRequest} from './seller-oauth.js';import {getDocument} from './firestore-store.js';
const id=v=>{if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(v))throw new Error('INVALID_AD_INPUT');return v;};
function configured(env,charge=false){if(!env.SG_DB)throw new Error('ADS_NOT_CONFIGURED');if(charge&&env.ADS_PAYMENTS_ENABLED!=='true')throw new Error('ADS_CHECKOUT_DISABLED');if(charge&&(env.PAYMENT_ENV==='test')!==String(env.MERCADOPAGO_ACCESS_TOKEN).startsWith('TEST-'))throw new Error('PAYMENT_ENV_MISMATCH');}
export async function adsApi(request,env,user){
 await consumeRate(env,user.uid,'ads');
 configured(env);const body=await request.json(),action=new URL(request.url).pathname.slice('/ads/'.length),now=Date.now();
 if(action==='manager')return manageNowAds(env,user,body);
 if(action==='event')return nowEvent(env,user,body);
 if(action==='lead')return nowLead(env,user,body);
 if(action==='preferences'){
  if(body.save===true){const tags=Array.isArray(body.interests)?body.interests:[];if(typeof body.consent!=='boolean'||tags.length>10||tags.some(t=>typeof t!=='string'||! /^[a-z0-9-]{1,30}$/.test(t))||String(body.region||'').length>80)throw new Error('INVALID_AD_INPUT');await env.SG_DB.prepare('INSERT INTO ad_preferences VALUES (?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET consent=excluded.consent,region=excluded.region,interests=excluded.interests,updated_at=excluded.updated_at').bind(user.uid,body.consent?1:0,body.consent?String(body.region||'').trim().toLowerCase():'',JSON.stringify(body.consent?tags:[]),now).run();}
  if(body.save===true)await saveNowProfile(env,user,body);
  const profile=await env.SG_DB.prepare('SELECT age,gender,behaviors FROM now_profile WHERE uid=?').bind(user.uid).first();
  const saved=await env.SG_DB.prepare('SELECT consent,region,interests FROM ad_preferences WHERE uid=?').bind(user.uid).first();return {ok:true,profile:profile?{...profile,behaviors:JSON.parse(profile.behaviors)}:{age:null,gender:'undisclosed',behaviors:[]},preferences:saved?{...saved,consent:Boolean(saved.consent),interests:JSON.parse(saved.interests)}:{consent:false,region:'',interests:[]}};
 }
 if(action==='list'){
  const campaigns=(await env.SG_DB.prepare(`SELECT c.*,(SELECT COUNT(*) FROM ad_delivery d WHERE d.campaign_id=c.id AND d.viewed_at IS NOT NULL) AS impressions,(SELECT COUNT(*) FROM ad_delivery d WHERE d.campaign_id=c.id AND d.clicked_at IS NOT NULL) AS clicks,(SELECT COUNT(*) FROM ad_conversions v JOIN market_orders o ON o.id=v.order_id WHERE v.campaign_id=c.id AND o.state IN ('paid','packing','shipped','delivered')) AS conversions,(SELECT COALESCE(SUM(v.value_cents),0) FROM ad_conversions v JOIN market_orders o ON o.id=v.order_id WHERE v.campaign_id=c.id AND o.state IN ('paid','packing','shipped','delivered')) AS conversion_value_cents FROM ad_campaigns c WHERE owner_uid=? ORDER BY created_at DESC LIMIT 100`).bind(user.uid).all()).results;
  return {ok:true,paymentsEnabled:env.ADS_PAYMENTS_ENABLED==='true',mediaEnabled:env.SOCIAL_MEDIA_ENABLED==='true',campaigns};
 }
 if(action==='create'){
  const name=String(body.name||'').trim(),headline=String(body.headline||'').trim(),text=String(body.creativeText||'').trim(),budget=body.budgetCents,days=body.durationDays,target=id(body.targetId||user.uid),type=body.targetType==='product'?'market':body.targetType;
  if(name.length<3||name.length>80||headline.length<3||headline.length>90||text.length>500||!Number.isInteger(budget)||budget<1000||budget>100000||!Number.isInteger(days)||days<1||days>90||body.policyAccepted!==true)throw new Error('INVALID_AD_INPUT');
  let destination;
  if(type==='profile'){if(target!==user.uid)throw new Error('FORBIDDEN');destination=`${env.APP_URL}/profile.html?u=${encodeURIComponent(target)}`;}
  else if(type==='community'){const server=await getDocument(env,`servers/${target}`);if(!server||server.ownerUid!==user.uid||server.visibility!=='public')throw new Error('FORBIDDEN');destination=`${env.APP_URL}/chat.html?s=${encodeURIComponent(target)}`;}
  else if(type==='market'){const product=await env.SG_DB.prepare('SELECT seller_uid,status FROM market_products WHERE id=?').bind(target).first();if(!product||product.seller_uid!==user.uid||product.status!=='active')throw new Error('FORBIDDEN');destination=`${env.APP_URL}/marketplace.html?product=${encodeURIComponent(target)}`;}
  else if(type==='post'){const social=await env.SG_DB.prepare("SELECT owner_uid FROM social_content WHERE id=? AND state='published' AND expires_at>?").bind(target,now).first();if(social){if(social.owner_uid!==user.uid)throw new Error('FORBIDDEN');destination=`${env.APP_URL}/feed.html?social=${encodeURIComponent(target)}`;}else{const post=await getDocument(env,`posts/${target}`);if(!post||post.uid!==user.uid)throw new Error('FORBIDDEN');destination=`${env.APP_URL}/feed.html#post-${encodeURIComponent(target)}`;}}
  else throw new Error('INVALID_AD_INPUT');
  const placement=body.placement||'feed',audience=body.audience||'broad',region=String(body.region||'').trim().toLowerCase(),interests=Array.isArray(body.interests)?body.interests:[],mediaId=body.mediaId?id(body.mediaId):null;
  if(!['feed','story','reel'].includes(placement)||!['broad','consented'].includes(audience)||region.length>80||interests.length>10||interests.some(t=>typeof t!=='string'||! /^[a-z0-9-]{1,30}$/.test(t)))throw new Error('INVALID_AD_INPUT');
  if(mediaId){const media=await env.SG_DB.prepare('SELECT type FROM social_media WHERE id=? AND owner_uid=? AND expires_at>?').bind(mediaId,user.uid,now+days*86400000).first();if(!media)throw new Error('FORBIDDEN');if(placement==='reel'&&!media.type.startsWith('video/'))throw new Error('INVALID_AD_INPUT');}else if(placement==='reel')throw new Error('INVALID_AD_INPUT');
  const campaignId=crypto.randomUUID();await env.SG_DB.batch([env.SG_DB.prepare('INSERT INTO ad_campaigns(id,owner_uid,name,headline,body,target_url,budget_cents,duration_days,reference,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(campaignId,user.uid,name,headline,text,destination,budget,days,`sga_${campaignId}`,now,now),env.SG_DB.prepare('INSERT INTO ad_creatives VALUES (?,?,?,?,?,?,?)').bind(campaignId,mediaId,placement,audience,audience==='consented'?region:'',JSON.stringify(audience==='consented'?interests:[]),type==='market'?target:null)]);return {ok:true,id:campaignId};
 }
 if(action==='checkout'){
  const native=await env.SG_DB.prepare('SELECT campaign_id FROM now_campaigns WHERE campaign_id=?').bind(id(body.id)).first();if(native){const count=await env.SG_DB.prepare("SELECT COUNT(*) AS n FROM now_ads a JOIN now_ad_sets s ON s.id=a.set_id WHERE s.campaign_id=? AND a.state='active' AND s.state='active' AND s.ends_at>?").bind(body.id,now).first();if(!count.n)throw new Error('INVALID_AD_INPUT');}

  configured(env,true);const row=await env.SG_DB.prepare('SELECT * FROM ad_campaigns WHERE id=? AND owner_uid=?').bind(id(body.id),user.uid).first();if(!row||!['draft','awaiting_payment'].includes(row.state))throw new Error('RESOURCE_CONFLICT');if(row.checkout_url)return {ok:true,checkoutUrl:row.checkout_url};
  const amount=(row.budget_cents/100).toFixed(2),payload={type:'online',processing_mode:'manual',capture_mode:'automatic_async',total_amount:amount,external_reference:row.reference,description:`NOW ADS — ${row.name}`,payer:{email:user.email},items:[{title:`Orçamento NOW ADS — ${row.name}`,unit_price:amount,quantity:1,unit_measure:'unit',total_amount:amount}],config:{online:{success_url:`${env.APP_URL}/ads.html?payment=returned`,pending_url:`${env.APP_URL}/ads.html?payment=pending`,failure_url:`${env.APP_URL}/ads.html?payment=failure`,auto_return:'all'}}};
  const order=await mpRequest('/v1/orders',env.MERCADOPAGO_ACCESS_TOKEN,{method:'POST',headers:{'X-Idempotency-Key':row.id},body:JSON.stringify(payload)});if(!validOrderId(order.id))throw new Error('MERCADOPAGO_FAILED');const checkout=checkoutUrl(order.checkout_url,env.PAYMENT_ENV==='test');await env.SG_DB.prepare('UPDATE ad_campaigns SET provider_id=?,checkout_url=?,state=\'awaiting_payment\',updated_at=? WHERE id=? AND provider_id IS NULL').bind(String(order.id),checkout,now,row.id).run();return {ok:true,checkoutUrl:checkout};
 }
 if(action==='pause'){
  if(!['paused','active'].includes(body.state))throw new Error('INVALID_AD_INPUT');
  const row=await env.SG_DB.prepare('UPDATE ad_campaigns SET state=?,updated_at=? WHERE id=? AND owner_uid=? AND state IN (\'active\',\'paused\') AND payment_state=\'approved\' AND reviewed_by IS NOT NULL AND ends_at>? AND spent_cents<budget_cents RETURNING id').bind(body.state,now,id(body.id),user.uid,now).first();if(!row)throw new Error('RESOURCE_CONFLICT');return {ok:true};
 }
 if(action==='serve'){
  const placement=body.placement||'feed';if(!['feed','story','reel','market','community'].includes(placement))throw new Error('INVALID_AD_INPUT');const native=await nativeServe(env,user,placement);if(native)return {ok:true,ad:native};if(['market','community'].includes(placement))return {ok:true,ad:null};const prefs=await env.SG_DB.prepare('SELECT * FROM ad_preferences WHERE uid=?').bind(user.uid).first();
  const day=new Date().toISOString().slice(0,10);const row=await env.SG_DB.prepare(`SELECT c.*,x.media_id,m.type AS media_type FROM ad_campaigns c LEFT JOIN ad_creatives x ON x.campaign_id=c.id LEFT JOIN social_media m ON m.id=x.media_id WHERE state='active' AND NOT EXISTS(SELECT 1 FROM now_campaigns n WHERE n.campaign_id=c.id) AND COALESCE(x.placement,'feed')=? AND (x.media_id IS NULL OR m.expires_at>?) AND (COALESCE(x.audience,'broad')='broad' OR (?=1 AND (x.region='' OR x.region=?) AND (x.interests='[]' OR EXISTS(SELECT 1 FROM json_each(x.interests) t JOIN json_each(?) p ON t.value=p.value)))) AND c.ends_at>? AND c.spent_cents<c.budget_cents AND c.owner_uid<>?
   AND NOT EXISTS(SELECT 1 FROM ad_delivery d WHERE d.campaign_id=c.id AND viewer_uid=? AND day=?) ORDER BY c.spent_cents ASC,c.created_at ASC LIMIT 1`).bind(placement,now,prefs?.consent||0,prefs?.region||'',prefs?.interests||'[]',now,user.uid,user.uid,day).first();
  if(!row)return {ok:true,ad:null};
  const deliveryId=crypto.randomUUID();await env.SG_DB.prepare('INSERT OR IGNORE INTO ad_delivery(id,campaign_id,viewer_uid,expires_at,day) VALUES (?,?,?,?,?)').bind(deliveryId,row.id,user.uid,now+10*60000,day).run();
  const delivery=await env.SG_DB.prepare('SELECT id FROM ad_delivery WHERE campaign_id=? AND viewer_uid=? AND day=?').bind(row.id,user.uid,day).first();
  return {ok:true,ad:{deliveryId:delivery.id,headline:row.headline,body:row.body,url:row.target_url,mediaUrl:row.media_id?`${env.API_URL}/social/media/${row.media_id}`:'',mediaType:row.media_type||'',placement}};
 }
 if(action==='impression'){
  const row=await env.SG_DB.prepare('UPDATE ad_delivery SET viewed_at=? WHERE id=? AND viewer_uid=? AND expires_at>? AND viewed_at IS NULL RETURNING id').bind(now,id(body.deliveryId),user.uid,now).first();return {ok:true,recorded:Boolean(row)};
 }
 if(action==='click'){
  const row=await env.SG_DB.prepare('UPDATE ad_delivery SET clicked_at=? WHERE id=? AND viewer_uid=? AND viewed_at IS NOT NULL AND clicked_at IS NULL AND expires_at>? RETURNING id').bind(now,id(body.deliveryId),user.uid,now).first();return {ok:true,recorded:Boolean(row)};
 }
 throw new Error('INVALID_AD_INPUT');
}
export async function reviewAd(request,env,admin){
 configured(env);const body=await request.json(),reason=String(body.reason||'').trim();if(!['approved','rejected'].includes(body.decision)||reason.length<10||reason.length>500)throw new Error('INVALID_AD_INPUT');
 const row=await env.SG_DB.prepare('SELECT * FROM ad_campaigns WHERE id=?').bind(id(body.id)).first();const creative=await env.SG_DB.prepare('SELECT media_id FROM ad_creatives WHERE campaign_id=?').bind(id(body.id)).first();const nativeMedia=await env.SG_DB.prepare("SELECT COUNT(*) AS n FROM now_ads a JOIN now_ad_sets s ON s.id=a.set_id WHERE s.campaign_id=? AND a.media_ids<>'[]'").bind(body.id).first();if((creative?.media_id||nativeMedia?.n)&&body.decision==='approved'&&body.mediaReviewed!==true)throw new Error('INVALID_AD_INPUT');if(!row||row.state!=='pending_review'||row.payment_state!=='approved')throw new Error('RESOURCE_CONFLICT');const now=Date.now(),state=body.decision==='approved'?'active':'rejected';
 await env.SG_DB.batch([env.SG_DB.prepare(`INSERT INTO admin_audit(id,actor_uid,action,target_id,result,created_at) SELECT ?,?,'ad_review',id,?,? FROM ad_campaigns WHERE id=? AND state='pending_review' AND payment_state='approved'`).bind(crypto.randomUUID(),admin.uid,state,now,row.id),env.SG_DB.prepare('UPDATE ad_campaigns SET state=?,reviewed_by=?,review_reason=?,starts_at=?,ends_at=?,updated_at=? WHERE id=? AND state=\'pending_review\' AND payment_state=\'approved\'').bind(state,admin.uid,reason,now,now+row.duration_days*86400000,now,row.id)]);return {ok:true};
}
export async function reconcileAd(env,row){
 const order=await mpRequest(`/v1/orders/${encodeURIComponent(row.provider_id)}`,env.MERCADOPAGO_ACCESS_TOKEN);
 if(String(order.id).toLowerCase()!==row.provider_id.toLowerCase()||order.external_reference!==row.reference||cents(order.total_amount)!==row.budget_cents||String(order.collector_id??order.user_id)!==String(env.MERCADOPAGO_COLLECTOR_ID)||String(order.currency_id??order.currency)!=='BRL')throw new Error('PAYMENT_MISMATCH');
 const payments=order.transactions?.payments||[];let status='pending';if(['refunded','charged_back','charged_back_refunded'].includes(order.status_detail)||payments.some(x=>['refunded','charged_back'].includes(x.status)))status='revoked';else if(order.status==='processed'&&order.status_detail==='accredited'&&payments.length&&payments.every(x=>x.status==='processed'&&x.status_detail==='accredited')&&payments.reduce((sum,x)=>sum+cents(x.amount),0)===row.budget_cents)status='approved';
 await env.SG_DB.prepare(`UPDATE ad_campaigns SET payment_state=CASE WHEN payment_state='revoked' THEN 'revoked' WHEN payment_state='approved' AND ?='pending' THEN 'approved' ELSE ? END,
  state=CASE WHEN payment_state='revoked' OR ?='revoked' THEN 'revoked' WHEN ?='approved' AND state IN ('draft','awaiting_payment') THEN 'pending_review' ELSE state END,updated_at=? WHERE id=?`).bind(status,status,status,status,Date.now(),row.id).run();
}
export async function adWebhook(request,env){const signed=await verifyWebhook(request,env.MERCADOPAGO_WEBHOOK_SECRET);configured(env);if(!validOrderId(signed.id))return {ok:true,ignored:true};const row=await env.SG_DB.prepare('SELECT * FROM ad_campaigns WHERE provider_id=? COLLATE NOCASE').bind(signed.id).first();if(row)await reconcileAd(env,row);return {ok:true};}
export async function reconcileAds(env){if(env.SG_DB)await runNowRules(env);if(!env.SG_DB||!env.MERCADOPAGO_ACCESS_TOKEN)return;const rows=await env.SG_DB.prepare('SELECT * FROM ad_campaigns WHERE provider_id IS NOT NULL AND state IN (\'awaiting_payment\',\'pending_review\',\'active\',\'paused\') ORDER BY updated_at LIMIT 20').all();for(const row of rows.results){try{await reconcileAd(env,row);}catch{console.warn(JSON.stringify({event:'ad_reconciliation_failed',id:row.id}));}}await env.SG_DB.prepare('UPDATE ad_campaigns SET state=\'finished\' WHERE state IN (\'active\',\'paused\') AND (ends_at<? OR spent_cents>=budget_cents)').bind(Date.now()).run();}
