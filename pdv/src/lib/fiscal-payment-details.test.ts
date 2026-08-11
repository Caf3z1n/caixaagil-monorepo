import assert from "node:assert/strict";
import test from "node:test";
import type { InstallmentPaymentPlan } from "@/app/promissory-note";
import {
  FiscalPaymentDetailsValidationError,
  buildFiscalPaymentDetails
} from "./fiscal-payment-details.ts";

function buildPlan(overrides: Partial<InstallmentPaymentPlan> = {}): InstallmentPaymentPlan {
  return {
    schemaVersion: 2,
    installmentCount: 3,
    adjustmentPercent: 0,
    adjustmentKind: "none",
    originalTotalCents: 150_000,
    adjustmentCents: 0,
    adjustmentAmountCents: 0,
    adjustedTotalCents: 150_000,
    downPaymentCents: 100_000,
    downPaymentMethod: "pix",
    financedBalanceCents: 50_000,
    financedTotalCents: 50_000,
    entries: [
      { number: 1, dueDate: "2026-09-15", amountCents: 16_667 },
      { number: 2, dueDate: "2026-10-15", amountCents: 16_667 },
      { number: 3, dueDate: "2026-11-15", amountCents: 16_666 }
    ],
    ...overrides
  };
}

test("detalha entrada pelo meio real e saldo parcelado como crédito da loja", () => {
  const details = buildFiscalPaymentDetails({
    paymentMethod: "parcelamento",
    totalCents: 150_000,
    installmentPlan: buildPlan()
  });

  assert.deepEqual(details, [
    { paymentMethod: "pix", amountCents: 100_000 },
    { paymentMethod: "credito_loja", amountCents: 50_000 }
  ]);
  assert.equal(details.reduce((total, detail) => total + detail.amountCents, 0), 150_000);
});

test("venda totalmente a prazo não é declarada como dinheiro", () => {
  const details = buildFiscalPaymentDetails({
    paymentMethod: "parcelamento",
    totalCents: 150_000,
    installmentPlan: buildPlan({
      downPaymentCents: 0,
      downPaymentMethod: null,
      financedBalanceCents: 150_000,
      financedTotalCents: 150_000,
      entries: [
        { number: 1, dueDate: "2026-09-15", amountCents: 50_000 },
        { number: 2, dueDate: "2026-10-15", amountCents: 50_000 },
        { number: 3, dueDate: "2026-11-15", amountCents: 50_000 }
      ]
    })
  });

  assert.deepEqual(details, [{ paymentMethod: "credito_loja", amountCents: 150_000 }]);
});

test("preserva o total fiscal ajustado sem descontar a entrada duas vezes", () => {
  const details = buildFiscalPaymentDetails({
    paymentMethod: "parcelamento",
    totalCents: 160_001,
    installmentPlan: buildPlan({
      adjustmentKind: "interest",
      adjustmentCents: 10_001,
      adjustmentAmountCents: 10_001,
      adjustedTotalCents: 160_001,
      financedBalanceCents: 60_001,
      financedTotalCents: 60_001,
      entries: [
        { number: 1, dueDate: "2026-09-15", amountCents: 20_001 },
        { number: 2, dueDate: "2026-10-15", amountCents: 20_000 },
        { number: 3, dueDate: "2026-11-15", amountCents: 20_000 }
      ]
    })
  });

  assert.deepEqual(details, [
    { paymentMethod: "pix", amountCents: 100_000 },
    { paymentMethod: "credito_loja", amountCents: 60_001 }
  ]);
  assert.equal(details.reduce((total, detail) => total + detail.amountCents, 0), 160_001);
});

test("mantém leitura de parcelamento legado como crédito da loja", () => {
  const details = buildFiscalPaymentDetails({
    paymentMethod: "parcelamento",
    totalCents: 10_000,
    installmentPlan: buildPlan({ schemaVersion: 1 })
  });

  assert.deepEqual(details, [{ paymentMethod: "credito_loja", amountCents: 10_000 }]);
});

test("mapeia convênio para crédito da loja e pagamentos imediatos sem alterar o total", () => {
  assert.deepEqual(
    buildFiscalPaymentDetails({ paymentMethod: "convenio", totalCents: 7_505 }),
    [{ paymentMethod: "credito_loja", amountCents: 7_505 }]
  );
  assert.deepEqual(
    buildFiscalPaymentDetails({ paymentMethod: "cartao", totalCents: 7_505 }),
    [{ paymentMethod: "cartao", amountCents: 7_505 }]
  );
});

test("rejeita divergência entre entrada, parcelas e total fiscal", () => {
  assert.throws(
    () => buildFiscalPaymentDetails({
      paymentMethod: "parcelamento",
      totalCents: 150_000,
      installmentPlan: buildPlan({ financedBalanceCents: 49_999, financedTotalCents: 49_999 })
    }),
    FiscalPaymentDetailsValidationError
  );
  assert.throws(
    () => buildFiscalPaymentDetails({
      paymentMethod: "parcelamento",
      totalCents: 149_999,
      installmentPlan: buildPlan()
    }),
    /total fiscal diverge/i
  );
  assert.throws(
    () => buildFiscalPaymentDetails({
      paymentMethod: "parcelamento",
      totalCents: 150_000,
      installmentPlan: buildPlan({ downPaymentMethod: "parcelamento" })
    }),
    /forma de pagamento da entrada/i
  );
});
