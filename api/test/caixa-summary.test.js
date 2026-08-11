const assert = require('node:assert/strict');
const test = require('node:test');
const { __test } = require('../src/app/controllers/caixaController');

function makeSession(id = 'caixa-2') {
  return {
    id,
    data_operacao_chave: '2026-08-11',
    data_operacao_rotulo: '11/08/2026',
    numero_turno: 2,
    situacao: 'fechado',
    aberto_em: '2026-08-11T12:00:00.000Z',
    fechado_em: '2026-08-11T18:00:00.000Z',
  };
}

test('fallback legado soma só a parcela recebida no turno e ignora baixa automática', () => {
  const sale = {
    id: 'venda-legada',
    caixa_id: 'caixa-1',
    caixa_recebimento_id: 'caixa-2',
    situacao: 'paga',
    situacao_recebimento: 'pendente',
    metodo_pagamento: 'parcelamento',
    total_centavos: 150000,
    desconto_pagamento_centavos: 0,
    quantidade_itens: 1,
    itens: [],
    parcelamento: {
      installmentCount: 3,
      originalTotalCents: 150000,
      adjustedTotalCents: 150000,
      entries: [
        {
          number: 1,
          dueDate: '2026-07-11',
          amountCents: 50000,
          paid: true,
          paymentMethod: 'parcelamento',
          receivedSessionId: 'caixa-1',
        },
        {
          number: 2,
          dueDate: '2026-08-11',
          amountCents: 50000,
          paid: true,
          paymentMethod: 'pix',
          receivedSessionId: 'caixa-2',
        },
        {
          number: 3,
          dueDate: '2026-09-11',
          amountCents: 50000,
        },
      ],
    },
  };

  const summary = __test.buildSessionSummary(makeSession(), [sale], [], null, []);

  assert.equal(summary.totais_esperados.pix, 50000);
  assert.equal(summary.totais_esperados.parcelamento, 0);
  assert.equal(summary.resumo.total_esperado_centavos, 50000);
});

test('ledger contabiliza somente recebimentos confirmados, sem duplicar a venda', () => {
  const sale = {
    id: 'venda-v2',
    caixa_id: 'caixa-2',
    caixa_recebimento_id: null,
    situacao: 'paga',
    situacao_recebimento: 'pendente',
    metodo_pagamento: 'parcelamento',
    total_centavos: 150000,
    desconto_pagamento_centavos: 0,
    quantidade_itens: 1,
    itens: [],
    parcelamento: {
      schemaVersion: 2,
      installmentCount: 1,
      firstDueDate: '2026-09-11',
      adjustmentKind: 'none',
      adjustmentCents: 0,
      originalTotalCents: 150000,
      adjustedTotalCents: 150000,
      downPaymentCents: 100000,
      downPaymentMethod: 'dinheiro',
      financedBalanceCents: 50000,
      entries: [{ number: 1, dueDate: '2026-09-11', amountCents: 50000 }],
    },
  };
  const receipts = [
    {
      venda_id: sale.id,
      caixa_id: 'caixa-2',
      status: 'confirmado',
      tipo: 'entrada',
      metodo_pagamento: 'dinheiro',
      valor_centavos: 100000,
    },
    {
      venda_id: sale.id,
      caixa_id: 'caixa-2',
      status: 'cancelado',
      tipo: 'parcela',
      metodo_pagamento: 'pix',
      valor_centavos: 50000,
    },
  ];

  const summary = __test.buildSessionSummary(makeSession(), [sale], [], null, receipts);

  assert.equal(summary.totais_esperados.dinheiro, 100000);
  assert.equal(summary.totais_esperados.pix, 0);
  assert.equal(summary.totais_esperados.parcelamento, 0);
  assert.equal(summary.resumo.total_recebimentos_centavos, 100000);
});

test('transição soma fallback legado e ledger sem suprimir parcelas distintas', () => {
  const sale = {
    id: 'venda-transicao',
    caixa_id: 'caixa-1',
    caixa_recebimento_id: 'caixa-2',
    situacao: 'paga',
    situacao_recebimento: 'pendente',
    metodo_pagamento: 'parcelamento',
    total_centavos: 90000,
    desconto_pagamento_centavos: 0,
    quantidade_itens: 1,
    itens: [],
    parcelamento: {
      installmentCount: 3,
      originalTotalCents: 90000,
      adjustedTotalCents: 90000,
      entries: [
        { number: 1, dueDate: '2026-07-11', amountCents: 30000 },
        {
          number: 2,
          dueDate: '2026-08-11',
          amountCents: 30000,
          paid: true,
          paymentMethod: 'dinheiro',
          receivedSessionId: 'caixa-2',
        },
        {
          number: 3,
          dueDate: '2026-09-11',
          amountCents: 30000,
          paid: true,
          paymentMethod: 'pix',
          receivedSessionId: 'caixa-2',
        },
      ],
    },
  };
  const receipts = [{
    venda_id: sale.id,
    caixa_id: 'caixa-2',
    status: 'confirmado',
    tipo: 'parcela',
    parcela_numero: 3,
    metodo_pagamento: 'pix',
    valor_centavos: 30000,
  }];

  const summary = __test.buildSessionSummary(makeSession(), [sale], [], null, receipts);

  assert.equal(summary.totais_esperados.dinheiro, 30000);
  assert.equal(summary.totais_esperados.pix, 30000);
  assert.equal(summary.resumo.total_esperado_centavos, 60000);
  assert.equal(summary.resumo.total_recebimentos_centavos, 30000);
});

test('consulta de turnos limita o JSONB às sessões recebidas sem interpolação insegura', () => {
  const condition = __test.buildInstallmentReceivedInSessionsCondition([
    'caixa-1',
    "caixa-'2",
    'caixa-1',
  ]);

  assert.match(condition.val, /receivedSessionId/);
  assert.match(condition.val, /caixa-1/);
  assert.match(condition.val, /caixa-''2/);
  assert.doesNotMatch(condition.val, /parcelamento" IS NOT NULL/);
});
