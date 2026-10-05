# Notas e cupons financeiros do frete

## Formulário web — 28/09/2026

A tela abre diretamente no formulário baseado no `LaunchInvoicesForm` do Excel: número do lançamento e inclusão no topo; nota, data e valor na mesma linha; semana e período, placa e tipo do veículo, tipo da nota, valor do cupom e descrição abaixo. O motorista permanece selecionado pelo nome, conforme solicitado para o site.

Ao sair do campo Nota, uma consulta por número preenche os dados existentes e bloqueia data, valor e tipo. Salvar cria uma nota nova e seu primeiro cupom na mesma transação, ou acrescenta um cupom à nota existente. Falhas de saldo, placa ou período revertem toda a operação. Depois de salvar, nota/semana/placa permanecem e valor do cupom/descrição são limpos para o próximo lançamento.

Editar habilita o número do lançamento; Buscar lançamento ou Enter carrega nota e cupom. Esse número é o ID do cupom no site, não a numeração histórica do Excel. Cupons pagos/fechados são somente consulta. Excluir cupom exige confirmação; Deletar nota aparece apenas para administradores. A consulta e manutenção individual, inclusive dos tipos de nota, ficam em “Consultar notas, cupons e tipos de nota”.

Novas rotas autenticadas e limitadas à unidade:

- `GET /freight-invoices/by-number?numero=000123`: busca exata, preservando zeros, sem limitar às últimas 50 notas.
- `GET /freight-invoices/launches/:id`: nota e cupom do lançamento.
- `POST /freight-invoices/launches`: `{ nota: InvoiceDto, cupom: CouponDto }`; gravação conjunta serializável. Reusar número não altera os dados originais da nota; divergências de data, valor ou tipo retornam conflito.

Não houve importação dos cupons do Excel nem alteração de pagamentos operacionais nesta etapa.

Implementação baseada em `InvoicesUtils`, `CouponUtils`, `LaunchInvoicesForm` e na leitura de cupons por `FreightClosureClass` do VBA. Estes documentos representam valores distribuídos entre veículos/semanas para desconto no fechamento. Não há emissão fiscal, autorização na SEFAZ ou integração com XML nesta etapa.

## Estrutura e vínculo

Foram criadas `frete_tipos_nota`, `frete_notas` e `frete_cupons`. O [SQL de preparação](../prisma/manual/20260922-freight-invoices.sql) foi aplicado ao banco configurado após conferir que essas tabelas não existiam. A tabela `invoices` de tickets não foi alterada. Não foi usado `db push` no schema parcial do legado.

Nota e cupom pertencem à unidade autenticada. A chave estrangeira composta `(nota_id, unit)` impede vínculo de cupom com nota de outra unidade. O número da nota é texto, preserva zeros à esquerda e é único por unidade. O cupom tem ID próprio, que não compartilha a sequência de números de lançamentos do Excel. Uma importação futura deve mapear os identificadores antigos.

O cupom fica ligado à nota, placa, motorista e semana, sem vínculo direto com manifesto. A data de cobrança é o início da semana selecionada, como no VBA. O motorista é informado por CPF de um cadastro existente; placa e tipo de veículo também são validados.

Os tipos encontrados no arquivo são `0001 / MOEDA - ABASTECIMENTO / Debito` e `0009 / MOEDA - AVARIA / Debito`. A API aceita somente `Debito` por enquanto, pois o fechamento legado subtrai todos os cupons. Nenhum tipo ou documento operacional foi importado automaticamente.

## Rotas

Todas exigem JWT e `freight_service`. A unidade e o responsável são obtidos do usuário, não do corpo da requisição.

| Método e rota | Ação |
|---|---|
| GET /freight-invoice-types | Lista tipos da unidade |
| POST /freight-invoice-types | Cadastra tipo |
| PUT /freight-invoice-types/:id | Edita/desativa tipo |
| GET /freight-invoices | Lista últimas 50 notas da unidade |
| GET /freight-invoices/:id | Consulta nota e saldo |
| POST /freight-invoices | Cadastra nota sem cupons, saldo igual ao valor |
| PUT /freight-invoices/:id | Substitui dados editáveis da nota e recalcula saldo |
| DELETE /freight-invoices/:id | Exclui nota e cupons abertos; somente administrador |
| GET /freight-invoices/:id/coupons | Lista cupons; aceita `?week=2639` |
| POST /freight-invoices/:id/coupons | Inclui cupom e atualiza saldo |
| PUT /freight-invoices/:id/coupons/:couponId | Substitui cupom e atualiza saldo |
| DELETE /freight-invoices/:id/coupons/:couponId | Exclui cupom e devolve valor ao saldo |

Cadastro de tipo:

```json
{"codigo":"0001","nome":"MOEDA - ABASTECIMENTO","tipo":"Debito","ativo":true}
```

Cadastro/edição de nota:

```json
{"numero":"000123","data_nota":"2026-09-22","emitido_em":"2026-09-22","valor":100,"tipo_id":1,"departamento":"OPERACAO"}
```

Cadastro/edição de cupom:

```json
{"placa":"ABC1234","cpf_motorista":"12345678901","semana":"2639","valor":30,"descricao":"Abastecimento","departamento":"OPERACAO"}
```

Os cadastros e a semana usados nesses exemplos precisam existir. Datas aceitam YYYY-MM-DD válido e valores devem ser positivos, com no máximo duas casas. PUT exige os campos obrigatórios novamente; textos opcionais omitidos são apagados. Não é possível transferir o cupom para outra nota pela edição.

## Saldo e bloqueios

`saldo = valor da nota − soma dos valores de todos os cupons`, incluindo cupons pagos. A soma é feita com Decimal. Cupom novo já reduz o saldo, inclusive o primeiro; se a soma ultrapassar o valor da nota, toda a transação é revertida. Editar e excluir cupons também recalcula a soma, evitando acúmulo de diferenças. Reduzir o valor da nota abaixo do já distribuído é rejeitado.

Exemplo: nota de 100, cupom de 30 → saldo 70; alterar cupom para 40 → saldo 60; excluir cupom → saldo 100.

Cupom pago ou vinculado a fechamento não pode ser editado/excluído. Sua nota também não pode ser alterada/excluída. Ainda é possível distribuir o saldo restante da nota em novos cupons abertos, sem modificar os pagos. A exclusão da nota exige administrador, como no formulário VBA, e remove somente após conferir todos os cupons.

Períodos precisam estar cadastrados. Edição verifica período/placa anterior e novo; exclusão verifica o anterior. O bloqueio por fechamento e sua exceção administrativa seguem [as regras de semanas](semanas.md). A exceção de período não libera cupons já pagos ou fechados. Semanas usadas por cupons não podem ter suas datas alteradas.

Tipo da nota deve estar ativo ao cadastrar/editar uma nota. Código, nome e classificação são copiados para a nota; alterar o cadastro do tipo não reescreve o histórico. Os cupons consultam sua nota para esses dados.

Cada alteração de nota/cupom e saldo usa uma transação serializável, com até três tentativas para conflitos de serialização. Outros vínculos que impeçam excluir geram conflito e rollback, incluindo os cupons que já haviam sido excluídos naquela transação.

## Verificação e limites

Validados 94 testes automatizados (93 na execução completa e a suíte de semanas repetida com o novo caso de cupom) e 82 verificações HTTP com banco real. O TypeScript compilou. Os testes HTTP cobriram saldo inicial, primeiro cupom, excesso de saldo, edição, exclusão, registros pagos, permissões e isolamento. Todos os registros temporários foram revertidos; as três tabelas novas permanecem para uso da aplicação. AUTO_INCREMENT pode ter lacunas após os testes.

O roteiro HTTP usa JWT de teste, transação externa e savepoints. Não testa login, concorrência entre requisições nem commits independentes de produção.

As rotas de conclusão/cancelamento do fechamento ainda não foram implementadas. Cupons não alteram os percentuais dos manifestos nem seus lançamentos: compõem os débitos do futuro fechamento, conforme o legado. Relatórios, paginação completa e importação de dados do Excel continuam pendentes. As mudanças de tabelas/fechamento que o usuário está definindo podem ser incorporadas posteriormente.
