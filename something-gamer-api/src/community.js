import {communityExtras} from './community-extras.js';
import {sfuReady,sfuGrant,revokeSfu} from './now-call.js';
import {consumeRate} from './limits.js';
import {getDocument,safeId,patchWrite,commitDocuments} from './firestore-store.js';
export function communityRole(server,uid){return server.ownerUid===uid?'owner':['moderator','observer'].includes(server.roles?.[uid])?server.roles[uid]:'member';}
export function communityPermission(server,uid,action,target=''){
 if(!server.members?.includes(uid)||server.bannedUids?.includes(uid))return false;
 const role=communityRole(server,uid);
 if(['role','settings','channel','invite','reviewJoin'].includes(action))return role==='owner';
 if(['mute','ban','kick','unmute','unban'].includes(action))return role==='owner'||(role==='moderator'&&target!==server.ownerUid&&communityRole(server,target)!=='moderator');
 return action==='read';
}
export async function communityApi(request,env,user,moderate){
 await consumeRate(env,user.uid,'community');const b=await request.json(),action=new URL(request.url).pathname.slice('/community/'.length),sid=safeId(b.serverId);
 const server=await getDocument(env,`servers/${sid}`);if(!server)throw new Error('RESOURCE_NOT_FOUND');
 if(['bots','pollCreate','pollVote','botCommand','gameAnswer'].includes(action))return communityExtras(env,user,server,sid,b,action,moderate);
 const audit=(data,reason)=>patchWrite(env,`communityAudit/${crypto.randomUUID()}`,{serverId:sid,actorUid:user.uid,action,reason:String(reason||'').slice(0,500),createdAt:new Date(),...data},{create:true});
 if(['voiceJoin','voiceLeave'].includes(action)){
  if(!communityPermission(server,user.uid,'read')||server.mutedUids?.includes(user.uid))throw new Error('FORBIDDEN');const cid=safeId(b.channelId),session=String(b.session||'');if(!/^[a-f0-9-]{36}$/.test(session))throw new Error('INVALID_COMMUNITY_INPUT');const channel=await getDocument(env,`servers/${sid}/channels/${cid}`);if(!channel||channel.kind!=='voice'||(channel.audience==='staff'&&communityRole(server,user.uid)==='member'))throw new Error('FORBIDDEN');
  const path=`servers/${sid}/channels/${cid}/voice/room`,room=await getDocument(env,path),now=Date.now();const members=updateVoiceMembers(server,room?.members||{},user.uid,session,action,now,sfuReady(env)?25:6);
  await commitDocuments(env,[patchWrite(env,path,{members,updatedAt:new Date()},room?{updateTime:room._updateTime}:{create:true})]);if(action==='voiceLeave'){await revokeSfu(env,sid,user.uid,cid);return {ok:true,members};}const canPublish=communityRole(server,user.uid)!=='observer';return {ok:true,members,canPublish,transport:sfuReady(env)?'sfu':'mesh',capacity:sfuReady(env)?25:6,...sfuReady(env)?await sfuGrant(env,user,sid,cid,session,canPublish):{}};
 }
 if(action==='joinRequest'){
  if(server.members?.includes(user.uid)||server.bannedUids?.includes(user.uid)||server.joinMode!=='approval')throw new Error('FORBIDDEN');
  const path=`serverJoinRequests/${sid}_${user.uid}`,prior=await getDocument(env,path);if(prior?.state==='pending')return {ok:true,reused:true};
  await commitDocuments(env,[patchWrite(env,path,{serverId:sid,uid:user.uid,state:'pending',createdAt:new Date()},prior?{updateTime:prior._updateTime}:{create:true})]);return {ok:true};
 }
 const target=b.uid?safeId(b.uid):'';if(!communityPermission(server,user.uid,action,target))throw new Error('FORBIDDEN');
 if(action==='read')return {ok:true,role:communityRole(server,user.uid),members:server.members.map(uid=>({uid,role:communityRole(server,uid),muted:server.mutedUids?.includes(uid)||false})),banned:communityRole(server,user.uid)==='member'?[]:server.bannedUids||[],joinMode:server.joinMode||'open',voiceCapacity:sfuReady(env)?25:6};
 let change={updatedAt:new Date()},writes=[];
 if(action==='role'){
  if(target===server.ownerUid||!server.members.includes(target)||!['member','moderator','observer'].includes(b.role))throw new Error('INVALID_COMMUNITY_INPUT');
  change.roles={...(server.roles||{}),[target]:b.role};
 }else if(['mute','unmute','ban','unban','kick'].includes(action)){
  if(target===server.ownerUid||target===user.uid||(!server.members.includes(target)&&action!=='unban'))throw new Error('FORBIDDEN');
  if(String(b.reason||'').trim().length<5)throw new Error('INVALID_COMMUNITY_INPUT');
  const key=action.includes('mute')?'mutedUids':action.includes('ban')?'bannedUids':'kickedUids';
  change[key]=[...new Set((server[key]||[]).filter(uid=>uid!==target).concat(action.startsWith('un')?[]:[target]))];
  if(['ban','kick'].includes(action)){change.members=server.members.filter(uid=>uid!==target);change.roles={...(server.roles||{})};delete change.roles[target];}
 }else if(action==='settings'){
  if(!['open','approval','invite'].includes(b.joinMode))throw new Error('INVALID_COMMUNITY_INPUT');change.joinMode=b.joinMode;
 }else if(action==='invite'){
  const days=Number(b.days||7);if(!Number.isInteger(days)||days<1||days>30||!target||server.bannedUids?.includes(target))throw new Error('INVALID_COMMUNITY_INPUT');
  const path=`serverInvites/${sid}_${target}`,prior=await getDocument(env,path);writes.push(patchWrite(env,path,{serverId:sid,toUid:target,createdAt:new Date(),expiresAt:new Date(Date.now()+days*86400000)},prior?{updateTime:prior._updateTime}:{create:true}));writes.push(patchWrite(env,`notifications/${crypto.randomUUID()}`,{toUid:target,fromUid:user.uid,type:'server_invite',serverId:sid,title:'Convite para comunidade',message:`Você foi convidado para ${server.name}.`,special:false,read:false,createdAt:new Date()},{create:true}));
 }else if(action==='channel'){
  const name=String(b.name||'').trim(),audience=b.audience||'all';if(!/^[a-z0-9-]{1,30}$/.test(name)||!['all','staff'].includes(audience)||!['text','voice'].includes(b.kind||'text'))throw new Error('INVALID_COMMUNITY_INPUT');
  const id=crypto.randomUUID();writes.push(patchWrite(env,`servers/${sid}/channels/${id}`,{name,audience,kind:b.kind||'text',createdAt:new Date()},{create:true}));
 }else if(action==='reviewJoin'){
  const path=`serverJoinRequests/${sid}_${target}`,item=await getDocument(env,path);if(!item||item.state!=='pending'||!['approved','rejected'].includes(b.decision))throw new Error('RESOURCE_CONFLICT');
  if(b.decision==='approved'){if(server.members.length>=100||server.bannedUids?.includes(target))throw new Error('RESOURCE_CONFLICT');change.members=[...new Set([...server.members,target])];change.kickedUids=(server.kickedUids||[]).filter(uid=>uid!==target);}
  writes.push(patchWrite(env,path,{state:b.decision,reviewedBy:user.uid,updatedAt:new Date()},{updateTime:item._updateTime}));
 }else throw new Error('INVALID_COMMUNITY_INPUT');
 if(['mute','ban','kick','role'].includes(action)&&target)await revokeSfu(env,sid,target);
 await commitDocuments(env,[patchWrite(env,`servers/${sid}`,change,{updateTime:server._updateTime}),...writes,audit({targetUid:target},b.reason)]);return {ok:true};
}

export function updateVoiceMembers(server,prior,uid,session,action,now=Date.now(),capacity=6){
 if(!communityPermission(server,uid,'read')||server.mutedUids?.includes(uid))throw new Error('FORBIDDEN');
 const members=Object.fromEntries(Object.entries(prior).filter(([id,v])=>v.expiresAt>now&&server.members.includes(id)&&!server.bannedUids?.includes(id)&&!server.mutedUids?.includes(id)));
 if(action==='voiceLeave'){if(members[uid]?.session===session)delete members[uid];}
 else {if(members[uid]&&members[uid].session!==session)throw new Error('RESOURCE_CONFLICT');if(!members[uid]&&Object.keys(members).length>=capacity)throw new Error('RESOURCE_CONFLICT');members[uid]={session,expiresAt:now+90000,canPublish:communityRole(server,uid)!=='observer'};}return members;
}
