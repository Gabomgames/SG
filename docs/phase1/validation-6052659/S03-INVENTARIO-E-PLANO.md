# S03 — inventário preparado e plano de revogação, sem execução em produção

S03 permanece ABERTO. Não foi consultado bucket real, não houve inventário real confirmado e nenhum token real foi revogado. A quantidade real de objetos/tokens é DESCONHECIDA, e não zero. Os dados em inventory.synthetic.example.json são fixtures. O inventário real precisa de exportação autorizada e identidade de leitura; os bindings de leitura de produção necessários não estão presentes nesta instância.

## Correção reproduzida nesta revisão

No commit 6052659, o plano condicionava apenas a metageneration. Substituir um objeto pode gerar outro conteúdo com uma nova generation e a mesma metageneration. Um plano antigo não deve atingir essa substituição. Dois testes novos reproduziram a ausência dessa proteção e falharam antes da correção; o log está em evidence/s03-regression-before-fix.log.

Agora cada operação identifica bucket, name e generation e exige simultaneamente ifGenerationMatch e ifMetagenerationMatch. Os contadores devem ser inteiros positivos, sem perda de precisão; strings preservam os valores exportados pelo GCS. O plano pede somente a remoção do campo firebaseStorageDownloadTokens, mantendo os bytes e os outros metadados. Não contém valores dos tokens e NÃO possui executor de produção. Essas propriedades descrevem o plano; a preservação real de bytes ainda precisa ser comprovada em homologação autorizada.

Objetos duplicados na mesma versão e escopo incorreto são recusados. Metadados ausentes geram tokenState unknown; não são tratados como token ausente. Paginação incompleta, cobertura de versões desconhecida, ACL pública e cache público ficam como pendências. Mesmo uma entrada declarada completa mantém a revisão de proveniência/IAM/gateway pendente e phase1Approved false.

Também foi corrigida a entrega de blobs privados no cliente: troca de usuário, logout ou troca de conversa invalida respostas ainda em andamento, inclusive durante a leitura do corpo, e revoga URLs já exibidos. R2 e mídia Firebase legada continuam usando os gateways existentes; autorização remota, retry e download autorizado são preservados. Dados já baixados/copied fora do aplicativo não podem ser apagados remotamente.

## Preparar um inventário real sem expor credenciais

1. Confirmar o projeto e o bucket de destino com uma identidade autorizada apenas para leitura/listagem. Não usar GH_TOKEN para GCS. Valores de credenciais entram somente pelo mecanismo seguro do ambiente; nunca no chat, Git, guia ou evidências.
2. Obter exportação de metadados de todas as páginas e, quando houver versionamento, todas as versões. Prefixos privados conhecidos: chat/, reports/ e profile-review/. Registrar outras classes de objetos separadamente e revisar caminhos privados desconhecidos; a classificação por prefixo não prova que todos os objetos fora desses prefixos são públicos.
3. Registrar projeto, bucket, instante real da captura e continuidade da paginação. Para cada objeto privado, manter name, bucket, generation, metageneration, metadata, acl e cacheControl quando disponíveis. Não preencher metadata={} só para fazer o relatório passar: isso deve refletir resposta completa e confirmada do serviço. Ausência de campo/projeção incompleta fica desconhecida.
4. Usar inventory.template.json como estrutura inicial. capturedAt=null e items=[] são campos PENDENTES, não um levantamento vazio. Preencher com dados obtidos, guardar o bruto apenas em .local/ e não versionar ou compartilhar os tokens. sourceKind authorized-export é apenas uma declaração de origem a ser revisada.
5. Revisar IAM e uniform bucket-level access separadamente: ACL de objeto ausente ou vazia não prova privacidade do bucket. Registrar exposição por cache/URLs alternativas/versões antigas. Não marcar listing.complete=true enquanto existir nextPageToken ou faltar página, nem allVersions=true sem comprovar a cobertura.

## Gerar relatório e plano offline

No checkout atualizado, com Node 24.19.0:

```powershell
node scripts/legacy-token-plan.mjs .local/inventario-real.json
```

Entradas em array continuam aceitas para preparar operações, mas sem escopo/paginação declarados continuam incompletas. Para a revisão completa, use o envelope do template. A ferramenta grava apenas:

- .local/legacy-token-inventory.json — contagens, estado por objeto, escopo declarado, pendências e SHA-256 da entrada.
- .local/legacy-token-revocation-plan.json — operações candidatas com ambas as precondições, mesmo SHA-256 da entrada e exigência de autorização separada.

Arquivos são gravados localmente com permissões restritas em POSIX e sem valores de tokens. Exit 0 significa que o planejamento local foi gerado; não significa inventário real comprovado, revogação executada ou Fase 1 aprovada. No Windows, proteja a pasta com as permissões normais da sua conta.

Para demonstrar o fluxo com dados falsos, substitua a entrada por docs/phase1/validation-6052659/inventory.synthetic.example.json. Esse exemplo produzirá pendências deliberadas, incluindo metadados privados desconhecidos. As saídas sintéticas desta revisão estão em evidence/synthetic-inventory.json e synthetic-plan.json. Elas não representam produção.

## Execução futura: autorização necessária

Não executar esta etapa em produção nesta tarefa. Antes de uma revogação real, deve haver autorização específica, inventário revisado, backup das evidências e homologação com objetos sintéticos em outro projeto/bucket.

Para cada operação futura, selecionar a generation exata e aplicar ambas as precondições. Um conflito/412 exige reler os metadados e revisar a operação; nunca retirar a precondição nem aplicar a um objeto substituto. Não apagar/recriar o objeto para remover tokens. O repositório não implementa um executor para essas operações.

Na homologação, conferir o mesmo hash de bytes antes/depois, token antigo negado, usuário autorizado lendo pelo gateway, bloqueio bidirecional impedindo novas leituras, terceiro negado e administrador sujeito a MFA/Access. Verificar também todas as versões/ACL/IAM/caches e qualquer URL alternativa identificada no inventário. O teste Storage Emulator rotaciona pela API do emulador e não comprova o PATCH/precondições/IAM reais do GCS.

O aceite S03 exige inventário autorizado completo ou comprovadamente vazio, tratamento de todos os objetos privados identificados, falhas e conflitos resolvidos e controles positivos/negativos de acesso. Até lá, phase1Approved permanece false. Nenhuma autorização de deploy, cobranças, campanha ou Fase 2 decorre desse plano.
