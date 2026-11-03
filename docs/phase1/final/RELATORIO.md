# Something Gamer — relatório único da reta final da Fase 1

Data: 03/11/2026 (UTC). **Decisão técnica: Fase 1 ainda NÃO APROVADA.** S02/S03 receberam implementação no código existente e testes locais novos. A comprovação das regras e do navegador continua bloqueada; tokens privados legados de produção não foram inventariados nem revogados. Nenhum desses pontos foi marcado como aprovado ou adiado implicitamente para a Fase 2.

Não houve push, upload externo, merge, deploy, cobranças, ativação da campanha ou acesso a dados reais. O histórico é continuado a partir de `a797418`, que mantém `9445442`. Os commits antigos `991c66f`/`6c2fefe` não foram recuperados, conforme a decisão anterior do usuário. Nenhum histórico foi reescrito.

## S02 — moderação, publicação e exposição prematura de mídia

A auditoria anterior apontava `moderation.js` permitindo continuação em indisponibilidade, gravação direta de posts sem decisão confiável e fallback Firebase Storage que expunha bytes sem revisão. O navegador não pode ser uma autoridade de aprovação.

| Correção implementada | Comportamento e evidência |
|---|---|
| Moderação do cliente falha fechada | Rede, timeout, HTTP de erro, JSON inválido, schema ambíguo e troca de sessão não aprovam. Cache tem prazo e chave por UID. Testes em `tests/security-s02-s03.test.mjs`. |
| Decisão de backend sobre os bytes | Upload autenticado, perfil/Termos ativos, App Check conforme configuração, rate limit D1, assinatura MIME e SHA-256. Novos arquivos entram em namespace privado, com dono e finalidade registrados. Quota é reservada antes de gravar bytes. |
| Quarentena preserva imagem/vídeo/áudio | Imagens PNG/JPEG/WebP de até 5 MB podem passar por visão + classificador do backend. Vídeo, áudio, GIF, arquivos maiores ou AI indisponível aguardam revisão. Falhas não tornam arquivos públicos. Formato inválido/rejeitado deixa limpeza compensatória. A classificação automatizada não garante detecção de todo abuso. |
| Autorização de publicação pelo servidor | `/posts/authorize` valida o draft, consulta o perfil confiável e o evento do autor, vincula mídia imutável própria e emite recibo de 10 minutos, específico ao post/UID/conteúdo. ID e hash do draft são reivindicados atomicamente em D1, inclusive sob concorrência. |
| Barreira nas regras Firestore | Post novo requer recibo criado pelo backend. O lote do cliente deve criar post, atualizar rate limit e consumir o recibo, todos com carimbo do servidor. Não permite mint/list/delete de recibos pelo cliente, alteração do conteúdo aprovado, reutilização ou consumo sem post. S01 continua exigido. A semântica dessas regras ainda precisa do emulador real. |
| Revisão administrativa preservada | Nova fila no painel permite prévia privada, motivo obrigatório e aprovação/rejeição. Backend exige UID permitido, claim admin, e-mail verificado, MFA Firebase recente e assertion Cloudflare Access validada. Decisões concorrentes usam reserva D1; publicação usa precondições do Firestore e auditoria. Falhas podem ser retomadas sem publicar duas vezes. |
| Clientes existentes atualizados | Feed/compositor, dashboard e anúncio de eventos usam o mesmo protocolo. Mensagem de conteúdo em análise não promete publicação. Posts já existentes continuam legíveis e votos/comentários preservam seus controles anteriores. O fallback direto para Storage foi substituído pelo gateway; falha do gateway não o reativa. |
| Arquivo aprovado ainda precisa de vínculo | GET só serve bytes aprovados ligados ao post/foto efetivada/anúncio canônico do proprietário. ID conhecido, órfão e foto apenas pendente não bastam. Bytes são conferidos por tamanho/hash. Respostas não ficam em cache público. Evidência de denúncia nunca é servida publicamente. |
| Retenção/compatibilidade | Denúncia vinculada mantém suas provas; posts/fotos/anúncios existentes mantêm seus arquivos. Limpeza atua apenas no novo namespace e preserva arquivos se o estado remoto é incerto. KV de publicação não herda o TTL de 30 dias dos anexos privados. Não há varredura/destruição do legado. |

A adoção de mídia antiga do KV é explícita via `/admin/media/adopt-legacy`: razão, autoria nos metadados, vínculo no documento canônico, validação dos bytes e auditoria; mantém ID/URL e o objeto original. **Essa adoção não foi executada em produção.** Um rollout futuro exige inventário e revisão do legado antes de trocar o serviço. Sem adoção, objetos KV antigos não são automaticamente promovidos a públicos. Fotos/anexos/relatos legados possuem gateway administrativo privado; não foram apagados.

Arquivos principais: `moderation-client.js`, `moderation.js`, `post-publication-client.js`, `post-publication.js`, `admin-publications.js`, `something-gamer-api/src/{post-domain,publication,publication-media,legacy-public-media,moderation-provider}.js`, migração `0017_publication_security.sql`, `firestore.rules` e `storage.rules`.

**Estado S02:** correção implementada e exercitada em JavaScript e D1/R2 reais locais; integração Firebase e UI Chromium não homologadas. Não é um achado encerrado por teste unitário ou revisão estática.

## S03 — links privados legados e revogação por bloqueio

Uma URL Firebase com download token é uma credencial de acesso ao objeto. Regras Storage novas, sozinhas, não invalidam tokens já emitidos. Alterar somente a interface deixaria o risco original aberto.

| Correção implementada | Comportamento e evidência |
|---|---|
| Parser canônico | Aceita somente host HTTPS oficial, bucket do projeto e caminhos privados esperados. Recusa host semelhante, credenciais na URL, travessia, segmentos extras e objeto de outra finalidade. O token não é devolvido nem encaminhado; prévia, cópia, salvamento e exportação de referências privadas no chat usam a referência sem token. |
| Chat legado pelo gateway | Browser não usa `src`/download direto para URLs reconhecidas de `chat/`. A cada nova leitura, o backend usa o token do participante e as regras Firestore atuais para membership/bloqueio; também confere que dono do objeto e solicitante pertencem à sala. Só então lê bytes por GCS OAuth com escopo `devstorage.read_only`, host fixo e sem redirect. |
| Novos anexos privados preservados | Fluxo D1/R2 anterior permanece, com autorização atual em cada leitura e App Check encaminhado ao Firestore. Encaminhamento para outra conversa não reutiliza URL privada. Blob URLs são revogadas ao sair/trocar a conversa e ao deslogar. Bytes já recebidos ou copiados por uma pessoa não podem ser remotamente apagados. |
| Painel e provas/fotos privadas | URLs antigas de reports/profile-review são lidas por gateway administrativo com os mesmos gates fortes. Não precisam virar link público com token. |
| Storage sem fallback privado | Novas escritas de cliente em posts/profiles/chat/reports/profile-review são negadas. Chat, evidência e foto em análise também negam leitura direta por SDK. Leitura autenticada de posts/profiles legados públicos permanece. |
| Plano de revogação sem tocar produção | `scripts/legacy-token-plan.mjs` lê inventário LOCAL e gera operações sem valores de tokens, com `ifMetagenerationMatch`, preservando bytes e outros metadados. Não existe executor de produção nessa ferramenta. |
| Teste de revogação real preparado | A primeira suíte passa a iniciar Firestore + Storage Emulator. Demonstra que token antigo atravessa regras, que rotação no emulador invalida aquela URL e que o objeto continua legível pelo acesso de servidor. Não foi executado aqui. O emulador usa sua API de tokens; isso não comprova PATCH/precondições/IAM do GCS real. |

**Estado S03:** novos caminhos de código protegidos e comportamento do gateway testado com D1/R2 e fronteiras remotas isoladas; o risco de URLs antigas fora do aplicativo **permanece aberto até inventário e revogação comprovados** em ambiente autorizado. Um token já vazado ainda pode ser usado diretamente contra o Firebase. Esta tarefa proíbe alterar produção; portanto, não há evidência de revogação real. O guia `MIGRACAO-LEGADO.md` define a sequência e os critérios de conclusão. Não executar essa migração em produção com base neste relatório.

## Reavaliação de autenticação, administração e Fundadores

- Worker usa validação remota Firebase accounts:lookup e vincula `sub` ao `localId` retornado; confere projeto/issuer, algoritmo esperado, expiração/tempos, conta desabilitada e revogação por `validSince`. Nenhum claim enviado pelo navegador substitui essa validação. Tests têm serviços remotos isolados; não são autenticação real de produção.
- Acesso administrativo direto pelo Firestore continua negado. Fila nova, prévias e adoção do legado passam pelo mesmo `requireAdmin`, com allowlist + claim + e-mail verificado + MFA recente + Access criptográfico. Nenhum token/segredo foi adicionado ao frontend.
- S01 mantém schema estrito de posts/enquetes/votos, timestamp/rate limit, bloqueios, autoria e leitura legada. Controles positivos existentes agora recebem recibos de fixture criados com regras desabilitadas, para que uma rejeição por falta de recibo não mascare regressão S01. Casos S02 verificam ausência/forja/expiração/alteração/replay e publicação administrativa REST real no emulador.
- Promoção automática dos 50 Fundadores preservada: limite transacional 50, UID/e-mail idempotentes, normalização de aliases Gmail, risco retido sem consumir vaga, sequência/horário do servidor, 365 dias e notificação, sem pagamento/renovação. Revisão de risco é exceção; benefício legítimo não exige aprovação de administrador. Deduplicação e sinalização de risco não equivalem a garantia contra todas as contas fraudulentas.
- `config.js` continua com `foundersPromotionEnabled:false`; `SG_FOUNDERS_LAUNCH_ENABLED` continua default false e a campanha precisa de gate de servidor. Nenhuma campanha foi criada/ativada. Configuração/dados efetivos de produção não foram consultados; confirma-se o default do código e a ausência de ação de ativação nesta tarefa.
- Os mesmos 16 testes de promoção/cliente/espelho foram repetidos também em Node 20.20.2, e os exports das Functions carregaram localmente. Concorrência real do Firestore ainda não foi executada.
- Mantidos NOW; “O futuro é agora ;)”; “Yes, Something for you ;)”. Mantidos Verificado Gamer **R$ 14,90 / 30 dias**, **R$ 79,90 / 180 dias**, **R$ 149,90 / 365 dias** e aprovação administrativa dos planos pagos.

## Resultados efetivamente obtidos

Execução Linux com Node 24.19.0 e Java 21; Functions também em Node 20.20.2. Windows nativo não foi usado. Resultado agregado: exit 1, `completePhase1Run:true`, `allSelectedGatesPassed:false`.

| Grupo | Aprovados | Reprovados na execução final | Não executados |
|---|---:|---:|---|
| Unit/Worker/Market/features anteriores | 73 | 0 | — |
| Segurança S02/S03 e cliente de publicação | 58 | 0 | — |
| Contratos, fixtures e runners | 21 | 0 | — |
| Fundadores/domínio/cliente/espelho | 16 | 0 | — |
| Domínio de enquetes | 9 | 0 | — |
| Regressões V65–V69 | 51 | 0 | — |
| SQL SQLite | 11 | 0 | — |
| Runtime D1/R2 local, incluindo 23 novos casos | 43 | 0 | — |
| **Total distinto executado** | **282** | **0** | Não inclui listagem, auditorias ou repetição Node 20 |
| Firestore regressão + Storage | 0 | 0 | Bloqueada antes dos testes, exit 78 |
| Firestore S01/S02 | 0 | 0 | Bloqueada antes dos testes, exit 78 |
| Firestore Fundadores | 0 | 0 | Bloqueada antes dos testes, exit 78 |
| Chromium (26 casos preservados) | 0 | 0 | 26 não executados; preflight bloqueado/78 |

O verificador e o build passaram. As 3 suítes Firebase não compilaram/exercitaram as regras nesta instância: nenhum mock de regras substituiu o emulador. Os testes runtime usam D1/R2 locais reais, mas Firebase/Auth/AI/GCS/provedor de pagamentos são fixtures controladas; não provam IAM, eficácia do modelo em campo ou segurança das regras reais.

`npm run audit:high` passou nos dois escopos: 0 altas e 0 críticas. Persistem 19 moderadas na raiz e 9 nas Functions; escopos não são contagens de vulnerabilidades únicas somáveis. Não foi usado audit fix --force. Esse gate não certifica ausência de falhas de aplicação. Android/Electron, credenciais reais, eficácia antifraude em campo e IAM GCS não foram homologados nesta entrega.

Houve tentativas preliminares reprovadas: assinatura do helper mudou e o verificador estático ainda procurava a forma antiga; isso foi corrigido mantendo a verificação do snapshot. A execução dentro do sandbox negou sockets/processos usados pelos testes, causando falhas de infraestrutura. A primeira repetição Node 20 usou uma opção disponível só no Node 24 e nem iniciou os testes; a opção foi retirada, o guia foi corrigido e a repetição real passou com os 16 testes. A execução final usou a permissão para servidores locais e passou. As duas asserções antigas de regressão que exigiam fallback inseguro foram atualizadas para exigir gateway/quarentena. Esses registros preliminares são preservados em `evidence/attempts/`; a tabela acima corresponde à execução completa final, não à ocultação de falhas pendentes.

## Ambiente e conectividade

O status observado confirma **revisão 1**, política restrita/enforced e nenhum domínio customizado aplicado. Os domínios necessários não aparecem na política efetiva: `api.github.com`, `storage.googleapis.com`, `cdn.playwright.dev`, `uploads.github.com`. Um rascunho de configuração não equivale a uma revisão publicada/aplicada. Não é correto afirmar que esta instância já usa a configuração atualizada.

Consultas HEAD oficiais retornaram HTTP 403 no CONNECT do proxy: GitHub API, JAR `cloud-firestore-emulator-v1.22.0.jar` e Chromium Playwright 1208. Não houve alteração de proxy/TLS, download alternativo ou contorno da rede. O Chromium está ausente e os três runners Firebase falham antes dos casos. A privacidade do repositório `Gabomgames/SG` não pôde ser reconfirmada nesta instância; uma URL fornecida não a comprova. Nenhum envio foi tentado.

## Preservação, pacote e conclusão

A comparação com o manifesto V69 cobre os 344 caminhos originais; o resultado da conferência atual está em `preservation.json`. Os módulos de Verificado Gamer, Now Call, feed, perfis e administração não foram excluídos. Trocar mecanismos inseguros e preservar arquivos não comprova sozinho equivalência funcional: a comprovação completa de UI permanece pendente dos 26 casos e da revisão de compatibilidade do legado.

ZIPs e bundles anteriores são preservados com seus hashes originais em `preserved-inputs.json`. O pacote novo contém fontes/lockfiles/migrações/guias, build local, evidências, bundle atualizado e cópias dos artefatos anteriores. Não contém node_modules, credenciais, caches ou um .git parcial. O bundle deve ser verificado e restaurado conforme o guia Windows; o manifesto externo da entrega registra o commit final e os SHA-256 dos artefatos.

**Entrega GitHub pendente:** os arquivos são preparados localmente. O usuário pediu downloads exclusivamente pelo GitHub e proibiu push/envio nesta tarefa. Não foi feito upload nem criado link de download. Um envio futuro exige privacidade confirmada e autorização específica. Não confundir pacote preparado com pacote já disponível no GitHub.

Os comandos exatos para concluir os testes estão em `WINDOWS-VSCODE.md`. Critérios objetivos de aceite em `CRITERIOS-ACEITE.md`. Enquanto houver bloqueio de testes, token privado legado sem tratamento comprovado ou vulnerabilidade alta/crítica sem correção verificada, a Fase 1 permanece aberta. **Não há autorização para iniciar a Fase 2.**
