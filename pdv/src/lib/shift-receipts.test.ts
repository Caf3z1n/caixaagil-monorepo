import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgreementReceipt,
  buildDownPaymentReceipt,
  buildInstallmentReceipt,
  getEffectiveShiftReceipts,
  mergeShiftReceipts,
  replaceShiftReceiptsForSession,
  totalShiftReceipts,
  type ShiftReceiptRecord
} from "./shift-receipts.ts";

const receivedAt = "2026-08-11T12:30:00.000Z";

test("resume recebimento efetivo de parcela no turno", () => {
  const receipt = buildInstallmentReceipt({
    saleId: "venda-1",
    sessionId: "turno-1",
    clientName: "Cliente Parcela",
    amountCents: 5_001,
    paymentMethod: "pix",
    receivedAt,
    installmentNumber: 2
  });

  assert.ok(receipt);
  assert.deepEqual(getEffectiveShiftReceipts([receipt], "turno-1"), [receipt]);
  assert.equal(totalShiftReceipts([receipt]), 5_001);
});

test("resume recebimento efetivo de convênio no turno", () => {
  const receipt = buildAgreementReceipt({
    saleId: "venda-2",
    sessionId: "turno-1",
    clientName: "Cliente Convênio",
    amountCents: 7_399,
    paymentMethod: "cartao",
    receivedAt
  });

  assert.ok(receipt);
  assert.equal(receipt.kind, "convenio");
  assert.equal(totalShiftReceipts(getEffectiveShiftReceipts([receipt], "turno-1")), 7_399);
});

test("deduplica o mesmo recebimento pelo identificador financeiro estável", () => {
  const original = buildInstallmentReceipt({
    saleId: "venda-3",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 1_000,
    paymentMethod: "dinheiro",
    receivedAt,
    installmentNumber: 1
  });

  assert.ok(original);
  const merged = mergeShiftReceipts([original], [{ ...original, clientName: "Cliente atualizado" }]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].clientName, "Cliente atualizado");
  assert.equal(totalShiftReceipts(merged), 1_000);
});

test("estado mais novo do servidor prevalece mesmo com relógio de recebimento atrasado", () => {
  const active = buildInstallmentReceipt({
    saleId: "venda-revisao",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 1_000,
    paymentMethod: "pix",
    receivedAt: "2026-08-11T15:00:00.000Z",
    installmentNumber: 1
  });

  assert.ok(active);
  const canceled: ShiftReceiptRecord = {
    ...active,
    status: "cancelado",
    receivedAt: "2026-08-11T12:00:00.000Z",
    revisionAt: "2026-08-11T16:00:00.000Z"
  };
  const merged = mergeShiftReceipts([active], [canceled]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "cancelado");
});

test("resposta antiga não desfaz rebaixa local mais recente", () => {
  const serverCanceled = buildInstallmentReceipt({
    saleId: "venda-rebaixa",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 1_000,
    paymentMethod: "dinheiro",
    receivedAt: "2026-08-11T10:00:00.000Z",
    installmentNumber: 1
  });

  assert.ok(serverCanceled);
  const oldCancellation: ShiftReceiptRecord = {
    ...serverCanceled,
    status: "cancelado",
    revisionAt: "2026-08-11T10:30:00.000Z"
  };
  const localReReceipt: ShiftReceiptRecord = {
    ...serverCanceled,
    status: "efetivado",
    receivedAt: "2026-08-11T11:00:00.000Z",
    revisionAt: "2026-08-11T11:00:00.000Z"
  };

  assert.equal(mergeShiftReceipts([localReReceipt], [oldCancellation])[0].status, "efetivado");
});

test("exclui recebimentos cancelados, estornados, de outro turno ou de venda cancelada", () => {
  const base = buildAgreementReceipt({
    saleId: "venda-4",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 2_000,
    paymentMethod: "pix",
    receivedAt
  });
  const otherSession = buildDownPaymentReceipt({
    saleId: "venda-5",
    sessionId: "turno-2",
    clientName: "Cliente",
    amountCents: 500,
    paymentMethod: "dinheiro",
    receivedAt
  });

  assert.ok(base);
  assert.ok(otherSession);
  const canceled: ShiftReceiptRecord = { ...base, id: "cancelado", status: "cancelado" };
  const reversed: ShiftReceiptRecord = { ...base, id: "estornado", status: "estornado" };

  assert.deepEqual(
    getEffectiveShiftReceipts([base, canceled, reversed, otherSession], "turno-1", new Set(["venda-4"])),
    []
  );
});

test("identifica entrada sem duplicá-la e mantém soma exata em centavos", () => {
  const downPayment = buildDownPaymentReceipt({
    saleId: "venda-6",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 100_000,
    paymentMethod: "dinheiro",
    receivedAt
  });
  const installment = buildInstallmentReceipt({
    saleId: "venda-6",
    sessionId: "turno-1",
    clientName: "Cliente",
    amountCents: 50_000,
    paymentMethod: "pix",
    receivedAt,
    installmentNumber: 1
  });

  assert.ok(downPayment);
  assert.ok(installment);
  const receipts = mergeShiftReceipts([downPayment], [downPayment, installment]);

  assert.equal(receipts.length, 2);
  assert.equal(totalShiftReceipts(receipts), 150_000);
});

test("reabertura substitui integralmente o ledger do turno mesmo com relógio local futuro", () => {
  const staleLocal = buildInstallmentReceipt({
    saleId: "venda-concorrente",
    sessionId: "turno-reaberto",
    clientName: "Baixa perdedora",
    amountCents: 5_000,
    paymentMethod: "cartao",
    receivedAt: "2030-01-01T00:00:00.000Z",
    installmentNumber: 1
  });
  const canonical = buildAgreementReceipt({
    saleId: "convenio-canonico",
    sessionId: "turno-reaberto",
    clientName: "Cliente canônico",
    amountCents: 7_500,
    paymentMethod: "pix",
    receivedAt: "2026-08-11T12:00:00.000Z"
  });
  const unrelated = buildDownPaymentReceipt({
    saleId: "venda-outro-turno",
    sessionId: "turno-anterior",
    clientName: "Outro turno",
    amountCents: 1_000,
    paymentMethod: "dinheiro",
    receivedAt
  });

  assert.ok(staleLocal);
  assert.ok(canonical);
  assert.ok(unrelated);
  const result = replaceShiftReceiptsForSession(
    [staleLocal, unrelated],
    [canonical],
    "turno-reaberto"
  );

  assert.equal(result.some((receipt) => receipt.saleId === "venda-concorrente"), false);
  assert.equal(result.some((receipt) => receipt.saleId === "convenio-canonico"), true);
  assert.equal(result.some((receipt) => receipt.saleId === "venda-outro-turno"), true);
});
