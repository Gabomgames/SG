# Admin seguro — V58.2

A V58.2 não autoriza administrador por e-mail, localStorage, senha JavaScript ou lista de UIDs nas regras públicas.

## Modelo de autorização

1. O usuário autentica normalmente no Firebase Auth.
2. Uma rotina privilegiada com Firebase Admin SDK atribui `admin: true` e `role`.
3. O cliente recebe a claim somente após renovar o ID token (normalmente sair/entrar).
4. Firestore Rules valida `request.auth.token.admin == true`.
5. Cloud Functions valida o ID token e a claim novamente.

## Conceder acesso

Use somente em ambiente local/seguro com credenciais administrativas:

```bash
cd functions
GOOGLE_APPLICATION_CREDENTIALS=/caminho/service-account.json node scripts/set-admin.js UID super_admin
```

Roles aceitas pelo script:
- `super_admin`
- `admin`
- `moderator`
- `support`
- `finance`

Na V58.2, `admin` e `super_admin` recebem a claim `admin: true`. Papéis mais granulares devem ser aplicados nas APIs conforme cada módulo for separado.

## Regras

Nunca coloque service account no Hosting, app Android, Electron ou repositório público.
Não crie endpoint público "make-admin" / "bootstrap-admin".
Ative MFA para contas administrativas quando disponível.
Para segurança adicional, proteja a rota administrativa também com Cloudflare Access/Zero Trust.
