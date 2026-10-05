# Fechamento financeiro por semana e placa

## Formulário baseado no VBA (25/09/2026)

A tela React segue a organização de `FreightClosureForm`: semana e datas, placa e tipo, início/fim, despesa, usuário, categoria, número do fechamento, tipos de veículos e configurações de relatório. Mantém fundo branco e identidade Milani. A referência é o formulário extraído do XLSM, sem executar macros.

- `GET /freight-closures/conference` e `/conference/print`: semana **ou** início/fim; placa vazia abrange a unidade. Filtros `despesa`, `usuario`, `categoria`, `tipo`, `numero`, `finalizados`, `mista`, `ordenar_data`, `ordenar_tipo`, `separar_pagamentos`. Opções booleanas usam `true`/`false` na query.
- A despesa seleciona placas que possuem esse lançamento e mantém seus demais valores. Categoria Agregado usa código de tipo menor que 100; Esporádico, maior ou igual a 100. Carga mista considera a marcação ou mais de uma família de carga; nessa consulta os cupons e lançamentos sem manifesto não entram, pois não têm indicação de carga.
- Relatórios filtrados são conferências, não finalizações parciais. Fechar semana exige semana cadastrada e considera todos os registros abertos da placa informada. Sem placa, `POST /freight-closures/week`, corpo `{ "semana": "3926" }`, fecha todas as placas elegíveis da unidade, numa única transação serializável: qualquer falha reverte o lote. A interface apresenta a conferência antes da confirmação. Filtros de relatório não restringem a finalização.
- `GET /freight-closures/number/:number/report`: consulta histórica pelo número, limitada à unidade. “Excluir pagamento” é exclusivo de administrador e usa o cancelamento com motivo, preservando histórico.

## Empresa de pagamento

Novos fechamentos não aplicam o rateio percentual antigo, conforme solicitado na migração. Usam `vehicle.empresa_sigla` (ou `first_payer` legado, quando ainda não preenchida) e o líquido integral. O CTRB permanece identificado e seu valor é informativo no cálculo. Não se inventa uma distribuição entre empresas a partir do valor CTRB. Veículo sem empresa mostra empresa não cadastrada.

O histórico mantém a distribuição registrada na finalização, inclusive rateios antigos. Consultar um fechamento histórico não recalcula com o cadastro atual. A conferência filtrada usa os registros e cadastros atuais; para consultar a cópia original, use o número do fechamento ou a lista de últimos fechamentos.

“Separar pagamentos” agrupa a conferência por empresa, sem percentual. No VBA analisado, a opção era lida pelo formulário, mas não havia uso posterior dessa variável na geração do relatório. O HTML para impressão mantém o relatório web; não é uma reprodução exata da paginação da planilha.

Validação desta etapa: 65 testes de fechamento no backend, 17 testes de interface/navegação, 24 verificações no Edge com API simulada, 142 verificações HTTP com banco local e rollback, e 27 verificações na API em execução com login temporário. Compilações do frontend e backend aprovadas. A consulta de veículos seleciona somente os campos necessários para não carregar datas inválidas de cadastros legados. Os testes não efetuaram pagamentos reais.

Rotas autenticadas, disponíveis a todos os usuários, sempre limitadas à unidade do usuário:

- `GET /freight-closures/preview?semana=0001&placa=ABC1234`: conferência sem gravação.
- `POST /freight-closures`, corpo `{ "semana": "0001", "placa": "ABC1234" }`: recalcula e finaliza os registros abertos.
- `GET /freight-closures`: últimos 50 fechamentos da unidade.
- `GET /freight-closures/:id`: fechamento e registros vinculados.
- `POST /freight-closures/:id/cancel`, corpo `{ "motivo": "Correção do lançamento" }`: cancela um fechamento; exige administrador, inclusive quando o usuário tem permissão `freight_closure`.

Usa as tabelas existentes, com o campo adicional `frete_fechamentos.historico` (JSON opcional). SQL em `prisma/manual/20260923-closure-history.sql`, aplicado ao banco local em 23/09/2026; aplicar uma única vez em outros ambientes antes de usar esta versão. A semana precisa estar cadastrada. Finalização e cancelamento são serializáveis, com até três tentativas em conflito; totais enviados pelo cliente não são utilizados. Não realiza transferência bancária.

Regra conferida em `FreightClosureClass.cls`: bruto = frete_veiculo + créditos; líquido = bruto - débitos - cupons. Adiantamentos não são descontados novamente. `total_ctrb` é a soma informativa dos valores CTRB dos manifestos, sem efeito no líquido; não representa o identificador textual CTRB do relatório VBA. Valores finais em centavos, arredondamento half-even.

Manifestos são selecionados pela data `semana`. Seus lançamentos acompanham o manifesto, mesmo com data fora do período. Lançamentos avulsos de crédito/débito e cupons são selecionados pela própria data dentro da semana. Vínculos entre unidades, placas divergentes e lançamentos já pagos/fechados em manifesto aberto impedem a finalização para revisão.

Uma transação cria o fechamento FECHADO, vincula manifestos e marca lançamentos e cupons como pagos. O saldo da nota não muda: já foi consumido na emissão do cupom. Repetição sem registros abertos é rejeitada. Novos registros abertos permitem fechamento complementar, inclusive após intervenção administrativa no período.

Cancelamento preserva o número e os totais do fechamento e muda seu status para CANCELADO. Reabre somente os manifestos, lançamentos e cupons vinculados pelo ID escolhido. Motivo obrigatório, aparado, de 1 a 500 caracteres. Fechamento inexistente ou de outra unidade retorna 404; status diferente de FECHADO retorna 409, inclusive repetição. Vínculos inconsistentes também retornam 409. Nenhum saldo de nota é devolvido: os cupons continuam existindo. Se houver outro fechamento ativo no mesmo período/placa, o bloqueio do período continua valendo.

`closure.historico.finalizacao` guarda usuário, instante UTC e cópia dos dados de novos fechamentos. `closure.historico.cancelamento` guarda motivo, usuário, instante e cópia dos dados antes da reabertura. Datas e valores decimais são strings no histórico. Para fechamentos legados, não se inventa uma finalização histórica: só se registra a cópia disponível no cancelamento. As listas `manifests`, `entries` e `coupons` de GET por ID representam vínculos atuais e ficam vazias após cancelar; os registros anteriores permanecem no histórico mesmo se forem editados, excluídos ou fechados novamente. A API não expõe edição desse histórico; ele não é uma trilha inviolável contra acesso direto ao banco.

Validação em 23/09/2026: 114 testes automatizados, compilação TypeScript e 92 verificações HTTP com banco real. O teste HTTP cobre restrições de acesso, motivo vazio, repetição, persistência do histórico após exclusão do manifesto e rollback após falha injetada durante o cancelamento. Todos os dados de teste foram revertidos.

