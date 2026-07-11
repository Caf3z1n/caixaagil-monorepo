const { Pdv, Subconta } = require('../models');
const { getBillingStatus } = require('./assinaturaInadimplenciaService');
const { findSubscriptionForPlatformAccess } = require('./assinaturaAccessService');
const { applyDueScheduledChanges } = require('./alteracoesAssinaturaService');
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
  await applyDueScheduledChanges({ usuarioId });

  return findSubscriptionForPlatformAccess(usuarioId);
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

    if (planoAtual?.plano_versao_id) {
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

function buildSupportBillingStatus(assinatura = null) {
  const data = toPlain(assinatura);

  return {
    assinatura_id: data?.id || null,
    assinatura_status: data?.status || null,
    bloqueado: false,
    bloqueia_em: null,
    dias_em_atraso: 0,
    dias_para_bloqueio: null,
    fase: 'regular',
    mensagem: 'Acesso administrativo temporário.',
    motivo: 'acesso_suporte_admin',
    permite_operacao: true,
    proximo_pagamento_em: data?.proximo_pagamento_em || null,
  };
}

async function getEntitlements(usuarioId, options = {}) {
  const assinatura = await getActiveSubscription(usuarioId);

  if (!assinatura) {
    if (options.bypass) {
      const uso = await getUsage(usuarioId);

      return {
        acesso_suporte: true,
        assinatura_id: null,
        plano_id: 'suporte_admin',
        plano_nome: 'Acesso administrativo',
        plano_snapshot: {},
        recursos: {
          emissao_fiscal: true,
        },
        limites: {
          pdvs_ativos: null,
          subcontas_ativas: null,
        },
        uso,
        disponivel: {
          pdvs_ativos: null,
          subcontas_ativas: null,
        },
        billing_status: buildSupportBillingStatus(),
      };
    }

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

  const entitlements = {
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

  if (!options.bypass) {
    return entitlements;
  }

  return {
    ...entitlements,
    acesso_suporte: true,
    recursos: {
      ...entitlements.recursos,
      emissao_fiscal: true,
    },
    limites: {
      pdvs_ativos: null,
      subcontas_ativas: null,
    },
    disponivel: {
      pdvs_ativos: null,
      subcontas_ativas: null,
    },
    billing_status: buildSupportBillingStatus(assinatura),
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

async function ensureFeature(usuarioId, codigo, options = {}) {
  const entitlements = await getEntitlements(usuarioId, options);

  if (options.bypass) {
    return entitlements;
  }

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

async function getFeatureAccess(usuarioId, codigo, options = {}) {
  try {
    const entitlements = await getEntitlements(usuarioId, options);

    if (options.bypass) {
      return {
        allowed: true,
        code: null,
        message: null,
        entitlements,
        statusCode: 200,
      };
    }

    if (entitlements?.billing_status?.bloqueado) {
      return {
        allowed: false,
        code: 'SUBSCRIPTION_BLOCKED',
        message: entitlements.billing_status.mensagem || 'Conta bloqueada por pendencia de assinatura.',
        entitlements,
        statusCode: 402,
      };
    }

    if (!entitlements?.recursos?.[codigo]) {
      return {
        allowed: false,
        code: 'PLAN_FEATURE_REQUIRED',
        message: FEATURE_MESSAGES[codigo] || 'Seu plano atual nao permite este recurso.',
        entitlements,
        statusCode: 403,
      };
    }

    return {
      allowed: true,
      code: null,
      message: null,
      entitlements,
      statusCode: 200,
    };
  } catch (error) {
    return {
      allowed: false,
      code: error.code || 'SUBSCRIPTION_REQUIRED',
      message: error.message || 'Assinatura ativa obrigatoria.',
      entitlements: error.entitlements || null,
      statusCode: error.statusCode || error.status || 403,
    };
  }
}

async function isFeatureEnabled(usuarioId, codigo, options = {}) {
  const access = await getFeatureAccess(usuarioId, codigo, options);

  return access.allowed;
}

async function ensureLimitAvailable(usuarioId, codigo, options = {}) {
  const entitlements = await getEntitlements(usuarioId, options);

  if (options.bypass) {
    return entitlements;
  }
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
  getFeatureAccess,
  getEntitlements,
  isFeatureEnabled,
};
