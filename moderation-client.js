// Client feedback only. Publication still requires a trusted backend receipt.
export function createModerator({currentUser,baseUrl,headers,fetcher=fetch,clock=Date.now,timeoutMs=6500}){
 const cache=new Map();
 return async(payload,key='')=>{
  const user=currentUser();
  const unavailable=()=>({allowed:false,flagged:false,unavailable:true,categories:[],source:'unavailable'});
  if(!user||!baseUrl)return unavailable();
  const cacheKey=`${user.uid}:${key}`,prior=key&&cache.get(cacheKey);
  if(prior&&clock()-prior.time<30000)return prior.result;
  try{
   const response=await fetcher(`${baseUrl}/moderate`,{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{...(await headers()),Authorization:`Bearer ${await user.getIdToken()}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
   const data=await response.json();
   if(!response.ok||typeof data.allowed!=='boolean'||typeof data.flagged!=='boolean'||data.allowed===data.flagged||currentUser()?.uid!==user.uid)return unavailable();
   const result={allowed:data.allowed,flagged:data.flagged,unavailable:false,categories:Array.isArray(data.categories)?data.categories:[],risk:data.risk||'review',source:'sg-shield'};
   if(key){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(cacheKey,{time:clock(),result});}
   return result;
  }catch{return unavailable();}
 };
}
