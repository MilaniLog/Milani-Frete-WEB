# Deploy na KingHost

## O que vai para produção

- `frontend/dist`: arquivos estáticos do site React.
- `backend`: aplicação Node/Nest que atende a API e pode servir o frontend pronto.
- Banco MariaDB/MySQL configurado pelas variáveis do `.env`.

## Build local validado

```powershell
cd backend
npm install
npm run build

cd ../frontend
npm install
npm run build
```

## Variáveis necessárias no backend

```env
DATABASE_HOST="host_do_mysql"
DATABASE_PORT="3306"
DATABASE_USER="usuario"
DATABASE_PASSWORD="senha"
DATABASE_NAME="nome_do_banco"
JWT_SECRET="chave_grande_e_segura"
JWT_EXPIRES_IN="28800"
PORT="porta_definida_pela_kinghost"
FRONTEND_DIST="/caminho/para/frontend/dist" # opcional se o dist ficar fora do padrão
```

`DATABASE_URL` pode existir também, mas a API usa principalmente `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` e `DATABASE_NAME` no `PrismaService`.

## Configuração esperada no servidor

1. Criar uma aplicação Node.js no painel da KingHost.
2. Subir a pasta `backend` e a pasta `frontend/dist`.
3. Instalar dependências do backend com `npm install`.
4. Rodar `npm run build` no backend.
5. Comando de inicialização: `npm run start:prod`.
6. Manter o `frontend/dist` no caminho padrão `../frontend/dist` em relação à pasta do backend, ou configurar `FRONTEND_DIST` apontando para a pasta `dist` do frontend.

O frontend chama a API sempre com `/api/...` e o backend atende as rotas com esse prefixo em produção. Exemplo: `/api/auth/login`.

## Conferências após subir

1. Abrir o site e fazer login.
2. Cadastrar ou consultar um manifesto.
3. Baixar uma conferência de fechamento.
4. Conferir se o PDF abre e se aparece `FECH:00000000` no cabeçalho.
5. Testar uma exclusão com usuário comum para confirmar a senha de ADM.