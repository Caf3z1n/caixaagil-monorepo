const { Op } = require('sequelize');
const sequelize = require('../../database');
const { AlteracaoAssinatura, Assinatura } = require('../models');
const { buildPlanoSnapshot } = require('./planosService');

const STATUS_AGENDADA = 'agendada';
const STATUS_APLICADA = 'aplicada';
const STATUS_CANCELADA = 'cancelada';

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRecurringValue(assinatura) {
  return Number(assinatura?.valor_recorrente_centavos || assinatura?.valor_centavos || 0);
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

async function findScheduledChange(usuarioId, assinaturaId = null, options = {}) {
  const where = {
    usuario_id: usuarioId,
    status: STATUS_AGENDADA,
  };

  if (assinaturaId) {
    where.assinatura_id = assinaturaId;
  }

  return AlteracaoAssinatura.findOne({
    where,
    order: [
      ['aplicar_em', 'ASC'],
      ['id', 'DESC'],
    ],
    transaction: options.transaction || null,
  });
}

async function cancelScheduledChangesForSubscription(assinaturaId, motivo = 'cancelada', options = {}) {
  if (!assinaturaId) {
    return 0;
  }

  const [count] = await AlteracaoAssinatura.update(
    {
      status: STATUS_CANCELADA,
      cancelada_em: new Date(),
      motivo_cancelamento: motivo,
    },
    {
      where: {
        assinatura_id: assinaturaId,
        status: STATUS_AGENDADA,
      },
      transaction: options.transaction || null,
    }
  );

  return count;
}

async function scheduleDowngrade({ usuarioId, assinaturaAtual, plano, aplicarEm, metadata = {} }, options = {}) {
  if (!usuarioId || !assinaturaAtual?.id || !plano?.id) {
    throw new Error('Dados insuficientes para agendar a troca de plano.');
  }

  const aplicarEmDate = toDate(aplicarEm) || new Date();
  const transaction = options.transaction || null;

  await cancelScheduledChangesForSubscription(assinaturaAtual.id, 'substituida_por_novo_agendamento', {
    transaction,
  });

  return AlteracaoAssinatura.create(
    {
      usuario_id: usuarioId,
      assinatura_id: assinaturaAtual.id,
      tipo: 'downgrade',
      status: STATUS_AGENDADA,
      plano_atual: assinaturaAtual.plano,
      plano_novo: plano.id,
      plano_versao_id: plano.plano_versao_id || null,
      plano_snapshot: buildPlanoSnapshot(plano),
      valor_atual_centavos: getRecurringValue(assinaturaAtual),
      valor_novo_centavos: Number(plano.valor_centavos || 0),
      moeda: plano.moeda || assinaturaAtual.moeda || 'BRL',
      aplicar_em: aplicarEmDate,
      metadata: normalizeMetadata(metadata),
    },
    { transaction }
  );
}

async function applyScheduledChange(alteracao, options = {}) {
  if (!alteracao || alteracao.status !== STATUS_AGENDADA) {
    return null;
  }

  const transaction = options.transaction || null;
  const now = new Date();
  const assinatura = await Assinatura.findOne({
    where: {
      id: alteracao.assinatura_id,
      usuario_id: alteracao.usuario_id,
    },
    transaction,
    lock: transaction ? true : undefined,
  });

  if (!assinatura || assinatura.status !== 'ativa') {
    alteracao.status = STATUS_CANCELADA;
    alteracao.cancelada_em = now;
    alteracao.motivo_cancelamento = assinatura ? 'assinatura_nao_ativa' : 'assinatura_nao_encontrada';
    await alteracao.save({ transaction });
    return null;
  }

  assinatura.plano = alteracao.plano_novo;
  assinatura.plano_versao_id = alteracao.plano_versao_id || null;
  assinatura.plano_snapshot = alteracao.plano_snapshot;
  assinatura.valor_centavos = alteracao.valor_novo_centavos;
  assinatura.valor_recorrente_centavos = alteracao.valor_novo_centavos;
  assinatura.valor_primeiro_pagamento_centavos = alteracao.valor_novo_centavos;
  assinatura.credito_rateio_centavos = 0;
  assinatura.moeda = alteracao.moeda || assinatura.moeda || 'BRL';
  assinatura.normalizar_valor_apos_primeiro_pagamento = false;
  assinatura.valor_normalizado_em = now;
  assinatura.tipo_movimento = 'mudar_plano_downgrade_aplicado';
  await assinatura.save({ transaction });

  alteracao.status = STATUS_APLICADA;
  alteracao.aplicada_em = now;
  alteracao.metadata = {
    ...normalizeMetadata(alteracao.metadata),
    aplicado_por: 'sistema',
  };
  await alteracao.save({ transaction });

  return { alteracao, assinatura };
}

async function applyDueScheduledChanges(filters = {}) {
  const now = filters.now || new Date();
  const where = {
    status: STATUS_AGENDADA,
    aplicar_em: {
      [Op.lte]: now,
    },
  };

  if (filters.usuarioId) {
    where.usuario_id = filters.usuarioId;
  }

  if (filters.assinaturaId) {
    where.assinatura_id = filters.assinaturaId;
  }

  const alteracoes = await AlteracaoAssinatura.findAll({
    where,
    order: [
      ['aplicar_em', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  const applied = [];

  for (const alteracao of alteracoes) {
    const result = await sequelize.transaction(async transaction => {
      const lockedChange = await AlteracaoAssinatura.findOne({
        where: {
          id: alteracao.id,
          status: STATUS_AGENDADA,
        },
        transaction,
        lock: true,
      });

      if (!lockedChange) {
        return null;
      }

      return applyScheduledChange(lockedChange, { transaction });
    });

    if (result) {
      applied.push(result);
    }
  }

  return applied;
}

async function applyDueScheduledChangeForSubscription(assinatura) {
  if (!assinatura?.id) {
    return [];
  }

  return applyDueScheduledChanges({
    assinaturaId: assinatura.id,
    usuarioId: assinatura.usuario_id,
  });
}

async function attachScheduledChanges(assinaturas) {
  const items = Array.isArray(assinaturas) ? assinaturas : [assinaturas].filter(Boolean);
  const ids = items.map(assinatura => assinatura?.id).filter(Boolean);

  if (ids.length === 0) {
    return assinaturas;
  }

  const alteracoes = await AlteracaoAssinatura.findAll({
    where: {
      assinatura_id: ids,
      status: STATUS_AGENDADA,
    },
    order: [
      ['aplicar_em', 'ASC'],
      ['id', 'DESC'],
    ],
  });
  const byAssinaturaId = new Map();

  for (const alteracao of alteracoes) {
    if (!byAssinaturaId.has(alteracao.assinatura_id)) {
      byAssinaturaId.set(alteracao.assinatura_id, alteracao);
    }
  }

  for (const assinatura of items) {
    if (assinatura?.setDataValue) {
      assinatura.setDataValue('alteracao_agendada', byAssinaturaId.get(assinatura.id) || null);
    } else if (assinatura) {
      assinatura.alteracao_agendada = byAssinaturaId.get(assinatura.id) || null;
    }
  }

  return assinaturas;
}

module.exports = {
  STATUS_AGENDADA,
  STATUS_APLICADA,
  STATUS_CANCELADA,
  applyDueScheduledChangeForSubscription,
  applyDueScheduledChanges,
  attachScheduledChanges,
  cancelScheduledChangesForSubscription,
  findScheduledChange,
  scheduleDowngrade,
};
