const { Op } = require('sequelize');
const sequelize = require('../../database');
const { Assinatura, PagamentoAssinatura } = require('../models');
const {
  cancelMercadoPagoPreapproval,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoPreapproval,
  updateMercadoPagoPreapprovalAmount,
  validateMercadoPagoWebhookSignature,
} = require('../services/mercadoPagoService');
const {
  normalizeMercadoPagoAuthorizedPayment,
  normalizeMercadoPagoPayment,
  processarPagamentoAssinatura,
  syncAssinaturaPagamentosMercadoPago,
} = require('../services/pagamentosAssinaturaService');
const {
  applyDueScheduledChangeForSubscription,
  cancelScheduledChangesForSubscription,
} = require('../services/alteracoesAssinaturaService');
const { hasSubscriptionActivationEvidence } = require('../services/assinaturaAccessService');

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventType(req) {
  return String(req.body?.type || req.body?.entity || req.body?.topic || req.query?.type || req.query?.topic || '').trim();
}

function getEventAction(req) {
  return String(req.body?.action || req.query?.action || '').trim();
}

function getEventDataId(req) {
  return String(req.body?.data?.id || req.query?.['data.id'] || req.query?.id || req.body?.id || '').trim();
}

function getAssinaturaStatus(paymentStatus, assinatura = null) {
  if (assinatura?.renovacao_cancelada_em) {
    return 'cancelamento_agendado';
  }

  const normalized = String(paymentStatus || '').toLowerCase();

  if (['approved', 'accredited', 'paid', 'processed'].includes(normalized)) {
    return 'ativa';
  }

  if (['cancelled', 'canceled'].includes(normalized)) {
    return 'cancelada';
  }

  if (normalized === 'rejected') {
    return hasSubscriptionActivationEvidence(assinatura) ? 'ativa' : 'pagamento_falhou';
  }

  if (['refunded', 'charged_back'].includes(normalized)) {
    return 'pagamento_falhou';
  }

  if (['pending', 'in_process', 'authorized'].includes(normalized)) {
    return 'pendente';
  }

  return null;
}

function getAssinaturaStatusFromPreapproval(preapprovalStatus, assinatura = null) {
  if (assinatura?.renovacao_cancelada_em) {
    return 'cancelamento_agendado';
  }

  const normalized = String(preapprovalStatus || '').toLowerCase();

  if (normalized === 'authorized') {
    return 'ativa';
  }

  if (['cancelled', 'canceled', 'paused'].includes(normalized)) {
    return 'cancelada';
  }

  if (['rejected', 'inactive'].includes(normalized)) {
    return hasSubscriptionActivationEvidence(assinatura) ? 'ativa' : 'pagamento_falhou';
  }

  if (['pending', 'in_process'].includes(normalized)) {
    return 'pendente';
  }

  return null;
}

function isPreapprovalEvent(eventType, eventAction) {
  const normalizedType = String(eventType || '').toLowerCase();
  const normalizedAction = String(eventAction || '').toLowerCase();

  return (
    normalizedType === 'subscription_preapproval' ||
    normalizedType === 'preapproval' ||
    normalizedAction.startsWith('subscription_preapproval.')
  );
}

function isExternalResourceLookupError(error) {
  return [400, 404].includes(Number(error?.statusCode));
}

async function findAssinatura(paymentData) {
  const conditions = [];

  if (paymentData.mercado_pago_preapproval_id) {
    conditions.push({ mercado_pago_preapproval_id: paymentData.mercado_pago_preapproval_id });
  }

  if (paymentData.referencia_externa) {
    conditions.push({ referencia_externa: paymentData.referencia_externa });
  }

  if (conditions.length === 0) {
    return null;
  }

  return Assinatura.findOne({
    where: {
      [Op.or]: conditions,
    },
  });
}

function extractPreapprovalReference(preapproval) {
  return (
    preapproval?.external_reference ||
    preapproval?.metadata?.referencia_externa ||
    preapproval?.metadata?.external_reference ||
    null
  );
}

async function findAssinaturaByPreapproval(preapproval) {
  const conditions = [];
  const preapprovalId = preapproval?.id ? String(preapproval.id) : '';
  const referenciaExterna = extractPreapprovalReference(preapproval);

  if (preapprovalId) {
    conditions.push({ mercado_pago_preapproval_id: preapprovalId });
  }

  if (referenciaExterna) {
    conditions.push({ referencia_externa: referenciaExterna });
  }

  if (conditions.length === 0) {
    return null;
  }

  return Assinatura.findOne({
    where: {
      [Op.or]: conditions,
    },
  });
}

async function normalizeRecurringAmountIfNeeded(assinatura) {
  const assinaturaAtual = await Assinatura.findByPk(assinatura?.id);

  if (
    !assinaturaAtual?.normalizar_valor_apos_primeiro_pagamento ||
    assinaturaAtual.valor_normalizado_em ||
    !assinaturaAtual.mercado_pago_preapproval_id ||
    !assinaturaAtual.valor_recorrente_centavos
  ) {
    return;
  }

  const confirmedPaymentCount = await PagamentoAssinatura.count({
    where: {
      assinatura_id: assinaturaAtual.id,
      status: {
        [Op.in]: ['approved', 'accredited', 'paid', 'authorized', 'processed'],
      },
    },
  });

  if (confirmedPaymentCount === 0) {
    return;
  }

  await updateMercadoPagoPreapprovalAmount(assinaturaAtual.mercado_pago_preapproval_id, {
    valorCentavos: assinaturaAtual.valor_recorrente_centavos,
    moeda: assinaturaAtual.moeda || 'BRL',
  });

  await sequelize.transaction(async transaction => {
    const assinaturaBloqueada = await Assinatura.findByPk(assinaturaAtual.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (
      !assinaturaBloqueada ||
      !assinaturaBloqueada.normalizar_valor_apos_primeiro_pagamento ||
      assinaturaBloqueada.valor_normalizado_em
    ) {
      return;
    }

    assinaturaBloqueada.valor_normalizado_em = new Date();
    assinaturaBloqueada.normalizar_valor_apos_primeiro_pagamento = false;
    await assinaturaBloqueada.save({ transaction });
  });
}

async function cancelPreviousActiveSubscriptions(assinatura) {
  const assinaturasAnteriores = await Assinatura.findAll({
    where: {
      id: { [Op.ne]: assinatura.id },
      usuario_id: assinatura.usuario_id,
      status: {
        [Op.in]: ['ativa', 'cancelamento_agendado', 'pagamento_falhou'],
      },
    },
  });

  for (const assinaturaAnterior of assinaturasAnteriores) {
    if (assinaturaAnterior.mercado_pago_preapproval_id) {
      try {
        await cancelMercadoPagoPreapproval(assinaturaAnterior.mercado_pago_preapproval_id);
      } catch {
        // O webhook do Mercado Pago deve continuar processando a assinatura nova.
      }
    }

    await sequelize.transaction(async transaction => {
      const assinaturaBloqueada = await Assinatura.findByPk(assinaturaAnterior.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!assinaturaBloqueada || assinaturaBloqueada.status === 'substituida') {
        return;
      }

      assinaturaBloqueada.status = 'substituida';
      assinaturaBloqueada.cancelada_em = assinaturaBloqueada.cancelada_em || new Date();
      await cancelScheduledChangesForSubscription(
        assinaturaBloqueada.id,
        'assinatura_substituida',
        { transaction }
      );
      await assinaturaBloqueada.save({ transaction });
    });
  }
}

async function updateAssinaturaFromPreapproval(assinatura, preapproval) {
  if (!assinatura?.id) {
    return;
  }

  const nextPaymentDate = toDate(preapproval?.next_payment_date);
  const assinaturaAtual = await sequelize.transaction(async transaction => {
    const assinaturaBloqueada = await Assinatura.findByPk(assinatura.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!assinaturaBloqueada) {
      return null;
    }

    const assinaturaStatus = getAssinaturaStatusFromPreapproval(
      preapproval?.status,
      assinaturaBloqueada
    );
    let shouldSave = false;

    if (assinaturaStatus && assinaturaBloqueada.status !== assinaturaStatus) {
      assinaturaBloqueada.status = assinaturaStatus;
      shouldSave = true;

      if (assinaturaStatus === 'ativa' && !assinaturaBloqueada.ativada_em) {
        assinaturaBloqueada.ativada_em = new Date();
      }

      if (
        ['cancelada', 'pagamento_falhou'].includes(assinaturaStatus) &&
        !assinaturaBloqueada.cancelada_em
      ) {
        assinaturaBloqueada.cancelada_em = new Date();
      }
    }

    if (
      !assinaturaBloqueada.renovacao_cancelada_em &&
      nextPaymentDate &&
      String(assinaturaBloqueada.proximo_pagamento_em || '') !== String(nextPaymentDate)
    ) {
      assinaturaBloqueada.proximo_pagamento_em = nextPaymentDate;
      shouldSave = true;
    }

    if (shouldSave) {
      await assinaturaBloqueada.save({ transaction });
    }

    return assinaturaBloqueada;
  });

  if (assinaturaAtual?.status === 'ativa') {
    const appliedChanges = await applyDueScheduledChangeForSubscription(assinaturaAtual);

    if (appliedChanges.length > 0) {
      await assinaturaAtual.reload();
    }

    await cancelPreviousActiveSubscriptions(assinaturaAtual);
  }
}

async function updateAssinaturaStatus(assinatura, paymentStatus) {
  if (!assinatura?.id) {
    return;
  }

  let nextPaymentDate = null;

  if (assinatura.mercado_pago_preapproval_id) {
    try {
      const preapproval = await getMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
      nextPaymentDate = toDate(preapproval?.next_payment_date);
    } catch {
      // O webhook deve continuar processando o status mesmo se a consulta da assinatura falhar.
    }
  }

  const assinaturaAtual = await sequelize.transaction(async transaction => {
    const assinaturaBloqueada = await Assinatura.findByPk(assinatura.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!assinaturaBloqueada) {
      return null;
    }

    const assinaturaStatus = getAssinaturaStatus(paymentStatus, assinaturaBloqueada);

    if (!assinaturaStatus) {
      return assinaturaBloqueada;
    }

    assinaturaBloqueada.status = assinaturaStatus;

    if (assinaturaStatus === 'ativa' && !assinaturaBloqueada.ativada_em) {
      assinaturaBloqueada.ativada_em = new Date();
    }

    if (assinaturaStatus === 'cancelada' && !assinaturaBloqueada.cancelada_em) {
      assinaturaBloqueada.cancelada_em = new Date();
    }

    if (!assinaturaBloqueada.renovacao_cancelada_em && nextPaymentDate) {
      assinaturaBloqueada.proximo_pagamento_em = nextPaymentDate;
    }

    await assinaturaBloqueada.save({ transaction });
    return assinaturaBloqueada;
  });

  if (assinaturaAtual?.status === 'ativa') {
    try {
      await normalizeRecurringAmountIfNeeded(assinaturaAtual);
    } catch {
      // A normalização será tentada novamente no próximo webhook ou consulta de status.
    }

    const appliedChanges = await applyDueScheduledChangeForSubscription(assinaturaAtual);

    if (appliedChanges.length > 0) {
      await assinaturaAtual.reload();
    }

    await cancelPreviousActiveSubscriptions(assinaturaAtual);
  }
}

async function fetchWebhookPaymentData(eventType, eventAction, eventId) {
  const normalizedType = String(eventType || '').toLowerCase();
  const normalizedAction = String(eventAction || '').toLowerCase();

  if (normalizedType === 'subscription_authorized_payment') {
    const authorizedPayment = await getMercadoPagoAuthorizedPayment(eventId);
    return normalizeMercadoPagoAuthorizedPayment(authorizedPayment);
  }

  if (normalizedType === 'payment' || normalizedAction.startsWith('payment.')) {
    const payment = await getMercadoPagoPayment(eventId);
    return normalizeMercadoPagoPayment(payment);
  }

  return null;
}

module.exports = {
  async receive(req, res) {
    const signature = validateMercadoPagoWebhookSignature(req);

    if (!signature.valid) {
      return res.status(401).json({ message: 'Assinatura do webhook invalida' });
    }

    const eventType = getEventType(req);
    const eventAction = getEventAction(req);
    const eventId = getEventDataId(req);

    if (!eventType || !eventId) {
      return res.status(400).json({ message: 'Webhook Mercado Pago sem tipo ou ID do evento' });
    }

    try {
      if (isPreapprovalEvent(eventType, eventAction)) {
        const preapproval = await getMercadoPagoPreapproval(eventId);
        const assinatura = await findAssinaturaByPreapproval(preapproval);

        if (!assinatura) {
          return res.json({
            message: 'Evento Mercado Pago recebido, mas a assinatura local nao foi encontrada.',
            type: eventType,
          });
        }

        await updateAssinaturaFromPreapproval(assinatura, preapproval);

        let pagamentosSincronizados = 0;

        try {
          const syncResult = await syncAssinaturaPagamentosMercadoPago(assinatura);
          pagamentosSincronizados = syncResult.total;
        } catch {
          // A assinatura ja foi atualizada; a conciliacao pode ser refeita por consulta ou outro webhook.
        }

        return res.json({
          message: 'Webhook Mercado Pago processado.',
          assinaturaId: assinatura.id,
          pagamentoId: null,
          pagamentosSincronizados,
        });
      }

      const paymentData = await fetchWebhookPaymentData(eventType, eventAction, eventId);

      if (!paymentData) {
        return res.json({
          message: 'Evento Mercado Pago recebido, mas nao usado por este fluxo.',
          type: eventType,
        });
      }

      const assinatura = await findAssinatura(paymentData);
      const { pagamento } = await processarPagamentoAssinatura(paymentData, assinatura);

      await updateAssinaturaStatus(assinatura, paymentData.status);

      if (assinatura) {
        try {
          await syncAssinaturaPagamentosMercadoPago(assinatura);
        } catch {
          // O pagamento atual ja foi salvo; a conciliacao global sera tentada depois.
        }
      }

      return res.json({
        message: 'Webhook Mercado Pago processado.',
        assinaturaId: assinatura?.id || null,
        pagamentoId: pagamento?.id || null,
      });
    } catch (error) {
      if (isExternalResourceLookupError(error)) {
        return res.json({
          message: 'Webhook Mercado Pago recebido, mas o recurso externo nao foi encontrado.',
          type: eventType,
          action: eventAction,
          eventId,
        });
      }

      return res.status(error.statusCode || 500).json({
        message: error.message || 'Erro ao processar webhook Mercado Pago',
      });
    }
  },
};
