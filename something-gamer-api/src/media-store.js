// KV existente pode servir blobs: nunca decide membership, pagamento ou quota.
// Toda autorização e toda quota permanecem fora do KV, com dados no D1.
export function mediaStore(env) {
 if(env.SG_MEDIA)return {
  put:(id,bytes,type)=>env.SG_MEDIA.put(`private/${id}`,bytes,{httpMetadata:{contentType:type}}),
  get:async id=>{const value=await env.SG_MEDIA.get(`private/${id}`);return value?.body||null;},
  delete:id=>env.SG_MEDIA.delete(`private/${id}`)
 };
 if(env.SG_AUTH)return {
  put:(id,bytes)=>env.SG_AUTH.put(`private-media:${id}`,bytes,{expirationTtl:30*86400}),
  get:id=>env.SG_AUTH.get(`private-media:${id}`,{type:'arrayBuffer'}),
  delete:id=>env.SG_AUTH.delete(`private-media:${id}`)
 };
 throw new Error('PRIVATE_MEDIA_NOT_CONFIGURED');
}
