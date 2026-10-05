# Cálculos automáticos do formulário de manifesto

Referência: `RegisterFrete.UpdateFieldsCalc`, `CalcManifest`, `AtualizarTotalRetencoes`, `AtualizarValorLiquido` e `ManifestUtil.CalcOldPercentManifest` do VBA extraído.

- **Total de retenções:** SEST/SENAT + IRRF + Previdência social + INSS.
- **Valor líquido:** total CTRB − adiantamento − total de retenções. O vale-pedágio não participa dessa conta. Os campos calculados são somente leitura; o backend recalcula ao salvar.
- **Frete do veículo:** preenchido com o valor padrão do tipo ao selecionar a placa. Mudanças manuais, inclusive zero, são preservadas; na edição vale o frete do manifesto existente. Limpar o campo volta ao padrão para um novo manifesto e ao valor original para edição.
- **Fretes e não entregues 777/888/999:** usa as alíquotas ativas da origem na mesma função do backend que grava o manifesto (`valor × (1 − alíquota)`), conforme o modo ICMS usado pelo formulário VBA.
- **Percentual inicial:** frete do veículo ÷ soma dos fretes calculados.
- **Total do veículo:** frete + créditos dos lançamentos vinculados. Débitos e adiantamentos não entram no custo da empresa, seguindo `CalcLaunchBalance`.
- **Percentual final:** total do veículo ÷ (fretes calculados + adicionais, incluindo descarga − não entregues calculados). Denominador zero produz aviso; não apresenta percentual antigo como atual.
- **Capacidade:** novos manifestos exibem avisos ao ultrapassar cubagem ou peso do tipo de veículo, como no VBA. São avisos, não bloqueios de gravação.

`POST /manifests/preview` é uma consulta autenticada sem gravação. Recebe placa, valores de cálculo e, na edição, o ID do manifesto. Os lançamentos são lidos pelo backend e limitados ao manifesto/unidade autenticada; o custo informado pelo cliente é ignorado. A tela aguarda 300 ms após mudanças e descarta respostas antigas para evitar sobrescrever o frete manual ou mostrar cálculos de uma placa anterior.

Validação: 14 testes backend de prévia/cálculos, 12 testes da interface, navegador Edge com API simulada e 178 verificações HTTP com rollback confirmado. Nenhum manifesto operacional foi alterado pelos testes.
