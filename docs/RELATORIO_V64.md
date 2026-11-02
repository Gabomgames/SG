# Something Gamer V64 — Now ADS próprio e revisão da experiência

O Now ADS pertence ao SG. A integração externa com Meta foi removida da interface, dos módulos executáveis e das rotas do Worker. As migrations históricas 0010/0011 permanecem para não destruir o histórico de bancos já existentes; a V64 não as utiliza para conectar serviços externos. Não há publicação no Facebook, Instagram, Messenger ou Audience Network.

## Implementação local

| Área | O que foi implementado |
|---|---|
| Campanhas | Seis objetivos obrigatórios: reconhecimento, tráfego, engajamento, cadastros, promoção de app e vendas; limite total e diário; orçamento na campanha ou por conjunto; rascunhos idempotentes |
| Conjuntos | Múltiplos conjuntos por campanha; região, idade e gênero declarados, interesses e preferências de uso com consentimento; seleção de público; período e horas UTC; posições automáticas ou manuais no SG; pausa individual |
| Anúncios | Texto, imagem, vídeo, carrossel até 10 imagens, coleção até 10 produtos próprios; título, mensagem, CTA e destino; pausa individual; criativos imutáveis após envio para pagamento |
| Destinos | Perfil, publicação, comunidade, produto próprio, site HTTPS, WhatsApp, formulário nativo SG e página Google Play/App Store |
| Públicos | Principal por interesses, remarketing dos seus anúncios, lista de emails com hashes SHA-256 feitos no navegador e semelhantes por afinidade dos interesses da origem; expiração de 30 dias e retirada de consentimento |
| Distribuição | Escolha probabilística usando resultados observados, com exploração para novos anúncios; respeita filtros, posições, período, orçamento diário e total atomicamente no D1 |
| Eventos e leads | Eventos próprios vinculados a entrega autenticada; contato exige clique e consentimento explícito; exportação somente do anunciante; retenção de 30 dias |
| Comércio e relatórios | Catálogo dos produtos do vendedor; biblioteca dos anúncios ativos no SG; CSV seguro contra fórmulas; CTR, CPC, gasto, vendas confirmadas e ROAS calculados dos registros existentes |
| Regras | Pausar campanha ao atingir gasto e permanecer abaixo das vendas mínimas; log de execução; nenhuma regra aumenta orçamento ou inicia cobrança |
| Market | Fotos até 10, tags, categorias físicas, busca por preço/condição/região/raio, coordenadas aproximadas por padrão, ponto comercial exato com autorização explícita, favoritos sincronizados, compartilhamento, até 20 canais SG escolhidos, denúncia, revisão de produto/fotos e métricas deduplicadas |
| Resposta do vendedor | Selo de resposta rápida às propostas exige cinco propostas elegíveis e pelo menos 80% respondidas em até uma hora nos últimos 30 dias; não representa velocidade de todas as mensagens do chat |
| Now Call | Microfone, câmera e tela em canais; seis pessoas no modo direto; adapter LiveKit próprio para até 25 no modo SFU configurado; moderador e espectador; enquetes com voto protegido; dado e quiz com resposta privada e pontuação gravada pelo servidor |
| Visual | Index refeito como entrada para os aplicativos, identidade roxa/sunset, palmeiras animadas e movimento reduzido; gerenciador com ferramentas laterais e tabelas dos três níveis; perfil com capa, ações e abas reais de fotos/vídeos/publicações |

## Limites que não podem ser apresentados como funções já homologadas

A distribuição é um mecanismo próprio baseado em métricas do SG, não uma reprodução da inteligência artificial da Meta. Semelhantes exigem 100 pessoas consentidas na origem e usam interesses declarados, não mineração de navegação ou dados pessoais inferidos. O gerenciador não inventa estimativas de alcance.

Promoção de app registra visitas à loja. Instalações e ações dentro de apps externos dependem de instrumentação e integração ainda não fornecidas. Eventos próprios não representam um Pixel universal ou uma API de conversões pronta para todos os sites externos. As compras contabilizadas vêm dos pedidos do Now Market e do pagamento confirmado pelo provedor.

O adapter para 25 participantes necessita servidor LiveKit já disponível ou homologação de um servidor próprio. Nenhum servidor, serviço pago ou assinatura LiveKit foi contratado. Qualidade em redes reais, 25 dispositivos simultâneos, gravação, transmissão 60 fps premium e integração oficial com Spotify/PlayStation/Xbox não estão homologadas. Não há bot de música ou execução de bots arbitrários.

Market mantém checkout integrado e comissão de 10% exclusivamente sobre produtos, sem frete. Não implementa contratos de imóveis/locações, frete de transportadoras, reembolso parcial ou pagamento por fora. Anúncios profissionais novos e suas fotos passam por aprovação antes da vitrine pública. Mídia continua limitada ao armazenamento gratuito configurado: 8 MB por arquivo e retenção de 30 dias; não é hospedagem permanente ilimitada.

Cloudflare/Firebase/Mercado Pago continuam sem credenciais disponibilizadas neste ambiente. Não foi feita implantação, cobrança real, alteração de recursos de produção, homologação do webhook implantado ou aprovação do split. O código dos pagamentos foi preservado; o HTTP 401 do Worker existente continua precisando de validação nesse ambiente.

## Configuração de testes

Aplicar migrations 0001–0016 exclusivamente no banco de testes autorizado. Novas migrations: 0013 gerenciador, 0014 descoberta/fotos Market, 0015 sessões SFU, 0016 resposta a propostas. Publicar regras e índices somente no Firebase de homologação. Configurações financeiras e de mídia pública permanecem desativadas.

Para SFU: CALL_SFU_ENABLED=true, CALL_SFU_URL (HTTPS/WSS), CALL_SFU_API_KEY e CALL_SFU_API_SECRET pelos mecanismos de segredos do Worker, SG_DB e identidade de serviço Firestore existentes. Segredos não entram no frontend. O token devolvido ao participante é temporário e limitado à sala e às permissões. Acrescentar exatamente o host do servidor de mídia ao connect-src da CSP do Hosting, HTTPS e WSS; permitir worker-src blob: caso o recurso usado pelo SDK exija. Nunca colocar chaves no HTML.

O cron foi preparado para executar limpeza SFU a cada minuto, mantendo reconciliação financeira a cada 15 minutos. Não foi implantado. Leases duram 90 segundos e são renovados em 45 segundos; limpeza ocorre no próximo cron e depende da disponibilidade do servidor. Moderação solicita remoção do participante na sala correspondente antes de concluir a ação. Isso precisa de homologação real.

Antes de habilitar checkout ADS: revisar todos os criativos, testar orçamento diário/total, pagamento sandbox, pausa, regra sem vendas e restituição administrativa de saldo não utilizado. O orçamento máximo atual continua R$ 1.000 por campanha.

Consulte AUTENTICACAO_E_HOMOLOGACAO.md. Não envie credenciais pelo chat.

## Validação local

Passaram 73 testes unitários/Worker, 20 testes integrados de runtime, 29 testes de regras Firestore no emulador, 11 verificações SQLite e 24 testes de navegador (157 no total). O bundle do Worker também passou no deploy --dry-run, sem implantação. Capturas usam dados de testes para revisar o layout, não comprovam homologação de serviços externos.

Para reconstruir: npm ci e npm run check na raiz. dist/ contém a versão compilada. A distribuição inclui dependências atuais de functions/ e o ZIP original intacto em BACKUP-ORIGINAL/; node_modules das ferramentas de desenvolvimento é instalado por npm ci. Não executar deploy antes de preparar e autorizar a homologação descrita acima.
