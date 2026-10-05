# Cálculos de frete

`POST /freight-calculation/preview` calcula os dois modos com as regras ativas da origem informada (padrão `SP`).

Os campos já existentes da resposta representam o modo ICMS, com `valor × (1 − aliquota)`. O objeto adicional `percentageCalculation` tem a mesma estrutura de resultados e usa `valor × percentual`, arredondando cada frete e cada não entregue a duas casas com desempate para o par. As regras vêm de `frete_regras_calculo`; os percentuais não são constantes no código.

Para ambos os modos:

- `totalFretes`: soma dos três fretes convertidos.
- `totalReceive`: total dos fretes mais outros, diária, TDE, escada, paletização, estadia e descarga.
- `discounts`: soma dos três valores de não entrega convertidos.
- `totalPay` e `freightVehicle`: frete do veículo mais despesas da empresa.
- `initPercent`: frete do veículo dividido por `totalFretes`.
- `finalPercent`: `totalPay / (totalReceive − discounts)`.

Percentuais são frações (0,15 significa 15%) e retornam com até oito casas. Sem frete, os percentuais retornam zero. Base final zero com frete resulta em erro, inclusive se ocorrer somente no segundo modo, para impedir salvar resultado indefinido.

No cadastro, os campos existentes continuam recebendo o modo ICMS. `percentual_antigo` recebe `percentageCalculation.finalPercent`, conforme a coluna 50 da planilha, intitulada PERCENTUAL ANTIGO e preenchida por `CalcNewPercentManifest` no VBA. Não há alteração de schema nem recálculo de registros anteriores.

Os subtotais legados `sub_lc_ex` e `sub_total` continuam excluindo descarga; os percentuais incluem descarga, conforme o VBA. O cadastro inicial envia zero em `despesas_empresa` porque ainda não tem lançamentos. As rotas vinculadas de lançamentos agora recalculam ambos os modos com os créditos registrados. A prévia também aceita esse valor. Consulte [lançamentos](lancamentos.md).

Configuração encontrada na planilha: alíquotas 0,07/0,12/0,12 e percentuais 0,15/0,25/1 para 777/888/999. Não foi consultado nem alterado o banco para confirmar essas configurações. Os testes usam esses valores como referência e também verificam uma configuração diferente.

Validação: `node node_modules/jest/bin/jest.js --runInBand` e `node node_modules/typescript/bin/tsc --noEmit --incremental false`, a partir de `backend`. São testes com banco simulado e resultados calculados a partir das fórmulas extraídas; não executam o Excel.
