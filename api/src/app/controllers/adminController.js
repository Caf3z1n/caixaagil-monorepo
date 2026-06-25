const crypto = require('crypto');
const { col, fn, Op } = require('sequelize');
const sequelize = require('../../database');
const {
  AcaoAdminAssinatura,
  Administrador,
  AlteracaoAssinatura,
  Assinatura,
  CodigoAssinatura,
  ConfiguracaoSistema,
  PagamentoAssinatura,
  Pdv,
  Plano,
  PlanoLimite,
  PlanoRecurso,
  PlanoVersao,
  Subconta,
  Usuario,
  Venda,
} = require('../models');
const {
  buildUniqueCodigoAssinatura,
  serializeCodigoAssinatura,
} = require('../services/codigosAssinaturaService');
const { sanitizeFiscalSettings } = require('../services/configuracaoSistemaService');
const {
  cancelMercadoPagoPreapproval,
  pauseMercadoPagoPreapproval,
  reactivateMercadoPagoPreapproval,
  updateMercadoPagoPreapprovalAmount,
} = require('../services/mercadoPagoService');
const { calcularReguaInadimplencia } = require('../services/assinaturaInadimplenciaService');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeNome(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidSenha(senha) {
  return (
    typeof senha === 'string' &&
    senha.trim().length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[a-z]/.test(senha) &&
    /\d/.test(senha)
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeAdministrador(administrador) {
  const data = administrador.get ? administrador.get({ plain: true }) : { ...administrador };

  delete data.senha_hash;

  return data;
}

function toPlain(model) {
  return model?.get ? model.get({ plain: true }) : model || null;
}

function normalizeText(value, maxLength = 255) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength) : '';
}

function normalizeSlug(value) {
  return normalizeText(value, 60)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeInteger(value, fallback = 0, { min = 0, max = 999999999 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeOptionalInteger(value, { min = 0, max = 999999999 } = {}) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  return normalizeInteger(value, null, { min, max });
}

function normalizeBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function parseCurrencyToCents(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.round(parsed * 100));
}

function parseDateOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function calculateTrialDaysFromDate(cobrancaInicioEm) {
  if (!cobrancaInicioEm) {
    return 0;
  }

  const diffMs = cobrancaInicioEm.getTime() - Date.now();

  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function normalizeTrialDays(body, personalizado, gratuito) {
  if (!personalizado || gratuito) {
    return 0;
  }

  const directValue = body?.trial_dias ?? body?.trialDias ?? body?.dias_gratis ?? body?.diasGratis;
  const parsed = normalizeOptionalInteger(directValue, { min: 0, max: 365 });

  if (parsed !== null) {
    return parsed;
  }

  return calculateTrialDaysFromDate(parseDateOrNull(body?.cobranca_inicio_em));
}

function normalizeIntervaloPlano(body, personalizado) {
  if (!personalizado) {
    return {
      intervalo: 'mensal',
      intervalo_quantidade: 1,
    };
  }

  const intervalo = body?.intervalo === 'dias' ? 'dias' : 'mensal';

  return {
    intervalo,
    intervalo_quantidade:
      intervalo === 'dias' ? normalizeInteger(body?.intervalo_quantidade, 1, { min: 1, max: 365 }) : 1,
  };
}

function buildPlanResources(body) {
  const recursos = Array.isArray(body?.recursos) ? body.recursos : null;

  if (recursos) {
    return recursos
      .map((recurso, index) => ({
        codigo: normalizeSlug(recurso?.codigo || recurso?.nome || `recurso-${index + 1}`).replace(/-/g, '_'),
        nome: normalizeText(recurso?.nome, 140),
        habilitado: recurso?.habilitado !== false,
        ordem: index + 1,
      }))
      .filter(recurso => recurso.codigo && recurso.nome);
  }

  const fiscalHabilitado = body?.emissao_fiscal === true || body?.fiscal === true;

  return [
    { codigo: 'pdv_desktop', nome: 'PDV desktop local', habilitado: true, ordem: 1 },
    { codigo: 'vendas_comandas', nome: 'Vendas e comanda digital', habilitado: true, ordem: 2 },
    { codigo: 'estoque', nome: 'Controle de estoque', habilitado: true, ordem: 3 },
    { codigo: 'fechamento_turno', nome: 'Fechamento do turno', habilitado: true, ordem: 4 },
    { codigo: 'emissao_fiscal', nome: 'NF-e/NFC-e com contingencia', habilitado: fiscalHabilitado, ordem: 5 },
  ];
}

function buildPlanLimits(body) {
  const limites = Array.isArray(body?.limites) ? body.limites : null;

  if (limites) {
    return limites
      .map((limite, index) => ({
        codigo: normalizeSlug(limite?.codigo || limite?.nome || `limite-${index + 1}`).replace(/-/g, '_'),
        nome: normalizeText(limite?.nome, 140),
        valor: limite?.valor === null || limite?.valor === '' ? null : normalizeInteger(limite?.valor, null, { min: 0 }),
        unidade: normalizeText(limite?.unidade, 40) || 'quantidade',
        ordem: index + 1,
      }))
      .filter(limite => limite.codigo && limite.nome);
  }

  return [
    {
      codigo: 'pdvs_ativos',
      nome: 'PDVs ativos',
      valor: normalizeOptionalInteger(body?.limite_pdvs, { min: 1 }),
      unidade: 'quantidade',
      ordem: 1,
    },
    {
      codigo: 'subcontas_ativas',
      nome: 'Subcontas ativas',
      valor: normalizeOptionalInteger(body?.limite_subcontas, { min: 0 }),
      unidade: 'quantidade',
      ordem: 2,
    },
  ];
}

async function buildUniquePlanId(nome) {
  const base = normalizeSlug(nome) || `plano-${crypto.randomBytes(3).toString('hex')}`;
  let candidate = base.slice(0, 60);
  let suffix = 1;

  while (await Plano.findByPk(candidate)) {
    const token = `${suffix}`;
    candidate = `${base.slice(0, Math.max(1, 59 - token.length))}-${token}`;
    suffix += 1;
  }

  return candidate;
}

function buildPlanWritePayload(body, existingPlano = null) {
  const personalizado = existingPlano ? existingPlano.publico === false : normalizeBoolean(body?.personalizado);
  const gratuito = personalizado && normalizeBoolean(body?.gratuito);
  const nome = normalizeText(body?.nome, 120);
  const descricao = null;
  const valorCentavos = gratuito
    ? 0
    : parseCurrencyToCents(body?.valor_centavos ?? body?.valor ?? body?.valor_mensal);
  const { intervalo, intervalo_quantidade: intervaloQuantidade } = normalizeIntervaloPlano(body, personalizado);
  const trialDias = normalizeTrialDays(body, personalizado, gratuito);
  const cobrancaInicioEm = null;

  if (nome.length < 2) {
    return {
      error: 'Informe um nome valido para o plano.',
    };
  }

  if (valorCentavos === null || (!gratuito && valorCentavos <= 0)) {
    return {
      error: personalizado
        ? 'Informe um valor valido para o plano personalizado ou marque como gratuito.'
        : 'Informe um valor mensal valido para o plano.',
    };
  }

  return {
    cobrancaInicioEm,
    descricao,
    gratuito,
    intervalo,
    intervaloQuantidade,
    limites: buildPlanLimits(body),
    nome,
    observacao: normalizeText(body?.observacao, 1000) || null,
    personalizado,
    recursos: buildPlanResources(body),
    trialDias,
    valorCentavos,
  };
}

async function getPlanoWithDetails(planoId, transaction = null) {
  return Plano.findByPk(planoId, {
    include: [
      {
        model: PlanoVersao,
        as: 'versoes',
        include: [
          { model: PlanoRecurso, as: 'recursos', required: false },
          { model: PlanoLimite, as: 'limites', required: false },
        ],
      },
      {
        model: CodigoAssinatura,
        as: 'codigos_assinatura',
        required: false,
        include: [
          {
            model: Usuario,
            as: 'usuario_usado',
            attributes: ['id', 'email', 'ativo'],
            required: false,
          },
        ],
      },
    ],
    transaction,
  });
}

function getCurrentVersion(plano) {
  const data = toPlain(plano);
  const versoes = [...(data?.versoes || [])].sort((left, right) => {
    const leftDate = new Date(left.vigente_de || left.created_at || left.createdAt || 0).getTime();
    const rightDate = new Date(right.vigente_de || right.created_at || right.createdAt || 0).getTime();

    return rightDate - leftDate || Number(right.id || 0) - Number(left.id || 0);
  });

  return versoes.find(versao => versao.ativo && !versao.vigente_ate) || versoes[0] || null;
}

function serializePlanoCodigo(codigo) {
  const data = toPlain(codigo);
  const serialized = serializeCodigoAssinatura(data);

  if (!serialized) {
    return null;
  }

  const usuarioUsado = data?.usuario_usado || null;

  return {
    ...serialized,
    usuario_usado: usuarioUsado
      ? {
          id: usuarioUsado.id,
          email: usuarioUsado.email,
          ativo: Boolean(usuarioUsado.ativo),
        }
      : null,
    usuario_usado_email: usuarioUsado?.email || null,
  };
}

function buildPlanUsageMap(assinaturas = []) {
  const usageByPlan = new Map();

  for (const assinaturaModel of assinaturas) {
    const assinatura = toPlain(assinaturaModel);
    const planId = getAssinaturaPlanoId(assinatura);

    if (!planId || assinatura?.usuario?.ativo === false) {
      continue;
    }

    const key = String(planId);
    const usage = usageByPlan.get(key) || {
      userKeys: new Set(),
      usuario_email: null,
    };
    const usuarioEmail = assinatura?.usuario?.email || assinatura?.email_pagador || null;
    const usuarioKey = assinatura?.usuario_id
      ? `id:${assinatura.usuario_id}`
      : usuarioEmail
        ? `email:${usuarioEmail}`
        : null;

    if (usuarioKey) {
      usage.userKeys.add(usuarioKey);
    }

    if (!usage.usuario_email && usuarioEmail) {
      usage.usuario_email = usuarioEmail;
    }

    usageByPlan.set(key, usage);
  }

  return new Map(
    [...usageByPlan.entries()].map(([key, usage]) => [
      key,
      {
        usuarios_ativos: usage.userKeys.size,
        usuario_email: usage.usuario_email,
      },
    ])
  );
}

function sanitizePlano(plano, usoPorPlano = new Map()) {
  const data = toPlain(plano);
  const versaoAtual = getCurrentVersion(plano);
  const codigos = [...(data?.codigos_assinatura || [])].sort((left, right) => {
    const leftDate = new Date(left.created_at || left.createdAt || 0).getTime();
    const rightDate = new Date(right.created_at || right.createdAt || 0).getTime();

    return rightDate - leftDate || Number(right.id || 0) - Number(left.id || 0);
  });

  return {
    id: data.id,
    nome: data.nome,
    descricao: data.descricao,
    ativo: data.ativo,
    publico: data.publico,
    ordem: data.ordem,
    created_at: data.created_at || data.createdAt || null,
    updated_at: data.updated_at || data.updatedAt || null,
    versao_atual: versaoAtual,
    codigos_personalizados: codigos.map(serializePlanoCodigo).filter(Boolean),
    uso: usoPorPlano.get(String(data.id)) || {
      usuarios_ativos: 0,
      usuario_email: null,
    },
  };
}

function getAssinaturaPlanoNome(assinatura) {
  const snapshot = assinatura?.plano_snapshot;

  return snapshot?.nome || snapshot?.plano || assinatura?.plano || null;
}

function getAssinaturaPlanoId(assinatura) {
  return assinatura?.plano_snapshot?.id || assinatura?.plano || null;
}

function isFiscalConfigured(configuracao) {
  try {
    const fiscal = sanitizeFiscalSettings(configuracao?.fiscal || {}, { includeSecrets: false });

    return Boolean(fiscal?.prontidao?.nfce || fiscal?.prontidao?.nfe);
  } catch {
    return false;
  }
}

function sanitizePagamentoAdmin(pagamento) {
  const data = toPlain(pagamento);

  if (!data) {
    return null;
  }

  delete data.payload_mercado_pago;

  return data;
}

function sanitizeAssinaturaAdmin(assinatura, alteracaoAgendada = null) {
  const data = toPlain(assinatura);

  if (!data) {
    return null;
  }

  return {
    ...data,
    plano_nome: getAssinaturaPlanoNome(data),
    alteracao_agendada: alteracaoAgendada ? toPlain(alteracaoAgendada) : null,
  };
}

function sanitizeAcaoAdminAssinatura(acao) {
  const data = toPlain(acao);

  if (!data) {
    return null;
  }

  return {
    ...data,
    administrador: data.administrador
      ? {
          id: data.administrador.id,
          nome: data.administrador.nome,
          email: data.administrador.email,
        }
      : null,
  };
}

function buildAssinaturaAuditSnapshot(assinatura) {
  const data = toPlain(assinatura);

  if (!data) {
    return {};
  }

  return {
    id: data.id,
    plano: data.plano,
    plano_nome: getAssinaturaPlanoNome(data),
    status: data.status,
    valor_centavos: data.valor_centavos,
    valor_recorrente_centavos: data.valor_recorrente_centavos,
    valor_primeiro_pagamento_centavos: data.valor_primeiro_pagamento_centavos,
    moeda: data.moeda,
    proximo_pagamento_em: data.proximo_pagamento_em,
    cancelada_em: data.cancelada_em,
    tipo_movimento: data.tipo_movimento,
    mercado_pago_preapproval_id: data.mercado_pago_preapproval_id || null,
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeAdminActionMotivo(value) {
  return normalizeText(value, 1000) || null;
}

async function findAdminSubscription(usuarioId, assinaturaId, options = {}) {
  const usuario = await Usuario.findByPk(usuarioId, {
    transaction: options.transaction || null,
  });

  if (!usuario) {
    const error = new Error('Usuario nao encontrado.');
    error.statusCode = 404;
    throw error;
  }

  const assinatura = await Assinatura.findOne({
    where: {
      id: assinaturaId,
      usuario_id: usuarioId,
    },
    transaction: options.transaction || null,
    lock: options.lock || undefined,
  });

  if (!assinatura) {
    const error = new Error('Assinatura nao encontrada para esta conta.');
    error.statusCode = 404;
    throw error;
  }

  return { assinatura, usuario };
}

async function createAssinaturaAdminAudit({
  acao,
  administradorId,
  assinatura,
  dadosAnteriores,
  dadosNovos,
  metadata = {},
  motivo,
  status = 'concluida',
  transaction,
}) {
  return AcaoAdminAssinatura.create(
    {
      administrador_id: administradorId,
      usuario_id: assinatura.usuario_id,
      assinatura_id: assinatura.id,
      acao,
      status,
      motivo,
      dados_anteriores: dadosAnteriores || {},
      dados_novos: dadosNovos || {},
      metadata,
    },
    { transaction }
  );
}

function getCurrentSubscription(assinaturas) {
  const sorted = [...assinaturas].sort((left, right) => {
    const leftId = Number(left.id || 0);
    const rightId = Number(right.id || 0);

    return rightId - leftId;
  });

  return sorted.find(assinatura => assinatura.status === 'ativa') || sorted[0] || null;
}

function isBillingAttention(reguaInadimplencia) {
  return reguaInadimplencia?.fase && reguaInadimplencia.fase !== 'regular';
}

function matchesAdminUserFilters(usuarioResumo, filters) {
  if (filters.status && filters.status !== 'todos' && usuarioResumo.assinatura_status !== filters.status) {
    return false;
  }

  if (filters.plano && filters.plano !== 'todos' && usuarioResumo.plano_id !== filters.plano) {
    return false;
  }

  if (filters.inadimplencia === 'sim' && !usuarioResumo.inadimplente) {
    return false;
  }

  if (filters.inadimplencia === 'nao' && usuarioResumo.inadimplente) {
    return false;
  }

  return true;
}

module.exports = {
  async bootstrap(req, res) {
    const configuredToken = process.env.ADMIN_BOOTSTRAP_TOKEN;

    if (!configuredToken) {
      return res.status(404).json({ message: 'Bootstrap administrativo nao configurado.' });
    }

    const providedToken = req.headers['x-admin-bootstrap-token'] || req.body?.token;

    if (!safeEqual(providedToken, configuredToken)) {
      return res.status(403).json({ message: 'Token de bootstrap administrativo invalido.' });
    }

    const existingAdmins = await Administrador.count();

    if (existingAdmins > 0) {
      return res.status(409).json({ message: 'Administrador inicial ja foi criado.' });
    }

    const nome = normalizeNome(req.body?.nome) || 'Administrador';
    const email = normalizeEmail(req.body?.email);
    const senha = req.body?.senha || req.body?.password;

    if (nome.length < 2 || nome.length > 100) {
      return res.status(400).json({ message: 'Informe um nome valido para o administrador.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Informe um e-mail valido.' });
    }

    if (!isValidSenha(senha)) {
      return res.status(400).json({ message: 'Senha nao atende aos requisitos minimos.' });
    }

    try {
      const administrador = await Administrador.create({
        nome,
        email,
        senha,
        ativo: true,
      });

      return res.status(201).json({
        administrador: sanitizeAdministrador(administrador),
        message: 'Administrador inicial criado.',
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'E-mail administrativo ja esta em uso.' });
      }

      return res.status(500).json({
        message: 'Erro ao criar administrador inicial.',
        detail: error.message,
      });
    }
  },

  async me(req, res) {
    return res.json({ administrador: req.admin });
  },

  async summary(req, res) {
    try {
      const paymentPaidStatuses = ['approved', 'accredited', 'paid', 'authorized'];
      const [
        usuariosTotal,
        usuariosAtivos,
        usuariosEmailVerificado,
        assinaturasAtivas,
        assinaturasPendentes,
        assinaturasFalhas,
        pagamentosTotal,
        pagamentosConfirmados,
        planosAtivos,
        planosPublicos,
        pdvsAtivos,
        subcontasAtivas,
      ] = await Promise.all([
        Usuario.count(),
        Usuario.count({ where: { ativo: true } }),
        Usuario.count({ where: { email_verificado_em: { [Op.not]: null } } }),
        Assinatura.count({ where: { status: 'ativa' } }),
        Assinatura.count({ where: { status: 'pendente' } }),
        Assinatura.count({ where: { status: { [Op.in]: ['falha', 'pagamento_falhou'] } } }),
        PagamentoAssinatura.count(),
        PagamentoAssinatura.count({ where: { status: { [Op.in]: paymentPaidStatuses } } }),
        Plano.count({ where: { ativo: true } }),
        Plano.count({ where: { ativo: true, publico: true } }),
        Pdv.count({ where: { ativo: true } }),
        Subconta.count({ where: { ativo: true } }),
      ]);

      const pagamentosRecentes = await PagamentoAssinatura.findAll({
        include: [
          {
            model: Usuario,
            as: 'usuario',
            attributes: ['id', 'email'],
          },
          {
            model: Assinatura,
            as: 'assinatura',
            attributes: ['id', 'plano', 'status'],
          },
        ],
        order: [
          ['processado_em', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: 8,
      });

      return res.json({
        usuarios: {
          total: usuariosTotal,
          ativos: usuariosAtivos,
          email_verificado: usuariosEmailVerificado,
        },
        assinaturas: {
          ativas: assinaturasAtivas,
          pendentes: assinaturasPendentes,
          falhas: assinaturasFalhas,
        },
        pagamentos: {
          total: pagamentosTotal,
          confirmados: pagamentosConfirmados,
          recentes: pagamentosRecentes,
        },
        planos: {
          ativos: planosAtivos,
          publicos: planosPublicos,
        },
        uso: {
          pdvs_ativos: pdvsAtivos,
          subcontas_ativas: subcontasAtivas,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao carregar resumo administrativo.',
        detail: error.message,
      });
    }
  },

  async listPlans(req, res) {
    try {
      const [planos, assinaturasAtivas] = await Promise.all([
        Plano.findAll({
          where: {
            ativo: true,
          },
          include: [
            {
              model: PlanoVersao,
              as: 'versoes',
              required: false,
              include: [
                {
                  model: PlanoRecurso,
                  as: 'recursos',
                  required: false,
                },
                {
                  model: PlanoLimite,
                  as: 'limites',
                  required: false,
                },
              ],
            },
            {
              model: CodigoAssinatura,
              as: 'codigos_assinatura',
              required: false,
              include: [
                {
                  model: Usuario,
                  as: 'usuario_usado',
                  attributes: ['id', 'email', 'ativo'],
                  required: false,
                },
              ],
            },
          ],
          order: [
            ['ordem', 'ASC'],
            ['created_at', 'DESC'],
            [{ model: PlanoVersao, as: 'versoes' }, 'vigente_de', 'DESC'],
            [{ model: PlanoVersao, as: 'versoes' }, { model: PlanoRecurso, as: 'recursos' }, 'ordem', 'ASC'],
            [{ model: PlanoVersao, as: 'versoes' }, { model: PlanoLimite, as: 'limites' }, 'ordem', 'ASC'],
            [{ model: CodigoAssinatura, as: 'codigos_assinatura' }, 'created_at', 'DESC'],
          ],
        }),
        Assinatura.findAll({
          where: { status: 'ativa' },
          include: [
            {
              model: Usuario,
              as: 'usuario',
              attributes: ['id', 'email', 'ativo'],
              required: false,
            },
          ],
        }),
      ]);
      const usoPorPlano = buildPlanUsageMap(assinaturasAtivas);

      return res.json({
        planos: planos.map(plano => sanitizePlano(plano, usoPorPlano)),
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao carregar planos administrativos.',
        detail: error.message,
      });
    }
  },

  async createPlan(req, res) {
    const payload = buildPlanWritePayload(req.body);

    if (payload.error) {
      return res.status(400).json({ message: payload.error });
    }

    try {
      const result = await sequelize.transaction(async transaction => {
        const ordemMaxima = await Plano.max('ordem', { transaction });
        const planoId = await buildUniquePlanId(payload.nome);
        const plano = await Plano.create(
          {
            id: planoId,
            nome: payload.nome,
            descricao: payload.descricao,
            ativo: true,
            publico: !payload.personalizado,
            ordem: normalizeInteger(req.body?.ordem, Number(ordemMaxima || 0) + 1, { min: 0, max: 9999 }),
          },
          { transaction }
        );
        const versao = await PlanoVersao.create(
          {
            plano_id: plano.id,
            nome: payload.nome,
            descricao: payload.descricao,
            valor_centavos: payload.valorCentavos,
            moeda: 'BRL',
            intervalo: payload.intervalo,
            intervalo_quantidade: payload.intervaloQuantidade,
            ativo: true,
            vigente_de: new Date(),
          },
          { transaction }
        );

        if (payload.recursos.length > 0) {
          await PlanoRecurso.bulkCreate(
            payload.recursos.map(recurso => ({
              ...recurso,
              plano_versao_id: versao.id,
            })),
            { transaction }
          );
        }

        if (payload.limites.length > 0) {
          await PlanoLimite.bulkCreate(
            payload.limites.map(limite => ({
              ...limite,
              plano_versao_id: versao.id,
            })),
            { transaction }
          );
        }

        let codigoPersonalizado = null;

        if (payload.personalizado) {
          const codigo = await buildUniqueCodigoAssinatura({ transaction });

          codigoPersonalizado = await CodigoAssinatura.create(
            {
              codigo: codigo.codigo,
              codigo_hash: codigo.codigo_hash,
              plano_id: plano.id,
              plano_versao_id: versao.id,
              nome: payload.nome,
              valor_centavos: payload.valorCentavos,
              moeda: 'BRL',
              trial_dias: payload.trialDias,
              gratuito: payload.gratuito,
              cobranca_inicio_em: payload.cobrancaInicioEm,
              intervalo: payload.intervalo,
              intervalo_quantidade: payload.intervaloQuantidade,
              expira_em: req.body?.expira_em || null,
              ativo: true,
              usos_maximos: 1,
              observacao: payload.observacao,
            },
            { transaction }
          );
        }

        const createdPlan = await getPlanoWithDetails(plano.id, transaction);

        return {
          codigo: serializeCodigoAssinatura(codigoPersonalizado),
          plano: sanitizePlano(createdPlan),
        };
      });

      return res.status(201).json(result);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Ja existe um plano ou codigo com estes dados.' });
      }

      return res.status(500).json({
        message: 'Erro ao criar plano administrativo.',
        detail: error.message,
      });
    }
  },

  async updatePlan(req, res) {
    const planoId = normalizeText(req.params.id, 80);
    const plano = await Plano.findByPk(planoId);

    if (!plano) {
      return res.status(404).json({ message: 'Plano nao encontrado.' });
    }

    const payload = buildPlanWritePayload(req.body, toPlain(plano));

    if (payload.error) {
      return res.status(400).json({ message: payload.error });
    }

    try {
      const result = await sequelize.transaction(async transaction => {
        const now = new Date();

        await Plano.update(
          {
            nome: payload.nome,
            descricao: payload.descricao,
            ativo: req.body?.ativo === undefined ? plano.ativo : normalizeBoolean(req.body?.ativo),
          },
          {
            where: { id: plano.id },
            transaction,
          }
        );

        await PlanoVersao.update(
          {
            ativo: false,
            vigente_ate: now,
          },
          {
            where: {
              plano_id: plano.id,
              ativo: true,
              vigente_ate: null,
            },
            transaction,
          }
        );

        const versao = await PlanoVersao.create(
          {
            plano_id: plano.id,
            nome: payload.nome,
            descricao: payload.descricao,
            valor_centavos: payload.valorCentavos,
            moeda: 'BRL',
            intervalo: payload.intervalo,
            intervalo_quantidade: payload.intervaloQuantidade,
            ativo: true,
            vigente_de: now,
          },
          { transaction }
        );

        if (payload.recursos.length > 0) {
          await PlanoRecurso.bulkCreate(
            payload.recursos.map(recurso => ({
              ...recurso,
              plano_versao_id: versao.id,
            })),
            { transaction }
          );
        }

        if (payload.limites.length > 0) {
          await PlanoLimite.bulkCreate(
            payload.limites.map(limite => ({
              ...limite,
              plano_versao_id: versao.id,
            })),
            { transaction }
          );
        }

        let codigoPersonalizado = null;

        if (payload.personalizado) {
          codigoPersonalizado = await CodigoAssinatura.findOne({
            where: { plano_id: plano.id },
            order: [['created_at', 'DESC']],
            transaction,
          });

          if (codigoPersonalizado && !codigoPersonalizado.usado_em && Number(codigoPersonalizado.usos_realizados || 0) === 0) {
            await codigoPersonalizado.update(
              {
                plano_versao_id: versao.id,
                nome: payload.nome,
                valor_centavos: payload.valorCentavos,
                moeda: 'BRL',
                trial_dias: payload.trialDias,
                gratuito: payload.gratuito,
                cobranca_inicio_em: payload.cobrancaInicioEm,
                intervalo: payload.intervalo,
                intervalo_quantidade: payload.intervaloQuantidade,
                observacao: payload.observacao,
                usos_maximos: 1,
                ativo: true,
              },
              { transaction }
            );
          } else if (!codigoPersonalizado) {
            const codigo = await buildUniqueCodigoAssinatura({ transaction });

            codigoPersonalizado = await CodigoAssinatura.create(
              {
                codigo: codigo.codigo,
                codigo_hash: codigo.codigo_hash,
                plano_id: plano.id,
                plano_versao_id: versao.id,
                nome: payload.nome,
                valor_centavos: payload.valorCentavos,
                moeda: 'BRL',
                trial_dias: payload.trialDias,
                gratuito: payload.gratuito,
                cobranca_inicio_em: payload.cobrancaInicioEm,
                intervalo: payload.intervalo,
                intervalo_quantidade: payload.intervaloQuantidade,
                ativo: true,
                usos_maximos: 1,
                observacao: payload.observacao,
              },
              { transaction }
            );
          }
        }

        const updatedPlan = await getPlanoWithDetails(plano.id, transaction);

        return {
          codigo: serializeCodigoAssinatura(codigoPersonalizado),
          plano: sanitizePlano(updatedPlan),
        };
      });

      return res.json(result);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Ja existe um plano ou codigo com estes dados.' });
      }

      return res.status(500).json({
        message: 'Erro ao atualizar plano administrativo.',
        detail: error.message,
      });
    }
  },

  async deletePlan(req, res) {
    const planoId = normalizeText(req.params.id, 80);
    const plano = await Plano.findByPk(planoId);

    if (!plano) {
      return res.status(404).json({ message: 'Plano nao encontrado.' });
    }

    try {
      const result = await sequelize.transaction(async transaction => {
        const versoes = await PlanoVersao.findAll({
          attributes: ['id'],
          where: { plano_id: plano.id },
          transaction,
        });
        const versaoIds = versoes.map(versao => versao.id);
        const [assinaturasCount, codigosUsadosCount] = await Promise.all([
          Assinatura.count({
            where: {
              [Op.or]: [
                { plano: plano.id },
                ...(versaoIds.length ? [{ plano_versao_id: { [Op.in]: versaoIds } }] : []),
              ],
            },
            transaction,
          }),
          CodigoAssinatura.count({
            where: {
              plano_id: plano.id,
              [Op.or]: [
                { usado_em: { [Op.ne]: null } },
                { usado_por_usuario_id: { [Op.ne]: null } },
                { usos_realizados: { [Op.gt]: 0 } },
              ],
            },
            transaction,
          }),
        ]);
        const hasHistory = assinaturasCount > 0 || codigosUsadosCount > 0;

        if (hasHistory) {
          const now = new Date();

          await Plano.update(
            {
              ativo: false,
              publico: false,
            },
            {
              where: { id: plano.id },
              transaction,
            }
          );
          await PlanoVersao.update(
            {
              ativo: false,
              vigente_ate: now,
            },
            {
              where: { plano_id: plano.id },
              transaction,
            }
          );
          await CodigoAssinatura.update(
            {
              ativo: false,
            },
            {
              where: { plano_id: plano.id },
              transaction,
            }
          );

          return {
            arquivado: true,
            removido: false,
          };
        }

        await CodigoAssinatura.destroy({
          where: { plano_id: plano.id },
          transaction,
        });

        if (versaoIds.length) {
          await PlanoRecurso.destroy({
            where: { plano_versao_id: { [Op.in]: versaoIds } },
            transaction,
          });
          await PlanoLimite.destroy({
            where: { plano_versao_id: { [Op.in]: versaoIds } },
            transaction,
          });
          await PlanoVersao.destroy({
            where: { id: { [Op.in]: versaoIds } },
            transaction,
          });
        }

        await Plano.destroy({
          where: { id: plano.id },
          transaction,
        });

        return {
          arquivado: false,
          removido: true,
        };
      });

      return res.json({
        ...result,
        message: result.arquivado
          ? 'Plano arquivado. O historico das assinaturas foi preservado.'
          : 'Plano excluido.',
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao excluir plano administrativo.',
        detail: error.message,
      });
    }
  },

  async listUsers(req, res) {
    try {
      const filters = {
        busca: normalizeText(req.query?.busca, 120),
        inadimplencia: normalizeText(req.query?.inadimplencia, 10),
        plano: normalizeText(req.query?.plano, 80),
        status: normalizeText(req.query?.status, 40),
      };
      const usuarioWhere = {};

      if (filters.busca) {
        usuarioWhere.email = {
          [Op.iLike]: `%${filters.busca}%`,
        };
      }

      const usuarios = await Usuario.findAll({
        where: usuarioWhere,
        order: [['created_at', 'DESC']],
      });
      const usuarioIds = usuarios.map(usuario => usuario.id);

      if (usuarioIds.length === 0) {
        return res.json({ usuarios: [] });
      }

      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      const [assinaturas, configuracoes, vendasRecentes, pdvsAtivos, subcontasAtivas, pagamentos] = await Promise.all([
        Assinatura.findAll({
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
          },
          order: [
            ['usuario_id', 'ASC'],
            ['id', 'DESC'],
          ],
        }),
        ConfiguracaoSistema.findAll({
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
          },
        }),
        Venda.findAll({
          attributes: ['usuario_id', [fn('COUNT', col('id')), 'total']],
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
            registrado_em: {
              [Op.gte]: trintaDiasAtras,
            },
          },
          group: ['usuario_id'],
          raw: true,
        }),
        Pdv.findAll({
          attributes: ['usuario_id', [fn('COUNT', col('id')), 'total']],
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
            ativo: true,
          },
          group: ['usuario_id'],
          raw: true,
        }),
        Subconta.findAll({
          attributes: ['usuario_id', [fn('COUNT', col('id')), 'total']],
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
            ativo: true,
          },
          group: ['usuario_id'],
          raw: true,
        }),
        PagamentoAssinatura.findAll({
          where: {
            usuario_id: {
              [Op.in]: usuarioIds,
            },
          },
          order: [
            ['processado_em', 'DESC'],
            ['id', 'DESC'],
          ],
        }),
      ]);

      const assinaturaPorUsuario = new Map();
      const assinaturasPorUsuario = new Map();

      for (const assinatura of assinaturas.map(toPlain)) {
        const items = assinaturasPorUsuario.get(assinatura.usuario_id) || [];

        items.push(assinatura);
        assinaturasPorUsuario.set(assinatura.usuario_id, items);
      }

      for (const [usuarioId, items] of assinaturasPorUsuario.entries()) {
        assinaturaPorUsuario.set(usuarioId, getCurrentSubscription(items));
      }

      const assinaturaIds = assinaturas.map(assinatura => assinatura.id);
      const alteracoesAgendadas = assinaturaIds.length
        ? await AlteracaoAssinatura.findAll({
            where: {
              assinatura_id: {
                [Op.in]: assinaturaIds,
              },
              status: 'agendada',
            },
            order: [
              ['aplicar_em', 'ASC'],
              ['id', 'DESC'],
            ],
          })
        : [];
      const alteracaoPorAssinatura = new Map();

      for (const alteracao of alteracoesAgendadas.map(toPlain)) {
        if (!alteracaoPorAssinatura.has(alteracao.assinatura_id)) {
          alteracaoPorAssinatura.set(alteracao.assinatura_id, alteracao);
        }
      }

      const configuracaoPorUsuario = new Map(configuracoes.map(configuracao => [configuracao.usuario_id, toPlain(configuracao)]));
      const vendasPorUsuario = new Map(
        vendasRecentes.map(row => [Number(row.usuario_id), Number(row.total) || 0])
      );
      const pdvsPorUsuario = new Map(pdvsAtivos.map(row => [Number(row.usuario_id), Number(row.total) || 0]));
      const subcontasPorUsuario = new Map(subcontasAtivas.map(row => [Number(row.usuario_id), Number(row.total) || 0]));
      const ultimoPagamentoPorUsuario = new Map();
      const pagamentosPorUsuario = new Map();

      for (const pagamento of pagamentos.map(toPlain)) {
        const items = pagamentosPorUsuario.get(pagamento.usuario_id) || [];

        items.push(pagamento);
        pagamentosPorUsuario.set(pagamento.usuario_id, items);

        if (!ultimoPagamentoPorUsuario.has(pagamento.usuario_id)) {
          ultimoPagamentoPorUsuario.set(pagamento.usuario_id, pagamento);
        }
      }

      const planosDisponiveis = new Map();
      const usuariosResumo = usuarios.map(usuario => {
        const data = toPlain(usuario);
        const assinatura = assinaturaPorUsuario.get(data.id) || null;
        const configuracao = configuracaoPorUsuario.get(data.id) || null;
        const ultimoPagamento = ultimoPagamentoPorUsuario.get(data.id) || null;
        const pagamentosUsuario = pagamentosPorUsuario.get(data.id) || [];
        const alteracaoAgendada = assinatura ? alteracaoPorAssinatura.get(assinatura.id) || null : null;
        const planoId = getAssinaturaPlanoId(assinatura);
        const planoNome = getAssinaturaPlanoNome(assinatura);
        const reguaInadimplencia = calcularReguaInadimplencia({
          assinatura,
          pagamentos: pagamentosUsuario,
        });

        if (planoId && planoNome) {
          planosDisponiveis.set(planoId, planoNome);
        }

        return {
          id: data.id,
          email: data.email,
          ativo: data.ativo,
          email_verificado: Boolean(data.email_verificado_em),
          registrado_em: data.created_at || data.createdAt || null,
          plano: planoNome,
          plano_id: planoId,
          assinatura_id: assinatura?.id || null,
          assinatura_status: assinatura?.status || null,
          proximo_pagamento_em: assinatura?.proximo_pagamento_em || null,
          fiscal_configurado: isFiscalConfigured(configuracao),
          vendas_30_dias: vendasPorUsuario.get(Number(data.id)) || 0,
          pdvs_ativos: pdvsPorUsuario.get(Number(data.id)) || 0,
          subcontas_ativas: subcontasPorUsuario.get(Number(data.id)) || 0,
          ultimo_pagamento: sanitizePagamentoAdmin(ultimoPagamento),
          inadimplente: isBillingAttention(reguaInadimplencia),
          fase_inadimplencia: reguaInadimplencia.fase,
          dias_em_atraso: reguaInadimplencia.dias_em_atraso,
          dias_para_bloqueio: reguaInadimplencia.dias_para_bloqueio,
          bloqueado: reguaInadimplencia.bloqueado,
          motivo_inadimplencia: reguaInadimplencia.motivo,
          regua_inadimplencia: reguaInadimplencia,
          alteracao_agendada: alteracaoAgendada,
        };
      });
      const usuariosFiltrados = usuariosResumo.filter(usuarioResumo => matchesAdminUserFilters(usuarioResumo, filters));

      return res.json({
        filtros: {
          planos: Array.from(planosDisponiveis.entries()).map(([id, nome]) => ({ id, nome })),
        },
        usuarios: usuariosFiltrados,
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao carregar usuarios administrativos.',
        detail: error.message,
      });
    }
  },

  async showUser(req, res) {
    try {
      const usuarioId = Number(req.params.id);

      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.status(400).json({ message: 'Usuario invalido.' });
      }

      const usuario = await Usuario.findByPk(usuarioId);

      if (!usuario) {
        return res.status(404).json({ message: 'Usuario nao encontrado.' });
      }

      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

      const [assinaturas, pagamentos, pdvs, subcontas, configuracao, vendas30Dias, vendasTotal, auditoria] = await Promise.all([
        Assinatura.findAll({
          where: { usuario_id: usuarioId },
          order: [['id', 'DESC']],
        }),
        PagamentoAssinatura.findAll({
          where: { usuario_id: usuarioId },
          order: [
            ['processado_em', 'DESC'],
            ['id', 'DESC'],
          ],
          limit: 50,
        }),
        Pdv.findAll({
          where: { usuario_id: usuarioId },
          order: [
            ['ativo', 'DESC'],
            ['id', 'DESC'],
          ],
        }),
        Subconta.findAll({
          where: { usuario_id: usuarioId },
          order: [
            ['ativo', 'DESC'],
            ['id', 'DESC'],
          ],
        }),
        ConfiguracaoSistema.findOne({ where: { usuario_id: usuarioId } }),
        Venda.findAll({
          attributes: [
            [fn('COUNT', col('id')), 'quantidade'],
            [fn('COALESCE', fn('SUM', col('total_centavos')), 0), 'total_centavos'],
          ],
          where: {
            usuario_id: usuarioId,
            registrado_em: {
              [Op.gte]: trintaDiasAtras,
            },
          },
          raw: true,
        }),
        Venda.findAll({
          attributes: [
            [fn('COUNT', col('id')), 'quantidade'],
            [fn('COALESCE', fn('SUM', col('total_centavos')), 0), 'total_centavos'],
          ],
          where: { usuario_id: usuarioId },
          raw: true,
        }),
        AcaoAdminAssinatura.findAll({
          where: { usuario_id: usuarioId },
          include: [
            {
              model: Administrador,
              as: 'administrador',
              attributes: ['id', 'nome', 'email'],
            },
          ],
          order: [
            ['created_at', 'DESC'],
            ['id', 'DESC'],
          ],
          limit: 40,
        }),
      ]);
      const assinaturaIds = assinaturas.map(assinatura => assinatura.id);
      const alteracoesAgendadas = assinaturaIds.length
        ? await AlteracaoAssinatura.findAll({
            where: {
              assinatura_id: {
                [Op.in]: assinaturaIds,
              },
            },
            order: [
              ['created_at', 'DESC'],
              ['id', 'DESC'],
            ],
          })
        : [];
      const alteracoesPorAssinatura = new Map();

      for (const alteracao of alteracoesAgendadas) {
        const items = alteracoesPorAssinatura.get(alteracao.assinatura_id) || [];

        items.push(alteracao);
        alteracoesPorAssinatura.set(alteracao.assinatura_id, items);
      }

      const assinaturaAtual = getCurrentSubscription(assinaturas.map(toPlain));
      const pagamentoAtual = pagamentos.map(toPlain)[0] || null;
      const reguaInadimplencia = calcularReguaInadimplencia({
        assinatura: assinaturaAtual,
        pagamentos: pagamentos.map(toPlain),
      });
      const vendas30 = vendas30Dias[0] || {};
      const vendasGeral = vendasTotal[0] || {};

      return res.json({
        usuario: toPlain(usuario),
        assinatura_atual: sanitizeAssinaturaAdmin(
          assinaturaAtual,
          assinaturaAtual ? (alteracoesPorAssinatura.get(assinaturaAtual.id) || []).find(alteracao => alteracao.status === 'agendada') : null
        ),
        assinaturas: assinaturas.map(assinatura => {
          const alteracoes = alteracoesPorAssinatura.get(assinatura.id) || [];

          return {
            ...sanitizeAssinaturaAdmin(assinatura, alteracoes.find(alteracao => alteracao.status === 'agendada')),
            alteracoes,
          };
        }),
        pagamentos: pagamentos.map(sanitizePagamentoAdmin).filter(Boolean),
        auditoria: auditoria.map(sanitizeAcaoAdminAssinatura).filter(Boolean),
        pdvs: pdvs.map(toPlain),
        subcontas: subcontas.map(toPlain),
        configuracao: configuracao ? {
          id: configuracao.id,
          fiscal_configurado: isFiscalConfigured(toPlain(configuracao)),
          fiscal: sanitizeFiscalSettings(toPlain(configuracao).fiscal || {}, { includeSecrets: false }),
        } : null,
        resumo: {
          inadimplente: isBillingAttention(reguaInadimplencia),
          fase_inadimplencia: reguaInadimplencia.fase,
          dias_em_atraso: reguaInadimplencia.dias_em_atraso,
          dias_para_bloqueio: reguaInadimplencia.dias_para_bloqueio,
          bloqueado: reguaInadimplencia.bloqueado,
          motivo_inadimplencia: reguaInadimplencia.motivo,
          regua_inadimplencia: reguaInadimplencia,
          ultimo_pagamento: sanitizePagamentoAdmin(pagamentoAtual),
          pdvs_ativos: pdvs.filter(pdv => pdv.ativo).length,
          subcontas_ativas: subcontas.filter(subconta => subconta.ativo).length,
          vendas_30_dias: Number(vendas30.quantidade) || 0,
          total_vendas_30_dias_centavos: Number(vendas30.total_centavos) || 0,
          vendas_total: Number(vendasGeral.quantidade) || 0,
          total_vendas_centavos: Number(vendasGeral.total_centavos) || 0,
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Erro ao carregar detalhes do usuario.',
        detail: error.message,
      });
    }
  },

  async updateUserSubscriptionValue(req, res) {
    const usuarioId = Number(req.params.id);
    const assinaturaId = Number(req.params.assinaturaId);
    const valorCentavos = parseCurrencyToCents(req.body?.valor_centavos ?? req.body?.valor ?? req.body?.valor_recorrente);
    const motivo = normalizeAdminActionMotivo(req.body?.motivo);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isInteger(assinaturaId) || assinaturaId <= 0) {
      return res.status(400).json({ message: 'Conta ou assinatura invalida.' });
    }

    if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
      return res.status(400).json({ message: 'Informe um valor recorrente valido.' });
    }

    try {
      const { assinatura: assinaturaAtual } = await findAdminSubscription(usuarioId, assinaturaId);
      let mercadoPagoSync = null;

      if (assinaturaAtual.mercado_pago_preapproval_id) {
        mercadoPagoSync = await updateMercadoPagoPreapprovalAmount(assinaturaAtual.mercado_pago_preapproval_id, {
          moeda: assinaturaAtual.moeda || 'BRL',
          valorCentavos,
        });
      }

      const result = await sequelize.transaction(async transaction => {
        const { assinatura } = await findAdminSubscription(usuarioId, assinaturaId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        const dadosAnteriores = buildAssinaturaAuditSnapshot(assinatura);
        const planoSnapshot = assinatura.plano_snapshot ? { ...assinatura.plano_snapshot } : null;

        if (planoSnapshot) {
          planoSnapshot.valor_centavos = valorCentavos;
          planoSnapshot.valor_recorrente_centavos = valorCentavos;
        }

        assinatura.valor_centavos = valorCentavos;
        assinatura.valor_recorrente_centavos = valorCentavos;
        assinatura.plano_snapshot = planoSnapshot;
        assinatura.tipo_movimento = 'ajuste_admin_valor';
        await assinatura.save({ transaction });

        const dadosNovos = buildAssinaturaAuditSnapshot(assinatura);
        const auditoria = await createAssinaturaAdminAudit({
          acao: 'ajustar_valor',
          administradorId: req.admin.id,
          assinatura,
          dadosAnteriores,
          dadosNovos,
          metadata: {
            mercado_pago_preapproval_id: assinatura.mercado_pago_preapproval_id || null,
            mercado_pago_sincronizado: Boolean(mercadoPagoSync),
          },
          motivo,
          transaction,
        });

        return { assinatura, auditoria };
      });

      return res.json({
        assinatura: sanitizeAssinaturaAdmin(result.assinatura),
        auditoria: sanitizeAcaoAdminAssinatura(result.auditoria),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Nao foi possivel ajustar o valor da assinatura.',
      });
    }
  },

  async grantUserSubscriptionTrial(req, res) {
    const usuarioId = Number(req.params.id);
    const assinaturaId = Number(req.params.assinaturaId);
    const diasGratis = normalizeInteger(req.body?.dias_gratis ?? req.body?.diasGratis ?? req.body?.dias, 0, {
      min: 0,
      max: 365,
    });
    const motivo = normalizeAdminActionMotivo(req.body?.motivo);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isInteger(assinaturaId) || assinaturaId <= 0) {
      return res.status(400).json({ message: 'Conta ou assinatura invalida.' });
    }

    if (!Number.isInteger(diasGratis) || diasGratis <= 0) {
      return res.status(400).json({ message: 'Informe a quantidade de dias gratis.' });
    }

    try {
      const result = await sequelize.transaction(async transaction => {
        const { assinatura } = await findAdminSubscription(usuarioId, assinaturaId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        if (['cancelada', 'substituida'].includes(String(assinatura.status || '').toLowerCase())) {
          const error = new Error('Reative a assinatura antes de conceder dias gratis.');
          error.statusCode = 409;
          throw error;
        }

        const dadosAnteriores = buildAssinaturaAuditSnapshot(assinatura);
        const proximoPagamentoEm = addDays(new Date(), diasGratis);

        assinatura.status = 'ativa';
        assinatura.ativada_em = assinatura.ativada_em || new Date();
        assinatura.cancelada_em = null;
        assinatura.proximo_pagamento_em = proximoPagamentoEm;
        assinatura.tipo_movimento = 'prazo_gratis_admin';
        await assinatura.save({ transaction });

        const dadosNovos = buildAssinaturaAuditSnapshot(assinatura);
        const auditoria = await createAssinaturaAdminAudit({
          acao: 'conceder_dias_gratis',
          administradorId: req.admin.id,
          assinatura,
          dadosAnteriores,
          dadosNovos,
          metadata: {
            dias_gratis: diasGratis,
            mercado_pago_preapproval_id: assinatura.mercado_pago_preapproval_id || null,
            mercado_pago_sincronizado: false,
            observacao: 'Prazo operacional local. Revisao fina com Mercado Pago fica na etapa de endurecimento.',
          },
          motivo,
          transaction,
        });

        return { assinatura, auditoria };
      });

      return res.json({
        assinatura: sanitizeAssinaturaAdmin(result.assinatura),
        auditoria: sanitizeAcaoAdminAssinatura(result.auditoria),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Nao foi possivel conceder dias gratis.',
      });
    }
  },

  async updateUserSubscriptionStatus(req, res) {
    const usuarioId = Number(req.params.id);
    const assinaturaId = Number(req.params.assinaturaId);
    const acao = normalizeText(req.body?.acao, 30);
    const motivo = normalizeAdminActionMotivo(req.body?.motivo);

    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isInteger(assinaturaId) || assinaturaId <= 0) {
      return res.status(400).json({ message: 'Conta ou assinatura invalida.' });
    }

    if (!['cancelar', 'pausar', 'reativar'].includes(acao)) {
      return res.status(400).json({ message: 'Escolha uma acao valida para a assinatura.' });
    }

    try {
      const { assinatura: assinaturaAtual } = await findAdminSubscription(usuarioId, assinaturaId);
      let mercadoPagoSync = null;

      if (assinaturaAtual.mercado_pago_preapproval_id) {
        if (acao === 'cancelar') {
          mercadoPagoSync = await cancelMercadoPagoPreapproval(assinaturaAtual.mercado_pago_preapproval_id);
        } else if (acao === 'pausar') {
          mercadoPagoSync = await pauseMercadoPagoPreapproval(assinaturaAtual.mercado_pago_preapproval_id);
        } else {
          mercadoPagoSync = await reactivateMercadoPagoPreapproval(assinaturaAtual.mercado_pago_preapproval_id);
        }
      }

      const result = await sequelize.transaction(async transaction => {
        const { assinatura } = await findAdminSubscription(usuarioId, assinaturaId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        const dadosAnteriores = buildAssinaturaAuditSnapshot(assinatura);
        const now = new Date();

        if (acao === 'cancelar') {
          assinatura.status = 'cancelada';
          assinatura.cancelada_em = now;
          assinatura.tipo_movimento = 'cancelamento_admin';

          await AlteracaoAssinatura.update(
            {
              status: 'cancelada',
              cancelada_em: now,
              motivo_cancelamento: 'Assinatura cancelada pelo administrador.',
            },
            {
              where: {
                assinatura_id: assinatura.id,
                status: 'agendada',
              },
              transaction,
            }
          );
        } else if (acao === 'pausar') {
          assinatura.status = 'pausada';
          assinatura.tipo_movimento = 'pausa_admin';
        } else {
          assinatura.status = 'ativa';
          assinatura.ativada_em = assinatura.ativada_em || now;
          assinatura.cancelada_em = null;
          assinatura.proximo_pagamento_em = assinatura.proximo_pagamento_em || addDays(now, 30);
          assinatura.tipo_movimento = 'reativacao_admin';
        }

        await assinatura.save({ transaction });

        const dadosNovos = buildAssinaturaAuditSnapshot(assinatura);
        const auditoria = await createAssinaturaAdminAudit({
          acao: `status_${acao}`,
          administradorId: req.admin.id,
          assinatura,
          dadosAnteriores,
          dadosNovos,
          metadata: {
            mercado_pago_preapproval_id: assinatura.mercado_pago_preapproval_id || null,
            mercado_pago_sincronizado: Boolean(mercadoPagoSync),
          },
          motivo,
          transaction,
        });

        return { assinatura, auditoria };
      });

      return res.json({
        assinatura: sanitizeAssinaturaAdmin(result.assinatura),
        auditoria: sanitizeAcaoAdminAssinatura(result.auditoria),
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Nao foi possivel atualizar o status da assinatura.',
      });
    }
  },
};
