const { Op } = require('sequelize');
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
  syncAssinaturaPagamentosMercadoPago,
  upsertPagamentoAssinatura,
} = require('../services/pagamentosAssinaturaService');
const {
  applyDueScheduledChangeForSubscription,
  cancelScheduledChangesForSubscription,
} = require('../services/alteracoesAssinaturaService');

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getEventType(req) {
  return String(req.body?.type || req.body?.topic || req.query?.type || req.query?.topic || '').trim();
}

function getEventAction(req) {
  return String(req.body?.action || req.query?.action || '').trim();
}

function getEventDataId(req) {
  return String(req.body?.data?.id || req.query?.['data.id'] || req.query?.id || req.body?.id || '').trim();
}

function getAssinaturaStatus(paymentStatus) {
  const normalized = String(paymentStatus || '').toLowerCase();

  if (['approved', 'accredited', 'paid', 'processed'].includes(normalized)) {
    return 'ativa';
  }

  if (['cancelled', 'canceled'].includes(normalized)) {
    return 'cancelada';
  }

  if (['rejected', 'refunded', 'charged_back'].includes(normalized)) {
    return 'pagamento_falhou';
  }

  if (['pending', 'in_process', 'authorized'].includes(normalized)) {
    return 'pendente';
  }

  return null;
}

function getAssinaturaStatusFromPreapproval(preapprovalStatus) {
  const normalized = String(preapprovalStatus || '').toLowerCase();

  if (normalized === 'authorized') {
    return 'ativa';
  }

  if (['cancelled', 'canceled', 'paused'].includes(normalized)) {
    return 'cancelada';
  }

  if (['rejected', 'inactive'].includes(normalized)) {
    return 'pagamento_falhou';
  }

  if (['pending', 'in_process'].includes(normalized)) {
    return 'pendente';
  }

  return null;
}

function isPreapprovalEvent(eventType, eventAction) {
  const normalizedType = String(eventType || '').toLowerCase();
  const normalizedAction = String(eventAction || '').toLowerCase();

  return normalizedType === 'subscription_preapproval' || normalizedAction.startsWith('subscription_preapproval.');
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
  if (
    !assinatura.normalizar_valor_apos_primeiro_pagamento ||
    assinatura.valor_normalizado_em ||
    !assinatura.mercado_pago_preapproval_id ||
    !assinatura.valor_recorrente_centavos
  ) {
    return;
  }

  const confirmedPaymentCount = await PagamentoAssinatura.count({
    where: {
      assinatura_id: assinatura.id,
      status: {
        [Op.in]: ['approved', 'accredited', 'paid', 'authorized', 'processed'],
      },
    },
  });

  if (confirmedPaymentCount === 0) {
    return;
  }

  await updateMercadoPagoPreapprovalAmount(assinatura.mercado_pago_preapproval_id, {
    valorCentavos: assinatura.valor_recorrente_centavos,
    moeda: assinatura.moeda || 'BRL',
  });

  assinatura.valor_normalizado_em = new Date();
  assinatura.normalizar_valor_apos_primeiro_pagamento = false;
}

async function cancelPreviousActiveSubscriptions(assinatura) {
  const assinaturasAnteriores = await Assinatura.findAll({
    where: {
      id: { [Op.ne]: assinatura.id },
      usuario_id: assinatura.usuario_id,
      status: 'ativa',
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

    assinaturaAnterior.status = 'substituida';
    assinaturaAnterior.cancelada_em = assinaturaAnterior.cancelada_em || new Date();
    await cancelScheduledChangesForSubscription(assinaturaAnterior.id, 'assinatura_substituida');
    await assinaturaAnterior.save();
  }
}

async function updateAssinaturaFromPreapproval(assinatura, preapproval) {
  if (!assinatura) {
    return;
  }

  const assinaturaStatus = getAssinaturaStatusFromPreapproval(preapproval?.status);
  const nextPaymentDate = toDate(preapproval?.next_payment_date);
  let shouldSave = false;

  if (assinaturaStatus && assinatura.status !== assinaturaStatus) {
    assinatura.status = assinaturaStatus;
    shouldSave = true;

    if (assinaturaStatus === 'ativa' && !assinatura.ativada_em) {
      assinatura.ativada_em = new Date();
    }

    if (['cancelada', 'pagamento_falhou'].includes(assinaturaStatus) && !assinatura.cancelada_em) {
      assinatura.cancelada_em = new Date();
    }
  }

  if (nextPaymentDate && String(assinatura.proximo_pagamento_em || '') !== String(nextPaymentDate)) {
    assinatura.proximo_pagamento_em = nextPaymentDate;
    shouldSave = true;
  }

  if (shouldSave) {
    await assinatura.save();
  }

  if (assinatura.status === 'ativa') {
    const appliedChanges = await applyDueScheduledChangeForSubscription(assinatura);

    if (appliedChanges.length > 0) {
      await assinatura.reload();
    }

    await cancelPreviousActiveSubscriptions(assinatura);
  }
}

async function updateAssinaturaStatus(assinatura, paymentStatus) {
  if (!assinatura) {
    return;
  }

  const assinaturaStatus = getAssinaturaStatus(paymentStatus);

  if (!assinaturaStatus) {
    return;
  }

  assinatura.status = assinaturaStatus;

  if (assinaturaStatus === 'ativa' && !assinatura.ativada_em) {
    assinatura.ativada_em = new Date();
  }

  if (assinaturaStatus === 'cancelada' && !assinatura.cancelada_em) {
    assinatura.cancelada_em = new Date();
  }

  if (assinatura.mercado_pago_preapproval_id) {
    try {
      const preapproval = await getMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
      const nextPaymentDate = toDate(preapproval?.next_payment_date);

      if (nextPaymentDate) {
        assinatura.proximo_pagamento_em = nextPaymentDate;
      }
    } catch {
      // O webhook deve continuar processando o status mesmo se a consulta da assinatura falhar.
    }
  }

  await assinatura.save();

  if (assinaturaStatus === 'ativa') {
    try {
      await normalizeRecurringAmountIfNeeded(assinatura);
      await assinatura.save();
    } catch {
      // A normalização será tentada novamente no próximo webhook ou consulta de status.
    }

    const appliedChanges = await applyDueScheduledChangeForSubscription(assinatura);

    if (appliedChanges.length > 0) {
      await assinatura.reload();
    }

    await cancelPreviousActiveSubscriptions(assinatura);
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
          return res.status(202).json({
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
        return res.status(202).json({
          message: 'Evento Mercado Pago recebido, mas nao usado por este fluxo.',
          type: eventType,
        });
      }

      const assinatura = await findAssinatura(paymentData);
      const pagamento = await upsertPagamentoAssinatura(paymentData, assinatura);

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
      if (error.statusCode === 404) {
        return res.status(202).json({
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
