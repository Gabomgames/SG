// Limite de frequência de escrita, valendo no servidor.
//
// O Firestore não tem rate limiting embutido, e sem isso um script posta em
// laço: o feed vira lixo e a fila de denúncias do painel entope. O truque
// suportado é este: a escrita e o carimbo de tempo vão no MESMO lote, e a
// regra exige o carimbo com getAfter(). Como a regra confere que o carimbo
// novo é igual a request.time e que o anterior é mais velho que a janela,
// não adianta o cliente mentir nem pular o carimbo: sem carimbo a regra
// recusa, e com carimbo repetido ela recusa também.
//
// Documento: limites/{uid}, um campo por ação.

import { db } from "./firebase.js";
import { doc, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/**
 * Escreve um documento junto com o carimbo da ação, em lote único.
 *
 * @param {string} uid        quem está escrevendo
 * @param {string} chave      nome da ação ("post", "comentario", "denuncia")
 * @param {object} destino    DocumentReference onde gravar
 * @param {object} dados      conteúdo do documento
 */
export async function escreverComLimite(uid, chave, destino, dados) {
    const lote = writeBatch(db);
    lote.set(destino, dados);
    lote.set(doc(db, "limites", uid), { [chave]: serverTimestamp() }, { merge: true });
    await lote.commit();
}

/** Mensagem única para quando a regra recusa por frequência. */
export function mensagemDeLimite(erro, acao = "isso") {
    if (erro?.code !== "permission-denied") return null;
    return `Você fez ${acao} agora há pouco. Espere alguns segundos e tente de novo.`;
}
