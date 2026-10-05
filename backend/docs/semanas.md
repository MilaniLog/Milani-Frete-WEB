# Semanas e períodos

O calendário usa `frete_semanas`, compartilhada pelas unidades. As semanas devem começar no domingo e terminar no sábado, com sete dias inclusivos. A regra é validada na interface e no backend. Os códigos do calendário cadastrado seguem semana + ano (`SSAA`): `3926` corresponde a 20/09/2026–26/09/2026.

Por solicitação do usuário, foram cadastradas 105 semanas de 2026 e 2027: 53 de 2026 e 52 de 2027. A `0126` começa em 28/12/2025; a `5326` vai de 27/12/2026 a 02/01/2027; a `0127` começa em 03/01/2027; a `5227` termina em 01/01/2028. A numeração acompanha a segunda-feira contida no intervalo (semana ISO dessa segunda-feira, com início antecipado para domingo). A sequência de 2026 foi comparada à planilha original.

O cadastro foi feito com `node -r ts-node/register scripts/seed-weeks.ts --apply`, na pasta backend. Sem `--apply`, o script apenas confere o plano. Ele não modifica registros existentes e aborta toda a transação se encontrar código com datas diferentes ou sobreposição. Após a execução, a conferência encontrou 105 registros existentes e zero novos.

| Método e rota | Função |
|---|---|
| GET /weeks | Lista calendário por data inicial decrescente |
| GET /weeks?date=2026-09-22 | Localiza semanas que incluem a data |
| GET /weeks/:codigo | Consulta código, início e fim |
| POST /weeks | Cadastra uma semana |
| PUT /weeks/:codigo | Altera datas de semana ainda não utilizada |
| GET /manifests?week=3926 | Filtra manifestos pela data dentro do período |
| GET /manifests/:id/entries?week=3926 | Filtra lançamentos pela data dentro do período |

Todas as rotas exigem autenticação e `freight_service`, ou administrador. A tela Semanas, incluindo sua navegação, é exclusiva de administradores. Consultas GET continuam disponíveis aos usuários autorizados para seleção de semanas nos fluxos operacionais. Apenas administrador (`isAdmin` no usuário autenticado) pode cadastrar ou alterar o calendário global. Não há exclusão de semanas. O código não pode ser renumerado.

Exemplo solicitado pelo usuário:

```json
{
  "codigo": "3926",
  "data_inicio": "2026-09-20",
  "data_fim": "2026-09-26"
}
```

Períodos sobrepostos e códigos duplicados são rejeitados. Uma semana utilizada por manifesto, lançamento ou fechamento de qualquer unidade não pode ter suas datas alteradas. Reenviar as mesmas datas é permitido. As alterações usam transação serializável e repetem conflitos de serialização até três tentativas.

## Integração das movimentações

- O campo `semana` do manifesto continua sendo a data do manifesto. A correspondência com o calendário é feita por intervalo, sem nova coluna ou migração de registros históricos.
- Cadastro, edição e exclusão de manifestos exigem períodos cadastrados. Na edição são conferidos tanto a data/placa anterior quanto a nova, além dos períodos dos lançamentos vinculados.
- O lançamento recebe automaticamente o código de semana correspondente a `data_lancamento`. Se o cliente enviar `semana`, o código deve corresponder à data. Data e período do lançamento podem ser diferentes dos do manifesto; ambos são conferidos.
- Edição e exclusão de lançamentos verificam também o período anterior. Não é possível escapar de um bloqueio alterando a data ou a placa.
- Calendário legado com sobreposição é tratado como conflito, em vez de escolher uma semana arbitrariamente.

## Fechamentos

A consulta usa `frete_fechamentos`, na mesma unidade e placa. Um fechamento com a mesma semana, ou com intervalo que se sobreponha à semana, impede movimentações de usuários comuns quando seu status não é `ABERTO` nem `CANCELADO`. Assim, `FECHADO`, `FINALIZADO`, `PAGO` e outros estados não reconhecidos como abertos/cancelados bloqueiam por precaução. O fluxo futuro de fechamento deverá manter esse contrato de status.

Como no VBA, um administrador pode movimentar um registro aberto em período com fechamento. Essa permissão não reabre manifesto encerrado nem permite editar/excluir registros com lançamentos pagos ou fechados. Esses bloqueios anteriores permanecem, inclusive para administradores.

O módulo de semanas consulta fechamentos para aplicar as restrições. A criação e o cancelamento são realizados pelo módulo de fechamentos.

## Banco e validação

O cadastro de 2026–2027 foi aplicado no banco configurado, cuja tabela de semanas estava vazia. Não houve alteração de manifestos, lançamentos, cupons ou fechamentos. O script de integração agora usa o calendário existente e mantém suas alterações temporárias dentro de uma transação revertida.

Validação desta alteração: 163 testes backend, 37 testes React, builds backend/frontend, 54 verificações operacionais no navegador e 16 verificações pelo proxy passaram. O roteiro `npm run check:freight-api` passou em 104 verificações com banco real e confirmou o rollback dos registros temporários. O calendário de 105 semanas é persistente, conforme solicitado; movimentações operacionais não foram alteradas.
