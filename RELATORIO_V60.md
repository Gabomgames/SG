# Something Gamer V60 — entrega local

Esta entrega modifica o projeto recebido; o plano mestre foi usado como referência de escopo, não como autorização para publicar, contratar serviços ou movimentar pagamentos. Nenhum deploy, cobrança real, alteração de conta externa ou exclusão de dados foi executado.

## O que mudou

- Página inicial reconstruída, navegação responsiva, contraste, foco visível, FAQ por teclado e estados offline. Camadas visuais compartilhadas e novo acabamento do Chat.
- Chat: confirmação real da gravação, IDs estáveis para retry, histórico paginado, caixa de entrada por atividade, bloqueio entre contas, convite individual para servidores privados e digitação opcional. Removidos presença inventada e polling redundante. Novos anexos privados aguardam armazenamento protegido.
- Now Market: catálogo paginado, filtros, detalhes, favoritos locais por conta, anúncios físicos, localização aproximada e mapas sem consulta duplicada. Novas compras pela plataforma não estão habilitadas.
- Pagamentos de verificação: preços e identidade validados no servidor, pedidos idempotentes, HMAC do webhook, banco D1 com unicidade, conciliação e registro de revisão. Compra não representa aprovação automática. Código preparado, integração externa ainda não homologada.
- Segurança: regras de acesso mais restritas, proteção contra concessão de benefícios pelo cliente, administração com MFA/Cloudflare Access e habilitação explícita, CORS, limites de requisição, validação binária e restrição de URLs remotas. Recuperação por código mestre removida.
- NOW ADS persiste rascunhos sem cobrar nem inventar métricas. Novas adesões Creator+, Seller Pro e Community Pro permanecem indisponíveis até validação dos benefícios.
- Build minificado sem ofuscação, cache persistente apenas por consentimento e service worker limitado a conteúdo público. Fonte legível, migração SQL aditiva e documentação de configuração/rollback incluídos.

## Validação

- 267 arquivos conferidos pelo verificador estático e build concluído.
- 53 testes de unidade/contratos do Worker; 20 testes de regras Firestore no emulador; 4 testes SQLite da migração e invariantes financeiras.
- 10 testes de navegador: larguras 320–1920 px, teclado, estados vazios do Chat/Market, cobrança indisponível e acessibilidade automatizada da inicial.
- Total: 87 testes automatizados locais. Os testes de navegador usam fixtures do SDK isoladas dos arquivos publicados; não são testes de contas reais em produção.
- Empacotamento do Worker verificado com dry-run, sem publicação.

Evidências em `artifacts/`. Acessibilidade automatizada não substitui auditoria manual completa de todas as páginas.

## Pendências e limites

Não é uma implementação integral do plano mestre pronta para produção. Requer configurar D1, segredos, identidade do Mercado Pago, conta de serviço, Cloudflare Access, índices/regras e realizar homologação com contas reais antes de habilitar pagamentos/admin. Não foi diagnosticado o webhook 401 do ambiente publicado por falta de acesso a esse ambiente. Projeções D1→Firestore, concorrência e reembolso precisam de testes de integração externa. A revisão financeira tem endpoint, mas ainda não um painel administrativo integrado completo.

Market ainda não oferece estoque/reserva, checkout, split OAuth, frete, disputa ou repasse automático. ADS ainda não oferece entrega/antifraude. Áudio, imagem privada e mídia legada estão bloqueados por padrão para conter exposição; os arquivos existentes não foram apagados. Chamadas e os demais módulos herdados não receberam homologação integral.

A auditoria npm da raiz identificou 7 avisos em ferramentas de desenvolvimento (3 altos e 4 moderados); não há dependências de runtime na raiz. Dependências legadas de Functions foram atualizadas dentro das versões compatíveis; restam 9 avisos moderados transitivos, sem críticos ou altos nessa auditoria. Consulte as evidências incluídas. Nenhuma afirmação de ausência total de vulnerabilidades.

## Como usar

Leia `docs/CONFIGURACAO_V60.md` antes de configurar ou publicar. Rode `npm ci`, `npm run check` e os testes documentados. `dist/` contém o build desta entrega. O caminho administrativo gerado é informado localmente em `.local/admin-route.json`; ele não é mecanismo de autenticação. Não publique o ZIP, documentação, testes ou essa configuração privada como conteúdo do site.

O ZIP original permanece intacto. A migração é aditiva e não contém comandos de exclusão das tabelas. Flags de pagamentos, administração e mídia pública estão desabilitadas por padrão.
