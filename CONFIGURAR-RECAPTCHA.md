# App Check + reCAPTCHA Enterprise — Something Gamer

O projeto usa **Firebase App Check com reCAPTCHA Enterprise invisível**. Não é a caixa "Não sou um robô".

## 1. Criar a Site Key

No Google Cloud do projeto `something-gamer`, crie uma chave **reCAPTCHA Enterprise Web baseada em pontuação** e autorize os domínios:

- `something-gamer.web.app`
- `something-gamer.firebaseapp.com`
- qualquer domínio próprio usado em produção

Não autorize `localhost` na chave de produção.

## 2. Registrar no Firebase App Check

No Firebase Console, abra **App Check**, selecione o aplicativo Web e registre o provedor reCAPTCHA Enterprise usando a chave criada acima.

## 3. Informar a Site Key ao site

### Deploy pelo GitHub Actions — recomendado

Crie a Repository Variable:

`RECAPTCHA_ENTERPRISE_SITE_KEY`

O workflow `.github/workflows/deploy.yml` injeta essa chave pública em `config.js` somente durante o build.

### Deploy manual

Preencha em `config.js`:

```js
recaptchaEnterpriseSiteKey: "SUA_SITE_KEY_PUBLICA"
```

A Site Key é pública. **Nunca** coloque secret key, credenciais de serviço ou tokens privados no frontend.

## 4. Publicar primeiro sem bloqueio

Mantenha `APP_CHECK_ENFORCED=false` durante a fase inicial. Publique o app e confira as métricas no Firebase App Check.

## 5. Ativar enforcement

Quando os acessos legítimos aparecerem como verificados:

1. Ative enforcement de **Cloud Firestore** e **Cloud Storage** no Firebase Console.
2. Se desejar, ative também para os demais produtos compatíveis que o projeto usar, depois de conferir as métricas.
3. No GitHub, defina a Repository Variable `APP_CHECK_ENFORCED=true` e rode novamente o workflow de deploy. Isso faz os endpoints HTTP próprios das Functions rejeitarem requests sem token App Check válido.

## Desenvolvimento local

Para ativar token de debug somente no navegador local:

```js
localStorage.setItem("sgAppCheckDebug", "1")
```

Recarregue, copie o token exibido no console e registre-o em **App Check > Debug tokens**. Ao terminar:

```js
localStorage.removeItem("sgAppCheckDebug")
```

Nunca use token de debug em produção.
