// Adapter boundaries make session changes and failed authorization testable.
const fields=['type','title','description','tags','pollOptions','mediaId','mediaUrl','mediaType','eventId'];
export function createPostPublisher({currentUser,authorize,batch:makeBatch,reference,timestamp}){
 return async(uid,destination,data)=>{
  if(currentUser()?.uid!==uid)throw new Error('Entre novamente antes de publicar.');
  const post=Object.fromEntries(fields.filter(k=>data[k]!==undefined).map(k=>[k,data[k]]));
  const result=await authorize({postId:destination.id,post});
  if(result.state==='pending_review')return {published:false,state:result.state};
  if(result.state==='published'&&result.postId===destination.id)return {published:true,state:result.state};
  if(result.state!=='authorized'||result.post?.uid!==uid||result.postId!==destination.id)throw new Error(result.state==='rejected'?'A publicação não foi aprovada pela verificação de segurança.':'A publicação não pôde ser autorizada. Tente novamente.');
  if(currentUser()?.uid!==uid)throw new Error('A sessão mudou. Entre novamente.');
  const batch=makeBatch();
  batch.set(destination,{...result.post,createdAt:timestamp()});
  batch.set(reference('limites',uid),{post:timestamp()},{merge:true});
  batch.update(reference('publicationApprovals',destination.id),{used:true,usedAt:timestamp()});
  await batch.commit();return {published:true,state:'published'};
 };
}
