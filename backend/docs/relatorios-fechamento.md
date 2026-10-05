# Conferência e impressão de fretes

As rotas exigem JWT no cabeçalho Authorization e estão disponíveis aos usuários autenticados. Fechamentos de outra unidade retornam 404; cancelar exige administrador.

- `GET /freight-closures/preview`: conferência JSON existente.
- `GET /freight-closures/preview/print?semana=0001&placa=ABC1234`: conferência provisória em HTML.
- `GET /freight-closures/:id/report`: relatório estruturado em JSON.
- `GET /freight-closures/:id/print`: relatório HTML para impressão.

O HTML contém resumo financeiro, manifestos, lançamentos, cupons e pagadoras. Usa moeda brasileira, layout A4 e cabeçalhos de tabela repetidos na impressão. Não finaliza nem altera dados. A prévia é recalculada; a finalização poderá ter valores diferentes se os registros forem alterados.

Na tela Fechamentos, use “Baixar conferência” ou “Baixar relatório para impressão”, abra o HTML baixado e use Ctrl+P para imprimir ou salvar como PDF. A interface envia o JWT no cabeçalho; abrir a URL diretamente sem esse cabeçalho não autentica. O backend retorna HTML, não PDF. A paginação física depende do navegador.

O relatório de fechamento prioriza `historico.finalizacao.dados`. Se não existir, usa a cópia do cancelamento legado; na ausência de ambas, usa os vínculos atuais. A origem é informada no JSON (`FINALIZACAO`, `CANCELAMENTO_LEGADO` ou `VINCULOS_ATUAIS`) e o HTML avisa quando não há cópia original. O status atual CANCELADO e o motivo aparecem mesmo quando os detalhes são os da finalização original. Registros históricos não são recalculados com tabelas ou pagadoras atuais. Rateio antigo ausente é apresentado como não registrado.

O relatório escapa texto cadastrado, não usa scripts ou recursos externos e envia `Cache-Control: no-store`. Manifestos/lançamentos/cupons vazios são identificados. O documento não é comprovante de transferência bancária e não reproduz integralmente o layout Excel. Identificadores de manifesto/nota nos vínculos são os IDs internos; o relatório mostra também o número do manifesto na própria seção de manifestos.
