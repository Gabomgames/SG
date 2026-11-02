# Something Gamer — Beta 0.1: implementação local

Data: 02/11/2026. Empresa oficial: NOW. Slogans preservados: “Yes, Something for you ;)” e “O futuro é agora ;)”. Nenhum deploy, push, merge, cobrança ou alteração de dados reais. A promoção está desativada. Esta entrega não certifica uma beta pronta para produção.

## Base e novo histórico

A fonte é Something-Gamer-V69-PROFISSIONAL-VERIFICADO.zip. As 344 entradas de fonte preservadas estão no manifest e nenhuma está ausente; dist e capturas históricas foram separados dos fontes de release. Os lockfiles raiz e Functions continuam idênticos aos anexos. O comparativo documenta os arquivos alterados. Os hashes dos três anexos estão em input-hashes.json.

Por instrução do usuário, os commits 991c66f e 6c2fefe não serão procurados nem declarados restaurados. Não havia commits no checkout inicial. O histórico novo será iniciado com um commit raiz na branch codex/v69-phase1-local, sem main e sem história inventada. O backup Git distribuído corresponde somente a esse novo histórico.

## Implementado

- B01: análise lexical com Acorn no verificador; aceita imports dinâmicos declarados no escopo e continua detectando referências ausentes, aliases incorretos e vazamento entre blocos. A interpretação anterior de getDoc ausente no produto foi corrigida: era falso positivo do verificador.
- B02: contrato do navegador distingue título editorial, marca e slogans, preservando os checks de overflow e erros JS. A fixture SDK agora cobre os imports reais e recusa operações de conta/upload não configuradas. Rede externa não simulada é bloqueada.
- Corrigido o contrato de build do teste V67 para conferir a rota administrativa aleatória efetivamente gerada, sem restabelecer admin.html em dist. PREVIEWS histórico foi excluído do build, permanecendo preservado nos fontes.
- CI dividida em gates rápidos, runtime, Functions, Firestore e navegador; runners e projeto demo explícitos, sem afrouxar testes negativos.
- Runtime web/Worker fixado em Node 24.19.0. Uma instalação limpa em Node 22 revelou exigência Node >=24.12 no Firebase do lockfile; foi interrompida e não é considerada aprovada. Dependências completas da instalação Node 24 foram reutilizadas com lockfile inalterado. Functions instaladas e carregadas no Node 20.20.2 declarado. Binários Node obtidos de fonte oficial com SHA-256 conferido.
- Promoção automática dos 50 Fundadores SG: concessão/contador/notificação/perfis atômicos, identidade idempotente por UID/e-mail normalizado, retenção de risco e limite absoluto de 50. Frontend sincroniza após e-mail verificado sem botão de resgate. Dados e flags de autoridade só no backend.
- Benefício promocional separado do estado pago, com datas de 365 dias e expiração automática. Fluxos pagos preservam análise administrativa, estorno e preços 1490/7990/14990 centavos. Espelho do Worker usa versão do perfil e retries para não perder concessão concorrente. Uma falha de pagamento não apaga prêmio ativo na UI. Monitor Admin somente de consulta.
- Nome NOW corrigido no rodapé de Now Call. Não houve redesign ou remoção de feed, perfis, chamadas, marketplace ou administração.

## Evidência executada na árvore final

| Gate | Resultado real |
|---|---|
| Verificador | passou; sem problemas reportados |
| Unit/Worker/market/features | 73 aprovados |
| Contratos, verificador, SDK fixture e UI de verificação | 16 aprovados |
| Fundadores, cliente automático e espelho pago | 16 aprovados em Node 24; mesmos 16 repetidos em Node 20, sem somá-los novamente |
| Regressões V65–V69 | 51 aprovados |
| SQLite | 4 + 7 aprovados |
| Runtime D1/R2/Now Call/serviços com fixtures locais | 20 aprovados |
| Total distinto dessas suítes | 187 aprovados, zero falhas/skip/todo nesses gates |
| Build | passou sem deploy; fonte continua legível |
| Functions Node 20 | npm ci exit 0; exports novos carregaram |
| Firestore regressão e novas proteções dos fundadores | bloqueado antes de executar, download oficial do JAR |
| Firestore S01 (enquetes/votos) | bloqueado antes de executar; lacuna do baseline não corrigida nesta expansão promocional |
| Transações reais dos fundadores no Firestore Emulator | bloqueado antes de executar |
| Navegador | 1 falha de inicialização por Chromium ausente; 23 casos não executados, parada após primeiro erro comum |

Os números anteriores de 185 testes e 31 casos de navegador não foram reutilizados como evidência: os anexos desta instância têm uma suíte de 24 casos de navegador. Os 187 checks acima têm cobertura e distribuição próprias. Não incluem emulador, navegador, homologação externa ou builds Android/Electron. As Functions/Auth/App Check não foram homologadas em serviço remoto.

A fixture de transações dos fundadores exercitou 80 contas concorrentes com exatamente 50 concessões e 30 respostas de esgotamento, retries e duplicidades. Isso não substitui a transação real no emulador. Consulte FOUNDERS.md para a definição de ordem de elegibilidade, limites antifraude e gates de lançamento.

## Bloqueios e configuração

A instância observada permanece na revisão 1, sem adoção comprovada de uma configuração publicada nova. api.github.com, storage.googleapis.com e cdn.playwright.dev recebem 403 pelo proxy. As permissões foram salvas no rascunho, mas ainda precisam ser revisadas/salvas e publicadas nas configurações do ambiente. Nenhuma restrição foi contornada.

Destino confirmado pelo usuário: https://github.com/Gabomgames/SG.git. A visibilidade PRIVADA não pôde ser confirmada por causa do 403 da API. Não há autorização de push nesta entrega. Nenhum conteúdo foi enviado. private=true no package.json não prova privacidade do GitHub.

O scanner offline examina arquivos staged e blobs alcançáveis em todo o novo histórico, sem imprimir valores. O resultado de scan e a verificação do bundle acompanham a entrega. Zero detecções de formatos conhecidos não prova ausência de todo segredo possível. Chaves públicas Firebase/reCAPTCHA foram preservadas; node_modules, .env, dados reais e credenciais privadas não entram no ZIP do projeto.

## Pendências para encerrar o aceite

1. Aplicar/publicar a configuração de rede e reexecutar os três gates Firestore e os 24 casos de navegador. Não considerar bloqueios aprovados.
2. Resolver os casos S01 de enquetes/votos numa alteração autorizada, mantendo compatibilidade; as demais lacunas de mídia/moderação da auditoria histórica não foram silenciosamente declaradas corrigidas. Não foi iniciada uma implementação geral da Fase 2.
3. Homologar verificação de e-mail, App Check, ordenação de admissão pelo servidor, notificação e antifraude com identidades sintéticas num projeto isolado. Não há garantia de uma pessoa física única só com e-mail/App Check.
4. Confirmar a visibilidade privada do repositório e obter autorização explícita posterior antes de enviar exclusivamente a branch acordada.
5. Ativar lançamento, pagamentos ou publicar código somente mediante autorização específica; flags promocionais continuam false e nenhum documento de campanha foi criado em produção.

Para continuar sem a nuvem, consulte EXECUTAR-NO-VSCODE.md. O ZIP inclui projeto completo, build local e bundle do novo histórico; os binários/dependências podem ser reinstalados pelos lockfiles. O bundle não é backup de contas, conteúdo de usuários ou produção.

O scanner anterior ao commit encontrou zero formatos conhecidos em 395 arquivos staged e nenhum blob histórico (repositório ainda sem commits nessa execução). Será repetido após criar o novo histórico. Avisos de whitespace/CRLF de vendor e .firebaserc pertencem ao ZIP importado e foram preservados; não foram normalizados os arquivos de terceiros. A restauração automática desta configuração em uma nova tarefa não foi comprovada; o bundle serve para recuperação local explícita.
