# Something Gamer V66 — SG Clean Experience

Atualização **do código-fonte** da V65.1, preservando dados e módulos existentes. Não é um serviço de produção já implantado, nem um teste de chamadas e pagamentos reais. Estilos finais em `sg-v66.css` e scripts novos em `sg-v66-*.js`.

## Rodar localmente

1. Extraia todo o ZIP.
2. Abra a pasta `Something-Gamer-V66` no VS Code.
3. Execute `npm run dev` (servidor de arquivos estáticos, sem npm install).
4. Acesse `http://localhost:5173`.

**Publicação:** instale as dependências na raiz com `npm install`, valide com `npm run check` e gere `dist` com `npm run build`. A pasta `dist` foi **regerada como cópia estática da V66** para pré-visualização; não é o build final minificado. Antes de publicar, rode `npm run build` para gerar a versão de produção. O comando de deploy exige as credenciais e acesso ao projeto Firebase. Alterações em `firestore.rules`, `functions/index.js` e `functions/sg-v66-functions.js` só funcionam depois de serem implantadas pelo responsável pelo projeto. Publicar Functions separadamente exige `cd functions && npm install` quando necessário e `firebase deploy --only functions --project something-gamer`.

## Mudanças de UI

- Layout lateral consistente para Feed, Explorar, Now Call, Market, Perfil, Admin e Suporte; foco no conteúdo e estilo SG (azul/roxo discreto).
- Correções adicionais de viewport e grade para cards, filtros, formulários, diálogos, edição do perfil e tela de chat.
- Agora o Now Call não carrega o módulo legado de dado, quiz, enquete e bots. **As mensagens, canais, convites e chamadas mantêm seus módulos existentes**, que precisam de validação com Firebase/LiveKit/TURN reais.
- Market: removido marketing de Seller Pro/Monetização da tela de compras; o backend de pagamentos e NOW ADS é preservado.
- Suporte: layout de FAQ e solicitação de atendimento reorganizados.
- Denúncia: modal legível, evidências opcionais, motivo e descrição; envio segue as regras Firestore existentes.
- Verificado: comunicação sobre destaque adicional em vídeos/posts e segurança, **sem prometer alcance garantido ou substituir controles básicos de segurança**. Mercado Pago existente usa checkout no servidor e depende de configuração.

## Funcionalidades novas que exigem implantação

- **Marcações `@username`:** `sgMentionPost` e `sgMentionComment` processam uma publicação/comentário após gravação. Se o perfil for público e permitir, gera notificação; se for privado ou configurar aprovação, gera pedido de marcação a aceitar/recusar em Configurações. As menções não viram notificações para contas que bloquearam marcações. `mentionRequests` são somente do servidor. Em mensagens privadas de chat, esse fluxo ainda não foi implementado.
- **Privacidade:** cada usuário escolhe `auto`, `approval` ou `none` em Configurações. Para contas privadas, `auto` sempre exige aprovação.
- **Excluir conta:** Cloud Function `deleteMyAccount` exige autenticação recente, confirmação textual e transferência prévia dos servidores. Exclui Firebase Auth, perfil e coleções principais de dados próprios. **Não exclui automaticamente mensagens de terceiros e dados de pagamento/segurança sujeitos à retenção legal ou armazenados no Worker**; a revisão desses dados deve ser documentada na política de privacidade e operacionalizada antes de produção.

## Admin

O problema `ADMIN_CLAIM_MISSING` é de autorização, não apenas de CSS. **Não** é seguro tornar o painel acessível só pelo navegador. Em ambiente controlado, um operador com credenciais legítimas do Firebase Admin pode usar `functions/scripts/provision-admin.cjs` para atribuir o claim `admin` exclusivamente ao UID confirmado do proprietário. Execute apenas a partir de máquina confiável e **nunca envie chaves de serviço para o frontend nem para este chat**. Faça login novamente após essa operação.

## Mercado Pago

A implementação existente usa API/checkout do lado do servidor, webhooks e validações de status. Para habilitar pagamentos: configure as credenciais no gerenciador de secrets/Worker, publique as funções/Worker, configure webhook no provedor, teste primeiro no ambiente de teste, valide reembolso e eventos duplicados. **Nunca use tokens de acesso no navegador ou em arquivos distribuídos.** O SG opera com menores: formalização comercial/pagamentos deve ser feita com responsável legal e orientação profissional.

## Validações

- 104 testes unitários/estruturais passaram (incluindo os 7 novos testes de regressão da V66).
- Sintaxe do novo JS/Functions conferida.
- O build de produção requer pacotes `esbuild` e `acorn` não instalados no ambiente de empacotamento; logo **não foi homologado**.
- Testes visuais completos, Firebase real, chamadas de vídeo, pagamentos e fluxo administrativo autenticado **não foram homologados**.
