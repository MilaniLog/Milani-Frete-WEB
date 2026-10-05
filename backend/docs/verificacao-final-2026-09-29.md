# Verificação para homologação — 29/09/2026

Resultado: nenhum bloqueio funcional encontrado nos testes executados. O ambiente local está disponível para validação com os responsáveis pela operação. Esta verificação não equivale à aprovação do ambiente de produção.

## Evidências

| Verificação | Resultado |
|---|---|
| Compilação de produção do backend e frontend | Aprovada |
| Backend | 208 testes, 18 suítes aprovadas |
| Frontend | 73 testes, 13 arquivos aprovados |
| HTTP com banco real e transação revertida | 178 verificações aprovadas; rollback confirmado |
| API em execução | 30 verificações com login real; conta temporária removida |
| Navegador Edge | Oito roteiros aprovados: navegação, cadastros, fechamentos, lançamentos, notas/cupons, relatórios, cálculos do manifesto e operações |
| Disponibilidade local | Backend HTTP 200; proxy do frontend retorna 401 nas rotas protegidas sem sessão |

A primeira execução conjunta dos testes do frontend aprovou 61 testes, mas o processo da suíte App não iniciou por timeout. A suíte foi executada isoladamente e seus 12 testes passaram. Não houve falha funcional identificada nessa repetição.

## Conciliação com a planilha atualizada

Foram extraídos os dez fechamentos datados mais recentes da cópia atualizada de `resultado carregamento x GRU.xlsm`, sem executar macros e sem gravar movimentos no banco. Fechamentos **4735 a 4744**, de **23 a 25/09/2026**, com **43 manifestos, 35 lançamentos e 11 cupons**.

Os dez casos coincidiram em bruto, débitos/cupons e líquido, executando `FreightClosuresService.preview` com os movimentos históricos fornecidos por banco simulado. A suíte adicional passou com 12 testes (dez casos atuais, um histórico e uma verificação da seleção). A referência, com hash da fonte, está em `artifacts/latest-closures-validation-20260929.json`.

O teste aceita `CLOSURE_REFERENCE_FILE` para reproduzir amostras atualizadas sem substituir a referência histórica original. Os dados dessa amostra não foram importados no banco operacional.

## Roteiro para a validação dos responsáveis

1. Entrar com usuário comum e administrador e conferir os acessos.
2. Criar um manifesto de teste, selecionar placa/motorista/destino e conferir frete padrão, alterações manuais, percentuais e líquido do CTRB.
3. Incluir, editar e excluir um lançamento; conferir também lançamento avulso por placa e semana.
4. Cadastrar nota/cupom, conferir o saldo e voltar da consulta ao formulário de lançamento.
5. Conferir uma semana completa contra o Excel, fechar pelo site e comparar os relatórios, a planilha de pagamentos e a reimpressão.

Os responsáveis devem escolher um ambiente e registros próprios de homologação para essas gravações. As verificações automáticas desta rodada não deixaram movimentos de teste no banco.

## Limites antes da publicação

- A conciliação automatizada compara a consolidação dos vínculos históricos; não substitui a homologação de uma semana inteira inserida pelas telas, nem a conferência visual dos documentos impressos.
- Permanecem 69 veículos com pendências de importação, conforme decisão do usuário; o arquivo `artifacts/import-cadastros-20260929/pendencias.csv` identifica o que deve ser corrigido quando necessário.
- Hospedagem, domínio/HTTPS, proxy de produção para `/api`, inicialização automática dos serviços e rotina de backup/restauração ainda precisam ser verificados no ambiente em que o site será publicado. Nesta rodada foi validado o ambiente local, não realizado um deploy.
