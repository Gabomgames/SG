import { auth, db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { api } from './api-client.js';
import {activeFounder,verificationCopy} from './verification-view.js';
const $=id=>document.getElementById(id),plans={monthly:{price:'14,90',days:30},semiannual:{price:'79,90',days:180},annual:{price:'149,90',days:365}};
let user,selected='monthly',requestKey=null,busy=false;
function toast(text){$('appToast').textContent=text;$('appToast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('appToast').classList.remove('show'),5000)}
function paintPlan(){document.querySelectorAll('.sg-plan').forEach(b=>{b.classList.toggle('active',b.dataset.plan===selected);b.setAttribute('aria-pressed',String(b.dataset.plan===selected))});$('payVerification').textContent=`Comprar ${plans[selected].days} dias · R$ ${plans[selected].price}`}
function paintStatus(v={}){
 const expired=v.expiresAt&&(v.expiresAt.toMillis?.()||v.expiresAt)<=Date.now(),status=v.status==='active'&&expired?'expired':v.status||'none';
 const copy={active:['Verificação ativa','Seu perfil foi aprovado. Consulte a validade abaixo.'],pending:['Pagamento confirmado · em análise','Pagamento não aprova identidade automaticamente. Aguarde a decisão da equipe.'],payment_pending:['Aguardando pagamento','O retorno do checkout não comprova pagamento.'],suspended:['Verificação suspensa','Consulte o suporte sobre cancelamento, estorno ou análise.'],rejected:['Solicitação não aprovada','Consulte o suporte para o motivo e as condições de reembolso.'],expired:['Verificação expirada','Você pode solicitar um novo período, sujeito à análise.'],none:['Ainda não verificado','Compra avulsa. Não há renovação automática.']};
 const [title,text]=verificationCopy(status,v,copy[status]||copy.none);$('verificationStatusTitle').textContent=title;$('verificationStatus').textContent=text+(v.expiresAt?` Validade: ${new Date(v.expiresAt.toMillis?.()||v.expiresAt).toLocaleDateString('pt-BR')}.`:'');
 $('verificationStatusCard').className=`verification-status-card ${status==='active'?'active':['pending','payment_pending'].includes(status)?'pending':''}`;$('payVerification').hidden=['active','pending'].includes(status);$('cancelVerification').hidden=true;
}
async function refresh(silent=false){
 if(busy||!user)return;busy=true;$('syncVerification').disabled=true;let profile;
 try{const snap=await getDoc(doc(db,'users',user.uid));profile=snap.data();paintStatus(profile?.verification||{});
 const result=await api('/payments/list'),row=result.orders.find(x=>x.status==='approved'&&x.review==='approved'&&x.expiresAt>Date.now())||result.orders[0];
 if(row?.orderId){const live=await api('/payments/status',{orderId:row.orderId},{retries:1});if(!activeFounder(profile))paintStatus({status:live.status==='approved'?(live.review==='approved'?'active':live.review==='rejected'?'rejected':'pending'):live.status==='revoked'?'suspended':live.status==='cancelled'?'none':'payment_pending',expiresAt:live.expiresAt});if(live.approved){requestKey=null;sessionStorage.removeItem(`sgPaymentAttempt:${user.uid}:${live.plan}`)}}
 if(!silent)toast('Status consultado no servidor.');
 }catch(error){if(!silent)toast(error.message);if(!activeFounder(profile)&&['PAYMENT_STORAGE_NOT_CONFIGURED','PAYMENTS_NOT_CONFIGURED'].includes(error.code)){$('verificationStatusTitle').textContent='Pagamentos em preparação';$('verificationStatus').textContent='Novas compras aguardam configuração e testes. Nenhuma cobrança foi iniciada.'}}
 finally{busy=false;$('syncVerification').disabled=false}
}
document.querySelectorAll('.sg-plan').forEach(b=>b.addEventListener('click',()=>{if(selected!==b.dataset.plan)requestKey=null;selected=b.dataset.plan;paintPlan()}));
$('payVerification').addEventListener('click',async()=>{
 const button=$('payVerification');button.disabled=true;button.textContent='Preparando checkout…';requestKey ||= crypto.randomUUID();const key=`sgPaymentAttempt:${user.uid}:${selected}`;requestKey=sessionStorage.getItem(key)||requestKey;sessionStorage.setItem(key,requestKey);
 try{const out=await api('/payments/create',{plan:selected,idempotencyKey:requestKey},{retries:1});const url=new URL(out.checkoutUrl);if(url.protocol!=='https:'||!['www.mercadopago.com.br','sandbox.mercadopago.com.br'].includes(url.hostname))throw new Error('Checkout inválido.');location.assign(url.href)}catch(error){toast(error.message);button.disabled=false;paintPlan()}
});
$('syncVerification').addEventListener('click',()=>refresh());
auth.onAuthStateChanged(async u=>{if(!u)return location.replace('login.html');user=u;paintPlan();await refresh(true);if(new URLSearchParams(location.search).has('payment')){history.replaceState({},'',location.pathname);toast('Você voltou do checkout. Consultando confirmação do servidor.');await refresh()}});
