import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeInstallmentSalesSnapshot,
  mergeReopenedSalesSnapshot,
  type InstallmentSyncSale,
  type InstallmentSaleTombstone
} from "./installment-sync.ts";

type Sale = InstallmentSyncSale & {
  marker: string;
};

function sale(id: string, marker: string): Sale {
  return {
    id,
    marker,
    createdAt: "2026-08-11T12:00:00.000Z",
    paymentMethod: "parcelamento",
    installmentPlan: { entries: [{ number: 1, paid: marker === "local-pago" }] }
  };
}

function merge(
  currentSales: Sale[],
  remoteSales: Sale[],
  protectedSaleIds = new Set<string>(),
  tombstones: InstallmentSaleTombstone<Sale>[] = []
) {
  return mergeInstallmentSalesSnapshot({
    currentSales,
    remoteSales,
    protectedSaleIds,
    tombstones,
    normalizeSale: (value) => value
  });
}

test("pull remoto não desfaz parcela paga enquanto a operação está na outbox", () => {
  const result = merge(
    [sale("venda-1", "local-pago")],
    [sale("venda-1", "remoto-pendente")],
    new Set(["venda-1"])
  );

  assert.equal(result[0].marker, "local-pago");
});

test("snapshot confirmado passa a ser autoritativo após a outbox sincronizar", () => {
  const result = merge(
    [sale("venda-1", "local-antigo")],
    [sale("venda-1", "remoto-confirmado")]
  );

  assert.equal(result[0].marker, "remoto-confirmado");
});

test("tombstone final preserva venda quitada para histórico e reimpressão", () => {
  const finalSale = sale("venda-1", "remoto-quitado");
  const result = merge(
    [sale("venda-1", "local-pendente")],
    [],
    new Set(),
    [{ id: "venda-1", reason: "quitada", sale: finalSale }]
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].marker, "remoto-quitado");
});

test("cancelamento remoto marca o histórico local e ausência real remove o fantasma", () => {
  const canceled = merge(
    [sale("venda-cancelada", "local-pendente")],
    [],
    new Set(),
    [{ id: "venda-cancelada", reason: "cancelada", updatedAt: "2026-08-11T13:00:00.000Z" }]
  );
  const absent = merge(
    [sale("venda-ausente", "local-pendente")],
    [],
    new Set(),
    [{ id: "venda-ausente", reason: "ausente" }]
  );

  assert.equal(canceled[0].status, "canceled");
  assert.equal(canceled[0].canceledAt, "2026-08-11T13:00:00.000Z");
  assert.deepEqual(absent, []);
});

test("reabertura mantém a parcela canônica e descarta a baixa otimista perdedora", () => {
  const localLoser: Sale = {
    ...sale("venda-concorrente", "local-pago"),
    installmentPlan: {
      entries: [{
        number: 1,
        paid: true,
        paidAt: "2030-01-01T00:00:00.000Z",
        paymentMethod: "cartao",
        receivedSessionId: "turno-pdv-b"
      }]
    }
  };
  const canonicalWinner: Sale = {
    ...sale("venda-concorrente", "remoto-confirmado"),
    installmentPlan: {
      entries: [{
        number: 1,
        paid: true,
        paidAt: "2026-08-11T12:00:00.000Z",
        paymentMethod: "pix",
        receivedSessionId: "turno-pdv-a"
      }]
    }
  };
  const result = merge([localLoser], [canonicalWinner]);

  assert.equal(result[0].marker, "remoto-confirmado");
  assert.deepEqual(result[0].installmentPlan, canonicalWinner.installmentPlan);
});

test("reabertura preserva vendas à vista do turno e substitui a venda parcelada canônica sem duplicar", () => {
  const localLoser = sale("venda-concorrente", "local-pago");
  const canonicalWinner = sale("venda-concorrente", "remoto-confirmado");
  const cashSale: Sale = {
    id: "venda-dinheiro",
    marker: "remoto-dinheiro",
    createdAt: "2026-08-11T13:00:00.000Z",
    paymentMethod: "dinheiro"
  };
  const retainedOutstanding = sale("venda-pendente-outro-turno", "local-pendente");
  retainedOutstanding.sessionId = "turno-anterior";
  const absentFromCanonicalReopenedSnapshot = sale("venda-fantasma-turno-reaberto", "local-pendente");
  absentFromCanonicalReopenedSnapshot.sessionId = "turno-reaberto";
  const result = mergeReopenedSalesSnapshot({
    retainedSales: [localLoser, retainedOutstanding, absentFromCanonicalReopenedSnapshot],
    reopenedSales: [canonicalWinner, cashSale],
    reopenedSessionId: "turno-reaberto",
    normalizeSale: (value) => value
  });

  assert.equal(result.find((item) => item.id === "venda-concorrente")?.marker, "remoto-confirmado");
  assert.equal(result.some((item) => item.id === "venda-dinheiro"), true);
  assert.equal(result.some((item) => item.id === "venda-pendente-outro-turno"), true);
  assert.equal(result.some((item) => item.id === "venda-fantasma-turno-reaberto"), false);
  assert.equal(result.filter((item) => item.id === "venda-concorrente").length, 1);
});
