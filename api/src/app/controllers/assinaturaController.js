const { randomBytes, randomUUID } = require('crypto');
const { Op } = require('sequelize');
const sequelize = require('../../database');
const { Assinatura, CodigoAssinatura, PagamentoAssinatura, Usuario } = require('../models');
const {
  cancelMercadoPagoPreapproval,
  createMercadoPagoPreapproval,
  getMercadoPagoPreapproval,
  updateMercadoPagoPreapprovalAmount,
} = require('../services/mercadoPagoService');
const {
  buildPlanoFromCodigoAssinatura,
  findCodigoAssinaturaDisponivel,
  hashCodigoAssinatura,
  normalizeCodigoAssinatura,
} = require('../services/codigosAssinaturaService');
const { buildPlanoSnapshot, getPlano, listarPlanosPublicos } = require('../services/planosService');
const { getEntitlements } = require('../services/assinaturaEntitlementsService');
const { isEmailVerified } = require('../services/emailVerificationPolicyService');
const {
  applyDueScheduledChangeForSubscription,
  applyDueScheduledChanges,
  attachScheduledChanges,
  cancelScheduledChangesForSubscription,
  scheduleDowngrade,
} = require('../services/alteracoesAssinaturaService');
const {
  syncAssinaturaPagamentosMercadoPago,
} = require('../services/pagamentosAssinaturaService');
const {
  findSubscriptionForPlatformAccess,
  hasSubscriptionActivationEvidence,
} = require('../services/assinaturaAccessService');
const { getPublicAppUrl } = require('../services/urlService');

const MIN_MERCADO_PAGO_CHARGE_CENTAVOS = 100;
const CHECKOUT_TOKEN_BYTES = 32;
const CHECKOUT_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function normalizeCheckoutToken(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getCodigoAssinaturaFromBody(body) {
  return normalizeCodigoAssinatura(
    body?.codigo_assinatura || body?.codigoAssinatura || body?.subscriptionCode || body?.codigo
  );
}

function isValidCheckoutToken(token) {
  return /^[A-Za-z0-9_-]{32,128}$/.test(token);
}

function createCheckoutTokenPayload() {
  return {
    checkout_token: randomBytes(CHECKOUT_TOKEN_BYTES).toString('base64url'),
    checkout_token_expira_em: new Date(Date.now() + CHECKOUT_TOKEN_TTL_MS),
  };
}

function isCheckoutTokenCurrent(assinatura) {
  const token = normalizeCheckoutToken(assinatura?.checkout_token);
  const expiresAt = toDate(assinatura?.checkout_token_expira_em);

  return isValidCheckoutToken(token) && expiresAt && expiresAt > new Date();
}

function getStatusFromPreapproval(preapprovalStatus, assinatura = null) {
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

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getSubscriptionInterval(assinatura) {
  const snapshot = assinatura?.plano_snapshot || {};
  const intervalo = snapshot.intervalo === 'dias' ? 'dias' : 'mensal';
  const quantidade = Number(snapshot.intervalo_quantidade || 1);

  return {
    intervalo,
    quantidade: Number.isInteger(quantidade) && quantidade > 0 ? quantidade : 1,
  };
}

function addSubscriptionInterval(date, assinatura, direction = 1) {
  const { intervalo, quantidade } = getSubscriptionInterval(assinatura);
  const amount = quantidade * direction;

  return intervalo === 'dias' ? addDays(date, amount) : addMonths(date, amount);
}

function getEstimatedNextPaymentDate(assinatura) {
  const baseValue = assinatura?.ativada_em || assinatura?.iniciada_em || assinatura?.createdAt || assinatura?.created_at;
  const baseDate = toDate(baseValue);

  if (!baseDate) {
    return addSubscriptionInterval(new Date(), assinatura);
  }

  let nextDate = addSubscriptionInterval(baseDate, assinatura);
  const now = new Date();

  while (nextDate <= now) {
    nextDate = addSubscriptionInterval(nextDate, assinatura);
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

function getFutureStartDate(value) {
  const date = toDate(value);

  if (!date || date <= new Date()) {
    return null;
  }

  return date;
}

function getFirstChargeStartDate(plano) {
  const trialDias = Number(plano?.trial_dias || 0);

  if (Number.isInteger(trialDias) && trialDias > 0) {
    return addDays(new Date(), trialDias);
  }

  return getFutureStartDate(plano?.cobranca_inicio_em);
}

function getCycleStartDate(assinatura, nextPaymentDate) {
  const previousCycle = addSubscriptionInterval(nextPaymentDate, assinatura, -1);
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

function isSubscriptionOverdueForPayment(assinatura, now = new Date()) {
  const status = String(assinatura?.status || '').toLowerCase();
  const currentNextPaymentDate = toDate(assinatura?.proximo_pagamento_em);

  if (['falha', 'pagamento_falhou', 'pausada'].includes(status)) {
    return true;
  }

  return Boolean(currentNextPaymentDate && currentNextPaymentDate <= now);
}

function calculatePaymentMethodChangeCharge(assinaturaAtual, plano) {
  const proximoPagamentoAtual = toDate(assinaturaAtual.proximo_pagamento_em) || getEstimatedNextPaymentDate(assinaturaAtual);
  const cobrancaImediata = isSubscriptionOverdueForPayment(assinaturaAtual);

  return {
    creditoRateioCentavos: 0,
    proximoPagamentoAtual,
    valorPrimeiroPagamentoCentavos: plano.valor_centavos,
    cobrancaImediata,
  };
}

async function abandonPendingSubscriptions(usuarioId, exceptId = null, options = {}) {
  const where = {
    usuario_id: usuarioId,
    status: 'pendente',
  };
  const transaction = options.transaction || null;

  if (exceptId) {
    where.id = { [Op.ne]: exceptId };
  }

  const assinaturasPendentes = await Assinatura.findAll({
    attributes: ['id', 'mercado_pago_preapproval_id'],
    where,
    transaction,
  });

  await Assinatura.update(
    {
      status: 'abandonada',
      cancelada_em: new Date(),
    },
    { where, transaction }
  );

  if (transaction || options.cancelMercadoPago === false) {
    return;
  }

  for (const assinatura of assinaturasPendentes) {
    if (!assinatura.mercado_pago_preapproval_id) {
      continue;
    }

    try {
      await cancelMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
    } catch {
      // O abandono local nao deve impedir a criacao de um novo checkout.
    }
  }
}

async function ensureCheckoutTokenForSubscription(assinatura) {
  if (isCheckoutTokenCurrent(assinatura)) {
    return assinatura;
  }

  Object.assign(assinatura, createCheckoutTokenPayload());
  await assinatura.save();

  return assinatura;
}

async function findUsedSubscriptionCodeForUser(codigo, usuarioId) {
  const normalized = normalizeCodigoAssinatura(codigo);

  if (!normalized || !usuarioId) {
    return null;
  }

  return CodigoAssinatura.findOne({
    where: {
      codigo_hash: hashCodigoAssinatura(normalized),
      usado_por_usuario_id: usuarioId,
      usos_realizados: {
        [Op.gt]: 0,
      },
    },
    order: [['id', 'DESC']],
  });
}

async function findReusableCustomCheckout(usuario, codigo) {
  const codigoAssinatura = await findUsedSubscriptionCodeForUser(codigo, usuario?.id);

  if (!codigoAssinatura) {
    return null;
  }

  const assinatura = await Assinatura.findOne({
    where: {
      usuario_id: usuario.id,
      plano: codigoAssinatura.plano_id,
      tipo_movimento: {
        [Op.in]: ['contratacao_personalizada', 'contratacao_personalizada_gratis'],
      },
      status: {
        [Op.in]: ['pendente', 'ativa'],
      },
    },
    order: [['id', 'DESC']],
  });

  if (!assinatura) {
    return null;
  }

  return {
    assinatura,
    codigoAssinatura,
  };
}

function createInvalidSubscriptionCodeError() {
  const error = new Error('Codigo de assinatura invalido ou ja utilizado.');
  error.statusCode = 400;
  return error;
}

async function reserveSubscriptionCodeForUser(codigoInput, usuarioId, options = {}) {
  const transaction = options.transaction || null;
  const codigoAssinatura = await findCodigoAssinaturaDisponivel(codigoInput, {
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
    transaction,
  });
  const planoPersonalizado = buildPlanoFromCodigoAssinatura(codigoAssinatura);

  if (!codigoAssinatura || !planoPersonalizado) {
    throw createInvalidSubscriptionCodeError();
  }

  await codigoAssinatura.update(
    {
      ativo: false,
      usos_realizados: 1,
      usado_por_usuario_id: usuarioId,
      usado_em: new Date(),
    },
    { transaction }
  );

  return {
    codigoAssinatura,
    planoPersonalizado,
  };
}

async function restoreSubscriptionCodeForUser(codigoAssinaturaId, usuarioId) {
  if (!codigoAssinaturaId || !usuarioId) {
    return;
  }

  await CodigoAssinatura.update(
    {
      ativo: true,
      usos_realizados: 0,
      usado_por_usuario_id: null,
      usado_em: null,
    },
    {
      where: {
        id: codigoAssinaturaId,
        usado_por_usuario_id: usuarioId,
      },
    }
  );
}

async function buildReusableCheckoutResponse(assinatura) {
  let assinaturaAtual = assinatura;

  try {
    const syncResult = await syncAssinaturaFromMercadoPago(assinatura);
    assinaturaAtual = syncResult.assinatura;
  } catch {
    // Se ja existe checkout local pendente, uma oscilacao pontual do Mercado Pago nao deve impedir reabertura.
  }

  if (assinaturaAtual.status === 'ativa') {
    await finalizeActivatedSubscription(assinaturaAtual);

    return {
      assinaturaAtiva: true,
      checkoutToken: assinaturaAtual.checkout_token,
      checkoutUrl: null,
      gratuito: assinaturaAtual.tipo_movimento === 'contratacao_personalizada_gratis',
      plano: assinaturaAtual.plano_snapshot,
      message: 'Assinatura já confirmada.',
    };
  }

  if (assinaturaAtual.status !== 'pendente' || !assinaturaAtual.checkout_url) {
    return null;
  }

  await ensureCheckoutTokenForSubscription(assinaturaAtual);

  return {
    checkoutUrl: assinaturaAtual.checkout_url,
    checkoutToken: assinaturaAtual.checkout_token,
    reused: true,
    message: 'Checkout pendente reaberto.',
  };
}

async function syncAssinaturaFromMercadoPago(assinatura) {
  if (!assinatura?.mercado_pago_preapproval_id) {
    if (assinatura?.status === 'ativa') {
      const appliedChanges = await applyDueScheduledChangeForSubscription(assinatura);

      if (appliedChanges.length > 0) {
        await assinatura.reload();
      }
    }

    return {
      assinatura,
      mercadoPagoStatus: null,
      synced: false,
    };
  }

  const preapproval = await getMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
  const nextStatus = getStatusFromPreapproval(preapproval?.status, assinatura);
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

  if (assinatura.status === 'ativa') {
    const appliedChanges = await applyDueScheduledChangeForSubscription(assinatura);

    if (appliedChanges.length > 0) {
      await assinatura.reload();
    }
  }

  try {
    await syncAssinaturaPagamentosMercadoPago(assinatura);
  } catch {
    // A consulta de status nao deve falhar se apenas a conciliacao de pagamentos oscilar.
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
      status: {
        [Op.in]: ['ativa', 'pagamento_falhou'],
      },
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

  await cancelScheduledChangesForSubscription(assinaturaAnterior.id, 'assinatura_substituida');
  assinaturaAnterior.status = 'substituida';
  assinaturaAnterior.cancelada_em = assinaturaAnterior.cancelada_em || new Date();
  await assinaturaAnterior.save();
}

async function getPublicStatusPayload(assinatura) {
  const syncResult = await syncAssinaturaFromMercadoPago(assinatura);

  if (syncResult.assinatura.status === 'ativa') {
    await finalizeActivatedSubscription(syncResult.assinatura);
    await abandonPendingSubscriptions(syncResult.assinatura.usuario_id, syncResult.assinatura.id);
  }

  return {
    ativa: syncResult.assinatura.status === 'ativa',
    status: syncResult.assinatura.status,
    mercadoPagoStatus: syncResult.mercadoPagoStatus,
    plano: syncResult.assinatura.plano,
    synced: syncResult.synced,
  };
}

async function reloadPagamentosAssinatura(assinatura) {
  if (!assinatura?.id || typeof assinatura.setDataValue !== 'function') {
    return;
  }

  const pagamentos = await PagamentoAssinatura.findAll({
    where: { assinatura_id: assinatura.id },
    order: [['processado_em', 'DESC']],
    limit: 12,
  });

  assinatura.setDataValue('pagamentos', pagamentos);
}

async function syncPagamentosAssinaturaSilenciosamente(assinatura) {
  if (!assinatura?.mercado_pago_preapproval_id && !assinatura?.referencia_externa) {
    return;
  }

  try {
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    await reloadPagamentosAssinatura(assinatura);
  } catch {
    // A listagem deve continuar exibindo o historico local mesmo se o Mercado Pago oscilar.
  }
}

async function findCheckoutSubscriptionByToken(token, extraWhere = {}) {
  if (!isValidCheckoutToken(token)) {
    return null;
  }

  return Assinatura.findOne({
    where: {
      ...extraWhere,
      checkout_token: token,
      checkout_token_expira_em: {
        [Op.gt]: new Date(),
      },
    },
    include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'email'] }],
  });
}

module.exports = {
  async listPlans(req, res) {
    try {
      const planos = await listarPlanosPublicos();

      return res.json({ planos });
    } catch (error) {
      return res.status(500).json({
        message: error.message || 'Não foi possível carregar os planos.',
      });
    }
  },

  async validateSubscriptionCode(req, res) {
    try {
      const codigo = getCodigoAssinaturaFromBody(req.body || req.query || {});
      const codigoAssinatura = await findCodigoAssinaturaDisponivel(codigo);
      const plano = buildPlanoFromCodigoAssinatura(codigoAssinatura);

      if (!codigoAssinatura || !plano) {
        const email = normalizeEmail(req.body?.email || req.query?.email);
        const usuario = isValidEmail(email) ? await Usuario.findOne({ where: { email } }) : null;
        const reusableCheckout = usuario ? await findReusableCustomCheckout(usuario, codigo) : null;

        if (reusableCheckout?.assinatura?.plano_snapshot) {
          return res.json({
            codigo: reusableCheckout.codigoAssinatura.codigo,
            checkout_pendente: reusableCheckout.assinatura.status === 'pendente',
            plano: reusableCheckout.assinatura.plano_snapshot,
          });
        }

        return res.status(404).json({ message: 'Codigo de assinatura invalido ou ja utilizado.' });
      }

      return res.json({
        codigo: codigoAssinatura.codigo,
        plano,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Nao foi possivel validar o codigo de assinatura.',
      });
    }
  },

  async createCheckout(req, res) {
    const email = normalizeEmail(req.body?.email);
    const codigoAssinaturaInput = getCodigoAssinaturaFromBody(req.body);

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Informe um e-mail válido para iniciar o checkout.' });
    }

    const usuario = await Usuario.findOne({ where: { email } });

    if (!usuario) {
      return res.status(404).json({ message: 'Crie sua conta antes de iniciar o pagamento.' });
    }

    if (!usuario.ativo) {
      return res.status(403).json({ message: 'Usuario inativo' });
    }

    if (!isEmailVerified(usuario)) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirme seu e-mail antes de contratar um plano.',
      });
    }

    if (codigoAssinaturaInput) {
      let reservedResult = null;
      const reusableCheckout = await findReusableCustomCheckout(usuario, codigoAssinaturaInput);

      if (reusableCheckout?.assinatura) {
        const response = await buildReusableCheckoutResponse(reusableCheckout.assinatura);

        if (response) {
          return res.json(response);
        }
      }

      try {
        reservedResult = await sequelize.transaction(async transaction => {
          const codigoAssinatura = await findCodigoAssinaturaDisponivel(codigoAssinaturaInput, {
            lock: transaction.LOCK.UPDATE,
            transaction,
          });
          const planoPersonalizado = buildPlanoFromCodigoAssinatura(codigoAssinatura);

          if (!codigoAssinatura || !planoPersonalizado) {
            const error = new Error('Codigo de assinatura invalido ou ja utilizado.');
            error.statusCode = 400;
            throw error;
          }

          await abandonPendingSubscriptions(usuario.id, null, { transaction });

          const referenciaExterna = `caixa-agil-assinatura-codigo-${planoPersonalizado.id}-${randomUUID()}`;
          const now = new Date();
          const primeiraCobrancaEm = getFirstChargeStartDate(planoPersonalizado);
          const assinatura = await Assinatura.create(
            {
              usuario_id: usuario.id,
              plano: planoPersonalizado.id,
              plano_versao_id: planoPersonalizado.plano_versao_id || null,
              plano_snapshot: buildPlanoSnapshot(planoPersonalizado),
              status: planoPersonalizado.gratuito ? 'ativa' : 'pendente',
              valor_centavos: planoPersonalizado.valor_centavos,
              valor_recorrente_centavos: planoPersonalizado.valor_centavos,
              valor_primeiro_pagamento_centavos: planoPersonalizado.valor_centavos,
              moeda: planoPersonalizado.moeda || 'BRL',
              referencia_externa: referenciaExterna,
              ...createCheckoutTokenPayload(),
              tipo_movimento: planoPersonalizado.gratuito
                ? 'contratacao_personalizada_gratis'
                : 'contratacao_personalizada',
              iniciada_em: now,
              ativada_em: planoPersonalizado.gratuito ? now : null,
              proximo_pagamento_em: planoPersonalizado.gratuito
                ? null
                : primeiraCobrancaEm,
            },
            { transaction }
          );

          await codigoAssinatura.update(
            {
              ativo: false,
              usos_realizados: 1,
              usado_por_usuario_id: usuario.id,
              usado_em: now,
            },
            { transaction }
          );

          return {
            assinatura,
            codigoAssinaturaId: codigoAssinatura.id,
            planoPersonalizado,
            primeiraCobrancaEm,
            referenciaExterna,
          };
        });

        if (reservedResult.planoPersonalizado.gratuito) {
          return res.status(201).json({
            assinaturaAtiva: true,
            checkoutToken: reservedResult.assinatura.checkout_token,
            checkoutUrl: null,
            gratuito: true,
            plano: reservedResult.assinatura.plano_snapshot,
            message: 'Plano personalizado gratuito ativado.',
          });
        }

        try {
          const checkout = await createMercadoPagoPreapproval({
            appUrl: getPublicAppUrl(req),
            acao: 'contratar',
            email,
            plano: reservedResult.planoPersonalizado,
            referenciaExterna: reservedResult.referenciaExterna,
            startDate: reservedResult.primeiraCobrancaEm,
          });

          reservedResult.assinatura.mercado_pago_preapproval_id = checkout.id;
          reservedResult.assinatura.checkout_url = checkout.initPoint;
          reservedResult.assinatura.email_pagador = checkout.emailPagador;
          await reservedResult.assinatura.save();

          return res.status(201).json({
            checkoutUrl: checkout.initPoint,
            checkoutToken: reservedResult.assinatura.checkout_token,
          });
        } catch (error) {
          reservedResult.assinatura.status = 'falha';
          await reservedResult.assinatura.save();
          await CodigoAssinatura.update(
            {
              ativo: true,
              usos_realizados: 0,
              usado_por_usuario_id: null,
              usado_em: null,
            },
            {
              where: {
                id: reservedResult.codigoAssinaturaId,
                usado_por_usuario_id: usuario.id,
              },
            }
          );

          return res.status(error.statusCode || 500).json({
            message: error.message || 'Nao foi possivel iniciar o checkout.',
          });
        }
      } catch (error) {
        return res.status(error.statusCode || 500).json({
          message: error.message || 'Nao foi possivel iniciar o checkout.',
        });
      }
    }

    const planoId = req.body?.plano || req.body?.planoId || req.body?.planId;
    const plano = await getPlano(planoId);

    if (!plano) {
      return res.status(400).json({ message: 'Escolha um plano valido para continuar.' });
    }

    await abandonPendingSubscriptions(usuario.id);

    const referenciaExterna = `caixa-agil-assinatura-${plano.id}-${randomUUID()}`;
    const assinatura = await Assinatura.create({
      usuario_id: usuario.id,
      plano: plano.id,
      plano_versao_id: plano.plano_versao_id || null,
      plano_snapshot: buildPlanoSnapshot(plano),
      status: 'pendente',
      valor_centavos: plano.valor_centavos,
      valor_recorrente_centavos: plano.valor_centavos,
      valor_primeiro_pagamento_centavos: plano.valor_centavos,
      moeda: 'BRL',
      referencia_externa: referenciaExterna,
      ...createCheckoutTokenPayload(),
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
        checkoutToken: assinatura.checkout_token,
      });
    } catch (error) {
      assinatura.status = 'falha';
      await assinatura.save();

      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível iniciar o checkout.',
      });
    }
  },

  async showCheckoutStatus(req, res) {
    try {
      const token = normalizeCheckoutToken(req.params.token || req.query?.checkout_token || req.query?.checkoutToken);
      const assinatura = await findCheckoutSubscriptionByToken(token);

      if (!assinatura) {
        return res.status(404).json({ message: 'Assinatura não encontrada.' });
      }

      return res.json(await getPublicStatusPayload(assinatura));
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível consultar a assinatura.',
      });
    }
  },

  async showStatus(req, res) {
    try {
      const assinaturaId = Number(req.params.id);
      const token = normalizeCheckoutToken(req.query?.checkout_token || req.query?.checkoutToken || req.body?.checkout_token || req.body?.checkoutToken);

      if (!Number.isInteger(assinaturaId) || assinaturaId <= 0) {
        return res.status(400).json({ message: 'Assinatura inválida.' });
      }

      const assinatura = await findCheckoutSubscriptionByToken(token, {
        id: assinaturaId,
      });

      if (!assinatura) {
        return res.status(404).json({ message: 'Assinatura não encontrada.' });
      }

      return res.json(await getPublicStatusPayload(assinatura));
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível consultar a assinatura.',
      });
    }
  },

  async list(req, res) {
    try {
      await applyDueScheduledChanges({ usuarioId: req.user.id });

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

      await Promise.all(assinaturas.map(syncPagamentosAssinaturaSilenciosamente));
      await attachScheduledChanges(assinaturas);

      return res.json(assinaturas);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar assinaturas', detail: error.message });
    }
  },

  async entitlements(req, res) {
    try {
      const entitlements = await getEntitlements(req.user.id);

      return res.json(entitlements);
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        code: error.code,
        message: error.message || 'Erro ao carregar permissões da assinatura.',
      });
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

      await syncPagamentosAssinaturaSilenciosamente(assinatura);

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
      const codigoAssinaturaInput = acao === 'mudar_plano' ? getCodigoAssinaturaFromBody(req.body) : '';
      await applyDueScheduledChanges({ usuarioId: req.user.id });
      const usuario = await Usuario.findByPk(req.user.id);

      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      const assinaturaAtual = await findSubscriptionForPlatformAccess(req.user.id);

      if (!assinaturaAtual) {
        return res.status(403).json({ message: 'Assinatura ativa obrigatória.' });
      }

      const assinaturaAtualExigeRegularizacao = isSubscriptionOverdueForPayment(assinaturaAtual);

      if (acao === 'mudar_plano' && (assinaturaAtual.status !== 'ativa' || assinaturaAtualExigeRegularizacao)) {
        return res.status(409).json({
          message: 'Regularize a forma de pagamento antes de mudar o plano.',
        });
      }

      const planoId =
        acao === 'trocar_pagamento'
          ? assinaturaAtual.plano
          : req.body?.plano || req.body?.planoId || req.body?.planId;
      let plano = null;

      if (codigoAssinaturaInput) {
        plano = buildPlanoFromCodigoAssinatura(await findCodigoAssinaturaDisponivel(codigoAssinaturaInput));
      } else {
        plano = await getPlano(planoId);
      }

      if (!['mudar_plano', 'trocar_pagamento'].includes(acao)) {
        return res.status(400).json({ message: 'Escolha uma ação de assinatura válida.' });
      }

      if (!plano) {
        return res.status(400).json({ message: 'Escolha um plano válido.' });
      }

      if (acao === 'mudar_plano' && !codigoAssinaturaInput && plano.id === assinaturaAtual.plano) {
        return res.status(400).json({ message: 'Escolha um plano diferente do atual.' });
      }

      const valorAtualCentavos = Number(
        assinaturaAtual.valor_recorrente_centavos || assinaturaAtual.valor_centavos || 0
      );
      const isDowngrade = acao === 'mudar_plano' && plano.valor_centavos < valorAtualCentavos;

      if (isDowngrade) {
        if (assinaturaAtual.mercado_pago_preapproval_id) {
          await updateMercadoPagoPreapprovalAmount(assinaturaAtual.mercado_pago_preapproval_id, {
            valorCentavos: plano.valor_centavos,
            moeda: plano.moeda || 'BRL',
          });
        }

        const aplicarEm = assinaturaAtual.proximo_pagamento_em || getFutureNextPaymentDate(assinaturaAtual);
        let planoParaAgendamento = plano;

        const alteracaoAgendada = codigoAssinaturaInput
          ? await sequelize.transaction(async transaction => {
              const reserved = await reserveSubscriptionCodeForUser(codigoAssinaturaInput, req.user.id, { transaction });
              planoParaAgendamento = reserved.planoPersonalizado;

              return scheduleDowngrade(
                {
                  usuarioId: req.user.id,
                  assinaturaAtual,
                  plano: planoParaAgendamento,
                  aplicarEm,
                  metadata: {
                    codigo_assinatura: reserved.codigoAssinatura.codigo,
                    codigo_assinatura_id: reserved.codigoAssinatura.id,
                    origem: 'painel_cliente',
                    mercado_pago_preapproval_id: assinaturaAtual.mercado_pago_preapproval_id || null,
                  },
                },
                { transaction }
              );
            })
          : await scheduleDowngrade({
              usuarioId: req.user.id,
              assinaturaAtual,
              plano,
              aplicarEm,
              metadata: {
                origem: 'painel_cliente',
                mercado_pago_preapproval_id: assinaturaAtual.mercado_pago_preapproval_id || null,
              },
            });
        plano = planoParaAgendamento;
        assinaturaAtual.normalizar_valor_apos_primeiro_pagamento = false;
        assinaturaAtual.valor_normalizado_em = assinaturaAtual.valor_normalizado_em || new Date();
        assinaturaAtual.tipo_movimento = 'mudar_plano_downgrade_agendado';
        await assinaturaAtual.save();

        return res.json({
          acao,
          alteracaoAgendada: true,
          assinaturaAtualizada: false,
          checkoutUrl: null,
          creditoRateioCentavos: 0,
          proximoPagamentoAtual: aplicarEm,
          aplicarEm,
          planoAtual: assinaturaAtual.plano,
          planoNovo: plano.id,
          alteracao: alteracaoAgendada,
          valorPrimeiroPagamentoCentavos: plano.valor_centavos,
          valorRecorrenteCentavos: plano.valor_centavos,
          message: 'Troca de plano agendada. O plano atual continua ativo até o fim do período já pago.',
        });
      }

      let codigoAssinaturaReservadoId = null;
      let rateio = null;
      let referenciaExterna = null;
      let assinatura = null;
      let startDate = null;

      try {
        if (codigoAssinaturaInput) {
          const reserved = await reserveSubscriptionCodeForUser(codigoAssinaturaInput, req.user.id);
          codigoAssinaturaReservadoId = reserved.codigoAssinatura.id;
          plano = reserved.planoPersonalizado;
        }

        await abandonPendingSubscriptions(req.user.id);

        rateio =
          acao === 'mudar_plano'
            ? calculateProrationCredit(assinaturaAtual, plano)
            : calculatePaymentMethodChangeCharge(assinaturaAtual, plano);
        referenciaExterna = `caixa-agil-assinatura-${acao}-${plano.id}-${randomUUID()}`;
        startDate =
          acao === 'trocar_pagamento' && !rateio.cobrancaImediata
            ? getFutureStartDate(rateio.proximoPagamentoAtual)
            : null;
        assinatura = await Assinatura.create({
          usuario_id: req.user.id,
          plano: plano.id,
          plano_versao_id: plano.plano_versao_id || null,
          plano_snapshot: buildPlanoSnapshot(plano),
          status: 'pendente',
          valor_centavos: plano.valor_centavos,
          valor_recorrente_centavos: plano.valor_centavos,
          valor_primeiro_pagamento_centavos: rateio.valorPrimeiroPagamentoCentavos,
          credito_rateio_centavos: rateio.creditoRateioCentavos,
          normalizar_valor_apos_primeiro_pagamento:
            acao === 'mudar_plano' && rateio.valorPrimeiroPagamentoCentavos !== plano.valor_centavos,
          moeda: 'BRL',
          referencia_externa: referenciaExterna,
          ...createCheckoutTokenPayload(),
          tipo_movimento: codigoAssinaturaInput ? 'mudar_plano_personalizado' : acao,
          assinatura_anterior_id: assinaturaAtual.id,
          iniciada_em: new Date(),
        });
      } catch (error) {
        await restoreSubscriptionCodeForUser(codigoAssinaturaReservadoId, req.user.id);
        throw error;
      }

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
          checkoutToken: assinatura.checkout_token,
          checkoutUrl: checkout.initPoint,
          cobrancaImediata: Boolean(rateio.cobrancaImediata),
          creditoRateioCentavos: rateio.creditoRateioCentavos,
          mercadoPagoPreapprovalId: checkout.id,
          proximoPagamentoAtual: rateio.proximoPagamentoAtual,
          valorPrimeiroPagamentoCentavos: rateio.valorPrimeiroPagamentoCentavos,
          valorRecorrenteCentavos: plano.valor_centavos,
        });
      } catch (error) {
        assinatura.status = 'falha';
        await assinatura.save();
        await restoreSubscriptionCodeForUser(codigoAssinaturaReservadoId, req.user.id);

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
