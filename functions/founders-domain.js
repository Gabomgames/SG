// Server-only policy. No payment provider is called by this promotion.
const LIMIT=50, DAYS=365, DAY=86400000;
const millis=value=>value?.toMillis?.() ?? (value instanceof Date?value.getTime():Number.isFinite(value?.seconds)?value.seconds*1000+(value.nanoseconds||0)/1000000:typeof value==='number'?value:Date.parse(value));
function emailIdentity(email){
  const parts=String(email||'').trim().toLowerCase().split('@');
  if(parts.length!==2||!parts[0]||!parts[1])return '';
  let [local,host]=parts;
  if(['gmail.com','googlemail.com'].includes(host)){host='gmail.com';local=local.split('+')[0].replace(/\./g,'');}
  return `${local}@${host}`;
}
function effectiveVerification(paid={},grant,now=Date.now()){
  const founderEnd=millis(grant?.expiresAt);
  if(grant?.status!=='active'||!Number.isFinite(founderEnd)||founderEnd<=now)return paid;
  const paidEnd=millis(paid.expiresAt);
  // Paid records stay separate and unchanged, including review/refund state.
  const expiresAt=paid.status==='active'&&(!paid.expiresAt||paidEnd>founderEnd)?(paid.expiresAt??null):grant.expiresAt;
  return {...paid,status:'active',source:'sg_founders',provider:paid.provider||'sg_founders',
    approvalMode:'automatic_promotion',expiresAt,founderExpiresAt:grant.expiresAt};
}
function eligibility(account,profile,risk){
  if(!account||account.disabled||!account.emailVerified||!emailIdentity(account.email)||!account.providerData?.length)return 'ineligible';
  if(!profile)return 'waiting_profile';
  if(risk?.blocked===true||risk?.reviewRequired===true||['banned','suspended'].includes(profile.moderation?.status))return 'risk_review';
  return 'eligible';
}
module.exports={LIMIT,DAYS,DAY,millis,emailIdentity,effectiveVerification,eligibility};
