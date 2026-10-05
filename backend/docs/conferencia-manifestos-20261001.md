# Conferência de não entregues — 01/10/2026

Fonte: arquivo XLSM atualizado indicado pelo usuário. SHA-256: `5e727a30313e6d1f1e8788714e8f9b8b1377773536fa1ef2a48ffbb19a374a4b`.

Foram usados os cinco últimos registros inseridos na aba Manifestos (linhas 14351 a 14355), todos com data de carregamento 30/09/2026. A seleção segue a ordem das linhas, não a coluna AW, que também pode mudar numa edição. A amostra não foi escolhida para favorecer coincidências.

O módulo ManifestUtil extraído do próprio arquivo atualizado confirma que `CalcOldPercentManifest` aplica `CalcICMS777/888/999` também aos não entregues. Essas funções multiplicam o valor por `1 − alíquota`. A aba ICMS contém 7%, 12% e 12%, respectivamente. Portanto não há acréscimo de imposto: a não entrega é descontada na mesma base líquida dos fretes.

Uma consulta somente de leitura confirmou essas mesmas alíquotas e percentuais (15%, 25%, 100%) nas regras ativas de SP no banco atual.

| Manifesto | Não entregue informado | Não entregue calculado | Base líquida legada AP | Total a pagar Y | Percentual final |
|---|---:|---:|---:|---:|---:|
| 100048541-1 | 214,65 | 188,892 | 1.015,976 | 460,00 | 45,276660% |
| 100048550-1 | 0,00 | 0,00 | 712,3504 | 310,00 | 43,517909% |
| 100048537-3 | 0,00 | 0,00 | 846,2248 | 310,00 | 36,633292% |
| 100048551-9 | 0,00 | 0,00 | 1.967,8208 | 560,00 | 26,318006% |
| 100048548-9 | 489,30 | 430,584 | 873,488 | 250,00 | 28,620885% |

Todos os valores comparados coincidiram, respeitando quatro casas monetárias e oito casas para as frações percentuais. A base AP exclui descarga, conforme a coluna legada; o percentual final inclui descarga. Por isso nem sempre equivale a Y dividido por AP.

O teste `latest-manifests.spec.ts` executa o serviço real de cálculo, fornecendo as regras extraídas e os dados financeiros da amostra por banco simulado. Compara os seis fretes/não entregues, total dos fretes, desconto, total a pagar, percentual inicial/final e AP. As despesas da empresa desta amostra vêm do resumo W. Não testa os vínculos SQL dos lançamentos nem executa o Excel ou suas macros. Nenhum registro operacional ou arquivo Excel foi alterado. Valores de CTRB constam da extração, mas não fazem parte dessa comparação de fretes.

Reprodução na raiz do projeto:

```powershell
python backend/scripts/extract-manifest-check.py 'CAMINHO.xlsm' backend/docs/latest-manifests-reference.json
```

Depois, em `backend`: `node node_modules/jest/bin/jest.js --runInBand latest-manifests`.

Evidências detalhadas: `artifacts/manifest-check-20261001/comparison.json`. A opção visual Carga mista foi removida; a edição preserva a marcação histórica existente.
