> Documento histórico V63. A V64 removeu a integração Meta. Consulte RELATORIO_V64.md para as funções e a configuração atuais.

# V63 — configuração e homologação

Esta entrega contém código local, migrations e testes. Não modifica o Worker existente nem publica regras ou índices de produção. Não execute deploy:all para experimentar.

## Banco e serviços existentes

SG_DB continua necessário para pedidos, pagamentos, mídia e ADS. Aplicar migrations 0001–0012 somente em um D1 de homologação autorizado. Não inventar IDs de bindings nem reaproveitar D1 de produção para testes. A implementação reutiliza SG_AUTH para blobs quando SG_MEDIA não estiver disponível. Nenhum R2, D1 pago, serviço TURN ou Firebase Blaze foi criado.

A mídia social nova usa metadados próprios e não abre o namespace legado de uploads. SOCIAL_MEDIA_ENABLED permanece false. Ao habilitar exclusivamente na homologação, limites são 8 MB/arquivo, 16 MB por usuário/24 h, 64 MB totais de mídia social e retenção de 30 dias. Stories expiram 24 h após criação, inclusive o tempo de revisão. Publicações entram em revisão; o painel precisa de MFA, Access e identidade de serviço existentes para aprovar. Comentários sociais exigem moderação no Worker.

As migrations 0007 (Social), 0008 (ADS), 0009 (devoluções), 0010/0011 (Meta), 0012 (produtos vinculados ao Social) não foram aplicadas remotamente. Publicar firestore.rules e firestore.indexes.json somente no projeto de testes autorizado. Cargos e salas de voz são gravados pelo Worker com compare-and-swap. Clientes não podem se promover ou criar sessões diretamente.

## Voz de comunidade

Canal criado como kind=voice pelo dono, até seis sessões simultâneas e lease de 90 segundos, renovado a cada 45 segundos. A sinalização usa Firestore; áudio/tela usa WebRTC em malha. TURN deve estar configurado no mecanismo já existente. Não há gravação, SFU ou promessa de suportar grandes salas. A capacidade, qualidade e custo do relay dependem do serviço existente. Homologar duas contas e redes diferentes, revogação de cargo, mute/ban, expiração e compartilhamento de tela. Chamadas diretas anteriores continuam separadas.

## Now ADS

Pagamento/revisão necessários antes da veiculação. Feed/Story/reel, texto/imagem/vídeo sujeito ao armazenamento habilitado e aprovação. Segmentação usa somente região/interesses declarados com consentimento; retirada apaga esses campos. Não usa dados sensíveis, gênero nem localização precisa. Mídia precisa durar além da campanha; duração de campanha com arquivo deve ser menor que sua retenção. CPM interno permanece R$10,00. Impressões/cliques deduplicados por usuário/campanha/dia UTC.

Conversão: último clique elegível nos sete dias anteriores à criação do pedido, produto anunciado presente no pedido, comprador corresponde ao visitante e pedido pago. Valor atribuído é subtotal dos produtos, sem frete. Pedidos estornados ou em disputa não entram nas métricas de conversão atuais. Não confundir este modelo com o sistema de atribuição da Meta.

## Meta externa

META_ENABLED e META_WRITE_ENABLED permanecem false. Configurar pelos segredos do ambiente META_APP_ID, META_APP_SECRET, SERVICE_DATA_KEY (32 bytes em base64), versão oficial suportada em META_GRAPH_VERSION e lista autorizada META_TEST_AD_ACCOUNT_IDS. Callback exato: API_URL/meta/callback. Login solicita ads_read, ads_management, pages_show_list e pages_read_engagement; disponibilidade depende do tipo de aplicação, permissões e aprovação oficial.

O adapter prepara campanha, conjunto, criativo e anúncio PAUSED somente em conta de testes permitida com moeda BRL e página acessível ao usuário. Objetivo de tráfego, destino no perfil SG, público amplo BR/18+. Não oferece ativação de campanha, cobrança real, publicação orgânica no Instagram ou conversões CAPI. Tokens são criptografados, nunca enviados ao frontend; estados OAuth expiram e só podem ser usados uma vez. Métricas externas são leituras da Graph API. As respostas e parâmetros reais, revisão e posicionamentos elegíveis (inclusive Instagram) ainda precisam ser homologados oficialmente. Um timeout entre criação remota e persistência pode exigir reconciliação de objetos pausados antes de tentar novamente; não existe promessa de exatamente uma criação em falha de rede desconhecida.

## Market

Devolução solicita-se após entrega e dentro da janela implementada de sete dias do registro de recebimento. Vendedor responde, comprador registra rastreio e vendedor confirma retorno. Isso não substitui análise de garantia, direitos do consumidor ou logística externa. Reembolso integral exige administrador, confirmação explícita e resposta aprovada do provedor. Receber retorno não reembolsa automaticamente.

Resolver disputa retomando pedido exige consultar e validar pagamento ainda aprovado, estado anterior conhecido e decisão auditada. Não é permitido declarar refund sem registro confirmado. Split/comissão de 10% somente sobre produtos, liquidação, estornos e contestações continuam condicionados à homologação e aprovação do Mercado Pago. Não há repasse manual antecipado.

## Acesso pendente

O ambiente observado nesta sessão continua sem credenciais Cloudflare/Firebase configuradas. Use docs/AUTENTICACAO_E_HOMOLOGACAO.md; não envie tokens, senhas ou arquivos de credenciais pelo chat. Nenhuma ação externa de escrita, campanha real ou cobrança foi executada nesta revisão.
