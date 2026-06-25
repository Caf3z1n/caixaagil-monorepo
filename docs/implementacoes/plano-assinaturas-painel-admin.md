# Plano de implementação: assinaturas e painel administrativo

Objetivo: evoluir o fluxo de criação de conta, planos, assinaturas, Mercado Pago, pagamentos e limites de uso para permitir gestão completa pelo dono do sistema, sem quebrar o fluxo atual dos clientes.

## Direção geral

- A API continua sendo a fonte de verdade para cadastro, assinaturas, pagamentos, planos, permissões e limites.
- O web deve consumir planos e ofertas da API, não manter preços e recursos hardcoded.
- O painel administrativo deve ser separado da área do cliente e acessível somente pelo dono do sistema.
- Toda regra de plano precisa existir na API; esconder telas no frontend é apenas complemento visual.
- Mudanças de plano, descontos, valores manuais e períodos grátis devem manter histórico e auditoria.

## Etapa 1: base administrativa e segurança

Objetivo: criar a base segura para o painel do dono antes de expor dados sensíveis.

Status: base inicial implementada.

- Criar autenticação administrativa separada.
- Proteger rotas internas de listagem/edição de usuários.
- Definir middleware administrativo.
- Preparar estrutura inicial do painel web interno.

## Etapa 2: catálogo real de planos

Objetivo: tirar os planos do código e transformar planos, preços, recursos e limites em dados gerenciáveis.

Status: base inicial implementada.

- Criar tabelas de planos, versões de plano, recursos e limites.
- Migrar os planos atuais Inicial e Completo para esse novo modelo.
- Fazer cadastro/login/conta consumirem planos pela API.
- Manter snapshot do plano contratado dentro da assinatura.

## Etapa 3: códigos e ofertas personalizadas

Objetivo: permitir códigos únicos com preço especial, dias grátis antes da primeira cobrança e condições comerciais por cliente.

- Criar códigos de assinatura vinculados a plano/oferta.
- Permitir valor personalizado, quantidade de dias grátis antes da primeira cobrança e data de expiração do código.
- Registrar uso do código na assinatura.
- Permitir que o checkout aceite código de assinatura.

## Etapa 4: entitlements e limites por assinatura

Objetivo: controlar o que cada cliente pode usar de acordo com o plano contratado.

- Criar serviço central de permissões e limites da assinatura.
- Aplicar regras em fiscal, grupos fiscais, documentos fiscais, PDVs, subcontas e demais módulos.
- Aplicar limite de PDVs ativos.
- Aplicar limite de subcontas ativas.
- Refletir esses bloqueios no frontend com mensagens claras.

## Etapa 5: fluxo correto de troca de plano

Objetivo: separar upgrade imediato de downgrade agendado.

- Upgrade: permitir troca imediata com cobrança/rateio quando fizer sentido.
- Downgrade: manter preço e recursos atuais até o fim do ciclo já pago.
- Criar alterações agendadas de assinatura.
- Aplicar plano menor somente na próxima cobrança.

## Etapa 6: painel administrativo de assinaturas

Objetivo: dar visão operacional do negócio para o dono do sistema.

- Listar contas criadas, status, data de cadastro e assinatura atual.
- Ver histórico de pagamentos por conta.
- Ver PDVs, subcontas, plano, limites e uso atual.
- Filtrar por status de assinatura, plano e inadimplência.
- Acessar detalhes de uma conta sem misturar com a área do cliente.

## Etapa 7: ações administrativas avançadas

Objetivo: permitir gestão manual controlada das assinaturas.

Status: implementada.

- Criar/editar planos pelo painel.
- Criar códigos personalizados pelo painel.
- Ajustar valor manual de uma assinatura.
- Conceder trial grátis por período definido.
- Cancelar, pausar ou reativar assinatura quando necessário.
- Registrar auditoria das ações administrativas.

## Etapa 8: régua de inadimplência e bloqueio operacional

Objetivo: transformar `proximo_pagamento_em` na referência central para saber quando o sistema espera receber o próximo pagamento e quando deve avisar ou bloquear uma conta.

Status: implementada.

- Respeitar períodos grátis: se um cliente recebeu 30 ou 90 dias antes da primeira cobrança, ele só pode entrar em atraso depois de vencer esse prazo.
- Criar estados operacionais para assinatura regular, em aviso, atrasada e bloqueada.
- Exibir aviso para atualizar forma de pagamento quando o pagamento esperado vencer e não houver pagamento aprovado.
- Definir prazo de tolerância inicial, por exemplo 7 dias, antes de bloquear a operação.
- Bloquear abertura de caixa e novas vendas no PDV quando a conta estiver bloqueada por inadimplência.
- Manter acesso suficiente para o cliente regularizar pagamento, consultar conta e reativar a operação.
- Refletir a situação no painel administrativo com próximo pagamento, dias em atraso, fase da régua e motivo do bloqueio.

## Etapa 9: endurecimento Mercado Pago

Objetivo: deixar o billing mais confiável e rastreável.

- Centralizar integração Mercado Pago em serviços de domínio.
- Melhorar sincronização entre assinatura local, preapproval e pagamentos.
- Tratar falhas, webhooks duplicados e estados pendentes.
- Revisar uso de `start_date`, atualização de valor recorrente e cobrança futura.
- Criar rotinas de reconciliação para assinaturas e pagamentos.

## Etapa 10: validação final

Objetivo: garantir que o fluxo completo esteja consistente antes de liberar.

- Validar cadastro novo com plano comum.
- Validar cadastro com código personalizado.
- Validar trial grátis com cobrança futura.
- Validar upgrade.
- Validar downgrade agendado.
- Validar limites de PDV e subcontas.
- Validar bloqueio de recursos fiscais em plano sem permissão.
- Validar painel administrativo com dados reais e sem vazamento para clientes.
