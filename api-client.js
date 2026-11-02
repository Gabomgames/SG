import { auth, appCheckHeaders } from './firebase.js';
import { APP_CONFIG } from './config.js';
export class ApiError extends Error {
  constructor(message, code, status, requestId) { super(message); Object.assign(this, {code, status, requestId}); }
}
// Retry somente quando o chamador confirma operação idempotente.
export async function api(path, body = {}, { retries = 0, timeout = 15000, base = APP_CONFIG.steamApiBaseUrl } = {}) {
  const user = auth.currentUser;
  if (!user) throw new ApiError('Faça login novamente.', 'UNAUTHENTICATED', 401);
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST', signal: AbortSignal.timeout(timeout), cache: 'no-store',
        credentials: path.startsWith('/admin') || ['/payments/review','/market/refund','/market/disputes/resolve','/market/listing/review','/ads/review'].includes(path) ? 'include' : 'omit',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json', ...(await appCheckHeaders()) },
        body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new ApiError(data.error || 'Serviço temporariamente indisponível.', data.code || 'API_ERROR', response.status, data.requestId);
      return data;
    } catch (error) {
      if (attempt >= retries || (error.status && error.status < 500)) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.min(4000, 400 * 2 ** attempt) + Math.random() * 250));
    }
  }
}
