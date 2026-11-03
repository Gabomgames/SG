export async function runModeration(env,model,input,{timeoutMs=8000}={}){
 if(!env.AI)throw new Error('MODERATION_NOT_CONFIGURED');let timer;
 try{return await Promise.race([env.AI.run(model,input),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('MODERATION_FAILED')),timeoutMs);})]);}
 finally{clearTimeout(timer);}
}
