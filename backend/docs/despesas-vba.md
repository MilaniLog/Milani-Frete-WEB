# Despesas do VBA

Em 25/09/2026 foram importadas as 24 despesas da aba identificada pelo VBA como `PlanExpense`, colunas A (código), B (nome) e C (tipo), a partir da linha 6. A unidade 100 vem de `PlanRestrict!E2`. Os códigos mantêm os zeros iniciais e os tipos são preservados sem inferência a partir do nome. Todas foram incluídas como ativas, pois o cadastro original não possui coluna de ativação.

A extração usa somente o XML do XLSM, sem abrir o Excel nem executar macros: `python scripts/extract-expenses.py <planilha> <saida.json>`. A referência local é `referencias/vba/expenses.json`. Na pasta backend, `node -r ts-node/register scripts/seed-expenses.ts --unit=100` apresenta a prévia; acrescentar `--apply` importa. O processo é transacional, não duplica códigos e aborta diante de nomes/tipos divergentes. Não altera lançamentos históricos nem despesas de outras unidades.

POST e PUT de `/freight-expenses` exigem administrador no serviço. GET continua disponível aos usuários com permissão de fretes para consulta e seleção no lançamento. A interface só apresenta inclusão, edição e ativação/desativação a administradores.

Validação: 21 testes do serviço de lançamentos, 7 testes de cadastros no frontend, builds de ambos e 107 verificações HTTP com rollback, incluindo leitura autorizada e POST/PUT negados para usuário comum.
