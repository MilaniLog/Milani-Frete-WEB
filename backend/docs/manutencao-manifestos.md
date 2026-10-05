# Edição e exclusão de manifestos

`PUT /manifests/:id` e `DELETE /manifests/:id` exigem JWT e permissão `freight_service`. A unidade vem do token; ID de outra unidade retorna 404, inclusive para administradores.

## Edição

PUT recebe o mesmo corpo do cadastro: data (`semana`), número (`manifestos`), horário, placa, CPF do motorista, destino, cubagem, peso e quantidade de notas são obrigatórios. Deve existir pelo menos um frete 777/888/999 diferente de zero. Veículo, tipo, motorista e destino são validados novamente.

É uma substituição dos dados editáveis, não uma atualização parcial. Valores financeiros opcionais omitidos voltam a zero; textos opcionais omitidos são apagados e `carga_mista` volta a false. Duas exceções preservam dados históricos quando omitidas: `origem` e `frete_veiculo`. Para mudar esses dois campos, enviá-los explicitamente.

Exemplo:

```json
{
  "semana": "2026-09-22",
  "manifestos": "101000002-1",
  "hora": "11:00",
  "placa": "ABC1234",
  "cpf_motorista": "12345678901",
  "destino_id": 1,
  "m3": 1,
  "kg": 100,
  "qtd_nf": 1,
  "cod_777_00": 1000,
  "frete_veiculo": 200
}
```

Os cadastros usados no exemplo precisam existir. A resposta contém o manifesto atualizado. Os dois cálculos incluem os créditos já vinculados; débitos e adiantamentos de lançamentos não aumentam o custo. Retenções e líquido do CTRB são recalculados a partir do corpo enviado.

O ID do manifesto é preservado, mesmo quando seu número muda. Os lançamentos continuam ligados por `manifesto_id`. Placa, motorista, tipo de veículo e destino dos lançamentos são sincronizados. Número, valor, despesa, responsável, data e semana dos lançamentos são preservados: o código de semana não é a data do manifesto.

## Exclusão

DELETE exclui primeiro os lançamentos abertos vinculados e depois o manifesto, na mesma transação. A resposta identifica o manifesto e quantos lançamentos foram excluídos:

```json
{"id": 1, "deleted": true, "deletedEntries": 3}
```

É exclusão física, como no fluxo legado. Se outro vínculo no banco impedir a exclusão, a operação retorna 409 e a transação reverte também a exclusão dos lançamentos.

## Bloqueios e consistência

- `fechamento_id` ou `num_fechamento` preenchido impede editar e excluir o manifesto.
- Qualquer lançamento vinculado pago, fechado ou com unidade incompatível também impede ambas as ações.
- Número duplicado em outro manifesto da mesma unidade impede editar. O próprio registro não é considerado duplicado.
- Cadastro, edição e exclusão agora usam transações serializáveis. Conflitos de serialização têm no máximo três tentativas.
- Datas aceitam somente YYYY-MM-DD válido; horários aceitam HH:mm ou HH:mm:ss. Manifesto vazio ou só com espaços é rejeitado. Essas validações também se aplicam ao cadastro.

O bloqueio por período/semana fechada está integrado ao [módulo de semanas](semanas.md). São conferidos os períodos de origem e destino da alteração e os lançamentos vinculados, com exceção administrativa somente para registros abertos. O recálculo usa as regras atuais da origem, sem versionamento histórico. Não há alteração de schema nem migração de dados para a manutenção de manifestos.

## Verificação

52 testes automatizados passaram. O script `npm run check:freight-api` passou em 42 verificações HTTP com banco real, incluindo edição, renumeração, créditos preservados, sincronização dos vínculos, bloqueios, falha de cálculo e exclusão conjunta. Todos os registros temporários foram revertidos e a ausência deles foi conferida após rollback. Esse script usa transação externa e savepoints; não testa concorrência de requisições nem login. A verificação TypeScript também passou.
