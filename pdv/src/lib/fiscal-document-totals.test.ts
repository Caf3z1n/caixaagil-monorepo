import assert from "node:assert/strict";
import test from "node:test";
import {
  FiscalDocumentTotalsValidationError,
  buildFiscalDocumentTotals
} from "./fiscal-document-totals.ts";

function sumAdjustments(values: { discountCents: number; otherCents: number }[], key: "discountCents" | "otherCents") {
  return values.reduce((total, value) => total + value[key], 0);
}

test("mantém subtotal, total da nota e pagamento sem ajuste", () => {
  const result = buildFiscalDocumentTotals(
    [{ totalPriceCents: 100_000 }, { totalPriceCents: 50_000 }],
    150_000
  );

  assert.deepEqual(result, {
    schemaVersion: 1,
    productsTotalCents: 150_000,
    discountCents: 0,
    otherCents: 0,
    invoiceTotalCents: 150_000,
    itemAdjustments: [
      { discountCents: 0, otherCents: 0 },
      { discountCents: 0, otherCents: 0 }
    ]
  });
});

test("mapeia desconto monetário com centavos e soma exata por item", () => {
  const result = buildFiscalDocumentTotals(
    [{ totalPriceCents: 100_000 }, { totalPriceCents: 50_000 }],
    139_999
  );

  assert.equal(result.productsTotalCents, 150_000);
  assert.equal(result.discountCents, 10_001);
  assert.equal(result.otherCents, 0);
  assert.equal(result.invoiceTotalCents, 139_999);
  assert.equal(sumAdjustments(result.itemAdjustments, "discountCents"), 10_001);
  assert.equal(result.productsTotalCents - result.discountCents, result.invoiceTotalCents);
});

test("mapeia juros monetários com centavos para outras despesas", () => {
  const result = buildFiscalDocumentTotals(
    [{ totalPriceCents: 100_000 }, { totalPriceCents: 50_000 }],
    160_001
  );

  assert.equal(result.productsTotalCents, 150_000);
  assert.equal(result.discountCents, 0);
  assert.equal(result.otherCents, 10_001);
  assert.equal(result.invoiceTotalCents, 160_001);
  assert.equal(sumAdjustments(result.itemAdjustments, "otherCents"), 10_001);
  assert.equal(result.productsTotalCents + result.otherCents, result.invoiceTotalCents);
});

test("entrada reduz somente o saldo parcelado e não o total fiscal ajustado", () => {
  const adjustedTotalCents = 160_001;
  const downPaymentCents = 100_000;
  const financedBalanceCents = adjustedTotalCents - downPaymentCents;
  const result = buildFiscalDocumentTotals([{ totalPriceCents: 150_000 }], adjustedTotalCents);

  assert.equal(financedBalanceCents, 60_001);
  assert.equal(result.otherCents, 10_001);
  assert.equal(result.invoiceTotalCents, 160_001);
  assert.notEqual(result.invoiceTotalCents, financedBalanceCents);
});

test("distribui resto de um centavo de forma determinística sem alterar o total", () => {
  const result = buildFiscalDocumentTotals(
    [{ totalPriceCents: 334 }, { totalPriceCents: 333 }, { totalPriceCents: 333 }],
    999
  );

  assert.deepEqual(result.itemAdjustments, [
    { discountCents: 1, otherCents: 0 },
    { discountCents: 0, otherCents: 0 },
    { discountCents: 0, otherCents: 0 }
  ]);
  assert.equal(sumAdjustments(result.itemAdjustments, "discountCents"), 1);
  assert.equal(result.productsTotalCents - result.discountCents + result.otherCents, result.invoiceTotalCents);
});

test("preserva venda legada sem ajuste quando total e itens coincidem", () => {
  const result = buildFiscalDocumentTotals(
    [{ totalPriceCents: 7_000 }, { totalPriceCents: 3_000 }],
    10_000
  );

  assert.equal(result.discountCents, 0);
  assert.equal(result.otherCents, 0);
  assert.equal(result.invoiceTotalCents, 10_000);
});

test("converte total percentual legado em acréscimo sem reinterpretar o histórico", () => {
  const historicalAdjustedTotalCents = 11_000;
  const result = buildFiscalDocumentTotals([{ totalPriceCents: 10_000 }], historicalAdjustedTotalCents);

  assert.equal(result.productsTotalCents, 10_000);
  assert.equal(result.otherCents, 1_000);
  assert.equal(result.invoiceTotalCents, historicalAdjustedTotalCents);
  assert.deepEqual(result.itemAdjustments, [{ discountCents: 0, otherCents: 1_000 }]);
});

test("rejeita centavos inválidos e desconto que zere a nota", () => {
  assert.throws(
    () => buildFiscalDocumentTotals([{ totalPriceCents: 10_000.5 }], 10_000),
    FiscalDocumentTotalsValidationError
  );
  assert.throws(
    () => buildFiscalDocumentTotals([{ totalPriceCents: 10_000 }], 0),
    /maiores que zero/
  );
});
