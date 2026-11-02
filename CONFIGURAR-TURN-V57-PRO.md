# CALL NOW — configurar Cloudflare Realtime TURN

A V57 PRO já contém a integração de TURN no front-end e no Cloudflare Worker. O segredo **não fica no navegador**: o Worker autentica o usuário Firebase + App Check e gera credenciais TURN temporárias.

## 1. Criar a chave TURN

No Cloudflare Dashboard, abra **Realtime > TURN** e crie uma TURN key para o Something Gamer.

Você receberá dois valores que devem ficar somente no servidor:

- TURN Key ID
- TURN Key API Token

## 2. Salvar como secrets do Worker

Abra um terminal na pasta `something-gamer-api` e execute:

```bash
npx wrangler secret put CLOUDFLARE_TURN_KEY_ID
npx wrangler secret put CLOUDFLARE_TURN_KEY_API_TOKEN
```

Cole cada valor quando o Wrangler solicitar.

## 3. Publicar o Worker

```bash
npm ci
npm run deploy
```

Se o seu `package.json` usa outro nome de script, também pode publicar com:

```bash
npx wrangler deploy
```

## 4. Publicar as regras do Firestore

A V57 PRO adiciona recuperação de ICE e libera áudio no chat/servidores. Portanto publique também `firestore.rules`.

```bash
firebase deploy --only firestore:rules
```

## 5. Como validar

1. Abra duas contas do SG em redes diferentes (por exemplo: Wi-Fi e 4G/5G).
2. Faça uma chamada pelo Call Now.
3. O indicador de rede da chamada mostra a qualidade e exibe `TURN` quando o relay estiver sendo usado.
4. Teste vídeo, compartilhar tela, minimizar a chamada e continuar enviando mensagens.
5. Desative/troque de rede por alguns segundos e volte: a V57 PRO tenta renegociar a rota automaticamente.

## Segurança

Nunca coloque `CLOUDFLARE_TURN_KEY_API_TOKEN` no `config.js`, HTML ou JavaScript público. O navegador recebe apenas credenciais temporárias de curta duração.
