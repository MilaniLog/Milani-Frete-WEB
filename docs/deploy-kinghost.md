# Deploy na KingHost

## O que vai para produção

- `frontend/dist`: arquivos estáticos do site React.
- `backend`: aplicação Node/Nest que atende a API.
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
```

`DATABASE_URL` pode existir também, mas a API usa principalmente `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` e `DATABASE_NAME` no `PrismaService`.

## Configuração esperada no servidor

1. Criar uma aplicação Node.js no painel da KingHost para o backend.
2. Apontar a aplicação para a pasta do backend.
3. Instalar dependências com `npm install`.
4. Rodar `npm run build`.
5. Comando de inicialização: `npm run start:prod`.
6. Publicar o conteúdo de `frontend/dist` como site estático.
7. Configurar a rota `/api` para encaminhar para o backend removendo o prefixo `/api`.

O frontend chama a API sempre com `/api/...`. O backend tem rotas como `/auth/login`, `/manifests`, `/freight-closures`, etc. Por isso, em produção, `/api/auth/login` precisa chegar ao backend como `/auth/login`.

## Conferências após subir

1. Abrir o site e fazer login.
2. Cadastrar ou consultar um manifesto.
3. Baixar uma conferência de fechamento.
4. Conferir se o PDF abre e se aparece `FECH:00000000` no cabeçalho.
5. Testar uma exclusão com usuário comum para confirmar a senha de ADM.
