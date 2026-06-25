const { Assinatura, Pdv, Subconta } = require('../models');
const { getBillingStatus } = require('./assinaturaInadimplenciaService');
const { buildPlanoSnapshot, getPlano } = require('./planosService');

const FEATURE_MESSAGES = {
  emissao_fiscal: 'Seu plano atual não permite recursos fiscais.',
};

const LIMIT_MESSAGES = {
  pdvs_ativos: 'Limite de PDVs ativos atingido para o plano atual.',
  subcontas_ativas: 'Limite de subcontas ativas atingido para o plano atual.',
};

function toPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function normalizeLimitValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function findSnapshotItem(items, codigo) {
  if (!Array.isArray(items)) {
    return null;
  }

  return items.find(item => item?.codigo === codigo) || null;
}

function isSamePlanVersion(left, right) {
  return String(left || '') === String(right || '');
}

function getSnapshotFeature(snapshot, codigo) {
  const recurso = findSnapshotItem(snapshot?.recursos, codigo);

  if (!recurso) {
    return false;
  }

  return recurso.habilitado !== false && recurso.included !== false;
}

function getSnapshotLimit(snapshot, codigo) {
  const limite = findSnapshotItem(snapshot?.limites, codigo);

  return normalizeLimitValue(limite?.valor);
}

function createEntitlementError(code, message, entitlements, statusCode = 403) {
  const error = new Error(message);
  error.code = code;
  error.status = statusCode;
  error.statusCode = statusCode;
  error.entitlements = entitlements;

  return error;
}

async function getActiveSubscription(usuarioId) {
  return Assinatura.findOne({
    where: {
      usuario_id: usuarioId,
      status: 'ativa',
    },
    order: [['id', 'DESC']],
  });
}

async function getUsage(usuarioId) {
  const [pdvsAtivos, subcontasAtivas] = await Promise.all([
    Pdv.count({
      where: {
        usuario_id: usuarioId,
        ativo: true,
      },
    }),
    Subconta.count({
      where: {
        usuario_id: usuarioId,
        ativo: true,
      },
    }),
  ]);

  return {
    pdvs_ativos: pdvsAtivos,
    subcontas_ativas: subcontasAtivas,
  };
}

async function getEffectivePlanSnapshot(assinatura) {
  const data = toPlain(assinatura);
  const snapshot = data?.plano_snapshot || {};

  try {
    const planoAtual = await getPlano(data?.plano);

    if (
      planoAtual?.personalizado &&
      planoAtual.plano_versao_id &&
      (!isSamePlanVersion(planoAtual.plano_versao_id, data?.plano_versao_id) ||
        !isSamePlanVersion(planoAtual.plano_versao_id, snapshot?.plano_versao_id))
    ) {
      return buildPlanoSnapshot(planoAtual) || snapshot;
    }
  } catch {
    return snapshot;
  }

  return snapshot;
}

function getAvailable(limit, usage) {
  if (limit === null) {
    return null;
  }

  return Math.max(limit - usage, 0);
}

async function getEntitlements(usuarioId) {
  const assinatura = await getActiveSubscription(usuarioId);

  if (!assinatura) {
    throw createEntitlementError(
      'SUBSCRIPTION_REQUIRED',
      'Assinatura ativa obrigatória.',
      null,
      403
    );
  }

  const data = toPlain(assinatura);
  const billingStatus = await getBillingStatus(usuarioId, { assinatura: data });
  const snapshot = await getEffectivePlanSnapshot(assinatura);
  const uso = await getUsage(usuarioId);
  const limites = {
    pdvs_ativos: getSnapshotLimit(snapshot, 'pdvs_ativos'),
    subcontas_ativas: getSnapshotLimit(snapshot, 'subcontas_ativas'),
  };

  return {
    assinatura_id: data.id,
    plano_id: data.plano,
    plano_nome: snapshot.nome || data.plano,
    plano_snapshot: snapshot,
    recursos: {
      emissao_fiscal: getSnapshotFeature(snapshot, 'emissao_fiscal'),
    },
    limites,
    uso,
    disponivel: {
      pdvs_ativos: getAvailable(limites.pdvs_ativos, uso.pdvs_ativos),
      subcontas_ativas: getAvailable(limites.subcontas_ativas, uso.subcontas_ativas),
    },
    billing_status: billingStatus,
  };
}

function ensureBillingOperational(entitlements) {
  if (!entitlements?.billing_status?.bloqueado) {
    return;
  }

  throw createEntitlementError(
    'SUBSCRIPTION_BLOCKED',
    entitlements.billing_status.mensagem || 'Conta bloqueada por pendência de assinatura.',
    entitlements,
    402
  );
}

async function ensureFeature(usuarioId, codigo) {
  const entitlements = await getEntitlements(usuarioId);

  ensureBillingOperational(entitlements);

  if (!entitlements.recursos[codigo]) {
    throw createEntitlementError(
      'PLAN_FEATURE_REQUIRED',
      FEATURE_MESSAGES[codigo] || 'Seu plano atual não permite este recurso.',
      entitlements
    );
  }

  return entitlements;
}

async function ensureLimitAvailable(usuarioId, codigo, options = {}) {
  const entitlements = await getEntitlements(usuarioId);
  const incremento = Number.isInteger(options.incremento) && options.incremento > 0 ? options.incremento : 1;
  const limite = entitlements.limites[codigo];
  const uso = entitlements.uso[codigo] || 0;

  ensureBillingOperational(entitlements);

  if (limite !== null && uso + incremento > limite) {
    throw createEntitlementError(
      'PLAN_LIMIT_REACHED',
      LIMIT_MESSAGES[codigo] || 'Limite do plano atingido.',
      entitlements,
      409
    );
  }

  return entitlements;
}

module.exports = {
  ensureFeature,
  ensureLimitAvailable,
  getEntitlements,
};
