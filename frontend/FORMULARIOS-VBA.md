# Cadastros orientados pelos formulários VBA

Ajuste de edição em Lançamentos: rótulos Manifesto e Motorista sem “opcional”; campos continuam não obrigatórios. Motorista utiliza somente a lista por nome. O botão Editar libera Núm. lançamento; sair do campo ou pressionar Enter busca o número na unidade atual e carrega o formulário. Salvar usa PUT e preserva número, emissão e departamento. O vínculo original com o manifesto não pode ser trocado. Lançamentos pagos/fechados e períodos protegidos continuam bloqueados. Novo lançamento encerra a edição e limpa o formulário.

Lançamentos: a tela agora abre diretamente em Novo lançamento. Manifesto é o primeiro campo, opcional; ao sair dele, a busca preenche placa, motorista, tipo de veículo, data e semana. Sem manifesto, o operador preenche placa, semana, data, despesa e valor; motorista por nome é opcional. O backend grava `manifesto_id=null`, valida veículo ativo, despesa da unidade, data/semana e fechamento do período. Créditos e débitos sem manifesto são selecionados na prévia do fechamento por placa e período, conforme a regra existente. Consulta/edição de lançamentos vinculados segue disponível no botão Consultar lançamentos do manifesto.

Permissões atualizadas: Motoristas e Veículos permitem inclusão/edição aos usuários com permissão de fretes, mesmo sem perfil administrador. O Menu oculta cada tela sem permissão na unidade atual. Semanas segue exclusiva de administradores e despesas seguem com manutenção administrativa.

Empresas, Motoristas e Veículos (25/09/2026): a tela antiga de Pagadoras foi substituída por Empresas, com as 11 entradas de PlanCompanies. DriverForm orienta CPF/Nome, acrescido da empresa solicitada; busca por nome. VehicleForm orienta Placa/Tipo/Proprietário/Documento/Empresa, sem opção de 10%. Apenas administradores gravam. Nenhum vínculo antigo de PlanVehicles foi importado. Ao salvar um veículo, a empresa escolhida é registrada como pagadora e o antigo percentual da segunda pagadora é zerado. Valores de CTRB e fechamentos históricos não são editados pelos cadastros.

Em 25/09/2026, Lançamentos passou a ter tela própria no Menu, com atalho no detalhe do manifesto. O formulário segue a sequência de `FreightLaunch`: número/emissão, semana e período, placa/tipo de veículo, motorista por nome, data, manifesto, tipo/despesa, valor e descrição. Departamento foi mantido como campo adicional. Edição e exclusão são escolhidas na lista; exclusão mantém confirmação. Placa e motorista são dados do manifesto vinculado, somente leitura. Número e emissão são gerados pelo servidor. A busca pelo número completo consulta o backend antes do limite dos 50 resultados, sempre na unidade do usuário. A tela ainda exige vínculo com manifesto, conforme o modelo atual do backend.

Validação desta etapa: 46 testes frontend, 19 testes do serviço de manifestos, builds frontend/backend e 56 verificações de operações no Edge com API simulada.

Em 24/09/2026, os metadados dos 19 formulários foram lidos diretamente do designer da planilha original: nomes, legendas, posições, dimensões e ordem de tabulação. O Excel foi aberto em instância separada, somente leitura, com macros e eventos desativados, e fechado sem salvar.

O script reproduzível é `backend/scripts/extract-form-layouts.py`; recebe o caminho da planilha e o JSON de saída. A referência local está em `referencias/vba/form-layouts.json`, ignorada pelo Git junto com o VBA original. Não se trata de captura de tela nem execução dos formulários. Controles de contêineres podem aparecer também na coleção geral do designer.

## Aplicado nas telas existentes

| Original | Site |
| --- | --- |
| `RegisterFrete` | Grupos visíveis A receber → CTRB → A pagar → A receber do cliente → Não entregue. Romaneio, Horário, Data, Unidade e Manifesto iniciam o formulário. Placa, Motorista e Destino seguem abaixo. Cubagem, Peso e QNT NF ficam juntos. Os adicionais deixam de ficar escondidos em uma única seção recolhida. |
| `WeekForm` | Semana, Início e Fim em linhas compactas, com rótulos ao lado. Digitar um código existente e sair do campo carrega o cadastro para edição. |
| `ExpenseForm` | COD e Nome em linhas; Crédito (+) e Débito (−) em opções de seleção. Consulta pelo código existente. Adiantamento e situação ativa são mantidos por serem recursos já suportados no site. |
| `LaunchInvoicesForm` | Inclusão no início; Nota, Data e Valor na mesma linha em computador; Tipo em seguida. Cupom ordenado por Semana, Placa, Motorista, Valor e Descrição. |

A identidade Milani e o fundo branco foram mantidos. No celular os grupos se reorganizam para caber na tela. Legendas foram adaptadas com acentuação legível; nomes acessíveis mais descritivos continuam identificando campos semelhantes, como valor da nota e valor do cupom.

## Diferenças ainda existentes

Isto não é uma reprodução integral dos 19 formulários. Os cadastros completos de motoristas, veículos, tipos de veículo e destinos não foram implementados nesta alteração; a tela Pagadoras continua restrita à configuração de pagamento do veículo existente.

No manifesto, a unidade é a da sessão e é somente leitura. Os pagamentos vinculados continuam no fluxo de lançamentos após o primeiro salvamento, e os cálculos continuam no servidor. No VBA, alguns desses controles e resultados estão disponíveis no próprio cadastro.

Nota e cupom continuam com salvamentos separados. Unificar a gravação para reproduzir o botão Salvar do VBA exige uma operação transacional no backend, para evitar nota salva sem o cupom em caso de falha. A seleção do motorista usa busca pelo nome; o identificador é enviado internamente ao backend. Homônimos exigem escolha explícita. As validações de períodos, pagamentos e permissões continuam vigentes.

## Validação

Build frontend aprovado; 37 testes React e 54 verificações operacionais no Edge passaram, em computador e celular, com API simulada. Inclui preservação dos valores financeiros, campos após conflitos, consulta de semana/despesa pelo código e seleção do tipo. Capturas locais foram atualizadas em `frontend/artifacts/operations`. Nenhum cadastro operacional foi alterado.
