import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeReceiptConflictReconciliation,
  reconcileRejectedShiftReceipts
} from "./receipt-conflict.ts";
import {
  buildAgreementReceipt,
  buildInstallmentReceipt,
  getEffectiveShiftReceipts,
  totalShiftReceipts
} from "./shift-receipts.ts";

test("concilia lote misto de parcelas sem contabilizar a tentativa perdedora", () => {
  const optimisticFirst = buildInstallmentReceipt({
    saleId: "venda-1",
    sessionId: "turno-pdv-b",
    clientName: "Cliente",
    amountCents: 5_000,
    paymentMethod: "pix",
    receivedAt: "2030-01-01T12:00:00.000Z",
    installmentNumber: 1
  });
  const optimisticSecond = buildInstallmentReceipt({
    saleId: "venda-1",
    sessionId: "turno-pdv-b",
    clientName: "Cliente",
    amountCents: 5_000,
    paymentMethod: "pix",
    receivedAt: "2030-01-01T12:00:00.000Z",
    installmentNumber: 2
  });
  const canonicalFirst = buildInstallmentReceipt({
    saleId: "venda-1",
    sessionId: "turno-pdv-a",
    clientName: "Cliente",
    amountCents: 5_000,
    paymentMethod: "dinheiro",
    receivedAt: "2026-08-11T12:00:00.000Z",
    installmentNumber: 1
  });

  assert.ok(optimisticFirst);
  assert.ok(optimisticSecond);
  assert.ok(canonicalFirst);

  const reconciled = reconcileRejectedShiftReceipts({
    currentReceipts: [optimisticFirst, optimisticSecond],
    conflict: {
      kind: "parcela",
      saleId: "venda-1",
      rejectedInstallmentNumbers: [1, 2]
    },
    canonicalReceipts: [canonicalFirst]
  });

  assert.deepEqual(reconciled, [canonicalFirst]);
  assert.equal(totalShiftReceipts(getEffectiveShiftReceipts(reconciled, "turno-pdv-b")), 0);
  assert.equal(totalShiftReceipts(getEffectiveShiftReceipts(reconciled, "turno-pdv-a")), 5_000);
});

test("concilia convênio concorrente e preserva recebimentos não relacionados", () => {
  const optimistic = buildAgreementReceipt({
    saleId: "convenio-1",
    sessionId: "turno-pdv-b",
    clientName: "Cliente",
    amountCents: 7_500,
    paymentMethod: "pix",
    receivedAt: "2026-08-11T13:00:00.000Z"
  });
  const canonical = buildAgreementReceipt({
    saleId: "convenio-1",
    sessionId: "turno-pdv-a",
    clientName: "Cliente",
    amountCents: 7_500,
    paymentMethod: "cartao",
    receivedAt: "2026-08-11T12:59:00.000Z"
  });
  const unrelated = buildAgreementReceipt({
    saleId: "convenio-2",
    sessionId: "turno-pdv-b",
    clientName: "Outro cliente",
    amountCents: 2_000,
    paymentMethod: "dinheiro",
    receivedAt: "2026-08-11T12:00:00.000Z"
  });

  assert.ok(optimistic);
  assert.ok(canonical);
  assert.ok(unrelated);

  const reconciled = reconcileRejectedShiftReceipts({
    currentReceipts: [optimistic, unrelated],
    conflict: {
      kind: "convenio",
      saleId: "convenio-1",
      rejectedInstallmentNumbers: []
    },
    canonicalReceipts: [canonical]
  });

  assert.equal(totalShiftReceipts(getEffectiveShiftReceipts(reconciled, "turno-pdv-b")), 2_000);
  assert.equal(reconciled.find(receipt => receipt.saleId === "convenio-1")?.sessionId, "turno-pdv-a");
});

test("normaliza somente resposta terminal de conflito válida", () => {
  const conflict = normalizeReceiptConflictReconciliation({
    code: "RECEIPT_ALREADY_CONFIRMED",
    conciliacao_recebimento: {
      tipo: "parcela",
      venda_id: "venda-3",
      parcelas_rejeitadas: [2, 1, 2],
      parcelas_confirmadas: [1],
      recebimentos: [{ id: "ledger-1" }],
      venda_parcelada: { id: "venda-3" }
    }
  });

  assert.ok(conflict);
  assert.deepEqual(conflict.rejectedInstallmentNumbers, [1, 2]);
  assert.deepEqual(conflict.confirmedInstallmentNumbers, [1]);
  assert.equal(conflict.canonicalReceipts.length, 1);
  assert.equal(normalizeReceiptConflictReconciliation({ code: "OUTRO" }), null);
});
