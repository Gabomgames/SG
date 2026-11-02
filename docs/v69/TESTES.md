# Estratégia e testes preparados

## Executar a base nova

No checkout `/workspace/something-gamer`, com Node disponível:

```bash
export SG_V69_ROOT=/workspace/review-v69/Something-Gamer-V69
node --test tests/v69-audit/contracts.test.mjs tests/v69-audit/dev-server.test.mjs
```

Executado nesta sessão: seis testes passaram. O teste HTTP inicia um servidor real e o encerra ao terminar; não inicializa Firebase. Os testes financeiros importam funções puras com dados de fixture, sem iniciar cobrança ou chamar provedor. Eles cobrem todos os preços/prazos oficiais, divergências de valor/prazo/recebedor/moeda, confirmação incompleta, estorno terminal e destinos de checkout.

Dois testes adicionais em `firestore-boundaries.test.mjs` foram preparados, com sintaxe validada, mas **não executados**. Usam `demo-sg-audit`, emulador local obrigatório, dados sintéticos e esperam rejeição de voto fora do intervalo e enquete inválida. São expectativas de segurança, não testes artificialmente verdes. No baseline, a inspeção das regras indica que devem falhar; só a execução poderá confirmar isso.

Após permitir o download oficial do emulador, um comando possível a validar é:

```bash
cd /workspace/review-v69/Something-Gamer-V69
export SG_V69_ROOT="$PWD"
./node_modules/.bin/firebase emulators:exec --only firestore --project demo-sg-audit --config firebase.test.json 'node --test /workspace/something-gamer/tests/v69-audit/firestore-boundaries.test.mjs'
```

Este comando ainda não foi validado até o fim. O CLI deverá exportar `FIRESTORE_EMULATOR_HOST=127.0.0.1:8085`; o teste aborta se isso não ocorrer. Não substitua por hostname de produção para fazê-lo passar. O projeto de teste pode exigir ajuste do single-project mode para combinar com o ID escolhido; qualquer ajuste será local e documentado na fase 1.

## Camadas e gates

| Camada | O que demonstra | Quando exigir |
|---|---|---|
| Inventário/hashes | Proveniência, arquivos preservados, importação revisável | Toda fase e antes de build/release |
| Verificador/AST | Sintaxe, imports e convenções; não garante comportamento | Todo PR; incluir fixtures negativas do próprio verificador |
| Domínio | Planos, dinheiro em centavos, transições, URLs, permissões puras | Toda alteração relacionada; guardas do Verificado em toda fase |
| SQLite/Miniflare | Migrations, constraints, reserva, D1/R2, idempotência local | Worker/persistência/comercial |
| Firestore/Storage emulator | Negação e aceitação de leitura/escrita por papel/recurso | Qualquer mudança de regras, schema, perfil, chat ou upload |
| Browser com fixtures identificadas | DOM/eventos, erros JS, teclado, estado vazio/erro, acessibilidade e layout | Cada componente alterado; não prova backend real |
| Homologação integrada | Login, publicação, upload e leitura autorizada, chamadas, revisão administrativa e callbacks reais de sandbox | Antes de habilitar recurso; ambiente/contas de teste próprios |
| Performance/carga | Leituras por ação, concorrência, transferência, Web Vitals | Feed, chat, marketplace e release |
| Plataformas | Electron/Android, bridge, navegação e permissões reais | Alterações nativas e releases dessas plataformas |
| Recuperação | Restore íntegro e reconciliação financeira | Antes de migração ou publicação com risco de dados |

## Jornadas mínimas a acrescentar em cada fase

- Conta existente continua com o mesmo UID, perfil, vínculos, posts e servidores; logout não deixa cache privado em dispositivo compartilhado. Nova conta não concede papel/benefício.
- Post de texto/foto/vídeo/enquete: criar, erro de rede, limite, mídia inválida, moderação negativa, concorrência e limpeza compensatória. Comentário/curtida/voto devem corresponder ao documento persistido e ter autorização server-side.
- Perfil público/privado e bloqueio bidirecional: terceiros, anônimos, donos e staff exercitam permissões; não basta teste de cliente escondendo botão.
- Chat: histórico, envio, retries sem duplicação, anexo privado, bloqueio, exclusão própria e reconexão; servidor/canal privado não fica legível por conhecimento do ID.
- Verificado: matriz 3 planos × pendente/confirmado/em análise/aprovado/rejeitado/expirado/estornado; pedido duplicado e webhook fora de ordem; benefícios e revisão protegidos; clientes legados conservam compatibilidade.
- UX: 320/375/768/1440/1920 px, teclado, zoom 200%, contraste, movimento reduzido, teclado virtual e leitor de tela nas jornadas críticas. Axe e screenshots são complementares à inspeção manual.
- Cada integração indisponível deve retornar estado verdadeiro e impedir falso sucesso. Pagamentos de sandbox só após configurar conta/credencial de teste e autorização, sem cobrar usuário real.

## Disciplina de resultado

Guardar comando, diretório, runtime, revisão/hash, horário, exit status, contagem e resultado sanitizado. Não somar fixtures de texto como jornadas completas, não incluir suites não executadas como aprovadas e não usar screenshots antigas como evidência nova. Não publicar SDKs ou dados falsos de teste. Não ampliar a rede nem solicitar credenciais sem necessidade concreta.

Nesta sessão, os testes de navegador existentes foram executados usando Chromium do sistema e uma configuração ignorada em `.local/playwright-audit.config.mjs`, que só ajusta `executablePath` e o diretório do servidor. A primeira tentativa dessa configuração local falhou por diretório do servidor incorreto (404); foi corrigida e repetida. O resultado de produto relevante é a segunda execução: dois aprovados e um H1 divergente. Nenhuma alteração de fixture do produto foi feita para ocultar o erro.
