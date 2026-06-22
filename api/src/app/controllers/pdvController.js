const { createHash, randomBytes, randomInt, randomUUID } = require('crypto');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const sequelize = require('../../database');
const {
  Arquivo,
  Caixa,
  ClienteConvenio,
  DespesaCaixa,
  Estoque,
  EventoPdv,
  Funcionario,
  MovimentacaoEstoque,
  Nf,
  NfEvento,
  Pdv,
  Produto,
  SaldoEstoqueProduto,
  Usuario,
  Venda,
} = require('../models');
const produtoController = require('./produtoController');
const configuracaoSistemaService = require('../services/configuracaoSistemaService');
const {
  buildStorageDirectory,
  buildStoredFileName,
  ensureDirectory,
  removePhysicalFile,
  toAbsolutePath,
  toRelativePath,
} = require('../services/fileStorageService');

const pairingTtlMinutes = 30;

function hashValue(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeCodigo(value) {
  const rawCode = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (rawCode.length === 6) {
    return `${rawCode.slice(0, 3)}-${rawCode.slice(3)}`;
  }

  return rawCode;
}

function createPairingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rawCode = Array.from({ length: 6 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
  const codigo = `${rawCode.slice(0, 3)}-${rawCode.slice(3)}`;

  return {
    codigo,
    hash: hashValue(codigo),
    expiraEm: new Date(Date.now() + pairingTtlMinutes * 60 * 1000),
  };
}

function createDeviceCredential() {
  return `caixa_pdv_${randomBytes(32).toString('hex')}`;
}

function getDesktopCredentials(req) {
  return {
    credencial: normalizeText(req.body?.credencial_dispositivo || req.body?.credencial, 160),
    dispositivoId: normalizeText(req.body?.dispositivo_id, 120),
  };
}

async function findPdvByDesktopCredentials({ credencial, dispositivoId }) {
  if (!credencial || !dispositivoId) {
    return null;
  }

  return Pdv.unscoped().findOne({
    where: {
      ativo: true,
      dispositivo_id: dispositivoId,
      credencial_hash: hashValue(credencial),
    },
  });
}

function resolveStatusOperacional(pdv) {
  const data = pdv.get ? pdv.get({ plain: true }) : pdv;

  if (!data.ativo) {
    return 'inativo';
  }

  if (!data.pareado_em) {
    return 'pendente';
  }

  if (data.status === 'online') {
    return 'online';
  }

  if (data.sincronizacao_pendente) {
    return 'offline';
  }

  return data.status || 'offline';
}

function buildIdentificacao(index) {
  return `PDV-${String(index + 1).padStart(3, '0')}`;
}

function sanitizePdv(pdv, extra = {}) {
  const data = pdv.get ? pdv.get({ plain: true }) : { ...pdv };
  const registrosVinculados = Number(extra.registros_vinculados ?? data.registros_vinculados ?? 0);

  delete data.credencial_hash;
  delete data.codigo_pareamento_hash;

  return {
    ...data,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
    codigo_pareamento_pendente:
      Boolean(data.codigo_pareamento_expira_em) &&
      !data.codigo_pareamento_usado_em &&
      new Date(data.codigo_pareamento_expira_em) > new Date(),
    status_operacional: resolveStatusOperacional(data),
    ...extra,
  };
}

async function getPdvRegistrosVinculados(usuarioId, pdvId) {
  const [caixas, vendas, despesas, eventos, notas] = await Promise.all([
    Caixa.count({ where: { usuario_id: usuarioId, pdv_id: pdvId } }),
    Venda.count({ where: { usuario_id: usuarioId, pdv_id: pdvId } }),
    DespesaCaixa.count({ where: { usuario_id: usuarioId, pdv_id: pdvId } }),
    EventoPdv.count({ where: { usuario_id: usuarioId, pdv_id: pdvId } }),
    Nf.count({ where: { usuario_id: usuarioId, pdv_id: pdvId } }),
  ]);

  return caixas + vendas + despesas + eventos + notas;
}

async function listUserPdvs(usuarioId) {
  return Pdv.findAll({
    where: {
      usuario_id: usuarioId,
    },
    order: [
      ['created_at', 'ASC'],
      ['id', 'ASC'],
    ],
  });
}

async function getVirtualIdentificacao(usuarioId, pdvId) {
  const pdvs = await listUserPdvs(usuarioId);
  const index = pdvs.findIndex(pdv => pdv.id === pdvId);

  if (index < 0) {
    return null;
  }

  return buildIdentificacao(index);
}

async function sanitizePdvList(pdvs) {
  return Promise.all(pdvs.map(async (pdv, index) =>
    sanitizePdv(pdv, {
      identificacao: buildIdentificacao(index),
      registros_vinculados: await getPdvRegistrosVinculados(pdv.usuario_id, pdv.id),
    })
  ));
}

async function getUserPdvsSnapshot(usuarioId) {
  const pdvs = await listUserPdvs(usuarioId);
  const sanitized = await sanitizePdvList(pdvs);

  return {
    pdvs: sanitized,
    total: sanitized.length,
    ativos: sanitized.filter(pdv => pdv.status_operacional === 'online').length,
    pareados: sanitized.filter(pdv => Boolean(pdv.pareado_em)).length,
    pendentes: sanitized.filter(pdv => pdv.status_operacional === 'pendente'),
  };
}

function sanitizeCents(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function parsePositiveNumber(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
}

function parseDate(value, fallback = new Date()) {
  const date = new Date(value || fallback);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date;
}

function getSaoPauloOperationDateParts(date) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date);
  const day = parts.find(part => part.type === 'day')?.value || '01';
  const month = parts.find(part => part.type === 'month')?.value || '01';
  const year = parts.find(part => part.type === 'year')?.value || '1970';

  return {
    chave: `${year}-${month}-${day}`,
    rotulo: `${day}/${month}/${year}`,
  };
}

function normalizeShiftNumber(value) {
  const parsed = Number(value || 1);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

async function getNextCashierShiftNumber({ usuarioId, pdvId, operationDateKey, transaction }) {
  const lastShiftNumber = await Caixa.max('numero_turno', {
    where: {
      usuario_id: usuarioId,
      pdv_id: pdvId,
      data_operacao_chave: operationDateKey,
    },
    transaction,
  });

  const parsedLastShiftNumber = Number(lastShiftNumber || 0);

  return Math.max(0, Number.isFinite(parsedLastShiftNumber) ? Math.floor(parsedLastShiftNumber) : 0) + 1;
}

function getEventPayload(event) {
  if (event?.payload && typeof event.payload === 'object') {
    return event.payload;
  }

  return {};
}

function normalizeSyncEvent(event) {
  const payload = getEventPayload(event);
  const rawEventId = normalizeText(event?.id || payload.eventId, 220) || `evento-${randomUUID()}`;
  const eventId = normalizeSyncEventStorageId(rawEventId);
  const eventType = normalizeText(event?.event_type || event?.eventType || event?.tipo, 40);
  const aggregateType = normalizeText(event?.aggregate_type || event?.aggregateType || event?.agregado_tipo, 40);
  const aggregateId = normalizeText(event?.aggregate_id || event?.aggregateId || event?.agregado_id, 64);
  const idempotencyKey = normalizeText(
    event?.idempotency_key || event?.idempotencyKey || event?.chave_idempotencia,
    220
  );

  return {
    id: eventId,
    clientId: rawEventId,
    eventType,
    aggregateType,
    aggregateId,
    idempotencyKey,
    payload,
    receivedAt: new Date(),
  };
}

function normalizeSyncEventStorageId(value) {
  const rawValue = normalizeText(value, 220);

  if (!rawValue) {
    return `evento-${randomUUID()}`;
  }

  if (rawValue.length <= 64) {
    return rawValue;
  }

  const digest = createHash('sha256').update(rawValue).digest('hex').slice(0, 16);
  return `${rawValue.slice(0, 47)}-${digest}`;
}

function buildSaleCode(sale) {
  return normalizeText(String(sale?.id || '').replace(/^venda-/, ''), 40) || randomUUID().slice(0, 36);
}

function normalizeSaleItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map(item => {
    const categoryName = item.category || item.categoria || item.categoria_visual?.nome || item.categoryVisual?.name || null;
    const categoryIcon = item.categoryIcon || item.categoria_icone || item.categoria_visual?.icone || item.categoryVisual?.icon || null;
    const categoryColor = item.categoryColor || item.categoria_cor || item.categoria_visual?.cor || item.categoryVisual?.color || null;
    const categoryAccent = item.categoryAccent || item.categoria_accent || item.categoria_visual?.accent || item.categoryVisual?.accent || null;

    return {
      id: item.id,
      produto_id: item.produto_id || item.productId || item.id || null,
      nome: item.name || item.nome || 'Produto',
      categoria: categoryName,
      categoria_visual: {
        nome: categoryName,
        icone: categoryIcon,
        cor: categoryColor,
        accent: categoryAccent,
      },
      imagem_url: item.imageUrl || item.imagem_url || item.image_url || item.imagem?.url || null,
      codigo_barras: item.barcode || item.codigo_barras || null,
      quantidade: parsePositiveNumber(item.quantity || item.quantidade),
      preco_unitario_centavos: sanitizeCents(item.priceCents || item.preco_unitario_centavos || item.preco_venda_centavos),
      total_centavos: sanitizeCents(
        (item.priceCents || item.preco_unitario_centavos || item.preco_venda_centavos) *
          parsePositiveNumber(item.quantity || item.quantidade)
      ),
    };
  });
}

function sanitizeDesktopClienteConvenio(cliente) {
  const data = cliente.get ? cliente.get({ plain: true }) : cliente;

  return {
    id: data.id,
    nome: data.nome,
    tipo_pessoa: data.tipo_pessoa || 'fisica',
    ativo: Boolean(data.ativo),
    permite_pagamento_frente_caixa: Boolean(data.permite_pagamento_frente_caixa),
    dados_fiscais: data.tipo_pessoa === 'juridica' ? data.dados_fiscais || null : null,
    updated_at: data.updated_at || data.updatedAt || null,
  };
}

function sanitizeDesktopFuncionario(funcionario) {
  const data = funcionario.get ? funcionario.get({ plain: true }) : funcionario;

  return {
    id: data.id,
    nome: data.nome,
    codigo_hash: data.codigo_hash,
    ativo: Boolean(data.ativo),
    updated_at: data.updated_at || data.updatedAt || null,
  };
}

async function loadDesktopFuncionariosSnapshot(usuarioId) {
  const funcionarios = await Funcionario.findAll({
    where: {
      usuario_id: usuarioId,
      ativo: true,
    },
    order: [
      ['nome', 'ASC'],
      ['id', 'ASC'],
    ],
  });

  return {
    funcionarios: funcionarios.map(sanitizeDesktopFuncionario),
  };
}

function getVendaClienteConvenioNome(venda) {
  return (
    normalizeText(venda.cliente_convenio?.nome, 160) ||
    normalizeText(venda.nome_cliente, 160) ||
    normalizeText(venda.nome_consumidor, 160) ||
    'Cliente não informado'
  );
}

function sanitizeDesktopConvenioRecebimento(venda) {
  const data = venda.get ? venda.get({ plain: true }) : venda;

  return {
    id: data.id,
    codigo: data.codigo,
    titulo: data.titulo,
    cliente_convenio_id: data.cliente_convenio_id || null,
    cliente_nome: getVendaClienteConvenioNome(data),
    cliente_tipo_pessoa: data.cliente_convenio?.tipo_pessoa || null,
    itens_count: Number(data.quantidade_itens || 0),
    itens: normalizeSaleItems(data.itens),
    total_centavos: sanitizeCents(data.total_centavos),
    status_convenio: normalizeKey(data.status_convenio) === 'pago' ? 'pago' : 'pendente',
    metodo_pagamento_recebimento: normalizeKey(data.metodo_pagamento_recebimento) || null,
    caixa_recebimento_id: data.caixa_recebimento_id || null,
    registrado_em: data.registrado_em || null,
    recebido_em: data.recebido_em || null,
  };
}

async function loadDesktopConvenioSnapshot(usuarioId) {
  const clientes = await ClienteConvenio.findAll({
    where: {
      usuario_id: usuarioId,
      ativo: true,
    },
    order: [
      ['nome', 'ASC'],
      ['id', 'ASC'],
    ],
  });
  const allowedClientIds = clientes
    .filter(cliente => Boolean(cliente.permite_pagamento_frente_caixa))
    .map(cliente => cliente.id);
  const recebimentos = allowedClientIds.length > 0
    ? await Venda.findAll({
        where: {
          usuario_id: usuarioId,
          cliente_convenio_id: {
            [Op.in]: allowedClientIds,
          },
          situacao: {
            [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
          },
          [Op.or]: [
            { metodo_pagamento: 'convenio' },
            { situacao: 'convenio' },
            { status_convenio: { [Op.in]: ['pendente', 'pago'] } },
          ],
        },
        include: [
          {
            model: ClienteConvenio,
            as: 'cliente_convenio',
            required: false,
          },
        ],
        order: [
          ['registrado_em', 'DESC'],
          ['created_at', 'DESC'],
        ],
      })
    : [];

  return {
    clientes_convenio: clientes.map(sanitizeDesktopClienteConvenio),
    recebimentos_convenio: recebimentos.map(sanitizeDesktopConvenioRecebimento),
  };
}

async function findPrimaryStock(usuarioId, transaction) {
  let estoque = await Estoque.findOne({
    where: {
      usuario_id: usuarioId,
      principal_venda: true,
    },
    transaction,
  });

  if (!estoque) {
    estoque = await Estoque.findOne({
      where: { usuario_id: usuarioId },
      order: [
        ['ordem', 'ASC'],
        ['id', 'ASC'],
      ],
      transaction,
    });
  }

  if (!estoque) {
    estoque = await Estoque.create(
      {
        usuario_id: usuarioId,
        nome: 'Estoque principal',
        principal_venda: true,
        permite_venda: true,
        ativo: true,
        ordem: 0,
      },
      { transaction }
    );
  }

  if (estoque.ativo === false || !estoque.principal_venda || !estoque.permite_venda) {
    await estoque.update(
      {
        principal_venda: true,
        permite_venda: true,
        ativo: true,
      },
      { transaction }
    );
  }

  return estoque;
}

async function getOrCreateProductStock(usuarioId, produtoId, estoqueId, transaction) {
  const [saldo] = await SaldoEstoqueProduto.findOrCreate({
    where: {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoqueId,
    },
    defaults: {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoqueId,
      quantidade: 0,
    },
    transaction,
  });

  return saldo;
}

async function applySaleStockMovement(usuarioId, sale, transaction) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const estoque = await findPrimaryStock(usuarioId, transaction);

  for (const item of items) {
    const produtoId = Number(item.id);
    const quantidade = parsePositiveNumber(item.quantity || item.quantidade);

    if (!Number.isInteger(produtoId) || produtoId <= 0 || quantidade <= 0) {
      continue;
    }

    const produto = await Produto.findOne({
      where: {
        id: produtoId,
        usuario_id: usuarioId,
      },
      transaction,
    });

    if (!produto?.controla_estoque) {
      continue;
    }

    const saldo = await getOrCreateProductStock(usuarioId, produto.id, estoque.id, transaction);
    const saldoAntes = Number(saldo.quantidade || 0);
    const saldoDepois = Number((saldoAntes - quantidade).toFixed(3));

    await saldo.update({ quantidade: saldoDepois }, { transaction });
    await MovimentacaoEstoque.create(
      {
        usuario_id: usuarioId,
        lancamento_id: sale.id,
        produto_id: produto.id,
        produto_nome: produto.nome,
        estoque_origem_id: estoque.id,
        estoque_origem_nome: estoque.nome,
        estoque_destino_id: null,
        estoque_destino_nome: null,
        tipo: 'venda',
        quantidade,
        saldo_origem_antes: saldoAntes,
        saldo_origem_depois: saldoDepois,
      },
      { transaction }
    );
  }
}

async function applySaleStockRestoration(usuarioId, sale, transaction) {
  const items = Array.isArray(sale?.items) ? sale.items : Array.isArray(sale?.itens) ? sale.itens : [];
  const estoque = await findPrimaryStock(usuarioId, transaction);

  for (const item of items) {
    const produtoId = Number(item.id);
    const quantidade = parsePositiveNumber(item.quantity || item.quantidade);

    if (!Number.isInteger(produtoId) || produtoId <= 0 || quantidade <= 0) {
      continue;
    }

    const produto = await Produto.findOne({
      where: {
        id: produtoId,
        usuario_id: usuarioId,
      },
      transaction,
    });

    if (!produto?.controla_estoque) {
      continue;
    }

    const saldo = await getOrCreateProductStock(usuarioId, produto.id, estoque.id, transaction);
    const saldoAntes = Number(saldo.quantidade || 0);
    const saldoDepois = Number((saldoAntes + quantidade).toFixed(3));

    await saldo.update({ quantidade: saldoDepois }, { transaction });
    await MovimentacaoEstoque.create(
      {
        usuario_id: usuarioId,
        lancamento_id: sale.id,
        produto_id: produto.id,
        produto_nome: produto.nome,
        estoque_origem_id: null,
        estoque_origem_nome: null,
        estoque_destino_id: estoque.id,
        estoque_destino_nome: estoque.nome,
        tipo: 'cancelamento_venda',
        quantidade,
        saldo_destino_antes: saldoAntes,
        saldo_destino_depois: saldoDepois,
        observacao: 'Estorno de venda cancelada pelo PDV.',
      },
      { transaction }
    );
  }
}

async function resolveSessionEmployee(usuarioId, employee, transaction) {
  const employeeId = Number(employee?.id || 0);
  const fallbackName = normalizeText(employee?.nome || employee?.name, 120);

  if (!Number.isInteger(employeeId) || employeeId <= 0) {
    return {
      id: null,
      nome: fallbackName || null,
    };
  }

  const funcionario = await Funcionario.findOne({
    where: {
      id: employeeId,
      usuario_id: usuarioId,
    },
    transaction,
  });

  if (!funcionario || funcionario.ativo === false) {
    return {
      id: null,
      nome: fallbackName || funcionario?.nome || null,
    };
  }

  return {
    id: String(funcionario.id),
    nome: funcionario.nome,
  };
}

async function upsertCashierSession({ pdv, session, status, transaction }) {
  if (!session?.id) {
    throw new Error('Evento de caixa sem sessão local.');
  }

  const openedAt = parseDate(session.openedAt || session.aberto_em);
  const closedAt = session.closedAt || session.fechado_em ? parseDate(session.closedAt || session.fechado_em) : null;
  const operationDate = getSaoPauloOperationDateParts(openedAt);
  const openedByEmployee = await resolveSessionEmployee(pdv.usuario_id, {
    id: session.openedByEmployeeId || session.funcionario_abertura_id,
    nome: session.openedByEmployeeName || session.funcionario_abertura_nome,
  }, transaction);
  const closedByEmployee = await resolveSessionEmployee(pdv.usuario_id, {
    id: session.closedByEmployeeId || session.funcionario_fechamento_id,
    nome: session.closedByEmployeeName || session.funcionario_fechamento_nome,
  }, transaction);
  const existing = await Caixa.findOne({
    where: {
      id: session.id,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });
  const values = {
    usuario_id: pdv.usuario_id,
    pdv_id: pdv.id,
    dispositivo_id: pdv.dispositivo_id,
    data_operacao_chave: operationDate.chave,
    data_operacao_rotulo: operationDate.rotulo,
    numero_turno: normalizeShiftNumber(session.shiftNumber || session.numero_turno),
    situacao: status,
    aberto_em: openedAt,
    fechado_em: status === 'fechado' ? closedAt || new Date() : null,
    funcionario_abertura_id: openedByEmployee.id,
    funcionario_abertura_nome: openedByEmployee.nome,
    funcionario_fechamento_id: status === 'fechado' ? closedByEmployee.id : null,
    funcionario_fechamento_nome: status === 'fechado' ? closedByEmployee.nome : null,
  };

  if (existing) {
    await existing.update(
      {
        ...values,
        data_operacao_chave: existing.data_operacao_chave || values.data_operacao_chave,
        data_operacao_rotulo: existing.data_operacao_rotulo || values.data_operacao_rotulo,
        numero_turno: normalizeShiftNumber(existing.numero_turno || values.numero_turno),
        aberto_em: existing.aberto_em || values.aberto_em,
        funcionario_abertura_id: values.funcionario_abertura_id || existing.funcionario_abertura_id,
        funcionario_abertura_nome: values.funcionario_abertura_nome || existing.funcionario_abertura_nome,
        funcionario_fechamento_id: values.funcionario_fechamento_id || existing.funcionario_fechamento_id,
        funcionario_fechamento_nome: values.funcionario_fechamento_nome || existing.funcionario_fechamento_nome,
      },
      { transaction }
    );
    return existing;
  }

  const conflictingShift = await Caixa.findOne({
    where: {
      usuario_id: pdv.usuario_id,
      pdv_id: pdv.id,
      data_operacao_chave: operationDate.chave,
      numero_turno: values.numero_turno,
    },
    transaction,
  });

  if (conflictingShift) {
    values.numero_turno = await getNextCashierShiftNumber({
      usuarioId: pdv.usuario_id,
      pdvId: pdv.id,
      operationDateKey: operationDate.chave,
      transaction,
    });
  }

  return Caixa.create(
    {
      id: session.id,
      ...values,
    },
    { transaction }
  );
}

async function processCashierOpened(pdv, payload, transaction) {
  return upsertCashierSession({
    pdv,
    session: payload.session,
    status: 'aberto',
    transaction,
  });
}

async function processCashierClosed(pdv, payload, transaction) {
  return upsertCashierSession({
    pdv,
    session: payload.session,
    status: 'fechado',
    transaction,
  });
}

async function processSaleCompleted(pdv, payload, transaction) {
  const sale = payload.sale;

  if (!sale?.id) {
    throw new Error('Evento de venda sem identificador local.');
  }

  const existingSale = await Venda.findOne({
    where: {
      id: sale.id,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });

  if (existingSale) {
    return existingSale;
  }

  let cashierSession = null;

  if (payload.session) {
    cashierSession = await upsertCashierSession({
      pdv,
      session: payload.session,
      status: 'aberto',
      transaction,
    });
  }

  const items = normalizeSaleItems(sale.items);
  const quantity = items.reduce((total, item) => total + item.quantidade, 0);
  const totalCents = sanitizeCents(sale.totalCents || sale.total_centavos);
  const requestedCommandOrigin = payload.origem === 'comanda' || Boolean(payload.origemComandaNome);
  const commandSettings = requestedCommandOrigin
    ? await configuracaoSistemaService.getCommandSettings(pdv.usuario_id)
    : { ativo: true };
  const origem = requestedCommandOrigin && commandSettings.ativo ? 'comanda' : 'caixa';
  const origemComandaNome = origem === 'comanda' ? normalizeText(payload.origemComandaNome, 120) : '';
  const paymentMethod = normalizeText(sale.paymentMethod || sale.metodo_pagamento, 20) || null;
  const isConvenioPayment = normalizeKey(paymentMethod) === 'convenio';
  const clientName = normalizeText(sale.clientName || sale.nome_cliente || sale.customerName, 120);
  const clientId = Number(sale.cliente_convenio_id || sale.clienteConvenioId || sale.clientId || 0);
  const requestedClientConvenioId = Number.isInteger(clientId) && clientId > 0 ? clientId : null;
  let clientConvenioId = null;
  let convenioClientName = clientName || normalizeText(sale.customerLabel || sale.cliente_nome, 120) || null;

  if (isConvenioPayment && requestedClientConvenioId) {
    const convenioClient = await ClienteConvenio.findOne({
      where: {
        id: requestedClientConvenioId,
        usuario_id: pdv.usuario_id,
        ativo: true,
      },
      transaction,
    });

    if (convenioClient) {
      clientConvenioId = convenioClient.id;
      convenioClientName = convenioClientName || convenioClient.nome;
    }
  }

  const createdSale = await Venda.create(
    {
      id: sale.id,
      usuario_id: pdv.usuario_id,
      pdv_id: pdv.id,
      dispositivo_id: pdv.dispositivo_id,
      caixa_id: cashierSession?.id || payload.session?.id || null,
      codigo: buildSaleCode(sale),
      tipo_origem: origem,
      referencia_origem: origemComandaNome || null,
      titulo: origemComandaNome ? `Venda - ${origemComandaNome}` : 'Venda no caixa',
      cliente_convenio_id: isConvenioPayment ? clientConvenioId : null,
      nome_cliente: isConvenioPayment ? convenioClientName : null,
      rotulo_origem: origemComandaNome || 'Caixa',
      canal: 'pdv',
      itens: items,
      quantidade_itens: quantity,
      subtotal_centavos: totalCents,
      total_centavos: totalCents,
      desconto_pagamento_centavos: 0,
      metodo_pagamento: paymentMethod,
      metodo_pagamento_recebimento: null,
      caixa_recebimento_id: null,
      situacao: isConvenioPayment ? 'convenio' : 'paga',
      status_convenio: isConvenioPayment ? 'pendente' : null,
      situacao_recebimento: isConvenioPayment ? 'pendente' : 'nenhum',
      recebido_em: isConvenioPayment ? null : parseDate(sale.createdAt || sale.registrado_em),
      observacao: null,
      registrado_em: parseDate(sale.createdAt || sale.registrado_em),
    },
    { transaction }
  );

  await applySaleStockMovement(pdv.usuario_id, sale, transaction);
  return createdSale;
}

async function processSaleCanceled(pdv, payload, transaction) {
  const sale = payload.sale || {};
  const saleId = normalizeText(sale.id || payload.saleId || payload.venda_id || payload.id, 64);

  if (!saleId) {
    throw new Error('Evento de cancelamento sem identificador da venda.');
  }

  const existingSale = await Venda.findOne({
    where: {
      id: saleId,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });

  if (!existingSale) {
    throw new Error('Venda não encontrada para cancelamento. Reenvie a sincronização após a venda ser enviada.');
  }

  if (existingSale.situacao === 'cancelada') {
    return existingSale;
  }

  await applySaleStockRestoration(
    pdv.usuario_id,
    {
      id: existingSale.id,
      items: existingSale.itens,
    },
    transaction
  );

  const canceledAt = parseDate(payload.canceledAt || payload.cancelada_em || new Date());
  const existingObservation = normalizeText(existingSale.observacao, 500);
  const cancellationNote = `Cancelada pelo PDV em ${canceledAt.toISOString()}.`;

  await existingSale.update(
    {
      situacao: 'cancelada',
      observacao: existingObservation ? `${existingObservation}\n${cancellationNote}` : cancellationNote,
    },
    { transaction }
  );

  return existingSale;
}

async function processConvenioReceived(pdv, payload, transaction) {
  const receipt = payload.receipt || payload.recebimento || {};
  const vendaId = normalizeText(
    receipt.id || receipt.venda_id || payload.venda_id || payload.saleId || payload.id,
    64
  );
  const paymentMethod = normalizeKey(
    receipt.paymentMethod ||
      receipt.metodo_pagamento ||
      payload.paymentMethod ||
      payload.metodo_pagamento
  );

  if (!vendaId) {
    throw new Error('Evento de recebimento de convênio sem venda.');
  }

  if (!['dinheiro', 'pix', 'cartao'].includes(paymentMethod)) {
    throw new Error('Informe a forma de pagamento do recebimento de convênio.');
  }

  let cashierSession = null;

  if (payload.session) {
    cashierSession = await upsertCashierSession({
      pdv,
      session: payload.session,
      status: 'aberto',
      transaction,
    });
  }

  const venda = await Venda.findOne({
    where: {
      id: vendaId,
      usuario_id: pdv.usuario_id,
      situacao: {
        [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
      },
      [Op.or]: [
        { metodo_pagamento: 'convenio' },
        { situacao: 'convenio' },
        { status_convenio: 'pendente' },
      ],
    },
    transaction,
  });

  if (!venda) {
    throw new Error('Recebimento de convênio não encontrado para este PDV.');
  }

  if (normalizeKey(venda.status_convenio) === 'pago') {
    return venda;
  }

  await venda.update(
    {
      status_convenio: 'pago',
      situacao_recebimento: 'recebido_caixa',
      metodo_pagamento_recebimento: paymentMethod,
      caixa_recebimento_id: cashierSession?.id || payload.session?.id || null,
      recebido_em: parseDate(receipt.receivedAt || receipt.recebido_em || payload.receivedAt || new Date()),
    },
    { transaction }
  );

  return venda;
}

async function processExpenseCreated(pdv, payload, transaction) {
  const expense = payload.expense;

  if (!expense?.id) {
    throw new Error('Evento de despesa sem identificador local.');
  }

  const existingExpense = await DespesaCaixa.findOne({
    where: {
      id: expense.id,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });

  if (existingExpense) {
    return existingExpense;
  }

  let cashierSession = null;

  if (payload.session) {
    cashierSession = await upsertCashierSession({
      pdv,
      session: payload.session,
      status: 'aberto',
      transaction,
    });
  }

  return DespesaCaixa.create(
    {
      id: expense.id,
      usuario_id: pdv.usuario_id,
      pdv_id: pdv.id,
      dispositivo_id: pdv.dispositivo_id,
      caixa_id: cashierSession?.id || payload.session?.id,
      origem: 'pdv',
      descricao: normalizeText(expense.title || expense.descricao, 160) || 'Despesa do caixa',
      valor_centavos: sanitizeCents(expense.amountCents || expense.valor_centavos),
      registrado_em: parseDate(expense.createdAt || expense.registrado_em),
    },
    { transaction }
  );
}

async function processExpenseUpdated(pdv, payload, transaction) {
  const expense = payload.expense;

  if (!expense?.id) {
    throw new Error('Evento de despesa sem identificador local.');
  }

  let cashierSession = null;

  if (payload.session) {
    cashierSession = await upsertCashierSession({
      pdv,
      session: payload.session,
      status: 'aberto',
      transaction,
    });
  }

  const values = {
    usuario_id: pdv.usuario_id,
    pdv_id: pdv.id,
    dispositivo_id: pdv.dispositivo_id,
    caixa_id: cashierSession?.id || payload.session?.id,
    origem: 'pdv',
    descricao: normalizeText(expense.title || expense.descricao, 160) || 'Despesa do caixa',
    valor_centavos: sanitizeCents(expense.amountCents || expense.valor_centavos),
    registrado_em: parseDate(expense.createdAt || expense.registrado_em || new Date()),
  };
  const existingExpense = await DespesaCaixa.findOne({
    where: {
      id: expense.id,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });

  if (!existingExpense) {
    return DespesaCaixa.create(
      {
        id: expense.id,
        ...values,
      },
      { transaction }
    );
  }

  await existingExpense.update(values, { transaction });

  return existingExpense;
}

async function processExpenseDeleted(pdv, payload, transaction) {
  const expense = payload.expense;
  const expenseId = expense?.id || payload.expenseId || payload.despesa_id;

  if (!expenseId) {
    throw new Error('Evento de despesa sem identificador local.');
  }

  const existingExpense = await DespesaCaixa.findOne({
    where: {
      id: expenseId,
      usuario_id: pdv.usuario_id,
    },
    transaction,
  });

  if (!existingExpense) {
    return null;
  }

  await existingExpense.destroy({ transaction });

  return existingExpense;
}

async function processDesktopSyncEvent(pdv, rawEvent) {
  const event = normalizeSyncEvent(rawEvent);

  if (!event.eventType || !event.aggregateType || !event.aggregateId || !event.idempotencyKey) {
    return {
      id: event.clientId,
      status: 'erro',
      message: 'Evento offline incompleto.',
    };
  }

  const existing = await EventoPdv.findOne({
    where: {
      chave_idempotencia: event.idempotencyKey,
    },
  });

  if (existing) {
    return {
      id: event.clientId,
      status: existing.status === 'processado' ? 'duplicado' : existing.status,
    };
  }

  const transaction = await sequelize.transaction();

  try {
    if (event.eventType === 'turno_aberto') {
      await processCashierOpened(pdv, event.payload, transaction);
    } else if (event.eventType === 'turno_fechado') {
      await processCashierClosed(pdv, event.payload, transaction);
    } else if (event.eventType === 'venda_concluida') {
      await processSaleCompleted(pdv, event.payload, transaction);
    } else if (event.eventType === 'venda_cancelada') {
      await processSaleCanceled(pdv, event.payload, transaction);
    } else if (event.eventType === 'convenio_recebido') {
      await processConvenioReceived(pdv, event.payload, transaction);
    } else if (event.eventType === 'despesa_lancada') {
      await processExpenseCreated(pdv, event.payload, transaction);
    } else if (event.eventType === 'despesa_atualizada') {
      await processExpenseUpdated(pdv, event.payload, transaction);
    } else if (event.eventType === 'despesa_excluida') {
      await processExpenseDeleted(pdv, event.payload, transaction);
    } else {
      throw new Error(`Tipo de evento não suportado: ${event.eventType}.`);
    }

    await EventoPdv.create(
      {
        id: event.id,
        usuario_id: pdv.usuario_id,
        pdv_id: pdv.id,
        dispositivo_id: pdv.dispositivo_id,
        chave_idempotencia: event.idempotencyKey,
        tipo: event.eventType,
        agregado_tipo: event.aggregateType,
        agregado_id: event.aggregateId,
        payload: event.payload,
        status: 'processado',
        erro: null,
        recebido_em: event.receivedAt,
        processado_em: new Date(),
      },
      { transaction }
    );

    await transaction.commit();

    return {
      id: event.clientId,
      status: 'processado',
    };
  } catch (error) {
    await transaction.rollback();

    return {
      id: event.clientId,
      status: 'erro',
      message: error.message,
    };
  }
}

function asObject(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeFiscalInteger(value, fallback = null, { min = 1, max = 999999999 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeFiscalModelo(value) {
  const modelo = normalizeText(value, 2);
  return modelo === '55' ? '55' : '65';
}

function normalizeFiscalAmbiente(value) {
  const ambiente = normalizeText(value, 20);
  return ambiente === 'producao' ? 'producao' : 'homologacao';
}

function getFiscalCode(value) {
  const code = normalizeText(value, 20);
  return code || null;
}

function normalizeFiscalStatus(document, rawResult, data) {
  const status = normalizeText(document.status || rawResult.status, 32);
  const cStat = getFiscalCode(document.codigo_retorno_sefaz || rawResult.codigoRetornoSefaz || data.cStat || data.codigoRetornoSefaz);
  const success = Boolean(rawResult.success);
  const normalized = `${status} ${data.xMotivo || ''} ${rawResult.friendlyMessage || ''}`.toLowerCase();

  if (success && (status === 'autorizada' || cStat === '100')) {
    return 'autorizada';
  }

  if (status.includes('cancel')) {
    return 'cancelada';
  }

  if (status.includes('inutil')) {
    return 'inutilizada';
  }

  if (normalized.includes('contingencia') || normalized.includes('contingência')) {
    return 'contingencia';
  }

  if (cStat === '204' || cStat === '539' || normalized.includes('duplicidade')) {
    return 'rejeitada';
  }

  if (status.includes('rejeitada') || status.includes('denegada')) {
    return status.includes('denegada') ? 'denegada' : 'rejeitada';
  }

  if (status.includes('pendente') || status.includes('transmitindo')) {
    return status.includes('transmitindo') ? 'transmitindo' : 'pendente';
  }

  if (status.includes('configuracao') || status.includes('worker') || status.includes('erro') || rawResult.success === false) {
    return 'erro_tecnico';
  }

  return 'pendente';
}

function resolveFiscalTipoEmissao(document, rawResult, data, status) {
  const value = normalizeText(document.tipo_emissao || data.tpEmis || data.tipoEmissao || rawResult.tipo_emissao, 24);
  const normalized = `${value} ${status} ${rawResult.status || ''}`.toLowerCase();

  if (['4', '5', '6', '7', '8', '9'].includes(value) || normalized.includes('contingencia') || normalized.includes('contingência')) {
    return 'contingencia';
  }

  return 'normal';
}

function resolveFiscalTotalCentavos(document, rawResult) {
  const payload = asObject(rawResult.payload || document.payload);
  const sale = asObject(payload.sale || payload.venda);
  const data = asObject(rawResult.data);
  const xmlProc = typeof data.xmlProc === 'string' ? data.xmlProc : '';
  const xmlTotalMatch = xmlProc.match(/<vNF>(\d+(?:\.\d{1,2})?)<\/vNF>/);
  const xmlTotalCents = xmlTotalMatch ? Math.round(Number(xmlTotalMatch[1]) * 100) : 0;

  return sanitizeCents(
    document.total_centavos ??
      document.totalCents ??
      sale.totalCents ??
      sale.total_centavos ??
      payload.totalCents ??
      payload.total_centavos ??
      xmlTotalCents
  );
}

function getFiscalDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildFiscalReturnPayload(document, rawResult, data) {
  return {
    origem: 'pdv',
    documento_local_id: normalizeText(document.id, 64),
    status_local: normalizeText(document.status || rawResult.status, 64) || null,
    codigo_retorno_sefaz: getFiscalCode(document.codigo_retorno_sefaz || rawResult.codigoRetornoSefaz || data.cStat || data.codigoRetornoSefaz),
    mensagem_sefaz: normalizeText(document.mensagem_sefaz || rawResult.mensagemSefaz || data.xMotivo, 500) || null,
    mensagem_operador: normalizeText(document.mensagem_operador || data.mensagemOperador || rawResult.friendlyMessage, 500) || null,
    mensagem_tecnica: document.mensagem_tecnica || rawResult.technicalMessage || null,
    protocolo: normalizeText(document.protocolo || data.protocolo || data.nProt, 80) || null,
    chave: normalizeText(document.chave || data.chave, 44) || null,
    caminhos: {
      xml_enviado_path: document.xml_enviado_path || data.xmlEnviadoPath || null,
      xml_autorizado_path: document.xml_autorizado_path || data.xmlAutorizadoPath || null,
      pdf_path: document.pdf_path || data.pdfPath || null,
      log_path: document.log_path || rawResult.logPath || null,
    },
    resposta: rawResult,
  };
}

const maxFiscalXmlBytes = 8 * 1024 * 1024;

function normalizeXmlContent(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const content = value.trim();

  if (!content || !content.includes('<') || Buffer.byteLength(content, 'utf8') > maxFiscalXmlBytes) {
    return null;
  }

  return content;
}

function firstXmlContent(...values) {
  for (const value of values) {
    const content = normalizeXmlContent(value);

    if (content) {
      return content;
    }
  }

  return null;
}

function buildFiscalXmlPayload(document, rawResult, data) {
  return {
    enviado: firstXmlContent(
      document.xml_enviado_conteudo,
      document.xmlEnviadoConteudo,
      document.xml_enviado,
      document.xmlEnviado,
      document.xml_assinado,
      document.xmlAssinado,
      data.xmlAssinado,
      data.xmlEnviado
    ),
    autorizado: firstXmlContent(
      document.xml_autorizado_conteudo,
      document.xmlAutorizadoConteudo,
      document.xml_proc,
      document.xmlProc,
      data.xmlProc,
      rawResult.xmlProc
    ),
  };
}

function buildFiscalXmlOriginalName(values, tipoXml) {
  const modelo = values.modelo === '55' ? 'nfe' : 'nfce';
  const serie = String(values.serie || 'sem-serie').padStart(3, '0');
  const numero = String(values.numero || 'sem-numero').padStart(9, '0');

  return `${modelo}-serie-${serie}-${numero}-${tipoXml}.xml`;
}

function getFiscalXmlContext(tipoXml) {
  if (tipoXml === 'autorizado') {
    return 'nf_xml_autorizado';
  }

  if (tipoXml === 'enviado') {
    return 'nf_xml_enviado';
  }

  return `nf_xml_${tipoXml}`;
}

function getTerminalFiscalEventXmlType(status) {
  if (status === 'cancelada') {
    return 'cancelamento';
  }

  if (status === 'inutilizada') {
    return 'inutilizacao';
  }

  return null;
}

async function createFiscalXmlArquivo({ usuarioId, values, tipoXml, xmlContent, transaction, createdFilePaths }) {
  const mimeType = 'application/xml';
  const originalName = buildFiscalXmlOriginalName(values, tipoXml);
  const storageDirectory = buildStorageDirectory(usuarioId, mimeType);
  const storedFileName = buildStoredFileName({ originalname: originalName, mimetype: mimeType });
  const absolutePath = path.join(storageDirectory, storedFileName);
  const buffer = Buffer.from(xmlContent, 'utf8');

  ensureDirectory(storageDirectory);
  await fs.promises.writeFile(absolutePath, buffer);
  createdFilePaths.push(absolutePath);

  return Arquivo.create(
    {
      usuario_id: usuarioId,
      nome_original: originalName,
      nome_armazenado: storedFileName,
      mime_type: mimeType,
      extensao: 'xml',
      tamanho_bytes: buffer.length,
      tipo: 'xml',
      contexto: getFiscalXmlContext(tipoXml),
      visibilidade: 'privado',
      caminho_relativo: toRelativePath(absolutePath),
      metadados: {
        origem: 'pdv_sync',
        nf_id: values.id,
        venda_id: values.venda_id,
        chave_acesso: values.chave_acesso,
        modelo: values.modelo,
        serie: values.serie,
        numero: values.numero,
        tipo_xml: tipoXml,
      },
    },
    { transaction }
  );
}

function buildFiscalEventSummary(eventData) {
  return {
    tipo: eventData.tipo,
    status: eventData.status,
    codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
    mensagem: eventData.mensagem || null,
    arquivo_xml_id: eventData.arquivo_xml_id || null,
    ocorrido_em: eventData.ocorrido_em.toISOString(),
  };
}

async function appendFiscalEvent(nf, eventData, transaction) {
  const eventos = Array.isArray(nf.eventos) ? nf.eventos : [];
  const lastEvent = eventos.at(-1);

  if (
    lastEvent &&
    lastEvent.tipo === eventData.tipo &&
    lastEvent.status === eventData.status &&
    String(lastEvent.codigo_retorno_sefaz || '') === String(eventData.codigo_retorno_sefaz || '') &&
    String(lastEvent.mensagem || '') === String(eventData.mensagem || '') &&
    String(lastEvent.arquivo_xml_id || '') === String(eventData.arquivo_xml_id || '')
  ) {
    return false;
  }

  nf.eventos = [...eventos, buildFiscalEventSummary(eventData)].slice(-80);
  await NfEvento.create(
    {
      nf_id: nf.id,
      usuario_id: nf.usuario_id,
      tipo: eventData.tipo,
      status: eventData.status,
      codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
      mensagem: eventData.mensagem || null,
      arquivo_xml_id: eventData.arquivo_xml_id || null,
      detalhes: eventData.detalhes && typeof eventData.detalhes === 'object' ? eventData.detalhes : {},
      ocorrido_em: eventData.ocorrido_em,
    },
    { transaction }
  );

  return true;
}

async function findExistingFiscalDocument(pdv, values, transaction) {
  const baseWhere = { usuario_id: pdv.usuario_id };
  const id = normalizeText(values.id, 64);
  const chave = normalizeText(values.chave_acesso, 44);

  if (id) {
    const byId = await Nf.findOne({
      where: { ...baseWhere, id },
      transaction,
    });

    if (byId) {
      return byId;
    }
  }

  if (chave) {
    const byKey = await Nf.findOne({
      where: { ...baseWhere, chave_acesso: chave },
      transaction,
    });

    if (byKey) {
      return byKey;
    }
  }

  return Nf.findOne({
    where: {
      ...baseWhere,
      ambiente: values.ambiente,
      modelo: values.modelo,
      serie: values.serie,
      numero: values.numero,
    },
    transaction,
  });
}

async function processDesktopFiscalDocument(pdv, rawDocument) {
  const document = asObject(rawDocument);
  const rawResult = asObject(document.raw_result || document.rawResult);
  const data = asObject(rawResult.data);
  const payload = asObject(rawResult.payload || document.payload);
  const documentId = normalizeText(document.id || data.documentId, 64);
  const ambiente = normalizeFiscalAmbiente(document.ambiente || data.ambiente || payload.ambiente);
  const modelo = normalizeFiscalModelo(document.modelo || data.modelo || payload.modelo);
  const serie = normalizeFiscalInteger(document.serie ?? data.serie ?? payload.serie, null, { min: 1, max: 999 });
  const numero = normalizeFiscalInteger(document.numero ?? data.numero ?? payload.numero, null);

  if (!documentId || !serie || !numero) {
    return {
      id: documentId || null,
      status: 'erro',
      message: 'Documento fiscal local incompleto.',
    };
  }

  const status = normalizeFiscalStatus(document, rawResult, data);
  const vendaId = normalizeText(document.venda_id || document.vendaId || payload.vendaId || payload.venda_id, 64) || null;
  const caixaCandidateId = normalizeText(document.caixa_id || document.caixaId || payload.caixaId || payload.caixa_id || asObject(payload.session).id, 64) || null;
  const codigoRetorno = getFiscalCode(document.codigo_retorno_sefaz || rawResult.codigoRetornoSefaz || data.cStat || data.codigoRetornoSefaz);
  const mensagemRetorno = normalizeText(document.mensagem_sefaz || rawResult.mensagemSefaz || data.xMotivo || rawResult.friendlyMessage, 1000) || null;
  const retornoSefaz = buildFiscalReturnPayload(document, rawResult, data);
  const xmlPayload = buildFiscalXmlPayload(document, rawResult, data);
  const now = new Date();
  const emittedAt = getFiscalDate(document.created_at || document.createdAt || payload.createdAt) || now;
  const authorizedAt = status === 'autorizada'
    ? getFiscalDate(data.autorizadaEm || data.autorizada_em || document.updated_at || document.updatedAt) || now
    : null;
  const transaction = await sequelize.transaction();
  const createdXmlFilePaths = [];
  const terminalEventXmlType = getTerminalFiscalEventXmlType(status);

  try {
    let caixaId = null;
    let resolvedVendaId = vendaId;
    let missingVendaId = null;

    if (vendaId) {
      const venda = await Venda.findOne({
        where: {
          id: vendaId,
          usuario_id: pdv.usuario_id,
        },
        transaction,
      });

      if (!venda) {
        resolvedVendaId = null;
        missingVendaId = vendaId;
      }
    }

    if (caixaCandidateId) {
      const caixa = await Caixa.findOne({
        where: {
          id: caixaCandidateId,
          usuario_id: pdv.usuario_id,
        },
        transaction,
      });

      caixaId = caixa?.id || null;
    }

    const values = {
      id: documentId,
      usuario_id: pdv.usuario_id,
      venda_id: resolvedVendaId,
      pdv_id: pdv.id,
      caixa_id: caixaId,
      ambiente,
      modelo,
      serie,
      numero,
      chave_acesso: normalizeText(document.chave || data.chave, 44) || null,
      status,
      tipo_emissao: resolveFiscalTipoEmissao(document, rawResult, data, status),
      finalidade: 'normal',
      natureza_operacao: normalizeText(document.natureza_operacao || payload.naturezaOperacao || payload.natureza_operacao, 120) || 'Venda',
      total_centavos: resolveFiscalTotalCentavos(document, rawResult),
      protocolo_autorizacao: normalizeText(document.protocolo || data.protocolo || data.nProt, 80) || null,
      codigo_retorno_sefaz: codigoRetorno,
      mensagem_retorno_sefaz: mensagemRetorno,
      ultimo_erro_tecnico: document.mensagem_tecnica || rawResult.technicalMessage || null,
      payload: {
        origem: 'pdv',
        pdv: {
          id: pdv.id,
          dispositivo_id: pdv.dispositivo_id,
        },
        documento: {
          id: documentId,
          command: normalizeText(document.command, 64) || null,
          venda_id: resolvedVendaId,
          venda_id_original: missingVendaId || vendaId,
          venda_nao_encontrada: Boolean(missingVendaId),
          caixa_id: caixaId,
          log_path: document.log_path || null,
        },
        venda: payload.sale || payload.venda || null,
        itens: Array.isArray(payload.itens) ? payload.itens : [],
      },
      retorno_sefaz: retornoSefaz,
      emitida_em: emittedAt,
      autorizada_em: authorizedAt,
      cancelada_em: status === 'cancelada' ? getFiscalDate(document.updated_at || document.updatedAt) || now : null,
    };
    const eventData = {
      tipo: normalizeText(document.command, 32) || 'sync_pdv',
      status,
      codigo_retorno_sefaz: codigoRetorno,
      mensagem: mensagemRetorno || values.ultimo_erro_tecnico || null,
      detalhes: {
        ...retornoSefaz,
        venda_id_original: missingVendaId || vendaId,
        venda_nao_encontrada: Boolean(missingVendaId),
      },
      ocorrido_em: now,
    };
    const existing = await findExistingFiscalDocument(pdv, values, transaction);
    let nf = existing;
    let xmlEnviadoArquivoId = existing?.xml_enviado_arquivo_id || null;
    let xmlAutorizadoArquivoId = existing?.xml_autorizado_arquivo_id || null;

    if (!xmlEnviadoArquivoId && xmlPayload.enviado) {
      const arquivo = await createFiscalXmlArquivo({
        usuarioId: pdv.usuario_id,
        values,
        tipoXml: 'enviado',
        xmlContent: xmlPayload.enviado,
        transaction,
        createdFilePaths: createdXmlFilePaths,
      });

      xmlEnviadoArquivoId = arquivo.id;
    }

    if (!xmlAutorizadoArquivoId && xmlPayload.autorizado && !terminalEventXmlType) {
      if (xmlPayload.autorizado === xmlPayload.enviado && xmlEnviadoArquivoId) {
        xmlAutorizadoArquivoId = xmlEnviadoArquivoId;
      } else {
        const arquivo = await createFiscalXmlArquivo({
          usuarioId: pdv.usuario_id,
          values,
          tipoXml: 'autorizado',
          xmlContent: xmlPayload.autorizado,
          transaction,
          createdFilePaths: createdXmlFilePaths,
        });

        xmlAutorizadoArquivoId = arquivo.id;
      }
    }

    if (terminalEventXmlType) {
      const existingEventWithXml = nf
        ? await NfEvento.findOne({
            where: {
              nf_id: nf.id,
              usuario_id: pdv.usuario_id,
              status,
              tipo: eventData.tipo,
              arquivo_xml_id: { [Op.not]: null },
            },
            order: [['ocorrido_em', 'DESC']],
            transaction,
          })
        : null;
      let eventXmlArquivoId = existingEventWithXml?.arquivo_xml_id || null;
      const terminalXmlContent = xmlPayload.autorizado || xmlPayload.enviado;

      if (!eventXmlArquivoId && terminalXmlContent) {
        const arquivo = await createFiscalXmlArquivo({
          usuarioId: pdv.usuario_id,
          values,
          tipoXml: terminalEventXmlType,
          xmlContent: terminalXmlContent,
          transaction,
          createdFilePaths: createdXmlFilePaths,
        });

        eventXmlArquivoId = arquivo.id;
      }

      eventData.arquivo_xml_id = eventXmlArquivoId;
    }

    values.xml_enviado_arquivo_id = xmlEnviadoArquivoId;
    values.xml_autorizado_arquivo_id = xmlAutorizadoArquivoId;

    if (nf) {
      Object.assign(nf, {
        ...values,
        id: nf.id,
      });
      await appendFiscalEvent(nf, eventData, transaction);
      await nf.save({ transaction });
    } else {
      nf = await Nf.create(
        {
          ...values,
          eventos: [buildFiscalEventSummary(eventData)],
        },
        { transaction }
      );
      await NfEvento.create(
        {
          nf_id: nf.id,
          usuario_id: nf.usuario_id,
          tipo: eventData.tipo,
          status: eventData.status,
          codigo_retorno_sefaz: eventData.codigo_retorno_sefaz,
          mensagem: eventData.mensagem,
          arquivo_xml_id: eventData.arquivo_xml_id || null,
          detalhes: eventData.detalhes,
          ocorrido_em: eventData.ocorrido_em,
        },
        { transaction }
      );
    }

    await transaction.commit();
    createdXmlFilePaths.length = 0;

    return {
      id: documentId,
      api_nf_id: nf.id,
      status: existing ? 'atualizado' : 'processado',
    };
  } catch (error) {
    await transaction.rollback();
    createdXmlFilePaths.forEach(removePhysicalFile);

    if (error.name === 'SequelizeUniqueConstraintError') {
      return {
        id: documentId,
        status: 'erro',
        message: 'NF já sincronizada com a mesma combinação fiscal.',
      };
    }

    return {
      id: documentId,
      status: 'erro',
      message: error.message || 'Erro ao sincronizar documento fiscal.',
    };
  }
}

async function findUserPdv(usuarioId, pdvId) {
  const id = Number(pdvId);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return Pdv.findOne({
    where: {
      id,
      usuario_id: usuarioId,
    },
  });
}

function handlePdvError(res, error, defaultMessage) {
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'Já existe um PDV com esses dados nesta conta.',
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: error.errors?.[0]?.message || 'Dados inválidos para o PDV.',
    });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

module.exports = {
  getUserPdvsSnapshot,

  async list(req, res) {
    try {
      const pdvs = await listUserPdvs(req.user.id);

      return res.json(await sanitizePdvList(pdvs));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar PDVs.', detail: error.message });
    }
  },

  async create(req, res) {
    try {
      const nome = normalizeText(req.body?.nome, 80);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe um nome para o PDV.' });
      }

      const pairing = createPairingCode();

      const pdv = await Pdv.create({
        usuario_id: req.user.id,
        nome,
        status: 'pendente',
        codigo_pareamento_hash: pairing.hash,
        codigo_pareamento_expira_em: pairing.expiraEm,
        codigo_pareamento_usado_em: null,
      });
      const identificacao = await getVirtualIdentificacao(req.user.id, pdv.id);

      return res.status(201).json(
        sanitizePdv(pdv, {
          identificacao,
          codigo_pareamento: pairing.codigo,
          codigo_pareamento_expira_em: pairing.expiraEm,
        })
      );
    } catch (error) {
      return handlePdvError(res, error, 'Erro ao criar PDV.');
    }
  },

  async update(req, res) {
    try {
      const pdv = await findUserPdv(req.user.id, req.params.id);

      if (!pdv) {
        return res.status(404).json({ message: 'PDV não encontrado.' });
      }

      const nome = normalizeText(req.body?.nome, 80);

      if (Object.prototype.hasOwnProperty.call(req.body, 'nome')) {
        if (nome.length < 2) {
          return res.status(400).json({ message: 'Informe um nome para o PDV.' });
        }
        pdv.nome = nome;
      }

      await pdv.save();
      const identificacao = await getVirtualIdentificacao(req.user.id, pdv.id);
      const registrosVinculados = await getPdvRegistrosVinculados(req.user.id, pdv.id);

      return res.json(sanitizePdv(pdv, { identificacao, registros_vinculados: registrosVinculados }));
    } catch (error) {
      return handlePdvError(res, error, 'Erro ao atualizar PDV.');
    }
  },

  async remove(req, res) {
    try {
      const pdv = await findUserPdv(req.user.id, req.params.id);

      if (!pdv) {
        return res.status(404).json({ message: 'PDV não encontrado.' });
      }

      const registrosVinculados = await getPdvRegistrosVinculados(req.user.id, pdv.id);

      if (registrosVinculados > 0) {
        await pdv.update({
          ativo: false,
          status: 'inativo',
          codigo_pareamento_hash: null,
          codigo_pareamento_expira_em: null,
          codigo_pareamento_usado_em: null,
          credencial_hash: null,
        });
        const identificacao = await getVirtualIdentificacao(req.user.id, pdv.id);

        return res.json({
          action: 'deactivated',
          pdv: sanitizePdv(pdv, { identificacao, registros_vinculados: registrosVinculados }),
          message: 'PDV desativado para preservar os registros vinculados.',
        });
      }

      await pdv.destroy();

      return res.json({
        action: 'deleted',
        id: pdv.id,
        message: 'PDV excluído.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao excluir PDV.', detail: error.message });
    }
  },

  async activate(req, res) {
    try {
      const pdv = await findUserPdv(req.user.id, req.params.id);

      if (!pdv) {
        return res.status(404).json({ message: 'PDV não encontrado.' });
      }

      if (!pdv.ativo) {
        await pdv.update({
          ativo: true,
          status: 'pendente',
        });
      }

      const identificacao = await getVirtualIdentificacao(req.user.id, pdv.id);
      const registrosVinculados = await getPdvRegistrosVinculados(req.user.id, pdv.id);

      return res.json({
        action: 'activated',
        pdv: sanitizePdv(pdv, { identificacao, registros_vinculados: registrosVinculados }),
        message: 'PDV ativado.',
      });
    } catch (error) {
      return handlePdvError(res, error, 'Erro ao ativar PDV.');
    }
  },

  async createPairingCode(req, res) {
    try {
      const pdv = await findUserPdv(req.user.id, req.params.id);

      if (!pdv) {
        return res.status(404).json({ message: 'PDV não encontrado.' });
      }

      if (!pdv.ativo) {
        return res.status(409).json({ message: 'Ative o PDV antes de gerar um código de pareamento.' });
      }

      const pairing = createPairingCode();

      pdv.codigo_pareamento_hash = pairing.hash;
      pdv.codigo_pareamento_expira_em = pairing.expiraEm;
      pdv.codigo_pareamento_usado_em = null;

      if (!pdv.pareado_em) {
        pdv.status = 'pendente';
      }

      await pdv.save();
      const identificacao = await getVirtualIdentificacao(req.user.id, pdv.id);

      return res.json(
        sanitizePdv(pdv, {
          identificacao,
          codigo_pareamento: pairing.codigo,
          codigo_pareamento_expira_em: pairing.expiraEm,
        })
      );
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao gerar código de pareamento.', detail: error.message });
    }
  },

  async pairDesktop(req, res) {
    try {
      const codigo = normalizeCodigo(req.body?.codigo || req.body?.codigo_pareamento);

      if (!codigo) {
        return res.status(400).json({ message: 'Informe o código de pareamento.' });
      }

      const pdv = await Pdv.unscoped().findOne({
        where: {
          ativo: true,
          codigo_pareamento_hash: hashValue(codigo),
          codigo_pareamento_usado_em: null,
          codigo_pareamento_expira_em: {
            [Op.gt]: new Date(),
          },
        },
      });

      if (!pdv) {
        return res.status(400).json({ message: 'Código de pareamento inválido ou expirado.' });
      }

      const credencial = createDeviceCredential();
      const now = new Date();

      pdv.dispositivo_id = normalizeText(req.body?.dispositivo_id, 120) || randomUUID();
      pdv.credencial_hash = hashValue(credencial);
      pdv.status = 'online';
      pdv.pareado_em = pdv.pareado_em || now;
      pdv.ultimo_acesso_em = now;
      pdv.ultima_sincronizacao_em = now;
      pdv.codigo_pareamento_hash = null;
      pdv.codigo_pareamento_expira_em = null;
      pdv.codigo_pareamento_usado_em = now;
      await pdv.save();
      await Usuario.update(
        { onboarding_concluido_em: now },
        {
          where: {
            id: pdv.usuario_id,
            onboarding_concluido_em: null,
          },
        }
      );
      const identificacao = await getVirtualIdentificacao(pdv.usuario_id, pdv.id);
      const [configuracoes, funcionarioSnapshot] = await Promise.all([
        configuracaoSistemaService.getConfiguracaoSnapshot(pdv.usuario_id),
        loadDesktopFuncionariosSnapshot(pdv.usuario_id),
      ]);

      return res.json({
        pdv: sanitizePdv(pdv, { identificacao }),
        credencial_dispositivo: credencial,
        configuracoes,
        ...funcionarioSnapshot,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao parear PDV.', detail: error.message });
    }
  },

  async showDesktopSession(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const now = new Date();
      pdv.status = 'online';
      pdv.ultimo_acesso_em = now;
      await pdv.save();

      const identificacao = await getVirtualIdentificacao(pdv.usuario_id, pdv.id);
      const [configuracoes, funcionarioSnapshot] = await Promise.all([
        configuracaoSistemaService.getConfiguracaoSnapshot(pdv.usuario_id),
        loadDesktopFuncionariosSnapshot(pdv.usuario_id),
      ]);

      return res.json({
        autenticado: true,
        pdv: sanitizePdv(pdv, { identificacao }),
        configuracoes,
        ...funcionarioSnapshot,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao validar sessão do PDV.', detail: error.message });
    }
  },

  async showDesktopShiftPreview(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const operationDate = getSaoPauloOperationDateParts(parseDate(req.body?.aberto_em || req.body?.data_operacao));
      const nextShiftNumber = await getNextCashierShiftNumber({
        usuarioId: pdv.usuario_id,
        pdvId: pdv.id,
        operationDateKey: operationDate.chave,
      });
      const now = new Date();

      pdv.status = 'online';
      pdv.ultimo_acesso_em = now;
      await pdv.save();

      return res.json({
        data_operacao_chave: operationDate.chave,
        data_operacao_rotulo: operationDate.rotulo,
        ultimo_turno: nextShiftNumber - 1,
        proximo_turno: nextShiftNumber,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao buscar próximo turno do PDV.', detail: error.message });
    }
  },

  async showDesktopCatalog(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const now = new Date();
      pdv.status = 'online';
      pdv.ultimo_acesso_em = now;
      pdv.ultima_sincronizacao_em = now;
      await pdv.save();

      const [snapshot, configuracoes, convenioSnapshot, funcionarioSnapshot] = await Promise.all([
        produtoController.loadSnapshot(pdv.usuario_id, { onlyActive: true }),
        configuracaoSistemaService.getConfiguracaoSnapshot(pdv.usuario_id),
        loadDesktopConvenioSnapshot(pdv.usuario_id),
        loadDesktopFuncionariosSnapshot(pdv.usuario_id),
      ]);

      return res.json({
        ...snapshot,
        configuracoes,
        ...convenioSnapshot,
        ...funcionarioSnapshot,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao carregar catálogo do PDV.', detail: error.message });
    }
  },

  async downloadDesktopFiscalCertificate(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const arquivoId = Number(req.body?.arquivo_id || req.body?.arquivoId);

      if (!Number.isInteger(arquivoId) || arquivoId <= 0) {
        return res.status(400).json({ message: 'Informe o certificado fiscal.' });
      }

      const arquivo = await Arquivo.findOne({
        where: {
          id: arquivoId,
          usuario_id: pdv.usuario_id,
          tipo: 'certificado',
        },
      });

      if (!arquivo) {
        return res.status(404).json({ message: 'Certificado fiscal não encontrado.' });
      }

      const absolutePath = toAbsolutePath(arquivo.caminho_relativo);

      if (!absolutePath || !fs.existsSync(absolutePath)) {
        return res.status(404).json({ message: 'Arquivo do certificado fiscal não encontrado.' });
      }

      return res.json({
        id: arquivo.id,
        nome_original: arquivo.nome_original,
        extensao: path.extname(arquivo.nome_original || arquivo.nome_armazenado || '').replace('.', '').toLowerCase() || 'pfx',
        tamanho_bytes: Number(arquivo.tamanho_bytes || 0),
        conteudo_base64: fs.readFileSync(absolutePath).toString('base64'),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao baixar certificado fiscal.', detail: error.message });
    }
  },

  async syncDesktopEvents(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const events = Array.isArray(req.body?.eventos)
        ? req.body.eventos
        : Array.isArray(req.body?.events)
          ? req.body.events
          : [];

      if (events.length === 0) {
        return res.status(400).json({ message: 'Nenhum evento offline informado.' });
      }

      const results = [];

      for (const event of events) {
        // Processamento sequencial preserva a ordem local: abrir caixa, vender, lançar despesa e fechar.
        results.push(await processDesktopSyncEvent(pdv, event));
      }

      const now = new Date();
      pdv.status = 'online';
      pdv.ultimo_acesso_em = now;
      pdv.ultima_sincronizacao_em = now;
      pdv.sincronizacao_pendente = results.some(result => result.status === 'erro');
      pdv.ultima_fila_offline_em = pdv.sincronizacao_pendente ? now : null;
      await pdv.save();

      return res.json({
        sincronizado_em: now.toISOString(),
        processados: results.filter(result => result.status === 'processado' || result.status === 'duplicado').length,
        erros: results.filter(result => result.status === 'erro').length,
        eventos: results,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao sincronizar eventos do PDV.', detail: error.message });
    }
  },

  async syncDesktopFiscalDocuments(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou desvinculado.' });
      }

      const documentos = Array.isArray(req.body?.documentos)
        ? req.body.documentos
        : Array.isArray(req.body?.documents)
          ? req.body.documents
          : [];

      if (documentos.length === 0) {
        return res.status(400).json({ message: 'Nenhum documento fiscal informado.' });
      }

      const results = [];

      for (const documento of documentos.slice(0, 100)) {
        results.push(await processDesktopFiscalDocument(pdv, documento));
      }

      const now = new Date();
      pdv.status = 'online';
      pdv.ultimo_acesso_em = now;
      pdv.ultima_sincronizacao_em = now;
      pdv.sincronizacao_pendente = results.some(result => result.status === 'erro');
      pdv.ultima_fila_offline_em = pdv.sincronizacao_pendente ? now : null;
      await pdv.save();

      return res.json({
        sincronizado_em: now.toISOString(),
        processados: results.filter(result => ['processado', 'atualizado', 'duplicado'].includes(result.status)).length,
        erros: results.filter(result => result.status === 'erro').length,
        documentos: results,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao sincronizar documentos fiscais do PDV.', detail: error.message });
    }
  },

  async unpairDesktop(req, res) {
    try {
      const pdv = await findPdvByDesktopCredentials(getDesktopCredentials(req));

      if (!pdv) {
        return res.status(401).json({ message: 'PDV não autenticado ou já desvinculado.' });
      }

      pdv.status = 'pendente';
      pdv.dispositivo_id = null;
      pdv.credencial_hash = null;
      pdv.pareado_em = null;
      pdv.sincronizacao_pendente = false;
      pdv.ultima_fila_offline_em = null;
      await pdv.save();

      const identificacao = await getVirtualIdentificacao(pdv.usuario_id, pdv.id);

      return res.json({
        message: 'PDV desvinculado. Gere um novo código para ativar este caixa novamente.',
        pdv: sanitizePdv(pdv, { identificacao }),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao desvincular PDV.', detail: error.message });
    }
  },
};
