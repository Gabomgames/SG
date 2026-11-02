# Backup e reversão

## O que está protegido agora

- ZIP V69 original mantido em `/workspace/attachments/72ea6f41-fa93-4114-b412-a1e8b442e9c1/Something-Gamer-V69-PROFISSIONAL-VERIFICADO.zip`; hash e todos os arquivos em `INVENTARIO.md`. O ZIP inclui o `dist/` original, diferente do build novo gerado durante a análise.
- Git inicial estava limpo. Foi criado `/workspace/review-v69/backups/checkout-before-v69.bundle` com todos os refs e histórico alcançável; `git bundle verify` aprovou. HEAD: `e70948defc1d5356d04e8ba12d820dc44e9e4515`.
- A recuperação do bundle foi exercitada por clone local em `/tmp/sg-v69-recovery-check`; HEAD recuperado é idêntico e o diff de árvores contra o commit original foi vazio. Isso valida recuperação de código Git, não de dados de produção.
- A extração da V69 e seus artefatos de teste estão separados do checkout Git. Não é backup de banco de dados, de contas Firebase ou de configurações remotas.
- Os novos documentos/testes estão no checkout para revisão e também serão copiados à árvore V69 e empacotados em um artefato de planejamento. Não houve commit/push automático.

Essas cópias são locais à sessão. Antes de qualquer mudança de produção, é necessário backup fora do mesmo ambiente, com acesso restrito, criptografia, política de retenção e teste de restauração. Não enviar exports pessoais para este chat ou para Git.

## Antes de cada fase

1. Registrar HEAD, branch, `git status --short`, diff e hash do artefato anterior. Preservar também untracked/ignored importantes e commits locais: bundle não inclui arquivos não commitados, segredos, arquivos ignorados ou dados externos.
2. Guardar uma cópia recuperável fora do checkout; incluir manifest com hashes, versão das ferramentas e configurações não secretas. Segredos ficam no cofre autorizado, nunca no arquivo de backup de código ou neste relatório.
3. Delimitar recursos afetados: somente código local, regras, Firestore/Auth, D1/KV/R2, Storage, pagamentos ou clientes nativos. Não presumir que uma cópia do ZIP restaura esses sistemas.
4. Definir um responsável, gatilhos de rollback e validação de retorno para a fase. Restauração não deve sobrescrever trabalho do usuário.

## Backups remotos necessários antes de autorizar uma migração/release

| Sistema | O que preservar | Como conferir recuperação em homologação |
|---|---|---|
| Firestore | Export gerenciado, subcoleções, índices/regras, relações e referências de mídia | Contagens por coleção, IDs, memberships, status e amostra de relações; clientes antigos e novos |
| Firebase Auth | Backup/export por ferramenta autorizada e capacidades de restauração do provedor; claims e provedores vinculados | UIDs/claims/vínculos preservados com usuários de teste; não inventar restauração de sessões/tokens |
| Storage/R2 | Objetos, metadados, ACL/política, referências e versões quando suportadas | Hash/size de amostras, leitura autorizada e negação a terceiros; não publicar URL/token de download |
| D1 | Snapshot/export consistente com migrations e ledger | Aplicar em banco isolado, verificar constraints, estoque, pedidos, revisões e auditoria |
| KV | Manifest de namespaces e export consistente do conteúdo necessário respeitando expiração | Retomar apenas estados que ainda devam existir; não restaurar sessões/códigos expirados |
| Configuração | Versões de Worker/Functions/Hosting, bindings, flags, CSP, regras, índices e refs de segredos | Release anterior reproduzível sem revelar valores; rota administrativa correspondente ao artefato |
| Financeiro | IDs de pedidos/eventos, idempotência, ledger, aprovações e estado atual do provedor | Reconciliar com fonte financeira; nunca repetir cobrança ou restaurar benefício estornado |

Nenhum desses exports remotos foi executado. É necessária autorização e acesso apropriado antes de tocar os serviços. Não foi demonstrada restauração de produção.

## Reversão por tipo de mudança

- **Código local:** reverter somente a mudança da fase por commit/patch revisado, preservando alterações alheias. Restaurar arquivos específicos do ZIP/bundle se necessário. Não usar `git reset --hard`/`git clean` indiscriminadamente.
- **Hosting/Worker/Functions:** após autorização, voltar ao artefato/versionamento anterior; manter contratos compatíveis. Reverter frontend isoladamente não reverte comportamento de backend nem dados gravados.
- **Regras/índices:** validar o par de versões cliente/servidor; regra antiga não deve reabrir exposição que a correção eliminou. Preferir correção progressiva segura quando rollback reintroduz falha.
- **Schema:** expandir → suportar leitura dupla → preencher de forma idempotente e auditável → verificar → só depois propor contração em outra fase. Nunca remover coleção/campo/índice necessário aos clientes existentes por conveniência.
- **Dados:** recuperação seletiva com diff, manifest e análise de escritas posteriores. Um restore integral de backup antigo pode apagar atividade recente e não é rollback padrão.
- **Pagamentos:** não restaurar ledger antigo sobre transações novas. Consultar e reconciliar eventos do provedor, preservar chaves de idempotência e auditoria; qualquer estorno/cancelamento real exige autorização própria.

## Gatilhos de interrupção

Parar rollout ao observar acesso indevido, perda de dados/relações, divergência financeira, benefício indevido, erro em login/publicação/chat ou regressão de acessibilidade que bloqueie jornada crítica. Registrar evidência sem PII e acionar o procedimento específico. RPO e RTO ainda não foram acordados com o responsável pelo serviço; não prometer recuperação instantânea. Medir ambos em ensaio de homologação antes da liberação.
