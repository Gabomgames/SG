// Testes locais de contrato. Não acessam provedores nem projetos Firebase.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname,'../..');
const domain = await import(pathToFileURL(resolve(root, 'something-gamer-api/src/payment-domain.js')));
const {PLANS, validateOrder, nextPaymentState, checkoutUrl} = domain;
const expected = {monthly:[1490,30], semiannual:[7990,180], annual:[14990,365]};
for (const [plan,[amount,days]] of Object.entries(expected)) {
  test(`${plan}: preço, prazo e confirmação financeira íntegros`, () => {
    assert.equal(PLANS[plan].cents, amount);
    assert.equal(PLANS[plan].days, days);
    const saved = {order_id:'ORD_AUDIT_FIXTURE_001',reference:'sgv_audit_fixture',plan,amount_cents:amount,days};
    const order = {id:saved.order_id, external_reference:saved.reference, total_amount:(amount/100).toFixed(2), currency_id:'BRL',collector_id:'audit-collector',status:'processed',status_detail:'accredited',transactions:{payments:[{status:'processed',status_detail:'accredited',amount:(amount/100).toFixed(2)}]}};
    const env = {MERCADOPAGO_COLLECTOR_ID:'audit-collector'};
    assert.equal(validateOrder(order,saved,env),'approved');
    for (const patch of [{amount_cents:amount+1},{days:days+1}]) {
      assert.throws(()=>validateOrder(order,{...saved,...patch},env),/PAYMENT_MISMATCH/);
    }
    assert.throws(()=>validateOrder({...order,collector_id:'other'},saved,env),/PAYMENT_MISMATCH/);
    assert.throws(()=>validateOrder({...order,currency_id:'USD'},saved,env),/PAYMENT_MISMATCH/);
    assert.equal(validateOrder({...order,transactions:{payments:[]}},saved,env),'pending');
    assert.equal(validateOrder({...order,status:'refunded'},saved,env),'revoked');
  });
}
test('estorno é terminal para toda entrada financeira conhecida',()=>{
  for (const incoming of ['pending','approved','cancelled','revoked']) assert.equal(nextPaymentState('revoked',incoming),'revoked');
  assert.equal(nextPaymentState('approved','pending'),'approved');
  assert.equal(nextPaymentState('approved','cancelled'),'revoked');
});
test('checkout rejeita credenciais, downgrade e domínios semelhantes',()=>{
  for (const url of ['http://www.mercadopago.com.br/','https://www.mercadopago.com.br.evil.test/','https://user:pass@www.mercadopago.com.br/','javascript:alert(1)']) {
    assert.throws(()=>checkoutUrl(url));
  }
  assert.throws(()=>checkoutUrl('https://sandbox.mercadopago.com.br/',false));
  assert.equal(checkoutUrl('https://sandbox.mercadopago.com.br/',true),'https://sandbox.mercadopago.com.br/');
});
