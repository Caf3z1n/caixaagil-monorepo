const MAX_INSTALLMENTS = 12;
const POSTGRES_INTEGER_MAX = 2147483647;
const POSTGRES_INTEGER_MIN = -2147483648;
const RECEIPT_PAYMENT_METHODS = new Set(['dinheiro', 'pix', 'cartao']);
const normalizationIssues = new WeakMap();

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
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

function sanitizeCents(value) {
  const parsed = Number(value ?? 0);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > POSTGRES_INTEGER_MAX
  ) {
    return 0;
  }

  return parsed;
}

function sanitizeSignedCents(value) {
  const parsed = Number(value ?? 0);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < POSTGRES_INTEGER_MIN ||
    parsed > POSTGRES_INTEGER_MAX
  ) {
    return 0;
  }

  return parsed;
}

function isValidCents(value, { signed = false } = {}) {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^-?\d+$/.test(value.trim()))
  ) {
    return false;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    return false;
  }

  return signed
    ? parsed >= POSTGRES_INTEGER_MIN && parsed <= POSTGRES_INTEGER_MAX
    : parsed >= 0 && parsed <= POSTGRES_INTEGER_MAX;
}

function normalizePercent(value) {
  const parsed = Number(value ?? 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.round(parsed)));
}

function normalizeReceiptPaymentMethod(value) {
  const key = normalizeKey(value);

  if (key === 'dinheiro' || key === 'cash') {
    return 'dinheiro';
  }

  if (key === 'pix') {
    return 'pix';
  }

  if (
    key === 'cartao' ||
    key === 'card' ||
    key === 'credito' ||
    key === 'debito' ||
    key === 'cartao_credito' ||
    key === 'cartao_debito'
  ) {
    return 'cartao';
  }

  return null;
}

function normalizeStoredPaymentMethod(value) {
  const receiptMethod = normalizeReceiptPaymentMethod(value);

  if (receiptMethod) {
    return receiptMethod;
  }

  return normalizeText(normalizeKey(value), 20) || null;
}

function normalizeAdjustmentKind(value, adjustmentCents = 0) {
  const key = normalizeKey(value);

  if (['discount', 'desconto'].includes(key)) {
    return 'discount';
  }

  if (['interest', 'juros', 'acrescimo', 'acréscimo'].includes(key)) {
    return 'interest';
  }

  if (adjustmentCents < 0) {
    return 'discount';
  }

  if (adjustmentCents > 0) {
    return 'interest';
  }

  return 'none';
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseLocalDate(value) {
  const normalized = normalizeText(value, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }

  return { year, month, day, value: normalized };
}

function addMonthsKeepingDay(firstDueDate, monthOffset) {
  const anchor = parseLocalDate(firstDueDate);

  if (!anchor || !Number.isInteger(monthOffset) || monthOffset < 0) {
    return null;
  }

  const absoluteMonth = anchor.year * 12 + (anchor.month - 1) + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  const day = Math.min(anchor.day, daysInMonth(year, month));

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveSchemaVersion(value) {
  const explicit = Number(firstDefined(value.schemaVersion, value.schema_version, value.versao_esquema));
  const hasV2Field = [
    'firstDueDate',
    'first_due_date',
    'dataPrimeiraParcela',
    'data_primeira_parcela',
    'adjustmentKind',
    'tipoAjuste',
    'tipo_ajuste',
    'adjustmentAmountCents',
    'valorAjusteCentavos',
    'valor_ajuste_centavos',
    'downPaymentCents',
    'entryAmountCents',
    'entryCents',
    'entradaCentavos',
    'entrada_centavos',
    'downPayment',
    'financedBalanceCents',
    'financedTotalCents',
    'saldoParceladoCentavos',
    'saldo_parcelado_centavos',
  ].some(key => Object.prototype.hasOwnProperty.call(value, key));

  if (hasV2Field) {
    return Math.max(2, Number.isInteger(explicit) ? explicit : 2);
  }

  if (Number.isInteger(explicit) && explicit >= 1) {
    return explicit;
  }

  return 1;
}

function normalizeInstallmentEntry(entry, index) {
  const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  const paidAt = normalizeText(firstDefined(source.paidAt, source.pago_em, source.recebido_em), 40) || null;

  return {
    ...source,
    number: Math.max(1, Math.floor(Number(firstDefined(source.number, source.numero, index + 1)) || index + 1)),
    dueDate: normalizeText(firstDefined(source.dueDate, source.vencimento, source.data_vencimento), 10) || null,
    amountCents: sanitizeCents(firstDefined(source.amountCents, source.valorCentavos, source.valor_centavos)),
    paid: Boolean(source.paid || source.pago || paidAt),
    paidAt,
    paymentMethod: normalizeStoredPaymentMethod(
      firstDefined(source.paymentMethod, source.metodo_pagamento, source.forma_pagamento)
    ),
    receivedSessionId:
      normalizeText(firstDefined(source.receivedSessionId, source.caixa_recebimento_id, source.sessionId), 64) || null,
  };
}

function normalizeInstallmentPlan(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entriesSource = Array.isArray(value.entries)
    ? value.entries
    : Array.isArray(value.parcelasDetalhes)
      ? value.parcelasDetalhes
      : Array.isArray(value.parcelas_detalhes)
        ? value.parcelas_detalhes
        : [];
  const rawEntries = entriesSource.slice(0, MAX_INSTALLMENTS);
  const entries = rawEntries.map(normalizeInstallmentEntry);
  const rawInstallmentCount = Number(firstDefined(
    value.installmentCount,
    value.parcelas,
    value.quantidade_parcelas,
    entries.length || 2
  ));
  const installmentCount = Math.max(
    1,
    Math.min(MAX_INSTALLMENTS, Number.isFinite(rawInstallmentCount) ? Math.floor(rawInstallmentCount) : entries.length || 2)
  );
  const schemaVersion = resolveSchemaVersion(value);
  const rawSignedAdjustment = firstDefined(value.adjustmentCents, value.ajusteCentavos, value.ajuste_centavos);
  const rawAbsoluteAdjustment = firstDefined(
    value.adjustmentAmountCents,
    value.valorAjusteCentavos,
    value.valor_ajuste_centavos
  );
  const preliminaryKind = normalizeAdjustmentKind(
    firstDefined(value.adjustmentKind, value.tipoAjuste, value.tipo_ajuste),
    sanitizeSignedCents(rawSignedAdjustment)
  );
  const adjustmentCents = rawSignedAdjustment !== undefined
    ? sanitizeSignedCents(rawSignedAdjustment)
    : preliminaryKind === 'discount'
      ? -sanitizeCents(rawAbsoluteAdjustment)
      : preliminaryKind === 'interest'
        ? sanitizeCents(rawAbsoluteAdjustment)
        : 0;
  const adjustmentKind = normalizeAdjustmentKind(
    firstDefined(value.adjustmentKind, value.tipoAjuste, value.tipo_ajuste),
    adjustmentCents
  );
  const originalTotalCents = sanitizeCents(firstDefined(
    value.originalTotalCents,
    value.valorOriginalCentavos,
    value.valor_original_centavos,
    value.subtotalCents,
    value.subtotal_centavos
  ));
  const rawAdjustedTotal = firstDefined(
    value.adjustedTotalCents,
    value.valorFinalCentavos,
    value.valor_final_centavos,
    value.finalTotalCents
  );
  const adjustedTotalCents = rawAdjustedTotal === undefined
    ? Math.max(0, originalTotalCents + adjustmentCents)
    : sanitizeCents(rawAdjustedTotal);
  const downPaymentCents = sanitizeSignedCents(firstDefined(
    value.downPaymentCents,
    value.entryAmountCents,
    value.entryCents,
    value.entradaCentavos,
    value.entrada_centavos,
    value.downPayment?.amountCents
  ));
  const downPaymentMethod = downPaymentCents > 0
    ? normalizeReceiptPaymentMethod(firstDefined(
        value.downPaymentMethod,
        value.entryPaymentMethod,
        value.formaPagamentoEntrada,
        value.forma_pagamento_entrada,
        value.downPayment?.paymentMethod
      ))
    : null;
  const downPaymentPaidAt = normalizeText(firstDefined(
    value.downPaymentPaidAt,
    value.entryPaidAt,
    value.entradaPagaEm,
    value.entrada_paga_em,
    value.downPayment?.paidAt
  ), 64) || null;
  const downPaymentSessionId = normalizeText(firstDefined(
    value.downPaymentSessionId,
    value.entrySessionId,
    value.caixaEntradaId,
    value.caixa_entrada_id,
    value.downPayment?.sessionId
  ), 180) || null;
  const rawFinancedBalance = firstDefined(
    value.financedBalanceCents,
    value.financedTotalCents,
    value.saldoParceladoCentavos,
    value.saldo_parcelado_centavos
  );
  const financedBalanceCents = rawFinancedBalance === undefined
    ? Math.max(0, adjustedTotalCents - downPaymentCents)
    : sanitizeCents(rawFinancedBalance);
  const firstDueDate = normalizeText(
    firstDefined(value.firstDueDate, value.first_due_date, value.dataPrimeiraParcela, value.data_primeira_parcela, entries[0]?.dueDate),
    10
  ) || null;

  const commonPlan = {
    ...value,
    schemaVersion,
    installmentCount,
    adjustmentPercent: normalizePercent(firstDefined(value.adjustmentPercent, value.percentual_ajuste)),
    originalTotalCents,
    adjustmentCents,
    adjustedTotalCents,
    customerName:
      normalizeText(firstDefined(value.customerName, value.nomeCliente, value.nome_cliente), 120) || null,
    observation: normalizeText(firstDefined(value.observation, value.observacao), 1000) || null,
    entries,
  };
  const normalizedPlan = schemaVersion < 2
    ? commonPlan
    : {
        ...commonPlan,
        firstDueDate,
        adjustmentKind,
        downPaymentCents,
        downPaymentMethod,
        downPaymentPaidAt,
        downPaymentSessionId,
        financedBalanceCents,
      };
  const issues = [];
  const monetaryInputs = [
    ['subtotal', firstDefined(
      value.originalTotalCents,
      value.valorOriginalCentavos,
      value.valor_original_centavos,
      value.subtotalCents,
      value.subtotal_centavos
    ), false],
    ['ajuste monetário', rawSignedAdjustment ?? rawAbsoluteAdjustment ?? 0, rawSignedAdjustment !== undefined],
    ['total ajustado', rawAdjustedTotal ?? adjustedTotalCents, false],
    ['entrada', firstDefined(
      value.downPaymentCents,
      value.entryAmountCents,
      value.entryCents,
      value.entradaCentavos,
      value.entrada_centavos,
      value.downPayment?.amountCents,
      0
    ), true],
    ['saldo parcelado', rawFinancedBalance ?? financedBalanceCents, false],
  ];

  monetaryInputs.forEach(([label, input, signed]) => {
    if (!isValidCents(input, { signed })) {
      issues.push(`O valor de ${label} deve ser informado em centavos inteiros válidos.`);
    }
  });
  rawEntries.forEach((entry, index) => {
    const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
    const amount = firstDefined(source.amountCents, source.valorCentavos, source.valor_centavos);

    if (!isValidCents(amount)) {
      issues.push(`O valor da parcela ${index + 1} deve ser informado em centavos inteiros válidos.`);
    }
  });

  if (issues.length > 0) {
    normalizationIssues.set(normalizedPlan, issues);
  }

  return normalizedPlan;
}

function validateInstallmentPlan(plan, options = {}) {
  const errors = [...(normalizationIssues.get(plan) || [])];

  if (!plan) {
    return ['Parcelamento ausente.'];
  }

  if (plan.schemaVersion < 2) {
    return errors;
  }

  const monetaryFields = [
    ['subtotal', plan.originalTotalCents, false],
    ['ajuste monetário', plan.adjustmentCents, true],
    ['total ajustado', plan.adjustedTotalCents, false],
    ['entrada', plan.downPaymentCents, true],
    ['saldo parcelado', plan.financedBalanceCents, false],
  ];

  monetaryFields.forEach(([label, amount, signed]) => {
    if (!isValidCents(amount, { signed })) {
      errors.push(`O valor de ${label} deve ser informado em centavos inteiros válidos.`);
    }
  });

  if (!Number.isInteger(plan.installmentCount) || plan.installmentCount < 1 || plan.installmentCount > MAX_INSTALLMENTS) {
    errors.push(`A quantidade de parcelas deve estar entre 1 e ${MAX_INSTALLMENTS}.`);
  }

  if (plan.entries.length !== plan.installmentCount) {
    errors.push('A quantidade de parcelas não corresponde aos lançamentos gerados.');
  }

  if (plan.originalTotalCents <= 0) {
    errors.push('O subtotal da venda parcelada deve ser positivo.');
  }

  if (plan.adjustmentKind === 'discount' && plan.adjustmentCents > 0) {
    errors.push('O desconto deve ser armazenado como ajuste negativo.');
  }

  if (plan.adjustmentKind === 'interest' && plan.adjustmentCents < 0) {
    errors.push('O acréscimo deve ser armazenado como ajuste positivo.');
  }

  if (plan.adjustmentKind === 'none' && plan.adjustmentCents !== 0) {
    errors.push('O tipo de ajuste não corresponde ao valor informado.');
  }

  if (plan.adjustedTotalCents !== plan.originalTotalCents + plan.adjustmentCents) {
    errors.push('O total ajustado não corresponde ao subtotal mais o ajuste monetário.');
  }

  if (plan.adjustedTotalCents <= 0) {
    errors.push('O desconto não pode zerar ou tornar negativo o total da venda parcelada.');
  }

  if (plan.downPaymentCents < 0 || plan.downPaymentCents >= plan.adjustedTotalCents) {
    errors.push('A entrada deve ser menor que o total ajustado da venda.');
  }

  if (plan.downPaymentCents > 0 && !RECEIPT_PAYMENT_METHODS.has(plan.downPaymentMethod)) {
    errors.push('Informe uma forma de pagamento válida para a entrada.');
  }

  if (plan.financedBalanceCents !== plan.adjustedTotalCents - plan.downPaymentCents) {
    errors.push('O saldo parcelado não corresponde ao total ajustado menos a entrada.');
  }

  if (!parseLocalDate(plan.firstDueDate)) {
    errors.push('A data da primeira parcela é inválida.');
  }

  const seenNumbers = new Set();
  let entriesTotalCents = 0;

  plan.entries.forEach((entry, index) => {
    const expectedNumber = index + 1;

    if (entry.number !== expectedNumber || seenNumbers.has(entry.number)) {
      errors.push('As parcelas devem ser numeradas uma única vez e em sequência.');
    }
    seenNumbers.add(entry.number);

    if (!isValidCents(entry.amountCents) || entry.amountCents <= 0) {
      errors.push('Parcelas com valor zero não são permitidas.');
    }
    entriesTotalCents += entry.amountCents;

    if (
      options.allowPaidEntries === false &&
      (entry.paid || entry.paidAt || entry.paymentMethod || entry.receivedSessionId)
    ) {
      errors.push('Uma nova venda parcelada não pode conter parcelas já recebidas.');
    }

    const expectedDueDate = addMonthsKeepingDay(plan.firstDueDate, index);
    if (!parseLocalDate(entry.dueDate) || entry.dueDate !== expectedDueDate) {
      errors.push('Os vencimentos devem avançar mês a mês a partir da primeira parcela.');
    }
  });

  if (entriesTotalCents !== plan.financedBalanceCents) {
    errors.push('A soma das parcelas deve ser exatamente igual ao saldo parcelado.');
  }

  if (
    options.saleTotalCents !== undefined &&
    (!isValidCents(options.saleTotalCents) || Number(options.saleTotalCents) !== plan.adjustedTotalCents)
  ) {
    errors.push('O total da venda não corresponde ao total final do parcelamento.');
  }

  return [...new Set(errors)];
}

function assertValidInstallmentPlan(plan, options = {}) {
  const errors = validateInstallmentPlan(plan, options);

  if (errors.length > 0) {
    const error = new Error(errors[0]);
    error.code = 'INVALID_INSTALLMENT_PLAN';
    error.details = errors;
    throw error;
  }

  return plan;
}

module.exports = {
  MAX_INSTALLMENTS,
  POSTGRES_INTEGER_MAX,
  POSTGRES_INTEGER_MIN,
  RECEIPT_PAYMENT_METHODS,
  addMonthsKeepingDay,
  assertValidInstallmentPlan,
  normalizeInstallmentPlan,
  normalizeReceiptPaymentMethod,
  parseLocalDate,
  isValidCents,
  sanitizeCents,
  sanitizeSignedCents,
  validateInstallmentPlan,
};
