import {auth,db} from './firebase.js';
import {doc,getDoc,updateDoc,collection,query,where,getDocs} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
const BASE='https://us-central1-something-gamer.cloudfunctions.net';
const area=document.getElementById('sg66AccountControls');
const label=(name,value)=>`<option value="${value}">${name}</option>`;
if(area){area.innerHTML=`
 <section class="settings-card" style="grid-column:1/-1"><h2>Marcações e privacidade</h2>
 <p class="sg66-help">Escolha quem pode marcar seu @usuário. Em contas privadas, qualquer menção exige sua aprovação mesmo com a opção de permitir todos.</p>
 <label class="settings-field">Quem pode marcar meu perfil?
 <select id="sg66MentionPolicy">${label('Pessoas em perfis públicos','auto')}${label('Somente com minha aprovação','approval')}${label('Ninguém','none')}</select></label>
 <button type="button" id="sg66SaveMentions" class="v56-btn">Salvar permissão</button><p id="sg66MentionStatus" role="status" class="sg66-help"></p>
 <h3 style="margin-top:20px;font-size:16px">Solicitações recebidas</h3><div id="sg66MentionRequests" class="sg66-mention-info">Carregando...</div></section>
 <section class="settings-card sg66-danger" style="grid-column:1/-1"><h2>Excluir minha conta</h2>
 <p>Esta ação encerra seu login e apaga os dados principais. Mensagens de outras pessoas, registros de segurança e transações sujeitas à retenção legal podem permanecer. Cancele as assinaturas ativas e transfira seus servidores antes de excluir.</p>
 <p>Por segurança, faça login novamente se o SG solicitar. A exclusão não poderá ser desfeita.</p>
 <button type="button" id="sg66DeleteButton">Excluir minha conta...</button><p id="sg66DeleteStatus" role="status"></p></section>`;
const el=id=>document.getElementById(id);
const render=async()=>{const u=auth.currentUser;if(!u)return;try{
 const [account,requests]=await Promise.all([getDoc(doc(db,'users',u.uid)),getDocs(query(collection(db,'mentionRequests'),where('toUid','==',u.uid)))]);
 el('sg66MentionPolicy').value=account.data()?.mentionPolicy||'auto';
 const pending=requests.docs.filter(x=>x.data().status==='pending').slice(0,20);
 const list=el('sg66MentionRequests');list.replaceChildren();if(!pending.length){list.textContent='Nenhuma solicitação pendente.';return}
 for(const item of pending){const row=document.createElement('div');row.className='sg66-request-row';const msg=document.createElement('span');msg.textContent=`@${item.data().username} · quer marcar seu perfil`;const actions=document.createElement('span');for(const [text,status] of [['Permitir','approved'],['Recusar','rejected']]){const b=document.createElement('button');b.type='button';b.className='v56-btn';b.textContent=text;b.addEventListener('click',async()=>{b.disabled=true;try{await call('respondMention',{id:item.id,status});await render()}catch(error){el('sg66MentionStatus').textContent=error.message;b.disabled=false}});actions.appendChild(b)}row.append(msg,actions);list.append(row)}
 }catch(e){el('sg66MentionRequests').textContent='Solicitações indisponíveis. Confirme se as Functions e as regras atualizadas estão publicadas.'}};
 async function call(endpoint,data){const u=auth.currentUser;if(!u)throw Error('Entre na sua conta novamente.');const r=await fetch(`${BASE}/${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${await u.getIdToken()}`},body:JSON.stringify(data)});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||`Erro ${r.status}`);return x}
 auth.onAuthStateChanged(u=>{if(u)render()});
 el('sg66SaveMentions').onclick=async()=>{const button=el('sg66SaveMentions');button.disabled=true;try{await updateDoc(doc(db,'users',auth.currentUser.uid),{mentionPolicy:el('sg66MentionPolicy').value});el('sg66MentionStatus').textContent='Preferência salva.'}catch(e){el('sg66MentionStatus').textContent='Não foi possível salvar. Publique as regras do Firestore da V66.'}finally{button.disabled=false}};
 el('sg66DeleteButton').onclick=async()=>{const answer=prompt('Para confirmar, digite exatamente: EXCLUIR MINHA CONTA');if(answer!=='EXCLUIR MINHA CONTA')return;const button=el('sg66DeleteButton');button.disabled=true;el('sg66DeleteStatus').textContent='Processando a solicitação...';try{await call('deleteMyAccount',{confirm:answer});await auth.signOut();location.replace('index.html?account=deleted')}catch(error){el('sg66DeleteStatus').textContent=error.message;button.disabled=false}};
}
