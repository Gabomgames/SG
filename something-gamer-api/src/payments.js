import { PLANS, validOrderId, checkoutUrl, validateOrder, nextPaymentState, verifyWebhook } from './payment-domain.js';
import { mirrorVerification } from './firestore-server.js';

function configured(env, create = false) {
  if (!env.SG_DB) throw new Error('PAYMENT_STORAGE_NOT_CONFIGURED');
  if (!env.MERCADOPAGO_COLLECTOR_ID || !env.MERCADOPAGO_WEBHOOK_SECRET
      || !env.FIRESTORE_SERVICE_ACCOUNT || !env.FIREBASE_PROJECT_ID) throw new Error('PAYMENTS_NOT_CONFIGURED');
  if (create && env.PAYMENTS_ENABLED !== 'true') throw new Error('PAYMENTS_DISABLED');
}
const savedOrder = (env, orderId) => env.SG_DB.prepare('SELECT * FROM payments WHERE order_id = ? COLLATE NOCASE').bind(orderId).first();
function view(row) {
  return { id: row.id, orderId: row.order_id, plan: row.plan, amount: (row.amount_cents / 100).toFixed(2),
    days: row.days, status: row.state, approved: row.state === 'approved', review: row.review,
    expiresAt: row.expires_at, createdAt: row.created_at, checkoutUrl: row.checkout_url };
}
export async function createOrder(request, env, user, provider) {
  configured(env, true);
  const body = await request.json();
  const plan = PLANS[body.plan], clientKey = String(body.idempotencyKey ?? '');
  if (!plan) throw new Error('INVALID_PAYMENT_PLAN');
  if (!/^[a-z0-9-]{16,80}$/i.test(clientKey)) throw new Error('INVALID_IDEMPOTENCY_KEY');
  const id = crypto.randomUUID(), now = Date.now();
  await env.SG_DB.prepare(`INSERT OR IGNORE INTO payments
    (id, uid, client_key, plan, days, amount_cents, reference, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.uid, clientKey, body.plan, plan.days, plan.cents, `sgv_${id}`, now, now).run();
  let row = await env.SG_DB.prepare('SELECT * FROM payments WHERE uid = ? AND client_key = ?').bind(user.uid, clientKey).first();
  if (row.plan !== body.plan) throw new Error('IDEMPOTENCY_CONFLICT');
  if (row.order_id) return { ok: true, ...view(row), reused: true };
  const amount = (row.amount_cents / 100).toFixed(2);
  const returnBase = `${env.APP_URL}/verification.html`;
  const payload = { type: 'online', processing_mode: 'manual', capture_mode: 'automatic_async',
    total_amount: amount, external_reference: row.reference, description: plan.title,
    expiration_time: 'P1D', payer: { email: user.email },
    items: [{ title: plan.title, unit_price: amount, quantity: 1, unit_measure: 'unit', total_amount: amount }],
    config: { online: { success_url: `${returnBase}?payment=returned`, failure_url: `${returnBase}?payment=failure`,
      pending_url: `${returnBase}?payment=pending`, auto_return: 'all' } } };
  // A mesma chave local sempre chega ao provedor, inclusive após timeout.
  const order = await provider('/v1/orders', env, { method: 'POST', headers: { 'X-Idempotency-Key': row.id }, body: JSON.stringify(payload) });
  if (!validOrderId(order.id)) throw new Error('MERCADOPAGO_FAILED');
  const checkout = checkoutUrl(order.checkout_url, env.PAYMENT_ENV === 'test');
  await env.SG_DB.prepare(`UPDATE payments SET order_id = ?, checkout_url = ?, state = 'pending', updated_at = ?
    WHERE id = ? AND order_id IS NULL`).bind(order.id, checkout, Date.now(), row.id).run();
  row = await env.SG_DB.prepare('SELECT * FROM payments WHERE id = ?').bind(row.id).first();
  return { ok: true, ...view(row) };
}
export async function reconcileOrder(env, row, provider, eventKey = '') {
  const order = await provider(`/v1/orders/${encodeURIComponent(row.order_id)}`, env, { method: 'GET' });
  const incoming = validateOrder(order, row, env), now = Date.now();
  // SQL avalia o estado vigente: um evento antigo não pode restaurar estorno.
  const stateSql = `CASE WHEN state = 'revoked' OR ? = 'revoked' OR (state = 'approved' AND ? = 'cancelled') THEN 'revoked'
    WHEN state = 'approved' AND ? = 'pending' THEN 'approved' ELSE ? END`;
  const statements = [env.SG_DB.prepare(`UPDATE payments SET state = ${stateSql},
    approved_at = CASE WHEN ? = 'approved' THEN COALESCE(approved_at, ?) ELSE approved_at END,
    review = CASE WHEN ? = 'approved' AND review = 'none' AND state != 'revoked' THEN 'pending' ELSE review END,
    mirror_pending = 1, updated_at = ? WHERE id = ?`).bind(incoming, incoming, incoming, incoming, incoming, now, incoming, now, row.id)];
  if (eventKey) statements.push(env.SG_DB.prepare('INSERT OR IGNORE INTO payment_events(event_key, order_id, state, received_at) VALUES (?, ?, ?, ?)').bind(eventKey, row.order_id, incoming, now));
  await env.SG_DB.batch(statements);
  row = await env.SG_DB.prepare('SELECT * FROM payments WHERE id = ?').bind(row.id).first();
  // Falha de espelhamento mantém outbox persistente para reconciliação.
  await mirrorLatest(env, row.uid);
  return row;
}
async function mirrorLatest(env, uid) {
  // Um pedido pendente novo não apaga um selo aprovado ainda válido.
  const latest = await env.SG_DB.prepare(`SELECT * FROM payments WHERE uid = ?
    ORDER BY CASE WHEN state = 'approved' AND review = 'approved' AND expires_at > ? THEN 0
      WHEN state = 'approved' THEN 1 ELSE 2 END, created_at DESC LIMIT 1`).bind(uid, Date.now()).first();
  if (!latest?.order_id) return;
  await mirrorVerification(latest, env);
  await env.SG_DB.prepare('UPDATE payments SET mirror_pending = 0 WHERE uid = ? AND updated_at <= ?').bind(uid, latest.updated_at).run();
}
export async function statusOrder(request, env, user, provider) {
  configured(env);
  const body = await request.json(), id = String(body.orderId ?? '');
  if (!validOrderId(id)) throw new Error('INVALID_PAYMENT_ORDER');
  const row = await savedOrder(env, id);
  if (!row || row.uid !== user.uid) throw new Error('PAYMENT_NOT_FOUND');
  return { ok: true, ...view(await reconcileOrder(env, row, provider)) };
}
export async function listOrders(env, user) {
  configured(env);
  const result = await env.SG_DB.prepare('SELECT * FROM payments WHERE uid = ? ORDER BY created_at DESC LIMIT 30').bind(user.uid).all();
  return { ok: true, orders: result.results.map(view) };
}
export async function webhookOrder(request, env, provider) {
  const signed = await verifyWebhook(request, env.MERCADOPAGO_WEBHOOK_SECRET);
  // Simuladores numéricos podem testar conectividade, nunca alterar Orders.
  if (!validOrderId(signed.id)) return { ok: true, ignored: true };
  configured(env);
  if (request.method === 'POST') {
    const body = await request.json();
    if (body.data?.id && String(body.data.id).toLowerCase() !== signed.id.toLowerCase()) throw new Error('INVALID_WEBHOOK_SIGNATURE');
  }
  const row = await savedOrder(env, signed.id);
  if (!row) return { ok: true, ignored: true };
  const eventKey = `${signed.id.toLowerCase()}:${signed.requestId}:${signed.ts}`;
  if (await env.SG_DB.prepare('SELECT event_key FROM payment_events WHERE event_key = ?').bind(eventKey).first()) {
    if (row.mirror_pending) await mirrorLatest(env, row.uid);
    return { ok: true, duplicate: true };
  }
  await reconcileOrder(env, row, provider, eventKey);
  return { ok: true };
}
export async function reviewOrder(request, env, admin) {
  configured(env);
  const body = await request.json(), reason = String(body.reason ?? '').trim();
  if (!validOrderId(body.orderId) || !['approved', 'rejected'].includes(body.decision) || reason.length < 10 || reason.length > 500) throw new Error('INVALID_REVIEW');
  const row = await savedOrder(env, body.orderId);
  if (!row || row.state !== 'approved' || row.review !== 'pending') throw new Error('PAYMENT_NOT_REVIEWABLE');
  const now = Date.now(), auditId = crypto.randomUUID();
  // Só a primeira revisão vence. Auditoria e decisão ficam na mesma transação.
  await env.SG_DB.batch([
    env.SG_DB.prepare(`INSERT INTO admin_audit(id, actor_uid, action, target_id, result, created_at)
      SELECT ?, ?, 'verification_review', id, ?, ? FROM payments WHERE id = ? AND state = 'approved' AND review = 'pending'`)
      .bind(auditId, admin.uid, body.decision, now, row.id),
    env.SG_DB.prepare(`UPDATE payments SET review = ?, reviewed_by = ?, review_reason = ?, expires_at = ?, updated_at = ?, mirror_pending = 1
      WHERE id = ? AND state = 'approved' AND review = 'pending'`).bind(body.decision, admin.uid, reason,
        body.decision === 'approved' ? now + row.days * 86400000 : null, now, row.id)
  ]);
  await mirrorLatest(env, row.uid);
  return { ok: true };
}
export async function reconcilePending(env, provider) {
  if (!env.SG_DB || !env.FIRESTORE_SERVICE_ACCOUNT || !env.MERCADOPAGO_ACCESS_TOKEN) return;
  // Limite explícito de custo: 25 pedidos por execução, sem varrer usuários.
  const result = await env.SG_DB.prepare(`SELECT * FROM payments WHERE order_id IS NOT NULL AND
    (state IN ('pending','approved') OR mirror_pending = 1) ORDER BY updated_at ASC LIMIT 25`).all();
  for (const row of result.results) {
    try { await reconcileOrder(env, row, provider); }
    catch { console.warn(JSON.stringify({ event: 'payment_reconciliation_failed', paymentId: row.id })); }
  }
}
