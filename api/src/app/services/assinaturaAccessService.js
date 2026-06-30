const { Op } = require('sequelize');
const { Assinatura, PagamentoAssinatura } = require('../models');

const STATUS_PAGAMENTO_APROVADO = [
  'accredited',
  'approved',
  'authorized',
  'paid',
  'processed',
];

const STATUS_ASSINATURA_IGNORADOS_REFERENCIA = new Set([
  'abandonada',
  'substituida',
]);

function toPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function hasSubscriptionActivationEvidence(assinatura) {
  const data = toPlain(assinatura);
  const status = normalizeStatus(data?.status);

  return status === 'ativa' || Boolean(data?.ativada_em);
}

function isIgnoredReferenceStatus(assinatura) {
  return STATUS_ASSINATURA_IGNORADOS_REFERENCIA.has(normalizeStatus(toPlain(assinatura)?.status));
}

function selectSubscriptionReference(assinaturas = []) {
  const validas = assinaturas.filter(Boolean);

  return (
    validas.find(assinatura => normalizeStatus(toPlain(assinatura)?.status) === 'ativa') ||
    validas.find(assinatura => hasSubscriptionActivationEvidence(assinatura) && !isIgnoredReferenceStatus(assinatura)) ||
    validas.find(assinatura => !isIgnoredReferenceStatus(assinatura)) ||
    validas[0] ||
    null
  );
}

async function listRecentSubscriptions(usuarioId, options = {}) {
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 12;

  return Assinatura.findAll({
    where: { usuario_id: usuarioId },
    order: [['id', 'DESC']],
    limit,
  });
}

async function findApprovedPaymentSubscription(usuarioId) {
  const pagamento = await PagamentoAssinatura.findOne({
    where: {
      usuario_id: usuarioId,
      status: {
        [Op.in]: STATUS_PAGAMENTO_APROVADO,
      },
    },
    order: [
      ['processado_em', 'DESC'],
      ['pago_em', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  if (!pagamento?.assinatura_id) {
    return null;
  }

  return Assinatura.findOne({
    where: {
      id: pagamento.assinatura_id,
      usuario_id: usuarioId,
    },
  });
}

async function findSubscriptionReference(usuarioId) {
  const assinaturas = await listRecentSubscriptions(usuarioId);
  const referencia = selectSubscriptionReference(assinaturas);

  if (referencia) {
    return referencia;
  }

  return findApprovedPaymentSubscription(usuarioId);
}

async function findSubscriptionForPlatformAccess(usuarioId) {
  const assinaturas = await listRecentSubscriptions(usuarioId);
  const referencia = selectSubscriptionReference(assinaturas);

  if (referencia && hasSubscriptionActivationEvidence(referencia)) {
    return referencia;
  }

  return findApprovedPaymentSubscription(usuarioId);
}

async function getPlatformAccess(usuarioId) {
  const assinatura = await findSubscriptionForPlatformAccess(usuarioId);

  return {
    allowed: Boolean(assinatura),
    assinatura,
    motivo: assinatura ? 'assinatura_com_historico' : 'sem_assinatura_ativada',
  };
}

module.exports = {
  STATUS_PAGAMENTO_APROVADO,
  findSubscriptionForPlatformAccess,
  findSubscriptionReference,
  getPlatformAccess,
  hasSubscriptionActivationEvidence,
  selectSubscriptionReference,
};
