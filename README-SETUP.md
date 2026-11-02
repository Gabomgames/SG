# Something Gamer: atualização da comunidade

## Novidades da versão 14

- Configurações com temas Padrão SG, escuro e claro, apresentação da logo, modo compacto e redução de movimento.
- Tutorial animado de primeiro acesso e central de suporte integrada ao Firestore.
- Navegação e componentes reorganizados para celulares e favicon do SG em todas as páginas.
- Família de selos simples: Verificado, seguido pela Now e seguido pelo SG.
- Chat em tempo real redesenhado: mensagens diretas, servidores, canais, busca, emojis, convite por link, envio com Enter e exclusão das próprias mensagens.
- Eventos comunitários: membros publicam eventos, recebem participantes em tempo real e podem denunciar conteúdo inadequado.
- Área empresarial: solicitação de presença oficial e publicação somente após aprovação administrativa.
- Moderação no painel: análise de empresas, denúncias e remoção de eventos.
- Segurança de conta: idade mínima de 13 anos, dados de nascimento privados, validação de conteúdo, revisão de foto, denúncias com provas, advertências, suspensões e banimento.

O site publicado sai de `dist/`. Rode `npm install` uma vez e, antes de publicar, `npm run verificar && npm run build` (ou `npm run deploy`, que faz os três passos). O código-fonte continua legível no repositório; só o `dist/` é empacotado e ofuscado, e ele não vai para o git. Publique com `firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions`. O Worker `something-gamer-api` fica restrito às funções administrativas; Steam e GIPHY usam Cloud Functions.

O feed fica em `feed.html`, separado do perfil (`dashboard.html`). Publicações de texto, notícias, enquetes, votos, curtidas, comentários e exclusão das próprias postagens usam Firebase Authentication e Firestore. Não abra os HTML pelo protocolo `file://`: use Firebase Hosting ou um servidor local (como Live Server no VS Code).

Para disponibilizar essas alterações no projeto Firebase já configurado, a partir da pasta raiz rode `firebase use something-gamer` e `firebase deploy --only hosting,firestore:rules,firestore:indexes,storage,functions`. O `firestore:indexes` é novo e obrigatório: sem o índice de `notifications` as notificações não carregam. Confirme antes de publicar que esta é a conta/projeto corretos; atualize a página depois do deploy. O usuário precisa estar logado. Se aparecer erro de permissão ao postar, confira o deploy das regras do Firestore.


## Ativar o Worker administrativo no Cloudflare

1. Dentro de `something-gamer-api`, confirme o namespace `SG_AUTH` no `wrangler.jsonc`.
2. Cadastre `ADMIN_UID`, `ADMIN_RECOVERY_EMAIL`, `RESEND_API_KEY` e `RESEND_FROM` com `npx wrangler secret put NOME`.
3. Rode `npx wrangler deploy`. Se a URL do Worker mudar, atualize `steamApiBaseUrl` em `config.js`.
4. Steam permanece nas Cloud Functions; o Worker não recebe credenciais da Steam.

## Selos

- **Gamer Verificado:** depende de assinatura ativa e aprovação administrativa.
- **A Now segue:** concedido ou removido exclusivamente pelo administrador.
- **O SG segue:** concedido ou removido exclusivamente pelo administrador.
- Criadores de conteúdo verificados podem escolher azul, roxo, dourado, rosa ou verde para o selo de verificação. Contas comuns usam o azul oficial.

Os reconhecimentos Now e SG ficam no campo protegido `badges` do usuário. A interface do perfil não permite que o usuário altere esses campos. O painel administrativo e a ação `setBadge` do backend fazem a concessão oficial.


## App Check / reCAPTCHA Enterprise

Guia operacional completo: `CONFIGURAR-RECAPTCHA.md`.

A v40 está preparada para Firebase App Check usando reCAPTCHA Enterprise invisível.
Crie uma chave Web baseada em pontuação para os domínios de produção, registre-a em
**Firebase Console > App Check** e coloque somente a **site key pública** em
`APP_CONFIG.recaptchaEnterpriseSiteKey` no `config.js`. Não coloque secret key no frontend.

Publique primeiro em modo de observação e confira as métricas. Depois habilite enforcement
no Firebase Console para Firestore/Storage. Os endpoints HTTP personalizados das Functions usam o parâmetro `APP_CHECK_ENFORCED`. Deixe `false` durante a observação e defina `true` no deploy quando as métricas estiverem saudáveis.

No GitHub Actions, o workflow de deploy aceita duas **Repository Variables**:
- `RECAPTCHA_ENTERPRISE_SITE_KEY`: Site Key pública; é injetada no `config.js` apenas durante o build.
- `APP_CHECK_ENFORCED`: `false` durante observação e `true` depois da validação das métricas.

Assim a Site Key não precisa ficar gravada no código-fonte do repositório.


A busca de GIFs não usa mais chave no `config.js`. Cadastre `GIPHY_API_KEY` no Secret Manager das Functions; o navegador chama `searchGifs`, que exige login e pode exigir App Check.

O painel também permite conceder/remover o **Selo DEV**. A concessão passa pelo backend e grava a Custom Claim `dev` e o badge protegido no perfil.

## Termos de Uso e bloqueio por versão

O cadastro exige aceite de `termos.html`, `regras.html` e `privacidade.html`. A versão corrente está em `config.js` e também nas Security Rules. Ao alterar uma versão jurídica, atualize os três pontos (`config.js`, `firestore.rules`, `storage.rules`) e publique novamente. Usuários com versão antiga são enviados para `aceitar-termos.html`.
