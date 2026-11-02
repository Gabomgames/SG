# Configuração e limites da V60

Não publicar sem homologação. O ZIP original é o backup verificável; o inventário SHA-256 está em `INVENTARIO_ORIGINAL.json`. Nenhum banco ou conta real foi alterado. Todos os comandos desta página são instruções para execução futura, não operações realizadas nesta entrega.

## Preparação local

Use Node 22 ou 24, Java 21 para o emulador e Python 3 para testes SQLite/servidor local. Execute `npm ci`, `npm run verificar`, `npm test`, `python tests/sqlite.test.py`, `npm run test:rules`, `npx playwright install chromium`, `npm run build`, `npm run test:e2e`. O frontend permanece estático e o build gera `dist/`. Não publique o diretório de fontes.

O build salva o nome aleatório do painel em `.local/admin-route.json`, fora do Hosting e do Git. Guarde esse arquivo privadamente. O endereço é complementar; não concede acesso. Cada novo build muda o caminho.

## Pagamentos do Worker

Os flags `PAYMENTS_ENABLED`, `ADMIN_ENABLED`, `PUBLIC_MEDIA_ENABLED` e `ALLOW_LOCAL_ORIGINS` começam em `false`. Isso é deliberado: a configuração atual não contém os serviços necessários para validar cobrança ou anexos privados.

1. Escolha um D1 para homologação, verifique limites/custos no plano atual e associe o binding `SG_DB`. Não criamos banco nem aprovamos custos. Exemplo de bloco a adicionar, substituindo os placeholders:

```json
"d1_databases": [{"binding":"SG_DB","database_name":"NOME_ESCOLHIDO","database_id":"ID_DO_BANCO","migrations_dir":"migrations"}]
```

2. Aplique `something-gamer-api/migrations/0001_payments.sql` ao banco de teste. A migração é idempotente, não apaga tabelas e não importa automaticamente pedidos antigos do KV.
3. Cadastre **somente no gerenciador de secrets**: `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `FIRESTORE_SERVICE_ACCOUNT`. Não cole valores no chat. A conta de serviço usa a API REST do Firestore, sem necessidade de implantar Cloud Functions; limite as permissões IAM e revise custo/quota das operações Firestore. Não habilitar Blaze.
4. Defina `MERCADOPAGO_COLLECTOR_ID` e `FIREBASE_PROJECT_ID` no servidor. `PAYMENT_ENV=test` exige token de teste; produção exige token de produção. Tokens do tipo errado são recusados. Cadastre exatamente `/payments/webhook` no modo correto da aplicação Mercado Pago.
5. Valide o schema **da modalidade Orders online / Checkout Pro que sua conta realmente habilita**. O código exige `ORD...`, `external_reference`, `total_amount`, BRL, recebedor e todas as transações `processed/accredited`. Se a resposta legítima difere, adapte usando a documentação da modalidade e fixtures reais sanitizadas. Não enfraqueça validação para simulador.
6. Teste Orders sandbox completos: pendente, aprovado, valor/recebedor divergentes, reenvio, estorno, indisponibilidade e análise. Só então considere ativar `PAYMENTS_ENABLED` em homologação.
7. Configure cron opcional `"triggers":{"crons":["*/15 * * * *"]}` para o handler de reconciliação. Até 25 pedidos por execução. Avalie o custo desse cron e aumente intervalo se necessário. Sem cron, `/payments/status` e webhook ainda reconciliam o pedido.
8. O D1 é autoridade financeira; o Firestore é uma projeção do selo. Falhas de projeção mantêm `mirror_pending`. Verificação só fica ativa após decisão administrativa com motivo e validade; pagamento não aprova identidade. O espelhamento entre D1 e Firestore ainda precisa de teste de concorrência e falhas reais, inclusive múltiplos pedidos do mesmo usuário. Não declarar pronto para produção.

Rotas: POST `/payments/create` recebe `plan` e `idempotencyKey`; `/payments/list` retorna até 30 pedidos da conta; `/payments/status` recebe `orderId`; `/payments/webhook` exige HMAC; `/payments/review` recebe `orderId`, `decision` (`approved`/`rejected`) e `reason`.

Não há API de reembolso automático nova. Estornos já existentes no provedor revogam benefício na reconciliação. Análise de rejeição e reembolso exige política comercial revisada.

## Incidente webhook 401

Permanece aberto **no ambiente externo**. O ZIP recebido tinha webhook sem assinatura, incompatível com o incidente informado. A correção local foi testada com HMAC válido e inválido. Isso não comprova que o secret da URL registrada é o correto.

Confira modo TEST/PROD, aplicação, URL, origem do secret, query `data.id`, `x-request-id` e `x-signature`. O manifesto é `id:<ID normalizado>;request-id:<header>;ts:<ts>;`. Não registrar secret, tokens ou payloads sensíveis. IDs numéricos do simulador autenticado recebem `ignored:true`; nunca viram Order financeiro. Não é prova de checkout funcional.

## Administração

Acesso direto administrativo às regras Firestore/Storage foi retirado. As ações comuns do painel passam a `adminApi`, mas esse backend legado é Cloud Functions e pode exigir Blaze: **não implantar sem autorização**. Ações de moderação avançadas ainda dependem de migração ao backend; o painel completo está bloqueado até a infraestrutura segura existir.

O Worker `/payments/review` exige: UID autorizado server-side, claim Firebase `admin`, email verificado, MFA no token, autenticação há no máximo 15 minutos e JWT Cloudflare Access com assinatura, issuer, audience, identidade e expiração válidos. Configure `ADMIN_UID`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` e, após validar os controles, `ADMIN_ENABLED=true`.

Cloudflare Access deve ter política de identidade do dono + postura de dispositivo, bloqueio por padrão e recuperação segura. O JWT sozinho prova identidade Access, **não prova qual computador está autorizado**: isso depende da política realmente aplicada no provedor. `workers.dev`/URL direta continua exigindo JWT válido. Para APIs legadas de Functions, a política equivalente exige `SG_ADMIN_ENABLED`, Access verificado e MFA. Sem essa configuração permanecem negadas.

O painel ainda não tem interface integrada à revisão D1; `/payments/review` existe para integrar um painel seguro futuro. Não habilitar a verificação como serviço comercial sem concluir essa integração.

A recuperação por código mestre foi removida. Cadastre uma nova senha administrativa no provedor e MFA/passkey quando viável; nunca guarde senha no fonte. Rotacione no provedor a senha anteriormente exposta, sem repeti-la. O caminho secreto não substitui esses controles.

## Chat e mídia

Mensagens continuam no Firestore, não em KV. IDs UUID e batch mensagem/resumo evitam repetição no retry. Duas contas foram exercitadas no emulador de regras; não equivalem a teste de navegadores autenticados em produção. Histórico usa cursor; presença online fictícia e polling paralelo foram removidos. Digitação é opcional. Bloqueio impede leitura do histórico e novos envios; a caixa de entrada mantém resumos de conversas já existentes. Dados já lidos/cacheados não podem ser retirados do dispositivo remoto.

Novos anexos privados são bloqueados antes do upload. Não usamos URLs Firebase de download permanentes para fingir isolamento. Para habilitar, escolher armazenamento dentro do orçamento, validar membership em cada leitura, tipos/assinatura/tamanho, expiração/revogação e proteção de menores. O Worker público existente não atende isso.

`PUBLIC_MEDIA_ENABLED=false` também fecha a leitura das mídias legadas enquanto não se distingue o que era post público do que era anexo privado. Não apaga mídia ou mensagens. Este é um impacto visível necessário para conter o vazamento. Revise os objetos com backup e migração antes de reabrir. Tipos binários validados não substituem antivírus nem garantem conteúdo seguro. KV continua inadequado para inventário, pagamentos, saldos e quotas atômicas.

Em Configurações: opt-in de cache persistente, opt-in de digitação, lista de bloqueados e limpeza explícita de histórico local. Sem opt-in o cache é de memória; ao fechar a aba offline, mensagens não confirmadas podem se perder. Mantenha-a aberta até confirmação.

## Market, ADS e planos

Now Market tem catálogo paginado de produtos físicos, filtros sobre anúncios carregados, detalhes e salvos por conta. Produtos digitais/serviços não são habilitados sem política. Favoritos são locais e não sincronizam entre dispositivos. O contato inicia pelo perfil e exige amizade no Chat SG. Ainda não há checkout, estoque/reserva, split OAuth, frete, avaliações pós-compra, disputas completas ou repasse automático. Dados históricos não são apagados.

NOW ADS salva rascunhos persistentes com métricas zeradas, não permite autoatribuir métricas e não cobra. Não há motor de entrega nem antifraude pronto. Campanhas pagas legadas ficam em revisão, não são ativadas por simples pagamento.

Creator+, Seller Pro e Community Pro mostram preços previstos e novas adesões ficam indisponíveis até benefícios validados. Cancelamento legado continua disponível quando o backend estiver acessível. Preapproval autorizado **não** é pagamento: não ativa mais benefício nem prorroga validade em cada reconciliação.

## Rollback

Antes de publicar, exportar regras/configuração e dados no provedor por um método disponível no plano; verificar restauração. Guardar o ZIP original e o novo. Não copiar D1 sobre KV nem apagar pedidos antigos. Reverter código/build pode ser feito com o ZIP original ou o commit baseline local. **Não restaurar regras permissivas/webhook sem HMAC em produção**; rollback de segurança deve manter correções críticas. A migração D1 é aditiva: conservar tabelas e exportar os registros, sem `DROP`.

Deploy precisa de autorização explícita e homologação. Nenhum deploy foi executado nesta entrega. Não usar os scripts antigos `PUBLICAR-*` nem `deploy:all` sem revisar flags, custos de Functions/Storage e alterações de regras.
