# Validação final após recuperação de 6052659

Esta revisão mantém 6052659 como ancestral e acrescenta correções S03 e evidências reais de nova execução. A Fase 1 continua aberta enquanto Firestore/Storage, Chromium e a revogação S03 não forem comprovados.

- [Relatório desta validação](docs/phase1/validation-6052659/RELATORIO.md)
- [Executar no Windows/VS Code](docs/phase1/validation-6052659/EXECUTAR-VALIDACAO.md)
- [Inventário e plano S03, sem acesso a produção](docs/phase1/validation-6052659/S03-INVENTARIO-E-PLANO.md)

Os relatórios anteriores abaixo são históricos. Preços e Fundadores preservados; nenhuma campanha ativada ou dado de produção alterado.

# Something Gamer — reta final da Fase 1

S02/S03 receberam implementação e 282 testes locais distintos passaram. **Fase 1 ainda não aprovada:** três suítes Firebase e 26 casos Chromium bloqueados, e tokens privados legados sem revogação comprovada. Sem push, merge, deploy, cobrança, alteração de produção ou Fase 2.

- [Relatório único atual, segurança e resultados](docs/phase1/final/RELATORIO.md)
- [Comandos completos para Windows / VS Code](docs/phase1/final/WINDOWS-VSCODE.md)
- [Compatibilidade do legado e revogação pendente](docs/phase1/final/MIGRACAO-LEGADO.md)
- [Critérios objetivos de aceite](docs/phase1/final/CRITERIOS-ACEITE.md)

Use Node 24.19.0 e `npm run validate:phase1`; Functions mantêm Node 20.20.2. As regras exigem emulador real de Firestore/Storage e o navegador exige Chromium oficial. Exit 78 é bloqueio; a validação global retorna falha até todos os gates passarem. Preços e promoção automática de 50 Fundadores preservados; promoção continua desligada por padrão.

ZIP/bundle preparados para entrega exclusivamente pelo GitHub após upload autorizado e confirmado. Nenhum arquivo foi enviado e nenhum link foi inventado.

## Histórico das entregas anteriores (preservado)

Os relatórios em `docs/phase1/s01` descrevem a revisão anterior de S01 e não substituem o relatório atual.



# Something Gamer — Beta 0.1

Fonte V69 existente, com correções da Fase 1 e promoção automática dos 50 Fundadores SG implementada localmente, desativada por padrão. Sem deploy ou push.

- [Relatório e resultados reais](docs/phase1/RELATORIO.md)
- [Executar no VS Code](docs/phase1/EXECUTAR-NO-VSCODE.md)
- [Promoção dos fundadores e limites](docs/phase1/FOUNDERS.md)

Web/Worker: Node 24.19.0. Functions: Node 20.20.2. Instale com npm ci em cada runtime. Execute npm run check:fast, npm run test:runtime e os gates Firestore/navegador documentados. Emulador e navegador permanecem bloqueados na nuvem; a beta não está certificada para produção.
