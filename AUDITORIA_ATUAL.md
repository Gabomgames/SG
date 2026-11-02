# Auditoria do ZIP V59.1 — 08/10/2026

Esta auditoria descreve o código recebido, não o ambiente publicado. Nenhuma credencial de produção foi disponibilizada. O incidente 401 informado no plano permanece sem diagnóstico em produção: **o ZIP recebido sequer valida a assinatura no webhook do Worker**, portanto difere da versão citada.

| Recurso | Estado inicial | Risco / prioridade | Arquivo | Correção prevista / aceite |
|---|---|---|---|---|
| Webhook Worker | Inseguro | Crítico P0 | `something-gamer-api/src/index.js` | HMAC, query prioritária, recurso remoto, valor, moeda e recebedor; fixtures negativas |
| Pagamentos Worker | Parcial | Crítico P0 | mesmo | KV com TTL de 2 dias e status sem validação financeira; substituir por D1 transacional, checkout desabilitado sem configuração |
| Verificação | Divergente | Alto P0 | `verification.js`, `functions/index.js` | Cliente usa preapproval recorrente, Worker usa Orders; unificar compra avulsa e análise separada |
| Checkout Market | Incompleto | Crítico P0 | `functions/index.js` | Sem split, reserva/estoque atômico; bloquear compra até integração comercial validada |
| Webhook Functions | Parcial | Crítico P0 | mesmo | Sem validação de valor/moeda/recebedor; aprovação retornava antes de estornos; corrigir transação |
| Admin | Parcial | Alto P0 | `admin.js`, `firestore.rules` | Claim permite acesso direto global ao Firestore; ausência de dispositivo/reautenticação e senha de área ignorada; desabilitar painel até política forte |
| Uploads | Inseguro para chat | Crítico P0 | Worker, `media-upload.js` | Mídia privada publicada como URL permanente e pública; bloquear novos uploads privados até armazenamento autorizado |
| Moderação remota | Parcial | Alto P0 | Worker | URL HTTPS arbitrária permite SSRF e redirects; restringir origens e redirects |
| Chat | Funcional parcial | Alto P1 | `chat.js`, rules | Mensagens persistidas no Firestore, envio/retry sem ID estável, online fictício, polling redundante; idempotência e regras negativas |
| Servidores | Parcial | Alto P1 | rules, `communities.js` | Conhecer ID permite entrar em servidor privado; exigir convite; limitar consultas |
| Anúncios Market | Parcial | Alto P1 | `ecosystem.js`, rules | Create aceita campos extras e update não revalida preço; schema, expiração de destaque, filtros e paginação |
| ADS | Parcial | Alto P1 | Functions, `ads-pro.js` | Pagamento ativa campanha sem revisão/entrega com orçamento verificável; bloquear nova cobrança, preservar rascunhos |
| Social | Parcial | Médio P2 | `feed.js`, `social.js` | Firestore real; revisar limites, estados e acessibilidade; manter módulos estáveis |
| Call Now | Parcial | Médio P2 | `calls.js`, Worker | WebRTC existente, TURN depende de secret externo; manter credenciais efêmeras, não declarar NAT universal |
| UI / index | Parcial | Médio P2 | HTML/CSS | 12 camadas CSS e landing com métricas inventadas; tokens, mobile, foco, nomes e linguagem honesta |
| Service worker | Quebrável | Médio P2 | `service-worker.js` | Precache exige arquivos removidos pelo bundle; cache de páginas privadas; shell mínimo público |
| Build | Parcial | Médio P2 | `scripts/build.mjs` | Ofuscação amplia bundle; remover por padrão, excluir testes/documentação do Hosting |

Baseline: 219 arquivos versionáveis; inventário com SHA-256 em `docs/INVENTARIO_ORIGINAL.json`. Arquivo ZIP original permanece intacto. Verificador original tem 242 verificações estáticas: a execução inicial falhou porque `spawnSync` está proibido no ambiente (EPERM), não por 53 erros de sintaxe. Será adaptado para parser no processo. Sem testes automatizados de domínio no ZIP.

Não foram encontrados arquivos AGENTS.md. As chaves Firebase e site keys reCAPTCHA presentes são identificadores públicos, não credenciais privadas. Não há histórico Git no ZIP; não é possível auditar segredos em histórico anterior. Não imprimir ou copiar senhas; revisar e rotacionar no provedor quaisquer credenciais já compartilhadas.

Não é possível medir Core Web Vitals ou concluir E2E autenticado de produção sem contas de teste, serviços e configurações. Não há autorização para criar infraestrutura paga, ativar Blaze ou fazer deploy.
