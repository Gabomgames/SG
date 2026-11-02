const {createHash}=require('node:crypto');
const {LIMIT,DAYS,DAY,millis,emailIdentity,effectiveVerification,eligibility}=require('./founders-domain');

// db/Auth/Timestamp are injected so policy and atomic writes can be exercised
// with an isolated store as well as the real Firestore emulator.
function createFoundersService({db,auth,Timestamp,enabled=()=>false,clock=Date.now}){
  const campaignRef=db.doc('founderCampaigns/launch');
  async function sync(uid){
    if(!enabled())return {status:'disabled'};
    const account=await auth.getUser(uid);
    if(eligibility(account,{},null)==='ineligible')return {status:'ineligible'};
    const emailKey=createHash('sha256').update(emailIdentity(account.email)).digest('hex');
    const userRef=db.doc(`users/${uid}`),grantRef=db.doc(`founderGrants/${uid}`),emailRef=db.doc(`founderEmails/${emailKey}`);
    return db.runTransaction(async tx=>{
      const [campaignSnap,userSnap,grantSnap,emailSnap,riskSnap]=await Promise.all([
        tx.get(campaignRef),tx.get(userRef),tx.get(grantRef),tx.get(emailRef),tx.get(db.doc(`founderRisk/${uid}`))]);
      if(grantSnap.exists){const grant=grantSnap.data();return {status:grant.status==='active'&&millis(grant.expiresAt)<=clock()?'expired':grant.status,duplicate:true};}
      const campaign=campaignSnap.data(),profile=userSnap.exists?userSnap.data():null;
      const now=clock(),launch=millis(campaign?.launchAt);
      if(!campaign?.enabled||!Number.isFinite(launch)||now<launch)return {status:'not_launched'};
      if(!Number.isInteger(campaign.granted)||campaign.granted<0||campaign.granted>LIMIT)throw new Error('FOUNDER_COUNTER_INVALID');
      if(campaign.granted===LIMIT||campaign.closed===true)return {status:'exhausted'};
      const state=eligibility(account,profile,riskSnap.data());
      if(state!=='eligible')return {status:state};
      if(emailSnap.exists)return {status:'duplicate_identity'};
      const last=millis(campaign.lastEligibleAt);
      const at=Timestamp.fromMillis(Math.max(now,Number.isFinite(last)?last+1:now));
      const grant={uid,status:'active',sequence:campaign.granted+1,days:DAYS,eligibleAt:at,startedAt:at,
        expiresAt:Timestamp.fromMillis(millis(at)+DAYS*DAY),autoRenew:false,amountCents:0};
      const paid=profile.paidVerification||profile.verification||{};
      const verification=effectiveVerification(paid,grant,now);
      tx.create(grantRef,grant);
      tx.create(emailRef,{uid,grantedAt:at});
      tx.update(campaignRef,{granted:grant.sequence,lastEligibleAt:at,closed:grant.sequence===LIMIT,...(grant.sequence===LIMIT?{closedAt:at}:{})});
      tx.update(userRef,{founderGrant:grant,paidVerification:paid,verification});
      tx.set(db.doc(`publicProfiles/${uid}`),{verification},{merge:true});
      tx.create(db.doc(`notifications/founder-${uid}`),{toUid:uid,fromUid:'system',type:'verification',
        title:'Você é um dos 50 Fundadores SG!',message:'Bem-vindo ao Something Gamer! Você recebeu 365 dias gratuitos de Verificado Gamer, sem cobrança ou renovação automática.',
        special:true,read:false,createdAt:at});
      return {status:'active',sequence:grant.sequence,expiresAt:millis(grant.expiresAt)};
    },{maxAttempts:64});
  }
  async function writePaid(uid,patch,{replace=false,revokeFounder=false}={}){
    return db.runTransaction(async tx=>{
      const ref=db.doc(`users/${uid}`),snap=await tx.get(ref);
      if(!snap.exists)throw new Error('USER_NOT_FOUND');
      const data=snap.data(),paid=replace?patch:{...(data.paidVerification||data.verification||{}),...patch};
      const grant=revokeFounder&&data.founderGrant?{...data.founderGrant,status:'revoked'}:data.founderGrant;
      const verification=effectiveVerification(paid,grant,clock());
      tx.update(ref,{paidVerification:paid,verification,...(grant?{founderGrant:grant}:{})});
      tx.set(db.doc(`publicProfiles/${uid}`),{verification},{merge:true});
      if(revokeFounder&&grant)tx.update(db.doc(`founderGrants/${uid}`),{status:'revoked'});
    });
  }
  async function expire(){
    const grants=await db.collection('founderGrants').limit(LIMIT).get();
    for(const item of grants.docs){
      const grant=item.data();
      if(grant.status!=='active'||millis(grant.expiresAt)>clock())continue;
      await db.runTransaction(async tx=>{
        const ref=db.doc(`users/${grant.uid}`),[current,user]=await Promise.all([tx.get(item.ref),tx.get(ref)]);
        if(!current.exists||current.data().status!=='active'||millis(current.data().expiresAt)>clock())return;
        tx.update(item.ref,{status:'expired'});
        if(user.exists){
          const data=user.data(),expired={...current.data(),status:'expired'};
          tx.update(ref,{founderGrant:expired,verification:data.paidVerification||{status:'expired'}});
          tx.set(db.doc(`publicProfiles/${grant.uid}`),{verification:data.paidVerification||{status:'expired'}},{merge:true});
        }
      });
    }
  }
  return {sync,writePaid,expire};
}
module.exports={createFoundersService};
