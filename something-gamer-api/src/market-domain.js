const STATES={awaiting_payment:{buyer:['cancelled'],seller:[]},paid:{buyer:['disputed'],seller:['packing','disputed']},packing:{buyer:['disputed'],seller:['shipped','disputed']},shipped:{buyer:['delivered','disputed'],seller:['disputed']},delivered:{buyer:['disputed'],seller:['disputed']},disputed:{buyer:[],seller:[]},cancelled:{buyer:[],seller:[]},refunded:{buyer:[],seller:[]}};
export function cents(value,max=5000000){if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error('INVALID_MARKET_INPUT');return value;}
export function quote(items,shippingCents){
 if(!Array.isArray(items)||!items.length||items.length>20||!Number.isSafeInteger(shippingCents)||shippingCents<0||shippingCents>100000)throw new Error('INVALID_MARKET_INPUT');
 const subtotal=items.reduce((sum,x)=>{cents(x.unitCents);if(!Number.isInteger(x.quantity)||x.quantity<1||x.quantity>20)throw new Error('INVALID_MARKET_INPUT');return sum+x.unitCents*x.quantity;},0);
 if(subtotal>5000000)throw new Error('INVALID_MARKET_INPUT');
 const commission=Math.round(subtotal/10);return {subtotalCents:subtotal,shippingCents,commissionCents:commission,totalCents:subtotal+shippingCents,sellerGrossCents:subtotal+shippingCents-commission};
}
export function transition(order,uid,next){const role=uid===order.buyer_uid?'buyer':uid===order.seller_uid?'seller':'';if(!role)throw new Error('FORBIDDEN');if(!(STATES[order.state]?.[role]||[]).includes(next))throw new Error('RESOURCE_CONFLICT');return next;}
export function validateMarketplacePayment(payment,order,collectorId,mode){
 if(String(payment.id)!==String(order.payment_id||payment.id)||payment.external_reference!==`sgm_${order.id}`||payment.currency_id!=='BRL'||String(payment.collector_id)!==String(collectorId)
  ||Math.round(Number(payment.transaction_amount)*100)!==order.total_cents||!Number.isFinite(Number(payment.transaction_amount))||payment.live_mode!==(mode==='production'))throw new Error('PAYMENT_MISMATCH');
 const fee=(payment.fee_details||[]).filter(x=>['application_fee','marketplace_fee'].includes(x.type)).reduce((n,x)=>n+Math.round(Number(x.amount)*100),0);
 if(payment.status==='approved'&&fee!==order.commission_cents)throw new Error('PAYMENT_MISMATCH');
 return payment.status;
}
export function listingInput(body){
 const categories=['Hardware','Games','Consoles','Acessórios','Colecionáveis','Eletrônicos','Móveis','Roupas','Esportes','Outros'],conditions=['Novo','Seminovo','Usado'];
 const title=String(body.title||'').trim(),description=String(body.description||'').trim(),policy=String(body.returnPolicy||'').trim();
 if(title.length<3||title.length>90||description.length>1000||!categories.includes(body.category)||!conditions.includes(body.condition)||policy.length<10||policy.length>500||!Number.isInteger(body.stock)||body.stock<0||body.stock>10000)throw new Error('INVALID_MARKET_INPUT');
 cents(body.priceCents);if(!Number.isInteger(body.shippingCents)||body.shippingCents<0||body.shippingCents>100000)throw new Error('INVALID_MARKET_INPUT');
 const image=String(body.imageUrl||'');if(image){const u=new URL(image);if(u.protocol!=='https:'||!['something-gamer-api.something-gamer-nowtech.workers.dev','firebasestorage.googleapis.com'].includes(u.hostname))throw new Error('INVALID_MARKET_INPUT');}
 return {title,description,category:body.category,condition:body.condition,returnPolicy:policy,stock:body.stock,priceCents:body.priceCents,shippingCents:body.shippingCents,imageUrl:image,location:String(body.location||'').slice(0,80)};
}
