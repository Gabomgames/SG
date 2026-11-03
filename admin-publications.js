import {api} from './api-client.js';
import {auth,appCheckHeaders} from './firebase.js';
import {APP_CONFIG} from './config.js';
export function installPublicationReview(){
 const panel=document.createElement('section');panel.className='admin-card';panel.innerHTML='<h2>Publicações do feed em análise</h2><button type="button" data-refresh>Atualizar fila</button><div data-items role="status"></div>';document.querySelector('main').append(panel);let urls=[];
 async function load(){urls.forEach(URL.revokeObjectURL);urls=[];const box=panel.querySelector('[data-items]');box.replaceChildren();try{
  const out=await api('/admin/posts',{action:'queue'});if(!out.items.length)box.textContent='Nenhuma publicação aguardando análise.';
  for(const row of out.items){const article=document.createElement('article');article.dataset.id=row.id;const title=document.createElement('h3');title.textContent=row.payload.title||'Publicação';const text=document.createElement('p');text.textContent=row.payload.description;article.append(title,text);
   if(row.payload.mediaId){const media=document.createElement('button');media.type='button';media.textContent='Abrir arquivo privado para análise';media.dataset.media=row.payload.mediaId;media.dataset.type=row.payload.mediaType;article.append(media);}
   for(const [action,label] of [['approve','Aprovar e publicar'],['reject','Reprovar']]){const button=document.createElement('button');button.type='button';button.dataset.action=action;button.textContent=label;article.append(button);}box.append(article);
  }
 }catch(error){box.textContent=error.message;}}
 panel.addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-refresh'))return load();button.disabled=true;try{
  if(button.dataset.media){const response=await fetch(`${APP_CONFIG.steamApiBaseUrl}/admin/media/read`,{method:'POST',credentials:'include',cache:'no-store',headers:{Authorization:`Bearer ${await auth.currentUser.getIdToken()}`,'Content-Type':'application/json',...(await appCheckHeaders())},body:JSON.stringify({id:button.dataset.media})});if(!response.ok)throw new Error('Arquivo indisponível ou acesso negado.');const url=URL.createObjectURL(await response.blob());urls.push(url);const element=document.createElement(button.dataset.type?.startsWith('image/')?'img':button.dataset.type?.startsWith('video/')?'video':'audio');element.src=url;if(element.tagName!=='IMG')element.controls=true;else element.alt='Arquivo em análise';button.after(element);}
  else if(button.dataset.action){const reason=prompt('Registre o motivo da decisão (mínimo 10 caracteres):');if(!reason||reason.trim().length<10)return;await api('/admin/posts',{action:button.dataset.action,id:button.closest('[data-id]').dataset.id,reason});await load();}
 }catch(error){panel.querySelector('[data-items]').textContent=error.message;}finally{button.disabled=false;}});
 addEventListener('pagehide',()=>urls.forEach(URL.revokeObjectURL));
}
