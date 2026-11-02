import test from 'node:test';
import assert from 'node:assert/strict';
import {installFounderSync} from '../founders-client.js';
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup(user,response={status:'active'}){
  const requests=[];let callback,visible,unsubscribed=false,cleared=false;
  const auth={currentUser:user};
  const stop=installFounderSync({auth,endpoint:'https://functions.example.test/syncFounderEligibility',headers:async()=>({'X-Firebase-AppCheck':'test-only'}),
    subscribe:(a,fn)=>{callback=fn;return()=>{unsubscribed=true;};},
    host:{document:{hidden:false,addEventListener:(n,fn)=>{visible=fn;},removeEventListener:()=>{}},setInterval:()=>1,clearInterval:()=>{cleared=true;}},
    fetcher:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>response};}});
  return {requests,trigger:()=>callback(),visible:()=>visible(),stop,auth,clean:()=>unsubscribed&&cleared};
}
test('verified sign-in syncs automatically without a claim button or client entitlement fields',async()=>{
  const s=setup({uid:'alice',emailVerified:true,getIdToken:async force=>{assert.equal(force,true);return 'fixture-token';}});
  s.trigger();await settle();assert.equal(s.requests.length,1);assert.equal(s.requests[0].options.method,'POST');assert.equal(s.requests[0].options.body,undefined);assert.equal(s.requests[0].options.headers.Authorization,'Bearer fixture-token');
  s.trigger();s.visible();await settle();assert.equal(s.requests.length,1);s.stop();assert.equal(s.clean(),true);
});
test('email verification is reloaded automatically and does not consume a request while unverified',async()=>{
  const user={uid:'alice',emailVerified:false,reload:async()=>{},getIdToken:async()=>'fixture'};const s=setup(user);
  s.trigger();await settle();assert.equal(s.requests.length,0);
  user.reload=async()=>{user.emailVerified=true;};s.visible();await settle();assert.equal(s.requests.length,1);s.stop();
});
test('backend outage does not break login or mark the promotion as granted',async()=>{
  const user={uid:'alice',emailVerified:true,getIdToken:async()=>{throw new Error('offline');}};const s=setup(user);
  s.trigger();await settle();assert.equal(s.requests.length,0);user.getIdToken=async()=>'fixture';s.visible();await settle();assert.equal(s.requests.length,1);s.stop();
});
