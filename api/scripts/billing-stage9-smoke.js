#!/usr/bin/env node

const assert = require('assert/strict');
const { randomBytes } = require('crypto');
const path = require('path');
const { Op } = require('sequelize');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const sequelize = require('../src/database');
const {
  AcaoAdminAssinatura,
  AlteracaoAssinatura,
  Assinatura,
  CodigoAssinatura,
  PagamentoAssinatura,
  Pdv,
  Plano,
  PlanoLimite,
  PlanoRecurso,
  PlanoVersao,
  Subconta,
  Usuario,
} = require('../src/app/models');
const { buildPlanoSnapshot, getPlano } = require('../src/app/services/planosService');
const { cancelMercadoPagoPreapproval } = require('../src/app/services/mercadoPagoService');
const {
  DIAS_TOLERANCIA_BLOQUEIO,
  calcularReguaInadimplencia,
} = require('../src/app/services/assinaturaInadimplenciaService');
const {
  ensureFeature,
  ensureLimitAvailable,
  getEntitlements,
} = require('../src/app/services/assinaturaEntitlementsService');
const {
  applyDueScheduledChanges,
  scheduleDowngrade,
} = require('../src/app/services/alteracoesAssinaturaService');

const baseUrl = (process.env.BILLING_TEST_BASE_URL || process.env.API_URL || 'http://localhost:3333').replace(/\/+$/, '');
const adminEmail = process.env.BILLING_TEST_ADMIN_EMAIL || process.env.ADMIN_SEED_EMAIL || 'admin@admin.com';
const adminPassword = process.env.BILLING_TEST_ADMIN_PASSWORD || process.env.ADMIN_SEED_PASSWORD;
const testPassword = process.env.BILLING_TEST_USER_PASSWORD || 'Aa12345678';
const shouldCancelMercadoPago = process.env.BILLING_TEST_CANCEL_MP !== 'false';
const runId = `stage9-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
const namePrefix = `Codex Stage9 ${runId}`;
const emailPrefix = `codex.stage9.${runId}`;
const state = {
  planIds: new Set(),
  userEmails: new Set(),
};

function log(message) {
  process.stdout.write(`[billing-stage9] ${message}\n`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(left, right) {
  return Math.round((right.getTime() - left.getTime()) / (24 * 60 * 60 * 1000));
}

function testEmail(label) {
  const email = `${emailPrefix}.${label}@caixaagil.test`;
  state.userEmails.add(email);
  return email;
}

async function request(method, route, { body, token, expected = 200 } = {}) {
  const expectedStatuses = Array.isArray(expected) ? expected : [expected];
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!expectedStatuses.includes(response.status)) {
    throw new Error(
      `${method} ${route} returned ${response.status}. Expected ${expectedStatuses.join(', ')}. Body: ${text}`
    );
  }

  return { data, response };
}

async function adminLogin() {
  if (!adminPassword) {
    throw new Error('Configure BILLING_TEST_ADMIN_PASSWORD ou ADMIN_SEED_PASSWORD para rodar o smoke test.');
  }

  const { data } = await request('POST', '/admin/sessions', {
    body: {
      email: adminEmail,
      senha: adminPassword,
    },
  });

  assert.ok(data?.token, 'admin token should be returned');
  return data.token;
}

async function createPlan(token, payload) {
  const { data } = await request('POST', '/admin/planos', {
    token,
    expected: 201,
    body: payload,
  });

  assert.ok(data?.plano?.id, 'created plan id should be returned');
  state.planIds.add(data.plano.id);
  return data;
}

async function createUser(email) {
  const { data } = await request('POST', '/usuarios', {
    expected: 201,
    body: {
      email,
      senha: testPassword,
    },
  });

  assert.equal(data.email, email);
  assert.ok(data.email_verificado_em, 'test account should be created as verified while bypass is enabled');
  return data;
}

async function loginUser(email) {
  const { data } = await request('POST', '/sessions', {
    body: {
      email,
      senha: testPassword,
    },
  });

  assert.ok(data?.token, 'user token should be returned');
  return data.token;
}

async function findUserByEmail(email) {
  return Usuario.findOne({ where: { email } });
}

async function findLastSubscription(email) {
  const usuario = await findUserByEmail(email);
  assert.ok(usuario, `user ${email} should exist`);

  const assinatura = await Assinatura.findOne({
    where: { usuario_id: usuario.id },
    order: [['id', 'DESC']],
  });

  assert.ok(assinatura, `subscription for ${email} should exist`);
  return { usuario, assinatura };
}

async function assertCheckoutStatus(token, expectedStatus) {
  const { data } = await request('GET', `/assinaturas/checkout/${encodeURIComponent(token)}/status`);

  assert.equal(data.status, expectedStatus);
  return data;
}

async function testPlanCatalogAndCheckout(adminToken) {
  log('criando plano publico e validando checkout Mercado Pago');
  const publicPlan = await createPlan(adminToken, {
    nome: `${namePrefix} Publico`,
    personalizado: false,
    valor_centavos: 990,
    emissao_fiscal: false,
    limite_pdvs: 1,
    limite_subcontas: 0,
  });

  const plans = await request('GET', '/assinaturas/planos');
  assert.ok(
    plans.data.planos.some(plano => plano.id === publicPlan.plano.id),
    'public plan should be listed to customers'
  );

  const email = testEmail('publico');
  await createUser(email);
  const checkout = await request('POST', '/assinaturas/checkout', {
    expected: 201,
    body: {
      email,
      plano: publicPlan.plano.id,
    },
  });

  assert.match(checkout.data.checkoutUrl, /^https?:\/\//);
  assert.ok(checkout.data.checkoutToken, 'checkout token should be returned');
  await assertCheckoutStatus(checkout.data.checkoutToken, 'pendente');

  const { assinatura } = await findLastSubscription(email);
  assert.equal(assinatura.plano, publicPlan.plano.id);
  assert.equal(assinatura.status, 'pendente');
  assert.ok(assinatura.mercado_pago_preapproval_id, 'public checkout should store Mercado Pago preapproval id');

  return publicPlan.plano.id;
}

async function testCustomFreeCode(adminToken) {
  log('validando codigo personalizado gratuito, uso unico, login e entitlements');
  const freePlan = await createPlan(adminToken, {
    nome: `${namePrefix} Personalizado Gratis`,
    personalizado: true,
    gratuito: true,
    emissao_fiscal: true,
    limite_pdvs: 2,
    limite_subcontas: 1,
    observacao: 'Smoke test stage 9',
  });
  const code = freePlan.codigo?.codigo;

  assert.ok(code, 'custom free plan should return a unique code');

  const validation = await request('POST', '/assinaturas/codigo/validar', {
    body: { codigo_assinatura: code },
  });

  assert.equal(validation.data.plano.personalizado, true);
  assert.equal(validation.data.plano.gratuito, true);

  const email = testEmail('gratis');
  await createUser(email);
  const checkout = await request('POST', '/assinaturas/checkout', {
    expected: 201,
    body: {
      email,
      codigo_assinatura: code,
    },
  });

  assert.equal(checkout.data.assinaturaAtiva, true);
  assert.equal(checkout.data.checkoutUrl, null);
  assert.equal(checkout.data.gratuito, true);

  await assertCheckoutStatus(checkout.data.checkoutToken, 'ativa');

  await request('POST', '/assinaturas/codigo/validar', {
    expected: 404,
    body: { codigo_assinatura: code },
  });

  const reuseEmail = testEmail('gratis-reuso');
  await createUser(reuseEmail);
  await request('POST', '/assinaturas/checkout', {
    expected: 400,
    body: {
      email: reuseEmail,
      codigo_assinatura: code,
    },
  });

  const userToken = await loginUser(email);
  const entitlementResponse = await request('GET', '/assinaturas/entitlements', { token: userToken });
  const entitlements = entitlementResponse.data;

  assert.equal(entitlements.recursos.emissao_fiscal, true);
  assert.equal(entitlements.limites.pdvs_ativos, 2);
  assert.equal(entitlements.limites.subcontas_ativas, 1);
  assert.equal(entitlements.billing_status.fase, 'regular');
  assert.equal(entitlements.billing_status.bloqueado, false);

  const { usuario, assinatura } = await findLastSubscription(email);
  await Pdv.bulkCreate([
    { usuario_id: usuario.id, nome: `${namePrefix} PDV 1`, ativo: true },
    { usuario_id: usuario.id, nome: `${namePrefix} PDV 2`, ativo: true },
  ]);

  await assert.rejects(
    () => ensureLimitAvailable(usuario.id, 'pdvs_ativos'),
    error => error.code === 'PLAN_LIMIT_REACHED'
  );

  return { userToken, usuario, assinatura, planId: freePlan.plano.id };
}

async function testCustomPaidTrialCode(adminToken) {
  log('validando codigo personalizado pago, intervalo em dias e trial antes da primeira cobranca');
  const paidPlan = await createPlan(adminToken, {
    nome: `${namePrefix} Personalizado Pago Trial`,
    personalizado: true,
    gratuito: false,
    valor_centavos: 1000,
    intervalo: 'dias',
    intervalo_quantidade: 7,
    trial_dias: 30,
    emissao_fiscal: true,
    limite_pdvs: 3,
    limite_subcontas: 2,
    observacao: 'Smoke test stage 9 paid trial',
  });
  const code = paidPlan.codigo?.codigo;

  assert.ok(code, 'custom paid plan should return a unique code');

  const validation = await request('POST', '/assinaturas/codigo/validar', {
    body: { codigo_assinatura: code },
  });

  assert.equal(validation.data.plano.intervalo, 'dias');
  assert.equal(validation.data.plano.intervalo_quantidade, 7);
  assert.equal(validation.data.plano.trial_dias, 30);
  assert.equal(validation.data.plano.valor_centavos, 1000);

  const email = testEmail('pago-trial');
  await createUser(email);
  const checkout = await request('POST', '/assinaturas/checkout', {
    expected: 201,
    body: {
      email,
      codigo_assinatura: code,
    },
  });

  assert.match(checkout.data.checkoutUrl, /^https?:\/\//);
  assert.ok(checkout.data.checkoutToken, 'custom paid checkout should return token');

  const status = await assertCheckoutStatus(checkout.data.checkoutToken, 'pendente');
  assert.equal(status.plano, paidPlan.plano.id);

  const { assinatura } = await findLastSubscription(email);
  const nextPayment = new Date(assinatura.proximo_pagamento_em);

  assert.equal(assinatura.status, 'pendente');
  assert.equal(assinatura.valor_recorrente_centavos, 1000);
  assert.equal(assinatura.valor_primeiro_pagamento_centavos, 1000);
  assert.ok(assinatura.mercado_pago_preapproval_id, 'custom paid checkout should store Mercado Pago preapproval id');
  assert.ok(nextPayment > new Date(), 'next payment should be in the future for trial plan');
  assert.ok(
    daysBetween(new Date(), nextPayment) >= 28 && daysBetween(new Date(), nextPayment) <= 31,
    'next payment should be close to 30 trial days'
  );

  const sameUserValidation = await request('POST', '/assinaturas/codigo/validar', {
    body: { email, codigo_assinatura: code },
  });
  assert.equal(sameUserValidation.data.checkout_pendente, true);
  assert.equal(sameUserValidation.data.plano.id, paidPlan.plano.id);

  const reopenedCheckout = await request('POST', '/assinaturas/checkout', {
    body: {
      email,
      codigo_assinatura: code,
    },
  });
  assert.equal(reopenedCheckout.data.reused, true);
  assert.equal(reopenedCheckout.data.checkoutToken, checkout.data.checkoutToken);
  assert.equal(reopenedCheckout.data.checkoutUrl, checkout.data.checkoutUrl);

  await request('POST', '/assinaturas/codigo/validar', {
    expected: 404,
    body: { codigo_assinatura: code },
  });

  return paidPlan.plano.id;
}

async function testAdminPlanDeletion(adminToken) {
  log('validando exclusao e arquivamento de planos administrativos');
  const removablePlan = await createPlan(adminToken, {
    nome: `${namePrefix} Excluir Sem Historico`,
    personalizado: false,
    valor_centavos: 1230,
    emissao_fiscal: false,
    limite_pdvs: 1,
    limite_subcontas: 0,
  });

  const hardDelete = await request('DELETE', `/admin/planos/${encodeURIComponent(removablePlan.plano.id)}`, {
    token: adminToken,
  });
  assert.equal(hardDelete.data.removido, true);

  const afterHardDelete = await request('GET', '/admin/planos', { token: adminToken });
  assert.equal(
    afterHardDelete.data.planos.some(plano => plano.id === removablePlan.plano.id),
    false,
    'hard-deleted plan should disappear from admin list'
  );

  const archivedPlan = await createPlan(adminToken, {
    nome: `${namePrefix} Arquivar Com Historico`,
    personalizado: false,
    valor_centavos: 1240,
    emissao_fiscal: false,
    limite_pdvs: 1,
    limite_subcontas: 0,
  });
  const email = testEmail('plano-arquivado');
  await createUser(email);
  await request('POST', '/assinaturas/checkout', {
    expected: 201,
    body: {
      email,
      plano: archivedPlan.plano.id,
    },
  });

  const softDelete = await request('DELETE', `/admin/planos/${encodeURIComponent(archivedPlan.plano.id)}`, {
    token: adminToken,
  });
  assert.equal(softDelete.data.arquivado, true);

  const afterSoftDelete = await request('GET', '/admin/planos', { token: adminToken });
  assert.equal(
    afterSoftDelete.data.planos.some(plano => plano.id === archivedPlan.plano.id),
    false,
    'archived plan should disappear from active admin list'
  );

  const publicCatalog = await request('GET', '/assinaturas/planos');
  assert.equal(
    publicCatalog.data.planos.some(plano => plano.id === archivedPlan.plano.id),
    false,
    'archived plan should disappear from public catalog'
  );
}

async function testEntitlementsAndBillingServices(publicPlanId) {
  log('forcando cenarios de entitlements, limites, downgrade e inadimplencia');
  const userEmail = testEmail('servicos');
  await createUser(userEmail);
  const usuario = await findUserByEmail(userEmail);
  const publicPlan = await getPlano(publicPlanId);
  assert.ok(publicPlan, 'public plan should be available to build service subscription');

  const assinatura = await Assinatura.create({
    usuario_id: usuario.id,
    plano: publicPlan.id,
    plano_versao_id: publicPlan.plano_versao_id || null,
    plano_snapshot: buildPlanoSnapshot(publicPlan),
    status: 'ativa',
    valor_centavos: publicPlan.valor_centavos,
    valor_recorrente_centavos: publicPlan.valor_centavos,
    valor_primeiro_pagamento_centavos: publicPlan.valor_centavos,
    moeda: 'BRL',
    referencia_externa: `${runId}-servicos`,
    tipo_movimento: 'teste_stage9',
    iniciada_em: new Date(),
    ativada_em: new Date(),
    proximo_pagamento_em: addDays(new Date(), 30),
  });

  await assert.rejects(
    () => ensureFeature(usuario.id, 'emissao_fiscal'),
    error => error.code === 'PLAN_FEATURE_REQUIRED'
  );

  await Pdv.create({ usuario_id: usuario.id, nome: `${namePrefix} PDV limite`, ativo: true });
  await assert.rejects(
    () => ensureLimitAvailable(usuario.id, 'pdvs_ativos'),
    error => error.code === 'PLAN_LIMIT_REACHED'
  );

  const futureBilling = calcularReguaInadimplencia({
    assinatura: assinatura.get({ plain: true }),
    pagamentos: [],
    now: new Date(),
  });
  assert.equal(futureBilling.fase, 'regular');
  assert.equal(futureBilling.bloqueado, false);

  const lateBilling = calcularReguaInadimplencia({
    assinatura: {
      ...assinatura.get({ plain: true }),
      proximo_pagamento_em: addDays(new Date(), -3),
    },
    pagamentos: [],
    now: new Date(),
  });
  assert.equal(lateBilling.fase, 'atrasada');
  assert.equal(lateBilling.bloqueado, false);

  const blockedBilling = calcularReguaInadimplencia({
    assinatura: {
      ...assinatura.get({ plain: true }),
      proximo_pagamento_em: addDays(new Date(), -(DIAS_TOLERANCIA_BLOQUEIO + 1)),
    },
    pagamentos: [],
    now: new Date(),
  });
  assert.equal(blockedBilling.fase, 'bloqueada');
  assert.equal(blockedBilling.bloqueado, true);

  const paidBilling = calcularReguaInadimplencia({
    assinatura: {
      ...assinatura.get({ plain: true }),
      proximo_pagamento_em: addDays(new Date(), -3),
    },
    pagamentos: [
      {
        assinatura_id: assinatura.id,
        status: 'approved',
        pago_em: new Date(),
      },
    ],
    now: new Date(),
  });
  assert.equal(paidBilling.fase, 'regular');
  assert.equal(paidBilling.motivo, 'pagamento_confirmado');

  const downgradeTarget = {
    ...publicPlan,
    id: `${publicPlan.id}-downgrade-stage9`,
    nome: `${publicPlan.nome} downgrade stage9`,
    valor_centavos: Math.max(100, Math.floor(publicPlan.valor_centavos / 2)),
  };
  const scheduled = await scheduleDowngrade({
    usuarioId: usuario.id,
    assinaturaAtual: assinatura.get({ plain: true }),
    plano: downgradeTarget,
    aplicarEm: addDays(new Date(), -1),
    metadata: { runId },
  });
  const applied = await applyDueScheduledChanges({ usuarioId: usuario.id });
  await assinatura.reload();

  assert.equal(scheduled.status, 'agendada');
  assert.equal(applied.length, 1);
  assert.equal(assinatura.plano, downgradeTarget.id);
  assert.equal(assinatura.valor_recorrente_centavos, downgradeTarget.valor_centavos);
}

async function testAdminSubscriptionActions(adminToken, usuario, assinatura) {
  log('validando acoes administrativas de valor, trial, status e auditoria');

  const valueResponse = await request(
    'POST',
    `/admin/usuarios/${usuario.id}/assinaturas/${assinatura.id}/valor`,
    {
      token: adminToken,
      body: {
        valor_centavos: 1500,
        motivo: 'Smoke test stage 9 valor',
      },
    }
  );
  assert.equal(valueResponse.data.assinatura.valor_recorrente_centavos, 1500);
  assert.equal(valueResponse.data.auditoria.acao, 'ajustar_valor');

  const trialResponse = await request(
    'POST',
    `/admin/usuarios/${usuario.id}/assinaturas/${assinatura.id}/trial`,
    {
      token: adminToken,
      body: {
        dias_gratis: 10,
        motivo: 'Smoke test stage 9 trial',
      },
    }
  );
  assert.equal(trialResponse.data.assinatura.status, 'ativa');
  assert.ok(new Date(trialResponse.data.assinatura.proximo_pagamento_em) > new Date());

  const pauseResponse = await request(
    'POST',
    `/admin/usuarios/${usuario.id}/assinaturas/${assinatura.id}/status`,
    {
      token: adminToken,
      body: {
        acao: 'pausar',
        motivo: 'Smoke test stage 9 pausa',
      },
    }
  );
  assert.equal(pauseResponse.data.assinatura.status, 'pausada');

  const reactivateResponse = await request(
    'POST',
    `/admin/usuarios/${usuario.id}/assinaturas/${assinatura.id}/status`,
    {
      token: adminToken,
      body: {
        acao: 'reativar',
        motivo: 'Smoke test stage 9 reativacao',
      },
    }
  );
  assert.equal(reactivateResponse.data.assinatura.status, 'ativa');

  const detail = await request('GET', `/admin/usuarios/${usuario.id}`, { token: adminToken });
  const auditActions = (detail.data.auditoria || []).map(item => item.acao);

  assert.ok(auditActions.includes('ajustar_valor'), 'admin audit should include value adjustment');
  assert.ok(auditActions.includes('conceder_dias_gratis'), 'admin audit should include trial grant');
  assert.ok(auditActions.includes('status_pausar'), 'admin audit should include pause action');
  assert.ok(auditActions.includes('status_reativar'), 'admin audit should include reactivation action');
}

async function cleanup() {
  const emails = Array.from(state.userEmails);
  const users = emails.length
    ? await Usuario.unscoped().findAll({ where: { email: { [Op.in]: emails } } })
    : [];
  const userIds = users.map(user => user.id);
  const planIds = Array.from(state.planIds);
  const planRows = await Plano.findAll({
    where: {
      [Op.or]: [
        ...(planIds.length ? [{ id: { [Op.in]: planIds } }] : []),
        { nome: { [Op.iLike]: `${namePrefix}%` } },
      ],
    },
  });
  const allPlanIds = Array.from(new Set([...planIds, ...planRows.map(plano => plano.id)]));
  const assinaturaWhere = {
    [Op.or]: [
      ...(userIds.length ? [{ usuario_id: { [Op.in]: userIds } }] : []),
      ...(allPlanIds.length ? [{ plano: { [Op.in]: allPlanIds } }] : []),
      { referencia_externa: { [Op.iLike]: `%${runId}%` } },
    ],
  };
  const assinaturas = await Assinatura.findAll({ where: assinaturaWhere });
  const assinaturaIds = assinaturas.map(assinatura => assinatura.id);

  if (shouldCancelMercadoPago) {
    for (const assinatura of assinaturas) {
      if (assinatura.mercado_pago_preapproval_id) {
        try {
          await cancelMercadoPagoPreapproval(assinatura.mercado_pago_preapproval_id);
        } catch {
          // Smoke cleanup must not hide the original test result.
        }
      }
    }
  }

  if (assinaturaIds.length) {
    await AcaoAdminAssinatura.destroy({ where: { assinatura_id: { [Op.in]: assinaturaIds } } });
    await AlteracaoAssinatura.destroy({ where: { assinatura_id: { [Op.in]: assinaturaIds } } });
    await PagamentoAssinatura.destroy({ where: { assinatura_id: { [Op.in]: assinaturaIds } } });
    await Assinatura.destroy({ where: { id: { [Op.in]: assinaturaIds } } });
  }

  if (userIds.length) {
    await Pdv.destroy({ where: { usuario_id: { [Op.in]: userIds } } });
    await Subconta.destroy({ where: { usuario_id: { [Op.in]: userIds } } });
    await CodigoAssinatura.destroy({ where: { usado_por_usuario_id: { [Op.in]: userIds } } });
    await Usuario.destroy({ where: { id: { [Op.in]: userIds } } });
  }

  if (allPlanIds.length) {
    const versions = await PlanoVersao.findAll({ where: { plano_id: { [Op.in]: allPlanIds } } });
    const versionIds = versions.map(version => version.id);

    await CodigoAssinatura.destroy({ where: { plano_id: { [Op.in]: allPlanIds } } });

    if (versionIds.length) {
      await PlanoRecurso.destroy({ where: { plano_versao_id: { [Op.in]: versionIds } } });
      await PlanoLimite.destroy({ where: { plano_versao_id: { [Op.in]: versionIds } } });
      await PlanoVersao.destroy({ where: { id: { [Op.in]: versionIds } } });
    }

    await Plano.destroy({ where: { id: { [Op.in]: allPlanIds } } });
  }
}

async function main() {
  log(`iniciando smoke stage9 em ${baseUrl}`);
  const adminToken = await adminLogin();
  const publicPlanId = await testPlanCatalogAndCheckout(adminToken);
  const freeContext = await testCustomFreeCode(adminToken);

  await testCustomPaidTrialCode(adminToken);
  await testEntitlementsAndBillingServices(publicPlanId);
  await testAdminSubscriptionActions(adminToken, freeContext.usuario, freeContext.assinatura);
  await testAdminPlanDeletion(adminToken);

  const summary = {
    baseUrl,
    runId,
    plansCreated: state.planIds.size,
    usersCreated: state.userEmails.size,
  };

  log(`OK ${JSON.stringify(summary)}`);
}

main()
  .catch(error => {
    process.stderr.write(`[billing-stage9] FAILED ${error.stack || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } catch (error) {
      process.stderr.write(`[billing-stage9] CLEANUP_FAILED ${error.stack || error.message}\n`);
      process.exitCode = 1;
    }

    await sequelize.close().catch(() => {});
  });
