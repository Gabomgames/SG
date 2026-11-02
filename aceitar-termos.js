import { auth, db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { hasAcceptedCurrentLegal, legalAcceptance, safeReturnTarget } from "./legal.js";
import { validateBirthDate } from "./safety.js";

const message = document.getElementById("legalMessage");
const consent = document.getElementById("legalConsent");
const button = document.getElementById("acceptLegal");
const birthWrap = document.getElementById("legacyBirthWrap");
const birthInput = document.getElementById("legalBirthDate");
const destination = safeReturnTarget(new URLSearchParams(location.search).get("return"), "feed.html");
let user = null; let existing = null;
function show(text, type="error"){message.textContent=text;message.className=`auth-message ${type}`}
function configureBirth(){const latest=new Date(), earliest=new Date();latest.setFullYear(latest.getFullYear()-13);earliest.setFullYear(earliest.getFullYear()-120);birthInput.max=latest.toISOString().slice(0,10);birthInput.min=earliest.toISOString().slice(0,10)}
configureBirth();

auth.onAuthStateChanged(async current=>{
  if(!current){location.replace(`login.html?return=${encodeURIComponent(destination)}`);return}
  user=current;const snap=await getDoc(doc(db,"users",current.uid));existing=snap.exists()?snap.data():null;
  if(existing && hasAcceptedCurrentLegal(existing)){location.replace(destination);return}
  birthWrap.hidden=Boolean(existing);
});

button.addEventListener("click",async()=>{
  if(!user)return; if(!consent.checked)return show("Marque a confirmação para continuar.");
  button.disabled=true;
  try{
    const legal=legalAcceptance(serverTimestamp);
    if(existing){
      await updateDoc(doc(db,"users",user.uid),{legal,updatedAt:serverTimestamp()});
    }else{
      const birth=validateBirthDate(birthInput.value,13); if(!birth.ok)throw new Error(birth.message);
      await setDoc(doc(db,"users",user.uid),{uid:user.uid,email:user.email||"",birthDate:birth.birthDate,ageVerified:true,accountCreatedAt:serverTimestamp(),updatedAt:serverTimestamp(),profileCompleted:false,username:"",name:"",bio:"",photoURL:"",games:[],twitch:"",youtube:"",steam:"",level:1,xp:0,followers:0,following:0,legal});
    }
    show("Termos registrados.","success");location.replace(destination);
  }catch(error){console.error(error);show(error.message||"Não foi possível registrar a aceitação.");button.disabled=false}
});
document.getElementById("legalLogout").addEventListener("click",async()=>{await signOut(auth);location.replace("login.html")});
