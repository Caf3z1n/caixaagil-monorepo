const { createHash, randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { RecebimentoVenda } = require('../models');
const {
  isValidCents,
  MAX_INSTALLMENTS,
  normalizeReceiptPaymentMethod,
  sanitizeCents,
} = require('./installmentPlanService');

const RECEIPT_TYPES = new Set(['entrada', 'parcela', 'convenio']);
const RECEIPT_ALREADY_CONFIRMED_CODE = 'RECEIPT_ALREADY_CONFIRMED';
const RECEIPT_IDEMPOTENCY_CANCELED_CODE = 'RECEIPT_IDEMPOTENCY_CANCELED';
const RECEIPT_IDEMPOTENCY_MISMATCH_CODE = 'RECEIPT_IDEMPOTENCY_MISMATCH';
const RECEIPT_SYNC_OUTCOME_PAYLOAD_KEY = '__caixa_agil_sync_outcome';

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeReceiptType(value) {
  const normalized = normalizeText(value, 24).toLowerCase();
  return RECEIPT_TYPES.has(normalized) ? normalized : null;
}

function normalizeReceiptIdempotencyKey(value) {
  const normalized = normalizeText(value, 1000);

  if (!normalized) {
    return `recebimento-${randomUUID()}`;
  }

  if (normalized.length <= 220) {
    return normalized;
  }

  const digest = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  return `${normalized.slice(0, 195)}-${digest}`;
}

function buildReceiptIdempotencyKey(baseKey, type, saleId, installmentNumber = null) {
  const normalizedType = normalizeReceiptType(type) || 'recebimento';
  const installmentSuffix = installmentNumber ? `:${Math.floor(Number(installmentNumber))}` : '';
  const source = normalizeText(baseKey, 1000) || `operacao-${randomUUID()}`;

  return normalizeReceiptIdempotencyKey(`${source}:${normalizedType}:${saleId}${installmentSuffix}`);
}

function parseReceiptDate(value) {
  const date = new Date(value || new Date());

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function getPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function toIsoOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeReceiptLedgerEntry(record) {
  const data = getPlain(record) || {};
  const createdAt = toIsoOrNull(data.created_at ?? data.createdAt);
  const updatedAt = toIsoOrNull(data.updated_at ?? data.updatedAt) || createdAt;
  const receivedAt = toIsoOrNull(data.recebido_em);
  const canceledAt = toIsoOrNull(data.cancelado_em);

  return {
    id: data.id,
    chave_idempotencia: data.chave_idempotencia,
    venda_id: data.venda_id,
    caixa_id: data.caixa_id || null,
    pdv_id: data.pdv_id || null,
    tipo: data.tipo,
    parcela_numero: data.parcela_numero || null,
    parcelas_total: data.parcelas_total || null,
    cliente_nome: data.cliente_nome || 'Cliente não informado',
    valor_centavos: sanitizeCents(data.valor_centavos),
    metodo_pagamento: normalizeReceiptPaymentMethod(data.metodo_pagamento),
    recebido_em: receivedAt,
    status: data.status === 'cancelado' ? 'cancelado' : 'confirmado',
    cancelado_em: canceledAt,
    motivo_cancelamento: data.motivo_cancelamento || null,
    origem: data.origem || 'pdv',
    created_at: createdAt,
    updated_at: updatedAt,
    revisao_em: updatedAt || createdAt || canceledAt || receivedAt,
  };
}

function buildReceiptWhere({ usuarioId, saleId, type, installmentNumber, status }) {
  const where = {
    usuario_id: usuarioId,
    venda_id: saleId,
  };

  if (type) {
    where.tipo = type;
  }

  if (installmentNumber !== undefined) {
    where.parcela_numero = installmentNumber || null;
  }

  if (status) {
    where.status = status;
  }

  return where;
}

function normalizeInstallmentNumbers(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(value => Math.floor(Number(value)))
      .filter(value => Number.isInteger(value) && value > 0 && value <= MAX_INSTALLMENTS)
  )].sort((left, right) => left - right);
}

function getInstallmentReceiptConflict(entries, requestedNumbers) {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  const requested = [...new Set(
    (Array.isArray(requestedNumbers) ? requestedNumbers : [])
      .map(value => Math.floor(Number(value)))
      .filter(value => Number.isInteger(value) && value > 0)
  )].sort((left, right) => left - right);
  const entryByNumber = new Map(
    normalizedEntries.map(entry => [Math.floor(Number(entry?.number)), entry])
  );
  const missingNumbers = requested.filter(number => !entryByNumber.has(number));

  if (missingNumbers.length > 0) {
    throw new Error('Parcela não encontrada no parcelamento persistido.');
  }

  const confirmedNumbers = requested.filter(number => {
    const entry = entryByNumber.get(number);
    return Boolean(entry?.paid || entry?.paidAt);
  });

  if (confirmedNumbers.length === 0) {
    return null;
  }

  return {
    requestedNumbers: requested,
    confirmedNumbers,
  };
}

function buildReceiptConflictSyncOutcome({
  type,
  saleId,
  rejectedInstallmentNumbers = [],
  confirmedInstallmentNumbers = [],
  canonicalReceipts = [],
  canonicalInstallmentSale = null,
  canonicalAgreementReceipt = null,
}) {
  const normalizedType = normalizeReceiptType(type);
  const normalizedSaleId = normalizeText(saleId, 64);

  if (!['parcela', 'convenio'].includes(normalizedType) || !normalizedSaleId) {
    throw new Error('Conflito de recebimento sem operação financeira válida.');
  }

  return {
    code: RECEIPT_ALREADY_CONFIRMED_CODE,
    message: normalizedType === 'parcela'
      ? 'Uma ou mais parcelas já foram recebidas em outro PDV. Nenhuma parcela desta tentativa foi aplicada.'
      : 'Este débito de convênio já foi recebido em outro PDV. Esta tentativa não foi aplicada.',
    conciliacao_recebimento: {
      tipo: normalizedType,
      venda_id: normalizedSaleId,
      parcelas_rejeitadas: normalizeInstallmentNumbers(rejectedInstallmentNumbers),
      parcelas_confirmadas: normalizeInstallmentNumbers(confirmedInstallmentNumbers),
      recebimentos: Array.isArray(canonicalReceipts) ? canonicalReceipts : [],
      venda_parcelada: canonicalInstallmentSale || null,
      recebimento_convenio: canonicalAgreementReceipt || null,
    },
  };
}

function storeSyncOutcomeInEventPayload(payload, outcome = null) {
  const storedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload }
    : {};

  delete storedPayload[RECEIPT_SYNC_OUTCOME_PAYLOAD_KEY];

  if (outcome?.code === RECEIPT_ALREADY_CONFIRMED_CODE) {
    storedPayload[RECEIPT_SYNC_OUTCOME_PAYLOAD_KEY] = outcome;
  }

  return storedPayload;
}

function getSyncOutcomeFromEventPayload(payload) {
  const outcome = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload[RECEIPT_SYNC_OUTCOME_PAYLOAD_KEY]
    : null;

  if (
    !outcome ||
    outcome.code !== RECEIPT_ALREADY_CONFIRMED_CODE ||
    !outcome.conciliacao_recebimento ||
    !['parcela', 'convenio'].includes(outcome.conciliacao_recebimento.tipo) ||
    !normalizeText(outcome.conciliacao_recebimento.venda_id, 64)
  ) {
    return null;
  }

  return outcome;
}

async function findActiveReceipt(options) {
  return RecebimentoVenda.findOne({
    where: buildReceiptWhere({ ...options, status: 'confirmado' }),
    transaction: options.transaction,
    ...(options.transaction ? { lock: options.transaction.LOCK.UPDATE } : {}),
  });
}

async function lockReceiptOperation({ usuarioId, saleId, type, installmentNumber }, transaction) {
  if (!transaction) {
    throw new Error('O recebimento precisa ser registrado dentro de uma transação.');
  }

  const operationKey = [
    usuarioId,
    normalizeText(saleId, 64),
    normalizeReceiptType(type),
    installmentNumber || 0,
  ].join(':');

  await RecebimentoVenda.sequelize.query(
    'SELECT pg_advisory_xact_lock(hashtextextended(:operationKey, 0))',
    {
      replacements: { operationKey },
      transaction,
    }
  );
}

function normalizeComparableId(value) {
  return value === null || value === undefined || value === '' ? null : String(value);
}

function buildReceiptOperation(values, normalizedValues) {
  return {
    usuario_id: normalizeComparableId(values.usuarioId),
    pdv_id: normalizeComparableId(values.pdvId),
    caixa_id: normalizeComparableId(values.cashierId),
    venda_id: normalizeComparableId(values.saleId),
    tipo: normalizedValues.type,
    parcela_numero: normalizedValues.installmentNumber,
    parcelas_total: normalizedValues.type === 'parcela' &&
      Number.isSafeInteger(Number(values.installmentCount)) &&
      Number(values.installmentCount) >= normalizedValues.installmentNumber &&
      Number(values.installmentCount) <= MAX_INSTALLMENTS
        ? Number(values.installmentCount)
        : normalizedValues.installmentNumber,
    valor_centavos: normalizedValues.amountCents,
    metodo_pagamento: normalizedValues.paymentMethod,
    origem: normalizeText(values.origin, 24) || 'pdv',
  };
}

function assertReceiptMatchesOperation(record, operation, source) {
  const data = getPlain(record) || {};
  const comparableFields = [
    'usuario_id',
    'pdv_id',
    'caixa_id',
    'venda_id',
    'tipo',
    'parcela_numero',
    'parcelas_total',
    'valor_centavos',
    'metodo_pagamento',
    'origem',
  ];
  const mismatchedFields = comparableFields.filter(field => {
    const storedValue = ['usuario_id', 'pdv_id', 'caixa_id', 'venda_id'].includes(field)
      ? normalizeComparableId(data[field])
      : data[field] ?? null;
    const requestedValue = operation[field] ?? null;

    return storedValue !== requestedValue;
  });

  if (mismatchedFields.length > 0) {
    const error = new Error(
      `${source} já pertence a outro recebimento e não pode ser reutilizada.`
    );
    error.code = RECEIPT_IDEMPOTENCY_MISMATCH_CODE;
    throw error;
  }

  if (data.status !== 'confirmado') {
    const error = new Error(
      'Este recebimento foi cancelado. Registre uma nova baixa com uma nova chave de idempotência.'
    );
    error.code = RECEIPT_IDEMPOTENCY_CANCELED_CODE;
    throw error;
  }

  return record;
}

async function registerReceipt(values, transaction) {
  const type = normalizeReceiptType(values.type);
  const paymentMethod = normalizeReceiptPaymentMethod(values.paymentMethod);
  const amountCents = sanitizeCents(values.amountCents);
  const rawInstallmentNumber = Number(values.installmentNumber);
  const installmentNumber = type === 'parcela' && Number.isSafeInteger(rawInstallmentNumber)
    ? rawInstallmentNumber
    : null;

  if (!type) {
    throw new Error('Tipo de recebimento inválido.');
  }

  if (!values.usuarioId || !values.saleId) {
    throw new Error('Recebimento sem vínculo com usuário ou venda.');
  }

  if (!isValidCents(values.amountCents) || amountCents <= 0) {
    throw new Error('O valor do recebimento deve ser positivo e usar centavos inteiros válidos.');
  }

  if (!paymentMethod) {
    throw new Error('Informe uma forma de pagamento válida para o recebimento.');
  }

  if (
    type === 'parcela' &&
    (!installmentNumber || installmentNumber < 1 || installmentNumber > MAX_INSTALLMENTS)
  ) {
    throw new Error('Número da parcela inválido para o recebimento.');
  }

  await lockReceiptOperation({
    usuarioId: values.usuarioId,
    saleId: values.saleId,
    type,
    installmentNumber,
  }, transaction);

  const idempotencyKey = normalizeReceiptIdempotencyKey(values.idempotencyKey);
  const operation = buildReceiptOperation(values, {
    type,
    paymentMethod,
    amountCents,
    installmentNumber,
  });
  const existingByKey = await RecebimentoVenda.findOne({
    where: { chave_idempotencia: idempotencyKey },
    transaction,
  });

  if (existingByKey) {
    return assertReceiptMatchesOperation(existingByKey, operation, 'A chave de idempotência');
  }

  const activeReceipt = await findActiveReceipt({
    usuarioId: values.usuarioId,
    saleId: values.saleId,
    type,
    installmentNumber,
    transaction,
  });

  if (activeReceipt) {
    return assertReceiptMatchesOperation(activeReceipt, operation, 'A baixa ativa');
  }

  return RecebimentoVenda.create(
    {
      id: `recebimento-${randomUUID()}`,
      usuario_id: values.usuarioId,
      pdv_id: values.pdvId || null,
      caixa_id: values.cashierId || null,
      venda_id: values.saleId,
      chave_idempotencia: idempotencyKey,
      tipo: type,
      parcela_numero: installmentNumber,
      parcelas_total: operation.parcelas_total,
      cliente_nome: normalizeText(values.customerName, 120) || 'Cliente não informado',
      valor_centavos: amountCents,
      metodo_pagamento: paymentMethod,
      recebido_em: parseReceiptDate(values.receivedAt),
      status: 'confirmado',
      cancelado_em: null,
      motivo_cancelamento: null,
      origem: normalizeText(values.origin, 24) || 'pdv',
      metadados: values.metadata && typeof values.metadata === 'object' && !Array.isArray(values.metadata)
        ? values.metadata
        : {},
    },
    { transaction }
  );
}

async function cancelReceipts(values, transaction) {
  const where = buildReceiptWhere({
    usuarioId: values.usuarioId,
    saleId: values.saleId,
    type: normalizeReceiptType(values.type),
    installmentNumber: values.installmentNumber,
    status: 'confirmado',
  });
  const now = parseReceiptDate(values.canceledAt);
  const [updatedCount] = await RecebimentoVenda.update(
    {
      status: 'cancelado',
      cancelado_em: now,
      motivo_cancelamento: normalizeText(values.reason, 300) || 'Recebimento cancelado.',
    },
    {
      where,
      transaction,
    }
  );

  return updatedCount;
}

function summarizeConfirmedReceipts(records) {
  const totals = { dinheiro: 0, pix: 0, cartao: 0 };
  const counts = { dinheiro: 0, pix: 0, cartao: 0 };

  records.forEach(record => {
    const data = getPlain(record) || {};

    if (data.status === 'cancelado') {
      return;
    }

    const paymentMethod = normalizeReceiptPaymentMethod(data.metodo_pagamento);

    if (!paymentMethod) {
      return;
    }

    totals[paymentMethod] += sanitizeCents(data.valor_centavos);
    counts[paymentMethod] += 1;
  });

  return { totals, counts };
}

async function listReceiptLedger(options) {
  const where = {
    usuario_id: options.usuarioId,
    ...(options.cashierIds?.length ? { caixa_id: { [Op.in]: options.cashierIds } } : {}),
    ...(options.pdvIds?.length ? { pdv_id: { [Op.in]: options.pdvIds } } : {}),
    ...(options.saleIds?.length ? { venda_id: { [Op.in]: options.saleIds } } : {}),
    ...(options.status ? { status: options.status } : {}),
  };

  return RecebimentoVenda.findAll({
    where,
    order: [
      ['updated_at', 'ASC'],
      ['created_at', 'ASC'],
      ['id', 'ASC'],
    ],
    transaction: options.transaction,
  });
}

module.exports = {
  RECEIPT_ALREADY_CONFIRMED_CODE,
  RECEIPT_IDEMPOTENCY_CANCELED_CODE,
  RECEIPT_IDEMPOTENCY_MISMATCH_CODE,
  buildReceiptIdempotencyKey,
  buildReceiptConflictSyncOutcome,
  cancelReceipts,
  findActiveReceipt,
  getInstallmentReceiptConflict,
  getSyncOutcomeFromEventPayload,
  listReceiptLedger,
  lockReceiptOperation,
  normalizeReceiptIdempotencyKey,
  registerReceipt,
  sanitizeReceiptLedgerEntry,
  storeSyncOutcomeInEventPayload,
  summarizeConfirmedReceipts,
};
