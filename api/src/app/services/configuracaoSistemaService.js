const { ConfiguracaoSistema } = require('../models');

const paymentMethodKeys = ['dinheiro', 'pix', 'cartao', 'convenio'];

const defaultPaymentMethods = {
  dinheiro: true,
  pix: true,
  cartao: true,
  convenio: false,
};

const defaultExpenseSettings = {
  ativo: true,
};

const defaultEmployeeControlSettings = {
  ativo: false,
};

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizePaymentMethods(value = {}) {
  const nextPaymentMethods = paymentMethodKeys.reduce((settings, key) => {
    settings[key] = normalizeBoolean(value?.[key], defaultPaymentMethods[key]);
    return settings;
  }, {});

  if (!paymentMethodKeys.some(key => nextPaymentMethods[key])) {
    return { ...defaultPaymentMethods };
  }

  return nextPaymentMethods;
}

function normalizeExpenseSettings(value = {}) {
  return {
    ativo: normalizeBoolean(value?.ativo, defaultExpenseSettings.ativo),
  };
}

function normalizeEmployeeControlSettings(value = {}) {
  return {
    ativo: normalizeBoolean(value?.ativo, defaultEmployeeControlSettings.ativo),
  };
}

function sanitizeConfiguracao(configuracao) {
  const data = configuracao?.get ? configuracao.get({ plain: true }) : configuracao || {};

  return {
    id: data.id ?? null,
    usuario_id: data.usuario_id ?? null,
    formas_pagamento: normalizePaymentMethods(data.formas_pagamento),
    lancar_despesas: normalizeExpenseSettings(data.lancar_despesas),
    controle_funcionarios: normalizeEmployeeControlSettings(data.controle_funcionarios),
    fiscal: data.fiscal && typeof data.fiscal === 'object' ? data.fiscal : {},
    integracoes: data.integracoes && typeof data.integracoes === 'object' ? data.integracoes : {},
    updated_at: data.updated_at ?? data.updatedAt ?? null,
  };
}

async function getOrCreateConfiguracao(usuarioId, options = {}) {
  const [configuracao] = await ConfiguracaoSistema.findOrCreate({
    where: {
      usuario_id: usuarioId,
    },
    defaults: {
      usuario_id: usuarioId,
      formas_pagamento: defaultPaymentMethods,
      lancar_despesas: defaultExpenseSettings,
      controle_funcionarios: defaultEmployeeControlSettings,
      fiscal: {},
      integracoes: {},
    },
    ...options,
  });

  return configuracao;
}

async function getConfiguracaoSnapshot(usuarioId, options = {}) {
  const configuracao = await getOrCreateConfiguracao(usuarioId, options);

  return sanitizeConfiguracao(configuracao);
}

async function updatePaymentMethods(usuarioId, paymentMethods) {
  const nextPaymentMethods = normalizePaymentMethods(paymentMethods);

  if (!paymentMethodKeys.some(key => paymentMethods?.[key] === true)) {
    const error = new Error('Mantenha pelo menos uma forma de pagamento ativa.');
    error.code = 'PAYMENT_METHOD_REQUIRED';
    error.status = 400;
    throw error;
  }

  const configuracao = await getOrCreateConfiguracao(usuarioId);

  configuracao.formas_pagamento = nextPaymentMethods;
  await configuracao.save();

  return sanitizeConfiguracao(configuracao);
}

module.exports = {
  defaultPaymentMethods,
  getConfiguracaoSnapshot,
  normalizePaymentMethods,
  sanitizeConfiguracao,
  updatePaymentMethods,
};
