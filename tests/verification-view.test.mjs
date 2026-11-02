import test from 'node:test';
import assert from 'node:assert/strict';
import {activeFounder,verificationCopy} from '../verification-view.js';
test('founder display relies on server grant status and future expiry',()=>{
 const now=1800000000000;
 assert.equal(activeFounder({founderGrant:{status:'active',expiresAt:{seconds:now/1000+10}}},now),true);
 assert.equal(activeFounder({founderGrant:{status:'active',expiresAt:now-1}},now),false);
 assert.equal(activeFounder({founderGrant:{status:'revoked',expiresAt:now+1}},now),false);
 assert.equal(activeFounder({verification:{status:'active'}},now),false);
});
test('promotional copy explains automatic free entitlement while paid review copy is preserved',()=>{
 const paid=['Verificação ativa','Seu perfil foi aprovado.'];
 assert.deepEqual(verificationCopy('active',{source:'mercado_pago_order'},paid),paid);
 assert.match(verificationCopy('active',{source:'sg_founders'},paid)[1],/365 dias gratuitos/);
 assert.match(verificationCopy('active',{source:'sg_founders'},paid)[1],/Sem cobrança ou renovação automática/);
});
