> Documento histórico V63. A V64 removeu a integração Meta. Consulte RELATORIO_V64.md para as funções e a configuração atuais.

# Something Gamer V63 — entrega local integrada

Esta versão amplia V61/V62 com recursos sociais, comunidades, anúncios e pedidos. Não foi implantada em produção. As integrações externas não estão homologadas nas contas reais do projeto.

| Área | Implementado nesta entrega | Validação externa pendente |
|---|---|---|
| Now Social | Stories 24 h, vídeos curtos, posts, curtidas, comentários moderados, denúncias, compartilhamento, métricas próprias e links de produtos; revisão administrativa | Identidade de serviço, moderação e armazenamento autorizados |
| Feed | Filtros de seguidos e salvos, integração com conteúdo social e anúncios | Regras/índices no projeto de testes |
| Now Chat | Mensagens por listener em tempo real, estado de envio e nova interface mobile/desktop; comunidades com cargos, convites, aprovação, canais restritos e moderação | Duas contas/dispositivos reais; não há garantia de latência fixa |
| Voz | Sala WebRTC até seis participantes, microfone e compartilhamento de tela, leases e controle de acesso | TURN, redes diferentes e permissões dos navegadores |
| Now ADS | Criativos feed/story/reel, segmentação declarada com consentimento revogável, impressões/cliques deduplicados e conversões de pedidos pagos; revisão e limites de orçamento | Pagamento sandbox, mídia habilitada e revisão administrativa |
| Meta Ads oficial | OAuth criptografado, leitura de contas/métricas e criação exclusivamente PAUSED em conta de teste permitida | App Review, permissões, versão Graph e parâmetros reais; não há ativação ou publicação orgânica Instagram |
| Now Market | Produtos, negociação, pedidos, checkout protegido, comissão de 10% exclusivamente sobre produtos; devoluções e resolução auditada de disputas | Mercado Pago sandbox, assinatura do webhook implantado e aprovação de split |
| Monetização | Planos e concessão de benefícios condicionada a confirmação de pagamento; ADS e comissão Market | Recorrência, liquidação, estorno e contestação reais em sandbox |
| Visual | Tema sunset com palmeiras animadas, respeito a movimento reduzido e layouts responsivos | Revisão em aparelhos físicos |

## Limites e configuração

Consulte CONFIGURACAO_V63.md e AUTENTICACAO_E_HOMOLOGACAO.md. Migrations 0001–0012 fazem parte do pacote, mas não foram aplicadas remotamente. Flags de pagamentos, Meta e mídia pública continuam desativadas. Não exige Firebase Blaze nem cria serviços pagos.

Mídia social nova: 8 MB por arquivo, 16 MB por usuário/24 h, 64 MB globais, retenção máxima de 30 dias. Publicações novas passam por revisão. Não representa hospedagem permanente de vídeos equivalente ao YouTube. A mídia pública é separada por metadados dos anexos privados do chat.

Não inclui SFU para grandes salas, logística integrada a transportadoras, reembolso parcial, publicação orgânica Instagram, Meta CAPI ou homologação de repasses. Estornos/restituição de saldo não gasto em ADS ainda dependem do fluxo administrativo e das regras do provedor. Novos recursos locais não significam que todas as capacidades de Instagram, Discord e Meta estejam reproduzidas.

Nenhuma cobrança real, implantação, mudança de recursos de produção ou campanha externa ativa foi executada. A assinatura do webhook foi tratada no código e nos testes; o erro HTTP 401 do Worker implantado não pode ser declarado resolvido sem inspecionar e homologar esse ambiente.

## Verificação

Testes automatizados: 68 unitários/Worker, 17 com runtime D1/R2 local, 27 de regras Firestore, 11 SQL e 19 de navegador. Build e empacotamento do Worker em dry-run. Fixtures e provedores simulados não substituem homologação externa.
