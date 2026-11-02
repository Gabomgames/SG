/** SG V66: backend-only account deletion and privacy-aware mentions. */
const {onRequest} = require('firebase-functions/v2/https');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const db66=getFirestore();
async function token66(req){const bearer=req.get('authorization')||'';if(!bearer.startsWith('Bearer '))throw Error('UNAUTHENTICATED');return getAuth().verifyIdToken(bearer.slice(7),true)}
function response66(res,status,obj){res.status(status).set('Cache-Control','no-store').json(obj)}
function cors66(req,res){const origin=req.get('origin')||'';if(origin&&!(origin==='https://something-gamer.web.app'||origin==='https://something-gamer.firebaseapp.com'||/^http:\/\/(?:localhost|127\.0\.0\.1):(?:5000|5500|5173)$/.test(origin)))throw Error('ORIGIN_NOT_ALLOWED');if(origin)res.set('Access-Control-Allow-Origin',origin);res.set('Access-Control-Allow-Headers','Authorization,Content-Type');res.set('Access-Control-Allow-Methods','POST,OPTIONS');}
async function purgeQuery66(q){while(true){const page=await q.limit(80).get();if(page.empty)break;for(const d of page.docs)await db66.recursiveDelete(d.ref);if(page.size<80)break}}
exports.deleteMyAccount=onRequest({region:'us-central1',timeoutSeconds:540,memory:'1GiB'},async(req,res)=>{
 try{cors66(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return response66(res,405,{error:'Método não permitido.'});
 const user=await token66(req);
 if(Date.now()-Number(user.auth_time||0)*1000>300000)return response66(res,401,{code:'RECENT_LOGIN_REQUIRED',error:'Entre novamente na conta antes de solicitar exclusão.'});
 if(req.body?.confirm!=='EXCLUIR MINHA CONTA')return response66(res,400,{error:'Confirmação incorreta.'});
 // Não destruir um servidor que tem membros, nem permitir contas com comunidade sem sucessor.
 const owned=await db66.collection('servers').where('ownerUid','==',user.uid).limit(1).get();
 if(!owned.empty)return response66(res,409,{code:'OWNED_SERVERS',error:'Transfira ou exclua seus servidores antes de excluir a conta.'});
 await db66.collection('accountDeletionAudit').doc(user.uid).set({uid:user.uid,requestedAt:FieldValue.serverTimestamp(),state:'processing'},{merge:true});
 const paths=[['posts','uid'],['follows','fromUid'],['follows','toUid'],['friendRequests','fromUid'],['friendRequests','toUid'],['notifications','fromUid'],['notifications','toUid'],['supportTickets','uid']];
 for(const [name,key] of paths)await purgeQuery66(db66.collection(name).where(key,'==',user.uid));
 // Mensagens de terceiros, relatórios de segurança e transações legalmente retidas não são apagados aqui.
 await db66.recursiveDelete(db66.collection('publicProfiles').doc(user.uid));
 await db66.recursiveDelete(db66.collection('users').doc(user.uid));
 const handle=await db66.collection('usernames').where('uid','==',user.uid).limit(3).get();for(const d of handle.docs)await d.ref.delete();
 await getAuth().deleteUser(user.uid);
 await db66.collection('accountDeletionAudit').doc(user.uid).set({state:'auth_deleted',completedAt:FieldValue.serverTimestamp()},{merge:true});
 return response66(res,200,{ok:true,note:'Conta de login e dados principais excluídos. Registros de segurança e financeiros sujeitos à retenção legal poderão permanecer.'});
 }catch(e){console.error('Account deletion failed',e.code||e.message);return response66(res,500,{code:'ACCOUNT_DELETE_FAILED',error:'Não foi possível concluir a exclusão. Entre em contato com o suporte.'})}
});
const handles66=s=>[...new Set([...String(s||'').matchAll(/(?:^|\s)@([a-z0-9_\.]{3,25})\b/gi)].map(x=>x[1].toLowerCase()))].slice(0,10);
async function processMentions66(authorUid,raw,origin){if(!authorUid)return;for(const handle of handles66(raw)){
 const index=await db66.collection('usernames').doc(handle).get();const toUid=index.data()?.uid;if(!toUid||toUid===authorUid)continue;
 const [userDoc,publicDoc]=await Promise.all([db66.collection('users').doc(toUid).get(),db66.collection('publicProfiles').doc(toUid).get()]);
 if(!userDoc.exists)continue;const [blocksAuthor,authorBlocks]=await Promise.all([db66.collection('users').doc(toUid).collection('blocks').doc(authorUid).get(),db66.collection('users').doc(authorUid).collection('blocks').doc(toUid).get()]);if(blocksAuthor.exists||authorBlocks.exists)continue;const policy=userDoc.data()?.mentionPolicy||'auto';const visibility=publicDoc.data()?.visibility||userDoc.data()?.profileVisibility||'private';
 if(policy==='none')continue;const pending=visibility==='private'||policy==='approval';
 const mentionRef=db66.collection('mentionRequests').doc(`${origin.replaceAll('/','_')}_${toUid}`);
 if((await mentionRef.get()).exists)continue;
 await mentionRef.set({toUid,fromUid:authorUid,username:handle,origin,createdAt:FieldValue.serverTimestamp(),status:pending?'pending':'approved'});
 await db66.collection('notifications').add({toUid,fromUid:authorUid,type:pending?'mention_request':'mention',title:pending?'Pedido de marcação':'Você foi marcado',message:pending?'Uma pessoa pediu permissão para marcar seu perfil.':'Seu perfil foi mencionado em uma publicação.',read:false,createdAt:FieldValue.serverTimestamp()});
 }}
exports.sgMentionPost=onDocumentCreated({document:'posts/{postId}',region:'us-central1'},async event=>{const d=event.data?.data();if(d)await processMentions66(d.uid,`${d.title||''} ${d.description||''}`,`posts/${event.params.postId}`)});
exports.sgMentionComment=onDocumentCreated({document:'posts/{postId}/comments/{commentId}',region:'us-central1'},async event=>{const d=event.data?.data();if(d)await processMentions66(d.uid,d.text,`posts/${event.params.postId}/comments/${event.params.commentId}`)});
exports.respondMention=onRequest({region:'us-central1'},async(req,res)=>{
 try{cors66(req,res);if(req.method==='OPTIONS')return res.status(204).end();if(req.method!=='POST')return response66(res,405,{error:'Método inválido.'});const user=await token66(req);const id=String(req.body?.id||'');if(id.length>240||!/^[\w-]+$/.test(id)||!['approved','rejected'].includes(req.body?.status))return response66(res,400,{error:'Pedido inválido.'});
 const ref=db66.collection('mentionRequests').doc(id);let fromUid=null;
 await db66.runTransaction(async t=>{const snap=await t.get(ref);if(!snap.exists||snap.data().toUid!==user.uid||snap.data().status!=='pending')throw Error('REQUEST_UNAVAILABLE');fromUid=snap.data().fromUid;t.update(ref,{status:req.body.status,reviewedAt:FieldValue.serverTimestamp()})});
 if(req.body.status==='approved')await db66.collection('notifications').add({toUid:fromUid,fromUid:user.uid,type:'mention_approved',title:'Marcação aprovada',message:'A pessoa aceitou sua solicitação de marcação.',read:false,createdAt:FieldValue.serverTimestamp()});
 return response66(res,200,{ok:true});
 }catch(e){return response66(res,400,{code:e.message,error:'Não foi possível responder à marcação.'})}
});

// V67: a fila administrativa é criada APENAS por operadores autenticados no Worker.
// 30 dias de recurso; execuções concorrentes não duplicam exclusão de conta.
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {Timestamp}=require('firebase-admin/firestore');
exports.finalizeModeratedAccounts=onSchedule({region:'us-central1',schedule:'every 24 hours',timeoutSeconds:540,memory:'1GiB'},async()=>{
 const due=await db66.collection('deletionQueue').where('executeAfter','<=',Timestamp.now()).limit(20).get();
 for(const item of due.docs){
  const info=item.data();if(info.status!=='pending')continue;
  const uid=item.id;const userRef=db66.collection('users').doc(uid);
  try{
   const userRecord=await getAuth().getUser(uid).catch(e=>e.code==='auth/user-not-found'?null:Promise.reject(e));
   if(userRecord?.customClaims?.admin){console.error('Administrative account protected',uid);continue}
   const snapshot=await userRef.get();
   if(!snapshot.exists||snapshot.data()?.deletionRequest?.status!=='pending'||['official_now','official_sg'].includes(snapshot.data()?.accountType))continue;
   const claimed=await db66.runTransaction(async tx=>{
    const cur=await tx.get(item.ref),record=cur.data();
    if(!cur.exists||record.status!=='pending')return false;
    tx.update(item.ref,{status:'processing',executeAfter:FieldValue.delete(),processingAt:FieldValue.serverTimestamp()});return true;
   });
   if(!claimed)continue;
   const owned=await db66.collection('servers').where('ownerUid','==',uid).limit(1).get();
   if(!owned.empty)throw Error('ACCOUNT_HAS_OWNED_SERVERS');
   for(const [collection,key] of [['posts','uid'],['follows','fromUid'],['follows','toUid'],['friendRequests','fromUid'],['friendRequests','toUid'],['notifications','fromUid'],['notifications','toUid']]){
    await purgeQuery66(db66.collection(collection).where(key,'==',uid));
   }
   await db66.recursiveDelete(db66.collection('publicProfiles').doc(uid));
   const handles=await db66.collection('usernames').where('uid','==',uid).limit(10).get();for(const d of handles.docs)await d.ref.delete();
   await db66.recursiveDelete(userRef);
   if(userRecord)await getAuth().deleteUser(uid);
   // Retém log mínimo de moderação e recurso conforme políticas aplicáveis.
   await item.ref.set({status:'completed',completedAt:FieldValue.serverTimestamp(),reason:info.reason,requestedBy:info.requestedBy},{merge:true});
  }catch(error){console.error('Failed moderation account finalization',uid,error);await item.ref.set({status:'needs_review',executeAfter:FieldValue.delete(),lastError:String(error.code||error.message).slice(0,120),failedAt:FieldValue.serverTimestamp()},{merge:true})}
 }
});
