import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPromissoryNoteReceiptPayload,
  buildSaleReceiptPayload,
  type InstallmentPaymentPlan,
  type PromissorySaleData
} from "../src/app/promissory-note.ts";

function buildLegacyPlan(overrides: Partial<InstallmentPaymentPlan> = {}): InstallmentPaymentPlan {
  return {
    installmentCount: 3,
    adjustmentPercent: 0,
    originalTotalCents: 150000,
    adjustmentCents: 0,
    adjustedTotalCents: 150000,
    customerName: "Cliente salvo no plano",
    entries: [
      { number: 1, dueDate: "2026-09-15", amountCents: 50000 },
      { number: 2, dueDate: "2026-10-15", amountCents: 50000 },
      { number: 3, dueDate: "2026-11-15", amountCents: 50000 }
    ],
    ...overrides
  };
}

function buildSale(overrides: Partial<PromissorySaleData> = {}): PromissorySaleData {
  return {
    id: "venda-teste-1",
    createdAt: "2026-08-11T12:30:00.000Z",
    totalCents: 150000,
    clientName: "Maria da Silva",
    installmentPlan: buildLegacyPlan(),
    items: [
      {
        id: "item-1",
        name: "Produto de teste",
        quantity: 1,
        priceCents: 150000
      }
    ],
    ...overrides
  };
}

function buildReceipt(sale = buildSale(), pdvIdentity = "Balcão principal") {
  return buildSaleReceiptPayload({
    fiscalSettings: {
      emitente: {
        nome_fantasia: "Mercado Teste",
        cnpj_cpf: "12345678000199"
      }
    },
    paymentLabel: "Parcelamento",
    pdvIdentity,
    sale
  });
}

function getField(payload: ReturnType<typeof buildSaleReceiptPayload>, label: string) {
  return payload.fields?.find((field) => field.label === label)?.value;
}

function getSection(payload: ReturnType<typeof buildSaleReceiptPayload>, title: string) {
  return payload.sections?.find((section) => section.title === title)?.content ?? "";
}

test("imprime somente o número simples na coluna Parcela", () => {
  const schedule = getSection(buildReceipt(), "Parcelas");
  const lines = schedule.split("\n");

  assert.equal(lines.length, 5);
  assert.match(lines[2], /^1\s/);
  assert.match(lines[3], /^2\s/);
  assert.match(lines[4], /^3\s/);
  assert.doesNotMatch(schedule, /\b[123]\/3\b/);
});

test("mantém todas as linhas da tabela de parcelas dentro da largura térmica", () => {
  const receipt = buildReceipt(buildSale({
    items: [{
      id: "item-longo",
      name: "Produto com uma descrição intencionalmente longa para o papel térmico",
      quantity: 1,
      priceCents: 150000
    }]
  }));

  for (const section of receipt.sections ?? []) {
    for (const line of section.content.split("\n")) {
      assert.ok(line.length <= 32, `Linha excedeu 32 colunas: ${JSON.stringify(line)}`);
    }
  }
});

test("usa o nome do cliente persistido na venda em impressão e reimpressão", () => {
  const persistedSale = buildSale({ clientName: "Ana Cliente Persistida" });
  const firstPrint = buildReceipt(persistedSale);
  const reprint = buildReceipt(structuredClone(persistedSale));

  assert.equal(getField(firstPrint, "Cliente"), "Ana Cliente Persistida");
  assert.equal(getField(reprint, "Cliente"), "Ana Cliente Persistida");
});

test("recupera o cliente do plano legado e trata histórico sem cliente", () => {
  const legacyWithCustomer = buildSale({
    clientName: null,
    installmentPlan: buildLegacyPlan({ customerName: "Cliente do plano legado" })
  });
  const legacyWithoutCustomer = buildSale({
    clientName: null,
    installmentPlan: buildLegacyPlan({ customerName: null })
  });

  assert.equal(getField(buildReceipt(legacyWithCustomer), "Cliente"), "Cliente do plano legado");
  assert.equal(getField(buildReceipt(legacyWithoutCustomer), "Cliente"), "Não informado");
});

test("inclui o nome atual do PDV e um fallback seguro em todos os comprovantes", () => {
  const updatedReceipt = buildReceipt(buildSale(), "Caixa atualizado pela web");
  const receiptWithoutIdentity = buildReceipt(buildSale(), "   ");
  const promissory = buildPromissoryNoteReceiptPayload({
    fiscalSettings: null,
    pdvIdentity: "Caixa atualizado pela web",
    sale: buildSale({ installmentPlan: null }),
    agreementClient: null,
    fiscalDocument: null
  });

  assert.equal(getField(updatedReceipt, "PDV"), "Caixa atualizado pela web");
  assert.equal(getField(receiptWithoutIdentity, "PDV"), "Não informado");
  assert.equal(promissory.fields?.find((field) => field.label === "PDV")?.value, "Caixa atualizado pela web");
});

test("imprime o resumo financeiro persistido do plano v2", () => {
  const v2Plan = buildLegacyPlan({
    schemaVersion: 2,
    adjustmentKind: "discount",
    adjustmentCents: -10000,
    adjustmentAmountCents: 10000,
    adjustedTotalCents: 140000,
    downPaymentCents: 100000,
    financedBalanceCents: 40000,
    financedTotalCents: 40000,
    entries: [
      { number: 1, dueDate: "2026-09-15", amountCents: 20000 },
      { number: 2, dueDate: "2026-10-15", amountCents: 20000 }
    ]
  });
  const receipt = buildReceipt(buildSale({ totalCents: 140000, installmentPlan: v2Plan }));

  assert.equal(getField(receipt, "Subtotal"), "R$ 1.500,00");
  assert.equal(getField(receipt, "Desconto"), "-R$ 100,00");
  assert.equal(getField(receipt, "Entrada"), "R$ 1.000,00");
  assert.equal(getField(receipt, "Saldo parcelado"), "R$ 400,00");
  assert.equal(getField(receipt, "Total final"), "R$ 1.400,00");
  assert.equal(receipt.highlightValue, "R$ 1.400,00");
});

test("mantém a leitura e a apresentação de um plano legado percentual", () => {
  const legacyPlan = buildLegacyPlan({
    adjustmentPercent: -10,
    adjustmentCents: -15000,
    adjustedTotalCents: 135000,
    entries: [
      { number: 1, dueDate: "2026-09-15", amountCents: 67500 },
      { number: 2, dueDate: "2026-10-15", amountCents: 67500 }
    ]
  });
  const receipt = buildReceipt(buildSale({ totalCents: 135000, installmentPlan: legacyPlan }));

  assert.equal(getField(receipt, "Subtotal"), "R$ 1.500,00");
  assert.equal(getField(receipt, "Desconto"), "-R$ 150,00 (-10%)");
  assert.equal(getField(receipt, "Entrada"), "R$ 0,00");
  assert.equal(getField(receipt, "Saldo parcelado"), "R$ 1.350,00");
  assert.equal(getField(receipt, "Total final"), "R$ 1.350,00");
  assert.equal(receipt.highlightValue, "R$ 1.350,00");
});

test("aceita aliases v2 do PDV quando os campos canônicos ainda não existem", () => {
  const aliasPlan = buildLegacyPlan({
    schemaVersion: 2,
    adjustmentKind: "interest",
    adjustmentCents: 0,
    adjustmentAmountCents: 250,
    adjustedTotalCents: 150250,
    downPaymentCents: 250,
    financedBalanceCents: undefined,
    financedTotalCents: 150000
  });
  const receipt = buildReceipt(buildSale({ totalCents: 150250, installmentPlan: aliasPlan }));

  assert.equal(getField(receipt, "Juros"), "+R$ 2,50");
  assert.equal(getField(receipt, "Entrada"), "R$ 2,50");
  assert.equal(getField(receipt, "Saldo parcelado"), "R$ 1.500,00");
  assert.equal(getField(receipt, "Total final"), "R$ 1.502,50");
});
