# V62 — acabamento profissional de Now ADS, Market, Chat e Vice Sunset

## Entregue localmente

Vice Sunset reformulado com cores coral, rosa, violeta e água-marinha, horizonte tropical e palmeiras vetoriais originais animadas. O Chat tem cenário próprio e balões com superfícies opacas para leitura. A decoração não recebe cliques, respeita redução de movimento e pausa quando a aba fica oculta. O tema continua opcional em Configurações → Tema → Vice Sunset.

Now ADS: cartões de desempenho calculados com os registros da API, CTR, custo por clique, orçamento restante planejado, barras de consumo, estados das campanhas, filtros preservados e CSV com proteção contra fórmulas. Validação por etapa e direcionamento ao campo inválido. Limites de orçamento alinhados ao servidor. Descrições distinguem veiculação atual (texto no feed, público amplo) de formatos futuros.

Now Market: favoritos por conta/dispositivo, filtros de preço enviados ao servidor, contagem explícita dos resultados carregados, proteção contra resposta atrasada de busca, cartões e diálogos adaptados a celular e desktop, propostas protegidas contra duplo clique. O preço negociado e a comissão continuam calculados pelo servidor. As melhorias não ativam pagamentos.

Now Chat: listener em tempo real existente preservado; troca de conversa descarta callbacks atrasados, limpa mensagens anteriores durante carregamento e desativa envio quando a autorização/sincronização falha. Navegação mobile informa estado expandido e fecha com Escape. Aviso de desconexão acessível. Mídia privada tenta novamente apenas em indisponibilidade temporária, sem dispensar autorização. Confirmação, fila offline e reenvio existentes continuam ativos. Latência entre dispositivos depende de rede e Firebase, ainda não homologada externamente.

## Validação e limites

Verificação estática, build e 66 testes unitários/Worker aprovados. 17 testes de navegador aprovados, incluindo sunset em 375/1440 px, redução de movimento, métricas/CSV do ADS e favoritos/filtros de preço do Market. SDK e API isolados nesses testes; eles não substituem contas reais ou homologação externa. Capturas em artifacts/chat-sunset-375.png, artifacts/chat-sunset-1440.png e artifacts/ads-sunset-mobile.png.

Nenhum deploy, alteração de produção ou cobrança real. A homologação do webhook implantado, split e pagamentos depende das credenciais seguras e contas Sandbox. Demais limites da V61 permanecem documentados em RELATORIO_V61.md. Esta entrega melhora experiência e confiabilidade nos módulos citados; não declara toda a plataforma concluída.
