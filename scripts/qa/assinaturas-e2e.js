require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { Op } = require('sequelize');

const apiSrcRoot = process.env.QA_API_SRC_ROOT
  ? path.resolve(process.env.QA_API_SRC_ROOT)
  : fs.existsSync(path.resolve(process.cwd(), 'src/database.js'))
    ? path.resolve(process.cwd(), 'src')
    : fs.existsSync(path.resolve(process.cwd(), 'dist/database/index.js'))
      ? path.resolve(process.cwd(), 'dist')
    : path.resolve(process.cwd(), 'api/src');

function fromApiSrc(relativePath) {
  return require(path.join(apiSrcRoot, relativePath));
}

const sequelize = fromApiSrc('database');
const authConfig = fromApiSrc('config/auth');
const {
  AcaoAdminAssinatura,
  Administrador,
  AlteracaoAssinatura,
  Assinatura,
  CategoriaProduto,
  CodigoAssinatura,
  GrupoFiscal,
  PagamentoAssinatura,
  Pdv,
  Produto,
  Subconta,
  Usuario,
} = fromApiSrc('app/models');
const { buildPlanoSnapshot, getPlano } = fromApiSrc('app/services/planosService');
const {
  buildPlanoFromCodigoAssinatura,
} = fromApiSrc('app/services/codigosAssinaturaService');
const {
  cancelMercadoPagoPreapproval,
  getMercadoPagoPreapproval,
  searchMercadoPagoAuthorizedPayments,
} = fromApiSrc('app/services/mercadoPagoService');
const {
  syncAssinaturaPagamentosMercadoPago,
  upsertPagamentoAssinatura,
} = fromApiSrc('app/services/pagamentosAssinaturaService');
const {
  calcularReguaInadimplencia,
  getBillingStatus,
} = fromApiSrc('app/services/assinaturaInadimplenciaService');

const API_BASE_URL = process.env.QA_API_BASE_URL || 'http://127.0.0.1:3333';
const ADMIN_EMAIL = process.env.QA_ADMIN_EMAIL || 'admin@admin.com';
const TEST_PASSWORD = process.env.QA_TEST_PASSWORD || 'Aa12345678';
const runId = process.env.QA_RUN_ID || new Date().toISOString().replace(/\D/g, '').slice(2, 12);
const emailBase = Number(runId.slice(-8)) || Math.floor(Date.now() / 1000);
const results = [];
const context = {
  adminToken: null,
  mpPreapprovals: new Set(),
  plans: [],
};

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function email(index) {
  return `teste${emailBase}${String(index).padStart(2, '0')}@teste.com`;
}

function summarize(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function record(id, state, result, evidence = {}) {
  results.push({
    id,
    state,
    result,
    evidence: summarize(evidence),
  });
}

async function test(id, fn) {
  try {
    const output = await fn();
    if (output && output.state) {
      record(id, output.state, output.result, output.evidence);
    } else if (output) {
      record(id, 'Passou', output.result || 'Validado.', output.evidence || {});
    } else {
      record(id, 'Passou', 'Validado.', {});
    }
  } catch (error) {
    record(id, 'Falhou', error.message, {
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
    });
  }
}

function assert(condition, message, evidence = {}) {
  if (!condition) {
    const error = new Error(message);
    error.evidence = evidence;
    throw error;
  }
}

async function api(path, { method = 'GET', token = null, body = undefined, expect = [200] } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  const expected = Array.isArray(expect) ? expect : [expect];
  if (!expected.includes(response.status)) {
    const error = new Error(`HTTP ${response.status} em ${method} ${path}: ${data?.message || text}`);
    error.response = { status: response.status, data };
    throw error;
  }
  return { status: response.status, data };
}

async function bootstrapAdminToken() {
  const admin = await Administrador.findOne({ where: { email: ADMIN_EMAIL, ativo: true } });
  assert(admin, `Administrador ${ADMIN_EMAIL} nao encontrado ou inativo.`);
  context.adminToken = jwt.sign(
    {
      admin_id: admin.id,
      email: admin.email,
      tipo: 'admin',
    },
    authConfig.adminSecret,
    { expiresIn: authConfig.adminExpiresIn }
  );
}

async function createUser(index) {
  const userEmail = email(index);
  const response = await api('/usuarios', {
    method: 'POST',
    body: { email: userEmail, senha: TEST_PASSWORD },
    expect: 201,
  });
  return response.data;
}

async function loginUser(userEmail) {
  const response = await api('/sessions', {
    method: 'POST',
    body: { email: userEmail, senha: TEST_PASSWORD },
    expect: 200,
  });
  return response.data.token;
}

async function createPlan(body) {
  const response = await api('/admin/planos', {
    method: 'POST',
    token: context.adminToken,
    body,
    expect: 201,
  });
  context.plans.push(response.data.plano.id);
  return response.data;
}

async function updatePlan(planId, body) {
  const response = await api(`/admin/planos/${encodeURIComponent(planId)}`, {
    method: 'PUT',
    token: context.adminToken,
    body,
    expect: 200,
  });
  return response.data;
}

function customPlanBody(nome, overrides = {}) {
  return {
    nome: `QA ${runId} ${nome}`,
    personalizado: true,
    gratuito: false,
    valor_centavos: 1000,
    intervalo: 'mensal',
    intervalo_quantidade: 1,
    trial_dias: 0,
    limite_pdvs: 1,
    limite_subcontas: 0,
    emissao_fiscal: false,
    observacao: `Rodada QA ${runId}`,
    ...overrides,
  };
}

function publicPlanBody(nome, overrides = {}) {
  return {
    nome: `QA ${runId} ${nome}`,
    personalizado: false,
    valor_centavos: 1990,
    limite_pdvs: 1,
    limite_subcontas: 0,
    emissao_fiscal: false,
    ...overrides,
  };
}

async function findUserByEmail(userEmail) {
  const user = await Usuario.findOne({ where: { email: userEmail } });
  assert(user, `Usuario ${userEmail} nao encontrado.`);
  return user;
}

async function findLatestSubscription(userId) {
  return Assinatura.findOne({
    where: { usuario_id: userId },
    order: [['id', 'DESC']],
  });
}

async function createActiveSubscription(user, planId, overrides = {}) {
  const plano = await getPlano(planId);
  assert(plano, `Plano ${planId} nao encontrado para ativacao direta.`);
  const now = new Date();
  return Assinatura.create({
    usuario_id: user.id,
    plano: plano.id,
    plano_versao_id: plano.plano_versao_id || null,
    plano_snapshot: buildPlanoSnapshot(plano),
    status: overrides.status || 'ativa',
    valor_centavos: overrides.valor_centavos ?? plano.valor_centavos,
    valor_recorrente_centavos: overrides.valor_recorrente_centavos ?? plano.valor_centavos,
    valor_primeiro_pagamento_centavos: overrides.valor_primeiro_pagamento_centavos ?? plano.valor_centavos,
    moeda: plano.moeda || 'BRL',
    referencia_externa: overrides.referencia_externa || `qa-${runId}-${crypto.randomUUID()}`,
    tipo_movimento: overrides.tipo_movimento || 'qa_ativacao_direta',
    iniciada_em: overrides.iniciada_em || now,
    ativada_em: overrides.ativada_em || now,
    proximo_pagamento_em:
      Object.prototype.hasOwnProperty.call(overrides, 'proximo_pagamento_em')
        ? overrides.proximo_pagamento_em
        : addMonths(now, 1),
  });
}

async function createActiveUserWithPlan(index, planId, overrides = {}) {
  const created = await createUser(index);
  const user = await findUserByEmail(created.email);
  const assinatura = await createActiveSubscription(user, planId, overrides);
  const token = await loginUser(created.email);
  return { user, email: created.email, assinatura, token };
}

async function createActiveUserWithNewCustomPlan(index, planOverrides = {}, assinaturaOverrides = {}) {
  const planResponse = await createPlan(customPlanBody(`Conta ${index}`, planOverrides));
  const active = await createActiveUserWithPlan(index, planResponse.plano.id, assinaturaOverrides);
  return { ...active, plan: planResponse.plano, code: planResponse.codigo?.codigo };
}

async function checkoutWithCode(userEmail, code, expect = [200, 201]) {
  const response = await api('/assinaturas/checkout', {
    method: 'POST',
    body: { email: userEmail, codigo_assinatura: code },
    expect,
  });
  const user = await Usuario.findOne({ where: { email: userEmail } });
  const assinatura = user ? await findLatestSubscription(user.id) : null;
  if (assinatura?.mercado_pago_preapproval_id) {
    context.mpPreapprovals.add(assinatura.mercado_pago_preapproval_id);
  }
  return { response, assinatura };
}

async function setSubscriptionDue(assinatura, daysAgoOrFuture) {
  const due = addDays(new Date(), daysAgoOrFuture);
  await assinatura.update({ proximo_pagamento_em: due });
  return due;
}

async function createSyntheticPayment(assinatura, overrides = {}) {
  const now = new Date();
  return PagamentoAssinatura.create({
    assinatura_id: assinatura.id,
    usuario_id: assinatura.usuario_id,
    mercado_pago_payment_id: overrides.mercado_pago_payment_id || `qa-pay-${runId}-${crypto.randomUUID()}`,
    mercado_pago_authorized_payment_id: overrides.mercado_pago_authorized_payment_id || null,
    mercado_pago_preapproval_id: assinatura.mercado_pago_preapproval_id || overrides.mercado_pago_preapproval_id || null,
    referencia_externa: assinatura.referencia_externa,
    status: overrides.status || 'approved',
    status_detalhe: overrides.status_detalhe || null,
    valor_centavos: overrides.valor_centavos ?? assinatura.valor_centavos,
    valor_liquido_centavos: overrides.valor_liquido_centavos ?? assinatura.valor_centavos,
    moeda: assinatura.moeda || 'BRL',
    forma_pagamento: overrides.forma_pagamento || 'qa',
    parcelas: overrides.parcelas || 1,
    pago_em: Object.prototype.hasOwnProperty.call(overrides, 'pago_em') ? overrides.pago_em : now,
    vencimento_em: overrides.vencimento_em || assinatura.proximo_pagamento_em || now,
    processado_em: overrides.processado_em || now,
    payload_mercado_pago: { qa: true, runId, ...overrides.payload_mercado_pago },
  });
}

async function cleanupMpPreapprovals() {
  for (const preapprovalId of context.mpPreapprovals) {
    try {
      await cancelMercadoPagoPreapproval(preapprovalId);
    } catch {
      // Assinaturas pendentes/canceladas de homologacao podem recusar cancelamento repetido.
    }
  }
}

async function run() {
  await bootstrapAdminToken();
  await api('/health', { expect: 200 });

  let paidCheckoutPlan;
  let paidCheckoutUser;
  let paidCheckoutAssinatura;

  await test('T01', async () => {
    const planResponse = await createPlan(customPlanBody('Pago imediato diario', {
      intervalo: 'dias',
      intervalo_quantidade: 1,
      limite_pdvs: 1,
      limite_subcontas: 1,
    }));
    paidCheckoutPlan = planResponse;
    const user = await createUser(1);
    paidCheckoutUser = user;
    const checkout = await checkoutWithCode(user.email, planResponse.codigo.codigo, 201);
    paidCheckoutAssinatura = checkout.assinatura;
    assert(checkout.response.data.checkoutUrl, 'Checkout do Mercado Pago nao retornou URL.');
    assert(checkout.response.data.checkoutToken, 'Checkout nao retornou token opaco.');
    assert(paidCheckoutAssinatura?.mercado_pago_preapproval_id, 'Assinatura nao recebeu preapproval_id.');
    return {
      result: 'Plano personalizado pago imediato gerou checkout e vinculou assinatura pendente.',
      evidence: {
        email: user.email,
        plano_id: planResponse.plano.id,
        assinatura_id: paidCheckoutAssinatura.id,
        preapproval_id: paidCheckoutAssinatura.mercado_pago_preapproval_id,
        checkout_token: Boolean(checkout.response.data.checkoutToken),
      },
    };
  });

  await test('T07', async () => {
    const other = await createUser(7);
    const response = await api('/assinaturas/checkout', {
      method: 'POST',
      body: { email: other.email, codigo_assinatura: paidCheckoutPlan.codigo.codigo },
      expect: 400,
    });
    return {
      result: 'Codigo personalizado usado nao pode ser reutilizado por outra conta.',
      evidence: { email: other.email, status: response.status, message: response.data.message },
    };
  });

  await test('T08', async () => {
    const checkout = await checkoutWithCode(paidCheckoutUser.email, paidCheckoutPlan.codigo.codigo, 200);
    assert(checkout.response.data.reused === true, 'Checkout pendente nao foi reaberto como reutilizado.');
    assert(checkout.response.data.checkoutUrl, 'Checkout reaberto nao retornou URL.');
    return {
      result: 'Checkout pendente foi reaberto para a mesma conta sem invalidar o fluxo.',
      evidence: {
        email: paidCheckoutUser.email,
        assinatura_id: checkout.assinatura.id,
        reused: checkout.response.data.reused,
      },
    };
  });

  let freeAccount;
  await test('T02', async () => {
    const planResponse = await createPlan(customPlanBody('Gratis', {
      gratuito: true,
      valor_centavos: 0,
      limite_pdvs: 1,
      limite_subcontas: 1,
    }));
    const user = await createUser(2);
    const checkout = await checkoutWithCode(user.email, planResponse.codigo.codigo, 201);
    const token = await loginUser(user.email);
    const entitlements = await api('/assinaturas/entitlements', { token });
    freeAccount = { user: await findUserByEmail(user.email), token, assinatura: checkout.assinatura };
    assert(checkout.response.data.assinaturaAtiva === true, 'Plano gratis nao ativou assinatura.');
    assert(!checkout.assinatura.mercado_pago_preapproval_id, 'Plano gratis criou preapproval indevido.');
    return {
      result: 'Plano personalizado gratis ativou acesso sem Mercado Pago.',
      evidence: {
        email: user.email,
        plano_id: planResponse.plano.id,
        assinatura_id: checkout.assinatura.id,
        billing_fase: entitlements.data.billing_status.fase,
      },
    };
  });

  await test('T47', async () => {
    const payments = await PagamentoAssinatura.count({ where: { assinatura_id: freeAccount.assinatura.id } });
    const billing = await getBillingStatus(freeAccount.user.id);
    assert(payments === 0, 'Plano gratis gerou historico financeiro.');
    assert(billing.fase === 'regular' && billing.motivo === 'plano_gratuito', 'Plano gratis entrou em regua financeira indevida.');
    return {
      result: 'Conta gratis nao cria cobranca e fica regular por motivo de plano gratuito.',
      evidence: { pagamentos: payments, fase: billing.fase, motivo: billing.motivo },
    };
  });

  await test('T03', async () => {
    const planResponse = await createPlan(customPlanBody('Trial 30', {
      trial_dias: 30,
      limite_pdvs: 1,
      limite_subcontas: 1,
    }));
    const active = await createActiveUserWithPlan(3, planResponse.plano.id, {
      proximo_pagamento_em: addDays(new Date(), 30),
    });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'regular' && billing.bloqueado === false, 'Trial de 30 dias ficou irregular.');
    return {
      result: 'Plano com 30 dias gratis libera a conta ate a primeira cobranca futura.',
      evidence: {
        email: active.email,
        plano_id: planResponse.plano.id,
        proximo_pagamento_em: billing.proximo_pagamento_em,
        fase: billing.fase,
      },
    };
  });

  await test('T04', async () => {
    const planResponse = await createPlan(customPlanBody('Trial 90', {
      trial_dias: 90,
      limite_pdvs: 1,
      limite_subcontas: 1,
    }));
    const active = await createActiveUserWithPlan(4, planResponse.plano.id, {
      proximo_pagamento_em: addDays(new Date(), 90),
    });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'regular' && billing.dias_em_atraso === 0, 'Trial longo iniciou inadimplencia antes da data.');
    return {
      result: 'Trial de 90 dias nao inicia inadimplencia antes do vencimento.',
      evidence: { email: active.email, proximo_pagamento_em: billing.proximo_pagamento_em },
    };
  });

  await test('T05', async () => {
    const planResponse = await createPlan(customPlanBody('Diario', {
      intervalo: 'dias',
      intervalo_quantidade: 1,
    }));
    assert(planResponse.plano.versao_atual.intervalo === 'dias', 'Plano diario nao salvou intervalo em dias.');
    assert(Number(planResponse.plano.versao_atual.intervalo_quantidade) === 1, 'Plano diario nao salvou quantidade 1.');
    return {
      result: 'Frequencia diaria salva e exposta no plano.',
      evidence: {
        plano_id: planResponse.plano.id,
        intervalo: planResponse.plano.versao_atual.intervalo,
        quantidade: planResponse.plano.versao_atual.intervalo_quantidade,
      },
    };
  });

  let sevenDaysPlan;
  await test('T06', async () => {
    const planResponse = await createPlan(customPlanBody('Sete dias', {
      intervalo: 'dias',
      intervalo_quantidade: 7,
    }));
    sevenDaysPlan = planResponse;
    const user = await createUser(6);
    const checkout = await checkoutWithCode(user.email, planResponse.codigo.codigo, 201);
    const preapproval = await getMercadoPagoPreapproval(checkout.assinatura.mercado_pago_preapproval_id);
    assert(preapproval.auto_recurring?.frequency_type === 'days', 'Mercado Pago nao recebeu frequencia em dias.');
    assert(Number(preapproval.auto_recurring?.frequency) === 7, 'Mercado Pago nao recebeu frequencia 7.');
    return {
      result: 'Plano personalizado a cada 7 dias gerou checkout com recorrencia correta no Mercado Pago.',
      evidence: {
        email: user.email,
        preapproval_id: checkout.assinatura.mercado_pago_preapproval_id,
        frequency: preapproval.auto_recurring?.frequency,
        frequency_type: preapproval.auto_recurring?.frequency_type,
      },
    };
  });

  let limitsAccount;
  await test('T09', async () => {
    const active = await createActiveUserWithNewCustomPlan(9, {
      limite_subcontas: 0,
      limite_pdvs: 1,
    });
    limitsAccount = active;
    const before = await api('/subcontas', {
      method: 'POST',
      token: active.token,
      body: {
        nome: 'Sub QA bloqueada',
        email: `subbloq${emailBase}@teste.com`,
        senha: TEST_PASSWORD,
        permissoes: ['pdvs_subcontas'],
      },
      expect: [403, 409],
    });
    await updatePlan(active.plan.id, customPlanBody('Conta 9 editado', {
      valor_centavos: 1000,
      limite_subcontas: 1,
      limite_pdvs: 1,
    }));
    const entitlements = await api('/assinaturas/entitlements', { token: active.token });
    assert(entitlements.data.limites.subcontas_ativas === 1, 'Limite editado de subcontas nao refletiu no entitlement.');
    return {
      result: 'Edicao de plano personalizado sincroniza assinatura ativa e libera limite de subcontas.',
      evidence: {
        email: active.email,
        bloqueio_antes: before.data.code,
        limite_depois: entitlements.data.limites.subcontas_ativas,
      },
    };
  });

  await test('T11', async () => {
    const first = await api('/subcontas', {
      method: 'POST',
      token: limitsAccount.token,
      body: {
        nome: 'Sub QA 1',
        email: `sub${emailBase}01@teste.com`,
        senha: TEST_PASSWORD,
        permissoes: ['pdvs_subcontas'],
      },
      expect: 201,
    });
    const second = await api('/subcontas', {
      method: 'POST',
      token: limitsAccount.token,
      body: {
        nome: 'Sub QA 2',
        email: `sub${emailBase}02@teste.com`,
        senha: TEST_PASSWORD,
        permissoes: ['pdvs_subcontas'],
      },
      expect: [403, 409],
    });
    assert(second.data.code === 'PLAN_LIMIT_REACHED', 'Segunda subconta nao retornou PLAN_LIMIT_REACHED.');
    return {
      result: 'Limite de 1 subconta permite a primeira e bloqueia a segunda.',
      evidence: { primeira_subconta_id: first.data.subconta.id, bloqueio: second.data.code },
    };
  });

  let pdvLimitsAccount;
  await test('T12', async () => {
    const active = await createActiveUserWithNewCustomPlan(12, {
      limite_pdvs: 1,
      limite_subcontas: 0,
    });
    pdvLimitsAccount = active;
    const first = await api('/pdvs', {
      method: 'POST',
      token: active.token,
      body: { nome: 'PDV QA 1' },
      expect: 201,
    });
    const second = await api('/pdvs', {
      method: 'POST',
      token: active.token,
      body: { nome: 'PDV QA 2' },
      expect: [403, 409],
    });
    assert(second.data.code === 'PLAN_LIMIT_REACHED', 'Segundo PDV nao retornou PLAN_LIMIT_REACHED.');
    return {
      result: 'Limite de 1 PDV bloqueia criacao do segundo PDV.',
      evidence: { primeiro_pdv_id: first.data.id, bloqueio: second.data.code },
    };
  });

  await test('T10', async () => {
    await updatePlan(pdvLimitsAccount.plan.id, customPlanBody('PDV editado', {
      valor_centavos: 1000,
      limite_pdvs: 2,
      limite_subcontas: 0,
    }));
    const entitlements = await api('/assinaturas/entitlements', { token: pdvLimitsAccount.token });
    const second = await api('/pdvs', {
      method: 'POST',
      token: pdvLimitsAccount.token,
      body: { nome: 'PDV QA 2 liberado' },
      expect: 201,
    });
    return {
      result: 'Edicao de limite de PDVs refletiu na assinatura e liberou novo PDV.',
      evidence: {
        limite_pdvs: entitlements.data.limites.pdvs_ativos,
        segundo_pdv_id: second.data.id,
      },
    };
  });

  let fiscalAccount;
  await test('T14', async () => {
    const active = await createActiveUserWithNewCustomPlan(14, {
      emissao_fiscal: false,
      limite_pdvs: 1,
      limite_subcontas: 0,
    });
    fiscalAccount = active;
    const grupos = await api('/grupos-fiscais', { token: active.token, expect: 403 });
    const nf = await api('/nf', { token: active.token, expect: 403 });
    assert(grupos.data.code === 'PLAN_FEATURE_REQUIRED', 'Grupos fiscais nao bloquearam por recurso do plano.');
    assert(nf.data.code === 'PLAN_FEATURE_REQUIRED', 'NF nao bloqueou por recurso do plano.');
    return {
      result: 'Sem emissao fiscal, grupos fiscais e NF ficam bloqueados por entitlement.',
      evidence: { grupos_code: grupos.data.code, nf_code: nf.data.code },
    };
  });

  await test('T13', async () => {
    await updatePlan(fiscalAccount.plan.id, customPlanBody('Fiscal liberado', {
      valor_centavos: 1000,
      limite_pdvs: 1,
      limite_subcontas: 0,
      emissao_fiscal: true,
    }));
    const grupos = await api('/grupos-fiscais', { token: fiscalAccount.token, expect: 200 });
    const nf = await api('/nf', { token: fiscalAccount.token, expect: 200 });
    return {
      result: 'Ao liberar emissao fiscal no plano, rotas fiscais passam a abrir.',
      evidence: {
        grupos_status: grupos.status,
        grupos_count: Array.isArray(grupos.data) ? grupos.data.length : null,
        nf_status: nf.status,
      },
    };
  });

  await test('T15', async () => {
    const active = await createActiveUserWithPlan(15, 'inicial', {
      proximo_pagamento_em: addDays(new Date(), 20),
    });
    const response = await api('/assinaturas/gerenciar-checkout', {
      method: 'POST',
      token: active.token,
      body: { acao: 'mudar_plano', plano: 'completo' },
      expect: 201,
    });
    if (response.data.mercadoPagoPreapprovalId) {
      context.mpPreapprovals.add(response.data.mercadoPagoPreapprovalId);
    }
    assert(response.data.checkoutUrl, 'Upgrade nao gerou checkout.');
    assert(response.data.valorPrimeiroPagamentoCentavos <= response.data.valorRecorrenteCentavos, 'Rateio do upgrade inconsistente.');
    return {
      result: 'Upgrade gera novo checkout e aplica valor de primeira cobranca com rateio.',
      evidence: {
        email: active.email,
        valor_primeiro: response.data.valorPrimeiroPagamentoCentavos,
        valor_recorrente: response.data.valorRecorrenteCentavos,
        credito: response.data.creditoRateioCentavos,
      },
    };
  });

  await test('T16', async () => {
    const active = await createActiveUserWithPlan(16, 'completo', {
      proximo_pagamento_em: addDays(new Date(), 18),
    });
    const response = await api('/assinaturas/gerenciar-checkout', {
      method: 'POST',
      token: active.token,
      body: { acao: 'mudar_plano', plano: 'inicial' },
      expect: 200,
    });
    const activeSub = await Assinatura.findByPk(active.assinatura.id);
    assert(response.data.alteracaoAgendada === true, 'Downgrade nao foi agendado.');
    assert(activeSub.status === 'ativa' && activeSub.plano === 'completo', 'Downgrade alterou o plano antes do periodo terminar.');
    return {
      result: 'Downgrade fica agendado para a proxima fatura e preserva o plano atual.',
      evidence: {
        email: active.email,
        aplicar_em: response.data.aplicarEm,
        plano_atual: activeSub.plano,
      },
    };
  });

  let adminActionAccount;
  await test('T17', async () => {
    adminActionAccount = await createActiveUserWithNewCustomPlan(17, {
      limite_pdvs: 1,
      limite_subcontas: 0,
    });
    const response = await api(`/admin/usuarios/${adminActionAccount.user.id}/assinaturas/${adminActionAccount.assinatura.id}/valor`, {
      method: 'POST',
      token: context.adminToken,
      body: { valor_centavos: 2500, motivo: 'QA ajuste de valor' },
      expect: 200,
    });
    const audit = await AcaoAdminAssinatura.count({
      where: { assinatura_id: adminActionAccount.assinatura.id, acao: 'ajustar_valor' },
    });
    assert(response.data.assinatura.valor_recorrente_centavos === 2500, 'Valor recorrente nao atualizou.');
    assert(audit >= 1, 'Ajuste de valor nao gerou auditoria.');
    return {
      result: 'Ajuste manual de valor atualiza assinatura e cria auditoria.',
      evidence: { valor_recorrente: response.data.assinatura.valor_recorrente_centavos, auditorias: audit },
    };
  });

  await test('T18', async () => {
    const response = await api(`/admin/usuarios/${adminActionAccount.user.id}/assinaturas/${adminActionAccount.assinatura.id}/trial`, {
      method: 'POST',
      token: context.adminToken,
      body: { dias_gratis: 15, motivo: 'QA prazo gratis' },
      expect: 200,
    });
    const billing = await getBillingStatus(adminActionAccount.user.id);
    assert(new Date(response.data.assinatura.proximo_pagamento_em) > new Date(), 'Prazo gratis nao empurrou proximo pagamento.');
    assert(billing.fase === 'regular', 'Prazo gratis gerou inadimplencia indevida.');
    return {
      result: 'Dias gratis pelo admin atualizam proximo pagamento e mantem conta regular.',
      evidence: { proximo_pagamento_em: response.data.assinatura.proximo_pagamento_em, fase: billing.fase },
    };
  });

  await test('T19', async () => {
    const active = await createActiveUserWithNewCustomPlan(19);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), 0) });
    const billing = await getBillingStatus(active.user.id);
    assert(['regular', 'aviso'].includes(billing.fase), 'Vencimento hoje bloqueou ou atrasou indevidamente.');
    assert(billing.bloqueado === false, 'Vencimento hoje bloqueou a conta.');
    return {
      result: 'Vencimento no dia nao bloqueia a operacao.',
      evidence: { fase: billing.fase, bloqueado: billing.bloqueado },
    };
  });

  let overdueAccount;
  await test('T20', async () => {
    overdueAccount = await createActiveUserWithNewCustomPlan(20);
    await overdueAccount.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -2) });
    const billing = await getBillingStatus(overdueAccount.user.id);
    assert(billing.fase === 'atrasada' && billing.bloqueado === false, 'Atraso recente nao ficou em aviso operacional.');
    return {
      result: 'Atraso de 2 dias mostra inadimplencia sem bloqueio.',
      evidence: { fase: billing.fase, dias_em_atraso: billing.dias_em_atraso, dias_para_bloqueio: billing.dias_para_bloqueio },
    };
  });

  await test('T21', async () => {
    const active = await createActiveUserWithNewCustomPlan(21);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -7) });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'bloqueada' && billing.bloqueado === true, 'Limite de 7 dias nao entrou no bloqueio configurado.');
    return {
      result: 'No limite de 7 dias, a regua atual entra em bloqueio conforme tolerancia configurada.',
      evidence: { fase: billing.fase, dias_em_atraso: billing.dias_em_atraso, tolerancia_dias: billing.tolerancia_dias },
    };
  });

  let blockedAccount;
  await test('T22', async () => {
    blockedAccount = await createActiveUserWithNewCustomPlan(22);
    await blockedAccount.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -10) });
    const billing = await getBillingStatus(blockedAccount.user.id);
    assert(billing.fase === 'bloqueada' && billing.bloqueado === true, 'Atraso de 10 dias nao bloqueou.');
    const pdv = await api('/pdvs', {
      method: 'POST',
      token: blockedAccount.token,
      body: { nome: 'PDV bloqueado' },
      expect: [402, 403],
    });
    assert(pdv.data.code === 'SUBSCRIPTION_BLOCKED', 'Criacao de PDV em conta bloqueada nao retornou SUBSCRIPTION_BLOCKED.');
    return {
      result: 'Atraso de 10 dias bloqueia a conta e impede operacoes protegidas.',
      evidence: { fase: billing.fase, pdv_code: pdv.data.code },
    };
  });

  await test('T23', async () => {
    await createSyntheticPayment(blockedAccount.assinatura, {
      status: 'approved',
      pago_em: new Date(),
      processado_em: new Date(),
    });
    const billing = await getBillingStatus(blockedAccount.user.id);
    assert(billing.fase === 'regular' && billing.bloqueado === false, 'Pagamento aprovado nao regularizou a conta.');
    return {
      result: 'Pagamento aprovado apos bloqueio regulariza a regua operacional local.',
      evidence: { fase: billing.fase, motivo: billing.motivo, pagamento_referencia: billing.pagamento_referencia },
    };
  });

  let pdvRegular;
  await test('T24', async () => {
    const active = await createActiveUserWithNewCustomPlan(24, {
      limite_pdvs: 2,
      limite_subcontas: 0,
    });
    const created = await api('/pdvs', {
      method: 'POST',
      token: active.token,
      body: { nome: 'PDV QA regular' },
      expect: 201,
    });
    const paired = await api('/pdvs/parear', {
      method: 'POST',
      body: { codigo: created.data.codigo_pareamento, dispositivo_id: `qa-${runId}-regular` },
      expect: 200,
    });
    pdvRegular = { active, pdv: paired.data.pdv, credential: paired.data.credencial_dispositivo };
    assert(paired.data.billing_status.bloqueado === false, 'PDV pareado em conta regular veio bloqueado.');
    return {
      result: 'PDV ativa com codigo de pareamento em assinatura regular.',
      evidence: { email: active.email, pdv_id: paired.data.pdv.id, billing_fase: paired.data.billing_status.fase },
    };
  });

  await test('T25', async () => {
    await pdvRegular.active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -2) });
    const session = await api('/pdvs/sessao', {
      method: 'POST',
      body: {
        dispositivo_id: `qa-${runId}-regular`,
        credencial_dispositivo: pdvRegular.credential,
      },
      expect: 200,
    });
    assert(session.data.billing_status.bloqueado === false, 'PDV em aviso bloqueou sessao.');
    assert(session.data.billing_status.fase === 'atrasada', 'PDV nao recebeu fase de atraso.');
    return {
      result: 'PDV em atraso recente recebe alerta via billing_status sem bloquear.',
      evidence: { fase: session.data.billing_status.fase, bloqueado: session.data.billing_status.bloqueado },
    };
  });

  await test('T26', async () => {
    await pdvRegular.active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -10) });
    const response = await api('/pdvs/sync/push', {
      method: 'POST',
      body: {
        dispositivo_id: `qa-${runId}-regular`,
        credencial_dispositivo: pdvRegular.credential,
        eventos: [
          {
            id: `evt-${runId}-blocked-open`,
            event_type: 'turno_aberto',
            aggregate_type: 'caixa',
            aggregate_id: `caixa-${runId}-blocked`,
            idempotency_key: `idem-${runId}-blocked-open`,
            payload: {
              session: {
                id: `caixa-${runId}-blocked`,
                openedAt: new Date().toISOString(),
                shiftNumber: 1,
              },
            },
          },
        ],
      },
      expect: 200,
    });
    const event = response.data.eventos[0];
    assert(response.data.billing_status.bloqueado === true, 'PDV bloqueado nao retornou billing_status bloqueado.');
    assert(event.code === 'SUBSCRIPTION_BLOCKED', 'Evento operacional do PDV bloqueado nao foi recusado.');
    return {
      result: 'PDV bloqueado impede evento de abertura de caixa/venda.',
      evidence: { billing_fase: response.data.billing_status.fase, event_code: event.code },
    };
  });

  await test('T27', async () => {
    const accountA = await createActiveUserWithNewCustomPlan(27, {
      emissao_fiscal: true,
      limite_pdvs: 2,
      limite_subcontas: 1,
    });
    const accountB = await createActiveUserWithNewCustomPlan(28, {
      emissao_fiscal: true,
      limite_pdvs: 2,
      limite_subcontas: 1,
    });
    const cat = await api('/produtos/categorias', {
      method: 'POST',
      token: accountA.token,
      body: { nome: 'Categoria QA', icone: 'package', cor: 'laranja' },
      expect: 201,
    });
    const pdv = await api('/pdvs', {
      method: 'POST',
      token: accountA.token,
      body: { nome: 'PDV isolado' },
      expect: 201,
    });
    const sub = await api('/subcontas', {
      method: 'POST',
      token: accountA.token,
      body: { nome: 'Sub isolada', email: `subiso${emailBase}@teste.com`, senha: TEST_PASSWORD, permissoes: ['produtos'] },
      expect: 201,
    });
    const grupo = await api('/grupos-fiscais', {
      method: 'POST',
      token: accountA.token,
      body: {
        nome: 'Fiscal QA',
        regime_tributario: 'simples_nacional',
        cfop: '5102',
        csosn: '102',
        cst_pis: '01',
        cst_cofins: '01',
      },
      expect: 201,
    });
    const catByB = await api(`/produtos/categorias/${cat.data.id}`, {
      method: 'PUT',
      token: accountB.token,
      body: { nome: 'Tentativa B', icone: 'package', cor: 'laranja' },
      expect: 404,
    });
    const pdvByB = await api(`/pdvs/${pdv.data.id}`, {
      method: 'PUT',
      token: accountB.token,
      body: { nome: 'Tentativa B' },
      expect: 404,
    });
    const subByB = await api(`/subcontas/${sub.data.subconta.id}/dados`, {
      method: 'PUT',
      token: accountB.token,
      body: { nome: 'Tentativa B', email: `subisob${emailBase}@teste.com` },
      expect: 404,
    });
    const grupoByB = await api(`/grupos-fiscais/${grupo.data.id}`, {
      method: 'PUT',
      token: accountB.token,
      body: {
        nome: 'Tentativa B',
        regime_tributario: 'simples_nacional',
        cfop: '5102',
        csosn: '102',
        cst_pis: '01',
        cst_cofins: '01',
      },
      expect: 404,
    });
    return {
      result: 'Token de uma conta nao altera cadastros, fiscal, PDVs ou subcontas de outra.',
      evidence: {
        categoria_status: catByB.status,
        pdv_status: pdvByB.status,
        subconta_status: subByB.status,
        grupo_fiscal_status: grupoByB.status,
      },
    };
  });

  await test('T28', async () => {
    const response = await api(`/admin/usuarios?busca=${encodeURIComponent(limitsAccount.email)}`, {
      token: context.adminToken,
      expect: 200,
    });
    const row = response.data.usuarios.find(item => item.email === limitsAccount.email);
    assert(row, 'Usuario nao apareceu na lista administrativa.');
    for (const key of ['registrado_em', 'plano', 'assinatura_status', 'proximo_pagamento_em', 'fiscal_configurado', 'vendas_30_dias', 'pdvs_ativos', 'subcontas_ativas']) {
      assert(Object.prototype.hasOwnProperty.call(row, key), `Campo administrativo ausente: ${key}`);
    }
    return {
      result: 'Lista administrativa retorna campos operacionais definidos para usuarios.',
      evidence: {
        email: row.email,
        plano: row.plano,
        assinatura_status: row.assinatura_status,
        subcontas_ativas: row.subcontas_ativas,
      },
    };
  });

  await test('T29', async () => {
    const response = await api(`/admin/usuarios/${adminActionAccount.user.id}`, {
      token: context.adminToken,
      expect: 200,
    });
    assert(Array.isArray(response.data.auditoria) && response.data.auditoria.length >= 2, 'Detalhe admin nao trouxe auditoria.');
    assert(Array.isArray(response.data.pagamentos), 'Detalhe admin nao trouxe historico de pagamentos.');
    return {
      result: 'Detalhe administrativo expõe auditoria e historico financeiro da conta.',
      evidence: {
        email: adminActionAccount.email,
        auditorias: response.data.auditoria.length,
        pagamentos: response.data.pagamentos.length,
      },
    };
  });

  await test('T31', async () => {
    const realUser = await Usuario.findOne({ where: { email: 'teste1@teste.com' } });
    if (!realUser) {
      return {
        state: 'Bloqueado',
        result: 'Conta teste1@teste.com nao existe no banco atual para validar cobranca real.',
        evidence: {},
      };
    }
    const assinatura = await Assinatura.findOne({
      where: { usuario_id: realUser.id, mercado_pago_preapproval_id: { [Op.ne]: null } },
      order: [['id', 'DESC']],
    });
    if (!assinatura) {
      return {
        state: 'Bloqueado',
        result: 'Conta teste1@teste.com nao possui assinatura Mercado Pago para validacao real.',
        evidence: { usuario_id: realUser.id },
      };
    }
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    const count = await PagamentoAssinatura.count({ where: { assinatura_id: assinatura.id } });
    const payment = await PagamentoAssinatura.findOne({
      where: { assinatura_id: assinatura.id },
      order: [['id', 'DESC']],
    });
    assert(count >= 1, 'Cobranca real existente nao foi conciliada para pagamentos_assinaturas.');
    return {
      result: 'Primeira cobranca real existente foi conciliada no historico.',
      evidence: {
        email: realUser.email,
        assinatura_id: assinatura.id,
        pagamentos: count,
        ultimo_status: payment.status,
        payment_id: payment.mercado_pago_payment_id,
        authorized_payment_id: payment.mercado_pago_authorized_payment_id,
      },
    };
  });

  await test('T32', async () => {
    const realUser = await Usuario.findOne({ where: { email: 'teste1@teste.com' } });
    const assinatura = realUser
      ? await Assinatura.findOne({
          where: { usuario_id: realUser.id, mercado_pago_preapproval_id: { [Op.ne]: null } },
          order: [['id', 'DESC']],
        })
      : null;
    if (!assinatura) {
      return {
        state: 'Bloqueado',
        result: 'Sem assinatura real para repetir conciliacao idempotente.',
        evidence: {},
      };
    }
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    const before = await PagamentoAssinatura.count({ where: { assinatura_id: assinatura.id } });
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    const after = await PagamentoAssinatura.count({ where: { assinatura_id: assinatura.id } });
    assert(after === before, 'Conciliacao duplicou historico de pagamento.');
    return {
      result: 'Conciliacao repetida nao duplica pagamento.',
      evidence: { assinatura_id: assinatura.id, antes: before, depois: after },
    };
  });

  await test('T33', async () => {
    const realUser = await Usuario.findOne({ where: { email: 'teste1@teste.com' } });
    const assinatura = realUser
      ? await Assinatura.findOne({
          where: { usuario_id: realUser.id, mercado_pago_preapproval_id: { [Op.ne]: null } },
          order: [['id', 'DESC']],
        })
      : null;
    if (!assinatura) {
      return { state: 'Bloqueado', result: 'Sem assinatura diaria real para acompanhar ciclos.', evidence: {} };
    }
    const payments = await searchMercadoPagoAuthorizedPayments({
      preapprovalId: assinatura.mercado_pago_preapproval_id,
      limit: 10,
    });
    const total = Array.isArray(payments.results) ? payments.results.length : 0;
    if (total < 2) {
      return {
        state: 'Bloqueado',
        result: 'Recorrencia diaria real depende do segundo ciclo do Mercado Pago; o ciclo ainda nao ocorreu no relogio externo.',
        evidence: { preapproval_id: assinatura.mercado_pago_preapproval_id, parcelas_autorizadas: total },
      };
    }
    return {
      result: 'Recorrencia diaria real possui pelo menos dois ciclos autorizados.',
      evidence: { preapproval_id: assinatura.mercado_pago_preapproval_id, parcelas_autorizadas: total },
    };
  });

  await test('T34', async () => {
    const checkout = await checkoutWithCode(email(6), sevenDaysPlan.codigo.codigo, 200);
    const preapproval = await getMercadoPagoPreapproval(checkout.assinatura.mercado_pago_preapproval_id);
    assert(preapproval.auto_recurring?.frequency_type === 'days', 'Preapproval de 7 dias perdeu frequency_type.');
    assert(Number(preapproval.auto_recurring?.frequency) === 7, 'Preapproval de 7 dias perdeu frequency.');
    return {
      result: 'Recorrencia de 7 dias validada no Mercado Pago; ciclo financeiro longo fica para monitoramento real.',
      evidence: {
        preapproval_id: checkout.assinatura.mercado_pago_preapproval_id,
        frequency_type: preapproval.auto_recurring.frequency_type,
        frequency: preapproval.auto_recurring.frequency,
      },
    };
  });

  await test('T35', async () => {
    const user = await createUser(35);
    const response = await api('/assinaturas/checkout', {
      method: 'POST',
      body: { email: user.email, plano: 'inicial' },
      expect: 201,
    });
    const assinatura = await findLatestSubscription(user.id);
    if (assinatura?.mercado_pago_preapproval_id) {
      context.mpPreapprovals.add(assinatura.mercado_pago_preapproval_id);
    }
    const preapproval = await getMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
    assert(response.data.checkoutUrl, 'Checkout de plano publico mensal nao gerou URL.');
    assert(preapproval.auto_recurring?.frequency_type === 'months', 'Plano publico nao criou recorrencia mensal.');
    return {
      result: 'Plano publico mensal cria checkout sem codigo e recorrencia mensal no Mercado Pago.',
      evidence: {
        email: user.email,
        assinatura_id: assinatura.id,
        preapproval_id: assinatura.mercado_pago_preapproval_id,
        frequency_type: preapproval.auto_recurring?.frequency_type,
      },
    };
  });

  await test('T36', async () => {
    const planResponse = await createPlan(customPlanBody('Falha primeira cobranca'));
    const created = await createUser(36);
    const user = await findUserByEmail(created.email);
    const assinatura = await createActiveSubscription(user, planResponse.plano.id, {
      status: 'pagamento_falhou',
      cancelada_em: new Date(),
    });
    const login = await api('/sessions', {
      method: 'POST',
      body: { email: created.email, senha: TEST_PASSWORD },
      expect: 403,
    });
    await createSyntheticPayment(assinatura, { status: 'rejected', status_detalhe: 'cc_rejected_other_reason' });
    const billing = await getBillingStatus(user.id);
    assert(login.data.code === 'SUBSCRIPTION_REQUIRED', 'Login de primeira cobranca falha ficou liberado.');
    assert(billing.bloqueado === true, 'Assinatura com pagamento_falhou nao ficou bloqueada.');
    return {
      result: 'Falha de primeira cobranca nao libera acesso indevidamente.',
      evidence: { login_code: login.data.code, billing_fase: billing.fase, motivo: billing.motivo },
    };
  });

  await test('T37', async () => {
    const active = await createActiveUserWithNewCustomPlan(37);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -2) });
    await createSyntheticPayment(active.assinatura, { status: 'recycling', pago_em: null });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.bloqueado === false && billing.fase === 'atrasada', 'Recycling bloqueou antes da tolerancia.');
    return {
      result: 'Pagamento em recycling gera atraso sem bloquear antes da tolerancia.',
      evidence: { fase: billing.fase, bloqueado: billing.bloqueado, motivo: billing.motivo },
    };
  });

  await test('T38', async () => {
    const active = await createActiveUserWithNewCustomPlan(38);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -2) });
    await createSyntheticPayment(active.assinatura, { status: 'waiting_for_gateway', pago_em: null });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.bloqueado === false && billing.fase === 'atrasada', 'waiting_for_gateway foi tratado como pagamento aprovado.');
    return {
      result: 'Pagamento em processamento nao e tratado como pago e segue em atraso sem bloqueio prematuro.',
      evidence: { fase: billing.fase, bloqueado: billing.bloqueado, pagamento_status: billing.pagamento_referencia?.status },
    };
  });

  await test('T39', async () => {
    const active = await createActiveUserWithNewCustomPlan(39);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -2) });
    await createSyntheticPayment(active.assinatura, { status: 'rejected', pago_em: null });
    const before = await getBillingStatus(active.user.id);
    await createSyntheticPayment(active.assinatura, { status: 'processed', pago_em: new Date() });
    const after = await getBillingStatus(active.user.id);
    assert(before.fase === 'atrasada', 'Falha inicial nao entrou em atraso.');
    assert(after.fase === 'regular' && after.bloqueado === false, 'Retentativa aprovada nao regularizou.');
    return {
      result: 'Retentativa aprovada regulariza assinatura em atraso.',
      evidence: { antes: before.fase, depois: after.fase, pagamento_final: after.pagamento_referencia?.status },
    };
  });

  await test('T40', async () => {
    const active = await createActiveUserWithNewCustomPlan(40);
    await active.assinatura.update({ proximo_pagamento_em: addDays(new Date(), -10) });
    await createSyntheticPayment(active.assinatura, { status: 'rejected', pago_em: null });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'bloqueada' && billing.bloqueado === true, 'Falha alem da tolerancia nao bloqueou.');
    return {
      result: 'Falha alem da tolerancia bloqueia a conta.',
      evidence: { fase: billing.fase, motivo: billing.motivo, dias_em_atraso: billing.dias_em_atraso },
    };
  });

  await test('T41', async () => {
    const planResponse = await createPlan(customPlanBody('Cancelamento externo'));
    const created = await createUser(41);
    const user = await findUserByEmail(created.email);
    const assinatura = await createActiveSubscription(user, planResponse.plano.id, {
      status: 'pagamento_falhou',
      cancelada_em: new Date(),
    });
    const billingFailed = await getBillingStatus(user.id);
    await assinatura.update({ status: 'cancelada', cancelada_em: new Date() });
    const billingCanceled = await getBillingStatus(user.id);
    assert(billingFailed.bloqueado === true && billingCanceled.bloqueado === true, 'Status externo falho/cancelado nao bloqueou.');
    return {
      result: 'Assinatura cancelada ou com pagamento_falhou fica sem operacao.',
      evidence: { falhou: billingFailed.motivo, cancelada: billingCanceled.motivo },
    };
  });

  await test('T42', async () => {
    const realUser = await Usuario.findOne({ where: { email: 'teste1@teste.com' } });
    const assinatura = realUser
      ? await Assinatura.findOne({
          where: { usuario_id: realUser.id, mercado_pago_preapproval_id: { [Op.ne]: null } },
          order: [['id', 'DESC']],
        })
      : null;
    if (!assinatura) {
      return { state: 'Bloqueado', result: 'Sem assinatura real para validar conciliacao sem webhook.', evidence: {} };
    }
    const before = await PagamentoAssinatura.count({ where: { assinatura_id: assinatura.id } });
    await syncAssinaturaPagamentosMercadoPago(assinatura);
    const after = await PagamentoAssinatura.count({ where: { assinatura_id: assinatura.id } });
    assert(after >= before && after >= 1, 'Conciliacao por leitura nao encontrou pagamento aprovado.');
    return {
      result: 'Consulta de conciliacao recupera pagamento aprovado mesmo sem depender do webhook.',
      evidence: { antes: before, depois: after, assinatura_id: assinatura.id },
    };
  });

  await test('T43', async () => {
    const active = await createActiveUserWithNewCustomPlan(43);
    const authId = `qa-auth-${runId}`;
    const payId = `qa-pay-outoforder-${runId}`;
    await upsertPagamentoAssinatura(
      {
        mercado_pago_payment_id: payId,
        mercado_pago_authorized_payment_id: authId,
        mercado_pago_preapproval_id: `qa-preapproval-${runId}`,
        referencia_externa: active.assinatura.referencia_externa,
        status: 'authorized',
        valor_centavos: active.assinatura.valor_centavos,
        moeda: 'BRL',
        pago_em: new Date(),
        processado_em: new Date(),
        payload_mercado_pago: { qa: true, ordem: 'authorized_payment' },
      },
      active.assinatura
    );
    await upsertPagamentoAssinatura(
      {
        mercado_pago_payment_id: payId,
        mercado_pago_authorized_payment_id: null,
        mercado_pago_preapproval_id: `qa-preapproval-${runId}`,
        referencia_externa: active.assinatura.referencia_externa,
        status: 'approved',
        valor_centavos: active.assinatura.valor_centavos,
        moeda: 'BRL',
        pago_em: new Date(),
        processado_em: new Date(),
        payload_mercado_pago: { qa: true, ordem: 'payment' },
      },
      active.assinatura
    );
    const count = await PagamentoAssinatura.count({
      where: {
        assinatura_id: active.assinatura.id,
        mercado_pago_payment_id: payId,
      },
    });
    assert(count === 1, 'Webhook/conciliacao fora de ordem duplicou pagamento.');
    return {
      result: 'Eventos fora de ordem com mesmo payment_id mantem historico idempotente.',
      evidence: { payment_id: payId, registros: count },
    };
  });

  await test('T44', async () => {
    const user = await createUser(44);
    const planResponse = await createPlan(customPlanBody('Valor MP', {
      intervalo: 'dias',
      intervalo_quantidade: 7,
      limite_pdvs: 1,
      limite_subcontas: 0,
    }));
    const checkout = await checkoutWithCode(user.email, planResponse.codigo.codigo, 201);
    const before = await getMercadoPagoPreapproval(checkout.assinatura.mercado_pago_preapproval_id);
    const response = await api(`/admin/usuarios/${user.id}/assinaturas/${checkout.assinatura.id}/valor`, {
      method: 'POST',
      token: context.adminToken,
      body: { valor_centavos: 1800, motivo: 'QA ajuste MP antes da recorrencia' },
      expect: 200,
    });
    const after = await getMercadoPagoPreapproval(checkout.assinatura.mercado_pago_preapproval_id);
    assert(Number(after.auto_recurring?.transaction_amount) === 18, 'Mercado Pago nao recebeu novo valor recorrente.');
    return {
      result: 'Mudanca de valor antes da recorrencia atualiza assinatura local e preapproval Mercado Pago.',
      evidence: {
        preapproval_id: checkout.assinatura.mercado_pago_preapproval_id,
        antes: before.auto_recurring?.transaction_amount,
        depois: after.auto_recurring?.transaction_amount,
        valor_local: response.data.assinatura.valor_recorrente_centavos,
      },
    };
  });

  await test('T45', async () => {
    const active = await createActiveUserWithNewCustomPlan(45, { trial_dias: 1 }, {
      proximo_pagamento_em: addDays(new Date(), -1),
    });
    await createSyntheticPayment(active.assinatura, { status: 'approved', pago_em: new Date() });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'regular' && billing.bloqueado === false, 'Pagamento apos trial nao regularizou.');
    return {
      result: 'Fim de trial com pagamento aprovado fica regular.',
      evidence: { fase: billing.fase, pagamento: billing.pagamento_referencia?.status },
    };
  });

  await test('T46', async () => {
    const active = await createActiveUserWithNewCustomPlan(46, { trial_dias: 1 }, {
      proximo_pagamento_em: addDays(new Date(), -10),
    });
    const billing = await getBillingStatus(active.user.id);
    assert(billing.fase === 'bloqueada' && billing.bloqueado === true, 'Trial vencido sem pagamento nao bloqueou apos tolerancia.');
    return {
      result: 'Trial vencido sem cobranca aprovada entra na regua e bloqueia apos tolerancia.',
      evidence: { fase: billing.fase, dias_em_atraso: billing.dias_em_atraso },
    };
  });

  await test('T48', async () => {
    const accounts = [
      await createActiveUserWithNewCustomPlan(481, { limite_pdvs: 1, limite_subcontas: 0, emissao_fiscal: false }),
      await createActiveUserWithNewCustomPlan(482, { limite_pdvs: 2, limite_subcontas: 1, emissao_fiscal: true }),
      await createActiveUserWithNewCustomPlan(483, { gratuito: true, valor_centavos: 0, limite_pdvs: 1, limite_subcontas: 1 }),
      await createActiveUserWithNewCustomPlan(484, { intervalo: 'dias', intervalo_quantidade: 7, limite_pdvs: 1, limite_subcontas: 0 }),
      await createActiveUserWithNewCustomPlan(485, { trial_dias: 30, limite_pdvs: 1, limite_subcontas: 0 }, { proximo_pagamento_em: addDays(new Date(), 30) }),
    ];
    const entitlements = await Promise.all(accounts.map(account => api('/assinaturas/entitlements', { token: account.token })));
    const phases = entitlements.map(item => item.data.billing_status.fase);
    assert(phases.every(phase => phase === 'regular'), 'Uma das cinco contas paralelas nao ficou regular.');
    assert(new Set(accounts.map(account => account.user.id)).size === 5, 'Contas paralelas nao ficaram isoladas.');
    return {
      result: 'Cinco contas com combinacoes distintas ficam isoladas e regulares em paralelo.',
      evidence: { emails: accounts.map(account => account.email), fases: phases },
    };
  });

  await test('T30', async () => {
    const unused = await createPlan(publicPlanBody('Exclusao sem historico', { valor_centavos: 990 }));
    const removed = await api(`/admin/planos/${encodeURIComponent(unused.plano.id)}`, {
      method: 'DELETE',
      token: context.adminToken,
      expect: 200,
    });
    const archived = await api(`/admin/planos/${encodeURIComponent(limitsAccount.plan.id)}`, {
      method: 'DELETE',
      token: context.adminToken,
      expect: 200,
    });
    await cleanupMpPreapprovals();
    assert(removed.data.removido === true, 'Plano sem historico nao foi removido.');
    assert(archived.data.arquivado === true, 'Plano com historico nao foi arquivado.');
    return {
      result: 'Limpeza operacional remove plano sem historico e arquiva plano usado preservando auditoria.',
      evidence: {
        plano_removido: unused.plano.id,
        removido: removed.data.removido,
        plano_arquivado: limitsAccount.plan.id,
        arquivado: archived.data.arquivado,
        preapprovals_canceladas_tentadas: context.mpPreapprovals.size,
      },
    };
  });

  await sequelize.close();
  const failed = results.filter(item => item.state === 'Falhou');
  const blocked = results.filter(item => item.state === 'Bloqueado');
  console.log(JSON.stringify({ runId, results, summary: { total: results.length, failed: failed.length, blocked: blocked.length } }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch(async error => {
  try {
    await sequelize.close();
  } catch {
    // noop
  }
  console.error(JSON.stringify({
    runId,
    fatal: true,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 10).join('\n'),
  }, null, 2));
  process.exit(1);
});
