const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { Assinatura, PagamentoAssinatura, Usuario } = require('../models');
const {
  cancelMercadoPagoPreapproval,
  createMercadoPagoPreapproval,
  getMercadoPagoPreapproval,
  updateMercadoPagoPreapprovalAmount,
} = require('../services/mercadoPagoService');
const { getPlano } = require('../services/planosService');
const { getPublicAppUrl } = require('../services/urlService');

const MIN_MERCADO_PAGO_CHARGE_CENTAVOS = 100;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getStatusFromPreapproval(preapprovalStatus) {
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

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date, months) {
  const next = new Date(date);
  const originalDay = next.getDate();

  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== originalDay) {
    next.setDate(0);
  }

  return next;
}

function getEstimatedNextPaymentDate(assinatura) {
  const baseValue = assinatura?.ativada_em || assinatura?.iniciada_em || assinatura?.createdAt || assinatura?.created_at;
  const baseDate = toDate(baseValue);

  if (!baseDate) {
    return addMonths(new Date(), 1);
  }

  let nextDate = addMonths(baseDate, 1);
  const now = new Date();

  while (nextDate <= now) {
    nextDate = addMonths(nextDate, 1);
  }

  return nextDate;
}

function getFutureNextPaymentDate(assinatura) {
  const currentNextPaymentDate = toDate(assinatura?.proximo_pagamento_em);

  if (currentNextPaymentDate && currentNextPaymentDate > new Date()) {
    return currentNextPaymentDate;
  }

  return getEstimatedNextPaymentDate(assinatura);
}

function getCycleStartDate(assinatura, nextPaymentDate) {
  const previousCycle = addMonths(nextPaymentDate, -1);
  const activatedAt = toDate(assinatura?.ativada_em || assinatura?.iniciada_em || assinatura?.createdAt || assinatura?.created_at);

  if (!activatedAt || activatedAt > previousCycle) {
    return activatedAt || previousCycle;
  }

  return previousCycle;
}

function calculateProrationCredit(assinaturaAtual, novoPlano) {
  const now = new Date();
  const nextPaymentDate = toDate(assinaturaAtual.proximo_pagamento_em) || getEstimatedNextPaymentDate(assinaturaAtual);
  const cycleStartDate = getCycleStartDate(assinaturaAtual, nextPaymentDate);

  if (!nextPaymentDate || nextPaymentDate <= now || !cycleStartDate || cycleStartDate >= nextPaymentDate) {
    return {
      creditoRateioCentavos: 0,
      proximoPagamentoAtual: nextPaymentDate,
      valorPrimeiroPagamentoCentavos: novoPlano.valor_centavos,
    };
  }

  const cycleMs = nextPaymentDate.getTime() - cycleStartDate.getTime();
  const remainingMs = Math.max(nextPaymentDate.getTime() - now.getTime(), 0);
  const rawCredit = Math.round(assinaturaAtual.valor_centavos * (remainingMs / cycleMs));
  const maxCredit = Math.max(novoPlano.valor_centavos - MIN_MERCADO_PAGO_CHARGE_CENTAVOS, 0);
  const creditoRateioCentavos = Math.min(Math.max(rawCredit, 0), maxCredit);

  return {
    creditoRateioCentavos,
    proximoPagamentoAtual: nextPaymentDate,
    valorPrimeiroPagamentoCentavos: Math.max(novoPlano.valor_centavos - creditoRateioCentavos, MIN_MERCADO_PAGO_CHARGE_CENTAVOS),
  };
}

async function abandonPendingSubscriptions(usuarioId, exceptId = null) {
  const where = {
    usuario_id: usuarioId,
    status: 'pendente',
  };

  if (exceptId) {
    where.id = { [Op.ne]: exceptId };
  }

  await Assinatura.update(
    {
      status: 'abandonada',
      cancelada_em: new Date(),
    },
    { where }
  );
}

async function syncAssinaturaFromMercadoPago(assinatura) {
  if (!assinatura?.mercado_pago_preapproval_id) {
    return {
      assinatura,
      mercadoPagoStatus: null,
      synced: false,
    };
  }

  const preapproval = await getMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
  const nextStatus = getStatusFromPreapproval(preapproval?.status);
  const nextPaymentDate = toDate(preapproval?.next_payment_date);
  let shouldSave = false;

  if (nextStatus && assinatura.status !== nextStatus) {
    assinatura.status = nextStatus;
    shouldSave = true;

    if (nextStatus === 'ativa' && !assinatura.ativada_em) {
      assinatura.ativada_em = new Date();
    }

    if (['cancelada', 'pagamento_falhou'].includes(nextStatus) && !assinatura.cancelada_em) {
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

  return {
    assinatura,
    mercadoPagoStatus: preapproval?.status || null,
    synced: true,
  };
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
        [Op.in]: ['approved', 'accredited', 'paid', 'authorized'],
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
  await assinatura.save();
}

async function finalizeActivatedSubscription(assinatura) {
  if (!assinatura || assinatura.status !== 'ativa') {
    return;
  }

  try {
    await normalizeRecurringAmountIfNeeded(assinatura);
  } catch {
    // A normalização será tentada novamente pelo webhook ou próxima consulta.
  }

  if (!assinatura.assinatura_anterior_id) {
    return;
  }

  const assinaturaAnterior = await Assinatura.findOne({
    where: {
      id: assinatura.assinatura_anterior_id,
      usuario_id: assinatura.usuario_id,
      status: 'ativa',
    },
  });

  if (!assinaturaAnterior) {
    return;
  }

  if (assinaturaAnterior.mercado_pago_preapproval_id) {
    try {
      await cancelMercadoPagoPreapproval(assinaturaAnterior.mercado_pago_preapproval_id);
    } catch {
      // O acesso novo já foi aprovado; a tentativa global de cancelamento cobre o próximo ciclo.
    }
  }

  assinaturaAnterior.status = 'substituida';
  assinaturaAnterior.cancelada_em = assinaturaAnterior.cancelada_em || new Date();
  await assinaturaAnterior.save();
}

module.exports = {
  async createCheckout(req, res) {
    const email = normalizeEmail(req.body?.email);
    const planoId = req.body?.plano || req.body?.planoId || req.body?.planId;
    const plano = getPlano(planoId);

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Informe um e-mail válido para iniciar o checkout.' });
    }

    if (!plano) {
      return res.status(400).json({ message: 'Escolha um plano valido para continuar.' });
    }

    const usuario = await Usuario.findOne({ where: { email } });

    if (!usuario) {
      return res.status(404).json({ message: 'Crie sua conta antes de iniciar o pagamento.' });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ message: 'Usuario inativo' });
    }

    if (!usuario.email_verificado_em) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirme seu e-mail antes de contratar um plano.',
      });
    }

    await abandonPendingSubscriptions(usuario.id);

    const referenciaExterna = `caixa-agil-assinatura-${plano.id}-${randomUUID()}`;
    const assinatura = await Assinatura.create({
      usuario_id: usuario.id,
      plano: plano.id,
      status: 'pendente',
      valor_centavos: plano.valor_centavos,
      valor_recorrente_centavos: plano.valor_centavos,
      valor_primeiro_pagamento_centavos: plano.valor_centavos,
      moeda: 'BRL',
      referencia_externa: referenciaExterna,
      tipo_movimento: 'contratacao',
      iniciada_em: new Date(),
    });

    try {
      const checkout = await createMercadoPagoPreapproval({
        appUrl: getPublicAppUrl(req),
        acao: 'contratar',
        email,
        plano,
        referenciaExterna,
      });

      assinatura.mercado_pago_preapproval_id = checkout.id;
      assinatura.checkout_url = checkout.initPoint;
      assinatura.email_pagador = checkout.emailPagador;
      await assinatura.save();

      return res.status(201).json({
        checkoutUrl: checkout.initPoint,
        assinaturaId: assinatura.id,
        mercadoPagoPreapprovalId: checkout.id,
      });
    } catch (error) {
      assinatura.status = 'falha';
      await assinatura.save();

      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível iniciar o checkout.',
      });
    }
  },

  async showStatus(req, res) {
    try {
      const assinaturaId = Number(req.params.id);
      const email = normalizeEmail(req.query?.email || req.body?.email);

      if (!Number.isInteger(assinaturaId) || assinaturaId <= 0) {
        return res.status(400).json({ message: 'Assinatura inválida.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      const assinatura = await Assinatura.findByPk(assinaturaId, {
        include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'email'] }],
      });

      if (!assinatura || assinatura.usuario?.email !== email) {
        return res.status(404).json({ message: 'Assinatura não encontrada.' });
      }

      const syncResult = await syncAssinaturaFromMercadoPago(assinatura);

      if (syncResult.assinatura.status === 'ativa') {
        await finalizeActivatedSubscription(syncResult.assinatura);
        await abandonPendingSubscriptions(syncResult.assinatura.usuario_id, syncResult.assinatura.id);
      }

      return res.json({
        ativa: syncResult.assinatura.status === 'ativa',
        assinaturaId: syncResult.assinatura.id,
        status: syncResult.assinatura.status,
        mercadoPagoStatus: syncResult.mercadoPagoStatus,
        plano: syncResult.assinatura.plano,
        synced: syncResult.synced,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível consultar a assinatura.',
      });
    }
  },

  async list(req, res) {
    try {
      const assinaturas = await Assinatura.findAll({
        where: { usuario_id: req.user.id },
        include: [
          { model: Usuario, as: 'usuario', attributes: ['id', 'email'] },
          {
            model: PagamentoAssinatura,
            as: 'pagamentos',
            separate: true,
            order: [['processado_em', 'DESC']],
            limit: 12,
          },
        ],
        order: [['id', 'DESC']],
      });

      return res.json(assinaturas);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar assinaturas', detail: error.message });
    }
  },

  async listPayments(req, res) {
    try {
      const assinatura = await Assinatura.findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!assinatura) {
        return res.status(404).json({ message: 'Assinatura não encontrada.' });
      }

      const pagamentos = await PagamentoAssinatura.findAll({
        where: { assinatura_id: assinatura.id },
        order: [
          ['processado_em', 'DESC'],
          ['id', 'DESC'],
        ],
      });

      return res.json(pagamentos);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar pagamentos', detail: error.message });
    }
  },

  async createManagementCheckout(req, res) {
    try {
      const acao = String(req.body?.acao || '').trim();
      const usuario = await Usuario.findByPk(req.user.id);

      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      const assinaturaAtual = await Assinatura.findOne({
        where: {
          usuario_id: req.user.id,
          status: 'ativa',
        },
        order: [['id', 'DESC']],
      });

      if (!assinaturaAtual) {
        return res.status(403).json({ message: 'Assinatura ativa obrigatória.' });
      }

      const planoId =
        acao === 'trocar_pagamento'
          ? assinaturaAtual.plano
          : req.body?.plano || req.body?.planoId || req.body?.planId;
      const plano = getPlano(planoId);

      if (!['mudar_plano', 'trocar_pagamento'].includes(acao)) {
        return res.status(400).json({ message: 'Escolha uma ação de assinatura válida.' });
      }

      if (!plano) {
        return res.status(400).json({ message: 'Escolha um plano válido.' });
      }

      if (acao === 'mudar_plano' && plano.id === assinaturaAtual.plano) {
        return res.status(400).json({ message: 'Escolha um plano diferente do atual.' });
      }

      await abandonPendingSubscriptions(req.user.id);

      const rateio =
        acao === 'mudar_plano'
          ? calculateProrationCredit(assinaturaAtual, plano)
          : {
              creditoRateioCentavos: 0,
              proximoPagamentoAtual: getFutureNextPaymentDate(assinaturaAtual),
              valorPrimeiroPagamentoCentavos: plano.valor_centavos,
            };
      const startDate = acao === 'trocar_pagamento' ? rateio.proximoPagamentoAtual : null;
      const referenciaExterna = `caixa-agil-assinatura-${acao}-${plano.id}-${randomUUID()}`;
      const assinatura = await Assinatura.create({
        usuario_id: req.user.id,
        plano: plano.id,
        status: 'pendente',
        valor_centavos: plano.valor_centavos,
        valor_recorrente_centavos: plano.valor_centavos,
        valor_primeiro_pagamento_centavos: rateio.valorPrimeiroPagamentoCentavos,
        credito_rateio_centavos: rateio.creditoRateioCentavos,
        normalizar_valor_apos_primeiro_pagamento:
          acao === 'mudar_plano' && rateio.valorPrimeiroPagamentoCentavos !== plano.valor_centavos,
        moeda: 'BRL',
        referencia_externa: referenciaExterna,
        tipo_movimento: acao,
        assinatura_anterior_id: assinaturaAtual.id,
        iniciada_em: new Date(),
      });

      try {
        const checkout = await createMercadoPagoPreapproval({
          acao,
          appUrl: getPublicAppUrl(req),
          creditoRateioCentavos: rateio.creditoRateioCentavos,
          email: usuario.email,
          plano,
          referenciaExterna,
          startDate,
          transactionAmountCentavos: rateio.valorPrimeiroPagamentoCentavos,
          valorRecorrenteCentavos: plano.valor_centavos,
        });

        assinatura.mercado_pago_preapproval_id = checkout.id;
        assinatura.checkout_url = checkout.initPoint;
        assinatura.email_pagador = checkout.emailPagador;
        await assinatura.save();

        return res.status(201).json({
          acao,
          assinaturaId: assinatura.id,
          checkoutUrl: checkout.initPoint,
          creditoRateioCentavos: rateio.creditoRateioCentavos,
          mercadoPagoPreapprovalId: checkout.id,
          proximoPagamentoAtual: rateio.proximoPagamentoAtual,
          valorPrimeiroPagamentoCentavos: rateio.valorPrimeiroPagamentoCentavos,
          valorRecorrenteCentavos: plano.valor_centavos,
        });
      } catch (error) {
        assinatura.status = 'falha';
        await assinatura.save();

        return res.status(error.statusCode || 500).json({
          message: error.message || 'Não foi possível iniciar o checkout.',
        });
      }
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível gerenciar a assinatura.',
      });
    }
  },
};
