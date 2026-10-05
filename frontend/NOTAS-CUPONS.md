# Notas e cupons

Acesse **Notas e cupons** com permissão `freight_service` na unidade da sessão (ou administrador). São notas financeiras de frete, distintas dos documentos do serviço de tickets.

- A listagem mostra as últimas 50 notas da unidade e o saldo retornado pelo servidor.
- Em **Tipos de nota: cadastrar e editar**, informe código e nome. O tipo é Débito, conforme contrato atual. O campo **Tipo ativo** permite ativar/desativar. A lista inclui tipos inativos e permite editar código e nome. Desativar impede selecionar o tipo em novas notas; os dados históricos das notas existentes não são reescritos.
- **Nova nota** exige número textual, data da nota, data de emissão, valor positivo e tipo ativo. Zeros iniciais do número são preservados.
- **Abrir nota** carrega a nota atual e seus cupons. A edição exige confirmar o tipo atual; alterações no cadastro do tipo podem mudar os dados salvos ao editar a nota.
- **Novo cupom** distribui parte do saldo para uma placa, motorista e semana. A cobrança ocorre no início da semana cadastrada. O backend valida saldo, veículo, motorista, unidade e período.
- Edição de cupom preserva placa, semana, descrição e departamento. O motorista é buscado pelo nome; a correspondência única com o nome histórico é pré-selecionada e homônimos exigem escolha explícita. Não é necessário digitar CPF.
- Exclusão de cupom exige confirmação e devolve o valor ao saldo. Exclusão de nota exige administrador, confirmação e remove seus cupons abertos na mesma transação.
- Cupons pagos/fechados não oferecem edição ou exclusão. Sua existência bloqueia edição/exclusão da nota, mas ainda permite distribuir o saldo restante em novos cupons. O backend também aplica bloqueios por período.

O saldo não é recalculado no navegador: usa a resposta da API. Erros de gravação preservam o formulário; erros de consulta após uma gravação aparecem separados da confirmação de sucesso. Nenhuma transferência bancária é feita.

Validação atual: notas e cupons integram os 54 cenários operacionais que passaram no Edge em computador e celular. Foram conferidos cadastro e edição, número textual, saldo retornado, rejeição sem perda dos campos, confirmação de exclusão, tipos ativos/inativos e bloqueios de cupons pagos. Capturas foram inspecionadas; nenhuma nota operacional foi gravada. Execute `npm run test:browser:operations` com o frontend em execução. Resultados completos e limites em [VALIDACAO.md](VALIDACAO.md).
