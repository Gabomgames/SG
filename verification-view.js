const millis=value=>value?.toMillis?.() ?? (typeof value==='number'?value:value?.seconds?value.seconds*1000:Date.parse(value));
export function activeFounder(profile,now=Date.now()){
  return profile?.founderGrant?.status==='active' && millis(profile.founderGrant.expiresAt)>now;
}
export function verificationCopy(status,verification,normal){
  return status==='active'&&verification.source==='sg_founders'
    ? ['Fundador SG — Verificado Gamer ativo','Você recebeu 365 dias gratuitos na promoção dos 50 Fundadores SG. Sem cobrança ou renovação automática.']
    : normal;
}
