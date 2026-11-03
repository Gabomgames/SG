import {auth,db} from './firebase.js';
import {api} from './api-client.js';
import {doc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import {createPostPublisher} from './post-publication-client.js';
export const publishPost=createPostPublisher({currentUser:()=>auth.currentUser,authorize:body=>api('/posts/authorize',body,{retries:1}),batch:()=>writeBatch(db),reference:(collection,id)=>doc(db,collection,id),timestamp:serverTimestamp});
export function installPendingPosts(){
 const panel=document.createElement('section');panel.className='feed-empty';panel.innerHTML='<h2>Publicações em análise</h2><p data-status>Consultando suas publicações…</p><ul></ul><button type="button">Atualizar</button>';
 (document.querySelector('main')||document.body).append(panel);
 async function load(){try{const out=await api('/posts/mine');const list=panel.querySelector('ul');list.replaceChildren();panel.querySelector('[data-status]').textContent=out.items.length?'A análise será concluída pela equipe.':'Nenhuma publicação aguardando análise.';for(const item of out.items){const li=document.createElement('li');li.textContent=`${{pending_review:'Em análise',authorized:'Autorizada, aguardando conclusão',rejected:'Não aprovada'}[item.state]||'Em processamento'} · ${new Date(item.created_at).toLocaleString('pt-BR')}`;list.append(li);}}catch{panel.querySelector('[data-status]').textContent='Não foi possível consultar as publicações em análise.';}}
 panel.querySelector('button').addEventListener('click',()=>void load());auth.onAuthStateChanged(user=>{if(user)void load();});
}
