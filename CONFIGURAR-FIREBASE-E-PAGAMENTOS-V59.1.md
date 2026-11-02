# Firebase + Mercado Pago — V59.1

## Erro `firebase use must be run from a Firebase project directory`

Este projeto **já está inicializado**. Não execute `firebase init`, pois a raiz já contém `firebase.json` e `.firebaserc`.

No PowerShell, primeiro entre na pasta descompactada que contém esses arquivos.

Exemplo:

```powershell
cd "C:\Users\SEU_USUARIO\Downloads\Something-Gamer-V59.1-BRAND-FIX-COMPLETE"
dir firebase.json
```

Se `firebase.json` aparecer, você está na pasta correta.

Depois:

```powershell
firebase login
firebase use something-gamer
```

O projeto padrão também já está registrado em `.firebaserc` como `something-gamer`.

## Configurar secrets do Mercado Pago

Ainda na raiz do projeto:

```powershell
firebase functions:secrets:set MERCADO_PAGO_ACCESS_TOKEN
firebase functions:secrets:set MERCADO_PAGO_WEBHOOK_SECRET
```

Cole cada segredo somente quando o terminal solicitar. Não grave tokens no HTML/JavaScript público.

Depois publique as Functions:

```powershell
firebase deploy --only functions --project something-gamer
```

## Importante

- Comece usando credenciais de teste.
- O retorno do navegador não libera compras, planos ou campanhas sozinho.
- A confirmação final deve vir do webhook/backend.
- Verificação Gamer, planos, Now ADS e Now Mark devem ser testados separadamente antes de trocar para produção.
