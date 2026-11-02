import {auth,db} from "./firebase.js";
import {doc,serverTimestamp,setDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
const slides=[
  {icon:"👤",eyebrow:"SEU PERFIL",title:"Seu espaço gamer começa aqui",text:"Crie seu perfil, escolha seu @ e controle quem pode encontrar você.",points:["Perfil público ou privado","Bio, avatar, jogos e links","Selos oficiais claramente identificados"]},
  {icon:"🫂",eyebrow:"COMUNIDADE",title:"Encontre sua comunidade",text:"Siga jogadores, envie pedidos de amizade e forme conexões com segurança.",points:["Busca por nome ou @","Pedidos de amizade","Amizade Gamer com aceite dos dois"]},
  {icon:"💬",eyebrow:"CHAT EM TEMPO REAL",title:"Converse do seu jeito",text:"Mensagens, respostas, GIFs, figurinhas e mídia em uma conversa organizada.",points:["Editar em até 2 minutos","Apagar em até 5 minutos","Fotos, vídeo, voz e chamadas entre Amigos Gamers"]},
  {icon:"🎧",eyebrow:"SERVIDORES",title:"Crie sua comunidade",text:"Monte servidores, organize canais e convide pessoas com um código seguro.",points:["Canais personalizados","Convites e integrantes","Moderação do servidor"]},
  {icon:"📸",eyebrow:"PUBLICAÇÕES",title:"Publique do seu jeito",text:"Compartilhe uma ideia, imagem, vídeo ou enquete com a comunidade.",points:["Prévia antes de publicar","Descrição alinhada e responsiva","Denúncia e moderação integradas"]},
  {icon:"🎮",eyebrow:"SUA BIBLIOTECA",title:"Conecte sua Steam",text:"Mostre jogos, horas e conquistas do seu perfil público sem entregar sua senha.",points:["Login oficial pela Steam","Biblioteca sincronizada","Você pode desconectar quando quiser"]},
  {icon:"🔔",eyebrow:"FIQUE POR DENTRO",title:"Notificações e conquistas",text:"Avisos importantes e marcos do perfil ficam em áreas diferentes e fáceis de entender.",points:["Caixa de notificações","Som e vibração configuráveis","Conquistas de seguidores separadas"]},
  {icon:"✨",eyebrow:"TUDO PRONTO",title:"Personalize e jogue",text:"Escolha idioma, tema, cores do chat e preferências de acessibilidade.",points:["Idioma dentro de Configurações","Redução de animações","Preferências salvas no dispositivo"]}
];
let step=0,user=null;
const $=id=>document.getElementById(id);
auth.onAuthStateChanged(current=>user=current);
function paint(){const slide=slides[step];$("tutorialIcon").textContent=slide.icon;$("tutorialEyebrow").textContent=slide.eyebrow;$("tutorialTitle").textContent=slide.title;$("tutorialText").textContent=slide.text;$("tutorialPoints").innerHTML=slide.points.map(point=>`<li>${point}</li>`).join("");$("tutorialDemo").innerHTML=`<strong>${slide.eyebrow}</strong><span>${slide.points[0]}</span>`;$("tutorialNumber").textContent=`${String(step+1).padStart(2,"0")} / ${String(slides.length).padStart(2,"0")}`;$("tutorialProgress").innerHTML=slides.map((_,index)=>`<i class="${index<=step?"active":""}"></i>`).join("");$("tutorialBack").disabled=step===0;$("tutorialNext").textContent=step===slides.length-1?"Entrar no SG":"Continuar"}
async function finish(){localStorage.setItem("sgTutorialSeen","true");if(user)await setDoc(doc(db,"users",user.uid),{welcomeSeen:true,updatedAt:serverTimestamp()},{merge:true}).catch(()=>{});location.assign("feed.html")}
$("tutorialBack").addEventListener("click",()=>{if(step>0){step--;paint()}});
$("tutorialNext").addEventListener("click",()=>{if(step<slides.length-1){step++;paint()}else finish()});
$("tutorialSkip").addEventListener("click",finish);
paint();
