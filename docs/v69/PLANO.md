# Plano incremental para aprovação

Status: planejamento e preparação concluídos; implementação funcional não iniciada. A autorização solicitada é somente para a fase 1. Cada fase termina com diff, testes reais, relatório de regressões, riscos e proposta da próxima etapa. Aprovar uma fase não autoriza fases seguintes ou publicação.

## Invariantes e processo de aceite

Aplicam-se as regras de [AGENTS.md](../../AGENTS.md), incluindo os três preços/prazos, os benefícios e a aprovação do Verificado Gamer, os slogans oficiais e a preservação dos recursos/dados existentes. A fase não passa se a mudança perder contas, IDs, conteúdo, memberships ou integrações. Não “consertar” um teste removendo comportamento necessário ou afrouxando autorização.

Para cada entrega: registrar baseline → implementar escopo pequeno → executar testes relacionados e regressões de identidade/autorização/Verificado → comparar UI quando aplicável → explicar falhas preexistentes/novas e limitações → preparar rollback → apresentar resultado ao usuário. Homologação e deploy têm aprovações próprias. Estimativas de duração só serão feitas após baseline e acesso de teste, sem prometer prazo com requisitos externos desconhecidos.

## Fase 1 — baseline V69 reproduzível e checks confiáveis (P1)

**Objetivo:** tornar a versão solicitada uma base revisável e executável, sem mudança de pagamentos, schema ou redesign.

1. Revisar `COMPARACAO.md` e importar incrementalmente a fonte V69 no checkout Git existente, preservando itens exclusivos, histórico e backups. Não criar outro projeto, worktree ou remover recursos; separar `dist/`, screenshots históricos e documentação de evidência do código de release. Registrar manifest de importação. Qualquer arquivo exclusivo com destino ambíguo deve permanecer preservado até decisão.
2. Fixar/documentar runtime do web/Worker conforme CI (Node 22 suportado pela toolchain) e Node 20 das Functions; validar dependências com lockfile. As execuções da auditoria usaram Node 24.19.0: compatibilidade em Node 22 é check desta fase, ainda não comprovada.
3. Corrigir B01 no verificador, preferencialmente com AST/escopo usando Acorn já presente. Cobrir import estático válido, import dinâmico declarado no escopo e símbolo realmente ausente; não suprimir o erro de `getDoc` genericamente.
4. Corrigir B02 revisando o contrato de H1 e verificando separadamente marca/slogan, título editorial, ausência de overflow e erros JS. Fixtures devem representar exports realmente utilizados sem entrar no build.
5. Integrar testes de contrato e matriz de checks à CI, com Java e emuladores explícitos. Separar check rápido, runtime local, regras, navegador e nativos. Publicação continua manual e fora da fase.
6. Registrar custos de carregamento por rota e screenshots atuais sem iniciar consolidação CSS. Preparar seleção de ambiente e proteção contra escrita em produção como escopo da fase 2; nesta fase os testes devem permanecer locais e isolados.

**Aceite:** diff de importação completo e recuperável; nenhum dado remoto tocado; lockfiles sem atualização incidental; build de fonte limpa reproduzível em runtime escolhido; verificador passa e seus testes detectam referência realmente ausente; regressões V65–V69, domínio, SQL e D1/R2 passam; casos Playwright aprovados com testes atualizados honestamente; testes de regras executam no emulador ou a fase permanece explicitamente bloqueada para aceite completo. As novas expectativas de segurança S01 podem ficar vermelhas documentadas, separadas do gate de regressão, até fase 2; não podem desaparecer do relatório. Guardas dos três planos passam. Sem deploy.

**Riscos:** importação volumosa pode reintroduzir bugs ou omitir arquivo exclusivo; correção do verificador pode causar falsos negativos; ajustes de fixture podem mascarar erro real; toolchains Node 20/22/24 divergem; dependências contêm avisos; download do emulador está bloqueado; build gera rota admin variável. Mitigação: revisão por manifest/hash, testes negativos, execução de browser com bloqueio de rede e snapshots, registrar ferramentas e artefatos, restaurar somente código local. Não resolver dependências financeiras ou habilitar flags nesta fase.

**Reversão:** restaurar os arquivos da fase a partir do commit/bundle e recuperar a árvore V69 pelo ZIP verificado; não restaurar banco nem desfazer transações. Nenhuma operação remota é prevista. Primeira entrega é revisão da importação e correções B01/B02, acompanhada do relatório; não iniciar fase 2 automaticamente.

## Fase 2A — isolamento de desenvolvimento e autorização social (P1)

**Dependências:** fase 1 aceita; emulador disponível. Criar seleção explícita de local/homologação com bloqueio de projeto produção nos testes; nunca alterar endpoints padrão de produção incidentalmente. Validar schema das enquetes e dos votos, incluindo documentos inexistentes, payload extra, opções fora do intervalo, autoria e leitura/escrita legada. Harmonizar voto textual/numérico por leitura compatível antes de mudar escrita. Cobrir publicação válida, rate limit e bloqueios.

**Aceite:** testes emulador demonstram negação dos novos casos, aceitação de uso legítimo e compatibilidade legada; IDs e dados não são migrados automaticamente; fluxo de feed/perfil e Verificado não regride; testes falham se tentarem usar projeto real. **Risco:** endurecer regra pode bloquear clientes antigos. **Rollback:** regras/código locais anteriores; publicação de regras só após teste de versões e autorização específica.

## Fase 2B — ciclo de vida e segurança de mídia (P1)

**Dependências:** 2A aceita e Storage/R2 de homologação. Mapear mídia existente e links; criar fronteira server-side de publicação/revisão e política de falha de moderação; prever limpeza compensatória/idempotente para upload órfão sem varrer nem excluir dados existentes. Testar revogação, bloqueios e bytes/MIME; verificar Storage legado e URLs de download.

**Aceite:** arquivo rejeitado não fica publicamente disponível; erro/interrupção não vira “publicado”; terceiro e usuário bloqueado não obtêm nova mídia privada; imagens/vídeos legítimos, perfil, denúncias e anexos legados continuam funcionando; nenhum segredo chega ao bundle. **Risco:** moderação indisponível pode bloquear postagem legítima; propor estado pendente com UX verdadeira. **Rollback:** desativação seletiva da via nova em homologação e recuperação de referências; não apagar uploads antigos.

## Fase 3A — contratos de Verificado e reconciliação em homologação (P1)

Mapear Fields/owners entre Firestore, D1 e Functions legadas; documentar todos os benefícios existentes e seu vínculo com status/validade. Exercitar sandbox do provedor com autorização própria, duplicidade, atraso, falha de espelhamento, aprovação/rejeição administrativa, expiração, estorno e renovação avulsa; preservar assinaturas legadas sem cancelá-las.

**Aceite:** tabela única de contratos preserva 30/180/365 dias e 1490/7990/14990 centavos; pagamento não ativa selo sem revisão; estorno não pode reativar benefício; pedido pendente não apaga selo vigente; clientes antigos continuam compatíveis. Não altera cobrança real. **Risco:** duas autoridades financeiras podem divergir; qualquer migração/alteração de produção precisa de plano e aprovação separados. **Rollback:** manter os contratos e ledger prévios; jamais reverter o estado financeiro com um restore cego.

## Fase 3B — dependências e limites operacionais (P1)

Triar os 25 avisos do audit por pacote/caminho/exposição; atualizar um grupo por PR com lockfile revisado, sem `audit fix --force`. Definir timeouts, limites de body/consultas, autorização e respostas sem PII por endpoint. Preservar verificação TLS e assinatura de artefatos.

**Aceite:** cada aviso alto é eliminado ou tem justificativa técnica, responsável e prazo; suites relacionadas passam; build e runtime preservados; telemetria usa IDs de correlação sem tokens/corpo privado. **Risco:** atualização transitiva pode quebrar Firebase/Wrangler. **Rollback:** revert do grupo de dependências e reinstalação congelada.

## Fase 4A — sistema visual por componente (P2)

Inventariar tokens e camadas reais, padronizar slogans/nomes, consolidar primeiro navegação e controles de formulário. Depois feed/compositor, perfil/editor e chat em entregas separadas aprovadas. Não trocar tudo de uma vez ou adicionar outra camada versionada como solução definitiva. Preservar seletores enquanto houver dependentes.

**Aceite por componente:** 320/375/768/1440/1920 px sem overflow/sobreposição; teclado, foco, fechamento/retorno de modal, rótulos e mensagens reais; contraste e axe sem novas violações; redução de movimento; captura e revisão visual lado a lado; todas as ações existentes mantidas. **Risco:** estilos globais afetam telas não trabalhadas. **Rollback:** restaurar somente o componente e camadas alteradas.

## Fase 4B — feed e desempenho medido (P2)

Reduzir leituras N+1, definir contadores confiáveis, paginação por cursor e preservação de contexto/scroll; garantir links para posts fora da primeira página e recuperação de erro/offline. Medir por rota e por ação antes/depois, com massa sintética representativa.

**Aceite:** nenhuma coleção de likes inteira por card; volume de leituras limitado por página e demonstrado em teste; paginação sem duplicar/perder posts sob novas inserções; LCP ≤2,5 s, INP ≤200 ms e CLS ≤0,1 como metas de homologação em perfil de rede/dispositivo definido, sem alegar métricas de usuários reais; sem regressão funcional. **Risco:** contagens/eventos concorrentes. **Rollback:** leitura compatível e contador anterior sem migração destrutiva.

## Fase 5 — comunidade e Now Call, uma integração por entrega (P1/P2)

Verificar memberships, cargos, convites, bloqueios, reconexão e moderação; depois áudio P2P/TURN e SFU em ambiente próprio, estados de permissão/dispositivo e CSP HTTPS/WSS restrita ao destino aprovado. Não remover P2P, servidores ou chamadas existentes para simplificar SFU.

**Aceite:** terceiro/espectador não publica mídia indevida; saída/banimento revogam acesso; limites reais de sala, reconexão, troca de microfone e câmera testados em dois clientes e rede adversa; erros comunicados sem presença simulada. **Risco:** CSP, firewall e plataformas. **Rollback:** restabelecer transporte anterior compatível; não excluir salas/dados.

## Fase 6 — recursos comerciais e nativos, individualmente (P1/P2)

Marketplace físico (estoque, reserva, entrega, devolução), anúncios (consentimento, saldo e métricas), Stories/Live e integrações de jogos recebem homologações separadas, sem habilitar flags em massa. Android e Electron precisam de builds e testes nas plataformas alvo; testar navegação, ponte JS, permissões, login e câmera/microfone reais.

**Aceite por recurso:** cenário feliz e falhas/concorrência/autorização comprovados; funcionalidades indisponíveis comunicam causa real; nenhum botão finge sucesso; benefícios do Verificado preservados; sem nova coleta pessoal desnecessária. **Risco:** custos, credenciais/aprovação de terceiros e limitações de WebView. **Rollback:** release anterior por recurso/plataforma e contratos compatíveis, com produção autorizada separadamente.

## Fase 7 — recuperação e liberação gradual (P1)

Ensaiar backup/restore completo em homologação, retenção/exclusão conforme política aplicável, observabilidade sem PII e release com manifest. Separar entrega web, Worker, regras e Functions. Definir alertas, responsáveis e janela de observação antes de qualquer mudança real.

**Aceite:** restore verifica contagens/relações/memberships e Verificado; RPO/RTO acordados e medidos; ledger financeiro reconciliado; homologação de jornadas críticas aprovada; rollback ensaiado; autorização explícita para cada alteração de produção. **Risco:** restaurar banco antigo sobrescreve atividade recente. **Rollback:** recuperação seletiva e reconciliação, nunca reset cego da plataforma.
