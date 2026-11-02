import { auth } from './firebase.js';
// A landing continua acessível mesmo para usuários autenticados.
// O redirecionamento automático anterior impedia visualizar o novo index.
auth.onAuthStateChanged(user => {
  if (!user) return;
  const login = document.querySelector('[data-home-login]');
  const register = document.querySelector('[data-home-register]');
  const hero = document.querySelector('[data-home-hero]');
  const end = document.querySelector('[data-home-end]');
  if (login) { login.textContent='Meu perfil'; login.href='dashboard.html'; }
  if (register) { register.innerHTML='Abrir meu feed <span aria-hidden="true">↗</span>'; register.href='feed.html'; }
  if (hero) { hero.innerHTML='Ir para meu feed <span aria-hidden="true">→</span>'; hero.href='feed.html'; }
  if (end) { end.innerHTML='Acessar meu perfil <span aria-hidden="true">→</span>'; end.href='dashboard.html'; }
});
