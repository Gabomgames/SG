// Ações de moderação usadas pelo painel admin (V58).
// Rodam sob as regras do Firestore: só quem tem o claim `admin` (ou o UID
// autorizado nas regras) consegue gravar aqui. Nada é apagado: reverter uma
// punição marca a original como revogada, com quem, quando e por quê.
import { db } from "./firebase.js";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export const RULES = [
  ["harassment", "Assédio, bullying ou perseguição"],
  ["hate", "Discurso de ódio ou discriminação"],
  ["violence", "Ameaças ou incentivo à violência"],
  ["sexual", "Conteúdo sexual ou envolvendo menores"],
  ["scam", "Golpe, fraude ou spam"],
  ["cheating", "Trapaça, venda de contas ou fraude em jogos"],
  ["impersonation", "Falsa identidade ou uso indevido de selos"],
  ["privacy", "Vazamento de dados pessoais"],
  ["other", "Outra violação das regras da comunidade"]
];
export const ruleLabel = id => (RULES.find(r => r[0] === id) || RULES[RULES.length - 1])[1];

import {api} from './api-client.js';
function dates(value){if(!value||typeof value!=='object')return value;if(typeof value.seconds==='number')return {...value,toMillis:()=>value.seconds*1000};if(Array.isArray(value))return value.map(dates);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,dates(v)]));}
export async function applySanction(actor,payload){return api('/adminApi',{action:'applySanction',...payload});}
export async function revokeSanction(actor,sanctionId,reason){return api('/adminApi',{action:'revokeSanction',sanctionId,reason});}
export async function changeSuspension(actor,sanctionId,durationHours,reason){return api('/adminApi',{action:'changeSuspension',sanctionId,durationHours,reason});}
export async function listSanctions(uid){const out=await api('/adminApi',{action:'list',collection:'sanctions'});return dates(out.items.filter(x=>x.targetUid===uid));}
export async function listAppeals(){const out=await api('/adminApi',{action:'list',collection:'supportTickets'});return dates(out.items.filter(x=>x.category==='appeal'));}
export async function decideAppeal(actor,ticket,status,message){return api('/adminApi',{action:'decideAppeal',ticketId:ticket.id,status,message});}
