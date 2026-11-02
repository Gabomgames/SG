# Continuação da Fase 1 — S01

Correções S01 implementadas localmente; Fase 1 ainda não aprovada. Sem push, deploy, merge, cobrança ou ativação da promoção.

- [Relatório de segurança atual](docs/phase1/s01/SEGURANCA.md)
- [Executar todos os testes no Windows/VS Code](docs/phase1/s01/WINDOWS-VSCODE.md)
- [Critérios objetivos de aceite](docs/phase1/s01/CRITERIOS-ACEITE.md)

Use Node 24.19.0 e `npm run validate:phase1`. Os testes de regras exigem o Firestore Emulator real e o navegador exige Chromium oficial. Bloqueios retornam 78; o resultado agregado é falha, nunca aprovação. Downloads do projeto são exclusivamente pelo GitHub após envio confirmado; não houve envio nesta tarefa.

## Entrega anterior preservada

# Something Gamer — Beta 0.1

Fonte V69 existente, com correções da Fase 1 e promoção automática dos 50 Fundadores SG implementada localmente, desativada por padrão. Sem deploy ou push.

- [Relatório e resultados reais](docs/phase1/RELATORIO.md)
- [Executar no VS Code](docs/phase1/EXECUTAR-NO-VSCODE.md)
- [Promoção dos fundadores e limites](docs/phase1/FOUNDERS.md)

Web/Worker: Node 24.19.0. Functions: Node 20.20.2. Instale com npm ci em cada runtime. Execute npm run check:fast, npm run test:runtime e os gates Firestore/navegador documentados. Emulador e navegador permanecem bloqueados na nuvem; a beta não está certificada para produção.
