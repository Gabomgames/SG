import {legacyChatObject,protectedLegacyReference} from './legacy-media-policy.js';
// A revoked room/session invalidates in-flight responses as well as existing
// blob URLs. The gateway remains responsible for every server authorization.
export function createPrivateMediaResolver({currentUser,baseUrl,headers,fetcher=fetch,createUrl=blob=>URL.createObjectURL(blob),revokeUrl=url=>URL.revokeObjectURL(url),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 const blobs=new Set();let epoch=0,observedUid=currentUser()?.uid??null;
 function revoke(){epoch++;for(const url of blobs)revokeUrl(url);blobs.clear();}
 function synchronize(){const uid=currentUser()?.uid??null;if(uid!==observedUid){revoke();observedUid=uid;}}
 async function resolve(value){
  synchronize();const url=new URL(value),base=new URL(baseUrl),legacy=legacyChatObject(value);
  if(!legacy&&(url.origin!==base.origin||!/^\/private-media\/[a-f0-9-]{36}$/.test(url.pathname)))throw new Error('Mídia privada inválida.');
  const user=currentUser();if(!user)throw new Error('Faça login novamente.');const requestEpoch=epoch;
  const active=()=>{if(epoch!==requestEpoch||currentUser()?.uid!==user.uid)throw new Error('A sessão ou a conversa mudou. Abra o arquivo novamente.');};
  let response;
  for(let attempt=0;attempt<3;attempt++){
   active();const token=await user.getIdToken(),extra=await headers();active();
   response=await fetcher(`${base.origin}${legacy?'/media/legacy/read':'/media/read'}`,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(20000),
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...extra},body:JSON.stringify(legacy?{url:protectedLegacyReference(value)}:{id:url.pathname.split('/').pop()})});
   active();if(response.status!==503||attempt===2)break;await wait(400*(attempt+1));
  }
  if(!response.ok)throw new Error(response.status===503?'Arquivo ainda indisponível. Tente novamente em instantes.':'Arquivo expirado ou acesso indisponível.');
  const blob=await response.blob();active();const local=createUrl(blob);blobs.add(local);return local;
 }
 return {resolve,revoke,synchronize};
}
