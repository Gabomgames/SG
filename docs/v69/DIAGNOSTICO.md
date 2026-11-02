# Diagnóstico V69 — 2 de novembro de 2026

## Base e limites da análise

Fonte solicitada: `Something-Gamer-V69-PROFISSIONAL-VERIFICADO.zip`, SHA-256 `99f3f39b2d10724b6147686729e7362658ae05aea752d81de462b1b10cb31ba4`.

O ZIP contém 527 arquivos (24.181.978 bytes descompactados), incluindo 172 arquivos em `dist/`. Foi extraído com validação de caminhos e rejeição de symlinks em `/workspace/review-v69/Something-Gamer-V69`. A árvore Git original, `/workspace/something-gamer`, está no commit `e70948defc1d5356d04e8ba12d820dc44e9e4515`. A comparação encontrou 350 arquivos exclusivos da V69, 131 diferentes, 46 idênticos e 20 exclusivos do checkout inicial. Não foi feita sobreposição das árvores.

O [inventário](INVENTARIO.md) lista TODOS os arquivos originais e hashes; a [comparação](COMPARACAO.md) permite revisar a importação. A revisão de código foi dirigida por fronteiras de confiança, contratos, pontos de entrada e fluxos principais. Isso não equivale a auditoria formal de cada linha nem a inspeção de produção. Textos e relatos antigos no ZIP são evidências históricas, não instruções do usuário nem prova de testes atuais.

Foram acrescentados apenas documentação e testes de preparação no checkout Git. Não foram modificados fonte funcional V69, lockfiles, dados ou configurações de produção. `node_modules`, build novo, screenshots e configuração local Playwright foram gerados somente na cópia de análise. Não houve deploy, cobrança, login com conta real, alteração remota ou migração de dados.

## Estrutura completa por responsabilidade

| Área | Estrutura e responsabilidade | Dependências e riscos principais |
|---|---|---|
| Web | 35 HTML na raiz; `Games/`, `Onboarding/`; módulos JS por página; autenticação em `script.js`/`firebase.js`, shell em `app-shell.js`/`sg-v65-shell.js` | Firebase CDN 12.1.0, scripts múltiplos por página, IDs de DOM usados como contratos |
| Social | `feed.js`, `feed-composer.js`, `dashboard.js`, `profile.js`, `social*.js`, `communities.js`, `events.js`, `companies.js` | Firestore direto, Worker para recursos adicionais, snapshots de autor e selo |
| Chat/chamadas | `chat.js`, `calls.js`, `voice-room.js`, `call-sfu-client.js`, `channel-tools.js`, Worker `community*.js`/`now-call.js` | Sinalização Firestore, mídia privada, TURN/P2P e LiveKit/SFU; limites e configurações distintos |
| Comercial | `verification.js`, `market*.js`, `ads*.js`, `subscriptions-app.js`, `now-lead.js` | Worker, D1, Mercado Pago e aprovação administrativa; não habilitar serviços por inferência |
| Firebase backend | `functions/index.js` (971 linhas), `functions/sg-v66-functions.js`, scripts de provisionamento admin | Node 20, Admin SDK, Steam, RAWG, recuperação de senha, e-mail, APIs administrativas e financeiro legado |
| Worker | 22 módulos JS em `something-gamer-api/src/`, incluindo router de 751 linhas, autorização, pagamentos, mídia, comunidade e anúncios | Cloudflare KV, D1, R2, AI, Access e APIs externas; configuração efetiva remota não inspecionada |
| Persistência | `firestore.rules` (1.012 linhas), `firestore.indexes.json`, `storage.rules`, 16 migrations SQL | Múltiplas fontes de estado, necessidade de inventário e reconciliação antes de qualquer migração |
| UI | CSS base/design system e camadas `v51`…`sg-v69`; 7.041 ocorrências de `!important` nos CSS da raiz | Cascata difícil de prever; número não mede sozinho o tamanho do problema |
| Offline/mídia | `service-worker.js`, `offline.*`, `media-upload.js`, `moderation.js`, `vendor/` | Cache público restrito; upload com fallback; módulos de vendor empacotados |
| Nativos | `desktop-app/` (Electron/preload), `android-app/` (Gradle/WebView) | Abrem o site publicado; validar permissões e navegação em plataformas reais; builds não executados |
| Entrega | `scripts/`, `.github/workflows/`, `firebase*.json`, `wrangler.jsonc`, PowerShells históricos | CI Node 22, máquina de auditoria Node 24.19.0; separação de runtimes necessária |
| Evidência | `tests/` (15 arquivos), `docs/`, `PREVIEWS/`, `artifacts/`, documentos históricos | Fixtures e screenshots antigos não provam comportamento atual |

## O que já existe e deve ser preservado

- Domínio financeiro valida centavos, prazo, referência, moeda, recebedor e confirmação das transações; mantém estorno terminal e aprovação administrativa separada.
- Regras protegem autoridade de selos, campos privados, memberships e parte das operações de chat. Há testes específicos contra escalada de cargos e leitura por terceiros.
- Mídia privada tem autorização no servidor; Worker falha de forma fechada quando bindings necessários faltam. Não se deve “resolver” indisponibilidade removendo essas verificações.
- Há testes reais com SQLite e Miniflare D1/R2 local. São uma base aproveitável, não uma demonstração vazia.
- Service worker usa lista explícita de shell público; cache persistente Firestore exige escolha de dispositivo confiável.

## Achados priorizados

P0 = incidente confirmado/risco imediato de publicação; P1 = corrigir antes de liberar a funcionalidade afetada; P2 = melhoria incremental. Nenhum comprometimento de produção foi demonstrado nesta análise.

| ID / prioridade | Evidência | Consequência e ação proposta | Confiança |
|---|---|---|---|
| B01 / P1 | `scripts/verificar.mjs:209` só reconhece imports estáticos; `feed-composer.js` declara `getDoc` por `await import` dentro do submit | `npm run verificar` falha; `npm run check` e deploy que o encadeiam não chegam ao fim. Corrigir análise de escopo/import mantendo detecção de símbolo realmente ausente | Reproduzido; falso positivo do verificador, não erro de import demonstrado no produto |
| B02 / P1 | `tests/browser/visual.spec.js:21` espera H1 “Something Gamer”; o DOM atual contém “Seu jogo. Sua comunidade. Suas regras.” | Teste mobile falha antes de medir overflow. Atualizar contrato de teste com revisão de UX e preservar slogan oficial; não concluir que responsividade passou a partir dessa suíte | Reproduzido em Chromium, 375 px |
| S01 / P1 | `firestore.rules:399`: votos validam somente `canAct` e UID; criação de posts em `:365` não limita `pollOptions` nem schema completo | Cliente direto pode tentar opção inexistente, payload arbitrário e enquete inválida. Validar existência/tipo da enquete, opção, autoria, schema e política de alteração do voto | Lacuna estática; novos testes de emulador preparados, ainda não executados |
| S02 / P1 | `moderation.js`: falhas/timeout retornam `allowed:true`; gravação de post é direta; `media-upload.js` faz fallback para Storage e upload precede moderação de imagem | Moderação de IA no navegador não é barreira de segurança; mídia pode permanecer acessível após reprovação ou falha. Definir quarentena/revisão no servidor, autorização de publicação e limpeza compensatória sem apagar mídia legada | Caminhos confirmados em código; exploração e efeito remoto não testados |
| S03 / P1 | `storage.rules:28` limita leitura autenticada, mas fallback usa `getDownloadURL`; `/chat/` usa membership e não verifica bloqueio como Firestore | URLs de download com token não devem ser tratadas como privadas/revogáveis só por regra. Verificar também política legada de chat, blocos e revogação em homologação | Risco de desenho; não demonstrada exposição de dados existentes |
| S04 / P1 | `npm audit` no lockfile atual: 25 avisos, 4 altos e 21 moderados; altos em `body-parser`, `re2js`, `undici`, `zod` | Triar caminhos de uso e dependências de tooling antes de atualizar; avisos não comprovam vulnerabilidade no bundle público. Atualizar em fase isolada com revisão de lockfile e regressão | Consulta real; zero críticos reportados; sem `npm audit fix` |
| C01 / P1 | `wrangler.jsonc` não declara bindings D1/R2; flags financeiras/admin/mídia/social/SFU estão `false` | A árvore local não configura vários recursos anunciados. Inventariar recursos remotos sem alterar produção e criar homologação própria; não presumir que o serviço publicado esteja igualmente desativado | Confirmado no arquivo; estado remoto desconhecido |
| C02 / P1 | `firebase.js` usa Firebase publicado; `config.js` usa Worker e Functions publicados; `npm run dev` não conecta emuladores; `ALLOW_LOCAL_ORIGINS:false` no Worker | Desenvolvimento com login real pode atingir dados reais; `dev` não é sandbox integrado. Criar seleção explícita local/homologação com proteção contra produção | Confirmado em código |
| C03 / P1 | CSP em `firebase.json:19` não inclui endpoint SFU configurável nem WebSocket LiveKit; flags locais SFU desativadas | Habilitar SFU sem revisar CSP pode bloquear chamada mesmo com token válido. Testar HTTPS/WSS em homologação com origem exata; preservar P2P e servidores existentes | Incompatibilidade condicional, não falha real de chamada comprovada |
| A01 / P2 | Feed executa quatro leituras por card em `refreshCard`, incluindo coleção inteira de likes; render dispara em snapshots e filtros; limite de 50 posts sem paginação | Amplificação de leituras/custo e feed truncado; limitar consultas, agregar contagens e adicionar paginação com orçamento medido. Preservar ordenação e links de posts | Confirmado por inspeção; carga/custo ainda não medidos |
| A02 / P2 | `dashboard.js:359` grava voto como texto; `feed.js:41` grava índice numérico | Mesmo voto pode aparecer diferentemente entre perfil/feed. Definir contrato compatível e leitura legada antes de corrigir escrita | Confirmado em código; reprodução integrada pendente |
| A03 / P1 antes de migração | Worker Orders/D1 e Functions de preapproval legado coexistem e escrevem verificação | Risco de estado divergente, benefícios expirados/snapshots e reconciliação incompleta. Não desligar rotas legadas nem alterar cobrança; mapear titularidade de campos, contratos e usuários existentes primeiro | Coexistência confirmada; conflito em dados reais não demonstrado |
| U01 / P2 | Feed carrega 13 CSS/8 scripts; dashboard 17/7; chat 19/6; editor 16/5. Camadas finais usam muitos overrides | Regressões por cascata e custo de manutenção. Consolidar uma página/componente por vez, preservando DOM/ações e estados reais; não reescrever toda UI | Medição estática; landing medida separadamente |
| U02 / P2 | Slogans em caixa alta em partes da UI; textos/documentação usam marcas/nomes de épocas diferentes | Padronizar textos oficiais fornecidos pelo usuário e hierarquia editorial, sem efeitos genéricos nem quebra de navegação | Confirmado em markup; revisão visual completa pendente |
| O01 / P1 | CI roda suites principais mas não V65–V69 nem Playwright; não fixa setup Java apesar de testes de regras | Novas regressões podem não bloquear PR; matriz de checks e runtime deve ser explícita. Não declarar branch verde com suites omitidas | Inspeção dos workflows |
| O02 / P2 | `functions/sg-v66-functions.js` exclui dados principais em várias etapas, mantém auditoria e não cobre claramente D1/R2/Storage | Política de retenção/exclusão e recuperação precisa de mapa por sistema e retomada idempotente. Não executar exclusões para testar | Revisão estática; sem apagar conta |
| O03 / P2 | Build inclui `PREVIEWS/` (não excluído) e comentários antigos sobre ofuscação; gera rota admin aleatória em `.local/admin-route.json` | Artefatos de revisão entram na publicação e caminhos administrativos variam. Separar manifest de release/artefatos e documentar rollback da rota; URL aleatória não é autorização | Build reproduzido; autorização real permanece necessária |

## Validação real desta sessão

| Check | Resultado | Limite |
|---|---|---|
| `npm ci` V69 | 782 pacotes instalados, exit 0 | Lockfile preservado; avisos de depreciação |
| `npm test` (mesmos quatro arquivos do script) | 73 passaram; 0 falhas/skip/todo | Fixtures locais, não provedor real |
| Testes V65, V65.1, V66, V67, V68, V69 | 51 passaram; 0 falhas/skip/todo | Predominam asserts de texto/estrutura; não provam upload ou login |
| `npm run test:sqlite` (dois comandos Python) | 4 + 7 passaram | SQLite em memória |
| `npm run test:runtime` | 20 passaram; 0 falhas/skip/todo | Miniflare D1/R2 locais; provedores/Firestore remotos isolados por fixtures |
| `npm run build` | Exit 0; 181 arquivos copiados; 42 entradas JS; ~1.275 KB de JS empacotado | Soma de bundles, não transferência por rota; build sem deploy |
| `npm run verificar` | Exit 1; 375 arquivos, um apontamento B01 | Não considerar `check` aprovado |
| Playwright selecionado, build novo, Chromium sistema | 2 passaram, 1 falhou | Acessibilidade landing e compra indisponível passaram; H1 mobile falhou. Fixture de compra não é transação real |
| `npm run test:rules` | Não executou testes; exit 1 na preparação | Download oficial `storage.googleapis.com/.../cloud-firestore-emulator-v1.22.0.jar` recusado pelo proxy HTTP 403. Não é falha de regras comprovada |
| Novos testes `tests/v69-audit/` | 6 passaram; 0 falhas/skip/todo | Contratos de preço/estorno/tampering e HTTP real do servidor local |
| Novos casos Firestore | Dois casos preparados; NÃO executados | Esperam rejeição de enquete inválida e voto fora das opções; devem expor S01 no baseline |
| Desktop/Android, chamadas, uploads reais, login e pagamentos | Não executados | Exigem ambiente isolado e, em parte, plataformas/credenciais próprias |

Os logs resumidos estão em [EVIDENCIAS.md](EVIDENCIAS.md). O emulador exige adicionar `storage.googleapis.com` à política de rede do ambiente de desenvolvimento, preservando as regras existentes; isso não requer alterar produção. Não foi contornado o proxy, desativado TLS nem usado artefato sem verificação. Homologação financeira continuará separada de aprovação de código.

Uma medição adicional da landing, com requisições externas bloqueadas, encontrou `scrollWidth == innerWidth` em 375 e 1440 px e zero eventos `pageerror`. As duas capturas foram geradas nesta sessão e a captura mobile foi inspecionada. Isso sustenta apenas o layout público nessas larguras; não valida feed/chat autenticados, fontes externas, toque, leitores de tela ou integrações. A falha do teste de H1 continua registrada.
