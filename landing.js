/* =========================================
   LANDING
   Duas coisas pequenas, só na home.

   1. O menu marca em qual faixa você está enquanto rola.
   2. Depois de clicar num item, o "#events" sai da barra de endereço,
      para o botão Voltar do navegador não virar uma fila de âncoras.

   A rolagem suave em si é do CSS (scroll-behavior: smooth, mais
   scroll-margin-top para o cabeçalho fixo não cobrir o título da faixa).
   Está lá de propósito: quem pediu "reduzir movimento" no sistema
   continua sem animação, e um script que forçasse a rolagem passaria
   por cima dessa escolha.
========================================= */

const elos = [...document.querySelectorAll('nav a[href^="#"], .porta a[href^="#"]')];
const faixas = [...document.querySelectorAll(".publico[id]")];

if (elos.length && faixas.length) {

    const LINHA_DO_CABECALHO = 96;

    /** A faixa que está sob a linha logo abaixo do cabeçalho fixo. */
    function faixaAtual() {
        if (scrollY < 120) return "";
        let escolhida = "";
        for (const faixa of faixas) {
            const caixa = faixa.getBoundingClientRect();
            if (caixa.top <= LINHA_DO_CABECALHO && caixa.bottom > LINHA_DO_CABECALHO) escolhida = faixa.id;
        }
        // no fim da página a última faixa pode não alcançar a linha
        const noFim = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
        if (!escolhida && noFim) escolhida = faixas[faixas.length - 1].id;
        return escolhida;
    }

    function marcar() {
        const id = faixaAtual();
        for (const elo of elos) {
            const desteElo = id !== "" && elo.getAttribute("href") === `#${id}`;
            elo.classList.toggle("atual", desteElo);
            if (desteElo) elo.setAttribute("aria-current", "true");
            else elo.removeAttribute("aria-current");
        }
        return id;
    }

    // sem throttle: o navegador ja limita o evento de rolagem a um por
    // quadro, e marcar() so mede tres elementos
    marcar();
    addEventListener("scroll", marcar, { passive: true });
    addEventListener("resize", marcar, { passive: true });

    // deixa a barra de endereço limpa depois que a rolagem termina
    for (const elo of elos) {
        elo.addEventListener("click", () => {
            setTimeout(() => {
                history.replaceState(null, "", location.pathname + location.search);
            }, 800);
        });
    }
}
