# Critérios objetivos — Fase 1 e autorização da Fase 2

Estado desta entrega: Fase 1 NÃO APROVADA. Não iniciar a Fase 2 automaticamente.

| Critério obrigatório | Evidência exigida | Estado atual |
|---|---|---|
| S01 no servidor | Compilação real das regras no Firestore Emulator e todos os casos negativos/positivos de security-s01 aprovados, sem zero-test/skip indevido | Código implementado; execução bloqueada pelo JAR |
| Regressão Firebase | test:rules e test:rules:founders aprovados em demo-sg com concorrência real, autoridade e isolamento preservados | Bloqueado pelo JAR |
| Navegador | Os 26 casos realmente executados e aprovados, incluindo S01, fluxo anterior, responsividade e acessibilidade; logs/traces atuais | Chromium indisponível; 26 casos somente descobertos |
| Regressão local | check:fast, runtime e domínio de fundadores em Node 20 aprovados na árvore correspondente | Aprovado nesta instância; Windows ainda não executado |
| Dependências altas/críticas | Audit atual dos escopos raiz/Functions sem altas/críticas, com diff de lockfile revisado e runtime testado | Aprovado: 0 altas/críticas nesses dois escopos; moderadas registradas |
| Outros riscos de segurança | Cada achado potencialmente alto/crítico com correção e teste ou mitigação verificável, com decisão explícita; sem reclassificação arbitrária | S02/S03 continuam bloqueadores de revisão/tratamento; nativos não auditados dinamicamente |
| Preservação | 9445442 ancestral, fonte original preservada, ZIP/bundle anteriores com hashes iguais, bundle novo recuperável e scanner revisado | Verificações de entrega registradas no pacote |
| Operação segura | Promoção desativada, preços preservados, nenhuma escrita real, cobrança ou publicação; logs não contêm credenciais privadas | Mantido |
| Aprovação humana | Revisão dos resultados, das limitações e aceite explícito do usuário | Pendente |

O campo allSelectedGatesPassed do runner é apenas o resultado dos comandos selecionados. Não substitui a revisão dos achados, prova de testes sem bloqueios ou aprovação do usuário. Um run parcial não fecha a fase.

## Transição autorizada

1. Executar os gates pendentes num ambiente com os downloads oficiais disponíveis, pela configuração publicada correta da nuvem ou pelo procedimento Windows. Relacionar logs, hashes e commit ao código realmente executado.
2. Corrigir falhas reais encontradas, repetir os gates afetados e manter distinção entre passed, failed, blocked, skipped e não executado.
3. Tratar S02/S03 e qualquer outro risco alto/crítico confirmado, com evidência de eficácia antes do aceite. Não usar uma aprovação de testes unitários para encerrar esses riscos.
4. Revisar a preservação e a promoção desativada; obter aceite explícito da Fase 1.
5. Apresentar o escopo da Fase 2 e aguardar autorização explícita para iniciá-la. Aceite da Fase 1 não autoriza deploy, envio ao GitHub, migração ou cobrança.

## Entrega e publicação

Downloads do projeto são exclusivamente pelo GitHub, após envio confirmado. Esta tarefa proíbe push e não autoriza publicação; o pacote fica preparado, sem link fictício ou substituição por download local. A confirmação de privacidade do repositório e uma autorização posterior são necessárias para eventual envio. A entrega externa é separada do aceite técnico dos testes locais.
