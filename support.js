import {auth,db} from './firebase.js';
import {addDoc,collection,getDocs,query,where,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
const form=document.getElementById('supportForm'),status=document.getElementById('supportStatus'),category=document.getElementById('supportCategory');let user=null;
auth.onAuthStateChanged(current=>{if(!current){location.replace('login.html?return=support.html');return}user=current;});
category?.addEventListener('change',()=>{document.getElementById('supportAppealHelp').hidden=category.value!=='appeal'});
if(new URLSearchParams(location.search).get('action')==='appeal'){
 category.value='appeal';document.getElementById('supportAppealHelp').hidden=false;
 document.querySelector('[data-support-tab="contact"]')?.click();
}
form?.addEventListener('submit',async event=>{
 event.preventDefault();if(!user)return;
 const button=form.querySelector('[type="submit"]');button.disabled=true;button.textContent='Enviando...';status.textContent='';
 try{
  const title=document.getElementById('supportTitle').value.trim(),message=document.getElementById('supportMessage').value.trim(),kind=category.value;
  if(title.length<3||message.length<10)throw new Error('Escreva um assunto e uma explicação mais detalhados.');
  if(kind==='appeal'){
   const snap=await getDocs(query(collection(db,'sanctions'),where('targetUid','==',user.uid)));
   const candidates=snap.docs.filter(d=>!d.data().revoked).sort((a,b)=>(b.data().createdAt?.seconds||0)-(a.data().createdAt?.seconds||0));
   const latest=candidates[0];if(!latest)throw new Error('Não encontramos uma punição ativa vinculada à sua conta. Use o assunto “Conta e acesso”.');
   await addDoc(collection(db,'supportTickets'),{uid:user.uid,category:'appeal',title,message,status:'open',sanctionId:latest.id,caseNumber:latest.data().caseNumber||latest.id,reasonType:latest.data().ruleId||'other',evidence:[],createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  }else{
   await addDoc(collection(db,'supportTickets'),{uid:user.uid,email:user.email||'',category:kind,title,message,status:'open',createdAt:serverTimestamp()});
  }
  form.reset();document.getElementById('supportAppealHelp').hidden=true;status.textContent='Solicitação recebida. A equipe poderá acompanhar pelo painel.';status.className='success-message';
 }catch(error){console.error(error);status.textContent=error.message||'Não foi possível enviar. Verifique sua conexão.';status.className='error-message';}
 finally{button.disabled=false;button.textContent='Enviar solicitação';}
});
