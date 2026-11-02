import './now-telemetry.js';
// UX global sem depender de autenticação ou integrações remotas.
const banner=document.createElement('div');banner.className='sg-connection-status';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');banner.textContent='Você está offline. Algumas ações aguardam conexão.';banner.hidden=navigator.onLine;document.body.append(banner);
const sync=()=>{banner.hidden=navigator.onLine;document.documentElement.dataset.connection=navigator.onLine?'online':'offline'};addEventListener('online',sync);addEventListener('offline',sync);sync();
document.querySelectorAll('.app-toast').forEach(el=>{el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true')});
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('service-worker.js').catch(()=>{});
