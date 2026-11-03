import {mediaRecord,checkedObject} from './publication-media.js';
import {getDocument,listDocuments,patchWrite,auditedCommit,safeId} from './firestore-store.js';
const reason=v=>{const text=String(v||'').trim();if(text.length<5||text.length>1000)throw new Error('INVALID_ADMIN_ACTION');return text;};
const millis=v=>v?.seconds? v.seconds*1000 : 0;
function notice(env,actor,uid,message){return patchWrite(env,`notifications/${crypto.randomUUID()}`,{toUid:uid,fromUid:actor.uid,type:'moderation',title:'Atualização da moderação',message,special:true,read:false,createdAt:new Date()},{create:true});}
async function userAndProfile(env,uid){safeId(uid);const user=await getDocument(env,`users/${uid}`);if(!user)throw new Error('RESOURCE_NOT_FOUND');return user;}
export async function adminApi(request,env,actor){
 const body=await request.json(),action=body.action;
 if(action==='founderPromotion'){
  const [campaign,grants]=await Promise.all([getDocument(env,'founderCampaigns/launch'),listDocuments(env,'founderGrants',{size:50})]);
  return {ok:true,enabled:campaign?.enabled===true,granted:campaign?.granted||0,limit:50,closed:campaign?.closed===true,
   grants:grants.items.map(g=>({uid:g.uid,sequence:g.sequence,status:g.status,startedAt:g.startedAt,expiresAt:g.expiresAt}))};
 }
 if(action==='dashboard'){
  const names=['users','promotions','companyApplications','reports','marketListings','adCampaigns'];
  const lists=await Promise.all(names.map(name=>listDocuments(env,name)));
  const [users,promotions,applications,reports,listings,campaigns]=lists.map(x=>x.items);
  const purchases=env.SG_DB?(await env.SG_DB.prepare('SELECT id,uid,plan,state AS status,amount_cents,created_at FROM payments ORDER BY created_at DESC LIMIT 100').all()).results.map(x=>({...x,amount:x.amount_cents/100,kind:'verification',label:x.plan,createdAt:{seconds:Math.floor(x.created_at/1000)}})):[];
  return {ok:true,users:users.map(x=>({...x,uid:x.id})),promotions,companyApplications:applications.filter(x=>x.status==='pending'),reports:reports.filter(x=>x.status==='open'),listings,campaigns,purchases,
   stats:{total:users.length,verified:users.filter(x=>x.verification?.status==='active'&&(!x.verification.expiresAt||millis(x.verification.expiresAt)>Date.now())).length,pending:users.filter(x=>['pending','payment_pending'].includes(x.verification?.status)).length},
   cursors:Object.fromEntries(names.map((name,i)=>[name,lists[i].cursor])),sample:true};
 }
 if(action==='list'){
  if(!['users','reports','supportTickets','adminAuditLogs','sanctions','marketListings','adCampaigns','communities'].includes(body.collection))throw new Error('INVALID_ADMIN_ACTION');
  return {ok:true,...await listDocuments(env,body.collection,{cursor:body.cursor||''})};
 }
 if(['setBadge','setDevRole','setOfficial','setVerification','reviewPhoto'].includes(action)){
  const uid=safeId(body.uid),user=await userAndProfile(env,uid);let patch={};
  if(action==='setBadge'){if(!['nowFollowed','sgFollowed'].includes(body.badge)||typeof body.enabled!=='boolean')throw new Error('INVALID_ADMIN_ACTION');patch.badges={...user.badges,[body.badge]:body.enabled};}
  if(action==='setDevRole'){if(typeof body.enabled!=='boolean')throw new Error('INVALID_ADMIN_ACTION');patch.badges={...user.badges,dev:body.enabled};}
  if(action==='setOfficial'){if(!['official_now','official_sg','gamer'].includes(body.accountType))throw new Error('INVALID_ADMIN_ACTION');patch.accountType=body.accountType;}
  if(action==='setVerification'){if(!['none','suspended'].includes(body.status))throw new Error('PAYMENT_NOT_REVIEWABLE');patch.verification={...user.verification,status:body.status,reviewed:false};}
  if(action==='setVerification'){
   patch.paidVerification={...(user.paidVerification||user.verification||{}),status:body.status,reviewed:false};
   if(user.founderGrant)patch.founderGrant={...user.founderGrant,status:'revoked'};
  }
  if(action==='reviewPhoto'){
   if(!['approve','reject'].includes(body.decision)||!user.pendingPhotoURL)throw new Error('INVALID_ADMIN_ACTION');
   patch.photoModeration={status:body.decision==='approve'?'approved':'rejected',reviewedBy:actor.uid,reviewedAt:new Date()};
   if(body.decision==='approve'){const candidate=new URL(user.pendingPhotoURL);if(candidate.origin===new URL(env.API_URL).origin&&/^\/media\/[a-f0-9]{48}$/.test(candidate.pathname)){const row=await mediaRecord(env,candidate.pathname.split('/').pop());if(row.owner_uid!==uid||row.purpose!=='profile')throw new Error('FORBIDDEN');await checkedObject(env,row);await env.SG_DB.prepare("UPDATE quarantined_media SET state='approved' WHERE id=?").bind(row.id).run();}const u=new URL(user.pendingPhotoURL);if(u.protocol!=='https:'||!['something-gamer-api.something-gamer-nowtech.workers.dev','firebasestorage.googleapis.com'].includes(u.hostname))throw new Error('INVALID_ADMIN_ACTION');patch.photoURL=u.href;}
   patch.pendingPhotoURL='';
  }
  const publicPatch=Object.fromEntries(Object.entries(patch).filter(([k])=>['badges','accountType','verification','photoURL'].includes(k)));
  const writes=[patchWrite(env,`users/${uid}`,patch,{updateTime:user._updateTime})];
  if(action==='setVerification'&&user.founderGrant)writes.push(patchWrite(env,`founderGrants/${uid}`,{status:'revoked'}));
  if(Object.keys(publicPatch).length)writes.push(patchWrite(env,`publicProfiles/${uid}`,publicPatch));
  await auditedCommit(env,actor,action,uid,writes);return {ok:true};
 }

 // Exclusão administrativa com 30 dias para recurso. O Worker NÃO apaga autenticação
 // nem permite excluir a conta do administrador ou uma conta oficial.
 if(action==='scheduleAccountRemoval'){
  if(actor.claims?.role!=='super_admin')throw new Error('FORBIDDEN');
  const uid=safeId(body.uid),target=await userAndProfile(env,uid),why=String(body.reason||'').trim();
  const label=String(target.username||target.name||uid).trim().toLowerCase();
  if(uid===actor.uid||['official_now','official_sg'].includes(target.accountType)||target.deletionRequest?.status==='pending'||why.length<20||why.length>500||String(body.confirmation||'').trim().toLowerCase()!==label)throw new Error('INVALID_ADMIN_ACTION');
  const now=new Date(),after=new Date(Date.now()+30*86400000),sanctionId=crypto.randomUUID(),caseNumber=`SG-${sanctionId.slice(0,8).toUpperCase()}`;
  const deletionRequest={status:'pending',requestedAt:now,executeAfter:after,requestedBy:actor.uid,reason:why,caseNumber};
  const originalModeration=target.moderation||{};
  const writes=[patchWrite(env,`users/${uid}`,{deletionRequest,moderation:{...originalModeration,status:'banned',lastReason:why,lastNotice:'Sua conta foi encerrada pela moderação. Você pode solicitar revisão pelo suporte antes de 30 dias.'}},{updateTime:target._updateTime}),
   patchWrite(env,`publicProfiles/${uid}`,{visibility:'private'}),
   patchWrite(env,`deletionQueue/${uid}`,{uid,status:'pending',executeAfter:after,reason:why,requestedBy:actor.uid,requestedAt:now,priorModeration:originalModeration,priorVisibility:target.profileVisibility||'public',sanctionId}),
   patchWrite(env,`sanctions/${sanctionId}`,{targetUid:uid,type:'ban',reason:why,ruleId:'account_removal',caseNumber,createdBy:actor.uid,createdAt:now,startsAt:now,endsAt:null,revoked:null},{create:true}),
   notice(env,actor,uid,`Sua conta foi encerrada pela moderação. Motivo: ${why}. Solicite revisão pelo suporte em até 30 dias.`)];
  await auditedCommit(env,actor,action,uid,writes,why);
  return {ok:true,status:'pending',executeAfter:after.toISOString()};
 }
 if(action==='cancelAccountRemoval'){
  if(actor.claims?.role!=='super_admin')throw new Error('FORBIDDEN');
  const uid=safeId(body.uid),why=String(body.reason||'').trim(),queue=await getDocument(env,`deletionQueue/${uid}`),target=await userAndProfile(env,uid);
  if(!queue||queue.status!=='pending'||why.length<10||why.length>500)throw new Error('INVALID_ADMIN_ACTION');
  const writes=[patchWrite(env,`deletionQueue/${uid}`,{status:'cancelled',executeAfter:null,cancelledAt:new Date(),cancelledBy:actor.uid,cancellationReason:why},{updateTime:queue._updateTime}),
   patchWrite(env,`users/${uid}`,{deletionRequest:{status:'cancelled',cancelledAt:new Date()},moderation:queue.priorModeration||{status:'active'}},{updateTime:target._updateTime}),
   patchWrite(env,`publicProfiles/${uid}`,{visibility:queue.priorVisibility||'private'}),
   ...(queue.sanctionId?[patchWrite(env,`sanctions/${queue.sanctionId}`,{revoked:{by:actor.uid,at:new Date(),reason:why}})]:[]),
   notice(env,actor,uid,'O encerramento de sua conta foi revogado após análise. Seu acesso pode ser restaurado.')];
  await auditedCommit(env,actor,action,uid,writes,why);
  return {ok:true,status:'cancelled'};
 }
 if(action==='applySanction'){
  const uid=safeId(body.uid),user=await userAndProfile(env,uid),why=reason(body.reason),type=body.type;
  if(!['warning','suspension','ban'].includes(type)||uid===actor.uid)throw new Error('INVALID_ADMIN_ACTION');
  const hours=Number(body.durationHours);if(type==='suspension'&&(!Number.isInteger(hours)||hours<1||hours>8760))throw new Error('INVALID_ADMIN_ACTION');
  const id=crypto.randomUUID(),now=new Date(),endsAt=type==='suspension'?new Date(Date.now()+hours*3600000):null,previous=user.moderation||{};
  const moderation={...previous,status:type==='ban'?'banned':type==='suspension'?'suspended':previous.status||'active',type,activeSanctionId:type==='warning'?previous.activeSanctionId||null:id,
   warningCount:(previous.warningCount||0)+(type==='warning'?1:0),suspendedUntil:type==='warning'?previous.suspendedUntil||null:endsAt,lastReason:why,updatedBy:actor.uid,updatedAt:now,lastNotice:type==='warning'?'VOCÊ RECEBEU UMA ADVERTÊNCIA!':type==='ban'?'SUA CONTA FOI BANIDA':'SUA CONTA FOI SUSPENSA'};
  const sanction={targetUid:uid,type,reason:why,ruleId:String(body.ruleId||'other').slice(0,40),caseNumber:`SG-${id.slice(0,8).toUpperCase()}`,createdBy:actor.uid,createdAt:now,startsAt:now,endsAt,revoked:null};
  const writes=[patchWrite(env,`users/${uid}`,{moderation},{updateTime:user._updateTime}),patchWrite(env,`sanctions/${id}`,sanction,{create:true}),notice(env,actor,uid,why)];
  if(body.reportId)writes.push(patchWrite(env,`reports/${safeId(body.reportId)}`,{status:'resolved',resolution:type,resolvedAt:now}));
  if(body.internalNote)writes.push(patchWrite(env,`sanctions/${id}/private/details`,{internalNote:String(body.internalNote).slice(0,2000)}));
  await auditedCommit(env,actor,action,uid,writes,why);return {ok:true,id,caseNumber:sanction.caseNumber};
 }
 if(['revokeSanction','changeSuspension'].includes(action)){
  const id=safeId(body.sanctionId),sanction=await getDocument(env,`sanctions/${id}`),why=reason(body.reason);
  if(!sanction||sanction.revoked)throw new Error('RESOURCE_CONFLICT');
  const user=await userAndProfile(env,sanction.targetUid),moderation={...user.moderation,updatedBy:actor.uid,updatedAt:new Date()};let patch;
  if(action==='revokeSanction'){
   patch={revoked:{by:actor.uid,at:new Date(),reason:why}};
   if(moderation.activeSanctionId===id)Object.assign(moderation,{status:'active',type:null,activeSanctionId:null,suspendedUntil:null,lastNotice:''});
   if(sanction.type==='warning')moderation.warningCount=Math.max(0,(moderation.warningCount||0)-1);
  }else{
   const hours=Number(body.durationHours);if(sanction.type!=='suspension'||!Number.isInteger(hours)||hours<1||hours>8760)throw new Error('INVALID_ADMIN_ACTION');
   patch={endsAt:new Date(millis(sanction.startsAt)+hours*3600000)};if(moderation.activeSanctionId===id)moderation.suspendedUntil=patch.endsAt;
  }
  await auditedCommit(env,actor,action,id,[patchWrite(env,`sanctions/${id}`,patch,{updateTime:sanction._updateTime}),patchWrite(env,`users/${sanction.targetUid}`,{moderation},{updateTime:user._updateTime}),notice(env,actor,sanction.targetUid,why)],why);return {ok:true};
 }
 if(['resolveReport','removeEvent','togglePromotion'].includes(action)){
  const id=safeId(action==='removeEvent'?body.eventId:body.id),collection=action==='resolveReport'?'reports':action==='removeEvent'?'events':'promotions';
  const target=await getDocument(env,`${collection}/${id}`);if(!target)throw new Error('RESOURCE_NOT_FOUND');
  const patch=action==='togglePromotion'?{active:body.active===true}:action==='removeEvent'?{status:'removed',moderatedAt:new Date(),moderatedBy:actor.uid}:{status:'resolved',resolvedAt:new Date(),resolvedBy:actor.uid};
  await auditedCommit(env,actor,action,id,[patchWrite(env,`${collection}/${id}`,patch,{updateTime:target._updateTime})]);return {ok:true};
 }
 if(action==='reviewCompany'){
  const target=safeId(body.id),application=await getDocument(env,`companyApplications/${target}`);
  if(!application||!['approve','reject'].includes(body.decision))throw new Error('INVALID_ADMIN_ACTION');
  const writes=[patchWrite(env,`companyApplications/${target}`,{status:body.decision==='approve'?'approved':'rejected',reviewedBy:actor.uid,reviewedAt:new Date()},{updateTime:application._updateTime})];
  if(body.decision==='approve'){
   const website=new URL(application.website);if(website.protocol!=='https:')throw new Error('INVALID_ADMIN_ACTION');
   writes.push(patchWrite(env,`companies/${target}`,{name:String(application.name).slice(0,120),category:String(application.category).slice(0,80),website:website.href,description:String(application.goal).slice(0,1200),ownerUid:application.uid,status:'approved',approvedAt:new Date(),approvedBy:actor.uid}));
  }
  await auditedCommit(env,actor,action,target,writes);return {ok:true};
 }
 if(action==='createPromotion'){
  const title=String(body.title||'').trim(),url=new URL(body.buttonUrl),original=Number(body.originalPrice),value=Number(body.discountValue),end=new Date(body.endsAt);
  if(title.length<3||title.length>100||url.protocol!=='https:'||!['BRL','USD','EUR'].includes(body.currency)||!['percent','fixed'].includes(body.discountType)||!Number.isFinite(original)||original<=0||!Number.isFinite(value)||value<0||end.getTime()<=Date.now()||!Array.isArray(body.regions)||body.regions.length>250||body.regions.some(x=>x!=='world'&&!/^[A-Z]{2}$/.test(x)))throw new Error('INVALID_ADMIN_ACTION');
  if(body.discountType==='percent'&&value>100)throw new Error('INVALID_ADMIN_ACTION');
  const final=Math.max(0,body.discountType==='percent'?original*(1-value/100):original-value),target=crypto.randomUUID();
  const promotion={title,description:String(body.description||'').slice(0,1200),discount:String(body.discount||'').slice(0,80),buttonLabel:String(body.buttonLabel||'Confira').slice(0,40),buttonUrl:url.href,currency:body.currency,originalPrice:original,discountType:body.discountType,discountValue:value,finalPrice:Math.round(final*100)/100,regions:body.regions,endsAt:end,active:true,createdAt:new Date(),createdBy:actor.uid};
  if(body.quantityLimit){if(!Number.isInteger(body.quantityLimit)||body.quantityLimit<1||body.quantityLimit>100000)throw new Error('INVALID_ADMIN_ACTION');promotion.quantityLimit=body.quantityLimit;promotion.remainingQuantity=body.quantityLimit;}
  await auditedCommit(env,actor,action,target,[patchWrite(env,`promotions/${target}`,promotion,{create:true})]);return {ok:true,id:target};
 }
 if(action==='decideAppeal'){
  const target=safeId(body.ticketId),ticket=await getDocument(env,`supportTickets/${target}`),message=reason(body.message||'Recurso em análise.');
  if(!ticket||ticket.category!=='appeal'||!['in_review','info_requested','accepted','denied'].includes(body.status)||['accepted','denied'].includes(ticket.status))throw new Error('RESOURCE_CONFLICT');
  const writes=[patchWrite(env,`supportTickets/${target}`,{status:body.status,staffMessage:message,reviewedBy:actor.uid,reviewedAt:new Date(),updatedAt:new Date()},{updateTime:ticket._updateTime}),notice(env,actor,ticket.uid,message)];
  if(body.status==='accepted'){
   const queue=await getDocument(env,`deletionQueue/${ticket.uid}`);
   const sanction=await getDocument(env,`sanctions/${safeId(ticket.sanctionId)}`),user=await userAndProfile(env,ticket.uid);
   if(!sanction||sanction.targetUid!==ticket.uid||sanction.revoked)throw new Error('RESOURCE_CONFLICT');
   const moderation={...user.moderation};if(moderation.activeSanctionId===sanction.id)Object.assign(moderation,{status:'active',activeSanctionId:null,type:null,suspendedUntil:null,lastNotice:''});
   if(queue?.status==='pending' && queue.sanctionId===sanction.id){
    moderation.status=queue.priorModeration?.status||'active';moderation.type=queue.priorModeration?.type||null;moderation.activeSanctionId=queue.priorModeration?.activeSanctionId||null;
    writes.push(patchWrite(env,`deletionQueue/${ticket.uid}`,{status:'cancelled',executeAfter:null,cancelledAt:new Date(),cancelledBy:actor.uid,cancellationReason:message},{updateTime:queue._updateTime}));
    writes.push(patchWrite(env,`publicProfiles/${ticket.uid}`,{visibility:queue.priorVisibility||'private'}));
   }
   writes.push(patchWrite(env,`sanctions/${sanction.id}`,{revoked:{by:actor.uid,at:new Date(),reason:message}},{updateTime:sanction._updateTime}),patchWrite(env,`users/${ticket.uid}`,{moderation,deletionRequest:queue?.status==='pending'?{status:'cancelled',cancelledAt:new Date()}:user.deletionRequest||{}},{updateTime:user._updateTime}));
  }
  await auditedCommit(env,actor,action,target,writes,message);return {ok:true};
 }
 if(action==='repairProfiles'){
  const out=await listDocuments(env,'users',{cursor:body.cursor||''}),writes=[];
  for(const user of out.items){const allowed=['uid','name','username','photoURL','bannerURL','bio','accountType','badges','verification','visibility','games'];const profile=Object.fromEntries(allowed.filter(k=>user[k]!==undefined).map(k=>[k,user[k]]));profile.uid=user.id;writes.push(patchWrite(env,`publicProfiles/${user.id}`,profile));}
  if(writes.length)await auditedCommit(env,actor,action,'publicProfiles',writes);
  return {ok:true,count:writes.length,cursor:out.cursor};
 }
 throw new Error('INVALID_ADMIN_ACTION');
}
