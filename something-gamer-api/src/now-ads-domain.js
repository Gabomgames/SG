export const OBJECTIVES=['awareness','traffic','engagement','leads','app','sales'];
export function validTags(values){if(!Array.isArray(values)||values.length>10||values.some(t=>typeof t!=='string'||!/^[a-z0-9-]{1,30}$/.test(t)))throw new Error('INVALID_AD_INPUT');return [...new Set(values)];}
export function matchesAudience(set,prefs,profile,audience,emailHash,seedMember=false){
 const interests=JSON.parse(set.interests||'[]'),behaviors=JSON.parse(set.behaviors||'[]'),filtered=set.region||set.age_filter===1||set.age_min>18||set.age_max<100||set.gender!=='all'||interests.length||behaviors.length||audience;
 if(!filtered)return true;if(!prefs?.consent)return false;
 if(set.region&&set.region!==prefs.region)return false;
 if((set.age_filter===1||set.age_min>18||set.age_max<100)&&(!profile?.age||profile.age<set.age_min||profile.age>set.age_max))return false;
 if(set.gender!=='all'&&profile?.gender!==set.gender)return false;
 const tags=JSON.parse(prefs.interests||'[]'),declared=JSON.parse(profile?.behaviors||'[]');
 if(interests.length&&!interests.some(t=>tags.includes(t)))return false;if(behaviors.length&&!behaviors.some(t=>declared.includes(t)))return false;
 if(audience){if(audience.kind==='core'&&!JSON.parse(audience.signals).every(t=>tags.includes(t)))return false;if(audience.kind==='custom'&&!seedMember)return false;if(audience.kind==='lookalike'){const signals=JSON.parse(audience.signals);if(signals.length<1||!signals.some(t=>tags.includes(t)))return false;}if(audience.kind==='list'&&!JSON.parse(audience.contact_hashes).includes(emailHash))return false;}
 return true;
}
export function deliveryScore(row,objective){const views=Number(row.views||0),clicks=Number(row.clicks||0),actions=Number(row.actions||0);if(objective==='awareness')return 1/Math.sqrt(1+views);return .15+((objective==='traffic'||objective==='app'?clicks:actions)+1)/(views+20);}
export function chooseDelivery(rows,objective,random=Math.random()){const weights=rows.map(r=>deliveryScore(r,objective||r.objective)),total=weights.reduce((a,b)=>a+b,0);let value=Math.max(0,Math.min(.999999,random))*total;for(let i=0;i<rows.length;i++){value-=weights[i];if(value<0)return rows[i];}return rows.at(-1)||null;}
