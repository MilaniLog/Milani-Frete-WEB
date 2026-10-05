# Despesas e lançamentos por manifesto

## Exclusão pelo formulário de lançamento

Em “Editar lançamento”, o botão “Excluir lançamento” aparece e fica habilitado somente após carregar um registro aberto. A confirmação mostra número, placa e valor gravado; trocar o número ou iniciar novo lançamento cancela a confirmação. Após excluir, a tela volta ao novo lançamento.

`DELETE /freight-entries/:id` atende lançamentos avulsos e vinculados, sempre na unidade autenticada. Avulsos são excluídos em transação serializável após validar pagamento, fechamento e período. Vinculados usam a exclusão existente e recalculam o manifesto na mesma transação. As regras atuais de acesso ao período continuam valendo; mesmo administradores não podem excluir um registro pago ou vinculado a fechamento.

Todas as rotas exigem JWT e permissão `freight_service`. A unidade é obtida do usuário autenticado. O cliente não define unidade, responsável, tipo financeiro, placa, pagamento ou fechamento do lançamento.

| Método e rota | Ação |
|---|---|
| GET /freight-expenses | Lista despesas ativas e inativas da unidade |
| POST /freight-expenses | Cria código de despesa |
| PUT /freight-expenses/:id | Substitui cadastro; `ativo: false` desativa |
| GET /manifests/:manifestId/entries | Lista lançamentos do manifesto |
| POST /manifests/:manifestId/entries | Inclui lançamento e recalcula manifesto |
| PUT /manifests/:manifestId/entries/:id | Substitui lançamento e recalcula manifesto |
| DELETE /manifests/:manifestId/entries/:id | Exclui lançamento e recalcula manifesto |

Exemplo de cadastro de despesa:

```json
{"codigo":"001","nome":"Despesa paga pela empresa","tipo":"Credito","ativo":true}
```

Tipos aceitos: `Credito`, `Debito`, `Adiantamento`. O código é único por unidade. Alterar o cadastro não muda os dados históricos dos lançamentos já salvos. Não há exclusão física do cadastro de despesas.

Exemplo de lançamento:

```json
{"despesa_id":1,"data_lancamento":"2026-09-22","valor":50,"descricao":"Complemento de frete"}
```

`semana` (quatro dígitos) e `departamento` são opcionais. A semana é preenchida automaticamente pela data do lançamento; se enviada, precisa coincidir com o calendário. O período do manifesto e o do lançamento precisam estar cadastrados e permitidos para movimentação. Consulte [semanas](semanas.md). O valor deve ser positivo e ter no máximo duas casas; a data deve ser uma data válida no formato YYYY-MM-DD. PUT substitui os campos editáveis; descrição/departamento omitidos são apagados e semana omitida é calculada novamente pela data. Não é possível transferir um lançamento para outro manifesto.

A numeração é sequencial por unidade, calculada a partir do maior número existente dentro de transação serializável. A unicidade `(unit, numero)` deve existir no banco. Conflitos de numeração/serialização são repetidos até três tentativas. A exclusão do maior número permite reutilizá-lo, como na estratégia baseada no máximo; não é uma numeração fiscal imutável.

Inclusão, edição e exclusão recalculam ambos os modos do manifesto na mesma transação. Créditos aumentam `frt_tl_vlc`, `sub_frete` e os percentuais finais. Débitos e adiantamentos não entram em `despesas_empresa`, conforme `CalcLaunchBalance` do VBA. Adiantamento de lançamento não altera o adiantamento nem o líquido do CTRB. Os registros ficam disponíveis para o futuro fechamento, que tratará os demais saldos.

O cadastro inicial do manifesto continua com despesas zero porque ainda não tem lançamentos. O cliente cria o manifesto e depois adiciona os lançamentos pela rota vinculada. Não há inclusão de um lote junto ao POST do manifesto nesta etapa.

Manifestos com `fechamento_id` ou `num_fechamento` e lançamentos pagos ou fechados não podem ser alterados. Erros de cálculo abortam toda a alteração. O recálculo usa as regras atuais da origem gravada no manifesto. Congelar versões históricas de regras ainda não está implementado.

Os códigos e valores detalhados vivem em `frete_lancamentos`; os antigos campos escalares `cods_desp`, `vlr_desp` e `descricao_despesa` não representam uma lista e não são preenchidos com textos concatenados do Excel.

## Banco e implantação

O Prisma Client foi regenerado localmente. Em 22/09/2026, o banco configurado no backend foi inspecionado: as tabelas de despesas e lançamentos já existiam com os campos esperados, os índices únicos por unidade e engine InnoDB. Foi aplicada somente a adição de `origem VARCHAR(10) NOT NULL DEFAULT 'SP'` aos manifestos. Os cinco registros existentes ficaram com origem SP; seus valores financeiros não foram recalculados. As regras cadastradas são SP, com alíquotas 0,07/0,12/0,12 e percentuais 0,15/0,25/1, correspondentes à planilha.

Para preparar outros bancos:

1. Conferir as estruturas existentes de `frete_despesas` e `frete_lancamentos`, seus índices e o uso de InnoDB. O backup serviu de referência, não de inspeção do banco atual.
2. Revisar/aplicar [o SQL manual](../prisma/manual/20260922-freight-entries.sql), que cria as tabelas se ausentes e acrescenta `origem` ao manifesto se ausente. Tabelas existentes não são reconciliadas por esse script. Não aplicar `db push` sobre o schema parcial do banco legado.
3. Conferir origens históricas: o novo campo assume SP para registros anteriores, que não guardavam a origem. Corrigir origens diferentes antes de recalcular esses registros.
4. Conferir os três códigos e ambos os percentuais em `frete_regras_calculo`.
5. Exercitar inclusão/edição/exclusão e concorrência em banco de desenvolvimento. Os testes automatizados usam banco simulado; não validam locks nem rollback real do MySQL/MariaDB.

Limites desta etapa: lançamentos sem manifesto, fechamento, cancelamento de pagamento e relatórios continuam pendentes. Cadastro e validação de semanas já estão implementados.

## Verificação HTTP com banco real

Executar explicitamente `npm run check:freight-api` em `backend`. O script sobe a aplicação Nest apenas para o teste, com as rotas, validação e guards reais. O JWT usa um segredo temporário, sem imprimir tokens ou usar senhas de funcionários. O login não faz parte dessa verificação.

Resultado atualizado: 82 verificações HTTP passaram, incluindo cadastro e duplicidade de despesa, crédito/débito/adiantamento, edição/exclusão, totais dos dois modos, dados inválidos, isolamento entre unidades, autenticação/permissão, registros pagos/fechados e despesa inativa. O script também cobre [edição e exclusão dos manifestos](manutencao-manifestos.md), sincronização e exclusão dos vínculos, calendário, bloqueios de período e [notas/cupons](notas-cupons.md).

Todas as operações ficam em uma transação externa serializável; as transações dos serviços são adaptadas para savepoints reais. Uma falha de cálculo foi provocada e a ausência do lançamento foi conferida após rollback. Ao terminar, a transação externa é sempre revertida, e a ausência das despesas, manifesto e lançamentos temporários é confirmada fora dela. AUTO_INCREMENT pode avançar, deixando lacunas nos IDs. O teste não valida concorrência entre requisições nem commits independentes de produção.

O teste usa unidade/funcionário e veículo existentes somente como referências para registros temporários. Foi necessário escolher um veículo cadastrado porque a placa do manifesto histórico inicialmente usado como referência não tinha vínculo válido com `vehicle`; a foreign key de `frete_lancamentos` rejeitou esse vínculo. Os registros históricos não foram alterados. A importação do histórico deve conferir essas referências.
