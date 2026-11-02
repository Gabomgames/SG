/** Compositor do feed V69: usa as mesmas coleções, moderação e limites do perfil. */
import { auth, db } from './firebase.js';
import { collection, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
import { APP_CONFIG } from './config.js';
import { escreverComLimite, mensagemDeLimite } from './limites.js';
import { assertModeratedPublicText, assertModeratedImageUrl } from './moderation.js';
import { prepareImage, uploadMedia } from './media-upload.js';
import {validatePollOptions} from './poll-domain.js';
const $ = id => document.getElementById(id);
const dialog=$('sg69Composer'), form=$('sg69ComposerForm');
let kind='text', previewUrl='';
const supported={image:['image/jpeg','image/png','image/webp','image/gif'],video:['video/mp4','video/webm','video/quicktime']};
function error(text=''){ $('sg69ComposerError').textContent=text; }
function notify(text,type='success') {const target=$('appToast');if(!target)return;target.textContent=text;target.dataset.type=type;target.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>target.classList.remove('show'),5000);}
function clearPreview(){if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}const target=$('sg69FilePreview');target.replaceChildren();target.hidden=true;}
function choose(type){kind=type;error('');clearPreview();$('sg69File').value='';$('sg69FileField').hidden=!['image','video'].includes(type);$('sg69PollField').hidden=type!=='poll';$('sg69File').accept=type==='image'?supported.image.join(','):supported.video.join(',');form.querySelectorAll('[data-compose-type]').forEach(b=>{const selected=b.dataset.composeType===type;b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));});}
function open(type='text'){if(!auth.currentUser){location.assign('login.html');return;}form.reset();choose(type);if(!dialog.open)dialog.showModal();$('sg69Caption').focus();}
document.querySelectorAll('[data-open-composer]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.openComposer)));
form.querySelectorAll('[data-compose-type]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.composeType)));
form.querySelector('[data-close-composer]').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
dialog.addEventListener('close',clearPreview);
$('sg69File').addEventListener('change',()=>{
  clearPreview();error('');const file=$('sg69File').files?.[0];if(!file)return;
  if(!supported[kind]?.includes(file.type)){error('Escolha uma mídia compatível com o tipo selecionado.');return;}
  if(file.size>APP_CONFIG.maxPostFileSize){error('Arquivo maior que 20 MB. Selecione um arquivo menor.');return;}
  previewUrl=URL.createObjectURL(file);
  const preview=$('sg69FilePreview'),media=document.createElement(kind==='image'?'img':'video');
  media.src=previewUrl;if(kind==='image')media.alt='Prévia da imagem';else{media.controls=true;media.preload='metadata';}
  const info=document.createElement('small');info.textContent=`${file.name} · ${(file.size/1048576).toFixed(1)} MB`;
  preview.append(media,info);preview.hidden=false;
});
form.addEventListener('submit',async e=>{
  e.preventDefault();error('');const button=$('sg69Publish'),user=auth.currentUser;if(!user)return error('Faça login antes de publicar.');
  const description=$('sg69Caption').value.trim(),rawTitle=$('sg69Title').value.trim();const file=$('sg69File').files?.[0];
  const polls=[...form.querySelectorAll('[data-poll-option]')].map(i=>i.value.trim()).filter(Boolean);
  if(kind==='text'&&!description)return error('Escreva uma mensagem para publicar.');
  if(['image','video'].includes(kind)&&(!file||!supported[kind].includes(file.type)))return error(kind==='image'?'Selecione uma foto válida.':'Selecione um vídeo válido.');
  if(file?.size>APP_CONFIG.maxPostFileSize)return error('O limite por arquivo é 20 MB.');
  if(kind==='poll'){try{validatePollOptions(polls);}catch(reason){return error(reason.message);}}
  button.disabled=true;button.textContent='Preparando publicação…';
  try {
    const [title,content]=await Promise.all([
      rawTitle?assertModeratedPublicText(rawTitle,{field:'O título',min:2,max:90}):Promise.resolve(''),
      description?assertModeratedPublicText(description,{field:'A publicação',min:2,max:2000}):Promise.resolve('')
    ]);
    let uploaded={url:'',mediaId:'',file};
    if(file){button.textContent='Enviando mídia…';const ready=kind==='image'?await prepareImage(file):file;uploaded={...await uploadMedia(ready,{scope:'public',maxBytes:APP_CONFIG.maxPostFileSize,label:kind==='image'?'imagem':'vídeo'}),file:ready};if(uploaded.url&&ready.type.startsWith('image/'))await assertModeratedImageUrl(uploaded.url);}
    button.textContent='Publicando…';
    if(auth.currentUser?.uid!==user.uid)throw new Error('A sessão expirou. Entre novamente.');
    // Perfil deve vir do documento autorizado, nunca de entrada arbitrária.
    const {getDoc}=await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
    const userDoc=await getDoc(doc(db,'users',user.uid));const profile=userDoc.data()||{};
    await escreverComLimite(user.uid,'post',doc(collection(db,'posts')),{uid:user.uid,authorName:profile.name||profile.username||'Gamer',authorUsername:profile.username||'',authorPhoto:profile.photoURL||'',type:kind,title:title||(kind==='text'?'':`Publicação de ${profile.name||profile.username||'Gamer'}`),description:content,tags:$('sg69Tags').value.split(/[ ,]+/).map(x=>x.replace(/^#/,'').trim()).filter(Boolean).slice(0,10),pollOptions:kind==='poll'?polls:[],mediaUrl:uploaded.url||'',mediaType:uploaded.file?.type||'',mediaId:uploaded.mediaId||'',authorVerified:profile.verification?.status==='active',authorAccountType:profile.accountType||'gamer',authorBadgeTheme:profile.verificationBadgeTheme||'blue',authorBadges:profile.badges||{},createdAt:serverTimestamp()});
    dialog.close();form.reset();notify('Publicação criada com sucesso.','success');
  }catch(e){console.error(e);error(mensagemDeLimite(e,'uma publicação')||e.message||'Não foi possível publicar.');}
  finally{button.disabled=false;button.textContent='Publicar no feed →';}
});
