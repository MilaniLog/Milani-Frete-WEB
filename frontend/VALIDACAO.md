# Validação da versão atual — 24/09/2026

A rodada de validação das telas implementadas foi concluída. Foram preservados o fundo branco, a identidade Milani e as regras atuais de tabelas e fechamentos. As mudanças de negócio futuras ainda dependem da definição do usuário.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Build backend (Nest/TypeScript) | Passou |
| Build frontend (TypeScript/Vite) | Passou |
| Testes backend | 160 passaram, em 11 suítes |
| Testes React | 35 passaram, em 7 suítes |
| Navegador: pagadoras | 18 verificações passaram |
| Navegador: fechamentos | 24 verificações passaram |
| Navegador: notas, cupons, semanas, despesas, manifestos e lançamentos | 54 verificações passaram |
| API com banco real em transação revertida | 105 verificações passaram; rollback confirmado |
| Backend em execução através do proxy frontend | 16 verificações passaram; conta temporária removida |

Os 96 cenários de navegador usam Edge, com resoluções 1440×1000 e 390×844. Todas as chamadas de API nesses cenários são simuladas. Cobrem cadastro/edição, confirmações de exclusão, saldo, conflitos, permissões, sessão expirada, registros fechados, precisão dos valores e zeros iniciais. A conciliação dos últimos dez fechamentos de setembro integra os testes do backend.

Capturas locais em `artifacts/payers`, `artifacts/closures` e `artifacts/operations` permitem revisar as telas. Foram inspecionadas capturas de notas, cadastros, edição de manifesto e lançamentos, além de pagadoras e fechamentos. Tabelas largas usam rolagem interna no celular.

## Ajustes encontrados nesta rodada

- O rótulo acessível da coluna de ações dos manifestos aumentava a largura da página no celular. O contêiner da tabela agora contém seu posicionamento, mantendo o texto para leitores de tela sem causar transbordamento.
- `backend/package.json` apontava `start:prod` para `dist/main`, mas o build gera `dist/src/main.js`. O comando foi corrigido; o backend compilado foi iniciado e validado pelo proxy.
- O teste HTTP real passou a informar o número da verificação e os códigos HTTP em falhas, sem imprimir credenciais ou conteúdo de registros.

## Repetir

Na pasta `frontend`, com a aplicação em execução e Edge instalado:

```powershell
npm test
npm run build
npm run test:browser
```

`FRONTEND_URL` altera o endereço da automação de navegador; o padrão é `http://127.0.0.1:5173`. `npm run test:browser:operations` executa apenas as telas operacionais. Os artefatos de teste são ignorados pelo Git.

Na pasta `backend`:

```powershell
npm test -- --runInBand
npm run build
npm run start:prod
```

O último comando mantém o servidor aberto. Em outro terminal, na pasta `backend`, com o banco e o frontend disponíveis:

```powershell
npm run check:freight-api
$env:LIVE_API_URL='http://127.0.0.1:5173/api'
node -r ts-node/register scripts/check-live-api.ts
```

O primeiro teste de integração usa transação externa revertida; o segundo cria uma conta transitória e remove-a em `finally`, realizando somente consultas nas rotas operacionais. Não interrompa os testes durante a limpeza.

## Limites

Esta conclusão refere-se à validação das funcionalidades já implementadas, não à migração de toda a planilha ou à publicação em produção. Não foram realizados pagamentos, finalizações ou exclusões de registros operacionais. O download HTML foi testado com conteúdo simulado; impressão física/PDF e uma operação financeira real completa pelo navegador permanecem fora desta rodada. As futuras mudanças de tabelas e fechamentos continuam pendentes de definição.
