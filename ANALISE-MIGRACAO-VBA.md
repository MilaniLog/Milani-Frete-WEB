# Comparação do VBA com o projeto Node/React

Motorista corrigido conforme orientação do usuário: manifestos e cupons passam a consultar `/drivers` e selecionar pelo nome, sem digitar CPF. Busca por trecho do nome sem acentos; edição pré-seleciona apenas uma correspondência única; homônimos são diferenciados pelo final do CPF e exigem escolha. Busca alterada limpa a seleção; o backend recebe o CPF do cadastro escolhido internamente. Build, 44 testes React, 54 verificações operacionais de navegador e 17 verificações HTTP pelo proxy passaram, incluindo consulta real de motoristas. Conta temporária removida; nenhum registro operacional alterado.

Navegação ajustada conforme solicitação: um único botão Menu abre as opções suspensas; logo Milani retorna à Home, que também é a tela inicial após o login. Sessão preservada ao navegar, saída dentro do menu e Semanas exclusiva de administradores. Menu compatível com teclado, Escape e clique fora. Padrão atual dos formulários VBA preservado. Passaram build, 39 testes React e 110 verificações no navegador com API simulada; capturas da Home/menu inspecionadas em computador e celular. Nenhuma alteração de dados operacionais nesta etapa.

Calendário ajustado conforme solicitação: 105 semanas de 2026 e 2027 cadastradas no banco, de domingo a sábado, sem modificar movimentações. Exemplo confirmado: 3926 = 20/09/2026–26/09/2026. Tela Semanas exclusiva de administradores; consultas para filtros operacionais preservadas. Backend rejeita períodos fora de domingo–sábado. Conferência posterior encontrou 105 semanas existentes e nenhuma pendente. Passaram 163 testes backend, 37 testes React e 104 verificações HTTP com rollback (uma inclusão de semana a menos porque o calendário agora existe). Backend local reiniciado com a regra atualizada; 16 verificações pelo proxy passaram.

Adaptação visual solicitada em 24/09/2026: extraídos os metadados de designer dos 19 formulários via Excel COM, com macros/eventos desativados e arquivo somente leitura. Frete reorganizado nos grupos do `RegisterFrete`; semanas/despesas com linhas compactas e consulta pelo código; notas/cupons com sequência e legendas do original. Build, 37 testes React e 54 verificações de navegador passaram. Não é réplica integral: pagamentos vinculados e nota/cupom mantêm salvamentos separados, e cadastros completos de veículos/motoristas/tipos/destinos ainda não foram adicionados. Veja [correspondências e limites](frontend/FORMULARIOS-VBA.md).

Rodada de validação concluída em 24/09/2026 para as telas existentes: builds backend/frontend, 160 testes backend, 35 testes React, 96 verificações no Edge (computador/celular), 105 verificações transacionais com rollback e 16 verificações reais pelo proxy passaram. Corrigidos transbordamento da tabela de manifestos no celular e caminho de `start:prod`. Backend compilado iniciado e conexão restabelecida. Nenhum registro operacional alterado. Resultados, reprodução e limites em [validação atual](frontend/VALIDACAO.md). As entradas abaixo registram etapas anteriores e suas pendências à época.

Análise em 22/09/2026 do arquivo `resultado carregamento x GRU.xlsm` e do código disponível em `C:/Projeto/frete-web`.

Conferência de fechamentos no Edge concluída com API simulada: 24 verificações passaram em computador e celular, cobrindo prévia, confirmação, conflito, finalização, download HTML autenticado, cancelamento com motivo e restrições de acesso. Capturas inspecionadas; tabela com rolagem interna no celular, sem transbordamento da página. Automação em `frontend/scripts/check-closures-browser.mjs`. Nenhum fechamento operacional alterado; impressão física/PDF não testada.

Conferência de pagadoras no navegador concluída: 18 verificações passaram no Edge em 1440×1000 e 390×844, incluindo consulta, gravação simulada, conflito preservando campos, validação nativa, conversão percentual, sessão expirada e consulta não administrativa. Capturas inspecionadas sem rolagem horizontal; nenhuma exceção JavaScript. Automação reproduzível em `frontend/scripts/check-payers-browser.mjs`, com todas as rotas de API interceptadas. Edição operacional pelo navegador continua não realizada.

Integração de pagadoras validada no backend em execução pelo proxy React: 16 verificações HTTP passaram com login real temporário, incluindo normalização da placa, comparação de empresas/percentual com o banco, placa inválida e acesso sem autenticação. Conta temporária removida; nenhum veículo ou registro financeiro alterado. Script reproduzível em `backend/scripts/check-live-api.ts`. Conferência visual e edição pelo navegador permanecem pendentes.

Atualização React de pagadoras: consulta por placa e configuração administrativa das empresas e percentual, conectadas às rotas existentes de veículos. Percentual exibido de 0 a 100% e enviado como fração; remoção explícita com nomes vazios e zero. Build/TypeScript e 35 testes da interface passaram com API simulada. Concorrência dos testes limitada a dois processos após timeout de um teste existente sob carga. Sem alteração de pagadoras operacionais; validação visual no navegador pendente. Consulte [pagadoras](frontend/PAGADORAS.md).

Manutenção React complementada: exclusão de manifestos com consulta dos vínculos, bloqueio de lançamentos pagos/fechados, confirmação explícita e indicação da quantidade efetivamente excluída. Tipos de nota agora permitem edição e ativação/desativação. Build/TypeScript e 31 testes da interface passaram. Validação com API simulada, sem exclusões operacionais nesta etapa; regras e transações do backend preservadas.

Atualização React de notas/cupons: listagem, cadastro de tipos ativos, cadastro/edição/exclusão administrativa de notas e inclusão/edição/exclusão confirmada de cupons. Saldo usa a resposta transacional da API; bloqueios de pagamento/fechamento preservados. Build/TypeScript e 27 testes da interface passaram. Treze verificações HTTP pelo proxy com login temporário real passaram, incluindo consultas de notas e tipos; conta temporária removida. Nenhuma nota operacional gravada. Contratos e limites em [notas e cupons](frontend/NOTAS-CUPONS.md).

Atualização React financeira: tela de fechamentos com conferência, finalização confirmada, consulta histórica, download HTML e cancelamento administrativo com motivo. Permissão financeira independente da permissão de manifestos. Build/TypeScript e testes da interface passaram. A consulta financeira foi validada no backend real pelo proxy, incluindo negação/liberação por permissão de conta temporária removida ao final (11 verificações nessa execução). Nenhum fechamento operacional finalizado ou cancelado. Leia [fluxo e limites](frontend/FECHAMENTOS.md).

Validação real autorizada e novos cadastros React: 10 verificações HTTP no backend em execução e 10 pelo proxy do frontend passaram com login real, consultas e restrições de acesso. Contas de teste transitórias removidas. As 105 verificações transacionais de banco real passaram com rollback confirmado. Adicionadas telas de semanas (manutenção administrativa) e despesas por unidade (incluindo desativação). Build frontend, TypeScript backend e 17 testes da interface passaram. Frontend iniciado em http://127.0.0.1:5173. Validação automatizada HTTP não substitui a conferência visual no navegador.

Atualização React de lançamentos: detalhes do manifesto agora permitem listar, incluir, editar e excluir lançamentos com confirmação. Pagos/fechados não oferecem ações e a API mantém os bloqueios transacionais. A resposta atualiza os valores recalculados do manifesto. Build/TypeScript e 13 testes da interface com API simulada passaram, incluindo conflito de gravação e falha de atualização posterior. Sem gravações operacionais. Cadastro das despesas e semanas ainda pela API.

Atualização React: fundos brancos no login e na área interna; edição de manifestos abertos pelos detalhes. Formulário preserva campos financeiros, pede confirmação do CPF não armazenado no manifesto e mantém os dados quando a API rejeita a gravação. Registros fechados não oferecem edição e os bloqueios de pagamento continuam no backend. Build/TypeScript e 7 testes da interface passaram, com API simulada e sem gravação operacional.

Primeira etapa React implementada em `frontend`: login, autorização por unidade, consulta com filtro por semana e busca nos registros carregados, detalhes e cadastro de manifesto com campos de frete/CTRB. Token em memória e tratamento de sessão expirada. Build de produção/TypeScript e 5 testes de interface com API simulada passaram. Não foi efetuado login real, gravação operacional nem validação visual no navegador. Edição, exclusão, lançamentos e fechamentos na interface permanecem pendentes. Instruções em [frontend/README.md](frontend/README.md).

Conciliação recente solicitada pelo usuário: os 10 últimos fechamentos não cancelados com data registrada (18 a 21/09/2026) foram reproduzidos no serviço do backend e coincidiram em bruto, débitos e líquido. São 31 manifestos e 52 lançamentos, sem cupons. Seleção por data/número, sem exigir todas as categorias de registros. Passaram os 12 testes de conciliação e TypeScript. A divergência antiga não integra essa amostra. Consulte [resultados recentes](backend/docs/conciliacao-vba.md).

Conciliação com a fonte: reproduzido no serviço real do backend o fechamento da linha 4438 (5 manifestos, 2 lançamentos, 1 cupom), com bruto R$ 1.310,00, descontos R$ 417,16 e líquido R$ 892,84. A reconstrução estática ampliada coincidiu em 234/235 casos completos; a linha 188 apresenta diferença pendente de R$ 420,00. Nenhum dado operacional alterado. Passaram 149 testes e TypeScript. Evidências, reprodução e limites em [conciliação VBA](backend/docs/conciliacao-vba.md).

Atualização de relatórios: adicionados relatório JSON por fechamento, HTML para impressão e HTML de conferência provisória. Prioriza histórico original, preserva identificação de cancelamento e sinaliza limitações de dados legados. Textos escapados e acesso autenticado por unidade. Passaram 148 testes automatizados, TypeScript e 105 verificações HTTP com dados revertidos. Impressão/PDF via navegador, sem geração de PDF no servidor ou validação visual de paginação. Consulte [relatórios](backend/docs/relatorios-fechamento.md).

Atualização de cadastro de pagadoras: implementada `PUT /vehicles/:plate/payers`, exclusiva de administrador porque o cadastro de veículos é global. Permite definir ou remover empresas e percentual, compartilhando as regras de consistência do rateio. Não altera fechamentos históricos nem exige mudança de esquema. Validados 142 testes automatizados, TypeScript e 101 verificações HTTP com banco real, revertendo as alterações de teste. Consulte [pagadoras](backend/docs/pagadoras.md).

Atualização de rateio: conferência e finalização agora distribuem o líquido entre as pagadoras cadastradas no veículo, com limiar maior que R$ 1.000 e exceção por identificador CTRB. O percentual da primeira é o complemento do segundo no cadastro atual; centavos são conciliados por diferença. A distribuição fica salva no histórico e cadastros inconsistentes bloqueiam a gravação. Sem mudança de esquema ou de dados operacionais. Passaram 130 testes automatizados; TypeScript validado. Consulte as adaptações ao VBA em [fechamentos](backend/docs/fechamentos.md).

Atualização de cancelamento em 23/09/2026: cancelamento por ID exclusivo de administrador, com motivo obrigatório, reabertura transacional e preservação do histórico. Acrescentado e aplicado o campo JSON `frete_fechamentos.historico`. Novos fechamentos também registram usuário, instante e cópia dos dados na finalização. Passaram 114 testes automatizados, TypeScript e 92 verificações HTTP, incluindo rollback de falha parcial e histórico após exclusão de registro reaberto. Dados de teste revertidos. Consulte [fechamentos](backend/docs/fechamentos.md). As atualizações abaixo registram etapas anteriores.

Atualização de fechamento em 23/09/2026: implementadas conferência, finalização transacional e consulta por semana/placa/unidade, usando as tabelas existentes. A regra soma frete e créditos e desconta débitos e cupons. Validados 105 testes automatizados e compilação TypeScript. Cancelamento com histórico, rateio entre pagadoras e relatórios permanecem pendentes. Consulte [fechamentos](backend/docs/fechamentos.md).

Atualização em 23/09/2026: tipos de nota, notas e cupons financeiros implementados, com saldo transacional, limites de distribuição e bloqueios de pagamento/fechamento. As três tabelas específicas foram criadas; `invoices` de tickets permanece intacta. Validados 94 testes automatizados e 82 verificações HTTP, com rollback dos dados de teste. Consulte [contratos e limites](backend/docs/notas-cupons.md). A implementação segue a estrutura atual enquanto o usuário define mudanças futuras de tabelas e fechamento.

Estado atual de semanas: calendário com cadastro/edição/consulta, períodos de sete dias sem sobreposição, filtros e associação dos lançamentos implementados. As movimentações verificam períodos cadastrados e fechamentos por unidade/placa, com exceção administrativa para registros abertos. 75 testes automatizados e 57 verificações HTTP passaram. As tabelas já existiam; não foi importado calendário. Consulte [semanas](backend/docs/semanas.md). Os itens abaixo registram estágios anteriores da migração.

Estado atual da manutenção: edição e exclusão de manifestos implementadas, com recálculo dos dois modos incluindo créditos, sincronização dos lançamentos, exclusão transacional e bloqueios de registros fechados/pagos. Validação: 52 testes automatizados e 42 verificações HTTP com banco real, com rollback dos dados temporários. Consulte [os contratos e limites](backend/docs/manutencao-manifestos.md). O diagnóstico original abaixo permanece como referência histórica.

Atualização do banco: a estrutura real foi conferida em 22/09/2026. As tabelas e índices de despesas/lançamentos já estavam presentes, e as regras SP coincidiam com a planilha. Foi adicionada apenas a coluna `origem` aos manifestos, com padrão SP; os cinco registros existentes foram preservados, sem recálculo financeiro. As referências posteriores a SQL pendente registram a situação anterior a essa aplicação.

Atualização posterior: cadastro/manutenção de despesas e inclusão/edição/exclusão de lançamentos vinculados ao manifesto foram implementados, com recálculo dos dois modos em transação, isolamento por unidade e bloqueios de registros pagos/fechados. Foi acrescentada origem ao manifesto. O Prisma Client foi regenerado, mas o SQL de preparação do banco ainda não foi aplicado. Consulte [o escopo e as instruções](backend/docs/lancamentos.md). Os itens do diagnóstico original abaixo não refletem essas entregas posteriores.

Atualização de implementação: além da correção do filtro por unidade, os dois modos de cálculo agora estão implementados. A prévia mantém os campos ICMS e acrescenta `percentageCalculation`. A coluna 50 da aba Manifestos foi conferida diretamente: seu título é `PERCENTUAL ANTIGO`, e o VBA grava nela `CalcNewPercentManifest.FinalPercent`. Esse resultado agora é salvo e listado em `percentual_antigo`. O modo percentual usa as regras do banco e arredonda cada frete/não entregue a duas casas, com desempate para o par. Os 15 testes passaram e o TypeScript compilou. Os itens abaixo documentam o diagnóstico original; a integração dos lançamentos e a conferência das regras no banco continuam pendentes.

Foram extraídos 91 arquivos de código VBA, com aproximadamente 21.730 linhas e 645 declarações de procedimentos/propriedades. A pasta [referencias/vba](referencias/vba) contém o código e os inventários de módulos e abas. Os `.frm` contêm o código dos formulários; esta extração não reproduz seus layouts nem os recursos binários `.frx`.

A análise foi estática, sem executar macros, alterar a planilha ou acessar o banco. O código da aplicação não foi modificado. A verificação TypeScript `node node_modules/typescript/bin/tsc --noEmit --incremental false`, executada no backend, passou. Isso não comprova equivalência funcional com o Excel. Não há frontend React na pasta analisada, nem testes automatizados de negócio encontrados no código disponível.

**Conclusão:** há uma base de API para cadastrar manifestos e calcular um dos percentuais. Ainda faltam os fluxos financeiros e operacionais necessários para substituir a planilha inteira.

## Funcionalidades comparadas

| Funcionalidade | Estado no projeto | O que falta |
|---|---|---|
| Login e permissões | Implementação inicial com JWT, Argon2 e permissões por unidade | Validar equivalência dos perfis e eventual seleção de unidade; o token usa a unidade do funcionário, embora o login retorne permissões de várias unidades. |
| Consulta de veículo, motorista e destino | Implementada | Cadastro/edição de veículos, tipos, motoristas e destinos; manutenção de empresas e tipos de despesas. As rotas atuais desses recursos são de consulta. |
| Manifestos | Criação, últimos 50 registros e consulta por ID | Edição, exclusão com tratamento dos vínculos, busca por número/placa/período, paginação e restrições de fechamento. |
| Cálculo de frete | Modo por alíquota implementado | Segundo modo por percentual, integração com lançamentos e validação de arredondamentos. |
| CTRB, retenções e vale-pedágio | Campos e fórmula básica implementados | Integração com fechamento, relatórios e normalização dos identificadores. |
| Lançamentos | Ausentes na API | Débitos, créditos, adiantamentos, vínculos com manifesto/veículo/semana e recálculos. |
| Notas e cupons fiscais | Ausentes na API | Cadastro, vínculo, atualização de totais, exclusão e inclusão nos fechamentos. |
| Semanas/períodos | Ausentes na API | Cadastro e seleção de períodos; `semana` no manifesto é uma data e não substitui esse cadastro. |
| Fechamento | Ausente na API | Conferência, seleção de manifestos e despesas, totais, numeração, finalização e bloqueios. |
| Cancelamento de pagamentos | Ausente na API | Reabertura por semana, placa ou fechamento, atualizando os registros relacionados. |
| Relatórios | Ausentes na API | Geral, financeiro/lançamentos, conferência, fechamento, pagamentos e reimpressão. |
| Importação de histórico | Não encontrada | Mapear planilhas/tabelas existentes, importar e reconciliar valores e vínculos. |
| Interface React | Não encontrada neste workspace | Telas e integração com a API; não é possível avaliar uma interface que esteja em outra pasta. |

Referências VBA: [MenuForm.frm](referencias/vba/MenuForm.frm), [FreightLaunch.frm](referencias/vba/FreightLaunch.frm), [LaunchUtils.bas](referencias/vba/LaunchUtils.bas), [LaunchInvoicesForm.frm](referencias/vba/LaunchInvoicesForm.frm), [InvoicesUtils.bas](referencias/vba/InvoicesUtils.bas), [CouponUtils.bas](referencias/vba/CouponUtils.bas), [WeekForm.frm](referencias/vba/WeekForm.frm), [FreightClosureClass.cls](referencias/vba/FreightClosureClass.cls), [PaymentUtils.bas](referencias/vba/PaymentUtils.bas), [ReportClosure.bas](referencias/vba/ReportClosure.bas), [ReportFinancial.bas](referencias/vba/ReportFinancial.bas), [GeneralReport.bas](referencias/vba/GeneralReport.bas), [ReportPaymentFreights.bas](referencias/vba/ReportPaymentFreights.bas), [RePrintClosure.bas](referencias/vba/RePrintClosure.bas) e [ImportData.bas](referencias/vba/ImportData.bas).

## Problema prioritário: consultas sem unidade correta

Atualização após a análise: corrigido o envio do usuário completo nas duas consultas e adicionado um tipo compartilhado para o contrato. Foram adicionados testes de regressão em `backend/src/manifests/manifests.controller.spec.ts`. A descrição abaixo registra o problema encontrado originalmente.

Em [manifests.controller.ts](backend/src/manifests/manifests.controller.ts), `findAll` e `findOne` recebem `request.user.unit`. Porém, em [manifests.service.ts](backend/src/manifests/manifests.service.ts), esses métodos esperam `AuthUser` e acessam `user.unit`.

Ao receber um número, `user.unit` resulta em `undefined`. A consulta pode perder o filtro por unidade; dependendo da configuração do Prisma, também pode falhar. O efeito no banco não foi testado. O uso de `request: any` faz essa incompatibilidade passar pela compilação.

Correção indicada: passar `request.user` nos dois métodos e tipar o usuário da requisição. Validar que um usuário de uma unidade não consegue consultar registros de outra.

## Diferenças nos cálculos

### Existem dois modos no VBA

[ManifestUtil.bas](referencias/vba/ManifestUtil.bas) contém `CalcOldPercentManifest` e `CalcNewPercentManifest`. Ambos são calculados ao salvar o manifesto.

Valores lidos da aba `ICMS` desta planilha:

| Código | Alíquota | Multiplicador no modo ICMS | Multiplicador no segundo modo |
|---|---:|---:|---:|
| 777 | 7% | 93% | 15% |
| 888 | 12% | 88% | 25% |
| 999 | 12% | 88% | 100% |

São configurações do arquivo analisado, não uma afirmação sobre alíquotas legais. Não foi verificado se o banco contém os mesmos valores.

O [FreightCalculationService](backend/src/freight-calculation/freight-calculation.service.ts) usa `valor × (1 − aliquota)`, correspondente ao primeiro modo. O campo `percentual` existe no schema, mas não é utilizado pelo cálculo. O VBA usa esse segundo percentual com arredondamento a duas casas em `CalcFreight777/888/999`.

Exemplo matemático, sem despesas ou adicionais: para R$ 1.000 apenas no código 777 e frete do veículo de R$ 100, a base é R$ 930 no primeiro modo e R$ 150 no segundo. O percentual inicial é aproximadamente 10,7527% ou 66,6667%, respectivamente.

O VBA grava o resultado do segundo modo na coluna 50. O schema Node contém `percentual_antigo`, mas a criação não o preenche. É necessário confirmar o mapeamento histórico dessa coluna: os nomes “old”, “new” e “antigo” não bastam para definir sua correspondência.

### Despesas da empresa estão zeradas

Na criação do manifesto, o serviço envia literalmente `despesas_empresa: 0`. No VBA, `LaunchUtils.CalcLaunchBalance` soma créditos em `TotalSpendCompany`; esse valor aumenta o custo do veículo e altera o percentual final.

O mesmo VBA soma débitos separadamente e exclui lançamentos do tipo `Adiantamento` desse cálculo. Isso é diferente do campo de adiantamento do CTRB, que reduz o líquido do CTRB. A migração deve preservar essa distinção.

Exemplo matemático no modo ICMS: base de R$ 930, veículo de R$ 100 e crédito/despesa da empresa de R$ 50 produzem custo de R$ 150 e percentual final aproximado de 16,1290%. A criação atual permanece em R$ 100 e 10,7527%.

### Regras que já estão alinhadas

- `total_retencoes = sest_senat + irrf + prev_social + inss`.
- `valor_liquido = ctrb_total − ctrb_adiantamento − total_retencoes`.
- Vale-pedágio é registrado separadamente e não reduz o líquido do CTRB.
- Os subtotais legados de adicionais e `sub_total` excluem descarga, assim como `AddFormulaCalcSubTotals` no VBA. O cálculo do percentual inclui descarga. Essa diferença já existe no legado e não deve ser tratada automaticamente como erro da tradução.
- A fórmula principal do modo ICMS está alinhada quando as configurações coincidem e não existem lançamentos omitidos.

Faltam casos de equivalência para arredondamentos, valores pequenos, três códigos combinados, não entregues, descarga, créditos/débitos e base final zero. O Node arredonda valores a quatro casas; o segundo modo VBA arredonda fretes a duas. O Node também retorna dados no caso sem frete, enquanto a função VBA pode sair antes de atribuir o resultado.

## Regras operacionais ainda não migradas

Evidência principal: [RegisterFrete.frm](referencias/vba/RegisterFrete.frm) e [FreightUtils.bas](referencias/vba/FreightUtils.bas).

1. **Manifesto encerrado e semana fechada:** o formulário bloqueia salvar um manifesto já finalizado e exige autorização administrativa para determinada inclusão em período com fechamento da placa. A exclusão também verifica pagamento e trata lançamentos vinculados. Esses fluxos não existem na API.
2. **Número do manifesto e unidade:** o VBA prepara número com unidade de três dígitos, tamanho de 11 caracteres e hífen; também atualiza referências quando o número muda. A API faz apenas `trim()` e limite de tamanho. É preciso separar a unidade de acesso do prefixo documental quando aplicável.
3. **CIOT:** há formatação e uma verificação de CIOTs em aberto por placa. Atenção: a implementação extraída só impede um CIOT novo quando já existem pelo menos 20 CIOTs distintos não vazios em aberto. A mensagem sugere uma regra mais restritiva. Essa divergência deve ser decidida antes da implementação.
4. **Romaneio e CTRB:** o VBA formata romaneio e remove hífen do CTRB no salvamento. A API aceita texto praticamente livre.
5. **Capacidade do veículo:** o formulário avisa sobre excesso de peso/cubagem em determinadas situações. A API retorna capacidades, mas não compara esses limites ao salvar. No VBA é aviso, não um bloqueio geral.
6. **Carga mista:** o fechamento VBA identifica mais de um código de frete preenchido. A API apenas grava o booleano enviado, com padrão `false`; falta definir a correspondência com os filtros do legado.
7. **Busca e manutenção:** faltam edição/exclusão e filtros para localizar manifestos antigos; listar apenas 50 não substitui o fluxo de consulta da planilha.

## Persistência e validação

- O [schema ativo](backend/prisma/schema.prisma) tem nove modelos. O [backup de schema](backend/prisma/schema-completo-backup.prisma) já descreve `frete_despesas`, `frete_lancamentos`, `frete_fechamentos` e `frete_semanas`, entre outros. Isso é material reaproveitável, mas não comprova que o banco esteja igual ao backup, nem torna esses módulos implementados.
- A duplicidade de manifesto é verificada antes da inserção, porém o schema ativo não declara unicidade composta de unidade e número. Duas requisições concorrentes podem ultrapassar a consulta prévia se o banco também não tiver essa restrição. Verificar dados e constraints reais antes de uma migração.
- Os DTOs permitem manifesto/hora vazios e não validam o formato do horário. `semana` aceita ISO com horário, mas o serviço concatena `T00:00:00.000Z`, esperando apenas a data. Restringir o formato ou ajustar a conversão.
- A origem do cálculo é enviada pelo cliente ou assume `SP`, mas não é salva no manifesto; preservar origem/modo/configuração usada ajuda a reproduzir resultados históricos.
- Faltam transações para os futuros fluxos que atualizam manifesto, lançamentos, cupons e fechamento juntos.
- Não há evidência de uma rotina completa de importação e reconciliação do histórico no código Node disponível. Pode haver dados já migrados no banco; isso não foi verificado.

## Ordem de implementação sugerida

1. Corrigir o filtro de unidade e os contratos/validações dos manifestos; verificar unicidade no banco.
2. Fixar casos de referência do Excel e implementar ambos os cálculos, com arredondamentos e mapeamento dos campos definidos.
3. Implementar despesas e lançamentos, integrar ao cálculo e completar edição/exclusão de manifestos.
4. Implementar semanas, notas/cupons, fechamento e cancelamento com consistência transacional e permissões.
5. Completar cadastros, relatórios e telas React conforme cada fluxo ficar disponível.
6. Reconciliar o histórico e executar os mesmos cenários no Excel e no sistema antes de substituir a operação.

Não é necessário portar utilitários de janela do Excel, rolagem, proteção de abas ou eventos vazios literalmente. As regras de negócio precisam ser preservadas; a interação visual deve ser adaptada ao navegador.
