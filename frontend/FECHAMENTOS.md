# Fechamentos na interface

Acesse **Fechamentos** na navegação. Exige `freight_closure` na unidade da sessão ou administrador; não depende de `freight_service`. A lista mostra até 50 fechamentos da unidade.

Informe código de semana (quatro dígitos) e placa sem hífen. **Conferir valores** consulta a prévia no backend, exibindo valores, rateio e registros. Não grava nada. Mudar placa/semana invalida a conferência.

**Finalizar fechamento** abre uma confirmação com semana/placa. **Confirmar finalização** envia somente esses dois campos; valores são recalculados no servidor. A resposta final informa o líquido efetivamente salvo. Os registros ficam pagos/fechados no sistema, mas nenhuma transferência bancária ocorre. Em caso de falha, faça nova conferência antes de tentar novamente.

**Consultar fechamento** usa o relatório histórico JSON da API. Registros legados são identificados, sem reconstruir um rateio ausente. Administrador pode **Cancelar fechamento**, informando motivo e confirmando a reabertura. O histórico e os totais anteriores ficam preservados. Usuários comuns não veem essa ação; a API também a bloqueia.

**Baixar conferência** e **Baixar relatório para impressão** consultam o HTML autenticado, sem token na URL. Abra o arquivo baixado e use a impressão do navegador para papel ou PDF. A conferência baixada é consultada novamente e pode refletir alterações posteriores à prévia exibida.

Validação: testes de interface usam API simulada, incluindo confirmação, invalidação da prévia, conflito e cancelamento administrativo. Consulta real da lista e restrição de permissão foram verificadas por HTTP através do proxy. Não foram finalizados/cancelados registros operacionais.

## Navegador

Com o frontend em execução e Microsoft Edge instalado, execute `npm run test:browser:closures` na pasta `frontend`. Opcionalmente configure `FRONTEND_URL` (padrão `http://127.0.0.1:5173`). Todas as chamadas de API são interceptadas; nenhum fechamento operacional é alterado.

Passaram 24 verificações em 1440×1000 e 390×844: prévia, confirmação antes de enviar, invalidação ao trocar placa, conflito exigindo nova conferência, finalização simulada, download HTML autenticado e conteúdo do arquivo, cancelamento com motivo obrigatório, histórico cancelado e restrições por perfil/permissão. Sem exceções JavaScript nem rolagem horizontal da página; a tabela usa rolagem interna no celular.

Capturas inspecionadas em `frontend/artifacts/closures/desktop.png` e `mobile.png` (arquivos locais ignorados pelo Git). O teste verifica o download do HTML simulado; não valida impressão em papel, geração de PDF ou finalização operacional pelo navegador.
