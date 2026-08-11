const assert = require('node:assert/strict');
const test = require('node:test');
const {
  addMonthsKeepingDay,
  normalizeInstallmentPlan,
  POSTGRES_INTEGER_MAX,
  sanitizeCents,
  validateInstallmentPlan,
} = require('../src/app/services/installmentPlanService');

function makePlan(overrides = {}) {
  return normalizeInstallmentPlan({
    schemaVersion: 2,
    installmentCount: 3,
    firstDueDate: '2026-09-15',
    adjustmentKind: 'none',
    adjustmentCents: 0,
    originalTotalCents: 150000,
    adjustedTotalCents: 150000,
    downPaymentCents: 100000,
    downPaymentMethod: 'pix',
    financedBalanceCents: 50000,
    entries: [
      { number: 1, dueDate: '2026-09-15', amountCents: 16667 },
      { number: 2, dueDate: '2026-10-15', amountCents: 16667 },
      { number: 3, dueDate: '2026-11-15', amountCents: 16666 },
    ],
    ...overrides,
  });
}

test('mantém a primeira parcela na data local escolhida e avança por mês', () => {
  const plan = makePlan();

  assert.equal(plan.entries[0].dueDate, '2026-09-15');
  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 150000 }), []);
});

test('preserva o dia âncora 31 depois de fevereiro sem deriva permanente', () => {
  assert.equal(addMonthsKeepingDay('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonthsKeepingDay('2025-01-31', 2), '2025-03-31');
  assert.equal(addMonthsKeepingDay('2025-01-31', 3), '2025-04-30');
});

test('trata dias 29 e 30 em fevereiro, incluindo ano bissexto', () => {
  assert.equal(addMonthsKeepingDay('2024-01-29', 1), '2024-02-29');
  assert.equal(addMonthsKeepingDay('2025-01-29', 1), '2025-02-28');
  assert.equal(addMonthsKeepingDay('2024-01-30', 1), '2024-02-29');
  assert.equal(addMonthsKeepingDay('2024-01-30', 2), '2024-03-30');
});

test('aceita venda parcelada em uma única parcela', () => {
  const plan = makePlan({
    installmentCount: 1,
    downPaymentCents: 0,
    downPaymentMethod: null,
    financedBalanceCents: 150000,
    entries: [{ number: 1, dueDate: '2026-09-15', amountCents: 150000 }],
  });

  assert.equal(plan.installmentCount, 1);
  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 150000 }), []);
});

test('mantém soma exata em centavos quando o saldo não divide igualmente', () => {
  const plan = makePlan({
    originalTotalCents: 500,
    adjustedTotalCents: 500,
    downPaymentCents: 0,
    downPaymentMethod: null,
    financedBalanceCents: 500,
    entries: [
      { number: 1, dueDate: '2026-09-15', amountCents: 167 },
      { number: 2, dueDate: '2026-10-15', amountCents: 167 },
      { number: 3, dueDate: '2026-11-15', amountCents: 166 },
    ],
  });

  assert.equal(plan.entries.reduce((sum, entry) => sum + entry.amountCents, 0), 500);
  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 500 }), []);
});

test('normaliza desconto monetário absoluto como ajuste assinado', () => {
  const plan = makePlan({
    adjustmentKind: 'discount',
    adjustmentCents: undefined,
    adjustmentAmountCents: 10001,
    originalTotalCents: 150000,
    adjustedTotalCents: 139999,
    downPaymentCents: 100000,
    financedBalanceCents: 39999,
    entries: [
      { number: 1, dueDate: '2026-09-15', amountCents: 13333 },
      { number: 2, dueDate: '2026-10-15', amountCents: 13333 },
      { number: 3, dueDate: '2026-11-15', amountCents: 13333 },
    ],
  });

  assert.equal(plan.adjustmentCents, -10001);
  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 139999 }), []);
});

test('normaliza juros monetários absolutos como ajuste assinado', () => {
  const plan = makePlan({
    adjustmentKind: 'interest',
    adjustmentCents: undefined,
    adjustmentAmountCents: 10001,
    adjustedTotalCents: 160001,
    financedBalanceCents: 60001,
    entries: [
      { number: 1, dueDate: '2026-09-15', amountCents: 20001 },
      { number: 2, dueDate: '2026-10-15', amountCents: 20000 },
      { number: 3, dueDate: '2026-11-15', amountCents: 20000 },
    ],
  });

  assert.equal(plan.adjustmentCents, 10001);
  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 160001 }), []);
});

test('rejeita entrada negativa, igual ou superior ao total', () => {
  const negative = makePlan({ downPaymentCents: -1, financedBalanceCents: 150001 });
  const equal = makePlan({ downPaymentCents: 150000, financedBalanceCents: 0 });
  const greater = makePlan({ downPaymentCents: 150001, financedBalanceCents: 0 });

  assert.match(validateInstallmentPlan(negative).join(' '), /entrada/i);
  assert.match(validateInstallmentPlan(equal).join(' '), /entrada/i);
  assert.match(validateInstallmentPlan(greater).join(' '), /entrada/i);
});

test('rejeita divergência entre saldo parcelado e soma das parcelas', () => {
  const plan = makePlan({ financedBalanceCents: 50001 });

  assert.match(validateInstallmentPlan(plan).join(' '), /soma das parcelas/i);
});

test('lê parcelamentos históricos percentuais sem reinterpretá-los como v2', () => {
  const legacy = normalizeInstallmentPlan({
    installmentCount: 3,
    adjustmentPercent: -10,
    originalTotalCents: 150000,
    adjustmentCents: -15000,
    adjustedTotalCents: 135000,
    entries: [
      {
        number: 1,
        dueDate: '2026-01-31',
        amountCents: 45000,
        paid: true,
        paymentMethod: 'parcelamento',
      },
      { number: 2, dueDate: '2026-02-28', amountCents: 45000 },
      { number: 3, dueDate: '2026-03-31', amountCents: 45000 },
    ],
  });

  assert.equal(legacy.schemaVersion, 1);
  assert.equal(legacy.adjustmentPercent, -10);
  assert.equal(legacy.adjustmentCents, -15000);
  assert.equal(legacy.entries[0].paymentMethod, 'parcelamento');
  assert.equal(Object.hasOwn(legacy, 'firstDueDate'), false);
  assert.equal(Object.hasOwn(legacy, 'downPaymentCents'), false);
  assert.equal(normalizeInstallmentPlan(legacy).schemaVersion, 1);
  assert.deepEqual(validateInstallmentPlan(legacy), []);
});

test('preserva metadados operacionais da entrada no contrato canônico', () => {
  const plan = makePlan({
    downPaymentPaidAt: '2026-08-11T12:34:56.000Z',
    downPaymentSessionId: 'caixa-teste-1',
  });

  assert.equal(plan.downPaymentPaidAt, '2026-08-11T12:34:56.000Z');
  assert.equal(plan.downPaymentSessionId, 'caixa-teste-1');
});

test('promove schema v1 declarado quando o contrato contém campos exclusivos da v2', () => {
  const promoted = makePlan({ schemaVersion: 1 });

  assert.equal(promoted.schemaVersion, 2);
  assert.deepEqual(validateInstallmentPlan(promoted, { saleTotalCents: 150000 }), []);
});

test('rejeita centavos fracionários, inseguros ou fora do INTEGER do PostgreSQL', () => {
  const fractionalAdjustment = makePlan({
    adjustmentCents: 0.5,
    adjustedTotalCents: 150000,
  });
  const outOfBounds = makePlan({
    originalTotalCents: POSTGRES_INTEGER_MAX + 1,
    adjustedTotalCents: POSTGRES_INTEGER_MAX + 1,
  });

  assert.match(validateInstallmentPlan(fractionalAdjustment).join(' '), /centavos inteiros/i);
  assert.match(validateInstallmentPlan(outOfBounds).join(' '), /centavos inteiros/i);
  assert.equal(sanitizeCents(100.5), 0);
  assert.equal(sanitizeCents(POSTGRES_INTEGER_MAX + 1), 0);
  assert.equal(sanitizeCents(POSTGRES_INTEGER_MAX), POSTGRES_INTEGER_MAX);
});

test('rejeita metadados de parcela já paga ao criar uma venda v2', () => {
  const plan = makePlan({
    entries: [
      {
        number: 1,
        dueDate: '2026-09-15',
        amountCents: 16667,
        paid: true,
        paidAt: '2026-08-11T12:00:00.000Z',
        paymentMethod: 'pix',
        receivedSessionId: 'caixa-1',
      },
      { number: 2, dueDate: '2026-10-15', amountCents: 16667 },
      { number: 3, dueDate: '2026-11-15', amountCents: 16666 },
    ],
  });

  assert.deepEqual(validateInstallmentPlan(plan, { saleTotalCents: 150000 }), []);
  assert.match(
    validateInstallmentPlan(plan, {
      saleTotalCents: 150000,
      allowPaidEntries: false,
    }).join(' '),
    /não pode conter parcelas já recebidas/i
  );
});
