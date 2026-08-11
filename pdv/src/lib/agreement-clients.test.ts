import assert from "node:assert/strict";
import test from "node:test";
import {
  getActiveAgreementClients,
  getFrontCashAgreementClients,
  normalizeAgreementClients
} from "./agreement-clients.ts";

const activeClient = {
  id: 1,
  name: "Cliente ativo",
  active: true,
  allowFrontPayment: true
};
const inactiveDebtor = {
  id: 2,
  name: "Cliente inativo com dívida",
  active: false,
  allowFrontPayment: false
};

test("cliente inativo com dívida pode quitar histórico sem voltar às novas vendas", () => {
  const normalized = normalizeAgreementClients([inactiveDebtor, activeClient]);

  assert.deepEqual(getActiveAgreementClients(normalized), [activeClient]);
  assert.deepEqual(getFrontCashAgreementClients(normalized), [activeClient, inactiveDebtor]);
});
