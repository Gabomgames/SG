# 50 Fundadores SG — implementação local, lançamento desativado

Esta promoção foi autorizada para implementação e testes locais. Não houve ativação remota, deploy ou cobrança. É uma exceção automática à análise administrativa dos planos pagos, que continuam em 1490/7990/14990 centavos por 30/180/365 dias.

## Entrada automática e autoridade

O frontend instala a sincronização apenas quando APP_CONFIG.foundersPromotionEnabled é true (padrão false). Observa o token, recarrega a situação do e-mail ao retornar à página e tenta novamente a cada 30 segundos se necessário. Não há botão de resgate. Uma verificação de e-mail em outro dispositivo só pode ser observada pelo cliente quando ele volta a comunicar-se com o backend; não existe gatilho Firebase Auth de atualização de emailVerified neste projeto.

A Function exige token Firebase válido/revogação verificada e App Check válido. A única dispensa de App Check exige simultaneamente FUNCTIONS_EMULATOR=true e GCLOUD_PROJECT começando com demo-. UID e e-mail vêm exclusivamente do Admin Auth; nenhuma data, contador ou elegibilidade recebida no corpo é utilizada. O gatilho de criação do perfil também tenta sincronizar automaticamente; uma liberação de risco no backend tenta novamente sem formulário de solicitação.

O backend também exige SG_FOUNDERS_LAUNCH_ENABLED=true (padrão false) e founderCampaigns/launch.enabled=true com launchAt válido já atingido. Nenhum documento de campanha foi criado em produção. Usuários beta não consomem vagas antes do lançamento; uma conta beta verificada pode tornar-se elegível após o lançamento.

## Ordem, limite e idempotência

A elegibilidade é admitida e registrada pelo servidor quando ele confirma os requisitos numa transação após o lançamento. eligibleAt, startedAt e sequence são derivados do relógio/estado do backend, nunca do navegador. O contador serializa concorrência e lastEligibleAt mantém ordem monotônica mesmo em retries. Isso ordena admissões confirmadas pelo backend, não promete reconstruir a hora em que um usuário clicou num link de e-mail fora do app.

A mesma transação lê campanha, perfil, concessão por UID, identidade de e-mail e bloqueio de risco; grava concessão, identidade consumida, contador, verificação privada/pública e notificação. O 50º prêmio fecha a campanha. Expiração, revogação e reentrada nunca devolvem vaga. Não há chamadas a provedores de pagamento, renovação ou pedido de aprovação individual.

UID e hash do e-mail normalizado impedem repetição; aliases Gmail/Googlemail com pontos ou + usam a mesma identidade. founderRisk marcado blocked/reviewRequired e contas banidas/suspensas são retidos sem bloquear outras contas. E-mail verificado, App Check e essas restrições não demonstram uma pessoa física única: fraude com várias identidades distintas ainda exige sinais de risco do backend e homologação. Não se promete proteção universal contra contas falsas.

## Convivência com os planos pagos

paidVerification conserva o estado pago, inclusive análise pendente, rejeição e estorno. verification é a projeção efetiva: permanece ativa enquanto o prêmio gratuito for válido, sem reduzir um benefício pago maior. O espelho do Worker usa precondição de versão do perfil e retries para não sobrescrever uma concessão concorrente. As Functions legadas usam escrita transacional compartilhada. A expiração restaura o estado pago, sem reativar pagamento estornado. Uma revogação administrativa explícita continua possível e não abre vaga novamente.

O painel Admin pode consultar contagem e concessões com o gate administrativo existente; não possui botão para ativar a campanha nem aprovar prêmios.

## Testes e ativação

`npm run test:founders` testa o domínio com um armazenamento otimista identificado como fixture e os conflitos do espelho com HTTP simulado. `npm run test:rules:founders` é o teste real das transações no Firestore Emulator. Este último continua bloqueado pelo download oficial do JAR. Os testes não certificam Firebase Auth/App Check em produção nem a entrega real de e-mail.

Antes de qualquer ativação: liberar os gates de emulador/navegador, homologar Auth/App Check e notificação num projeto separado, revisar critérios antifraude e obter autorização explícita do usuário. Somente então preparar configuração de lançamento e deploy autorizados. Não executar comandos de produção como parte deste trabalho.
