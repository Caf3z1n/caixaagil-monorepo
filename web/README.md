# CaixaAgil Platform

Aplicacao Next.js da nova plataforma web do Caixa Agil.

Este app nasceu a partir da antiga landing comercial e agora deve evoluir para concentrar o site publico, autenticacao, assinatura e area logada do cliente.

## Comandos

Na raiz do novo monorepo:

```powershell
npm run dev:web
npm run typecheck:web
npm run build:web
```

Dentro deste app:

```powershell
npm run dev
npm run typecheck
npm run build
```

Servidor local padrão: `http://localhost:3000`.

## Variaveis de ambiente

Use `.env.example` como base e crie um `.env.local` localmente quando precisar testar e-mail, checkout ou integracoes.

## Direcao

A area publica vende o produto. A area logada deve evoluir como software de trabalho para o cliente: densa, clara, rapida e consistente com o Caixa Agil.
