# Something Gamer — avaliação de aceite em d7c8a14

Data de referência: 04/11/2026, America/Sao_Paulo. **Fase 1 NÃO APROVADA.** A validação foi executada exatamente em `d7c8a14999549eeb5b8568e2597e2a111a20e106`, branch `codex/v69-phase1-local`, com checkout limpo e dependências reinstaladas pelos lockfiles. Esta entrega acrescenta documentação/evidências; não altera a implementação avaliada.

## Ambiente e integridade

A consulta do runtime retornou observações atuais, revisão 1, política restricted/enforced e nenhum host customizado aplicado. A instância continua vinculada à versão de configuração registrada em evidence/environment.json. Portanto, **não foi possível confirmar que esta conversa usa o ambiente SG atualizado**. Publicação/configuração ou testes em outra tarefa não comprovam a política desta instância.

A branch consultada por Git HTTPS retornou o SHA d7c8a14 completo. git fsck passou; os 524 blobs versionados correspondiam ao checkout inicial, e os 344 caminhos originais continuam presentes. Os commits 6052659, a797418 e 9445442 continuam ancestrais. Os hashes de entrada da execução completa foram confrontados com os blobs de d7c8a14. O JSON do runner registra gitCommit igual ao SHA informado e gitDirty false.

Não foram necessários ajustes de implementação: nenhuma falha de asserção foi comprovada nas suítes executadas. Os testes bloqueados não demonstram aprovação nem reprovação das regras ou do navegador.

## Instalações e limites das tentativas

| Instalação | Runtime | Resultado |
|---|---|---|
| npm ci --no-audit --no-fund | Node 24.19.0 | Exit 0 |
| npm ci --prefix functions --no-audit --no-fund | Node 20.20.2 | Exit 0 |
| Playwright CLI install chromium | Node 24.19.0 | Exit 1, download oficial bloqueado por HTTP 403 |

Os lockfiles não foram alterados. Java 21 e Python 3.12 estavam disponíveis. Houve uma chamada externa ao instalador do Chromium e uma execução agregada de validação. O instalador fez apenas seus retries internos limitados; não foi reinvocado. Cada suíte Firebase foi chamada uma vez pelo agregador; depois de documentar os bloqueios, as tentativas foram encerradas.

As consultas HTTPS HEAD e os CLIs oficiais comprovaram o bloqueio do proxy para storage.googleapis.com e cdn.playwright.dev. O 403 ocorreu no CONNECT do proxy; não é uma resposta do teste de revogação de tokens. JAR solicitado: cloud-firestore-emulator-v1.22.0.jar. Chromium solicitado: Chrome for Testing 145.0.7632.6 / Playwright build 1208.

Não foram usados hosts alternativos, proxies novos, TLS desativado, checksums alterados ou mocks para substituir o motor de regras ou o Chromium. Veja evidence/official-download-network.json e chromium-install.log.

## Resultados efetivamente obtidos

| Grupo | Aprovados | Reprovados | Bloqueados / não executados |
|---|---:|---:|---|
| Unit/Worker/Market/features | 73 | 0 | — |
| Segurança S02/S03, inventário/plano e cliente de mídia | 88 | 0 | — |
| Contratos, fixtures e runners | 21 | 0 | — |
| Fundadores/cliente/espelho | 16 | 0 | — |
| Domínio de enquetes | 9 | 0 | — |
| Regressões V65–V69 | 51 | 0 | — |
| SQLite | 11 | 0 | — |
| Runtime D1/R2 local | 43 | 0 | — |
| **Total distinto** | **312** | **0 nas suítes executadas** | Não inclui repetição Node 20, instalação ou listagem |
| Firebase regressão + Storage | 0 | 0 | Bloqueado antes dos casos, exit 78 |
| Firebase S01/S02 | 0 | 0 | Bloqueado antes dos casos, exit 78 |
| Firebase Fundadores | 0 | 0 | Bloqueado antes dos casos, exit 78 |
| Chromium | 0 | 0 | 26 casos descobertos; nenhum executado; preflight exit 78 |

Build, verificador e regressões passaram após a reinstalação. O agregado `npm run validate:phase1` retornou 1, completePhase1Run true e allSelectedGatesPassed false. Os sete gates foram tentados; três passaram e quatro estão bloqueados. Instalação/listagem/preflight não foram somados como testes de produto aprovados.

A primeira suíte está fixada em demo-sg com Firestore 127.0.0.1:8085 e Storage 127.0.0.1:9199. As outras duas usam só Firestore. Os CLIs encerraram no download do JAR, antes da execução/compilação das regras. O navegador permanece sem executável, e o preflight impediu a execução dos 26 casos. Esses resultados não podem ser classificados como aprovação de integração.

Os mesmos 16 testes de promoção/cliente/espelho foram repetidos em Node 20.20.2 e os exports das Functions carregaram localmente, sem acionamento de funções remotas. Essa repetição não aumenta o total distinto. Os testes de runtime usam D1/R2 locais reais, mas identidades, AI, GCS, Firestore remoto e pagamentos usam fixtures isoladas; não comprovam IAM ou segurança em produção. Windows nativo não foi executado nesta instância Linux.

Audit npm passou no limiar high em ambos os escopos: nenhuma vulnerabilidade alta/crítica conhecida nos escopos auditados. Permanecem 19 moderadas na raiz e 9 nas Functions; as contagens não são vulnerabilidades únicas somáveis. Não houve audit fix --force ou alteração de dependências declaradas. Esse resultado não certifica ausência de vulnerabilidade de aplicação.

## Preparação S03 nesta execução

Foi executado somente o exemplo sintético versionado em `docs/phase1/validation-6052659/inventory.synthetic.example.json`. A entrada foi identificada por SHA-256; as saídas mantêm sourceKind synthetic e phase1Approved false. O resultado demonstrativo contém quatro objetos falsos, três com prefixo privado, duas operações candidatas e um estado de token desconhecido. As operações preservam generation/ifGenerationMatch e ifMetagenerationMatch; valores de tokens não aparecem nas saídas.

Os 88 testes de segurança incluem os controles já existentes para escopo, geração, precisão, duplicação, paginação incompleta, metadados desconhecidos, ausência de aprovação implícita e invalidade de respostas de mídia após mudança de sessão/conversa. O plano não implementa executor de produção.

**Inventário real de objetos/tokens: desconhecido. Revogações reais: zero.** Não foi utilizada exportação real de produção nesta rodada, nem feita consulta a bucket ou dados reais. A fixture e o template não são evidência de um inventário real vazio. Nenhuma suposição de zero tokens foi feita.

Permanecem pendentes a enumeração autorizada completa, cobertura de versões, proveniência, revisão de IAM/ACL/cache, homologação do gateway e comprovação da revogação real quando expressamente autorizada. Remover acesso por regras ou alterar a interface não invalida sozinho um download token já emitido. O plano e os critérios técnicos continuam em ../validation-6052659/S03-INVENTARIO-E-PLANO.md.

## Preservação e critérios de aceite

| Critério | Estado nesta rodada |
|---|---|
| Checkout e integridade de d7c8a14 | Atendido: SHA remoto/local, fsck, blobs e ancestrais conferidos |
| Instalação pelos lockfiles | Atendido: raiz e Functions com exit 0 |
| Build, verificador e testes locais/regressões | Atendido: 312 testes distintos aprovados |
| Ambiente SG atualizado aplicado nesta conversa | Não confirmado: runtime ainda revisão 1, downloads bloqueados |
| Três suítes reais Firebase/Storage | Pendente: bloqueadas antes dos testes |
| 26 casos Chromium | Pendente: navegador oficial não instalado por 403 |
| Preparação offline S03 sem dados reais | Atendida: somente fixture sintética; sem aprovação implícita |
| Inventário/revogação real S03 comprovados | Pendente: quantidade real desconhecida; zero revogações reais |
| Preços e Fundadores | Preservados no código; nenhuma ativação ou alteração de produção |
| Aceite da NOW e autorização de Fase 2 | Não concedidos |

Preços preservados: R$14,90 / 30 dias, R$79,90 / 180 dias e R$149,90 / 365 dias. Mantidos NOW, os slogans e a promoção automática dos primeiros 50 elegíveis por 365 dias, sem pagamento/renovação. Os defaults de lançamento continuam false. A configuração efetiva de produção não foi consultada; não houve ação de ativação.

Não houve remoção de funcionalidade, mudança de código de implementação, merge, deploy, cobrança, revogação real, alteração de dados de produção ou avanço de fase. Os relatórios anteriores continuam preservados. Esta rodada não substitui os gates que ainda precisam de execução real.

## O que falta para encerrar

Executar os comandos de WINDOWS-VSCODE.md em uma instância realmente vinculada à rede atualizada, ou no PC. Exigir os três gates Firebase e os 26 casos Chromium aprovados e uma execução completa com exit 0, completePhase1Run true, allSelectedGatesPassed true e hashes de entrada correspondentes ao código avaliado.

Separadamente, concluir o inventário autorizado e a comprovação S03, sem tratar ausência de evidência como zero tokens. Qualquer revogação real exige autorização específica. Fechar riscos altos/críticos sem tratamento verificável e revisar os achados moderados. Depois, submeter as evidências à decisão explícita da NOW. Nenhuma aprovação de Beta 0.1 ou Fase 2 é inferida desta entrega.

Todos os logs desta rodada, instalações, resultado agregado e saídas sintéticas estão em evidence/. O manifesto SHA256.json permite conferir seus bytes. A publicação dos documentos na branch não altera o estado de aceite.
