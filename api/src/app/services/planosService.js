const { Op } = require('sequelize');
const { Plano, PlanoLimite, PlanoRecurso, PlanoVersao } = require('../models');

const fallbackPlanos = {
  inicial: {
    id: 'inicial',
    nome: 'Inicial',
    descricao: 'Operacao comercial com PDV, vendas, comandas, estoque e fechamento do turno sem emissao fiscal.',
    valor_centavos: 29900,
    moeda: 'BRL',
    plano_versao_id: null,
    recursos: [
      { codigo: 'pdv_desktop', nome: 'PDV desktop local', label: 'PDV desktop local', habilitado: true, included: true },
      { codigo: 'vendas_comandas', nome: 'Vendas e comanda digital', label: 'Vendas e comanda digital', habilitado: true, included: true },
      { codigo: 'estoque', nome: 'Controle de estoque', label: 'Controle de estoque', habilitado: true, included: true },
      { codigo: 'fechamento_turno', nome: 'Fechamento do turno', label: 'Fechamento do turno', habilitado: true, included: true },
      { codigo: 'emissao_fiscal', nome: 'NF-e/NFC-e com contingencia', label: 'NF-e/NFC-e com contingencia', habilitado: false, included: false },
    ],
    limites: [
      { codigo: 'pdvs_ativos', nome: 'PDVs ativos', valor: null, unidade: 'quantidade' },
      { codigo: 'subcontas_ativas', nome: 'Subcontas ativas', valor: null, unidade: 'quantidade' },
    ],
  },
  completo: {
    id: 'completo',
    nome: 'Completo',
    descricao: 'Operacao comercial completa com PDV, estoque, fechamento do turno e emissao fiscal.',
    valor_centavos: 49900,
    moeda: 'BRL',
    plano_versao_id: null,
    recursos: [
      { codigo: 'pdv_desktop', nome: 'PDV desktop local', label: 'PDV desktop local', habilitado: true, included: true },
      { codigo: 'vendas_comandas', nome: 'Vendas e comanda digital', label: 'Vendas e comanda digital', habilitado: true, included: true },
      { codigo: 'estoque', nome: 'Controle de estoque', label: 'Controle de estoque', habilitado: true, included: true },
      { codigo: 'fechamento_turno', nome: 'Fechamento do turno', label: 'Fechamento do turno', habilitado: true, included: true },
      { codigo: 'emissao_fiscal', nome: 'NF-e/NFC-e com contingencia', label: 'NF-e/NFC-e com contingencia', habilitado: true, included: true },
    ],
    limites: [
      { codigo: 'pdvs_ativos', nome: 'PDVs ativos', valor: null, unidade: 'quantidade' },
      { codigo: 'subcontas_ativas', nome: 'Subcontas ativas', valor: null, unidade: 'quantidade' },
    ],
  },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizePlanId(id) {
  return String(id || '').trim().toLowerCase();
}

function getActiveVersion(plano) {
  const versions = plano?.versoes || [];

  return versions[0] || null;
}

function serializeRecurso(recurso) {
  const data = recurso.get ? recurso.get({ plain: true }) : recurso;

  return {
    codigo: data.codigo,
    nome: data.nome,
    label: data.nome,
    habilitado: Boolean(data.habilitado),
    included: Boolean(data.habilitado),
  };
}

function serializeLimite(limite) {
  const data = limite.get ? limite.get({ plain: true }) : limite;

  return {
    codigo: data.codigo,
    nome: data.nome,
    valor: Number.isInteger(data.valor) ? data.valor : null,
    unidade: data.unidade || null,
  };
}

function serializePlano(plano) {
  const data = plano.get ? plano.get({ plain: true }) : plano;
  const version = getActiveVersion(data);

  if (!version) {
    return null;
  }

  return {
    id: data.id,
    publico: Boolean(data.publico),
    personalizado: data.publico === false,
    nome: version.nome || data.nome,
    descricao: version.descricao || data.descricao || null,
    valor_centavos: version.valor_centavos,
    moeda: version.moeda || 'BRL',
    intervalo: version.intervalo || 'mensal',
    intervalo_quantidade: version.intervalo_quantidade || 1,
    plano_versao_id: version.id,
    recursos: (version.recursos || []).map(serializeRecurso),
    limites: (version.limites || []).map(serializeLimite),
  };
}

function getFallbackPlanos() {
  return Object.values(fallbackPlanos).map(clone);
}

async function listarPlanos({ somentePublicos = true } = {}) {
  try {
    const where = { ativo: true };

    if (somentePublicos) {
      where.publico = true;
    }

    const planos = await Plano.findAll({
      where,
      include: [
        {
          model: PlanoVersao,
          as: 'versoes',
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
          limit: 1,
          separate: true,
          order: [
            ['vigente_de', 'DESC'],
            ['id', 'DESC'],
          ],
        },
      ],
      order: [
        ['ordem', 'ASC'],
        ['id', 'ASC'],
      ],
    });

    const serialized = planos.map(serializePlano).filter(Boolean);

    return serialized.length > 0 ? serialized : getFallbackPlanos();
  } catch {
    return getFallbackPlanos();
  }
}

async function listarPlanosPublicos() {
  return listarPlanos({ somentePublicos: true });
}

async function getPlano(id) {
  const normalizedId = normalizePlanId(id);

  if (!normalizedId) {
    return null;
  }

  const planos = await listarPlanos({ somentePublicos: false });

  return planos.find(plano => normalizePlanId(plano.id) === normalizedId) || null;
}

function getValorEmReais(plano) {
  return plano.valor_centavos / 100;
}

function buildPlanoSnapshot(plano) {
  if (!plano) {
    return null;
  }

  return {
    id: plano.id,
    nome: plano.nome,
    descricao: plano.descricao || null,
    valor_centavos: plano.valor_centavos,
    moeda: plano.moeda || 'BRL',
    intervalo: plano.intervalo || 'mensal',
    intervalo_quantidade: plano.intervalo_quantidade || 1,
    plano_versao_id: plano.plano_versao_id || null,
    recursos: clone(plano.recursos || []),
    limites: clone(plano.limites || []),
    capturado_em: new Date().toISOString(),
  };
}

module.exports = {
  buildPlanoSnapshot,
  fallbackPlanos,
  getPlano,
  getValorEmReais,
  listarPlanos,
  listarPlanosPublicos,
  planos: fallbackPlanos,
};
