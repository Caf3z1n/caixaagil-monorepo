import assert from "node:assert/strict";
import test from "node:test";
import { mergeSynchronizedPdvSession, type SynchronizedPdvSession } from "./pdv-session.ts";

const cachedSession: SynchronizedPdvSession = {
  id: 10,
  identificacao: "PDV 01",
  nome: "Balcão antigo",
  ultima_sincronizacao_em: "2026-08-10T10:00:00.000Z"
};

test("atualiza o nome do PDV após a sincronização normal", () => {
  const synchronizedSession = mergeSynchronizedPdvSession(cachedSession, {
    ...cachedSession,
    nome: "Balcão principal",
    ultima_sincronizacao_em: "2026-08-11T10:00:00.000Z"
  });

  assert.equal(synchronizedSession?.nome, "Balcão principal");
  assert.equal(synchronizedSession?.ultima_sincronizacao_em, "2026-08-11T10:00:00.000Z");
});

test("mantém o último nome sincronizado quando não há resposta online", () => {
  assert.equal(mergeSynchronizedPdvSession(cachedSession, undefined), cachedSession);
  assert.equal(mergeSynchronizedPdvSession(cachedSession, null), cachedSession);
});

test("rejeita identidade de outro PDV no mesmo cache local", () => {
  const unexpectedSession = mergeSynchronizedPdvSession(cachedSession, {
    ...cachedSession,
    id: 11,
    nome: "Outro caixa"
  });

  assert.equal(unexpectedSession, cachedSession);
});
