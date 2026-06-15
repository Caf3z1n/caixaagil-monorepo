# Caixa Agil Monorepo

Novo monorepo da v2 do Caixa Agil.

Ele concentra os projetos iniciais da nova plataforma:

- site publico e aquisicao de clientes;
- plataforma logada do cliente;
- backend central;
- app desktop do PDV;
- futuros pacotes compartilhados.

## Estrutura

```text
api/        # Node.js + Express + Sequelize: backend da plataforma web
web/        # Next.js: site publico + painel web logado
pdv/        # Next.js + Electron: app desktop do caixa
packages/   # pacotes compartilhados futuros
```

## Comandos

```powershell
npm run dev:api
npm run build:api
npm run db:migrate:api
npm run dev:web
npm run typecheck:web
npm run build:web
npm run dev:pdv
npm run typecheck:pdv
npm run build:pdv
```

Servidor local padrao da API: `http://localhost:3333`.
Servidor local padrao do PDV: `http://localhost:3030`.
Servidor local padrão do painel web: `http://localhost:3000`.

## Backend

O projeto `api` usa Node.js, Express, Sequelize, PostgreSQL e JWT, com arquitetura baseada no `nuvem-api` do Posto Agil (`src/app/controllers`, `src/app/models`, `src/app/middlewares`, `src/routes`, `src/config` e `src/database`). Antes de rodar localmente:

```powershell
Copy-Item api\.env.example api\.env
npm install --prefix api
npm run db:migrate:api
npm run dev:api
```

## Origem

`web` foi copiado de `C:\Pedro\Programacao\caixa-agil-monorepo\caixa-agil-landing`.

Nao ha repositorio Git inicializado nesta pasta. Crie o repositorio quando a estrutura da v2 estiver definida.
