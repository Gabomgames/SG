# Executar a Beta 0.1 localmente no VS Code

O projeto usa a V69 fornecida, com correções locais. Não é necessário procurar os commits antigos: eles não foram recuperados, por decisão do usuário. Há um histórico inicial novo na branch codex/v69-phase1-local.

## Preparação

Abra a pasta projeto do ZIP ou clone o bundle local em um diretório novo, sem sobrescrever trabalho:

```sh
git clone ../backup/repository.bundle SG-restaurado
cd SG-restaurado
git switch codex/v69-phase1-local
git fsck --full
```

Use Node 24.19.0 (fixado em .node-version/.nvmrc), Java 21 e Git. O lockfile atual do Firebase exige Node >=24.12; Node 22 da CI antiga não é mais suportado. As Functions usam Node 20.20.2 para validação local, mantendo engines.node=20. Com nvm, alterne as versões; no Windows use um gerenciador equivalente e confirme `node --version`.

```sh
nvm install 24.19.0
nvm use 24.19.0
npm ci
nvm install 20.20.2
nvm use 20.20.2
npm ci --prefix functions
node tests/founders.test.mjs
node tests/founders-client.test.mjs
node tests/founders-mirror.test.mjs
nvm use 24.19.0
npm run check:fast
npm run test:runtime
```

check:fast inclui verificador, 73 testes principais, contratos/fixtures, promoção, regressões V65–V69, build e 11 testes SQL. Verifique as contagens reais da sua execução, não use números anteriores como aprovação automática.

## Firebase isolado

Não use projeto real. scripts/test-rules.mjs fixa demo-sg, 127.0.0.1:8085, UI desativada e rejeita opções de projeto.

```sh
npm run test:rules
npm run test:rules:security
npm run test:rules:founders
```

O terceiro comando usa transações reais no Firestore Emulator com identidades Auth sintéticas. Não certifica Auth/App Check de produção. O segundo contém os casos negativos S01 da auditoria (enquetes/votos); espera-se que evidenciem a lacuna ainda não corrigida do baseline, fora da expansão promocional autorizada. Não afrouxe asserts nem considere esses casos aprovados sem executar. O JAR deve ser obtido pelo Firebase CLI do serviço oficial storage.googleapis.com com TLS verificado.

## Navegador

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Em Linux novo, pode ser necessário `npx playwright install --with-deps chromium`. A suíte existente contém 24 casos, usa servidor local e fixtures explicitamente identificadas. Destinos externos não simulados são bloqueados. Não valide contas ou pagamentos reais por essa suíte. O servidor de desenvolvimento (`npm run dev`) serve arquivos locais, mas a configuração padrão do produto ainda contém endpoints de produção; para checks funcionais seguros use as fixtures dos testes. Não faça login real para testar esta entrega.

## Fundadores

Consulte FOUNDERS.md. A promoção está desativada no frontend e no backend e não possui campanha ativa em produção. Os testes de domínio habilitam a campanha exclusivamente nas fixtures; o teste de emulador usa somente demo-sg. Não habilite flags, crie campanha de produção ou execute deploy sem autorização explícita.

## GitHub e segredos

Destino informado: https://github.com/Gabomgames/SG.git. Confirme a visibilidade por consulta autenticada `gh api repos/Gabomgames/SG --jq .private`; somente true atende ao requisito. Erro/404/403 e private=true no package.json não comprovam privacidade.

Antes de qualquer envio, execute `git add .` e `python3 scripts/scan-secrets.py`, revise o diff e os arquivos incluídos. O scanner não prova ausência de todo segredo possível. Nunca inclua .env, service accounts, node_modules ou credenciais locais. Não faça push sem nova autorização explícita do usuário, mesmo que o destino seja privado. Não use --force, --all ou --mirror; não faça merge na main. Nenhum deploy está autorizado.
