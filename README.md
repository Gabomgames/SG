# Something Gamer (SG)

**Plataforma social gamer | Projeto independente em desenvolvimento**

O Something Gamer (SG) é uma aplicação voltada à comunidade de jogadores, criada para reunir perfis, publicações, conversas, comunidades e outros recursos em uma mesma experiência. Este repositório contém o código do projeto existente e sua evolução incremental — não é um projeto de demonstração refeito do zero.

**Estado atual:** beta em desenvolvimento. A Fase 1 **não está homologada para publicação**. A existência de funcionalidades no código não equivale à sua validação completa em produção.

## Funcionalidades e escopo

- Cadastro, autenticação e gerenciamento de perfis.
- Feed social, publicações e interações.
- Conversas, comunidades e ferramentas de moderação.
- Interfaces para computador e dispositivos móveis.
- **Verificado Gamer** e **NOW ADS**: recursos já presentes no projeto, sujeitos a revisão, configuração e testes.
- Estruturas de chamadas e integrações de mídia: funcionamento depende dos serviços, permissões e configurações correspondentes.

Alguns recursos financeiros, administrativos e de mídia permanecem desativados ou limitados por segurança. Não se deve confundir código implementado com serviço habilitado.

## Tecnologias utilizadas

| Área | Tecnologias |
| --- | --- |
| Interface | HTML, CSS e JavaScript |
| Ferramentas e automação | Node.js, npm e scripts de validação |
| Autenticação e dados | Firebase Authentication, Firestore e Firebase Storage |
| Serviços | Firebase Functions e Cloudflare Workers |
| Desenvolvimento e versionamento | Git e GitHub |
| Testes | Node.js Test Runner e Playwright |

O repositório também contém diretórios para integrações Android e desktop.

## Executar localmente

**Requisito de referência:** Node.js 24.19.0 (consulte a versão fixada nos arquivos de configuração).

Em um ambiente de desenvolvimento autorizado, com dependências e serviços configurados:

    npm ci
    npm run dev

O servidor de desenvolvimento local é acessado em \`http://localhost:5173\`. Isso **não publica** o SG na internet nem garante, por si só, o funcionamento de integrações externas.

Para validação:

    npm run check:fast
    npm run test:runtime
    npm run validate:phase1

A validação completa exige o ambiente oficial de testes Firestore/Storage e Chromium; uma suíte bloqueada **não conta como aprovada**.

Guia detalhado: [Execução e validação no VS Code](docs/phase1/validation-6052659/EXECUTAR-VALIDACAO.md).

## Organização do projeto

- Interface e módulos web: arquivos HTML, CSS e JavaScript na raiz.
- \`functions/\`: serviços executados em Firebase Functions.
- \`something-gamer-api/\`: API e serviços Cloudflare.
- \`android-app/\` e \`desktop-app/\`: integração com outras plataformas.
- \`tests/\`: testes e verificações automatizadas.
- \`docs/\`: documentação técnica, auditorias e registros de validação.

## Segurança e estado de publicação

A proteção de usuários e informações privadas é prioridade. A revisão atual da Fase 1 registra verificações de integração pendentes e tarefas de segurança que exigem validação em ambiente autorizado.

- [Segurança e moderação](SECURITY.md)
- [Relatório da validação mais recente](docs/phase1/validation-6052659/RELATORIO.md)
- [Critérios de aceite da Fase 1](docs/phase1/final/CRITERIOS-ACEITE.md)
- [Checklist de preparação para repositório público](docs/PUBLICATION_READINESS.md)

**Não torne este repositório público nem ative serviços de produção antes da conclusão documentada do checklist de publicação.** Nunca adicione tokens, senhas, contas de serviço ou dados de usuários ao Git.

## Projeto e autoria

**Something Gamer (SG)** — projeto pessoal de desenvolvimento de software de **Gabomgames**.

Uso de ferramentas de IA como apoio ao desenvolvimento, com revisão, integração e testes do código. Projeto em evolução; funcionalidades e condições de uso podem mudar.
