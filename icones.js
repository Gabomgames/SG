/* =========================================
   ICONES
   Um traco so: 24x24, stroke 1.8, ponta redonda, sem preenchimento.
   Tudo em currentColor, entao o icone herda a cor do texto ao lado e
   acompanha o tema sozinho.

   Antes a interface usava emoji (🎮, 🏆, 🔒, 🎙) e caracteres de texto
   (✓, ↗, ♡, ☰, ⌕, ➤) no lugar de icone. Emoji muda de desenho em cada
   sistema operacional e nao aceita cor; os caracteres mudam de tamanho
   conforme a fonte instalada. Nenhum dos dois alinha com o texto.

   O emoji continua existindo onde ele e CONTEUDO: o seletor de emoji
   do chat e a arte das figurinhas.
========================================= */

const TRACOS = {
    parar: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2"/>',
    globo: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4a13 13 0 0 1 0 17.2 13 13 0 0 1 0-17.2Z"/>',
    link: '<path d="M10.4 13.6a3.8 3.8 0 0 0 5.7.4l2.4-2.4a3.8 3.8 0 0 0-5.4-5.4l-1.4 1.4"/><path d="M13.6 10.4a3.8 3.8 0 0 0-5.7-.4l-2.4 2.4a3.8 3.8 0 0 0 5.4 5.4l1.4-1.4"/>',
    bloquear: '<circle cx="12" cy="12" r="8.6"/><path d="M5.9 5.9 18.1 18.1"/>',
    lapis: '<path d="M16.4 3.9a2.2 2.2 0 0 1 3.1 3.1L8.1 18.4l-4.1 1 1-4.1Z"/><path d="M14.8 5.5 18 8.7"/>',
    bandeira: '<path d="M5 20.6V3.8M5 4.6h10.6l-1.6 3.2 1.6 3.2H5"/>',
    sino: '<path d="M18.2 9.6a6.2 6.2 0 1 0-12.4 0c0 6-2.4 7.6-2.4 7.6h17.2s-2.4-1.6-2.4-7.6Z"/><path d="M13.8 20.4a2 2 0 0 1-3.6 0"/>',
    estrela: '<path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/>',
    controle: '<path d="M9.3 8.4h5.4a6.1 6.1 0 0 1 6 5l.5 2.7a2.5 2.5 0 0 1-4.6 1.7l-1.3-2.1H8.7l-1.3 2.1a2.5 2.5 0 0 1-4.6-1.7l.5-2.7a6.1 6.1 0 0 1 6-5Z"/><path d="M8.1 11.5v2.4M6.9 12.7h2.4M15.4 12.1h.01M17.4 14h.01"/>',
    trofeu: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 5.2H5.2A2.8 2.8 0 0 0 8 8M16 5.2h2.8A2.8 2.8 0 0 1 16 8"/><path d="M12 13v4M9.2 20.2h5.6M10.4 17h3.2"/>',
    cadeado: '<rect x="4.6" y="10" width="14.8" height="10.2" rx="2.4"/><path d="M8.4 10V7.2a3.6 3.6 0 0 1 7.2 0V10"/>',
    amigos: '<circle cx="9.2" cy="8" r="3.3"/><path d="M2.8 20v-1.1a4.2 4.2 0 0 1 4.2-4.2h4.4a4.2 4.2 0 0 1 4.2 4.2V20"/><path d="M16.6 5.1a3.3 3.3 0 0 1 0 5.8M21.2 20v-1.1a4.2 4.2 0 0 0-3.1-4"/>',
    microfone: '<rect x="9.2" y="3" width="5.6" height="11" rx="2.8"/><path d="M5.6 11.6a6.4 6.4 0 0 0 12.8 0M12 18v3M9.4 21h5.2"/>',
    camera: '<path d="M2.6 9.6a2 2 0 0 1 2-2h1.9l1.5-2.2h8l1.5 2.2h1.9a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-14.8a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13.6" r="3.3"/>',
    balao: '<path d="M20.6 12.4c0 3.8-3.9 6.9-8.6 6.9-1 0-2-.14-2.9-.4L4.2 20.6l1.5-3.4a6.4 6.4 0 0 1-2.3-4.8c0-3.8 3.9-6.9 8.6-6.9s8.6 3.1 8.6 6.9Z"/>',
    comentario: '<path d="M4.2 5.4h15.6a1.6 1.6 0 0 1 1.6 1.6v8.2a1.6 1.6 0 0 1-1.6 1.6H9.6L5 20.6v-3.8H4.2a1.6 1.6 0 0 1-1.6-1.6V7a1.6 1.6 0 0 1 1.6-1.6Z"/>',
    play: '<path d="M8.4 5.6 18.6 12 8.4 18.4Z"/>',
    coracao: '<path d="M12 20.2S4.4 15.4 4.4 10.4A4.2 4.2 0 0 1 12 7.7a4.2 4.2 0 0 1 7.6 2.7c0 5-7.6 9.8-7.6 9.8Z"/>',
    compartilhar: '<circle cx="18" cy="6" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.3 10.7 15.7 7.2M8.3 13.3l7.4 3.5"/>',
    "seta-esquerda": '<path d="M19.2 12H4.8M10.8 6 4.8 12l6 6"/>',
    "link-externo": '<path d="M14.2 4.2h5.6v5.6M19.8 4.2 11.4 12.6"/><path d="M17.8 13.8V19a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6V7.8A1.6 1.6 0 0 1 5 6.2h5.2"/>',
    expulsar: '<path d="M14.6 4.4h3.8A1.6 1.6 0 0 1 20 6v12a1.6 1.6 0 0 1-1.6 1.6h-3.8"/><path d="M9.6 8.4 13.2 12l-3.6 3.6M13.2 12H3.4"/>',
    entrar: '<path d="M9.4 4.4H5.6A1.6 1.6 0 0 0 4 6v12a1.6 1.6 0 0 0 1.6 1.6h3.8"/><path d="M14.4 8.4 18 12l-3.6 3.6M18 12H8.2"/>',
    responder: '<path d="M9 6.6 3.8 12 9 17.4"/><path d="M3.8 12h9.6a6.4 6.4 0 0 1 6.4 6.4v1"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    lupa: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.6 20.6"/>',
    lixeira: '<path d="M4 6.4h16M9.6 6.4V4.8a1.3 1.3 0 0 1 1.3-1.3h2.2a1.3 1.3 0 0 1 1.3 1.3v1.6"/><path d="M6.4 6.4 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.9-12.6"/><path d="M10.4 10.4v6.2M13.6 10.4v6.2"/>',
    engrenagem: '<circle cx="12" cy="12" r="2.9"/><path d="M18.6 14.5a1.4 1.4 0 0 0 .3 1.5l.1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.8 1.3v.2a1.7 1.7 0 0 1-3.4 0v-.1a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.8h-.2a1.7 1.7 0 0 1 0-3.4h.1a1.4 1.4 0 0 0 1.3-.9 1.4 1.4 0 0 0-.3-1.5l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.4 1.4 0 0 0 1.5.3h.1a1.4 1.4 0 0 0 .8-1.3v-.2a1.7 1.7 0 0 1 3.4 0v.1a1.4 1.4 0 0 0 .9 1.3 1.4 1.4 0 0 0 1.5-.3l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.4 1.4 0 0 0-.3 1.5v.1a1.4 1.4 0 0 0 1.3.8h.2a1.7 1.7 0 0 1 0 3.4h-.1a1.4 1.4 0 0 0-1.3.9Z"/>',
    rosto: '<circle cx="12" cy="12" r="8.4"/><path d="M9.2 10h.01M14.8 10h.01M8.6 14.4a4.4 4.4 0 0 0 6.8 0"/>',
    figurinha: '<path d="M20 4.6V14l-6 6H5.6A1.6 1.6 0 0 1 4 18.4V4.6A1.6 1.6 0 0 1 5.6 3h12.8A1.6 1.6 0 0 1 20 4.6Z"/><path d="M20 14h-4.4A1.6 1.6 0 0 0 14 15.6V20"/>',
    enviar: '<path d="M20.8 3.2 10.4 13.6M20.8 3.2 14.4 20.8l-4-7.2-7.2-4Z"/>',
    chevron: '<path d="M6.4 9.4 12 15l5.6-5.6"/>',
    confere: '<path d="M4.6 12.4 9.6 17.4 19.4 6.6"/>',
    mais: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
    local: '<path d="M12 20.8s6.8-5.6 6.8-10.8a6.8 6.8 0 1 0-13.6 0C5.2 15.2 12 20.8 12 20.8Z"/><circle cx="12" cy="9.8" r="2.6"/>',
    som: '<path d="M4.4 9.2h3.2L12 5.4v13.2L7.6 14.8H4.4Z"/><path d="M15.4 9.4a3.6 3.6 0 0 1 0 5.2M18 7a7 7 0 0 1 0 10"/>',
    mudo: '<path d="M4.4 9.2h3.2L12 5.4v13.2L7.6 14.8H4.4Z"/><path d="M16 10l4.4 4.4M20.4 10 16 14.4"/>',
    copiar: '<rect x="8.4" y="8.4" width="11.6" height="11.6" rx="1.8"/><path d="M15.6 5.6V5A1.6 1.6 0 0 0 14 3.4H5.6A1.6 1.6 0 0 0 4 5v8.4a1.6 1.6 0 0 0 1.6 1.6h.6"/>',
    calendario: '<rect x="3.4" y="5.4" width="17.2" height="15.2" rx="2"/><path d="M3.4 10.2h17.2M8.4 3.4v4M15.6 3.4v4"/>',
    olho: '<path d="M2.4 12s3.7-6.4 9.6-6.4S21.6 12 21.6 12s-3.7 6.4-9.6 6.4S2.4 12 2.4 12Z"/><circle cx="12" cy="12" r="3"/>'
};

/** Devolve o SVG do icone, em texto, pronto para entrar no HTML. */
export function icone(nome, tamanho = 18) {
    const tracos = TRACOS[nome];
    if (!tracos) return "";
    return `<svg class="ico" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${tracos}</svg>`;
}

/** O coracao cheio, para quando a pessoa ja curtiu. */
export function coracaoCheio(tamanho = 18) {
    return `<svg class="ico" viewBox="0 0 24 24" width="${tamanho}" height="${tamanho}" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRACOS.coracao}</svg>`;
}

export const NOMES = Object.keys(TRACOS);
