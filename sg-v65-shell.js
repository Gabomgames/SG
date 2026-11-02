/** SG V66: navegação visual unificada. Não acessa dados de usuários ou autenticação. */
const page = location.pathname.split('/').pop() || 'index.html';
const routes = [
  ['feed.html','Início','home','Feed e publicações'],
  ['social.html','Explorar','compass','Encontrar jogadores'],
  ['communities.html','Servidores','users','Comunidades e convites'],
  ['chat.html','Now Call','messages','Mensagens e chamadas'],
  ['marketplace.html','Now Market','shop','Produtos e anúncios'],
  ['ads.html','Now ADS','bars','Gerenciar publicidade'],
  ['dashboard.html','Perfil','user','Seu perfil'],
  ['verification.html','Verificado Gamer','verified','Selo e planos de verificação'],
  ['settings.html','Configurações','settings','Configurações da conta']
];
const icons={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  compass:'<circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2z"/>',
  users:'<circle cx="9" cy="8.5" r="3"/><path d="M3 20v-2.4c0-3 2.7-4.6 6-4.6s6 1.6 6 4.6V20M17 5.5a3 3 0 0 1 0 6M17 14c2.4.3 4 1.5 4 3.6V20"/>',
  messages:'<path d="M4 5h16v12H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  shop:'<path d="M4 9h16v12H4zM3 9l2-6h14l2 6"/><path d="M9 21v-7h6v7"/>',
  bars:'<rect x="4" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="8" width="3" height="12" rx="1"/><rect x="17" y="4" width="3" height="16" rx="1"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.2 3.1-6.5 8-6.5s8 2.3 8 6.5"/>',
  verified:'<path d="m12 2 3 2 4 1 1 4 2 3-2 3-1 4-4 1-3 2-3-2-4-1-1-4-2-3 2-3 1-4 4-1z"/><path d="m8 12 3 3 5-6"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1m0-14.2L17 7M7 17l-2.1 2.1"/>'
};
const svg = (key)=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
function init(){
 if(page === 'admin.html')return;
 if(document.querySelector('.sg-v65-nav')) return;
 document.body.classList.add('sg-v65');
 const nav=document.createElement('nav');nav.className='sg-v65-nav';nav.setAttribute('aria-label','Navegação Something Gamer');
 const links=routes.map(([href,label,icon,desc])=>{
  const current=page===href || page==='profile.html'&&href==='dashboard.html' || page==='call-now.html'&&href==='chat.html';
  return `<a class="sg-v65-link${current?' active':''}" href="${href}" title="${desc}" ${current?'aria-current="page"':''}>${svg(icon)}<span>${label}</span></a>`;
 });
 nav.innerHTML=`<a class="sg-v65-logo" href="feed.html" aria-label="Something Gamer — início"><img src="assets/logo.png" alt=""><span>Something <b>Gamer</b><small>YES, SOMETHING FOR YOU ;)</small></span></a><div class="sg-v65-nav-links">${links.join('')}</div><div class="sg-v65-nav-bottom"><span>SG · V69</span><a href="support.html">Ajuda e suporte</a></div>`;
 document.body.prepend(nav);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
