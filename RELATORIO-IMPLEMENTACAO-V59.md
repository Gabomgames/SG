# Relatório de implementação — V59

## Implementado nesta versão
- Index novo e profissional.
- Página "Sobre a NOW" nova, fundo preto, marca NOW e foto real de Gabriel Martins.
- Now Mark: modal de localização novo, exato/aproximado, raio sugerido/custom, geocodificação, mapa, pins de preço, distância e pesquisar nesta área.
- Now ADS: manager novo, wizard de 5 etapas, objetivos, público, localização, criativo, posicionamentos, orçamento, revisão e públicos salvos.
- CSS responsivo V59 aplicado também a chat, perfil, admin, suporte, comunidades, monetização, settings, Call Now, dashboard e feed.
- Firestore Rules ampliadas para públicos do Now ADS e campos de localização do Market.
- Service Worker atualizado para a V59.

## Preservado da base V58.2
- Chat realtime/optimistic, retry, reações, reply, edição, exclusão, áudio, mídia, visualização única.
- Call Now e TURN da base anterior.
- Advertência, suspensão, banimento, recurso e revogação.
- Admin por Custom Claims e validação server-side.
- Remoção de amizade e fluxos sociais existentes.
- Pagamentos Mercado Pago e documentação de configuração.
- PWA, Android/Desktop e demais módulos da base.

## Exige credencial/API/configuração externa
- Mercado Pago produção/webhooks.
- TURN produção.
- Provider dedicado de mapas/geocodificação se houver escala comercial alta.
- SFU para salas de voz grandes, se ativado.

## Estrutura pronta, mas dependente de backend adicional
- Métricas completas do Now ADS (CTR, CPC, CPM, CPA, ROAS) dependem do motor de entrega registrar eventos reais.
- Públicos personalizados/semelhantes dependem de fontes reais e consentidas.
- Split automático do Marketplace depende de OAuth/Marketplace do provedor de pagamentos.
