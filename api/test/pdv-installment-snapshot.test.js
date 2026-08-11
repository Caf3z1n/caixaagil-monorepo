const assert = require('node:assert/strict');
const test = require('node:test');
const { __test } = require('../src/app/controllers/pdvController');
const {
  ClienteConvenio,
  DespesaCaixa,
  EventoPdv,
  RecebimentoVenda,
  Venda,
} = require('../src/app/models');

function makeSale(id, entries, overrides = {}) {
  return {
    id,
    situacao: 'paga',
    registrado_em: '2026-08-11T12:00:00.000Z',
    updated_at: '2026-08-11T13:00:00.000Z',
    caixa_id: 'caixa-1',
    metodo_pagamento: 'parcelamento',
    total_centavos: entries.reduce((total, entry) => total + entry.amountCents, 0),
    itens: [],
    parcelamento: {
      installmentCount: entries.length,
      originalTotalCents: entries.reduce((total, entry) => total + entry.amountCents, 0),
      adjustedTotalCents: entries.reduce((total, entry) => total + entry.amountCents, 0),
      entries,
    },
    ...overrides,
  };
}

test('reconcilia somente IDs locais explícitos, removendo duplicados e limitando o lote', () => {
  const source = [
    'venda-1',
    'venda-1',
    ...Array.from({ length: 501 }, (_, index) => `venda-${index + 2}`),
  ];
  const result = __test.normalizeLocalInstallmentSaleIds(source);

  assert.equal(result.ids.length, 500);
  assert.equal(result.ids[0], 'venda-1');
  assert.equal(result.truncated, true);
});

test('considera pendente somente venda não cancelada com parcela não recebida', () => {
  const pending = makeSale('venda-pendente', [
    { number: 1, dueDate: '2026-09-11', amountCents: 50000 },
  ]);
  const paid = makeSale('venda-quitada', [
    {
      number: 1,
      dueDate: '2026-09-11',
      amountCents: 50000,
      paid: true,
      paidAt: '2026-08-11T12:30:00.000Z',
    },
  ]);
  const canceled = makeSale('venda-cancelada', pending.parcelamento.entries, {
    situacao: 'cancelada',
  });

  assert.equal(__test.hasOutstandingInstallment(pending), true);
  assert.equal(__test.hasOutstandingInstallment(paid), false);
  assert.equal(__test.hasOutstandingInstallment(canceled), false);
});

test('tombstones preservam o estado final para quitação/cancelamento e explicitam ausência', () => {
  const paid = makeSale('venda-quitada', [
    {
      number: 1,
      dueDate: '2026-09-11',
      amountCents: 50000,
      paid: true,
      paidAt: '2026-08-11T12:30:00.000Z',
      paymentMethod: 'pix',
    },
  ]);
  const canceled = makeSale('venda-cancelada', [
    { number: 1, dueDate: '2026-09-11', amountCents: 50000 },
  ], { situacao: 'cancelada' });
  const tombstones = __test.buildInstallmentTombstones(
    ['venda-quitada', 'venda-cancelada', 'venda-ausente', 'venda-ativa'],
    [paid, canceled],
    new Set(['venda-ativa'])
  );

  assert.deepEqual(tombstones.map(item => item.motivo), ['quitada', 'cancelada', 'ausente']);
  assert.equal(tombstones[0].venda.installmentPlan.entries[0].paid, true);
  assert.equal(tombstones[1].venda.status, 'canceled');
  assert.equal(tombstones[2].venda, undefined);
  assert.equal(tombstones.some(item => item.id === 'venda-ativa'), false);
});

test('mantém cliente inativo referenciado por dívida pendente no snapshot de recebíveis', () => {
  const pendingInstallment = makeSale('venda-cliente-inativo', [
    { number: 1, dueDate: '2026-09-11', amountCents: 50000 },
  ], { cliente_convenio_id: 42 });
  const paidInstallment = makeSale('venda-cliente-inativo-quitada', [
    {
      number: 1,
      dueDate: '2026-09-11',
      amountCents: 50000,
      paid: true,
      paidAt: '2026-08-11T12:30:00.000Z',
    },
  ], { cliente_convenio_id: 42 });
  const pendingAgreement = {
    cliente_convenio_id: 43,
    metodo_pagamento: 'convenio',
    situacao: 'convenio',
    status_convenio: 'pendente',
  };

  assert.equal(__test.isPendingCustomerDebt(pendingInstallment), true);
  assert.equal(__test.isPendingCustomerDebt(pendingAgreement), true);
  assert.equal(__test.isPendingCustomerDebt(paidInstallment), false);
  assert.equal(__test.isPendingCustomerDebt({ ...pendingAgreement, situacao: 'cancelada' }), false);
});

test('distingue conflito terminal de recebimento de uma falha que precisa de retry', () => {
  assert.equal(__test.isTerminalReceiptConflictResult({
    status: 'erro',
    code: 'RECEIPT_ALREADY_CONFIRMED',
    conciliacao_recebimento: { venda_id: 'venda-1' },
  }), true);
  assert.equal(__test.isTerminalReceiptConflictResult({
    status: 'erro',
    code: 'SUBSCRIPTION_BLOCKED',
  }), false);
});

test('snapshot entrega cliente inativo somente para quitar sua dívida histórica', async () => {
  const originalVendaFindAll = Venda.findAll;
  const originalClienteFindAll = ClienteConvenio.findAll;
  let vendaQueryCount = 0;

  Venda.findAll = async () => {
    vendaQueryCount += 1;

    if (vendaQueryCount === 1) {
      return [makeSale('venda-inativa-pendente', [
        { number: 1, dueDate: '2026-09-11', amountCents: 50000 },
      ], { cliente_convenio_id: 42 })];
    }

    return [{
      id: 'convenio-inativo-pendente',
      codigo: 'CV-42',
      titulo: 'Venda em convênio',
      cliente_convenio_id: 42,
      nome_cliente: 'Cliente inativo',
      quantidade_itens: 1,
      itens: [],
      total_centavos: 50000,
      status_convenio: 'pendente',
      registrado_em: '2026-08-11T12:00:00.000Z',
    }];
  };
  ClienteConvenio.findAll = async () => [{
    id: 42,
    nome: 'Cliente inativo',
    tipo_pessoa: 'fisica',
    ativo: false,
    permite_pagamento_frente_caixa: false,
  }];

  try {
    const snapshot = await __test.loadDesktopConvenioSnapshot(7);

    assert.equal(snapshot.clientes_convenio.length, 1);
    assert.equal(snapshot.clientes_convenio[0].ativo, false);
    assert.equal(snapshot.recebimentos_convenio.length, 1);
    assert.equal(snapshot.recebimentos_convenio[0].cliente_convenio_id, 42);
  } finally {
    Venda.findAll = originalVendaFindAll;
    ClienteConvenio.findAll = originalClienteFindAll;
  }
});

test('reabertura mantém banco autoritativo e não ressuscita recebimento perdedor do fechamento', async () => {
  const originalEventoFindOne = EventoPdv.findOne;
  const originalVendaFindAll = Venda.findAll;
  const originalDespesaFindAll = DespesaCaixa.findAll;
  const originalRecebimentoFindAll = RecebimentoVenda.findAll;
  const canonicalInstallment = makeSale('venda-concorrente', [
    {
      number: 1,
      dueDate: '2026-09-11',
      amountCents: 50000,
      paid: true,
      paidAt: '2026-08-11T12:00:00.000Z',
      paymentMethod: 'pix',
      receivedSessionId: 'turno-pdv-a',
    },
  ], {
    usuario_id: 7,
    pdv_id: 8,
    caixa_id: 'turno-origem',
  });
  const canonicalAgreement = {
    id: 'convenio-concorrente',
    usuario_id: 7,
    pdv_id: 8,
    caixa_id: 'turno-origem',
    codigo: 'CV-1',
    titulo: 'Venda em convênio',
    cliente_convenio_id: 42,
    nome_cliente: 'Cliente canônico',
    quantidade_itens: 1,
    itens: [],
    total_centavos: 75000,
    metodo_pagamento: 'convenio',
    status_convenio: 'pago',
    metodo_pagamento_recebimento: 'dinheiro',
    caixa_recebimento_id: 'turno-pdv-a',
    recebido_em: '2026-08-11T12:05:00.000Z',
    registrado_em: '2026-08-10T12:00:00.000Z',
    situacao: 'convenio',
  };
  let vendaQueryCount = 0;

  EventoPdv.findOne = async () => ({
    payload: {
      sales: [
        {
          id: 'venda-concorrente',
          sessionId: 'turno-pdv-b',
          paymentMethod: 'parcelamento',
          installmentPlan: {
            entries: [{
              number: 1,
              paid: true,
              paidAt: '2030-01-01T00:00:00.000Z',
              paymentMethod: 'cartao',
              receivedSessionId: 'turno-pdv-b',
            }],
          },
        },
        {
          id: 'venda-historica-sem-registro',
          sessionId: 'turno-pdv-b',
          paymentMethod: 'dinheiro',
          totalCents: 1000,
          items: [],
          createdAt: '2026-08-11T10:00:00.000Z',
        },
      ],
      agreementReceipts: [{
        id: 'convenio-concorrente',
        status: 'pago',
        paymentMethod: 'cartao',
        receivedSessionId: 'turno-pdv-b',
        receivedAt: '2030-01-01T00:00:00.000Z',
      }],
      expenses: [
        { id: 'despesa-1', amountCents: 99999 },
        { id: 'despesa-historica', amountCents: 500 },
      ],
    },
  });
  Venda.findAll = async () => {
    vendaQueryCount += 1;
    return vendaQueryCount === 1 ? [] : [canonicalInstallment, canonicalAgreement];
  };
  DespesaCaixa.findAll = async () => [{
    id: 'despesa-1',
    descricao: 'Despesa canônica',
    valor_centavos: 2500,
    registrado_em: '2026-08-11T11:00:00.000Z',
    caixa_id: 'turno-pdv-b',
  }];
  RecebimentoVenda.findAll = async () => [{
    id: 'recebimento-entrada-outro-caixa',
    chave_idempotencia: 'entrada-outro-caixa',
    venda_id: 'venda-entrada-origem-externa',
    usuario_id: 7,
    pdv_id: 9,
    caixa_id: 'turno-pdv-b',
    tipo: 'entrada',
    cliente_nome: 'Cliente entrada',
    valor_centavos: 1000,
    metodo_pagamento: 'dinheiro',
    recebido_em: '2026-08-11T12:10:00.000Z',
    status: 'confirmado',
    created_at: '2026-08-11T12:10:00.000Z',
    updated_at: '2026-08-11T12:10:00.000Z',
  }];

  try {
    const snapshot = await __test.loadReopenedCashierSnapshot(
      { id: 9, usuario_id: 7 },
      { id: 'turno-pdv-b' },
      { LOCK: { SHARE: 'SHARE' } }
    );
    const installment = snapshot.vendas.find(sale => sale.id === 'venda-concorrente');
    const agreement = snapshot.recebimentos_convenio.find(receipt => receipt.id === 'convenio-concorrente');

    assert.equal(installment.installmentPlan.entries[0].receivedSessionId, 'turno-pdv-a');
    assert.equal(snapshot.vendas.some(sale => sale.id === 'venda-historica-sem-registro'), true);
    assert.equal(snapshot.vendas.some(sale => sale.id === 'convenio-concorrente'), false);
    assert.equal(snapshot.vendas.some(sale => sale.id === 'venda-entrada-origem-externa'), false);
    assert.equal(new Set(snapshot.vendas.map(sale => sale.id)).size, snapshot.vendas.length);
    assert.equal(agreement.caixa_recebimento_id, 'turno-pdv-a');
    assert.equal(agreement.metodo_pagamento_recebimento, 'dinheiro');
    assert.equal(snapshot.recebimentos.length, 1);
    assert.equal(snapshot.recebimentos[0].tipo, 'entrada');
    assert.equal(snapshot.recebimentos[0].venda_id, 'venda-entrada-origem-externa');
    assert.equal(snapshot.despesas.find(expense => expense.id === 'despesa-1').amountCents, 2500);
    assert.equal(snapshot.despesas.some(expense => expense.id === 'despesa-historica'), true);
  } finally {
    EventoPdv.findOne = originalEventoFindOne;
    Venda.findAll = originalVendaFindAll;
    DespesaCaixa.findAll = originalDespesaFindAll;
    RecebimentoVenda.findAll = originalRecebimentoFindAll;
  }
});
