# Empresas pagadoras

Use **Pagadoras** na navegação e consulte a placa sem hífen. A consulta exige permissão `freight_service` na unidade ou administrador, conforme a rota existente. Usuários comuns podem consultar; somente administradores podem salvar, porque o cadastro de veículos é compartilhado entre unidades.

A tela usa `GET /vehicles/:plate` e `PUT /vehicles/:plate/payers`. Mostra as empresas e o percentual da segunda pagadora. Informe **30 para 30%**; a interface converte para `0.30` no backend. Aceita de 0 a 100%, com até quatro casas decimais, equivalentes às seis casas da fração armazenada. A primeira empresa recebe o complemento quando o rateio se aplica.

Segunda empresa sem primeira, nomes iguais ou percentual não zero sem segunda empresa são bloqueados. Para remover toda a configuração, apague ambos os nomes e informe zero. Trocar a placa elimina o formulário anterior, exigindo nova consulta. Erros de gravação mantêm os campos preenchidos. O backend revalida permissões e cadastro.

O rateio depende das regras do fechamento: saldo acima de R$ 1.000 e ausência de identificador CTRB, entre outras validações. Alterar pagadoras não recalcula fechamentos históricos. Esta tela não cadastra veículos novos nem altera proprietário, tipo ou status.

Validação automatizada com API simulada: conversão percentual, acesso somente de consulta, invalidação ao mudar placa e remoção da configuração. Nenhum veículo operacional foi alterado para testar a interface. Edição real supervisionada ainda não foi realizada nesta etapa.

Integração HTTP validada pelo proxy `/api` do frontend com o backend em execução: 16 verificações passaram, incluindo consulta de veículo com placa em minúsculas, comparação das pagadoras/percentual com o banco, rejeição de placa inválida e bloqueio sem autenticação. Foi utilizada uma conta temporária removida ao final. Nenhum veículo foi alterado. Para repetir, execute `backend/scripts/check-live-api.ts` conforme o README; é necessário um veículo ativo com placa válida e tipo cadastrado.

## Teste no navegador

Com o frontend em execução, rode `npm run test:browser:payers` na pasta `frontend`. Requer Microsoft Edge instalado; usa Playwright Core em modo sem janela. `FRONTEND_URL` permite alterar o endereço padrão `http://127.0.0.1:5173`.

Passaram 18 verificações em resoluções 1440×1000 e 390×844: consulta, ausência de rolagem horizontal, validação nativa do percentual máximo, conversão para fração, preservação dos campos após conflito, gravação simulada, troca de placa, sessão expirada e consulta sem privilégios administrativos. Não houve erros JavaScript. Todas as chamadas `/api/` são interceptadas; o teste não acessa dados operacionais.

Capturas geradas em `frontend/artifacts/payers/desktop.png` e `mobile.png` foram inspecionadas visualmente. Os artefatos são locais e ignorados pelo Git. Essa execução complementa a validação HTTP real; não representa uma gravação real no banco pelo navegador.
