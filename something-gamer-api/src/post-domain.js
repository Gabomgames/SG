import {validatePollOptions} from '../../poll-domain.js';
const ms=v=>v?.seconds?v.seconds*1000+(v.nanoseconds||0)/1e6:v instanceof Date?+v:typeof v==='number'?v:Date.parse(v);
export function activeProfile(profile,now=Date.now()){
 const legal=profile?.legal||{},mod=profile?.moderation||{};
 return legal.termsAccepted===true&&['termsVersion','privacyVersion','communityRulesVersion'].every(k=>legal[k]==='2026-09-16')&&(!mod.status||mod.status==='active'||mod.status==='suspended'&&ms(mod.suspendedUntil)<=now);
}
export function postDraft(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['type','title','description','tags','pollOptions','mediaId','mediaUrl','mediaType','eventId'].includes(k)))throw new Error('INVALID_POST_INPUT');
 const out={};
 if(!['text','image','video','poll','news'].includes(value.type))throw new Error('INVALID_POST_INPUT');out.type=value.type;
 for(const [name,max] of [['title',200],['description',3000],['mediaId',128],['mediaUrl',2048],['mediaType',100],['eventId',128]]){
  const item=value[name]??'';if(typeof item!=='string'||item.length>max||/[\u0000-\u0008]/.test(item))throw new Error('INVALID_POST_INPUT');out[name]=item.trim();
 }
 const tags=value.tags??[];if(!Array.isArray(tags)||tags.length>10||tags.some(v=>typeof v!=='string'||!v||v.length>90))throw new Error('INVALID_POST_INPUT');out.tags=tags;
 out.pollOptions=value.pollOptions??[];
 if(out.type==='poll'){try{validatePollOptions(out.pollOptions);}catch{throw new Error('INVALID_POST_INPUT');}}
 else if(!Array.isArray(out.pollOptions)||out.pollOptions.length)throw new Error('INVALID_POST_INPUT');
 if(out.eventId&&out.type!=='news')throw new Error('INVALID_POST_INPUT');
 if(['image','video'].includes(out.type)&&!out.mediaId)throw new Error('INVALID_POST_INPUT');
 if(out.mediaUrl&&!out.mediaId)throw new Error('INVALID_POST_INPUT');
 if(out.mediaId&&!/^[a-f0-9]{48}$/.test(out.mediaId))throw new Error('INVALID_POST_INPUT');
 if(!out.mediaId&&out.mediaType)throw new Error('INVALID_POST_INPUT');
 // Keep the minimum rule filter even when a human reviews publication.
 if([out.title,out.description,...tags,...out.pollOptions].some(v=>/(heil hitler|white power|exterminar (negros|judeus|gays)|matar (negros|judeus|gays)|pedofil|estupr|vou te matar)/i.test(v)))throw new Error('CONTENT_REJECTED');
 if(!out.title&&!out.description&&!out.mediaId&&out.type!=='poll')throw new Error('INVALID_POST_INPUT');
 return out;
}
export function canonicalPost(draft,uid,profile){
 if(!activeProfile(profile))throw new Error('ACCOUNT_RESTRICTED');
 const v=profile.verification||{};
 return {...draft,uid,authorName:profile.name||profile.username||'Gamer',authorUsername:profile.username||'',authorPhoto:profile.photoURL||'',
  authorVerified:v.status==='active'&&(!v.expiresAt||ms(v.expiresAt)>Date.now()),authorAccountType:profile.accountType||'gamer',authorBadgeTheme:profile.verificationBadgeTheme||'blue',authorBadges:profile.badges||{}};
}
