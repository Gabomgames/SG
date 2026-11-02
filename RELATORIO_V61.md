# V61 — implementação local, homologação externa pendente

Este relatório complementa a V60. Não constitui declaração de plataforma completa ou de aprovação comercial.

Implementado: Market com catálogo D1, estoque reservado atomicamente, carrinho de um vendedor, preço negociado, ofertas e contrapropostas, sala de negociação no chat, pedidos e estados de entrega, avaliações após entrega, abertura de disputas, reembolso administrativo integral, OAuth do vendedor com credenciais criptografadas e checkout com comissão de 10% somente nos produtos. Split depende da compatibilidade e aprovação efetivas do Mercado Pago.

Implementado: assinaturas com consentimento recorrente explícito, cancelamento de renovação, concessão de benefício somente por cobrança confirmada vigente e relatórios próprios; campanhas de texto no feed com pagamento, aprovação administrativa, orçamento limitado e métricas deduplicadas; painel de pagamentos/moderação auditado; mídia privada com autorização em cada leitura, quota e expiração, adaptadores R2/KV existentes; preferências de chat, arquivamento e exclusão para si.

Os módulos estão desativados por padrão para cobranças. Migrations 0002–0006 são locais: nenhum D1 ou recurso remoto foi criado/alterado. A integração existente foi preservada. Não houve cobrança real, deploy de produção ou exigência de Blaze.

Limitações restantes: acesso Cloudflare/Firebase ausente; homologação sandbox, contas de teste, OAuth/split e webhook implantado não validados; resolução completa de disputas e fluxos de devolução/frete ainda pendentes; uploads públicos continuam condicionados à configuração segura; catálogo transacional não cobre todos os filtros/mapa/galeria antigos; benefícios avançados, reconciliação recorrente ampliada e reembolso do saldo de campanhas requerem trabalho adicional. Chamadas entre dispositivos e todos os fluxos sociais/comunitários ainda exigem homologação. Não apresentar recursos planejados como disponíveis.

Testes usam emulador Firestore, SQLite, D1/R2 local e navegador; o provedor de pagamentos é isolado/simulado nos testes. Resultados desses testes não comprovam integração real com Mercado Pago.

Consulte docs/AUTENTICACAO_E_HOMOLOGACAO.md para autenticar sem compartilhar credenciais e docs/CONFIGURACAO_V60.md para pré-requisitos anteriores. Não execute scripts deploy/deploy:all sem definir um destino de testes aprovado.

Validação desta entrega: 66 testes unitários/Worker, 9 testes de runtime D1/R2, 11 testes SQLite, 24 testes de regras Firestore e 12 testes de navegador aprovados (122 no total). Build e verificação estática aprovados. O dry-run do Worker apenas empacota localmente, sem deploy.
