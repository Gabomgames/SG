// Limites transacionais conservadores do piloto; ajustar após medir uso/cotas.
export async function consumeRate(env,uid,bucket){
 if(!env.SG_DB) return;
 const day=new Date().toISOString().slice(0,10),hour=new Date().toISOString().slice(0,13);
 const local=await env.SG_DB.prepare(`INSERT INTO api_limits(bucket,key,period,count) VALUES (?,?,?,1)
 ON CONFLICT(bucket,key,period) DO UPDATE SET count=count+1 WHERE count<120 RETURNING count`).bind(bucket,uid,hour).first();
 if(!local)throw new Error('RATE_LIMITED');
 const global=await env.SG_DB.prepare(`INSERT INTO api_limits(bucket,key,period,count) VALUES ('platform','all',?,1)
 ON CONFLICT(bucket,key,period) DO UPDATE SET count=count+1 WHERE count<10000 RETURNING count`).bind(day).first();
 if(!global)throw new Error('RATE_LIMITED');
}
