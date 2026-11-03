// Tokens are never returned, logged or forwarded to the object service.
export function legacyPrivateObject(value,allowedBuckets=null){
 let url;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.hostname!=='firebasestorage.googleapis.com'||url.port||url.username||url.password)return null;
 const match=url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);if(!match)return null;
 let bucket,object;try{bucket=decodeURIComponent(match[1]);object=decodeURIComponent(match[2]);}catch{return null;}
 if(!/^[A-Za-z0-9._-]{3,222}$/.test(bucket)||allowedBuckets&&!allowedBuckets.includes(bucket))return null;
 const parts=object.split('/'),kind=parts[0];
 if(!['chat','reports','profile-review'].includes(kind)||parts.length!==(kind==='profile-review'?3:4)||!parts.slice(1,-1).every(v=>/^[A-Za-z0-9_-]{1,260}$/.test(v))||!parts.at(-1)||parts.at(-1).length>255||parts.some(p=>p==='.'||p==='..'||/[\\\u0000-\u001f]/.test(p)))return null;
 return {bucket,object,kind,ownerUid:parts[1],...(kind==='chat'?{conversationId:parts[2]}:kind==='reports'?{reportId:parts[2]}:{})};
}
export function legacyChatObject(value,allowedBuckets=null){const parsed=legacyPrivateObject(value,allowedBuckets);return parsed?.kind==='chat'?parsed:null;}
export function protectedLegacyReference(value){
 const parsed=legacyPrivateObject(value);
 return parsed?`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(parsed.bucket)}/o/${encodeURIComponent(parsed.object)}`:value;
}
