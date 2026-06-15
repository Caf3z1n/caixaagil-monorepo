# AGENTS.md

Contexto para agentes trabalhando em `C:\Pedro\Programacao\caixaagil-monorepo`.

## Estrutura

- `web/`: Next.js, site público e plataforma logada inicial.
- `api/`: Node.js + Express + Sequelize + PostgreSQL, backend central.
- `packages/`: reservado para pacotes compartilhados futuros.

Comandos principais:

```powershell
npm run dev:api
npm run build:api
npm run db:migrate:api
npm run dev:web
npm run typecheck:web
npm run build:web
```

## Commits

- Mensagens de commit devem ser escritas em pt-BR.
- Use uma frase curta, objetiva e no imperativo ou presente, por exemplo: `Ajusta fluxo de convênios no PDV`.
- Evite mensagens genéricas como `update`, `fix` ou `changes`; descreva a mudança principal feita no projeto.

## Direção de produto

- Este monorepo é a v2 do Caixa Ágil.
- A UI deve parecer software profissional de operação/PDV/SaaS, não landing page genérica quando a tarefa envolver plataforma logada.
- Preserve o design existente do `web`; faça ajustes cirúrgicos e funcionais.
- Antes de criar um novo padrão visual, procure e reutilize padrões já existentes no sistema, especialmente modais, feedbacks, etapas, filtros, abas, chips, cards, botões, listas e fluxos do `web`. Só crie uma variação nova quando o padrão atual não atender ao comportamento necessário.
- Para qualquer ajuste visual em fluxo já existente, primeiro identifique uma tela/componente do projeto que resolva o mesmo problema e replique sua estrutura, espaçamento, estados, nomes de classes e comportamento visual sempre que possível. Não invente um componente diferente por preferência própria quando já houver padrão equivalente no `web` ou no `pdv`.
- Se precisar criar uma variação, explique brevemente o motivo no raciocínio de implementação e mantenha a variação compatível com o design system existente. O padrão local do projeto tem prioridade sobre sugestões genéricas de UI.
- Na plataforma logada, animações suaves são padrão: navegação interna, troca de etapas, entrada de listas/cards e abertura de modais devem comunicar continuidade do fluxo sem atrasar a operação.
- Quando o usuário pedir uma animação ou microinteração visual específica, trate como opt-in explícito e não deixe `prefers-reduced-motion` do navegador suprimi-la ou convertê-la em estado estático. O navegador principal do usuário pode estar com redução de animações ativa, então efeitos solicitados, como ondas de hover, devem sobrepor essa configuração de forma escopada ao componente.
- Em áreas que dependem de dados da API, prefira loading skeletons alinhados ao layout final em vez de spinners soltos quando a estrutura do conteúdo for previsível.
- Em modais de cadastro/edição de itens da plataforma, padronize as ações assim: `Cancelar` sempre à esquerda; ações à direita, com `Excluir` antes de `Salvar/Cadastrar`; botões de salvar/cadastrar devem usar verde de confirmação com texto branco, não laranja.
- Fluxos de cadastro, login, verificação, redefinição, assinatura e pagamento devem depender da API, não de rotas temporárias no Next.
- Textos visíveis ao usuário devem estar em pt-BR, com acentuação correta, e os arquivos devem permanecer salvos em UTF-8. Não introduza mojibake como `Ã`, `Ã£`, `Ã§`, `vocÃª`, `nÃ£o`; se encontrar esse problema em texto tocado pela tarefa, corrija.

## Web

- `web` deve guardar apenas variáveis públicas, como `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_API_URL`.
- Não coloque tokens privados do Resend, Mercado Pago ou banco no `web`.
- Use `web/src/lib/api-client.ts` para chamadas HTTP do frontend para a API.
- O estado local atual da plataforma ainda usa `localStorage` para e-mail/token de sessão; se for endurecer auth, faça isso de forma planejada com a API.

## API

- A API é dona das regras de negócio e integrações privadas.
- Tabelas e colunas novas devem seguir português brasileiro sem acentos, por exemplo `usuarios`, `assinaturas`, `senha_hash`, `ativo`, `usuario_id`.
- Por enquanto não usar roles em `usuarios`. O usuário base é identificado por `email`, `senha_hash`, `ativo` e campos de token/verificação.
- `assinaturas` se relaciona com `usuarios` por `usuario_id`.
- `pagamentos_assinaturas` guarda o histórico mensal/recorrente de pagamentos das assinaturas; não consultar Mercado Pago direto pelo web.
- Mercado Pago deve ficar nos services/controllers da API, especialmente `api/src/app/services/mercadoPagoService.js`.
- Webhook do Mercado Pago fica em `POST /webhooks/mercado-pago`; configure `MERCADO_PAGO_WEBHOOK_SECRET` quando a assinatura secreta do painel estiver disponível.
- Envio de e-mail deve ficar na API, especialmente `api/src/app/services/emailService.js` e `emailTemplates.js`.
- Ao alterar schema, crie migration em `api/src/database/migrations`.

## Variáveis

- `api/.env`: banco, JWT, Resend e Mercado Pago.
- `web/.env.local`: somente variáveis `NEXT_PUBLIC_*`.
- Nunca mova segredos privados para o Next client.

## Validação

- Para alterações no backend, rode ao menos `npm --prefix api run build`.
- Para alterações no web, rode `npm --prefix web run typecheck` e, quando fizer sentido, `npm --prefix web run build`.
- Se iniciar servidor local, API padrão: `http://localhost:3333`; web padrão: `http://localhost:3000`.
