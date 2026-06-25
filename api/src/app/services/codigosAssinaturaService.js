const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  CodigoAssinatura,
  Plano,
  PlanoLimite,
  PlanoRecurso,
  PlanoVersao,
} = require('../models');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function toPlain(model) {
  return model?.get ? model.get({ plain: true }) : model || null;
}

function normalizeCodigoAssinatura(value) {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (raw.length === 6) {
    return `${raw.slice(0, 3)}-${raw.slice(3)}`;
  }

  return raw.slice(0, 80);
}

function hashCodigoAssinatura(codigo) {
  return crypto.createHash('sha256').update(normalizeCodigoAssinatura(codigo)).digest('hex');
}

function createCodigoAssinatura() {
  let rawCode = '';

  for (let index = 0; index < 6; index += 1) {
    rawCode += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }

  return `${rawCode.slice(0, 3)}-${rawCode.slice(3)}`;
}

async function buildUniqueCodigoAssinatura(options = {}) {
  const transaction = options.transaction || null;
  let codigo;
  let codigoHash;

  do {
    codigo = createCodigoAssinatura();
    codigoHash = hashCodigoAssinatura(codigo);
  } while (
    await CodigoAssinatura.findOne({
      where: {
        [Op.or]: [{ codigo }, { codigo_hash: codigoHash }],
      },
      transaction,
    })
  );

  return {
    codigo,
    codigo_hash: codigoHash,
  };
}

function getCodigoAssinaturaStatus(codigo) {
  const data = toPlain(codigo);

  if (!data) {
    return 'indisponivel';
  }

  if (data.usado_em || Number(data.usos_realizados || 0) >= Number(data.usos_maximos || 1)) {
    return 'usado';
  }

  if (data.expira_em && new Date(data.expira_em) <= new Date()) {
    return 'expirado';
  }

  return data.ativo ? 'disponivel' : 'inativo';
}

function serializeCodigoAssinatura(codigo) {
  const data = toPlain(codigo);

  if (!data) {
    return null;
  }

  delete data.codigo_hash;

  return {
    ...data,
    status_codigo: getCodigoAssinaturaStatus(data),
  };
}

function serializeRecurso(recurso) {
  const data = toPlain(recurso);

  return {
    codigo: data.codigo,
    nome: data.nome,
    label: data.nome,
    habilitado: Boolean(data.habilitado),
    included: Boolean(data.habilitado),
  };
}

function serializeLimite(limite) {
  const data = toPlain(limite);

  return {
    codigo: data.codigo,
    nome: data.nome,
    valor: Number.isInteger(data.valor) ? data.valor : null,
    unidade: data.unidade || null,
  };
}

function getTrialDiasFromCodigo(data) {
  const trialDias = Number(data?.trial_dias || 0);

  if (Number.isInteger(trialDias) && trialDias > 0) {
    return trialDias;
  }

  const cobrancaInicioEm = data?.cobranca_inicio_em ? new Date(data.cobranca_inicio_em) : null;

  if (!cobrancaInicioEm || Number.isNaN(cobrancaInicioEm.getTime())) {
    return 0;
  }

  const diffMs = cobrancaInicioEm.getTime() - Date.now();

  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function getCodigoAssinaturaIncludes() {
  return [
    {
      model: Plano,
      as: 'plano',
      required: true,
      where: {
        ativo: true,
        publico: false,
      },
    },
    {
      model: PlanoVersao,
      as: 'plano_versao',
      required: true,
      where: {
        ativo: true,
        vigente_de: { [Op.lte]: new Date() },
        [Op.or]: [{ vigente_ate: null }, { vigente_ate: { [Op.gt]: new Date() } }],
      },
      include: [
        {
          model: PlanoRecurso,
          as: 'recursos',
          separate: true,
          order: [
            ['ordem', 'ASC'],
            ['id', 'ASC'],
          ],
        },
        {
          model: PlanoLimite,
          as: 'limites',
          separate: true,
          order: [
            ['ordem', 'ASC'],
            ['id', 'ASC'],
          ],
        },
      ],
    },
  ];
}

function buildPlanoFromCodigoAssinatura(codigoAssinatura) {
  const data = toPlain(codigoAssinatura);
  const versao = data?.plano_versao;
  const plano = data?.plano;

  if (!data || !versao || !plano) {
    return null;
  }

  return {
    id: data.plano_id,
    nome: data.nome || versao.nome || plano.nome,
    descricao: versao.descricao || plano.descricao || null,
    valor_centavos: data.valor_centavos,
    moeda: data.moeda || versao.moeda || 'BRL',
    intervalo: data.intervalo || versao.intervalo || 'mensal',
    intervalo_quantidade: data.intervalo_quantidade || versao.intervalo_quantidade || 1,
    plano_versao_id: data.plano_versao_id,
    personalizado: true,
    gratuito: Boolean(data.gratuito),
    codigo_assinatura: data.codigo,
    codigo_assinatura_id: data.id,
    trial_dias: getTrialDiasFromCodigo(data),
    cobranca_inicio_em: data.cobranca_inicio_em || null,
    recursos: [...(versao.recursos || [])]
      .sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0))
      .map(serializeRecurso),
    limites: [...(versao.limites || [])]
      .sort((left, right) => Number(left.ordem || 0) - Number(right.ordem || 0))
      .map(serializeLimite),
  };
}

async function findCodigoAssinaturaDisponivel(codigo, options = {}) {
  const normalized = normalizeCodigoAssinatura(codigo);

  if (!normalized) {
    return null;
  }

  const transaction = options.transaction || null;
  const where = {
    codigo_hash: hashCodigoAssinatura(normalized),
    ativo: true,
    [Op.or]: [{ expira_em: null }, { expira_em: { [Op.gt]: new Date() } }],
  };

  let codigoAssinatura = null;

  if (options.lock) {
    const lockedCodigoAssinatura = await CodigoAssinatura.findOne({
      where,
      lock: options.lock?.level || options.lock,
      transaction,
    });

    if (!lockedCodigoAssinatura || getCodigoAssinaturaStatus(lockedCodigoAssinatura) !== 'disponivel') {
      return null;
    }

    codigoAssinatura = await CodigoAssinatura.findOne({
      where: {
        id: lockedCodigoAssinatura.id,
      },
      include: getCodigoAssinaturaIncludes(),
      transaction,
    });
  } else {
    codigoAssinatura = await CodigoAssinatura.findOne({
      where,
      include: getCodigoAssinaturaIncludes(),
      transaction,
    });
  }

  if (!codigoAssinatura || getCodigoAssinaturaStatus(codigoAssinatura) !== 'disponivel') {
    return null;
  }

  return codigoAssinatura;
}

module.exports = {
  buildPlanoFromCodigoAssinatura,
  buildUniqueCodigoAssinatura,
  findCodigoAssinaturaDisponivel,
  getCodigoAssinaturaStatus,
  hashCodigoAssinatura,
  normalizeCodigoAssinatura,
  serializeCodigoAssinatura,
};
