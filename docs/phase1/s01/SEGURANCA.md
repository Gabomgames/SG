# Segurança — continuação S01 da Fase 1

Data: 02/11/2026. Decisão: Fase 1 NÃO APROVADA. Há implementação e evidência local nova, mas a semântica das regras ainda depende da execução real do emulador. Não houve deploy, push, merge, cobrança, mudança de dados reais ou ativação da promoção.

## Escopo examinado

Foram revisadas todas as referências S01 dos documentos v69 (diagnóstico, plano, testes e evidências), do relatório de Fase 1 e do arquivo consolidado anexado. Elas descrevem o mesmo conjunto de falhas em posts e votos. Foram examinados os três clientes de publicação/voto (feed, compositor e dashboard), o anúncio de eventos e os pontos de leitura legada. Enquetes de canais já têm escritas diretas de cliente proibidas pelas regras e não foram liberadas nesta alteração.

## Tratamento de S01

| Superfície | Antes | Implementação atual | Prova exigida |
|---|---|---|---|
| Schema do post | Campos extras e pollOptions arbitrário podiam ser gravados | Whitelist de campos conhecidos, tags tipadas/limitadas, metadados tipados/limitados e referência de evento do próprio autor | Controles positivos e negativos no Firestore Emulator |
| Novas enquetes | Nenhum limite de quantidade, tipo, texto ou duplicidade no servidor | 2–4 opções, strings de 1–90 caracteres, sem bordas em branco/separadores, sem quebras de linha e sem duplicação em caixa diferente | Matriz de regras, não somente JavaScript |
| Parent do voto | Voto aceito sem verificar post existente/tipo | Post deve existir e ser enquete com opções; índice precisa apontar para uma string real | Casos inexistente, texto com opções legadas e limites de índice |
| Autoridade do eleitor | Apenas caminho UID e canAct, sem schema de payload | Caminho igual ao UID autenticado, payload uid/option/updatedAt estrito, carimbo igual a request.time e bloqueio bidirecional com autor | Forja de UID, campos extras, anônimo, banimento e Termos antigos |
| Alteração/retirada | Política ampla, dados não validados | Um voto atual por UID; dono pode alterar para opção válida ou retirar; não altera voto de outro; pode retirar voto órfão | Testes de update/delete e controles positivos |
| Compatibilidade | Dashboard escrevia texto; feed comparava somente número | Novos votos dos dois clientes usam índices; leitura suporta rótulo antigo exato sem converter string numérica para índice incorreto | 9 testes puros e casos reais de legado |
| Novas publicações não-enquete | Opções antigas do modal podiam acompanhar outro tipo | Clientes não enviam opções escondidas; schema aceita ausência dos metadados antigos opcionais e veta opções em novo post não-enquete | Text/image/video/news legítimos e schema antigo opcional |
| Eventos no feed | Anúncio não seguia lote exigido pelo rate limit já existente | Usa escreverComLimite e mantém o anúncio de evento próprio | Caso positivo de notícia de evento; UI real ainda depende de navegador |

Não foram migrados nem apagados posts/votos antigos. Documentos existentes continuam legíveis; enquetes históricas com mais de quatro opções ainda podem receber voto válido. Escritas textuais de clientes antigos são aceitas somente se o texto é uma opção real. Texto ambíguo legado não recebe uma seleção inventada na UI.

Rótulos abusivos já são sujeitos à barreira textual existente nas regras. Esta correção de schema não transforma moderação no navegador em uma autoridade de servidor e não resolve S02 por si só.

## Testes de regras e honestidade da evidência

A suíte security-s01 agora inclui controles positivos (2/3/4 opções, tipos anteriores, metadados opcionais, evento próprio, votos numéricos/textuais, alteração/retirada e legado) e rejeições de schema, identidade, índice, duplicidade, frequência, bloqueio, suspensão de autoridade e timestamp falso. Esses controles impedem considerar uma negação total ou um erro de frequência como prova suficiente de correção.

As três suítes Firestore foram tentadas e interromperam antes dos testes porque o serviço oficial do JAR recebeu HTTP 403 do proxy. Exit 78 significa blocked; não comprova compilação, aprovação ou falha de uma regra. Não foi criado um mock das regras para substituir o emulador.

O navegador descobre 26 casos, incluindo dois novos do compositor S01. Nenhum caso foi executado: o preflight confirmou ausência do Chromium, e o download oficial continua com 403. Descoberta/preflight não contam como aprovação do produto.

Os 201 testes locais aprovados cobrem domínio/Worker, contratos e runners, promoção, normalização de enquete, regressões anteriores, SQL e runtime local. Os nove casos puros da enquete são validação do cliente, não prova das regras Firestore. A execução nativa Windows não foi realizada nesta máquina Linux; o guia Windows contém o procedimento e a coleta reproduzível de resultados.

## Dependências altas corrigidas (S04 relacionado ao gate de aceite)

A auditoria atual foi consultada no registro npm. Não foi usado audit fix --force, downgrade de TLS ou alteração de checksum.

| Pacote/local | Antes | Depois |
|---|---|---|
| body-parser raiz / CLI | 1.20.8 | 1.20.9 |
| body-parser SDK MCP transitivo | 2.3.0 | 2.4.0 |
| re2js | 2.8.6 | 2.9.1 |
| undici Miniflare | 7.29.1 | 7.30.1 |
| undici node-gyp | 8.11.2 | 8.12.3 |
| undici raiz / CLI | 6.29.0 | 6.29.1 |
| zod | 4.6.5 | 4.6.7 |
| body-parser Functions | 1.20.8 | 1.20.9 |

A única substituição de resolução adicional é overrides.miniflare.undici (^7.30.1), porque a versão instalada de Miniflare prendia exatamente a versão vulnerável 7.29.1. As demais atualizações respeitam os intervalos declarados. O diff também adiciona qs transitivo do body-parser corrigido; são oito entradas de pacotes alteradas na raiz e uma nas Functions. As dependências diretas e engines de Functions não foram trocadas. O lockfile anterior continua recuperável em 9445442.

Resultado: raiz de 4 altas/0 críticas para 0 altas/0 críticas, com 19 moderadas; Functions de 1 alta/0 críticas para 0 altas/0 críticas, com 9 moderadas. Esses números pertencem a dois escopos e não representam vulnerabilidades únicas somáveis. O runtime foi repetido com os pacotes novos efetivamente instalados; a promoção foi repetida em Node 20.

O gate npm run audit:high exige ausência de altas/críticas nos dois escopos; uma falha de consulta não é aprovação. Avisos moderados permanecem registrados para triagem, conforme caminhos reais de execução. O catálogo npm não prova ausência de vulnerabilidades de aplicação. Electron/Android não foram submetidos a builds ou auditoria dinâmica nesta entrega.

## Riscos que continuam abertos e impedem um aceite amplo

| Achado | Evidência atual | Tratamento pendente antes de aceitar riscos potencialmente altos |
|---|---|---|
| S02 — moderação/mídia | moderation.js ainda permite local-fallback em falhas; publicação direta e fallback Storage continuam no legado | Definir e testar autoridade/quarentena/revisão no backend, falhas e limpeza compensatória sem apagar conteúdo existente; avaliar eficácia com dados sintéticos |
| S03 — mídia legada privada | URLs getDownloadURL com token e regras Storage de chat não equivalem a revogação por bloqueio | Inventário/avaliação em homologação, autorização de mídia e revogação compatíveis com URLs/dados legados; nenhuma mudança cega em produção |
| S01 — comprovação | Correções locais ainda não foram compiladas/exercitadas no emulador real | Obter JAR oficial, executar matriz positiva/negativa e corrigir falhas que aparecerem |
| Runtime de navegador/Windows | 26 casos de browser não executados; instruções Windows não exercitadas num Windows real | Instalar Chromium oficial, executar suíte e registrar evidência da plataforma |

S02/S03 são achados P1 com risco de desenho ainda não encerrado, não CVEs classificados arbitrariamente nem falhas declaradas resolvidas. Qualquer classificação alta/crítica confirmada deve ter tratamento testável antes do aceite; registrá-la neste relatório não constitui mitigação ou aceitação de risco. Responsável pela decisão de liberação: NOW, mediante evidência técnica e autorização explícita. Marco para tratamento: antes do aceite da Fase 1. Não há aprovação implícita de adiar esses riscos para a Fase 2.

## Preservação e limites

Autenticação, MFA/gates administrativos, lógica de pagamentos e promoção não foram substituídos. Os preços 1490/7990/14990 centavos e prazos 30/180/365 dias são exercitados pelos contratos existentes. config.js e o parâmetro de lançamento do backend permaneceram inalterados: promoção desativada. Não há comando de ativação ou de publicação nos novos runners.

O histórico novo mantém 9445442 como ancestral. O link node_modules versionado nesse commit foi removido da versão atual e passou a ser ignorado também quando for symlink; isso corrige a portabilidade sem apagar ou reescrever o histórico anterior. As dependências agora são uma instalação local normal, fora do Git. O ZIP e bundle anteriores são preservados por hash; o pacote novo inclui os dois e um bundle atualizado.

O scanner offline procura formatos conhecidos de segredos nos arquivos staged e blobs de todo o histórico. Zero detecções não certifica ausência de todo segredo possível; não há autorização de envio externo nesta tarefa. Chaves públicas Firebase/reCAPTCHA são preservadas, não são credenciais administrativas. Nenhum valor secreto foi solicitado ou exposto.

## Próximos passos

Use WINDOWS-VSCODE.md para executar os gates com os downloads oficiais disponíveis. Use CRITERIOS-ACEITE.md para decidir o encerramento; allSelectedGatesPassed=false nesta instância. A Fase 2 requer autorização explícita depois do aceite. O pacote fica preparado para entrega exclusivamente pelo GitHub, sem upload ou URL inventada.
