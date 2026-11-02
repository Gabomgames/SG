# Something Gamer V68 — Redesign Gamer / Now Call

Esta versão é uma evolução **do seu projeto original V67**, não um protótipo substituto. Preserva a arquitetura, as contas Firebase, as regras, os serviços, os canais, o código de mensagens, chamadas, admin e as demais páginas. As mudanças são visuais e de navegação, sem reescrever autenticação ou servidores.

## O que foi feito

- **index.html** reconstruído com hero gamer, nova identidade roxo/azul, layout de produto, preview explicitamente ilustrativa, navegação para Social, Now Call, servidores, Market e cadastro.
- **home.js** ajustado: usuários autenticados podem continuar vendo a landing; os CTAs mudam para acessar o feed e perfil.
- **call-now.html** totalmente remodelado como vitrine do serviço, com aparência de canais/servidores, botões para entrar no chat real e comunidade.
- **chat.html** mantém os controles e o JS original de mensagens, servidores, convite e chamadas. O CSS da V68 adapta o visual no desktop e celular, corrigindo telas vazias no mobile, larguras incompatíveis, modais e molduras da busca.
- **edit-profile.html**, **dashboard.html** e **profile.html** usam a nova camada de correções responsivas para diminuir cortes e melhorar alinhamento.
- `dist/` recebeu a cópia dos arquivos alterados e os novos CSS, além da fonte principal. Para a publicação definitiva, use `npm run build` com as dependências instaladas.

## Como executar pelo VS Code

1. Extraia o ZIP e abra a pasta `Something-Gamer-V68` no VS Code (a pasta que contém `package.json`).
2. Instale Node.js 22 ou superior.
3. Pelo terminal da pasta, execute `npm ci` e depois `npm run dev`.
4. Abra `http://localhost:5173`. Para entrar no Now Call, vá para `http://localhost:5173/chat.html`, ou abra a apresentação em `call-now.html`.
5. Use `npm run test:v68` para verificar as rotas e referências alteradas. Para a verificação geral execute `npm run verificar`, `npm test` e `npm run build`.

**Importante:** abrir o arquivo `index.html` com dois cliques via `file://` não substitui o servidor. Módulos ES, Firebase e autenticação devem ser usados pela URL local do projeto ou numa hospedagem HTTPS configurada.

## Sobre o funcionamento real

A **prévia na home e na página de apresentação do Now Call é ilustrativa**, não mensagens falsas gravadas em um banco. O ambiente real continua em **chat.html**, com os scripts da V67. Login e cadastro continuam em **login.html** e **register.html** com Firebase.

Chamadas de microfone, câmera e tela dependem de autorização do navegador, contexto HTTPS ou localhost, infraestrutura WebRTC/servidores devidamente configurados e de pelo menos duas contas reais de teste. Não foram realizados testes ponta a ponta com Firebase, Firestore ou chamadas de duas pessoas neste ambiente. Não considere login, voz, vídeo, pagamentos ou recursos administrativos homologados apenas porque a interface abriu.

## Publicação

O projeto original contém regras, arquivos do Firebase e Workers. Configure credenciais e acesso do servidor em locais apropriados: nunca coloque secrets, tokens de serviço ou contas de administrador no JavaScript público. Veja também `LEIA-PRIMEIRO-V67.md` sobre restrições do admin e testes pendentes. Para publicar a V68, siga o fluxo de build/deploy original após revisão das integrações.

## Arquivos visuais novos

- `sg-v68-home.css` — nova landing.
- `sg-v68-call-landing.css` — visual de apresentação do Now Call.
- `sg-v68-app.css` — melhorias responsivas no chat e perfil.
- `PREVIEWS/` — capturas estáticas de referência, sem autenticação real, obtidas com scripts da aplicação desabilitados.

**Histórico:** os arquivos V67 anteriores foram mantidos para facilitar manutenção e permitir comparar alterações. Os diretórios temporários de Gradle/build foram omitidos do ZIP para não distribuir caches pesados ou travas de compilação.
