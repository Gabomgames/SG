# SOMETHING GAMER V69 — EDIÇÃO PROFISSIONAL

Esta versão atualiza **a base real V68** e preserva as páginas, as integrações, as regras de acesso, o Now Call e a área administrativa existentes. Não substitui tudo por uma demonstração visual.

## Começar no VS Code

1. Extraia o ZIP, abra a pasta `Something-Gamer-V69` no VS Code.
2. Instale o Node.js LTS e rode `npm ci`.
3. Rode `npm run dev` e acesse `http://localhost:5173`.
4. Faça login com sua conta de teste Firebase já configurada.
5. Rode `npm run test:v69` para verificar as regressões novas.
6. Para validar todas as páginas antes de publicar, rode `npm run check` no seu computador.

**Importante:** a porta 5173 é local e não publica o projeto na internet. `npm run dev` não exige build.

## Melhorias V69

- Index com as frases oficiais **Something Gamer — Yes, Something for you ;)** e **NOW — O futuro é agora ;)**.
- Feed reorganizado e criador de publicação em modal: texto, foto, vídeo e enquete, visualização do arquivo, limites de tamanho e mensagens de erro.
- Perfil pessoal, perfil público e editor ajustados para telas largas e celulares, com conteúdo no fluxo natural da página.
- Verificado Gamer reexibido no menu, no perfil, no feed e na apresentação, preservando as rotas administrativas e as regras de aprovação.
- Planos originais mantidos sem alterações: **30 dias R$ 14,90; 180 dias R$ 79,90; 365 dias R$ 149,90**. Períodos avulsos sujeitos à análise; nenhuma aprovação automática foi adicionada.
- Now Call, regras Firestore, autenticação e funcionalidades anteriores foram preservados.

## Para a publicação de foto e vídeo funcionar na internet

O Worker presente na base V68 tem `PUBLIC_MEDIA_ENABLED=false`. A V69 tenta o upload pelo Worker SG e, se ele estiver desativado, usa o **Firebase Storage** na pasta de usuário `posts/{uid}/`.

No Console do Firebase, confirme que o **Storage foi habilitado** no mesmo projeto, que o bucket indicado em `firebase.js` existe e que as regras `storage.rules` foram publicadas. No computador, com o Firebase CLI autenticado, você pode executar `npm run deploy:media` para enviar as regras. A conta Firebase precisa ter permissões adequadas e pode ser necessário configurar faturamento conforme o plano usado. Use um arquivo de teste JPG/MP4 (até 20 MB) e confira o envio real usando sua conta. Se o Storage não estiver habilitado/regras não estiverem publicadas, nenhum frontend pode garantir que o upload funcione.

## Verificado Gamer e pagamentos

Os três valores permanecem idênticos à versão anterior. O fluxo existente de análise e as rotas `/payments/create` e `/payments/status` foram mantidos. A aceitação de pagamentos depende das credenciais/provedor e da configuração `PAYMENTS_ENABLED` no Worker. **Não exiba o checkout como habilitado antes de configurar e testar o serviço financeiro**, e não modifique os preços sem querer.

## Testes e limites de verificação

Os testes de regressão V69, V68 e V67 passaram em execução local. Layouts desktop e mobile foram inspecionados em renderizações estáticas com navegador. **Não foi possível concluir o build completo nesta sessão** porque a instalação de dependências não terminou; `npm run check` e testes reais de login, upload e pagamento devem ser executados em ambiente com Firebase e Worker configurados. O arquivo `dist/` foi sincronizado com as alterações para facilitar inspeção, mas faça um build real antes de qualquer deploy.

O projeto V69 foi construído preservando os scripts e IDs de eventos preexistentes para reduzir regressões.
