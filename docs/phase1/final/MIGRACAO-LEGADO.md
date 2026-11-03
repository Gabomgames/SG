# S02/S03 — compatibilidade e revogação do legado

Este é um procedimento preparado, não uma migração executada. Não houve consulta, alteração, remoção ou revogação de objetos reais. Qualquer aplicação em produção fica fora desta tarefa e depende de autorização separada. Não há executor destrutivo/oculto no projeto.

## Homologação local obrigatória

Execute as três suítes e os 26 casos conforme WINDOWS-VSCODE.md. O caso Storage prova o problema com URL/token antigo usando somente `demo-sg` e 127.0.0.1:9199, então rotaciona o token pela API do emulador e confirma 403 na URL anterior e preservação dos bytes. O runtime testa o gateway bloqueando leitura antes de obter bytes GCS. Ele não substitui a prova das regras.

Limite concreto do Storage Emulator instalado: sua gestão interna dos tokens difere do GCS e não testa `ifMetagenerationMatch` do PATCH de metadados. Portanto, o teste local não é uma prova de revogação em GCS real. Esse passo requer homologação separada, com objetos sintéticos, antes de qualquer migração autorizada de produção.

## Inventário local e plano sem rede

Com um inventário obtido em etapa autorizada, mantenha-o apenas em `.local` (ignorado). Entrada: array de metadados GCS, com name, bucket, metageneration e metadata. Exemplo sintético, sem credencial real:

```json
[
  {
    "bucket": "demo-sg.appspot.com",
    "name": "chat/alice/alice_bob/exemplo.png",
    "metageneration": "3",
    "metadata": {"firebaseStorageDownloadTokens": "somente-fixture-local"}
  }
]
```

No PowerShell, depois de salvar esse exemplo em `.local/inventario-sintetico.json`:

```powershell
node scripts/legacy-token-plan.mjs .local/inventario-sintetico.json
Get-Content .local/legacy-token-revocation-plan.json
```

A ferramenta não chama nuvem, não imprime valores dos tokens e não altera metadados. Prepara para chat/reports/profile-review uma remoção do campo firebaseStorageDownloadTokens, com precondição da metageneration observada e preservação dos bytes. Não use o plano após alteração concorrente dos metadados: reinvente a operação a partir de inventário atualizado e revisão, sem ignorar 412.

## Sequência de homologação autorizada antes do aceite S03

1. Em projeto/bucket de homologação separado, com identidades e dados sintéticos, conferir todos os prefixes privados existentes. Confirmar bucket/dono/conversa/relato/foto, vínculo canônico, hashes de bytes e tokens emitidos. Ausência de acesso ao inventário não equivale a inventário vazio.
2. Validar o gateway com contas A e B participantes, C estranha e administrador com/sem MFA+Access. Conferir leitura antes do bloqueio, negação após bloqueio em ambas as direções, conta desabilitada/revogada e não vazamento de token. Para perfil/evidência, conferir gateway administrativo com contexto correto.
3. Configurar a conta de serviço somente no secret backend, restrita ao projeto e com leitura de objetos (GCS `storage.objects.get`); nunca nos fontes/ZIP/frontend. Conferir IAM efetivo em homologação. O código fixa o escopo OAuth `devstorage.read_only` para mídia, sem concessão de escrita. O serviço usa datastore separadamente para Firestore.
4. Aplicar em homologação a revogação/redução de acesso de cada objeto privado, com precondições de metadados e sem substituir/apagar bytes. Validar PATCH com a API GCS real; este repositório fornece apenas o plano, sem credenciais ou comando de execução em produção.
5. Repetir as URLs antigas capturadas: sem autenticação, devem ser negadas. Confirmar que usuário autorizado ainda recebe o mesmo hash pelo gateway e que bloqueado/estranho não recebe bytes. Confirmar que nenhum metadata.customMetadata, ACL pública, cache público ou URL assinada alternativa continua expondo o mesmo objeto privado. Não escrever tokens nas evidências compartilhadas.
6. Registrar quantidade inventariada, quantidade revogada, falhas, conflitos, bytes preservados e controles positivos/negativos. Somente inventário comprovadamente vazio ou 100% dos objetos privados tratados e revalidados permite encerrar essa parte de S03. Não há aceitação automática de risco para tokens restantes.

O ajuste em Storage Rules nega SDK direto para privado, mas tokens antigos só serão invalidados após tratamento real. O código desta tarefa não pode retroativamente invalidá-los. Bytes que alguém já baixou permanecem fora do controle do aplicativo.

## Compatibilidade das mídias públicas antigas (S02)

O novo gateway não torna registros KV antigos públicos por adivinhação. Não os apaga. Uma migração autorizada deve:

1. Inventariar metadados KV `media:<id>` e referências em posts, users, marketListings e reports. Conferir proprietário real e finalidade; não inferir autorização só de um ID ou URL conhecido.
2. Revisar cada objeto e realizar adoção explícita pelo endpoint `/admin/media/adopt-legacy`, protegido por `requireAdmin`. Corpo: id de 48 hex, purpose post/profile/market/report, resourceId canônico e reason de 10–500 caracteres. O backend confere bytes/autoria/vínculo, cria auditoria, copia ao armazenamento privado e registra SHA/estado aprovado. Mantém o objeto KV original e ID/URL.
3. Para Firebase Storage público legado (posts/profiles), manter leitura autenticada existente e revisar a situação separadamente: não reenquadrar conteúdo privado como público só para recuperar um link. Novas escritas diretas ficam negadas.
4. Conferir que nenhuma foto/post/anúncio/prova ficou inacessível e que a migração não mudou conteúdo, autoria, preços, planos, selo, promoção ou permissões. Concluir controles positivos antes de qualquer troca do serviço em produção.

Integração nova exige a migração D1 `0017_publication_security.sql`, SG_DB e armazenamento privado; flags `PUBLIC_MEDIA_ENABLED` e `POST_MODERATION_ENABLED` permanecem false no arquivo de configuração. Não foram aplicadas migrações remotas ou flags nesta tarefa. Não ativar uma parte isolada: recibos, regras, backend, UI e compatibilidade do legado devem estar homologados juntos. Essas flags não ativam a campanha dos 50 Fundadores; seus gates separados continuam desligados.
