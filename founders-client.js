// Automatic synchronization only; the backend decides eligibility and awards.
// No claim button, local counter, client-supplied uid or entitlement dates.
export function installFounderSync({auth,subscribe,endpoint,headers,fetcher=fetch,host=globalThis}){
  let busy=false,finishedUid='',stopped=false,lastAttempt=0;
  const terminal=new Set(['active','expired','revoked','exhausted','duplicate_identity']);
  async function sync(){
    const user=auth.currentUser;
    if(stopped||busy||!user||finishedUid===user.uid)return;
    busy=true;
    try{
      if(!user.emailVerified){await user.reload();if(!user.emailVerified)return;}
      const token=await user.getIdToken(true);
      const response=await fetcher(endpoint,{method:'POST',headers:{...(await headers()),Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
      if(!response.ok)return;
      const result=await response.json();
      if(terminal.has(result.status))finishedUid=user.uid;
    }catch{
      // Preserve login and paid verification when promotion/backend is unavailable.
    }finally{busy=false;lastAttempt=Date.now();}
  }
  const unsubscribe=subscribe(auth,()=>{void sync();});
  const visible=()=>{if(!host.document?.hidden)void sync();};
  host.document?.addEventListener('visibilitychange',visible);
  const timer=host.setInterval(()=>{if(!host.document?.hidden&&Date.now()-lastAttempt>=30000)void sync();},30000);
  return ()=>{stopped=true;unsubscribe();host.clearInterval(timer);host.document?.removeEventListener('visibilitychange',visible);};
}
