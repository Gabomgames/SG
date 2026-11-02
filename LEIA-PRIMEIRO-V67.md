# Something Gamer V67 — Correções de interface, acesso e moderação

Esta distribuição preserva a base anterior e inclui arquivos-fonte e pré-visualização estática em `dist/`. **Não está homologada em produção**. Nenhum teste deste pacote comprova pagamentos, login, chamadas reais, Cloudflare Access ou direitos de administrador já configurados.

## Executar no VS Code

1. Extraia o ZIP inteiro.
2. Abra a pasta `Something-Gamer-V67`.
3. Com Node 22+, execute `npm run dev`, depois `http://localhost:5173`.
4. Teste com contas **de teste**. Nunca use dados reais para simular exclusão de usuários.
5. `dist/` contém uma cópia estática de pré-visualização sem minificação; para publicação rode `npm ci && npm run verificar && npm run build` e só publique após todos os testes e integrações.

## Mudanças V67

- Admin separado da navegação Social que causava menu comprimido.
- Estilos específicos para cabeçalhos e feed, notificações com scroll e textos limitados, login/cadastro com mostrar/ocultar senha acessível.
- Painel administrativo oculta dados e métricas quando não há autorização.
- Ação **apenas para super_admin** de encerrar conta, com confirmação de nome, motivo de pelo menos 20 caracteres, bloqueio imediato, agendamento de exclusão em 30 dias, trilha de auditoria e recurso pelo suporte.
- Ao aceitar recurso, o Worker cancela a fila de exclusão e reverte a moderação. Também é possível cancelar a exclusão pelo painel de super_admin. Dados legais de auditoria podem ser preservados conforme regras do serviço.
- Suporte permite abrir um recurso autenticado, associado a uma sanção válida da própria conta. Usuários banidos ainda podem acessar `support.html` e a rota específica de recurso pelas regras do Firestore.

## Ativar o ADMIN corretamente (sem desativar segurança)

A mensagem `ADMIN_CLAIM_MISSING` significa que a conta **não tem** a claim Firebase `admin: true`. Não adianta editar HTML ou usar `localStorage`.

1. Num computador confiável, obtenha o UID exato da sua conta de teste no Firebase Authentication.
2. Um responsável técnico com permissões no projeto deve conceder a claim usando `functions/scripts/set-admin.js`, conforme `CONFIGURAR-ADMIN-SEGURO-V58.2.md`. Nunca coloque o JSON de service account na pasta pública nem dentro do ZIP.
3. Renove a sessão no navegador. Para ações perigosas, a conta deve ser `super_admin`.
4. Configure **no servidor/Worker** `ADMIN_ENABLED`, `ADMIN_UIDS`, autenticação reforçada (MFA) e Cloudflare Access (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`). A função Firebase também pode exigir `SG_ADMIN_ENABLED` e os respectivos valores de Access. Esses controles não podem ser simulados localmente.
5. Faça o deploy do Worker e de `functions` e publique as regras Firestore somente após auditoria de segurança. Sem isso, as ações administrativas não operarão.

## Moderação e exclusão

A exclusão administrativa não é instantânea. O sistema primeiro bloqueia a conta e agenda uma finalização em 30 dias para permitir revisão. A rotina `finalizeModeratedAccounts` executa no servidor diariamente quando publicada; não apaga registros de auditoria que precisem de retenção. Falhas vão para `needs_review` e exigem atenção da equipe, sem repetir exclusões automaticamente. Contas administrativas e oficiais são protegidas e devem ser revisadas manualmente. O caso deve ser analisado por uma pessoa antes da decisão.

## Validação pendente

- Firebase Authentication, Firestore Rules e acesso real com MFA/Cloudflare Access.
- Testes de navegador visual e responsividade em aparelhos reais. Chromium neste ambiente não conseguiu renderizar screenshot.
- Integração com Mercado Pago e webhooks, voz/vídeo WebRTC, performance em produção.
- Revisão de retenção de conteúdo de terceiros, cobranças e apelações antes de ativar exclusão automática real.

Nunca afirme que está tudo 100% sem bugs apenas porque os testes unitários passaram.
