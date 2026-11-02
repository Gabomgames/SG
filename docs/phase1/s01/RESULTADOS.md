# Resultados da continuação S01

Execução real em Linux: Node 24.19.0, Java 21. Functions validadas em Node 20.20.2. Execução nativa Windows não realizada. Logs completos e hashes de entrada estão em evidence/.

| Grupo | Resultado |
|---|---|
| Unit/Worker/market/features | 73 aprovados |
| Contratos, fixtures e runners | 21 aprovados |
| Fundadores/cliente/espelho pago | 16 aprovados |
| Domínio de enquetes | 9 aprovados |
| Regressões V65–V69 | 51 aprovados |
| SQLite | 4 + 7 aprovados |
| Runtime D1/R2 e serviços locais | 20 aprovados |
| Total distinto executado | 201 aprovados, zero falhas/skip/todo nessas suítes |
| Domínio/cliente/espelho em Node 20 | Os mesmos 16 repetidos, sem somar ao total |
| Build e verificador | Aprovados |
| Audit raiz/Functions com limiar high | Aprovado; 0 altas/críticas nos dois escopos |
| Firestore regressão | Blocked/78; nenhum teste executado |
| Firestore S01 | Blocked/78; nenhum teste executado e regras ainda não compiladas no emulador |
| Firestore Fundadores | Blocked/78; transação real não executada |
| Chromium | Blocked/78 no preflight; nenhum caso executado |
| Descoberta Playwright | 26 casos encontrados; listagem não conta como teste aprovado |

O comando agregado retornou 1, allSelectedGatesPassed=false e completePhase1Run=true: todos os sete gates foram tentados, não todos aprovados. A tentativa registrada partiu do commit 9445442 com árvore em edição (gitDirty=true); os hashes de entrada são conferidos novamente contra os arquivos do commit da entrega. Isso não é uma execução fictícia pós-commit.

Os destinos oficiais de download do JAR e Chromium retornaram HTTP 403 do proxy. O erro não foi contornado. Publicação de configuração de ambiente, execução local Windows ou outro executor com acesso autorizado são necessários para continuar.

Os ZIP/bundle anteriores permanecem com os mesmos hashes de preserved-inputs.json. A origem V69 possui 344 entradas de fonte preservadas, sem arquivo original ausente. As comparações e as provas Git de entrega são feitas separadamente após o novo commit.

S01 está implementado no código; a sua comprovação de segurança continua pendente. Os riscos S02/S03 e o aceite humano não são resolvidos pelo resultado dos testes unitários. Consulte SEGURANCA.md e CRITERIOS-ACEITE.md.
