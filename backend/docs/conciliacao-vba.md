# Conciliação com a planilha original

## Validação dos últimos fechamentos

**Resultado: os 10 casos recentes coincidiram em bruto, débitos e líquido.** Os 12 testes da suíte de conciliação passaram (10 recentes, 1 histórico e 1 verificação da amostra), assim como a compilação TypeScript. Nenhum registro operacional foi alterado.

A pedido do usuário, a amostra principal passou a ser os **10 fechamentos não cancelados mais recentes com data registrada**, ordenados pela coluna P da aba Fechamento, com desempate pelo número do fechamento. Não se exige presença simultânea de manifestos, lançamentos e cupons. A fonte permanece a mesma cópia da planilha identificada pelo hash abaixo.

| Fechamento | Data registrada | Linha | Bruto | Débitos e cupons | Líquido |
|---|---|---:|---:|---:|---:|
| 4714 | 21/09/2026 | 4646 | 650,00 | 550,00 | 100,00 |
| 4713 | 21/09/2026 | 4645 | 1.450,00 | 1.000,00 | 450,00 |
| 4711 | 21/09/2026 | 4643 | 2.580,00 | 1.600,00 | 980,00 |
| 4709 | 21/09/2026 | 4641 | 2.370,00 | 1.970,00 | 400,00 |
| 4708 | 21/09/2026 | 4640 | 1.058,00 | 818,00 | 240,00 |
| 4707 | 21/09/2026 | 4639 | 315,00 | 290,00 | 25,00 |
| 4706 | 21/09/2026 | 4638 | 1.910,00 | 1.460,00 | 450,00 |
| 4704 | 18/09/2026 | 4636 | 2.293,50 | 1.893,50 | 400,00 |
| 4702 | 18/09/2026 | 4634 | 886,00 | 136,00 | 750,00 |
| 4701 | 18/09/2026 | 4633 | 750,00 | 0,00 | 750,00 |

Valores em reais. A amostra contém **31 manifestos e 52 lançamentos, sem cupons vinculados**. O fechamento 4701 também não possui lançamentos. Os casos estão em `latest-closures-reference.json`, sem nomes, placas ou documentos pessoais. O teste `workbook-reference.spec.ts` executa cada um dos 10 casos no `FreightClosuresService.preview`, comparando bruto, débitos e líquido com os valores da planilha. O banco é simulado para fornecer os vínculos históricos; não se valida aqui a seleção SQL nem o rateio entre pagadoras.

Há 819 registros não cancelados sem data P interpretável, entre as linhas 6 e 865, explicitamente relacionados no arquivo de referência e fora da ordenação por data. Registros cancelados não fazem parte desta amostra. O extrator não filtra casos pela coincidência dos valores.

Para reproduzir a amostra recente na pasta `backend`:

```powershell
python scripts/extract-closure-reference.py 'CAMINHO_DO_ARQUIVO.xlsm' docs/latest-closures-reference.json --latest 10
node node_modules/jest/bin/jest.js --runInBand workbook-reference
```

As seções seguintes preservam a análise anterior. A divergência de R$ 420,00 é de um registro antigo e não pertence aos 10 casos recentes.

Leitura estática de `resultado carregamento x GRU.xlsm`, sem executar macros, recalcular Excel ou alterar o arquivo/banco. Hash SHA-256 da fonte: `7a09c38c424aef356ba2301fb9a29bc2547d237aae0e3cf17ca954860a95be5f`.

O VBA usa `PlanFreightClosure`, correspondente à aba **Fechamento**, e não à aba FECHADOS. Foram associados manifestos pela coluna AS, lançamentos pela N e cupons pela M ao identificador da coluna A do fechamento. A amostra considera fechamentos não cancelados com os três tipos de registro vinculados e valores numéricos interpretáveis. Valores textuais brasileiros como `60,00` foram normalizados; valores numéricos XML mantêm ponto decimal.

## Caso reproduzido no serviço do backend

Selecionada a maior linha entre os casos completos, independentemente de coincidência dos totais: **Fechamento, linha 4438**. Os dados financeiros anonimizados estão em `closure-reference.json`; nomes, placas, documentos e números de CTRB não foram copiados.

| Componente | Valor |
|---|---:|
| Cinco fretes de R$ 250,00 | R$ 1.250,00 |
| Crédito | R$ 60,00 |
| Bruto | R$ 1.310,00 |
| Débito | R$ 60,00 |
| Cupom | R$ 357,16 |
| Descontos totais | R$ 417,16 |
| Líquido | **R$ 892,84** |

O teste `workbook-reference.spec.ts` usa o `FreightClosuresService.preview` real, com os registros extraídos fornecidos por um banco simulado, e confere bruto, descontos e líquido contra os valores gravados no Excel. A representação Excel `892.83999999999992` coincide com R$ 892,84 em centavos. A suíte passou com 149 testes; TypeScript também passou.

## Verificação ampliada e divergência pendente

A reconstrução estática do líquido coincidiu em **234 dos 235 casos** da amostra. Isso não significa que todos foram executados no backend: o teste do serviço cobre o caso selecionado; a verificação ampliada é uma soma independente dos registros vinculados.

**Fechamento, linha 188:** líquido gravado R$ 28,77; líquido reconstruído R$ 448,77; diferença **R$ 420,00**. Evidências:

- Manifestos, linhas 512, 539, 564 e 594: quatro fretes de R$ 230,00, total R$ 920,00.
- Lançamentos, linha 198: crédito R$ 60,00; linhas 208, 536 e 537: débitos de R$ 60,00, R$ 100,00 e R$ 100,00.
- Cupons Fiscais, linhas 16 e 17: R$ 171,23 e R$ 100,00.
- Reconstrução: R$ 920,00 + R$ 60,00 − R$ 260,00 − R$ 271,23 = R$ 448,77.
- As células S/T de totais desse fechamento antigo estão vazias. Os dados disponíveis não explicam os R$ 420,00 adicionais de diferença. Não foi inferido nem criado um lançamento para forçar a conciliação.

Antes de importar esse fechamento, é necessária revisão do registro original. Pode haver edição histórica ou informação ausente, mas a leitura estática não determina a causa. A regra do backend não foi alterada com base nessa hipótese.

## Reprodução e limites

Na pasta `backend`, executar:

```powershell
python scripts/extract-closure-reference.py 'CAMINHO_DO_ARQUIVO.xlsm' docs/closure-reference.json
node node_modules/jest/bin/jest.js --runInBand workbook-reference
```

O extrator escolhe o caso completo mais recente da cópia fornecida; outra versão da planilha pode alterar o caso e exigir revisão do teste fixo. Não foi validada aqui a importação, seleção SQL por semana, configuração histórica de pagadoras, cálculo de cada manifesto a partir dos fretes brutos, layout impresso ou execução integral do VBA. O caso selecionado valida a consolidação financeira de um fechamento, não a equivalência completa do sistema.
