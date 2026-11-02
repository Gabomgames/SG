import { auth, db } from './firebase.js';
import { collection, deleteDoc, doc, getDocs, terminate, clearIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { escaparHtml } from './seguranca-web.js';
async function paint(){const user=auth.currentUser,box=document.getElementById('blockedPeopleList');if(!user||!box)return;try{const snap=await getDocs(collection(db,'users',user.uid,'blocks'));box.innerHTML=snap.empty?'<p>Ninguém bloqueado.</p>':snap.docs.map(d=>`<p>Conta ${escaparHtml(d.id)} <button type="button" class="v56-btn" data-unblock="${escaparHtml(d.id)}">Desbloquear</button></p>`).join('')}catch{box.textContent='Não foi possível consultar os bloqueios.'}}
// Settings cria os controles de forma síncrona antes dos eventos.
auth.onAuthStateChanged(()=>paint());
document.addEventListener('click',async event=>{const button=event.target.closest('[data-unblock]');if(!button||!auth.currentUser)return;button.disabled=true;try{await deleteDoc(doc(db,'users',auth.currentUser.uid,'blocks',button.dataset.unblock));await paint()}catch{button.disabled=false;button.textContent='Tentar novamente'}});
document.addEventListener('click',async event=>{if(event.target.id!=='clearPrivateCache')return;if(!confirm('Limpar dados privados deste dispositivo? Mensagens ainda não enviadas e itens salvos localmente podem ser perdidos. Feche outras abas do SG antes de continuar.'))return;
 try{const uid=auth.currentUser?.uid;await terminate(db);await clearIndexedDbPersistence(db);if(uid){for(const key of Object.keys(localStorage))if(key.startsWith(`sg_failed_${uid}`)||key.startsWith(`sg_saved_${uid}`)||key.startsWith(`sg_seen_${uid}`))localStorage.removeItem(key)}localStorage.setItem('sgTrustedDevice','0');location.reload()}catch{alert('Feche as outras abas do SG e tente novamente. O histórico local não foi confirmado como limpo.')}
});
