# Something Gamer — validação final após recuperar 6052659

**Decisão: Fase 1 NÃO APROVADA.** Há correções S03 e uma nova execução completa dos gates. Os testes Firestore/Storage e Chromium continuam bloqueados na instância desta conversa. O inventário real e a revogação dos tokens privados legados não foram executados; a quantidade de tokens reais permanece desconhecida.

Não houve merge na main, deploy, alteração de dados de produção, cobrança, ativação dos 50 Fundadores, revogação real ou avanço à Fase 2. Esta revisão continua na branch autorizada codex/v69-phase1-local, preservando o histórico anterior.

## Integridade do código recebido

- A referência GitHub consultada por Git HTTPS correspondeu exatamente a `605265933686b64bbbfd5334a166c2231d9c5c9d`.
- O checkout inicial estava limpo. Seus 485 blobs versionados correspondiam byte a byte aos objetos do commit, e git fsck passou.
- Os commits a797418 e 9445442 continuam ancestrais. Os 344 caminhos do manifesto V69 permanecem presentes; nenhum arquivo versionado foi excluído nesta revisão.
- A baseline executada antes das correções registra gitCommit 6052659 e gitDirty false. Seus inputSha256 foram comparados aos blobs desse commit. A execução final registra a árvore corrigida antes do novo commit; seus hashes foram conferidos contra os arquivos preparados para entrega. Isso não é uma alegação de execução pós-commit fictícia.
- O ZIP original de 133733622 bytes e o bundle original de 9018223 bytes do commit 6052659 mantêm seus SHA-256. Não foram sobrescritos nem incluídos como arquivos normais do repositório. Veja evidence/integrity.json.

## Ambiente efetivamente usado e tentativas reais

O runtime retornou observações atuais, revisão de execução 1 e política restricted/enforced, sem hosts customizados aplicados. github.com está permitido; storage.googleapis.com e cdn.playwright.dev não estão na política efetiva. Esta é a instância vinculada à conversa; a configuração que funciona em outra tarefa não comprova que esta instância foi migrada.

Os três runners Firebase foram executados sequencialmente, fixando demo-sg, 127.0.0.1:8085 e, na primeira suíte, Storage 127.0.0.1:9199. Todos tentaram obter o JAR oficial cloud-firestore-emulator-v1.22.0.jar e encerraram antes dos casos. A consulta HTTPS HEAD independente confirmou CONNECT 403 do proxy para o artefato oficial.

A instalação oficial do Chromium foi tentada de fato pelo CLI Playwright instalado no lockfile. O download Chrome for Testing 145.0.7632.6, build 1208, retornou HTTP 403 / Domain forbidden; o instalador saiu com 1. O preflight da suíte saiu com 78 porque o executável não existe. A listagem descobriu os mesmos 26 casos; nenhum foi executado. Instalação bloqueada, listagem e preflight não são testes de produto aprovados.

Não houve download alternativo, substituição por mock de regras, alteração de proxy, desativação de TLS ou mudança de projeto/host dos testes para produção. Logs: evidence/chromium-install.log, chromium-install-result.json, official-download-network.json e final-validation/{firestore,security-s01,founders-emulator,browser}.log.

## Correções implementadas e testadas

### S03: plano offline vinculado à versão do objeto

Foram reproduzidas duas falhas antes da correção: o plano aceitava objeto sem generation e não incluía generation/ifGenerationMatch. Uma substituição concorrente pode produzir outro objeto com a mesma metageneration; condicionar só essa propriedade não protege o alvo original.

Agora o plano identifica a generation exata e exige ifGenerationMatch e ifMetagenerationMatch. Rejeita contadores inválidos ou imprecisos, escopo divergente e duplicação de objeto/geração. Não remove bytes, não retorna tokens e não implementa chamada de revogação remota. Os dois testes antes reprovados passaram após a correção; há 22 testes do inventário/plano, incluindo CLI, validação, confidencialidade, versões e incompletude. A fixture positiva anterior recebeu generation, mantendo suas asserções de preservação e não vazamento.

O novo relatório de inventário distingue token present, absent e unknown; metadados omitidos não viram uma falsa contagem zero. Registra paginação e cobertura de versões não comprovadas, ACL e cache públicos. Declarações no JSON não comprovam IAM/proveniência/revogação: phase1Approved continua false mesmo em um inventário declarado vazio/completo.

### S03: respostas privadas pendentes no cliente

O cliente anterior podia criar um blob depois da revogação dos URLs existentes, se uma leitura já iniciada terminasse após logout ou troca de conversa. A mudança direta de conta também precisava invalidar os blobs anteriores.

A resolução agora mantém um identificador de contexto e revalida sessão/conversa antes de solicitar, após a resposta e após ler o corpo. Respostas obsoletas não criam novos URLs. Os oito testes novos cobrem esse comportamento, troca direta de conta, revogação de URLs existentes, bloqueio/URL de outra origem, retry de 503 e referência legada sem token. Os exports resolvePrivateMedia/revokePrivateMedia e os gateways anteriores foram mantidos.

Essa validação é unitária sobre o cliente efetivo, com adaptadores de rede/blob controlados; não é execução Chromium. A mudança também não pode apagar bytes já copiados para fora do aplicativo.

## Resultados da execução completa corrigida

| Grupo | Aprovados | Reprovados na execução final | Bloqueados / não executados |
|---|---:|---:|---|
| Unit/Worker/Market/features | 73 | 0 | — |
| Segurança S02/S03, plano e cliente de mídia | 88 | 0 | — |
| Contratos, fixtures e runners | 21 | 0 | — |
| Fundadores, cliente e espelho pago | 16 | 0 | — |
| Domínio de enquetes | 9 | 0 | — |
| Regressões V65–V69 | 51 | 0 | — |
| SQLite | 11 | 0 | — |
| Runtime D1/R2 local | 43 | 0 | — |
| **Total distinto executado** | **312** | **0** | Não inclui repetição Node 20, listagem ou instalação |
| Firebase regressão + Storage | 0 | 0 | Bloqueado antes dos casos; exit 78 |
| Firebase S01/S02 | 0 | 0 | Bloqueado antes dos casos; exit 78 |
| Firebase Fundadores | 0 | 0 | Bloqueado antes dos casos; exit 78 |
| Chromium | 0 | 0 | 26 casos não executados; preflight exit 78 |

O build e o verificador passaram. Os sete gates foram tentados; o agregado retornou 1, completePhase1Run true e allSelectedGatesPassed false. Reprovados na reprodução anterior à correção: **2 testes S03**, documentados em evidence/s03-regression-before-fix.log; ambos passaram na revisão corrigida. Esses dois não são falhas pendentes escondidas pela tabela final.

A baseline de 6052659 repetiu os 282 testes distintos anteriores, todos aprovados, e encontrou os mesmos quatro gates bloqueados. A revisão acrescentou 30 testes: 22 do plano/inventário e 8 do cliente. A repetição em Node 20 executou os mesmos 16 casos de promoção/cliente/espelho (10+3+3) e carregou os exports das Functions localmente; não foi somada ao total.

Runtime web/Worker: Node 24.19.0; Functions: Node 20.20.2; Java 21; Python 3.12. O runtime usa D1/R2 reais locais, com serviços externos isolados por fixtures. Não prova segurança das regras no Firebase real nem IAM/eficácia de AI em campo. Windows nativo, Android e Electron não foram executados aqui.

Audit npm passou com limiar high nos dois escopos: nenhuma alta/crítica conhecida nos escopos auditados. Permanecem 19 moderadas na raiz e 9 nas Functions; não representam 28 vulnerabilidades únicas somáveis. Não houve atualização dos lockfiles ou audit fix --force. A auditoria de dependências não certifica ausência de falhas de aplicação.

## Inventário S03 e limites reais

Foram preparados:

- inventory.template.json: projeto/bucket conhecidos do código, captura pendente, listagem não confirmada e items vazio como formulário; não é um levantamento real.
- inventory.synthetic.example.json: quatro objetos falsos, dos quais três têm prefixo privado; duas operações candidatas e um estado de token desconhecido. As saídas são explicitamente sintéticas.
- S03-INVENTARIO-E-PLANO.md: coleta autorizada, paginação/versões, revisão de IAM/ACL/cache, hashes, duas precondições, conflitos/412, homologação e controles de acesso antes/depois.

Nenhuma identidade de leitura de bucket está declarada/pronta no runtime, os nomes usuais de bindings de leitura estão ausentes e não foi fornecida exportação de metadados reais. **Contagem real de objetos/tokens: desconhecida. Revogações reais: zero.** Não houve leitura de produção.

O gateway atual foi reexaminado: host GCS e bucket são fixados pelo servidor; download tokens não são encaminhados; consulta da conversa usa o token do participante e regras atuais, com checagem dos membros/dono do objeto. Rotas administrativas permanecem sujeitas aos gates MFA/Access existentes. Os testes D1/R2/gateway locais passaram, mas as regras e a revogação no Storage Emulator continuam sem execução real. Token antigo obtido fora do aplicativo ainda exige inventário/revogação efetivos para encerrar S03.

## Preservação do produto

Configuração, políticas/Functions dos Fundadores, preços e verificação paga não foram alterados. Mantidos NOW, slogans, R$14,90 por 30 dias, R$79,90 por 180 dias, R$149,90 por 365 dias e 365 dias gratuitos automáticos para os primeiros 50 elegíveis após lançamento autorizado. Os gates de lançamento continuam false por padrão e nenhuma campanha foi criada/ativada.

Now Call, feed, perfis, administração e APIs existentes não foram removidos. A presença dos caminhos e os testes locais comprovam a preservação examinada; a equivalência funcional completa da interface continua dependendo do Chromium e da homologação do legado. Não afirmar que todas as funcionalidades foram aprovadas apenas porque os arquivos existem.

## Próximos passos e aceite

1. Executar os três gates Firebase/Storage e os 26 casos Chromium numa instância realmente associada à configuração de rede atualizada, ou localmente pelo guia EXECUTAR-VALIDACAO.md. Regras que não compilarem ou controles positivos negados são reprovações, não bloqueios.
2. Gerar uma execução completa sobre a mesma árvore com todos os sete gates passed, exit 0, inputSha256 conferidos e allSelectedGatesPassed true.
3. Obter inventário autorizado de S03, validar cobertura/proveniência/versões/IAM, homologar com objetos sintéticos e solicitar autorização específica antes de qualquer revogação real. Comprovar tokens antigos negados e bytes/acesso autorizado preservados. Não basta marcar o plano como pronto.
4. Fechar qualquer vulnerabilidade alta/crítica sem tratamento verificável e revisar os avisos moderados. Aplicar os critérios de ../final/CRITERIOS-ACEITE.md com estas evidências atualizadas.
5. Apresentar novamente o relatório à NOW para decisão explícita de encerramento. Esta revisão não autoriza Fase 2, deploy, merge, cobranças ou ativação de promoção.

As correções e evidências são entregues na mesma branch de trabalho autorizada; a confirmação de publicação/commit deve ser conferida pelo Git remoto na resposta da tarefa. Nenhuma conclusão da Fase 1 decorre do envio do código.
