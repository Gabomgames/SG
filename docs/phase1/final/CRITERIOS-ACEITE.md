# Critérios objetivos de encerramento da Fase 1

Estado em 03/11/2026: NÃO APROVADA. O encerramento exige todos os itens, sobre o mesmo commit/código, sem resultado bloqueado convertido em aprovação.

| Critério | Evidência necessária | Estado desta entrega |
|---|---|---|
| Integridade Git | `git fsck --full`, commits 9445442/a797418 ancestrais, bundle verificável e clone restaurável | Verificações locais e hashes anexados no pacote |
| Preservação de funcionalidades | 344 fontes presentes, contratos/regressões e os 26 controles de navegador aprovados; fluxo legado acessível após migração revisada | Arquivos e testes locais preservados; browser/legado pendentes |
| Build e testes locais | `npm run validate:phase1`, mesmo inputSha256, todos os sete gates passed, exit 0, completePhase1Run e allSelectedGatesPassed true | 282 testes distintos passaram; quatro gates bloqueados |
| S01 e recibos S02 | Firestore Emulator real compila e passa controles positivos/negativos de schema, UID, timestamp, frequência, bloqueio, votos, consumo/tamper/replay/expiração e REST administrativo | Código/testes preparados; suíte não executada |
| Fundadores | Suíte Firestore real comprova máximo 50 sob concorrência, idempotência, risco, sequência de servidor, prazo/notificação e preservação do pago | 16 testes locais passaram também em Node 20; emulador pendente |
| Mídia S02 | Quarentena, AI fora do ar, aprovação/rejeição, ownership, quotas, prévias privadas, limpeza conservadora e compatibilidade do legado testados; AI/IAM homologados com dados sintéticos | D1/R2 e falhas testados; integração e legado pendentes |
| S03 sem tokens privados remanescentes | Inventário real autorizado + revogação comprovada, URLs antigas negadas, bytes preservados e gateway com controles de membership/bloqueio/MFA; ou inventário comprovadamente vazio | Não inventariado/revogado em produção; risco residual aberto |
| Dependências e segredos | 0 vulnerabilidades altas/críticas sem correção verificada, triagem dos avisos moderados, scan de staged/histórico e revisão das configurações; sem credenciais privadas nos artefatos | Audit: 0 altas/críticas; moderadas registradas. Scan e hashes da entrega anexados |
| Invariantes de negócio | NOW e slogans exatos; R$14,90/30, R$79,90/180, R$149,90/365; 50 Fundadores automáticos por 365 dias, sem cobrança/renovação | Preservados no código e contratos |
| Campanha desligada | Gates frontend/backend false, nenhuma campanha ativada ou vaga consumida em produção | Defaults preservados e nenhuma ativação nesta tarefa; produção não foi consultada |
| Entrega verificável | ZIP + bundle + relatório/evidências com SHA-256; upload GitHub autorizado e confirmado, repositório privado comprovado antes do envio | Arquivos preparados; entrega externa pendente/proibida nesta tarefa |
| Aceite da NOW | Revisão do relatório, fechamento das pendências e autorização explícita para encerrar Fase 1/iniciar Fase 2 | Não concedido; nenhum avanço automático |

Bloqueio de download é pendência de execução, não reprovação de asserção nem aprovação. Correção em arquivo sem teste de integração necessário não encerra achado alto/crítico. Nenhuma tolerância a token privado conhecido e não revogado é inferida deste documento.

Depois de todos os critérios técnicos comprovados, apresentar novamente o relatório e obter a decisão da NOW. Essa decisão não autoriza automaticamente push, merge, deploy, cobrança, lançamento da campanha, Firebase ou Play Store. Fase 2 depende de instrução explícita própria.
