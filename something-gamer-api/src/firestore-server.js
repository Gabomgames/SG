// Conta de serviço somente em secret do Worker, nunca no frontend ou wrangler.jsonc.
import founderPolicy from '../../functions/founders-domain.js';
import {getDocument} from './firestore-store.js';
let cached = { token: '', expires: 0, email: '' };
const base64url = text => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export async function serverToken(env) {
  if (!env.FIRESTORE_SERVICE_ACCOUNT) throw new Error('FIRESTORE_NOT_CONFIGURED');
  const account = JSON.parse(env.FIRESTORE_SERVICE_ACCOUNT);
  if (account.project_id !== env.FIREBASE_PROJECT_ID) throw new Error('FIRESTORE_NOT_CONFIGURED');
  if (cached.email === account.client_email && cached.expires > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const input = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  }))}`;
  const pem = account.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), x => x.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
  const assertion = `${input}.${base64url(String.fromCharCode(...signature))}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('FIRESTORE_FAILED');
  cached = { token: data.access_token, expires: Date.now() + 3000000, email: account.client_email };
  return cached.token;
}
export function field(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (value && typeof value === 'object' && Number.isFinite(value.seconds) && Object.keys(value).every(k => ['seconds','nanoseconds'].includes(k))) return { timestampValue: new Date(value.seconds * 1000+(value.nanoseconds||0)/1000000).toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, v]) => [key, field(v)])) } };
  return { stringValue: String(value) };
}
export async function mirrorVerification(payment, env, attempt=0) {
  const status = payment.state === 'revoked' || payment.state === 'cancelled' ? 'suspended'
    : payment.state !== 'approved' ? 'payment_pending'
    : payment.review === 'approved' ? (payment.expires_at > Date.now() ? 'active' : 'expired')
    : payment.review === 'rejected' ? 'rejected' : 'pending';
  const paidVerification = { status, provider: 'mercado_pago_order', paymentStatus: payment.state,
    orderId: payment.order_id, plan: payment.plan, reviewed: payment.review === 'approved',
    expiresAt: payment.expires_at ? new Date(payment.expires_at) : null };
  const base = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  // A concurrent founder grant must not be overwritten by a payment mirror.
  const profile=await getDocument(env,`users/${payment.uid}`);
  if(!profile?._updateTime)throw new Error('FIRESTORE_FAILED');
  const verification=founderPolicy.effectiveVerification(paidVerification,profile.founderGrant);
  const writes = ['users', 'publicProfiles'].map(collection => ({
    update: { name: `${base}/${collection}/${payment.uid}`, fields: { verification: field(verification),...(collection==='users'?{paidVerification:field(paidVerification)}:{}) } },
    updateMask: { fieldPaths: collection==='users'?['verification','paidVerification']:['verification'] },
    currentDocument: collection==='users'?{updateTime:profile._updateTime}:{exists:true}
  }));
  writes.push({ update: { name: `${base}/verificationRequests/${payment.uid}`, fields: {
    uid: field(payment.uid), orderId: field(payment.order_id), status: field(status), updatedAt: field(new Date())
  } } });
  const response = await fetch(`https://firestore.googleapis.com/v1/${base}:commit`, {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${await serverToken(env)}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ writes })
  });
  if([409,412].includes(response.status)&&attempt<3)return mirrorVerification(payment,env,attempt+1);
  if (!response.ok) throw new Error('FIRESTORE_FAILED');
}
