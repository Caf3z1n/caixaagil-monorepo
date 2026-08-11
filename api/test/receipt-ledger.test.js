const assert = require('node:assert/strict');
const test = require('node:test');
const {
  RECEIPT_ALREADY_CONFIRMED_CODE,
  buildReceiptIdempotencyKey,
  buildReceiptConflictSyncOutcome,
  getInstallmentReceiptConflict,
  getSyncOutcomeFromEventPayload,
  listReceiptLedger,
  registerReceipt,
  sanitizeReceiptLedgerEntry,
  storeSyncOutcomeInEventPayload,
  summarizeConfirmedReceipts,
} = require('../src/app/services/receiptLedgerService');
const { RecebimentoVenda } = require('../src/app/models');

test('gera uma chave estável e distinta para cada parcela', () => {
  const first = buildReceiptIdempotencyKey('evento-123', 'parcela', 'venda-1', 1);
  const repeated = buildReceiptIdempotencyKey('evento-123', 'parcela', 'venda-1', 1);
  const second = buildReceiptIdempotencyKey('evento-123', 'parcela', 'venda-1', 2);

  assert.equal(first, repeated);
  assert.notEqual(first, second);
  assert.ok(first.length <= 220);
});

test('encurta chave longa de forma determinística sem perder unicidade da operação', () => {
  const base = 'x'.repeat(400);
  const first = buildReceiptIdempotencyKey(base, 'parcela', 'venda-1', 1);
  const second = buildReceiptIdempotencyKey(base, 'parcela', 'venda-1', 2);

  assert.equal(first.length, 220);
  assert.equal(second.length, 220);
  assert.notEqual(first, second);
});

test('soma somente recebimentos confirmados por forma de pagamento', () => {
  const summary = summarizeConfirmedReceipts([
    { status: 'confirmado', metodo_pagamento: 'dinheiro', valor_centavos: 10001 },
    { status: 'confirmado', metodo_pagamento: 'pix', valor_centavos: 20002 },
    { status: 'cancelado', metodo_pagamento: 'dinheiro', valor_centavos: 99999 },
    { status: 'confirmado', metodo_pagamento: 'cartao', valor_centavos: 30003 },
  ]);

  assert.deepEqual(summary, {
    totals: { dinheiro: 10001, pix: 20002, cartao: 30003 },
    counts: { dinheiro: 1, pix: 1, cartao: 1 },
  });
});

test('serializa o contrato snake_case preservando cancelamento', () => {
  const serialized = sanitizeReceiptLedgerEntry({
    id: 'recebimento-1',
    chave_idempotencia: 'evento-1:parcela:venda-1:1',
    venda_id: 'venda-1',
    caixa_id: 'caixa-1',
    pdv_id: 3,
    tipo: 'parcela',
    parcela_numero: 1,
    parcelas_total: 3,
    cliente_nome: 'Cliente Teste',
    valor_centavos: 50000,
    metodo_pagamento: 'pix',
    recebido_em: '2026-08-11T12:00:00.000Z',
    status: 'cancelado',
    cancelado_em: '2026-08-11T13:00:00.000Z',
    origem: 'pdv',
    created_at: '2026-08-11T11:59:00.000Z',
    updated_at: '2026-08-11T13:01:00.000Z',
  });

  assert.equal(serialized.valor_centavos, 50000);
  assert.equal(serialized.status, 'cancelado');
  assert.equal(serialized.parcela_numero, 1);
  assert.equal(serialized.cliente_nome, 'Cliente Teste');
  assert.equal(serialized.created_at, '2026-08-11T11:59:00.000Z');
  assert.equal(serialized.updated_at, '2026-08-11T13:01:00.000Z');
  assert.equal(serialized.revisao_em, '2026-08-11T13:01:00.000Z');
});

test('usa a revisão do servidor mesmo quando o relógio offline do recebimento está adiantado', () => {
  const serialized = sanitizeReceiptLedgerEntry({
    id: 'recebimento-relogio-offline',
    venda_id: 'venda-1',
    caixa_id: 'caixa-1',
    tipo: 'parcela',
    parcela_numero: 1,
    valor_centavos: 50000,
    metodo_pagamento: 'pix',
    recebido_em: '2030-01-01T00:00:00.000Z',
    status: 'confirmado',
    createdAt: '2026-08-11T12:00:00.000Z',
    updatedAt: '2026-08-11T12:01:00.000Z',
  });

  assert.equal(serialized.recebido_em, '2030-01-01T00:00:00.000Z');
  assert.equal(serialized.revisao_em, '2026-08-11T12:01:00.000Z');
});

test('rejeita valor de recebimento fracionário ou fora do INTEGER antes de acessar o banco', async () => {
  const baseReceipt = {
    usuarioId: 1,
    saleId: 'venda-1',
    type: 'entrada',
    paymentMethod: 'pix',
  };

  await assert.rejects(
    registerReceipt({ ...baseReceipt, amountCents: 100.5 }),
    /deve ser positivo/i
  );
  await assert.rejects(
    registerReceipt({ ...baseReceipt, amountCents: 2147483648 }),
    /deve ser positivo/i
  );
});

test('ordena o ledger pela revisão do servidor e usa o relógio do negócio apenas como dado', async () => {
  const originalFindAll = RecebimentoVenda.findAll;
  let queryOptions = null;
  RecebimentoVenda.findAll = async options => {
    queryOptions = options;
    return [];
  };

  try {
    await listReceiptLedger({ usuarioId: 1, cashierIds: ['caixa-1'] });
  } finally {
    RecebimentoVenda.findAll = originalFindAll;
  }

  assert.deepEqual(queryOptions.order, [
    ['updated_at', 'ASC'],
    ['created_at', 'ASC'],
    ['id', 'ASC'],
  ]);
  assert.equal(queryOptions.order.flat().includes('recebido_em'), false);
});

test('rejeita atomicamente lote misto quando uma das parcelas já foi recebida', () => {
  const entries = [
    { number: 1, amountCents: 5000, paid: true, paidAt: '2026-08-11T12:00:00.000Z' },
    { number: 2, amountCents: 5000, paid: false, paidAt: null },
  ];
  const conflict = getInstallmentReceiptConflict(entries, [1, 2]);

  assert.deepEqual(conflict, {
    requestedNumbers: [1, 2],
    confirmedNumbers: [1],
  });
  assert.equal(getInstallmentReceiptConflict(entries, [2]), null);
  assert.throws(
    () => getInstallmentReceiptConflict(entries, [3]),
    /não encontrada/i
  );
});

test('persiste resultado terminal para que replay também concilie o PDV perdedor', () => {
  const outcome = buildReceiptConflictSyncOutcome({
    type: 'parcela',
    saleId: 'venda-1',
    rejectedInstallmentNumbers: [2, 1, 2],
    confirmedInstallmentNumbers: [1],
    canonicalReceipts: [{ id: 'recebimento-canonico' }],
    canonicalInstallmentSale: { id: 'venda-1' },
  });
  const storedPayload = storeSyncOutcomeInEventPayload({
    eventId: 'evento-1',
    __caixa_agil_sync_outcome: { code: 'FORJADO' },
  }, outcome);
  const replayed = getSyncOutcomeFromEventPayload(storedPayload);

  assert.equal(replayed.code, RECEIPT_ALREADY_CONFIRMED_CODE);
  assert.deepEqual(replayed.conciliacao_recebimento.parcelas_rejeitadas, [1, 2]);
  assert.equal(replayed.conciliacao_recebimento.recebimentos.length, 1);
  assert.equal(getSyncOutcomeFromEventPayload({
    __caixa_agil_sync_outcome: { code: RECEIPT_ALREADY_CONFIRMED_CODE },
  }), null);
});

test('serializa a operação financeira antes do find-then-create sem depender de erro unique', async () => {
  const originalQuery = RecebimentoVenda.sequelize.query;
  const originalFindOne = RecebimentoVenda.findOne;
  const originalCreate = RecebimentoVenda.create;
  const calls = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  RecebimentoVenda.sequelize.query = async (sql, options) => {
    calls.push({ kind: 'lock', sql, options });
    return [];
  };
  RecebimentoVenda.findOne = async () => {
    calls.push({ kind: 'find' });
    return null;
  };
  RecebimentoVenda.create = async values => {
    calls.push({ kind: 'create' });
    return values;
  };

  try {
    await registerReceipt({
      usuarioId: 7,
      saleId: 'venda-concorrente',
      type: 'parcela',
      installmentNumber: 1,
      installmentCount: 2,
      amountCents: 5000,
      paymentMethod: 'pix',
      idempotencyKey: 'tentativa-pdv-a',
      receivedAt: '2026-08-11T12:00:00.000Z',
    }, transaction);
  } finally {
    RecebimentoVenda.sequelize.query = originalQuery;
    RecebimentoVenda.findOne = originalFindOne;
    RecebimentoVenda.create = originalCreate;
  }

  assert.equal(calls[0].kind, 'lock');
  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.equal(calls[0].options.transaction, transaction);
  assert.equal(calls.filter(call => call.kind === 'create').length, 1);
});

for (const receiptCase of [
  { type: 'parcela', installmentNumber: 2, installmentCount: 3 },
  { type: 'convenio', installmentNumber: null, installmentCount: null },
]) {
  test(`retry tardio de ${receiptCase.type} cancelado não retorna ledger apto a confirmar o domínio`, async () => {
    const originalQuery = RecebimentoVenda.sequelize.query;
    const originalFindOne = RecebimentoVenda.findOne;
    const originalCreate = RecebimentoVenda.create;
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    let created = false;
    const values = {
      usuarioId: 7,
      pdvId: 8,
      cashierId: 'turno-1',
      saleId: `venda-${receiptCase.type}`,
      idempotencyKey: `evento-antigo-${receiptCase.type}`,
      type: receiptCase.type,
      installmentNumber: receiptCase.installmentNumber,
      installmentCount: receiptCase.installmentCount,
      amountCents: 5000,
      paymentMethod: 'pix',
      receivedAt: '2026-08-11T12:00:00.000Z',
      origin: 'pdv',
    };

    RecebimentoVenda.sequelize.query = async () => [];
    RecebimentoVenda.findOne = async () => ({
      usuario_id: 7,
      pdv_id: 8,
      caixa_id: 'turno-1',
      venda_id: values.saleId,
      chave_idempotencia: values.idempotencyKey,
      tipo: receiptCase.type,
      parcela_numero: receiptCase.installmentNumber,
      parcelas_total: receiptCase.installmentNumber === null ? null : receiptCase.installmentCount,
      valor_centavos: 5000,
      metodo_pagamento: 'pix',
      origem: 'pdv',
      status: 'cancelado',
    });
    RecebimentoVenda.create = async () => {
      created = true;
      return null;
    };

    try {
      await assert.rejects(
        registerReceipt(values, transaction),
        error => error.code === 'RECEIPT_IDEMPOTENCY_CANCELED' && /nova chave/i.test(error.message)
      );
    } finally {
      RecebimentoVenda.sequelize.query = originalQuery;
      RecebimentoVenda.findOne = originalFindOne;
      RecebimentoVenda.create = originalCreate;
    }

    assert.equal(created, false);
  });

  test(`nova baixa de ${receiptCase.type} após cancelamento exige outra chave e cria outro ledger`, async () => {
    const originalQuery = RecebimentoVenda.sequelize.query;
    const originalFindOne = RecebimentoVenda.findOne;
    const originalCreate = RecebimentoVenda.create;
    const transaction = { LOCK: { UPDATE: 'UPDATE' } };
    let findCount = 0;
    let createdValues = null;

    RecebimentoVenda.sequelize.query = async () => [];
    RecebimentoVenda.findOne = async () => {
      findCount += 1;
      return null;
    };
    RecebimentoVenda.create = async values => {
      createdValues = values;
      return values;
    };

    try {
      await registerReceipt({
        usuarioId: 7,
        pdvId: 8,
        cashierId: 'turno-2',
        saleId: `venda-${receiptCase.type}`,
        idempotencyKey: `evento-novo-${receiptCase.type}`,
        type: receiptCase.type,
        installmentNumber: receiptCase.installmentNumber,
        installmentCount: receiptCase.installmentCount,
        amountCents: 5000,
        paymentMethod: 'dinheiro',
        receivedAt: '2026-08-11T13:00:00.000Z',
        origin: 'pdv',
      }, transaction);
    } finally {
      RecebimentoVenda.sequelize.query = originalQuery;
      RecebimentoVenda.findOne = originalFindOne;
      RecebimentoVenda.create = originalCreate;
    }

    assert.equal(findCount, 2);
    assert.equal(createdValues.chave_idempotencia, `evento-novo-${receiptCase.type}`);
    assert.equal(createdValues.status, 'confirmado');
  });
}

test('chave repetida não pode ser reutilizada com valor ou forma de pagamento diferentes', async () => {
  const originalQuery = RecebimentoVenda.sequelize.query;
  const originalFindOne = RecebimentoVenda.findOne;
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  RecebimentoVenda.sequelize.query = async () => [];
  RecebimentoVenda.findOne = async () => ({
    usuario_id: 7,
    pdv_id: 8,
    caixa_id: 'turno-1',
    venda_id: 'venda-campos',
    tipo: 'parcela',
    parcela_numero: 1,
    parcelas_total: 2,
    valor_centavos: 4999,
    metodo_pagamento: 'dinheiro',
    origem: 'pdv',
    status: 'confirmado',
  });

  try {
    await assert.rejects(
      registerReceipt({
        usuarioId: 7,
        pdvId: 8,
        cashierId: 'turno-1',
        saleId: 'venda-campos',
        idempotencyKey: 'mesma-chave',
        type: 'parcela',
        installmentNumber: 1,
        installmentCount: 2,
        amountCents: 5000,
        paymentMethod: 'pix',
        receivedAt: '2026-08-11T12:00:00.000Z',
        origin: 'pdv',
      }, transaction),
      error => error.code === 'RECEIPT_IDEMPOTENCY_MISMATCH'
    );
  } finally {
    RecebimentoVenda.sequelize.query = originalQuery;
    RecebimentoVenda.findOne = originalFindOne;
  }
});
