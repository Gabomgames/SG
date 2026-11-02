# Configurar pagamentos do Something Gamer — V57 PRO

O projeto usa Mercado Pago no backend. Nunca coloque Access Token no HTML, JavaScript do navegador ou repositório público.

## 1. Criar a aplicação no Mercado Pago
1. Entre no painel Mercado Pago Developers com a conta da NOW.
2. Abra **Suas integrações** e crie uma aplicação para o Something Gamer.
3. Comece com credenciais de **teste**.
4. Depois dos testes, ative as credenciais de **produção** e informe o domínio oficial do SG.

## 2. Copiar as credenciais
Você precisará principalmente de:
- `Access Token`: segredo usado somente no backend.
- `Public Key`: usada apenas quando uma experiência frontend do Mercado Pago exigir.
- `Client ID` e `Client Secret`: necessários para OAuth/Marketplace quando vendedores conectarem suas próprias contas.

## 3. Configurar Firebase Functions
Na raiz do projeto, faça login no Firebase e configure os secrets usados pelas Functions. O nome exato esperado pelo projeto deve ser conferido em `functions/index.js`.

Exemplo de fluxo:
```powershell
firebase login
cd functions
npm ci
cd ..
firebase functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN
firebase functions:secrets:set MERCADO_PAGO_WEBHOOK_SECRET
```
Cole os valores quando o terminal solicitar. Não grave os tokens em arquivos versionados.

## 4. Publicar as Functions
```powershell
firebase deploy --only functions
```
Depois confirme no Firebase Console se estão publicadas, principalmente as funções relacionadas a:
- checkout do ecossistema;
- assinatura Creator+/Community Pro/Seller Pro;
- verificação Gamer;
- webhooks de pagamentos e assinaturas.

## 5. Configurar Webhooks no Mercado Pago
No painel da aplicação do Mercado Pago:
1. Abra **Webhooks / Notificações**.
2. Cadastre as URLs HTTPS das Functions publicadas.
3. Habilite os eventos usados por pagamentos e assinaturas.
4. Gere/copiei a assinatura secreta do webhook e salve-a no secret `MERCADO_PAGO_WEBHOOK_SECRET`.
5. Faça um teste de notificação pelo próprio painel.

O SG deve considerar o backend/webhook como fonte da verdade. A tela `?payment=success` não deve, sozinha, liberar produto, assinatura, selo ou campanha.

## 6. Creator+, Community Pro e Seller Pro
Esses três planos usam assinaturas recorrentes.
Fluxo esperado:
1. Usuário clica em **Assinar**.
2. `createEcosystemSubscription` cria a assinatura no Mercado Pago.
3. Usuário conclui o checkout.
4. Mercado Pago chama `ecosystemSubscriptionWebhook`.
5. O backend grava o status em `users/{uid}.monetization`.
6. O frontend libera recursos somente quando `status === "active"`.

## 7. Verificação Gamer
Fluxo:
1. Usuário seleciona o plano de verificação.
2. Backend cria assinatura.
3. Webhook confirma pagamento.
4. Conta fica pendente de análise administrativa.
5. Admin aprova.
6. O selo só fica ativo quando pagamento + análise estiverem válidos.

## 8. Now ADS
Fluxo:
1. Criar campanha.
2. Definir orçamento.
3. `createEcosystemCheckout` cria o checkout.
4. Campanha fica `awaiting_payment`.
5. Webhook confirma pagamento.
6. Somente então a campanha pode mudar para ativa e consumir orçamento.

Nunca confie no valor enviado pelo navegador. O backend deve validar preço/orçamento.

## 9. Now Mark — compra normal
Fluxo atual recomendado:
1. Comprador abre o anúncio.
2. Backend lê o produto e o preço no Firestore.
3. Backend cria o checkout.
4. Pedido fica aguardando pagamento.
5. Webhook confirma.
6. Pedido muda para pago.
7. Vendedor é avisado.

## 10. Now Mark — split automático entre SG e vendedor
Para um Marketplace real com repasse automático, configure Mercado Pago Marketplace/OAuth.

Cada vendedor deve clicar em **Conectar Mercado Pago** e autorizar a NOW. O SG recebe um `authorization_code`, troca por Access Token do vendedor no backend e armazena as credenciais com segurança. Na criação do pagamento, use o token do vendedor e configure a comissão da plataforma (`marketplace_fee`, quando aplicável ao checkout escolhido).

Também implemente:
- refresh token;
- desconexão da conta;
- estado do onboarding financeiro;
- política de reembolso e disputa;
- conciliação de pagamentos;
- histórico de repasses;
- auditoria administrativa.

## 11. Testar antes de produção
Use contas de teste separadas para vendedor e comprador.
Teste pelo menos:
- pagamento aprovado;
- pagamento pendente;
- pagamento recusado;
- cancelamento de assinatura;
- renovação recorrente;
- webhook duplicado;
- webhook fora de ordem;
- produto sem estoque;
- campanha sem saldo;
- reembolso;
- vendedor sem OAuth conectado.

## 12. Checklist de produção
- HTTPS no domínio oficial.
- Access Token apenas no backend.
- Webhook validado por assinatura.
- Firestore Rules revisadas.
- App Check habilitado quando aplicável.
- Logs de pagamentos sem gravar dados sensíveis.
- Política de privacidade/termos atualizados para NOW.
- Conta Mercado Pago da NOW verificada.
- OAuth Marketplace configurado antes de split automático.
- TURN configurado separadamente para Call Now.

## Arquivos principais deste projeto
- `functions/index.js`: pagamentos, assinaturas e webhooks Firebase.
- `ecosystem.js`: abertura de checkout e leitura de status.
- `monetization.html`: interface dos planos.
- `verification.html`: fluxo de Verificação Gamer.
- `marketplace.html`: Now Mark.
- `ads.html`: Now ADS.
