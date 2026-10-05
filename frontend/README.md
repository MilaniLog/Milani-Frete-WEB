# Interface de fretes

**Motoristas:** manifestos e cupons usam busca pelo nome, sem digitação de CPF. A busca aceita parte do nome e ignora acentos. Na edição, um nome histórico com correspondência única é selecionado automaticamente; homônimos exigem escolha explícita (identificados pelo final do CPF). Alterar a busca limpa a seleção anterior. Validação: build, 44 testes React, 54 verificações operacionais no navegador e 17 verificações HTTP reais passaram; nenhum registro operacional foi alterado.

**Navegação:** após entrar, o sistema abre na Home. O logo Milani retorna à Home sem encerrar a sessão. O único botão de navegação é **Menu**, que abre as opções abaixo dele, incluindo sair da conta. O menu fecha ao selecionar uma opção, clicar fora ou pressionar Escape. A tela Semanas continua exclusiva de administradores. O padrão de agrupamento dos formulários VBA foi preservado.

Validação da navegação: build, 39 testes React e 110 verificações de navegador passaram (14 de navegação, 18 de pagadoras, 24 de fechamentos e 54 operacionais), com API simulada. Capturas da Home e do menu em computador/celular estão em `artifacts/navigation`. Para repetir apenas a navegação, execute `npm run test:browser:navigation` com o frontend em execução.

**Semanas:** tela exclusiva de administradores. O calendário de 2026 e 2027 já está cadastrado, de domingo a sábado (105 semanas). Exemplo: **3926 = 20/09/2026 a 26/09/2026**. Usuários comuns continuam selecionando semanas nos fluxos operacionais, sem acesso à tela administrativa.

Cadastros reorganizados conforme o designer original do VBA: frete, semanas, despesas, notas e cupons. Foram recuperados os metadados dos 19 formulários. Build, 37 testes React e 54 verificações operacionais no navegador passaram após a alteração. Correspondências e diferenças ainda existentes em [FORMULARIOS-VBA.md](FORMULARIOS-VBA.md).

Rodada de validação concluída em 24/09/2026: builds, 160 testes backend, 35 testes React, 96 verificações de navegador, 105 verificações transacionais e 16 consultas/autenticações pelo proxy passaram. Resultados, comandos e limites em [VALIDACAO.md](VALIDACAO.md).

**Pagadoras** permite consultar veículo por placa e, para administradores, configurar/remover empresas e percentual. O formulário usa percentuais de 0 a 100%. Consulte [PAGADORAS.md](PAGADORAS.md).

Validação atual: build/TypeScript e 35 testes com API simulada passaram. `npm test` limita a execução a dois processos para reduzir a disputa de recursos entre as suítes. A tela de pagadoras também passou em 18 verificações no Edge, em tamanhos de computador e celular, com API simulada e capturas inspecionadas. Para repetir, use `npm run test:browser:payers` com o frontend em execução e Edge instalado. Nenhuma configuração operacional foi alterada nos testes.

A tela de **Fechamentos** também está disponível: conferência, finalização com confirmação, consulta histórica, download HTML para impressão e cancelamento administrativo com motivo. Consulte [FECHAMENTOS.md](FECHAMENTOS.md). **Notas e cupons** inclui cadastro, edição, exclusão confirmada, distribuição e saldo: veja [NOTAS-CUPONS.md](NOTAS-CUPONS.md).

## Excluir manifestos

Em **Ver detalhes**, manifestos abertos oferecem **Excluir manifesto**. A ação consulta os lançamentos, bloqueia quando há registros pagos/fechados e exibe o número de lançamentos abertos que serão excluídos junto com o manifesto. É necessária uma segunda confirmação. A API revalida unidade, vínculos, pagamentos e períodos dentro da transação; alterações concorrentes podem impedir a exclusão. Após conflito, é necessário consultar e confirmar novamente. O manifesto permanece aberto na interface quando a API rejeita a operação. A confirmação de sucesso informa a quantidade efetivamente excluída pelo backend.

Interface em React/TypeScript: login, permissões da unidade do token, consulta dos últimos 50 manifestos, filtro por semana, busca local, detalhes, cadastro e edição com campos adicionais de frete/CTRB, inclusão/edição/exclusão dos lançamentos vinculados, cadastros de semanas e despesas, fechamentos, notas e cupons. Identidade Milani com fundos brancos.

## Semanas e despesas

Use o botão Menu no topo. A tela Semanas aparece apenas para administradores, pois o calendário é global. O código possui quatro dígitos e não pode ser alterado na edição. O período deve começar no domingo e terminar no sábado; a API impede sobreposição e alteração de semanas já utilizadas. A consulta das opções nos manifestos permanece disponível aos operadores autorizados.

Despesas pertencem à unidade do usuário. É possível cadastrar, editar e desativar. O tipo é Débito, Crédito ou Adiantamento. Mudanças no cadastro não reescrevem lançamentos antigos. Após cadastrar, retorne a Manifestos para carregar as novas opções. As telas mantêm o formulário quando a API rejeita uma gravação.

## Validação no ambiente real

A conferência de fechamentos no Edge passou em 24 verificações com API simulada, incluindo finalização, conflitos, cancelamento com motivo e download HTML. Use `npm run test:browser:closures` com o frontend em execução. Capturas de computador e celular foram inspecionadas; nenhum fechamento operacional foi alterado.

A execução mais recente passou em 16 verificações pelo proxy `/api`, incluindo a consulta de pagadoras de um veículo existente e a comparação com o banco. A conta temporária foi removida; veículos e registros financeiros não foram alterados. O script exige ao menos um veículo ativo com placa válida e tipo cadastrado.

Foram executadas 10 verificações diretamente no backend em execução na porta 3000 e outras 10 pelo proxy `/api` da porta 5173, com login real em conta temporária não administradora e consultas autenticadas. As contas e permissões temporárias foram removidas ao final. Não se usaram senhas de usuários operacionais. Página e logo retornaram HTTP 200. Isso valida HTTP/proxy/autenticação; não equivale a navegar e preencher os formulários reais no navegador.

As 105 verificações de `backend/scripts/check-freight-api.ts` também passaram com banco real, usando transação externa revertida ao final. Build do frontend, TypeScript do backend e 17 testes da interface com API simulada passaram.

Para repetir o login real de forma controlada: na pasta backend, execute `node -r ts-node/register scripts/check-live-api.ts`. Opcionalmente defina `$env:LIVE_API_URL='http://127.0.0.1:5173/api'` para verificar o proxy. O script cria uma conta de teste transitória na unidade existente e remove-a em `finally`; não o encerre à força durante a execução. Seus testes nas rotas operacionais são apenas de leitura.

## Lançamentos

Abra **Ver detalhes** em um manifesto. A seção **Lançamentos do manifesto** permite consultar todos os vínculos, incluir, editar e excluir mediante confirmação. É necessária uma despesa ativa previamente cadastrada na mesma unidade pela tela Despesas. A data determina a semana no backend; não é enviado um código de semana manual. Valor positivo com até duas casas decimais; descrição e departamento são preservados na edição.

Lançamentos pagos/fechados e manifestos fechados ficam sem ações de alteração. A API também valida o período e a concorrência. Na edição, a despesa só é pré-selecionada se código, nome e tipo atuais coincidirem com o histórico; caso contrário, exige nova escolha. Após a gravação, os detalhes recebem o manifesto recalculado e as listas são atualizadas. Se a consulta posterior falhar, a confirmação da gravação continua visível separadamente do erro de atualização. O modal não fecha durante a operação. Não há alteração das regras financeiras nesta etapa.

Para editar, abra os detalhes e clique em **Editar manifesto**. A edição carrega o registro completo e usa PUT. O motorista é selecionado pelo nome; homônimos exigem escolha explícita. O destino é pré-selecionado somente se houver um único destino ativo com o mesmo nome; nos demais casos, escolha-o explicitamente. Confira os dados antes de salvar. O backend continua validando pagamentos, fechamentos, período e unidade. Campos adicionais são preservados e erros de gravação mantêm o formulário preenchido. O modal não pode ser fechado durante a gravação.

## Executar

No terminal do backend:

```powershell
cd C:\Projeto\frete-web\backend
npm run start:dev
```

Em outro terminal:

```powershell
cd C:\Projeto\frete-web\frontend
npm ci
npm run dev
```

Abra http://127.0.0.1:5173 e use um usuário cadastrado. Não há usuário/senha de demonstração. O proxy `/api` encaminha ao backend em `http://127.0.0.1:3000`, sem exigir alteração de CORS. Para outra porta, defina `$env:API_TARGET='http://127.0.0.1:PORTA'` antes de iniciar o Vite. Não coloque credenciais em variáveis de frontend.

O login real pode migrar senha antiga para Argon2 conforme comportamento existente do backend. Nenhum login operacional é executado pelos testes da interface. Token em memória: atualizar/fechar a página requer novo login. Respostas 401 encerram a sessão. A interface não permite selecionar unidade diferente da contida no token; controles de autorização continuam no backend.

Cadastro requer veículo, motorista, destino e semana previamente cadastrados. Sem calendário operacional, o backend recusa datas: administrar semanas pela tela Semanas. Os valores são calculados pelo servidor. A busca textual opera nos registros carregados, não no banco inteiro. Os cartões também resumem apenas a consulta de até 50 registros. Detalhes mostram líquido CTRB, que não é o líquido do fechamento.

## Verificar e publicar

Atualização de edição: build/TypeScript e 7 testes da interface passaram. Os novos testes conferem a preservação dos campos no PUT, manutenção do formulário após conflito e ausência da ação de edição em manifesto fechado. API simulada; uso real e conferência visual ainda precisam de validação.

`npm test` executa testes da interface com API simulada. `npm run build` valida TypeScript e gera `dist`. Configuração de desenvolvimento baseada na [documentação oficial do Vite](https://vite.dev/guide/).


Em produção, servir `dist` e encaminhar `/api` para o backend no mesmo domínio, com HTTPS. O proxy do Vite é apenas para desenvolvimento; `vite preview` não configura a API de produção. Esta etapa não publica o sistema nem altera dados operacionais.
