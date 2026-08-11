import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReceiptAttemptEventId,
  groupInstallmentReceiptAttempts
} from "./receipt-event.ts";

test("mantém replay da mesma tentativa idempotente e diferencia nova baixa após estorno", () => {
  const first = buildReceiptAttemptEventId({
    eventType: "parcelamento_recebido",
    aggregateId: "venda-1",
    operationParts: [2, 1],
    receivedAt: "2026-08-11T12:00:00.000Z"
  });
  const replay = buildReceiptAttemptEventId({
    eventType: "parcelamento_recebido",
    aggregateId: "venda-1",
    operationParts: [1, 2],
    receivedAt: "2026-08-11T12:00:00.000Z"
  });
  const afterReversal = buildReceiptAttemptEventId({
    eventType: "parcelamento_recebido",
    aggregateId: "venda-1",
    operationParts: [1, 2],
    receivedAt: "2026-08-12T09:15:00.000Z"
  });

  assert.equal(replay, first);
  assert.notEqual(afterReversal, first);
});

test("recovery separa tentativas por forma de pagamento e horário", () => {
  const groups = groupInstallmentReceiptAttempts([
    { number: 1, paymentMethod: "dinheiro", paidAt: "2026-08-11T12:00:00.000Z" },
    { number: 2, paymentMethod: "pix", paidAt: "2026-08-11T12:05:00.000Z" },
    { number: 3, paymentMethod: "dinheiro", paidAt: "2026-08-11T12:00:00.000Z" }
  ], "2026-08-11T11:00:00.000Z");

  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].entries.map((entry) => entry.number), [1, 3]);
  assert.equal(groups[0].paymentMethod, "dinheiro");
  assert.deepEqual(groups[1].entries.map((entry) => entry.number), [2]);
  assert.equal(groups[1].paymentMethod, "pix");
});

test("identifica nova baixa de convênio pelo horário persistido", () => {
  const first = buildReceiptAttemptEventId({
    eventType: "convenio_recebido",
    aggregateId: "venda-convenio",
    receivedAt: "2026-08-11T10:00:00.000Z"
  });
  const second = buildReceiptAttemptEventId({
    eventType: "convenio_recebido",
    aggregateId: "venda-convenio",
    receivedAt: "2026-08-11T10:30:00.000Z"
  });

  assert.notEqual(first, second);
});
