# Caixa Agil API

Backend Node.js da plataforma web do Caixa Agil.

## Stack

- Node.js + Express
- Sequelize
- PostgreSQL
- JWT
- bcryptjs

## Estrutura

Arquitetura baseada no projeto `nuvem-api` do Posto Agil:

```text
src/
  app.js
  server.js
  app/
    controllers/  # handlers HTTP
    helpers/      # funcoes auxiliares de dominio
    middlewares/  # auth, autorizacao e outros middlewares
    models/       # models Sequelize
    services/     # regras de negocio reutilizaveis
  config/         # auth e configuracao do banco
  database/       # instancia Sequelize, migrations e seeders
  routes/         # rotas Express
```

## Configuracao local

```powershell
Copy-Item .env.example .env
npm install
npm run migrate
npm run dev
```

A API roda por padrao em `http://localhost:3333`.

## Rotas iniciais

- `GET /health`
- `POST /sessions`
- `POST /usuarios`
- `POST /usuarios/identificar`
- `POST /usuarios/verificacao-email`
- `POST /usuarios/confirmar-email`
- `POST /usuarios/redefinicao-senha`
- `POST /usuarios/redefinir-senha`
- `POST /assinaturas/checkout`
- `POST /webhooks/mercado-pago`
- `GET /usuarios`
- `GET /usuarios/:id`
- `PUT /usuarios/:id`
- `DELETE /usuarios/:id`
- `GET /assinaturas`
- `GET /assinaturas/:id/pagamentos`

As rotas abertas cobrem cadastro, login, verificacao de email, redefinicao de senha, checkout do Mercado Pago e webhook de pagamentos. As rotas administrativas de `usuarios` e `assinaturas` usam `Authorization: Bearer <token>`, sem controle de roles nesta fase.

## Tabelas iniciais

- `usuarios`: `id`, `email`, `senha_hash`, `ativo`, tokens de verificacao/redefinicao e timestamps.
- `assinaturas`: `usuario_id`, `plano`, `status`, `valor_centavos`, `mercado_pago_preapproval_id`, `referencia_externa`, `checkout_url`, `email_pagador` e timestamps.
- `pagamentos_assinaturas`: historico de pagamentos/cobrancas de assinaturas com IDs do Mercado Pago, status, valores, forma de pagamento, datas e `payload_mercado_pago`.

## Mercado Pago

- Checkout de assinatura: `POST /assinaturas/checkout`.
- Webhook publico: `POST /webhooks/mercado-pago`.
- Eventos usados pelo webhook:
  - `payment`
  - `subscription_authorized_payment`
- Configure no Mercado Pago a URL publica da API terminando em `/webhooks/mercado-pago`.
- Se preencher `MERCADO_PAGO_WEBHOOK_SECRET`, a API valida o header `x-signature` e recusa notificacoes invalidas.
