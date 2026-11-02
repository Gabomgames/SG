/* Visibilidade da senha: somente troca tipo e aria, sem ler nem enviar a senha. */
document.querySelectorAll('[data-sg67-password]').forEach(button=>{
 const field=button.closest('.sg67-password-field')?.querySelector('input');
 if(!field)return;
 button.addEventListener('click',()=>{
  const visible=field.type==='password';
  const from=field.selectionStart,to=field.selectionEnd;
  field.type=visible?'text':'password';
  button.setAttribute('aria-pressed',String(visible));
  button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
  button.title=visible?'Ocultar senha':'Mostrar senha';
  button.classList.toggle('is-visible',visible);
  try{field.setSelectionRange(from,to)}catch{};
  field.focus({preventScroll:true});
 });
});
