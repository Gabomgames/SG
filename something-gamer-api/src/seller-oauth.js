const enc=new TextEncoder(),hex=b=>Array.from(new Uint8Array(b),n=>n.toString(16).padStart(2,'0')).join('');
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export const hash=async value=>hex(await crypto.subtle.digest('SHA-256',enc.encode(value)));
async function key(env){if(!env.SERVICE_DATA_KEY)throw new Error('MARKET_NOT_CONFIGURED');let bytes;try{bytes=Uint8Array.from(atob(env.SERVICE_DATA_KEY),c=>c.charCodeAt(0));}catch{throw new Error('MARKET_NOT_CONFIGURED');}if(bytes.length!==32)throw new Error('MARKET_NOT_CONFIGURED');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
export async function encryptCredentials(data,env,uid){const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(uid)},await key(env),enc.encode(JSON.stringify(data)));return JSON.stringify({iv:Array.from(iv),cipher:Array.from(new Uint8Array(cipher))});}
export async function decryptCredentials(value,env,uid){const data=JSON.parse(value);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(data.iv),additionalData:enc.encode(uid)},await key(env),new Uint8Array(data.cipher));return JSON.parse(new TextDecoder().decode(plain));}
export async function mpRequest(path,token,init={}){
 let response;try{response=await fetch(`https://api.mercadopago.com${path}`,{...init,signal:AbortSignal.timeout(12000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}});}catch{throw new Error('MERCADOPAGO_FAILED');}
 const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error('MERCADOPAGO_FAILED');return body;
}
function configured(env){if(!env.SG_DB||!env.MP_CLIENT_ID||!env.MP_CLIENT_SECRET||!env.SERVICE_DATA_KEY||!env.API_URL)throw new Error('MARKET_NOT_CONFIGURED');}
export async function sellerStart(env,user){
 configured(env);const state=b64(crypto.getRandomValues(new Uint8Array(32))),verifier=b64(crypto.getRandomValues(new Uint8Array(32)));
 const challenge=b64(await crypto.subtle.digest('SHA-256',enc.encode(verifier)));
 await env.SG_DB.prepare('INSERT INTO seller_oauth(state_hash,uid,verifier,expires_at) VALUES (?,?,?,?)').bind(await hash(state),user.uid,verifier,Date.now()+600000).run();
 const url=new URL('https://auth.mercadopago.com.br/authorization');Object.entries({client_id:env.MP_CLIENT_ID,response_type:'code',platform_id:'mp',redirect_uri:`${env.API_URL}/market/seller/callback`,state,code_challenge:challenge,code_challenge_method:'S256'}).forEach(([k,v])=>url.searchParams.set(k,v));return {ok:true,url:url.href};
}
export async function sellerCallback(request,env){
 configured(env);const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code');
 if(!state||state.length>100||!code||code.length>1024)throw new Error('INVALID_MARKET_INPUT');
 const row=await env.SG_DB.prepare('UPDATE seller_oauth SET used_at=? WHERE state_hash=? AND used_at IS NULL AND expires_at>? RETURNING *').bind(Date.now(),await hash(state),Date.now()).first();
 if(!row)throw new Error('FORBIDDEN');
 const response=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({client_id:env.MP_CLIENT_ID,client_secret:env.MP_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:`${env.API_URL}/market/seller/callback`,code_verifier:row.verifier})});
 const credentials=await response.json();if(!response.ok||!credentials.access_token||!credentials.refresh_token)throw new Error('MERCADOPAGO_FAILED');
 const profile=await mpRequest('/users/me',credentials.access_token),test=(profile.tags||[]).includes('test_user');
 if(test!==(env.PAYMENT_ENV==='test'))throw new Error('PAYMENT_ENV_MISMATCH');
 if(String(profile.id)!==String(credentials.user_id))throw new Error('PAYMENT_MISMATCH');
 await env.SG_DB.prepare(`INSERT INTO seller_accounts(uid,collector_id,encrypted_credentials,expires_at,mode,updated_at) VALUES (?,?,?,?,?,?)
  ON CONFLICT(uid) DO UPDATE SET collector_id=excluded.collector_id,encrypted_credentials=excluded.encrypted_credentials,expires_at=excluded.expires_at,mode=excluded.mode,updated_at=excluded.updated_at`)
  .bind(row.uid,String(profile.id),await encryptCredentials(credentials,env,row.uid),Date.now()+Math.max(0,Number(credentials.expires_in)-60)*1000,env.PAYMENT_ENV,Date.now()).run();
 return Response.redirect(`${env.APP_URL}/marketplace.html?seller=connected`,303);
}
export async function sellerCredentials(env,uid){
 configured(env);let row=await env.SG_DB.prepare('SELECT * FROM seller_accounts WHERE uid=?').bind(uid).first();
 if(!row||row.mode!==env.PAYMENT_ENV)throw new Error('SELLER_NOT_CONNECTED');
 let credentials=await decryptCredentials(row.encrypted_credentials,env,uid);
 if(row.expires_at<Date.now()){
  const response=await fetch('https://api.mercadopago.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(12000),body:JSON.stringify({client_id:env.MP_CLIENT_ID,client_secret:env.MP_CLIENT_SECRET,grant_type:'refresh_token',refresh_token:credentials.refresh_token})});
  const next=await response.json();if(!response.ok||!next.access_token)throw new Error('SELLER_NOT_CONNECTED');credentials={...credentials,...next};
  await env.SG_DB.prepare('UPDATE seller_accounts SET encrypted_credentials=?,expires_at=?,updated_at=? WHERE uid=? AND expires_at=?').bind(await encryptCredentials(credentials,env,uid),Date.now()+Math.max(0,Number(credentials.expires_in)-60)*1000,Date.now(),uid,row.expires_at).run();
  // Se houve refresh concorrente, usar a versão persistida vencedora.
  row=await env.SG_DB.prepare('SELECT * FROM seller_accounts WHERE uid=?').bind(uid).first();credentials=await decryptCredentials(row.encrypted_credentials,env,uid);
 }
 return {token:credentials.access_token,collectorId:row.collector_id};
}
