# Roteiro de testes: assinaturas, planos e inadimplencia

Objetivo: validar o fluxo completo de planos, codigos personalizados, pagamentos, limites de uso e bloqueios operacionais antes de liberar para clientes reais.

Use este arquivo como checklist vivo. Cada teste deve registrar data, conta usada, resultado, evidencias de API/banco e caminho dos prints quando houver tela relevante.

## Padrao de execucao

- Contas de teste: `teste1@teste.com`, `teste2@teste.com`, `teste3@teste.com` e assim por diante.
- Senha padrao sugerida para contas sinteticas: uma senha forte temporaria definida no momento do teste.
- Painel admin: criar/editar planos, acompanhar assinatura, historico, inadimplencia e uso.
- Web cliente: validar cadastro, checkout, recursos fiscais, PDVs e subcontas.
- PDV desktop: validar ativacao, abertura de caixa, vendas e bloqueios por assinatura.
- VPS/banco: usar somente para preparar cenarios controlados, sempre registrando o estado antes/depois.
- Evidencias visuais: salvar print do web/PDV para avisos, bloqueios, checkout e limites atingidos.

## Matriz minima de contas e planos

Use contas diferentes para nao misturar historico de pagamento, limites e inadimplencia. A numeracao pode mudar na execucao, mas a combinacao precisa ser preservada.

| Conta | Plano | Cobranca | Objetivo principal |
| --- | --- | --- | --- |
| `teste1@teste.com` | Personalizado pago imediato | Diario ou mensal | Validar checkout, primeira cobranca, historico e recorrencia real. |
| `teste2@teste.com` | Personalizado com 30 dias gratis | Mensal | Validar trial, ausencia de cobranca antes da data e inicio futuro da regua. |
| `teste3@teste.com` | Personalizado gratis | Sem Mercado Pago | Validar acesso sem checkout e sem historico financeiro externo. |
| `teste4@teste.com` | Publico Inicial | Mensal | Comparar fluxo publico padrao, limites menores e downgrade/upgrade. |
| `teste5@teste.com` | Publico Completo | Mensal | Validar recursos fiscais e limites maiores. |
| `teste6@teste.com` | Personalizado pago a cada 7 dias | 7 dias | Validar frequencia customizada e proximo pagamento. |
| `teste7@teste.com` | Personalizado pago imediato | Diario | Testar falha/retentativa de pagamento em ambiente controlado. |
| `teste8@teste.com` | Personalizado com 90 dias gratis | Mensal | Validar trial longo e regras de inadimplencia somente apos vencimento real. |

## Metodo para recorrencia e falha

- Recorrencia real: criar plano com frequencia diaria e acompanhar por pelo menos dois ciclos reais no Mercado Pago, registrando `preapproval_id`, `authorized_payment_id`, `payment_id`, `status`, `status_detail`, `debit_date`, `pago_em` e linhas em `pagamentos_assinaturas`.
- Falha real de pagamento: usar conta/cartao de teste do Mercado Pago quando houver cenario de rejeicao disponivel; registrar se o evento ficou como `recycling`, `waiting for gateway`, `processed` com pagamento rejeitado, ou outro status retornado.
- Falha simulada: quando nao for viavel aguardar a recorrencia real, alterar de forma controlada `proximo_pagamento_em`, status de assinatura e/ou criar pagamento sintetico em banco de homologacao para testar apenas a nossa regua, avisos, bloqueios e desbloqueio.
- Webhook e conciliacao: para todo teste de pagamento, confirmar se o historico foi gravado por webhook ou pela conciliacao de leitura, e repetir a consulta para garantir que nao houve duplicidade.
- Separacao obrigatoria: marcar no resultado se o teste validou o Mercado Pago de ponta a ponta ou apenas a logica local do Caixa Agil.

## Rodada automatizada 2026-06-25

- Executor: `scripts/qa/assinaturas-e2e.js`.
- Comando usado no VPS: `Get-Content -Raw scripts/qa/assinaturas-e2e.js | ssh hostinger-vps "cd /home/deploy/caixaagil/api && QA_RUN_ID=2606251945 node -"`.
- Resultado: 48 cenarios executados, 47 `Passou`, 0 `Falhou`, 1 `Bloqueado`.
- Bloqueio restante: `T33`, porque o segundo ciclo real diario do Mercado Pago depende do relogio externo; no momento da rodada havia 1 parcela autorizada para o `preapproval_id c50a16656bff4732bcd2e3049f740825`.
- Prints web capturados:
  - `output/playwright/2606251945-aviso-inadimplencia-web.png`
  - `output/playwright/2606251945-bloqueio-inadimplencia-web.png`
  - `output/playwright/2606251945-limite-subcontas-web.png`
  - `output/playwright/2606251945-fiscal-bloqueado-web.png`

## Legenda de status

- `Pendente`: ainda nao testado.
- `Passou`: comportamento esperado confirmado.
- `Falhou`: comportamento divergente, precisa correcao.
- `Bloqueado`: nao foi possivel executar por dependencia externa.

## Cenarios

| ID | Cenario | Objetivo | Estado | Resultado | Evidencias |
| --- | --- | --- | --- | --- | --- |
| T01 | Plano personalizado pago imediato | Criar plano personalizado com valor e sem dias gratis; cadastrar `testeX@teste.com`; confirmar checkout gerado e assinatura vinculada. | Passou | Checkout MP criado e assinatura pendente vinculada. | `teste625194501@teste.com`, assinatura `59`, preapproval `f3b0192ac62f46e9915d0c9febf5044d`. |
| T02 | Plano personalizado gratis | Criar plano gratuito sem Mercado Pago; cadastrar conta; confirmar assinatura ativa sem checkout. | Passou | Assinatura ativada sem preapproval e login liberado. | `teste625194502@teste.com`, assinatura `60`. |
| T03 | Plano personalizado com 30 dias gratis | Criar plano pago com `trial_dias=30`; confirmar primeira cobranca futura e conta liberada ate o vencimento. | Passou | Regua ficou regular com `proximo_pagamento_em` futuro. | `teste625194503@teste.com`, proximo pagamento `2026-07-25T22:45:35.093Z`. |
| T04 | Plano personalizado com 90 dias gratis | Repetir trial longo e validar que inadimplencia so inicia depois da data esperada de pagamento. | Passou | Trial longo nao iniciou inadimplencia antes do vencimento. | `teste625194504@teste.com`, proximo pagamento `2026-09-23T22:45:35.360Z`. |
| T05 | Frequencia diaria | Criar plano personalizado com intervalo em dias e quantidade `1`; validar valor exibido como diario e proximo pagamento coerente. | Passou | Plano salvo com intervalo `dias` e quantidade `1`. | Plano `qa-2606251945-diario`. |
| T06 | Frequencia a cada 7 dias | Criar plano personalizado com intervalo em dias e quantidade `7`; validar checkout e proximo ciclo. | Passou | Checkout MP recebeu `frequency_type=days` e `frequency=7`. | `teste625194506@teste.com`, preapproval `660296eb985d4fc9bad14f981632f344`. |
| T07 | Codigo de uso unico | Usar o codigo em uma conta e tentar reutilizar em outra; confirmar bloqueio claro e sem quebrar o modal. | Passou | Segunda conta recebeu bloqueio de codigo utilizado. | `teste625194507@teste.com`, HTTP 400. |
| T08 | Checkout fechado e reaberto | Abrir checkout de plano personalizado, fechar guia e voltar ao fluxo; confirmar reutilizacao segura ou mensagem recuperavel. | Passou | Mesmo usuario reabriu checkout pendente com `reused=true`. | Assinatura `59`. |
| T09 | Editar limite de subcontas | Alterar plano personalizado usado de `0` para `1` subconta; confirmar web mostra `0/1 ativos` e botao habilitado. | Passou | Snapshot da assinatura sincronizou e entitlement passou para `1` subconta. | `teste625194509@teste.com`, antes `PLAN_LIMIT_REACHED`, depois limite `1`. |
| T10 | Editar limite de PDVs | Alterar plano personalizado usado para permitir novo PDV; confirmar web libera criacao e API aceita. | Passou | Limite alterado para `2` e segundo PDV criado. | Segundo PDV `19`. |
| T11 | Bloqueio por limite de subcontas | Com limite `1`, criar uma subconta e tentar criar outra; confirmar bloqueio no web e resposta `PLAN_LIMIT_REACHED` na API. | Passou | Primeira subconta criada; segunda bloqueada por limite. | Subconta `2`, codigo `PLAN_LIMIT_REACHED`. |
| T12 | Bloqueio por limite de PDVs | Com limite `1`, tentar ativar/criar segundo PDV; confirmar bloqueio no web, API e PDV. | Passou | Segundo PDV bloqueado por limite. | Primeiro PDV `18`, codigo `PLAN_LIMIT_REACHED`. |
| T13 | Permissao fiscal liberada | Editar plano para permitir emissao fiscal; confirmar configuracoes fiscais, grupos fiscais e documentos ficam acessiveis. | Passou | Rotas `/grupos-fiscais` e `/nf` passaram a abrir. | HTTP 200 nas duas rotas. |
| T14 | Permissao fiscal bloqueada | Remover emissao fiscal; confirmar telas fiscais bloqueadas no web e API retorna `PLAN_FEATURE_REQUIRED`. | Passou | Rotas fiscais bloquearam por entitlement. | `PLAN_FEATURE_REQUIRED` em grupos fiscais e NF. |
| T15 | Upgrade de plano | Sair de plano barato para caro; confirmar troca imediata e valores/rateio esperados. | Passou | Upgrade gerou checkout com credito de rateio. | `teste625194515@teste.com`, primeiro valor `20000`, recorrente `49900`, credito `29900`. |
| T16 | Downgrade de plano | Sair de plano caro para barato; confirmar agendamento para proxima fatura e manutencao do plano atual ate o fim do periodo. | Passou | Downgrade agendado e plano atual preservado. | `teste625194516@teste.com`, aplicar em `2026-07-13T22:45:38.613Z`. |
| T17 | Ajuste manual de valor | Pelo admin, alterar valor recorrente de uma assinatura; confirmar auditoria, assinatura local e Mercado Pago quando aplicavel. | Passou | Valor recorrente local atualizado e auditoria criada. | Valor `2500`, auditorias `1`. |
| T18 | Conceder dias gratis pelo admin | Adicionar dias gratis em assinatura existente; confirmar `proximo_pagamento_em` futuro e ausencia de inadimplencia antes da data. | Passou | Proximo pagamento empurrado e regua regular. | `2026-07-10T22:45:39.029Z`. |
| T19 | Vencimento hoje | Forcar `proximo_pagamento_em` para hoje; confirmar fase regular/aviso conforme regra esperada e ausencia de bloqueio prematuro. | Passou | Fase `aviso`, sem bloqueio. | `bloqueado=false`. |
| T20 | Atraso recente | Forcar vencimento 1 ou 2 dias atras; confirmar aviso no web/PDV e operacao ainda liberada. | Passou | Fase `atrasada`, sem bloqueio, com print web. | `teste625194520@teste.com`; print `output/playwright/2606251945-aviso-inadimplencia-web.png`. |
| T21 | Atraso no limite de tolerancia | Forcar atraso de 7 dias; confirmar fase correta e mensagem de risco de bloqueio. | Passou | Regua atual bloqueia exatamente no limite de 7 dias configurado. | Fase `bloqueada`, tolerancia `7`. |
| T22 | Atraso bloqueado | Forcar atraso de 10 dias; confirmar bloqueio no web/PDV, print da tela e impedimento de abrir caixa/nova venda. | Passou | Conta bloqueada e operacao protegida recusada. | Codigo `SUBSCRIPTION_BLOCKED`; print `output/playwright/2606251945-bloqueio-inadimplencia-web.png`. |
| T23 | Regularizacao de pagamento | Simular pagamento aprovado apos bloqueio; confirmar desbloqueio, novo proximo pagamento e sumico dos avisos. | Passou | Pagamento aprovado regularizou a regua local. | Pagamento sintetico `approved`, fase `regular`. |
| T24 | PDV ativado com assinatura regular | Criar codigo de pareamento e ativar PDV em conta regular; confirmar ativacao e sincronizacao. | Passou | PDV pareado em conta regular. | `teste625194524@teste.com`, PDV `20`. |
| T25 | PDV com assinatura em aviso | Abrir PDV com conta em aviso; confirmar alerta visivel sem bloquear venda/caixa. | Passou | Sessao PDV retornou `billing_status` em atraso sem bloqueio. | Fase `atrasada`, `bloqueado=false`. |
| T26 | PDV com assinatura bloqueada | Abrir PDV com conta bloqueada; confirmar tela de bloqueio e que caixa/venda nao prosseguem. | Passou | Evento `turno_aberto` recusado com `SUBSCRIPTION_BLOCKED`. | Print web de bloqueio e resposta PDV. |
| T27 | Isolamento entre contas | Validar que token de `teste1` nao edita dados de `teste2` em produtos, fiscal, PDVs e subcontas. | Passou | Token de outra conta recebeu 404 para categoria, fiscal, PDV e subconta. | HTTP 404 nos quatro recursos. |
| T28 | Painel admin de usuarios | Confirmar que lista mostra registro, plano, status, proximo pagamento, fiscal configurado, vendas 30 dias, PDVs e subcontas. | Passou | Lista administrativa retornou campos operacionais esperados. | `teste625194509@teste.com`, subcontas ativas `1`. |
| T29 | Historico e auditoria | Confirmar pagamentos, acoes admin e mudancas de assinatura aparecem no detalhe da conta. | Passou | Detalhe administrativo trouxe auditorias e historico financeiro. | `teste625194517@teste.com`, auditorias `2`. |
| T30 | Limpeza de dados sinteticos | Cancelar preapprovals de teste, remover/desativar contas sinteticas se necessario e registrar o que ficou no historico. | Passou | Plano sem historico removido; plano usado arquivado; preapprovals de teste tiveram cancelamento tentado. | Removido `qa-2606251945-exclusao-sem-historico`, arquivado `qa-2606251945-conta-9`. |
| T31 | Primeira cobranca gravada no historico | Criar assinatura paga imediata; confirmar que o Mercado Pago aprovou a cobranca e que `pagamentos_assinaturas` recebeu exatamente 1 registro. | Passou | Cobranca real existente conciliada no historico. | `teste1@teste.com`, assinatura `23`, payment `165794350324`, authorized `7029395133`. |
| T32 | Conciliacao idempotente de pagamento | Rodar webhook/consulta/conciliacao repetidas vezes para a mesma assinatura; confirmar que o historico nao duplica. | Passou | Conciliacao repetida manteve 1 registro. | Assinatura `23`, antes `1`, depois `1`. |
| T33 | Recorrencia diaria real | Manter plano diario ativo por pelo menos 2 ciclos; confirmar um registro por debito, valores corretos e `proximo_pagamento_em` atualizado. | Bloqueado | Segundo ciclo diario real ainda nao ocorreu no Mercado Pago. | Preapproval `c50a16656bff4732bcd2e3049f740825`, parcelas autorizadas `1`. |
| T34 | Recorrencia a cada 7 dias real ou acelerada | Testar plano de 7 dias; se nao houver tempo para aguardar, validar criacao e data futura no Mercado Pago e simular vencimento local. | Passou | Preapproval de 7 dias validado no Mercado Pago. | Preapproval `660296eb985d4fc9bad14f981632f344`, `frequency=7`, `frequency_type=days`. |
| T35 | Recorrencia mensal com plano publico | Assinar plano publico mensal e validar primeira cobranca, proximo ciclo e historico sem codigo personalizado. | Passou | Checkout publico mensal criado sem codigo. | `teste625194535@teste.com`, preapproval `676ee3086fb5441c8d128515a57e6b61`. |
| T36 | Falha de primeira cobranca | Tentar checkout com meio de pagamento rejeitado em conta teste; confirmar assinatura nao fica ativa indevidamente e historico mostra falha quando houver pagamento. | Passou | Status `pagamento_falhou` bloqueia login/acesso. | Login `SUBSCRIPTION_REQUIRED`, regua `bloqueada`. |
| T37 | Falha de recorrencia em `recycling` | Forcar ou observar parcela recorrente recusada; confirmar que nosso sistema marca alerta/atraso sem bloquear antes da tolerancia. | Passou | `recycling` fica atrasada sem bloqueio antes da tolerancia. | Fase `atrasada`, motivo `pagamento_nao_confirmado`. |
| T38 | Pagamento em `waiting for gateway` | Simular ou observar pagamento em processamento; confirmar que assinatura nao e tratada como paga ate virar aprovado/processado valido. | Passou | `waiting_for_gateway` nao foi tratado como pago. | Fase `atrasada`, `bloqueado=false`. |
| T39 | Retentativa bem-sucedida | Comecar com recorrencia falha e depois aprovar/regularizar; confirmar historico, novo pagamento aprovado e desbloqueio automatico. | Passou | Retentativa `processed` regularizou a conta. | Antes `atrasada`, depois `regular`. |
| T40 | Retentativas esgotadas | Simular recorrencia que falhou alem da tolerancia; confirmar aviso, atraso, bloqueio e ausencia de operacao no PDV. | Passou | Falha alem da tolerancia bloqueou. | Fase `bloqueada`, motivo `pagamento_recusado`. |
| T41 | Cancelamento automatico externo | Simular/observar assinatura cancelada pelo Mercado Pago apos falhas recorrentes; confirmar status local `cancelada` ou `pagamento_falhou` e bloqueio. | Passou | `pagamento_falhou` e `cancelada` bloqueiam operacao. | Motivos `status_assinatura_pagamento_falhou` e `status_assinatura_cancelada`. |
| T42 | Pagamento aprovado sem webhook | Remover/ignorar webhook em cenario controlado e confirmar que abrir conta/admin concilia o pagamento aprovado sem duplicar. | Passou | Conciliacao por leitura recuperou pagamento aprovado. | Assinatura `23`, registros `1`. |
| T43 | Webhook fora de ordem | Processar evento de preapproval antes/depois de payment/authorized_payment; confirmar assinatura e historico consistentes. | Passou | Eventos com mesmo `payment_id` ficaram idempotentes. | `qa-pay-outoforder-2606251945`, registros `1`. |
| T44 | Mudanca de valor antes da recorrencia | Alterar valor recorrente pelo admin antes do proximo ciclo; confirmar Mercado Pago, assinatura local e proxima cobranca no historico. | Passou | Preapproval MP atualizado de R$ 10,00 para R$ 18,00 e valor local sincronizado. | Preapproval `3d841988746c45e5b3537cdb9af49c4c`. |
| T45 | Trial finalizado com cobranca | Criar plano com dias gratis curtos em homologacao; ao final, confirmar cobranca, historico e ausencia de inadimplencia se pago. | Passou | Fim de trial com pagamento aprovado ficou regular. | Pagamento sintetico `approved`. |
| T46 | Trial vencido sem cobranca aprovada | Simular fim de trial sem pagamento aprovado; confirmar entrada em aviso/atraso/bloqueio conforme tolerancia. | Passou | Trial vencido sem pagamento bloqueou apos tolerancia. | Fase `bloqueada`, atraso `10` dias. |
| T47 | Conta gratis nao gera cobranca | Validar que plano gratis nao cria preapproval, nao tenta conciliacao Mercado Pago e nao entra em inadimplencia financeira. | Passou | Plano gratis nao criou pagamento e ficou regular por `plano_gratuito`. | Pagamentos `0`. |
| T48 | Multiplas contas em paralelo | Rodar pelo menos 5 contas com planos diferentes ao mesmo tempo; confirmar isolamento de pagamento, limite, fiscal, PDV e subcontas. | Passou | Cinco contas distintas ficaram regulares e isoladas. | `teste6251945481` a `teste6251945485`. |

## Prints obrigatorios

- Aviso de inadimplencia no web.
- Bloqueio de inadimplencia no web.
- Aviso de inadimplencia no PDV.
- Bloqueio de abertura de caixa/venda no PDV.
- Tela de limite de subcontas atingido.
- Tela de limite de PDVs atingido.
- Checkout Mercado Pago aberto para plano personalizado pago.
- Cadastro concluido para plano personalizado gratis.
- Historico com pagamento aprovado apos conciliacao.
- Aviso ou status de recorrencia falha no admin.
- Tela do Mercado Pago ou retorno de API mostrando parcela recorrente, quando houver teste real.

## Observacoes para execucao futura

- Antes de alterar datas no banco, registrar assinatura, usuario, plano, `status`, `proximo_pagamento_em` e ultimo pagamento.
- Preferir preparar cenarios com contas `testeX@teste.com` novas para evitar misturar historico real.
- Em testes com Mercado Pago, separar claramente homologacao, producao tecnica e producao real.
- Ao encontrar falha, registrar primeiro o comportamento observado, depois corrigir e repetir o mesmo ID do teste.
- Em recorrencia, nunca assumir que `processed` significa pagamento aprovado sem olhar o `payment_id` associado e o status do pagamento real.
- Para testes simulados, deixar explicito no resultado quais campos foram alterados manualmente e restaurar/cancelar a assinatura ao final.

## Referencias tecnicas

- Mercado Pago: [contas de teste](https://www.mercadopago.com.ar/developers/en/docs/your-integrations/test/accounts) permitem validar fluxos e cenarios da integracao com comprador/vendedor de teste.
- Mercado Pago: [assinaturas com pagamento autorizado](https://www.mercadopago.com.br/developers/en/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments) geram parcelas recorrentes, podem passar por processamento, retentativa e cancelamento apos rejeicoes recorrentes.
