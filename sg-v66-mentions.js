/** Accessible mention suggestions for public accounts; backend enforces notification/approval. */
import {db} from './firebase.js';
import {collection,getDocs,query,where,orderBy,startAt,endAt,limit} from 'https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js';
let pop,field,active='',sequence=0;
const eligible=e=>e?.matches?.('#postDescription,#postTitle,#messageInput,.feed-comment-input');
const hide=()=>{pop?.remove();pop=null;field=null};
function mentionAt(input){const before=input.value.slice(0,input.selectionStart);const m=before.match(/(?:^|\s)@([\p{L}\p{N}_.]{2,24})$/u);return m?.[1]?.toLowerCase()||''}
function choose(handle){if(!field)return;const pos=field.selectionStart,before=field.value.slice(0,pos),after=field.value.slice(pos);const next=before.replace(/(^|\s)@[\p{L}\p{N}_.]{2,24}$/u,(_,start)=>start+'@'+handle+' ');field.value=next+after;field.focus();field.setSelectionRange(next.length,next.length);field.dispatchEvent(new Event('input',{bubbles:true}));hide()}
async function update(input){const prefix=mentionAt(input);if(!prefix){hide();return;}const tick=++sequence;field=input;
 try{const snap=await getDocs(query(collection(db,'publicProfiles'),where('visibility','==','public'),orderBy('username'),startAt(prefix),endAt(prefix+'\uf8ff'),limit(5)));if(sequence!==tick||field!==input)return;
 const accounts=snap.docs.map(x=>x.data()).filter(x=>x.username?.toLowerCase().startsWith(prefix));if(!accounts.length){hide();return}
 if(!pop){pop=document.createElement('div');pop.className='sg66-mention-suggestions';pop.setAttribute('role','listbox');document.body.appendChild(pop)}pop.replaceChildren();const rect=input.getBoundingClientRect();pop.style.left=Math.max(8,Math.min(window.innerWidth-282,rect.left))+'px';pop.style.top=Math.min(window.innerHeight-50,rect.bottom+6)+'px';
 for(const x of accounts){const b=document.createElement('button');b.type='button';b.className='sg66-mention-option';b.setAttribute('role','option');b.textContent=`@${x.username} · ${x.name||'Jogador'}`;b.addEventListener('pointerdown',e=>{e.preventDefault();choose(x.username)});pop.append(b)}
 }catch{hide();}}
let timer;document.addEventListener('input',e=>{if(!eligible(e.target))return;clearTimeout(timer);timer=setTimeout(()=>update(e.target),210)});
document.addEventListener('keydown',e=>{if(!pop)return;if(e.key==='Escape')hide();if(e.key==='Enter'&&eligible(e.target)&&pop.firstChild){e.preventDefault();pop.firstChild.click()}});
document.addEventListener('pointerdown',e=>{if(pop&&!pop.contains(e.target)&&e.target!==field)hide()});
