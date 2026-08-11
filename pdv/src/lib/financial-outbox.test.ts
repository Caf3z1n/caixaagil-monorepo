import assert from "node:assert/strict";
import test from "node:test";
import { getUnsyncedFinancialAggregateProtection } from "./financial-outbox.ts";

test("protege somente agregados financeiros presentes quando a janela da outbox está completa", () => {
  const result = getUnsyncedFinancialAggregateProtection({
    pendingEvents: [
      { event_type: "parcelamento_recebido", aggregate_id: "venda-parcelada" },
      { event_type: "convenio_recebido", aggregate_id: "venda-convenio" }
    ],
    failedEvents: [],
    allOutstandingInstallmentSaleIds: ["venda-parcelada", "venda-fora-da-fila"],
    allPaidAgreementReceiptIds: ["venda-convenio", "convenio-fora-da-fila"]
  });

  assert.deepEqual([...result.installmentSaleIds], ["venda-parcelada"]);
  assert.deepEqual([...result.agreementReceiptIds], ["venda-convenio"]);
  assert.equal(result.windowIncomplete, false);
});

for (const queueStatus of ["pending", "failed"] as const) {
  test(`não aplica tombstone financeiro fora da janela quando há 1.000 eventos ${queueStatus}`, () => {
    const cappedWindow = Array.from({ length: 1_000 }, (_, index) => ({
      event_type: "despesa_lancada",
      aggregate_id: `despesa-${index}`
    }));
    const result = getUnsyncedFinancialAggregateProtection({
      pendingEvents: queueStatus === "pending" ? cappedWindow : [],
      failedEvents: queueStatus === "failed" ? cappedWindow : [],
      allOutstandingInstallmentSaleIds: ["venda-financeira-fora-da-janela"],
      allPaidAgreementReceiptIds: ["convenio-financeiro-fora-da-janela"]
    });

    assert.equal(result.windowIncomplete, true);
    assert.equal(result.installmentSaleIds.has("venda-financeira-fora-da-janela"), true);
    assert.equal(result.agreementReceiptIds.has("convenio-financeiro-fora-da-janela"), true);
  });
}
