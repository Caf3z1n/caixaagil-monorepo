import assert from "node:assert/strict";
import test from "node:test";
import {
  InstallmentPlanValidationError,
  addMonthsToLocalDateKey,
  buildInstallmentPaymentPlanV2,
  getLocalDateKey,
  normalizeInstallmentPaymentPlan
} from "./installment-plan.ts";

function buildPlan(overrides: Partial<Parameters<typeof buildInstallmentPaymentPlanV2>[0]> = {}) {
  return buildInstallmentPaymentPlanV2({
    installmentCount: 3,
    adjustmentKind: "none",
    adjustmentAmountCents: 0,
    originalTotalCents: 150_000,
    downPaymentCents: 0,
    firstDueDate: "2026-08-11",
    ...overrides
  });
}

test("usa a data local da venda como primeiro vencimento padrão", () => {
  const saleDate = new Date(2026, 7, 11, 23, 30);
  const plan = buildPlan({ firstDueDate: null, saleDate });

  assert.equal(getLocalDateKey(saleDate), "2026-08-11");
  assert.equal(plan.entries[0].dueDate, "2026-08-11");
});

test("usa uma data futura escolhida e avança mês a mês", () => {
  const plan = buildPlan({ firstDueDate: "2026-09-15" });

  assert.deepEqual(plan.entries.map((entry) => entry.dueDate), [
    "2026-09-15",
    "2026-10-15",
    "2026-11-15"
  ]);
});

test("mantém a âncora nos dias 29, 30 e 31, inclusive fevereiro bissexto", () => {
  assert.deepEqual(
    [0, 1, 2].map((offset) => addMonthsToLocalDateKey("2027-01-29", offset)),
    ["2027-01-29", "2027-02-28", "2027-03-29"]
  );
  assert.deepEqual(
    [0, 1, 2].map((offset) => addMonthsToLocalDateKey("2024-01-30", offset)),
    ["2024-01-30", "2024-02-29", "2024-03-30"]
  );
  assert.deepEqual(
    [0, 1, 2].map((offset) => addMonthsToLocalDateKey("2026-01-31", offset)),
    ["2026-01-31", "2026-02-28", "2026-03-31"]
  );
});

test("gera exatamente uma parcela em 1x", () => {
  const plan = buildPlan({ installmentCount: 1, firstDueDate: "2026-09-20" });

  assert.equal(plan.entries.length, 1);
  assert.equal(plan.entries[0].dueDate, "2026-09-20");
  assert.equal(plan.entries[0].amountCents, 150_000);
});

test("venda sem entrada parcela o total final inteiro", () => {
  const plan = buildPlan({ downPaymentCents: 0 });

  assert.equal(plan.downPaymentCents, 0);
  assert.equal(plan.financedBalanceCents, 150_000);
  assert.equal(plan.entries.reduce((sum, entry) => sum + entry.amountCents, 0), 150_000);
});

test("R$ 1.500 com entrada de R$ 1.000 parcela exatamente R$ 500", () => {
  const plan = buildPlan({ downPaymentCents: 100_000, downPaymentMethod: "dinheiro" });

  assert.equal(plan.adjustedTotalCents, 150_000);
  assert.equal(plan.financedBalanceCents, 50_000);
  assert.equal(plan.entries.reduce((sum, entry) => sum + entry.amountCents, 0), 50_000);
  assert.equal((plan.downPaymentCents ?? 0) + plan.entries.reduce((sum, entry) => sum + entry.amountCents, 0), 150_000);
});

test("aplica desconto monetário com centavos sem ponto flutuante", () => {
  const plan = buildPlan({ adjustmentKind: "discount", adjustmentAmountCents: 10_001 });

  assert.equal(plan.adjustmentCents, -10_001);
  assert.equal(plan.adjustedTotalCents, 139_999);
});

test("aplica juros monetários com centavos sem ponto flutuante", () => {
  const plan = buildPlan({ adjustmentKind: "interest", adjustmentAmountCents: 10_001 });

  assert.equal(plan.adjustmentCents, 10_001);
  assert.equal(plan.adjustedTotalCents, 160_001);
});

test("aplica ajuste antes de subtrair a entrada", () => {
  const discount = buildPlan({
    adjustmentKind: "discount",
    adjustmentAmountCents: 10_001,
    downPaymentCents: 100_000,
    downPaymentMethod: "pix"
  });
  const interest = buildPlan({
    adjustmentKind: "interest",
    adjustmentAmountCents: 10_001,
    downPaymentCents: 100_000,
    downPaymentMethod: "cartao"
  });

  assert.equal(discount.financedBalanceCents, 39_999);
  assert.equal(interest.financedBalanceCents, 60_001);
});

test("distribui o arredondamento em centavos e preserva a soma exata", () => {
  const plan = buildPlan({ originalTotalCents: 10_00, installmentCount: 3 });

  assert.deepEqual(plan.entries.map((entry) => entry.amountCents), [334, 333, 333]);
  assert.equal(plan.entries.reduce((sum, entry) => sum + entry.amountCents, 0), plan.financedBalanceCents);
});

test("rejeita entrada negativa, superior ou igual ao total", () => {
  assert.throws(() => buildPlan({ downPaymentCents: -1 }), InstallmentPlanValidationError);
  assert.throws(
    () => buildPlan({ downPaymentCents: 150_001, downPaymentMethod: "dinheiro" }),
    /maior que o total final/
  );
  assert.throws(
    () => buildPlan({ downPaymentCents: 150_000, downPaymentMethod: "dinheiro" }),
    /venda à vista/
  );
});

test("rejeita desconto que torne o total negativo", () => {
  assert.throws(
    () => buildPlan({ adjustmentKind: "discount", adjustmentAmountCents: 150_001 }),
    /maior que o subtotal/
  );
});

test("lê plano percentual histórico sem recalcular valores nem datas", () => {
  const legacyPlan = {
    installmentCount: 2,
    adjustmentPercent: 10,
    originalTotalCents: 10_000,
    adjustmentCents: 1_000,
    adjustedTotalCents: 11_000,
    entries: [
      { number: 1, dueDate: "2025-01-31", amountCents: 5_500, paid: true, paymentMethod: "parcelamento" },
      { number: 2, dueDate: "2025-02-28", amountCents: 5_500, paid: false }
    ]
  };
  const normalized = normalizeInstallmentPaymentPlan(legacyPlan);

  assert.equal(normalized?.schemaVersion, undefined);
  assert.equal(normalized?.adjustmentPercent, 10);
  assert.equal(normalized?.adjustmentCents, 1_000);
  assert.equal(normalized?.adjustedTotalCents, 11_000);
  assert.deepEqual(normalized?.entries.map((entry) => entry.dueDate), ["2025-01-31", "2025-02-28"]);
  assert.equal(normalized?.entries[0].paymentMethod, "parcelamento");
});

test("trata versões futuras aditivas como contrato monetário v2", () => {
  const normalized = normalizeInstallmentPaymentPlan({
    ...buildPlan({ adjustmentKind: "interest", adjustmentAmountCents: 123 }),
    schemaVersion: 3
  });

  assert.equal(normalized?.schemaVersion, 3);
  assert.equal(normalized?.adjustmentKind, "interest");
  assert.equal(normalized?.adjustmentCents, 123);
  assert.equal(normalized?.financedBalanceCents, 150_123);
});
