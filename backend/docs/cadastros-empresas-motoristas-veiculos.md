# Empresas, motoristas e veículos

Regra vigente: todas as páginas operacionais de fretes e fechamentos estão disponíveis para qualquer usuário autenticado, sem registros individuais em `user_permissions`. JWT e isolamento por unidade continuam obrigatórios. Semanas permanece exclusiva de administrador; manutenção de despesas e demais ações administrativas mantêm verificações no serviço. O Menu só oculta a tela administrativa de Semanas para o usuário comum. Esta regra substitui as regras de permissão individual registradas abaixo.

Atualização de permissões: usuários com `freight_service` na unidade atual podem consultar, incluir e editar motoristas e veículos, sem exigir administrador. O controller mantém JWT e PermissionsGuard em todas as rotas; o serviço deixou de exigir `isAdmin`. Menu e renderização das telas compartilham a mesma regra de acesso. Semanas continua exclusiva de administradores; despesas continuam com escrita administrativa e consulta operacional. Esta atualização substitui a restrição administrativa descrita no registro inicial abaixo.

Em 25/09/2026 foram importadas somente as 11 empresas de `PlanCompanies` (matriz, sigla, nome e cor): MMA, AZN, MRG, BLM, SBC, FNX, MRT, ECP, CZR, WAC e ATT. O cadastro é compartilhado entre unidades. Não foi executada a importação de pagadoras/rateios de `PlanVehicles`.

`extract-companies.py` lê XML do XLSM sem executar macros e gera `referencias/vba/companies.json`. `setup-registrations.ts` cria a tabela `frete_empresas`, acrescenta campos opcionais a `driver` e `vehicle` e importa as 11 empresas sem sobrescrever divergências. Não executar `prisma db push`: o schema representa apenas parte do banco legado.

Menu: Empresas substitui Pagadoras; Motoristas e Veículos abrem os respectivos formulários. Motoristas: somente CPF e nome, sem vínculo com empresa. A busca é pelo nome, CPF é dado cadastral e chave imutável. Veículos: placa, tipo, proprietário, CPF/CNPJ do proprietário e empresa; a placa não pode ser alterada. CPF/CNPJ numéricos são validados pelos dígitos verificadores. O proprietário usa a tabela legada `companies` por exigência de chave estrangeira, distinta do catálogo de 11 empresas.

A API de motoristas não aceita nem retorna `empresa_sigla`. A coluna legada em `driver` foi preservada para compatibilidade do banco, mas não é consultada ou usada pelo site. A empresa continua obrigatória apenas no veículo, de onde os fechamentos e relatórios obtêm a empresa de pagamento. Nenhum dado histórico de fechamento foi alterado.

Rotas `/registrations/companies`, `/registrations/drivers`, `/registrations/vehicles` e `/registrations/vehicle-types` exigem autenticação. POST/PUT de motoristas e veículos estão disponíveis também aos usuários comuns. Não existe exclusão física dos cadastros. A inclusão/edição do veículo define a empresa selecionada como primeira pagadora e zera a configuração antiga da segunda, sem criar rateio percentual. Não altera fechamentos históricos nem valores de CTRB. Veículos antigos sem empresa permanecem identificados como “Não informada” até revisão do cadastro.

A rotina financeira legada de rateio para veículos ainda não revisados não foi substituída nesta etapa de cadastros. A definição de valores e pagamentos por CTRB é uma etapa financeira separada; não se inferem valores pela empresa cadastrada.

Validação: testes de documentos e autorização, testes React, navegador com API simulada e criação/edição reais via HTTP em transação revertida, preservando o banco operacional.
