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

## Legenda de status

- `Pendente`: ainda nao testado.
- `Passou`: comportamento esperado confirmado.
- `Falhou`: comportamento divergente, precisa correcao.
- `Bloqueado`: nao foi possivel executar por dependencia externa.

## Cenarios

| ID | Cenario | Objetivo | Estado | Resultado | Evidencias |
| --- | --- | --- | --- | --- | --- |
| T01 | Plano personalizado pago imediato | Criar plano personalizado com valor e sem dias gratis; cadastrar `testeX@teste.com`; confirmar checkout gerado e assinatura vinculada. | Pendente |  |  |
| T02 | Plano personalizado gratis | Criar plano gratuito sem Mercado Pago; cadastrar conta; confirmar assinatura ativa sem checkout. | Pendente |  |  |
| T03 | Plano personalizado com 30 dias gratis | Criar plano pago com `trial_dias=30`; confirmar primeira cobranca futura e conta liberada ate o vencimento. | Pendente |  |  |
| T04 | Plano personalizado com 90 dias gratis | Repetir trial longo e validar que inadimplencia so inicia depois da data esperada de pagamento. | Pendente |  |  |
| T05 | Frequencia diaria | Criar plano personalizado com intervalo em dias e quantidade `1`; validar valor exibido como diario e proximo pagamento coerente. | Pendente |  |  |
| T06 | Frequencia a cada 7 dias | Criar plano personalizado com intervalo em dias e quantidade `7`; validar checkout e proximo ciclo. | Pendente |  |  |
| T07 | Codigo de uso unico | Usar o codigo em uma conta e tentar reutilizar em outra; confirmar bloqueio claro e sem quebrar o modal. | Pendente |  |  |
| T08 | Checkout fechado e reaberto | Abrir checkout de plano personalizado, fechar guia e voltar ao fluxo; confirmar reutilizacao segura ou mensagem recuperavel. | Pendente |  |  |
| T09 | Editar limite de subcontas | Alterar plano personalizado usado de `0` para `1` subconta; confirmar web mostra `0/1 ativos` e botao habilitado. | Pendente |  |  |
| T10 | Editar limite de PDVs | Alterar plano personalizado usado para permitir novo PDV; confirmar web libera criacao e API aceita. | Pendente |  |  |
| T11 | Bloqueio por limite de subcontas | Com limite `1`, criar uma subconta e tentar criar outra; confirmar bloqueio no web e resposta `PLAN_LIMIT_REACHED` na API. | Pendente |  |  |
| T12 | Bloqueio por limite de PDVs | Com limite `1`, tentar ativar/criar segundo PDV; confirmar bloqueio no web, API e PDV. | Pendente |  |  |
| T13 | Permissao fiscal liberada | Editar plano para permitir emissao fiscal; confirmar configuracoes fiscais, grupos fiscais e documentos ficam acessiveis. | Pendente |  |  |
| T14 | Permissao fiscal bloqueada | Remover emissao fiscal; confirmar telas fiscais bloqueadas no web e API retorna `PLAN_FEATURE_REQUIRED`. | Pendente |  |  |
| T15 | Upgrade de plano | Sair de plano barato para caro; confirmar troca imediata e valores/rateio esperados. | Pendente |  |  |
| T16 | Downgrade de plano | Sair de plano caro para barato; confirmar agendamento para proxima fatura e manutencao do plano atual ate o fim do periodo. | Pendente |  |  |
| T17 | Ajuste manual de valor | Pelo admin, alterar valor recorrente de uma assinatura; confirmar auditoria, assinatura local e Mercado Pago quando aplicavel. | Pendente |  |  |
| T18 | Conceder dias gratis pelo admin | Adicionar dias gratis em assinatura existente; confirmar `proximo_pagamento_em` futuro e ausencia de inadimplencia antes da data. | Pendente |  |  |
| T19 | Vencimento hoje | Forcar `proximo_pagamento_em` para hoje; confirmar fase regular/aviso conforme regra esperada e ausencia de bloqueio prematuro. | Pendente |  |  |
| T20 | Atraso recente | Forcar vencimento 1 ou 2 dias atras; confirmar aviso no web/PDV e operacao ainda liberada. | Pendente |  |  |
| T21 | Atraso no limite de tolerancia | Forcar atraso de 7 dias; confirmar fase correta e mensagem de risco de bloqueio. | Pendente |  |  |
| T22 | Atraso bloqueado | Forcar atraso de 10 dias; confirmar bloqueio no web/PDV, print da tela e impedimento de abrir caixa/nova venda. | Pendente |  |  |
| T23 | Regularizacao de pagamento | Simular pagamento aprovado apos bloqueio; confirmar desbloqueio, novo proximo pagamento e sumico dos avisos. | Pendente |  |  |
| T24 | PDV ativado com assinatura regular | Criar codigo de pareamento e ativar PDV em conta regular; confirmar ativacao e sincronizacao. | Pendente |  |  |
| T25 | PDV com assinatura em aviso | Abrir PDV com conta em aviso; confirmar alerta visivel sem bloquear venda/caixa. | Pendente |  |  |
| T26 | PDV com assinatura bloqueada | Abrir PDV com conta bloqueada; confirmar tela de bloqueio e que caixa/venda nao prosseguem. | Pendente |  |  |
| T27 | Isolamento entre contas | Validar que token de `teste1` nao edita dados de `teste2` em produtos, fiscal, PDVs e subcontas. | Pendente |  |  |
| T28 | Painel admin de usuarios | Confirmar que lista mostra registro, plano, status, proximo pagamento, fiscal configurado, vendas 30 dias, PDVs e subcontas. | Pendente |  |  |
| T29 | Historico e auditoria | Confirmar pagamentos, acoes admin e mudancas de assinatura aparecem no detalhe da conta. | Pendente |  |  |
| T30 | Limpeza de dados sinteticos | Cancelar preapprovals de teste, remover/desativar contas sinteticas se necessario e registrar o que ficou no historico. | Pendente |  |  |

## Prints obrigatorios

- Aviso de inadimplencia no web.
- Bloqueio de inadimplencia no web.
- Aviso de inadimplencia no PDV.
- Bloqueio de abertura de caixa/venda no PDV.
- Tela de limite de subcontas atingido.
- Tela de limite de PDVs atingido.
- Checkout Mercado Pago aberto para plano personalizado pago.
- Cadastro concluido para plano personalizado gratis.

## Observacoes para execucao futura

- Antes de alterar datas no banco, registrar assinatura, usuario, plano, `status`, `proximo_pagamento_em` e ultimo pagamento.
- Preferir preparar cenarios com contas `testeX@teste.com` novas para evitar misturar historico real.
- Em testes com Mercado Pago, separar claramente homologacao, producao tecnica e producao real.
- Ao encontrar falha, registrar primeiro o comportamento observado, depois corrigir e repetir o mesmo ID do teste.
