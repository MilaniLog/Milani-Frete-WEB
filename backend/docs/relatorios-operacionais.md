# Destinos, relatórios e reimpressão

As telas **Destinos**, **Relatório de lançamentos e cupons** e **Planilha de pagamentos** estão no menu para todos os usuários autenticados. Leituras e gravações ficam limitadas à unidade do usuário.

Validação: compilações backend/frontend, 71 testes backend de relatórios/fechamentos, 25 testes de interface/navegação, 172 verificações HTTP no banco local com rollback confirmado e 30 consultas na API em execução com conta temporária removida. No Edge, foram verificados cadastro de destino, filtros, download HTML/XML e reimpressão por número/semana com usuário comum e API simulada.

## Destinos

`POST /destinations` recebe `{ "nome": "Campinas" }`. Valida nome não vazio, até 150 caracteres, e duplicidade na unidade. O destino fica ativo e aparece na lista e na seleção do manifesto. Não há alteração de destinos já gravados em manifestos históricos.

## Conferência de lançamentos e cupons

A tela segue a disposição de `ReportLaunchForm`: semana e período no topo, emissão à direita, placa com tipo do veículo, início/fim, departamento e usuário à esquerda. À direita ficam **Configurações de relatório** (Lançamentos/Notas) e **Imprimir por** (Dt. de lanç./Dt. da desp.), com seleção exclusiva da data. Departamento usa os códigos FIN/OCO/COM/RH do VBA. **Imprimir** consulta e baixa o HTML, mantendo a prévia na tela; a impressão física é feita ao abrir o arquivo e usar Ctrl+P. O filtro adicional de situação fica em **Mais filtros**.

Referências: `ReportLaunchForm`, `ReportFinancial` e `ReportFinancialClass` do VBA. Rotas `GET /freight-reports/financial` e `/financial/print`. Filtros: `semana` ou `inicio`/`fim`, `placa`, `departamento`, `usuario`, `lancamentos`, `cupons`, `data_por=despesa|inclusao`, `situacao=abertos|pagos|todos`. Por padrão inclui lançamentos e cupons em aberto; a data utilizada é a despesa/cobrança.

Agrupa por código e apresenta subtotais, créditos, débitos/cupons e adiantamentos separados. Débitos aparecem negativos. Adiantamentos ficam visíveis como informativos e não entram no saldo de créditos menos débitos/cupons. A data de inclusão é `created_at` do site; não é uma data histórica importada do Excel. Os cupons usam o número e a classificação da nota vinculada; lançamentos mostram o manifesto ou “Avulso”. O filtro por placa e usuário é efetivamente aplicado, inclusive onde o formulário VBA lia o controle sem repassá-lo à geração.

## Planilha de pagamentos

A tela segue `FreighPaymentReportForm`: semana com datas ao lado, placa com tipo do veículo e empresa com sigla e nome separados, seguidos do botão **Relatório**. O filtro adicional por datas fica recolhido em **Consultar por período**.

Referência: `FreighPaymentReportForm` e `ReportPaymentFreights`. `GET /freight-reports/payments`, `/payments/print` e `/payments/spreadsheet`. Filtra por semana ou período, placa e empresa. Inclui apenas fechamentos `FECHADO`, nunca cancelados. Os valores são provenientes da cópia da finalização; fechamentos legados usam os totais gravados e exibem aviso sobre dados não registrados.

Colunas do VBA: EMPR, CPF/CNPJ PROP, NOME PROP, SEM, FECH, PLACA, TTL FRETE, CTRB BRT, LIQ S/ CTRB, VALES, LIQ PAGAR, UN, CTRB LIQ. `TTL FRETE` é o bruto do fechamento (fretes + créditos); `VALES` é bruto menos líquido; `LIQ S/ CTRB` é bruto menos CTRB bruto; `LIQ PAGAR` é líquido do fechamento menos CTRB bruto. Como no VBA, CTRBs de manifestos com frete do veículo zero não entram. CTRB LIQ soma `valor_liquido` desses manifestos quando registrado no histórico. Não aplica rateio percentual, não altera o fechamento e não executa transferência.

Novas finalizações guardam também documento e nome do proprietário disponíveis no cadastro. Para fechamentos anteriores, esses campos usam o cadastro atual, com aviso. Empresa histórica é preservada quando existe; cadastro atual é utilizado somente na ausência desse dado histórico.

O download Excel usa **SpreadsheetML XML 2003**, extensão `.xml`, com células tipadas: documento, semana e número de fechamento são texto e preservam zeros; valores são números. Não é um arquivo `.xlsx`. Dados cadastrados não são interpretados como fórmulas. A impressão é HTML, aberto pelo usuário no navegador para imprimir ou salvar em PDF.

## Reimpressão

Em Fechamentos, cada linha tem **Reimprimir fechamento**. A seção **Reimprimir fechamento** permite número ou semana/placa; sem placa, reúne todos os fechamentos da semana em um HTML com quebra de página entre eles. `GET /freight-reports/closures/reprint` usa `numero` ou `semana`/`placa`. A numeração não fica limitada aos últimos 50 registros da tela. Usa a cópia histórica, preserva o aviso de cancelamento e identifica registros legados sem cópia original. Não cria fechamento, não muda status e não marca registros como pagos.
