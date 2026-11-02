// Funções puras: nenhum estado financeiro vem do navegador.
export const PLANS = Object.freeze({
  monthly: { cents: 1490, days: 30, title: 'Verificação Gamer — 30 dias' },
  semiannual: { cents: 7990, days: 180, title: 'Verificação Gamer — 180 dias' },
  annual: { cents: 14990, days: 365, title: 'Verificação Gamer — 365 dias' }
});
export const validOrderId = id => /^ORD[A-Z0-9_-]{8,80}$/i.test(String(id));
export function cents(value) {
  const text = String(value ?? '');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(text)) throw new Error('PAYMENT_MISMATCH');
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function checkoutUrl(value, test = false) {
  const url = new URL(value);
  const allowed = test ? ['sandbox.mercadopago.com.br', 'www.mercadopago.com.br'] : ['www.mercadopago.com.br'];
  if (url.protocol !== 'https:' || !allowed.includes(url.hostname) || url.username || url.password) throw new Error('MERCADOPAGO_FAILED');
  return url.href;
}
export function validateOrder(order, saved, env) {
  const receiver = String(order.collector_id ?? order.user_id ?? '');
  if (!validOrderId(order.id) || String(order.id).toLowerCase() !== String(saved.order_id).toLowerCase()
      || order.external_reference !== saved.reference
      || cents(order.total_amount) !== saved.amount_cents
      || String(order.currency_id ?? order.currency ?? '') !== 'BRL'
      || !env.MERCADOPAGO_COLLECTOR_ID || receiver !== String(env.MERCADOPAGO_COLLECTOR_ID)
      || !PLANS[saved.plan] || PLANS[saved.plan].cents !== saved.amount_cents
      || PLANS[saved.plan].days !== saved.days) throw new Error('PAYMENT_MISMATCH');
  const status = String(order.status ?? '').toLowerCase();
  const payments = order.transactions?.payments ?? [];
  if (payments.some(p => ['refunded', 'charged_back', 'chargeback'].includes(p.status))
      || ['refunded', 'charged_back', 'chargeback'].includes(status)) return 'revoked';
  // "processed" sozinho também pode descrever processamento malsucedido.
  if (status === 'processed' && order.status_detail === 'accredited'
      && payments.length && payments.every(p => p.status === 'processed' && p.status_detail === 'accredited')
      && payments.reduce((sum, p) => sum + cents(p.amount), 0) === saved.amount_cents) return 'approved';
  if (['cancelled', 'canceled', 'expired', 'failed'].includes(status)) return 'cancelled';
  return 'pending';
}
export function nextPaymentState(current, incoming) {
  if (current === 'revoked') return 'revoked';
  if (incoming === 'revoked') return 'revoked';
  if (current === 'approved' && incoming === 'pending') return 'approved';
  if (current === 'approved' && incoming === 'cancelled') return 'revoked';
  return incoming;
}
export function signatureParts(header) {
  const parts = String(header ?? '').split(',').map(x => x.trim().split('='));
  if (parts.some(x => x.length !== 2) || new Set(parts.map(x => x[0])).size !== parts.length) return null;
  const values = Object.fromEntries(parts);
  if (!/^\d{10,13}$/.test(values.ts ?? '') || !/^[a-f0-9]{64}$/i.test(values.v1 ?? '')) return null;
  return values;
}
export async function verifyWebhook(request, secret) {
  if (!secret) throw new Error('WEBHOOK_NOT_CONFIGURED');
  const url = new URL(request.url), id = url.searchParams.get('data.id');
  const requestId = request.headers.get('x-request-id') ?? '';
  const parts = signatureParts(request.headers.get('x-signature'));
  // O ID assinado vem da query. Nunca substituí-lo pelo ID do corpo.
  if (!id || id.length > 100 || !/^[a-z0-9_-]+$/i.test(id) || !requestId
      || requestId.length > 200 || /[;\r\n]/.test(requestId) || !parts) throw new Error('INVALID_WEBHOOK_SIGNATURE');
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = Uint8Array.from(parts.v1.match(/../g), hex => parseInt(hex, 16));
  if (!await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(manifest))) throw new Error('INVALID_WEBHOOK_SIGNATURE');
  return { id, requestId, ts: parts.ts };
}
