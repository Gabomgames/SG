# Revisão pré-publicação — Something Gamer (SG)

**Status: BLOQUEADO para tornar público.** Revisado em 11/11/2026 com base no estado versionado da branch `codex/v69-phase1-local`.

Este documento é um controle de segurança, **não** um certificado de que o repositório ou a aplicação estão seguros. A alteração da visibilidade do GitHub **não foi realizada**. Não houve deploy nem acesso a sistemas de produção nesta revisão.

## Bloqueios atuais

| Prioridade | Verificação necessária | Estado |
| --- | --- | --- |
| Crítica | Inventário autorizado de objetos privados no Firebase Storage; revogação e comprovação de invalidade de links/tokens legados, com garantia de acesso legítimo por gateway | **Pendente**: os relatórios da Fase 1 não comprovam revogação em produção |
| Alta | Auditoria de credenciais e dados pessoais em **todo o histórico Git**, incluindo arquivos removidos e metadados | **Pendente**: reexecutar scanners e revisar manualmente |
| Alta | Execução efetiva das suítes Firestore/Storage em emulador e dos testes Playwright/Chromium | **Pendente**: não homologados na validação anterior |
| Alta | Revisão do conteúdo que ficaria público: documentos, imagens, nomes, endereços, dados de usuários e outros identificadores | **Pendente** |
| Alta | Revisão de dependências, controles de acesso administrativos, regras de banco/armazenamento e fluxos de publicação | **Pendente** |
| Média | Direitos de uso de imagens, ícones e bibliotecas redistribuídas | **Pendente** |
| Média | Documentação pública e instruções de instalação com variáveis de ambiente sem segredos | **Em preparação** |

**Importante:** o scanner automatizado detecta apenas formatos conhecidos; resultado sem achados não confirma que não há credenciais ou dados pessoais no projeto.

## Evidências existentes

- `docs/phase1/validation-6052659/RELATORIO.md`: Fase 1 não aprovada, integrações Firebase/Storage e navegador bloqueadas; S03 não revogado em produção.
- `docs/phase1/final/MIGRACAO-LEGADO.md`: procedimento de inventário, homologação e revogação, explicitamente **não executado** em produção.
- `scripts/scan-secrets.py`: busca padrões de segredos em arquivos versionados e nos blobs do histórico acessível localmente.
- `.github/workflows/verificar.yml`: verificações automatizadas; a revisão de segurança adiciona execução do scanner com histórico completo no CI.

As credenciais de cliente do Firebase, os IDs públicos de projetos e as chaves **site** do reCAPTCHA não são, por si só, segredos de servidor. Isso não elimina a necessidade de revisar regras e permissões.

## Etapas obrigatórias antes de mudar para Public

1. **Manter o repositório privado.** Criar alterações em branch separada, analisar o diff, revisar arquivos pessoais e artefatos que não devem ser distribuídos. Há um arquivo de imagem pessoal em `assets/` cujo uso público deve ser avaliado antes de liberar acesso geral.
2. Em um checkout confiável com **histórico completo** (`git fetch --all --tags`), executar `python3 scripts/scan-secrets.py`. Fazer também análise independente de padrões não contemplados e revisão manual de histórico, configurações e documentação. **Não compartilhar valores encontrados.**
3. Qualquer credencial ou URL privada real identificada deve ser revogada/rotacionada no provedor correspondente. Excluir só o arquivo atual não apaga o histórico; mudanças no histórico exigem estratégia e coordenação para evitar cópias antigas. Alterações em chaves podem invalidar serviços legítimos; testar e planejar antes.
4. Com identidade autorizada para leitura, obter inventário **real** de objetos privados e versões do Firebase Storage; revisar ACL, IAM, URLs alternativas e caches. A homologação e a revogação dos tokens de download legados devem seguir `docs/phase1/final/MIGRACAO-LEGADO.md`. Não executar operações em produção sem autorização específica, backup e testes em ambiente separado.
5. Validar Firestore/Storage e Playwright em ambiente real de teste, incluindo acessos negados, autenticados e fluxos administrativos. Rodar `npm run validate:phase1`; **não aprovar** se houver falha ou bloqueio.
6. Executar `npm run audit:high` e revisar também avisos moderados, riscos das dependências e permissões de automações do GitHub. O escaneamento de dependências não substitui a revisão da aplicação.
7. Inspecionar o histórico de commits, imagens, capturas de tela, relatórios, README, e-mails e outros dados pessoais; obter autorização de publicação para conteúdo de terceiros. Conferir o projeto de uma conta anônima antes de abrir tudo.
8. Configurar proteções do repositório público: análise de segredos e bloqueio de pushes quando disponível, revisão obrigatória de PRs, branches protegidas, atualização de dependências e permissões mínimas de GitHub Actions.
9. Revisar os relatórios e **registrar aprovação manual explícita** dos responsáveis por segurança e publicação. Só então alterar a visibilidade em Settings, com ciência de que histórico e forks podem ser copiados.

## Critério objetivo de liberação

O repositório só estará pronto quando os bloqueios de prioridade **Crítica** e **Alta** tiverem evidências de resolução, os testes exigidos estiverem aprovados, o histórico tiver sido revisado e houver decisão explícita de publicação.

**Não declare “seguro para tornar público” apenas porque README, scanner ou CI foram atualizados.**
