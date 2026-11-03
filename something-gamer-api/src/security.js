export function safeRemoteImage(value) {
  const url = new URL(value);
  // Lista exata evita DNS privado, IPs, metadata e subdomínios controlados por terceiros.
  const hosts = new Set(['something-gamer-api.something-gamer-nowtech.workers.dev', 'firebasestorage.googleapis.com', 'lh3.googleusercontent.com']);
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !hosts.has(url.hostname)
      || url.href.length > 2048) throw new Error('INVALID_MODERATION_REQUEST');
  return url;
}
export function validateMediaSignature(bytes, type) {
  const starts = values => values.every((n, i) => bytes[i] === n);
  const text = (a, b) => new TextDecoder().decode(bytes.slice(a, b));
  const ok = type === 'image/png' ? starts([137,80,78,71,13,10,26,10])
    : type === 'image/jpeg' ? starts([255,216,255])
    : type === 'image/webp' ? text(0,4) === 'RIFF' && text(8,12) === 'WEBP'
    : type === 'image/gif' ? ['GIF87a','GIF89a'].includes(text(0,6))
    : ['video/webm','audio/webm'].includes(type) ? starts([26,69,223,163])
    : ['video/mp4','video/quicktime','audio/mp4','audio/x-m4a'].includes(type) ? text(4,8) === 'ftyp'
    : type === 'audio/ogg' ? text(0,4) === 'OggS'
    : type === 'audio/wav' ? text(0,4) === 'RIFF' && text(8,12) === 'WAVE'
    : type === 'audio/mpeg' ? text(0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : type === 'audio/aac' ? bytes[0] === 255 && (bytes[1] & 246) === 240 : false;
  if (!ok) throw new Error('MEDIA_SIGNATURE_INVALID');
}
const decode = s => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)), x => x.charCodeAt(0));
export async function verifyAccess(request, env, email) {
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CF_ACCESS_TEAM_DOMAIN ?? '') || !env.CF_ACCESS_AUD) throw new Error('ADMIN_NOT_CONFIGURED');
  const token = request.headers.get('Cf-Access-Jwt-Assertion') ?? '', parts = token.split('.');
  if (parts.length !== 3) throw new Error('FORBIDDEN');
  let header, claims;
  try { header = JSON.parse(new TextDecoder().decode(decode(parts[0]))); claims = JSON.parse(new TextDecoder().decode(decode(parts[1]))); }
  catch { throw new Error('FORBIDDEN'); }
  const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
  if (header.alg !== 'RS256' || claims.iss !== issuer || !Array.isArray(claims.aud) || !claims.aud.includes(env.CF_ACCESS_AUD)
      || !Number.isFinite(claims.exp) || claims.exp <= Date.now()/1000 || String(claims.email).toLowerCase() !== email.toLowerCase()) throw new Error('FORBIDDEN');
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('FORBIDDEN');
  const keys = await response.json(), jwk = keys.keys?.find(x => x.kid === header.kid);
  if (!jwk) throw new Error('FORBIDDEN');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`))) throw new Error('FORBIDDEN');
  return claims;
}
