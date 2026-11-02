// Saneamento de HTML e de URL, em um lugar só.
//
// Existe porque cada arquivo tinha a sua própria função de escape, todas
// iguais e todas com o mesmo furo: escapam < > " ' & mas deixam passar o
// esquema da URL. Como "javascript:alert(1)" não tem nenhum desses
// caracteres, ele atravessava o escape inteiro e virava XSS ao clicar no
// link. O escape resolve o HTML; quem resolve a URL é o urlSegura().

const MAPA = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapa texto para ir dentro de HTML ou de atributo. */
export const escaparHtml = valor => String(valor ?? "").replace(/[&<>"']/g, c => MAPA[c]);

/**
 * URL para href de link. Devolve "" para qualquer coisa que não seja
 * http(s). Isso barra javascript:, data:, vbscript: e blob:.
 * Um href vazio não navega e não executa nada.
 */
export function urlSegura(valor) {
    const bruto = String(valor ?? "").trim();
    if (!bruto) return "";
    try {
        const url = new URL(bruto, location.origin);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
        return "";
    }
}

/**
 * URL para src de imagem, vídeo ou áudio. Aceita http(s) e data: de mídia
 * (as figurinhas do SG são data:image/svg+xml e os áudios gravados são
 * data:audio/...). SVG dentro de <img> não executa script, por isso passa.
 */
export function urlDeMidia(valor) {
    const bruto = String(valor ?? "").trim();
    if (!bruto) return "";
    if (/^data:(image|audio|video)\/[a-z0-9.+-]+[,;]/i.test(bruto)) return bruto;
    return urlSegura(bruto);
}

/** Atalho: escapa a URL de link já saneada, pronta para ir no atributo. */
export const hrefSeguro = valor => escaparHtml(urlSegura(valor));

/** Atalho: escapa a URL de mídia já saneada, pronta para ir no atributo. */
export const srcSeguro = valor => escaparHtml(urlDeMidia(valor));
