import {auth} from './firebase.js';import {api} from './api-client.js';
function context(){try{const c=JSON.parse(sessionStorage.getItem('nowAdVisit')||'null');return c&&c.expiresAt>Date.now()?c:null;}catch{return null;}}
export async function recordNowEvent(kind){const c=context();if(!c||!auth.currentUser)return;try{await api('/ads/event',{deliveryId:c.deliveryId,kind});}catch{}}
auth.onAuthStateChanged(user=>{if(user&&context())recordNowEvent('landing_view');});document.addEventListener('sg:ads-event',e=>{if(['engagement','add_to_cart','video_complete'].includes(e.detail?.kind))recordNowEvent(e.detail.kind);});
