# Now ADS Manager V59

## Estrutura
A interface trabalha com cinco etapas:
1. Campanha/objetivo
2. Público
3. Criativo
4. Orçamento e entrega
5. Revisão e checkout

## Dados reais
KPIs leem `metrics` das campanhas. Se o backend ainda não tiver registrado impressões, cliques ou gasto, o painel mostra zero. Não são gerados números fictícios.

## Públicos salvos
A coleção `adAudiences` guarda públicos manuais do proprietário.

## Eventos necessários para um Ads Manager completo
O backend de entrega deve registrar, com idempotência:
- impression
- reach/user exposure
- click
- conversion
- purchase
- message_start
- community_join
- profile_visit

A partir disso é possível calcular CTR, CPC, CPM, CPA e ROAS com dados reais.

## Pagamento
O fluxo de criação continua usando o checkout server-side já existente. A campanha deve ser ativada apenas após pagamento confirmado e revisão.
