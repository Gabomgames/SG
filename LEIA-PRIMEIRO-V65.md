# Something Gamer — V65 · UI Foundation (01/11/2026)

Esta é a **primeira atualização de experiência da V65**, baseada nos arquivos da V64 fornecida pelo proprietário. **Não é um lançamento de produção homologado**. O código original de contas, Firebase, Marketplace, Now Call e NOW ADS foi preservado, salvo as alterações pontuais listadas abaixo.

## O que mudou nesta entrega

- Home (`index.html`) mais curta, direta e profissional, sem animações e sem o pôr do sol como destaque; layout testado em desktop e celular.
- Menu unificado entre Feed, Explorar, Servidores, Now Call, Market, NOW ADS, Perfil e Configurações, com navegação inferior no celular. A tela de NOW ADS mantém o menu de gerenciamento próprio.
- Tokens visuais com fundos neutros, bordas discretas, botões consistentes e conteúdo em destaque. Camada `sg-v65-ui.css` concentrando mudanças sem remover as bibliotecas antigas, para reduzir risco de regressão imediata.
- Chat com **mensagens recebidas à esquerda e enviadas à direita**. A lógica de mensagens e histórico do Firebase não foi substituída.
- Ação de **sair do servidor** para participantes que não sejam o proprietário, com confirmação e regra Firestore limitada à remoção do próprio UID.
- Convites de amigos ao criar servidor passam a ser convites que precisam ser aceitos, não inclusão automática de membros. O dono não pode acrescentar membros sem aceite por simples atualização da lista.
- Links de entrada **para servidores públicos** pedem confirmação antes da entrada; um servidor privado exige convite individual válido. **Links privados com token, expiração, limite de usos e revogação ainda precisam de API segura.**
- Paleta do NOW ADS e telas de login/cadastro harmonizadas com o SG.
- Servidor local incluído (`npm run dev`) sem dependências para visualizar os arquivos no VS Code.
- Cache público do service worker atualizado. Dados privados não entram no Cache API.

## Como abrir no Windows / VS Code

1. Extraia o ZIP e abra a pasta `Something-Gamer-V65` no VS Code.
2. Instale **Node.js 24.12+**, pois dependências atuais do Firebase exigem versão recente. Verifique com `node -v`.
3. Em um terminal dentro da pasta, execute `npm run dev`.
4. No navegador, acesse **http://localhost:5173**.
5. Para instalar as dependências e construir o pacote de publicação: `npm ci` e `npm run build`. Para desenvolver/deployar as Cloud Functions, execute também `cd functions` e `npm ci` dentro dessa pasta.
6. Para realizar verificações: `npm run test:v65`; os testes gerais estão em `npm test` (com as dependências instaladas).

**Atenção:** login/cadastro reais, consulta a publicações e demais dados dependem do projeto Firebase, regras, App Check e domínio autorizado. Abrir apenas o HTML como `file://` pode quebrar módulos e autenticação. Uma página renderizar localmente **não significa** que o backend de produção esteja configurado.

## Verificações realizadas neste ambiente

- `node --check chat.js`, `node --check sg-v65-shell.js`, `node --check scripts/dev-server.mjs`: sem erro de sintaxe.
- `node --test tests/unit.test.js tests/features.test.js tests/market.test.js tests/worker.test.js`: **73/73 passaram** com Node.js 22.
- `node --test tests/v65-ui.test.mjs`: **19/19 passaram** (verificações estruturais estáticas).
- Renderização visual da home desktop 1440 px e mobile 390 px; no mobile não foi detectada rolagem horizontal.
- Simulação em navegador confirmou o lado direito para mensagem própria e esquerdo para recebida.
- `npm ci` não finalizou neste ambiente (timeout da instalação e aviso de Node.js 22 abaixo do requisito de algumas dependências); por isso **npm run build, testes com emulador, E2E autenticado, voz/vídeo reais e deploy não foram homologados**.

## Pendências prioritárias antes de dizer que a plataforma está pronta

1. **P0 — Firebase:** autenticação, fluxo de cadastro, permissões, regras, convites privados e políticas de dados devem ser testados com emuladores/contas de teste, inclusive entradas negadas.
2. **P0 — Market:** pagamentos, split, cancelamentos, estorno, disputa e segurança dos vendedores devem ter confirmação externa e políticas aplicáveis antes do checkout público.
3. **P0 — NOW ADS:** só aceitar campanhas, cobrança e métricas depois de revisão, processamento real, proteção contra fraude e conformidade com privacidade de menores.
4. **P1 — Now Call:** testar WebRTC, TURN/SFU, reconexão, acesso a voz, grupos, latência e dispositivos; **não há garantia de 25 participantes** sem infraestrutura configurada.
5. **P1 — UI:** aposentar as folhas de estilo V50–V64 gradualmente, substituindo componentes antigos por design system único; hoje a V65 usa CSS de compatibilidade.
6. **P1 — UX:** validar Social, perfil, buscas, notificações, fluxo mobile, uploads e serviços em navegadores e dispositivos reais.

Não alteramos cobrança real, chaves, contas administrativas, domínio, infraestrutura ou dados publicados. A V64 de origem permanece intacta fora deste ZIP.


## Pacote COMPLETO (restauração da distribuição original)

Este ZIP preserva todos os arquivos de código-fonte da V64 e inclui a camada de interface da V65.
Também contém as dependências instaladas em `functions/node_modules`, a pasta `dist` e o backup enviado junto à V64.
O ZIP ficou maior principalmente por incluir dependências e backups; **isso não é medida de qualidade ou de recursos novos**.

### Atenção para a pasta dist/

A pasta `dist/` incluída aqui é uma **cópia estática de pré-visualização da V65**,
gerada sem a etapa de empacotamento/minificação do esbuild. É destinada a conferir os
arquivos e a navegação; não foi homologada para deploy.
**Antes de publicar**, configure Node.js compatível, execute `npm ci`, `npm run verificar`,
`npm test` e `npm run build` para recriar uma pasta `dist/` de produção.
Execute `npm ci` também em `functions/` antes de publicar as Cloud Functions.

Para desenvolvimento local, use `npm run dev` na pasta principal.
O funcionamento online de contas, ligações, pagamentos e campanhas depende de
serviços externos e de testes com configurações válidas.


## V65.1 — Correções dos defeitos enviados em capturas

A V65.1 corrige a duplicação do feed: o módulo Now Social antigo, que chamava a rota `/social/list` no Worker, foi removido **somente do feed** para não mostrar "Rota não encontrada". O feed de publicações do Firestore permanece. **Isso não habilita Stories de 24 horas nem Reels**; essas ferramentas precisam de API e armazenamento validados antes de serem ativadas.

Uma folha `sg-v651-repair.css` foi adicionada por último nas páginas afetadas, corrigindo limites de largura, menu, janela de criar servidor, feed, perfil, formulário de edição e uma apresentação mais compacta das conquistas. O sistema de convites e chamadas permanece sob as mesmas restrições dos serviços anteriores.

O painel ADMIN continua **dependente da custom claim Firebase `admin: true` e do Worker /adminApi**. Uma falha dessas integrações não pode ser resolvida mexendo só na interface. O painel agora mostra uma mensagem diagnóstica em vez de afirmar sem evidência que o UID é errado. Veja `CONFIGURAR-ADMIN-SEGURO-V58.2.md`. Não coloque credenciais de service account em arquivos públicos.

### Como testar corretamente

1. Extraia o novo ZIP em pasta separada, em vez de abrir HTML com Live Server ou `file://`.
2. Na pasta Something-Gamer-V65, execute `npm run dev`.
3. Abra `http://localhost:5173` no navegador. Para conta real, use os domínios autorizados do Firebase; localhost pode exigir inclusão em Authorized Domains e App Check de desenvolvimento.
4. Teste feed, perfil, editar perfil, Now Call e modal do servidor, em 1440px e 390px.
5. Para ADMIN, confira no Console do navegador o código exibido pelo painel. Se faltar a custom claim, configure-a pelo backend segundo a documentação.

### Limites da verificação

Foram executados testes de JS e verificações estruturais locais. Neste ambiente o navegador automatizado bloqueou acesso às páginas, então os layouts e as chamadas com Firebase / Worker **não foram homologados visualmente ou ponta a ponta**. Não publique como produção sem esses testes.
