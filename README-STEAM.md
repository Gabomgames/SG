# Ativação das integrações e do painel administrativo

## Ordem recomendada no VS Code (Windows)

Abra a pasta do projeto no VS Code e use **Terminal → Novo Terminal**. Execute primeiro:

```bash
npm install -g firebase-tools
firebase login
firebase use something-gamer
cd functions
npm install
cd ..
```

Depois cadastre os segredos, um por vez:

```bash
firebase functions:secrets:set STEAM_API_KEY
firebase functions:secrets:set RAWG_API_KEY
firebase functions:secrets:set ADMIN_UID
firebase functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set EMAIL_FROM
firebase functions:secrets:set RESET_CODE_SECRET
firebase functions:secrets:set MERCADO_PAGO_WEBHOOK_SECRET
firebase functions:secrets:set GIPHY_API_KEY
firebase deploy --only functions,firestore:rules,firestore:indexes,storage,hosting
```

Cadastre cada informação somente quando o terminal solicitar:

- `STEAM_API_KEY`: chave da Steam Web API;
- `RAWG_API_KEY`: chave criada em `https://rawg.io/apidocs`, usada pelo catálogo online sem expor a credencial no navegador;
- `ADMIN_UID`: UID da sua conta, disponível em Firebase Console → Authentication → Usuários;
- `MERCADO_PAGO_ACCESS_TOKEN`: credencial de produção da sua aplicação Mercado Pago;
- `RESEND_API_KEY`: chave com permissão somente para envio de e-mails;
- `EMAIL_FROM`: remetente em domínio verificado, por exemplo `Something Gamer <contato@seudominio.com.br>`;
- `RESET_CODE_SECRET`: sequência aleatória longa, exclusiva e privada para proteger os códigos de recuperação;
- `GIPHY_API_KEY`: chave da GIPHY usada somente pela Cloud Function `searchGifs`; não fica no navegador;
- `MERCADO_PAGO_WEBHOOK_SECRET`: **obrigatório**. Está no painel do Mercado Pago em *Suas integrações → sua aplicação → Webhooks → Assinatura secreta*. Sem ele o `mercadoPagoWebhook` recusa tudo com 401 e os pagamentos param de ser confirmados: o endpoint é público, e sem conferir a assinatura qualquer pessoa podia chamá-lo.

Na tela inicial do Resend, copie a chave recém-criada e use-a quando o terminal solicitar `RESEND_API_KEY`. Não é necessário executar o exemplo “Hello World” exibido pelo Resend. Antes de enviar e-mails para todos os usuários, abra **Domínios** no Resend, adicione seu domínio e configure os registros DNS indicados. Só então defina `EMAIL_FROM`, por exemplo `Something Gamer <contato@seudominio.com.br>`.

A biblioteca mostra “Catálogo aguardando ativação” quando a função `searchGames` ainda não foi publicada. Crie uma chave em `https://rawg.io/apidocs`, cadastre-a em `RAWG_API_KEY` e publique as funções. Após o deploy terminar, volte à biblioteca e clique em **Tentar novamente**.

Não coloque essas informações em `config.js`, `firebase.js`, HTML ou GitHub.

A assinatura da **Verificação Gamer** é criada diretamente pelo servidor. O plano mensal custa **R$ 14,90** e o anual custa **R$ 149,90**, com economia de R$ 28,90. Para alterar os valores, atualize `transaction_amount` na função `createVerificationSubscription`.

## E-mails e recuperação de senha

Crie uma conta no Resend, valide o domínio usado em `EMAIL_FROM` e gere uma chave com permissão apenas para envio. O sistema enviará:

- código de seis dígitos para redefinir a senha;
- confirmação de pagamento autorizado;
- confirmação de aprovação do selo pelo administrador.

Os códigos expiram em 10 minutos, aceitam até cinco tentativas, respeitam intervalo mínimo de reenvio e são armazenados apenas como hash. Depois da troca, o navegador entra novamente com a nova senha.

Seu painel exclusivo ficará disponível em:

`https://something-gamer.web.app/admin.html`

O acesso administrativo é ligado ao `ADMIN_UID`. Na primeira abertura do painel, a Cloud Function valida esse UID e concede a Custom Claim `admin`; Firestore e Storage confiam somente nessa claim. Não há lista de e-mails administrativos no frontend nem nas regras.

O projeto usa o endereço padrão `https://something-gamer.web.app`. Se o domínio principal for outro, altere `APP_URL` em `functions/index.js` e inclua o domínio na lista `allowedOrigins`.

Para desenvolvimento local, execute:

```bash
firebase emulators:start
```

Em `localhost` ou `127.0.0.1`, o site ativa automaticamente o **Modo developer** e não pula as telas de login/cadastro. Em produção, uma pessoa que já esteja autenticada é encaminhada diretamente ao onboarding ou ao feed. Para testar o modo developer fora do computador local, use no console do navegador:

```js
localStorage.setItem("sgDeveloperMode", "true")
```

Para desativá-lo:

```js
localStorage.removeItem("sgDeveloperMode")
```

O feed social usa as coleções `posts`, `likes`, `comments`, `votes`, `friendRequests` e `interests`. Publique também as regras do Firestore para ativar curtidas, comentários, enquetes, amizades e avisos de eventos.

Antes de publicar, confirme que o projeto ativo é `something-gamer` com `firebase use`.

As funções agendadas, necessárias para conferir diariamente o estado das mensalidades, podem exigir que o projeto Firebase esteja no plano Blaze.

## Biblioteca e plataformas

A biblioteca pesquisa jogos reais pela RAWG. A Steam importa biblioteca, horas recentes e um resumo de conquistas dos jogos mais utilizados. Esses dados dependem das configurações de privacidade do perfil Steam.

O login da Steam existia duplicado: o mesmo fluxo em `functions/index.js` e no Worker do Cloudflare. Ficou só o das Cloud Functions (`steamStart` e `steamCallback`), que grava no Firestore com o Admin SDK. Antes o navegador recebia os dados da Steam e os gravava sozinho: dava para inventar biblioteca e conquistas editando a requisição. Hoje esses campos não estão na lista que o usuário pode escrever nas regras do Firestore.



## Worker administrativo (Cloudflare)

O Worker não usa mais lista de e-mails para autorizar administrador. Cadastre como secrets:

```bash
cd something-gamer-api
npx wrangler secret put ADMIN_UID
npx wrangler secret put ADMIN_RECOVERY_EMAIL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
```

`ADMIN_UID` deve ser o mesmo UID configurado nas Functions. `ADMIN_RECOVERY_EMAIL` fica somente como secret do Worker e não deve ser colocado em `wrangler.jsonc`.

## App Check / reCAPTCHA Enterprise

1. Crie uma chave **reCAPTCHA Enterprise Web baseada em pontuação** para os domínios de produção.
2. Registre a mesma chave em **Firebase Console > App Check > Web app**.
3. Coloque apenas a site key pública em `recaptchaEnterpriseSiteKey` no `config.js`.
4. Publique em observação e confira as métricas.
5. Ative enforcement de Firestore e Storage no Firebase Console.
6. Nas Functions, defina o parâmetro `APP_CHECK_ENFORCED=true` no deploy para exigir `X-Firebase-AppCheck` nos endpoints próprios.

Para localhost, execute `localStorage.setItem("sgAppCheckDebug","1")`, recarregue, copie o token de debug exibido no console e cadastre-o no App Check. Remova com `localStorage.removeItem("sgAppCheckDebug")`.
