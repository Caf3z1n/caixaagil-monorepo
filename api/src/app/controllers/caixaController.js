const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const {
  ConferenciaCaixa,
  DespesaCaixa,
  Caixa,
  Arquivo,
  CategoriaProduto,
  Produto,
  Venda,
} = require('../models');

const comparablePaymentKeys = ['dinheiro', 'cartao', 'pix', 'parcelamento'];
const paymentKeys = [...comparablePaymentKeys, 'convenio'];

const paymentLabels = {
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
  pix: 'Pix',
  parcelamento: 'Parcelamento',
  convenio: 'Convênio',
};

function createId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function getPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizeText(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || fallback;
}

function sanitizeCents(value) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function parsePositiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function sanitizeArquivoResumo(arquivo) {
  if (!arquivo) {
    return null;
  }

  const data = arquivo.get ? arquivo.get({ plain: true }) : arquivo;

  return {
    id: data.id,
    nome_original: data.nome_original,
    mime_type: data.mime_type,
    tipo: data.tipo,
    tamanho_bytes: Number(data.tamanho_bytes || 0),
    url: data.visibilidade === 'publico' ? `/arquivos/publicos/${data.id}` : data.url || null,
  };
}

function sanitizeCategoriaVisual(categoria) {
  if (!categoria) {
    return null;
  }

  const data = categoria.get ? categoria.get({ plain: true }) : categoria;

  return {
    id: data.id ?? null,
    nome: normalizeText(data.nome, 'Produto'),
    icone: normalizeText(data.icone, 'package'),
    cor: normalizeText(data.cor, 'laranja'),
  };
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function buildSessionLabel(session) {
  return `${session.data_operacao_rotulo} · Turno ${session.numero_turno}`;
}

function mapSession(record) {
  const session = getPlain(record);

  return {
    id: session.id,
    data_operacao_chave: session.data_operacao_chave,
    data_operacao_rotulo: session.data_operacao_rotulo,
    numero_turno: Number(session.numero_turno || 0),
    rotulo: buildSessionLabel(session),
    aberto_em: toIso(session.aberto_em),
    fechado_em: toIso(session.fechado_em),
    situacao: normalizeKey(session.situacao) === 'closed' ? 'fechado' : session.situacao,
    funcionario_abertura_id: session.funcionario_abertura_id || null,
    funcionario_abertura_nome: session.funcionario_abertura_nome || null,
    funcionario_fechamento_id: session.funcionario_fechamento_id || null,
    funcionario_fechamento_nome: session.funcionario_fechamento_nome || null,
  };
}

function mapExpense(record) {
  const expense = getPlain(record);

  return {
    id: expense.id,
    descricao: expense.descricao,
    valor_centavos: sanitizeCents(expense.valor_centavos),
    registrado_em: toIso(expense.registrado_em),
  };
}

function buildEmptyTotals() {
  return {
    dinheiro: 0,
    cartao: 0,
    pix: 0,
    parcelamento: 0,
    convenio: 0,
  };
}

function buildEmptyCounts() {
  return {
    dinheiro: 0,
    cartao: 0,
    pix: 0,
    parcelamento: 0,
    convenio: 0,
  };
}

function resolvePaymentMethod(value) {
  const normalized = normalizeKey(value);

  if (normalized === 'dinheiro' || normalized === 'cash') {
    return 'dinheiro';
  }

  if (normalized === 'cartao' || normalized === 'card' || normalized === 'credito' || normalized === 'debito') {
    return 'cartao';
  }

  if (normalized === 'pix') {
    return 'pix';
  }

  if (normalized === 'parcelamento' || normalized === 'parcelado' || normalized === 'installment') {
    return 'parcelamento';
  }

  return null;
}

function isCancelledSale(sale) {
  const status = normalizeKey(sale.situacao);

  return status === 'cancelada' || status === 'cancelled' || status === 'canceled';
}

function isConvenioSale(sale) {
  const status = normalizeKey(sale.situacao);
  const receiptStatus = normalizeKey(sale.situacao_recebimento);

  return (
    status === 'convenio' ||
    status === 'fiado' ||
    (receiptStatus !== '' && receiptStatus !== 'none' && receiptStatus !== 'nenhum')
  );
}

function isReceiptReceivedInCashier(sale) {
  const receiptStatus = normalizeKey(sale.situacao_recebimento);

  return (
    receiptStatus === 'cashier_received' ||
    receiptStatus === 'recebido_caixa' ||
    receiptStatus === 'completed' ||
    receiptStatus === 'concluido'
  );
}

function resolveOriginalSalePaymentKey(sale) {
  if (isConvenioSale(sale)) {
    return 'convenio';
  }

  return resolvePaymentMethod(sale.metodo_pagamento);
}

function resolveReceiptPaymentKey(sale) {
  if (!isReceiptReceivedInCashier(sale)) {
    return null;
  }

  return resolvePaymentMethod(sale.metodo_pagamento_recebimento);
}

function resolveSaleDiscountCents(sale) {
  return Math.min(
    sanitizeCents(sale.desconto_pagamento_centavos),
    sanitizeCents(sale.total_centavos)
  );
}

function resolveSaleExpectedCents(sale, paymentKey) {
  if (paymentKey === 'convenio' || paymentKey === 'parcelamento') {
    return sanitizeCents(sale.total_centavos);
  }

  return Math.max(sanitizeCents(sale.total_centavos) - resolveSaleDiscountCents(sale), 0);
}

function resolveDifferenceStatus(expectedCents, confirmedCents) {
  if (confirmedCents === expectedCents) {
    return 'batido';
  }

  return confirmedCents < expectedCents ? 'faltando' : 'sobrando';
}

function resolveOverallStatus(paymentSummaries) {
  const statuses = paymentSummaries
    .filter(summary => summary.chave !== 'convenio')
    .map(summary => summary.status)
    .filter(Boolean);

  if (statuses.every(status => status === 'batido')) {
    return 'batido';
  }

  const hasMissing = statuses.includes('faltando');
  const hasOver = statuses.includes('sobrando');

  if (hasMissing && hasOver) {
    return 'misto';
  }

  return hasMissing ? 'faltando' : 'sobrando';
}

function mapConferenceTotals(record) {
  if (!record) {
    return null;
  }

  const conference = getPlain(record);

  return {
    dinheiro: sanitizeCents(conference.dinheiro_confirmado_centavos),
    cartao: sanitizeCents(conference.cartao_confirmado_centavos),
    pix: sanitizeCents(conference.pix_confirmado_centavos),
    parcelamento: sanitizeCents(conference.parcelamento_confirmado_centavos),
    convenio: sanitizeCents(conference.convenio_confirmado_centavos),
  };
}

function isActiveConference(record) {
  return Boolean(record && getPlain(record).ativo);
}

function getSaleItemsCount(sale) {
  const storedCount = Number(sale.quantidade_itens || 0);

  if (Number.isFinite(storedCount) && storedCount > 0) {
    return storedCount;
  }

  if (!Array.isArray(sale.itens)) {
    return 0;
  }

  return sale.itens.reduce((total, item) => total + Number(item.quantidade || item.quantity || 0), 0);
}

function normalizeItemImageUrl(item) {
  return normalizeText(item?.imagem_url || item?.imageUrl || item?.image_url, '');
}

function normalizeItemCategoryVisual(item, product) {
  const productCategory = sanitizeCategoriaVisual(product?.categoria);

  if (productCategory) {
    return productCategory;
  }

  const source = item?.categoria_visual || item?.categoryVisual || {};
  const name = normalizeText(
    source.nome || source.name || item?.categoria || item?.category,
    'Produto'
  );

  return {
    id: parsePositiveInteger(source.id),
    nome: name,
    icone: normalizeText(source.icone || source.icon || item?.categoria_icone || item?.categoryIcon, 'package'),
    cor: normalizeText(source.cor || source.color || item?.categoria_cor || item?.categoryColor, 'laranja'),
    accent: normalizeText(source.accent || item?.categoria_accent || item?.categoryAccent, ''),
  };
}

function mapSaleItem(item, index, productById = new Map()) {
  const productId = parsePositiveInteger(item?.produto_id ?? item?.productId ?? item?.id);
  const product = productId ? productById.get(productId) : null;
  const quantity = Number(item?.quantidade ?? item?.quantity ?? 0);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  const unitPriceCents = sanitizeCents(
    item?.preco_unitario_centavos ?? item?.priceCents ?? item?.preco_venda_centavos
  );
  const totalCents = sanitizeCents(
    item?.total_centavos ?? (unitPriceCents * safeQuantity)
  );

  return {
    id: item?.id ? String(item.id) : `item-${index + 1}`,
    produto_id: productId,
    nome: normalizeText(item?.nome || item?.name || product?.nome, 'Produto'),
    categoria: normalizeText(item?.categoria || item?.category || product?.categoria?.nome, 'Produto'),
    categoria_visual: normalizeItemCategoryVisual(item, product),
    imagem: sanitizeArquivoResumo(product?.imagem || item?.imagem || item?.image),
    imagem_url: normalizeItemImageUrl(item) || null,
    quantidade: safeQuantity,
    preco_unitario_centavos: unitPriceCents,
    total_centavos: totalCents,
  };
}

function mapSaleItems(sale, productById = new Map()) {
  if (!Array.isArray(sale.itens)) {
    return [];
  }

  return sale.itens.map((item, index) => mapSaleItem(item, index, productById));
}

function collectSaleProductIds(saleRecords) {
  const ids = new Set();

  saleRecords.forEach(record => {
    const sale = getPlain(record);
    const items = Array.isArray(sale.itens) ? sale.itens : [];

    items.forEach(item => {
      const productId = parsePositiveInteger(item?.produto_id ?? item?.productId ?? item?.id);

      if (productId) {
        ids.add(productId);
      }
    });
  });

  return [...ids];
}

function buildSessionSummary(sessionRecord, saleRecords, expenseRecords, conferenceRecord) {
  const session = getPlain(sessionRecord);
  const expectedTotals = buildEmptyTotals();
  const salesTotals = buildEmptyTotals();
  const receiptTotals = buildEmptyTotals();
  const discountTotals = buildEmptyTotals();
  const expenseTotals = buildEmptyTotals();
  const saleCounts = buildEmptyCounts();
  const receiptCounts = buildEmptyCounts();
  let itemsCount = 0;
  let movementCount = 0;

  saleRecords.forEach(record => {
    const sale = getPlain(record);

    if (sale.caixa_id === session.id) {
      const paymentKey = resolveOriginalSalePaymentKey(sale);
      movementCount += 1;
      itemsCount += getSaleItemsCount(sale);

      if (paymentKey) {
        const expectedCents = resolveSaleExpectedCents(sale, paymentKey);
        const discountCents = paymentKey === 'convenio' ? 0 : resolveSaleDiscountCents(sale);

        expectedTotals[paymentKey] += expectedCents;
        salesTotals[paymentKey] += expectedCents;
        discountTotals[paymentKey] += discountCents;
        saleCounts[paymentKey] += 1;
      }
    }

    if (sale.caixa_recebimento_id === session.id) {
      const paymentKey = resolveReceiptPaymentKey(sale);
      movementCount += 1;

      if (paymentKey) {
        const totalCents = sanitizeCents(sale.total_centavos);
        expectedTotals[paymentKey] += totalCents;
        receiptTotals[paymentKey] += totalCents;
        receiptCounts[paymentKey] += 1;
      }
    }
  });

  const totalCashExpenseCents = expenseRecords.reduce(
    (total, record) => total + sanitizeCents(getPlain(record).valor_centavos),
    0
  );

  if (totalCashExpenseCents > 0) {
    expenseTotals.dinheiro = totalCashExpenseCents;
    expectedTotals.dinheiro = Math.max(expectedTotals.dinheiro - totalCashExpenseCents, 0);
  }

  const conferenceIsActive = isActiveConference(conferenceRecord);
  const confirmedTotals = mapConferenceTotals(conferenceRecord);
  const paymentSummaries = paymentKeys.map(paymentKey => {
    const confirmedCents = paymentKey === 'convenio'
      ? null
      : confirmedTotals?.[paymentKey] ?? null;
    const expectedCents = expectedTotals[paymentKey];
    const differenceCents = confirmedCents === null ? null : confirmedCents - expectedCents;

    return {
      chave: paymentKey,
      rotulo: paymentLabels[paymentKey],
      vendas_count: saleCounts[paymentKey],
      recebimentos_count: receiptCounts[paymentKey],
      vendas_esperado_centavos: salesTotals[paymentKey],
      recebimentos_esperado_centavos: receiptTotals[paymentKey],
      descontos_centavos: discountTotals[paymentKey],
      despesas_centavos: expenseTotals[paymentKey],
      esperado_centavos: expectedCents,
      confirmado_centavos: confirmedCents,
      diferenca_centavos: differenceCents,
      status: confirmedCents === null ? null : resolveDifferenceStatus(expectedCents, confirmedCents),
    };
  });
  const totalExpectedCents = comparablePaymentKeys.reduce(
    (total, paymentKey) => total + expectedTotals[paymentKey],
    0
  );
  const totalDiscountCents = comparablePaymentKeys.reduce(
    (total, paymentKey) => total + discountTotals[paymentKey],
    0
  );
  const totalConfirmedCents = confirmedTotals
    ? comparablePaymentKeys.reduce((total, paymentKey) => total + confirmedTotals[paymentKey], 0)
    : null;

  return {
    resumo: {
      sessao: mapSession(sessionRecord),
      status_conferencia: conferenceIsActive ? 'conferido' : 'fechado',
      revisado_em: conferenceRecord ? toIso(getPlain(conferenceRecord).revisado_em) : null,
      vendas_count: movementCount,
      despesas_count: expenseRecords.length,
      itens_count: itemsCount,
      total_esperado_centavos: totalExpectedCents,
      total_descontos_centavos: totalDiscountCents,
      total_despesas_centavos: totalCashExpenseCents,
      total_confirmado_centavos: totalConfirmedCents,
      diferenca_total_centavos: totalConfirmedCents === null ? null : totalConfirmedCents - totalExpectedCents,
      status_geral: conferenceIsActive ? resolveOverallStatus(paymentSummaries) : null,
      formas_pagamento: paymentSummaries,
    },
    totais_esperados: expectedTotals,
    totais_confirmados: confirmedTotals,
  };
}

function resolveSaleUiStatus(sale, movementKind) {
  if (isCancelledSale(sale)) {
    return 'cancelada';
  }

  if (movementKind === 'recebimento_convenio') {
    return 'recebido_caixa';
  }

  if (isConvenioSale(sale)) {
    return 'convenio';
  }

  return 'paga';
}

function mapSale(record, movementKind, productById = new Map()) {
  const sale = getPlain(record);
  const paymentMethod = resolvePaymentMethod(sale.metodo_pagamento);
  const receiptPaymentMethod = resolvePaymentMethod(sale.metodo_pagamento_recebimento);
  const recordedAt = movementKind === 'recebimento_convenio'
    ? sale.recebido_em || sale.registrado_em
    : sale.registrado_em;

  return {
    id: sale.id,
    tipo_movimento: movementKind,
    titulo: movementKind === 'recebimento_convenio'
      ? sale.nome_cliente || 'Recebimento de Convênio'
      : sale.titulo,
    convenio_id: sale.convenio_id || null,
    nome_cliente: sale.nome_cliente || null,
    nome_consumidor: sale.nome_consumidor || null,
    documento_consumidor: sale.documento_consumidor || null,
    rotulo_origem: sale.rotulo_origem,
    canal: sale.canal,
    itens: mapSaleItems(sale, productById),
    itens_count: getSaleItemsCount(sale),
    total_centavos: sanitizeCents(sale.total_centavos),
    desconto_pagamento_centavos: resolveSaleDiscountCents(sale),
    registrado_em: toIso(recordedAt),
    observacao: normalizeText(sale.observacao, 'Sem observação operacional.'),
    situacao: resolveSaleUiStatus(sale, movementKind),
    metodo_pagamento: paymentMethod,
    metodo_pagamento_recebimento: receiptPaymentMethod,
    parcelamento: sale.parcelamento || null,
    caixa_recebimento_id: sale.caixa_recebimento_id || null,
    recebido_em: toIso(sale.recebido_em),
  };
}

async function resolveClosedSession(usuarioId, sessionId) {
  const sessao = await Caixa.findOne({
    where: {
      id: sessionId,
      usuario_id: usuarioId,
      situacao: {
        [Op.in]: ['fechado', 'closed'],
      },
    },
  });

  if (!sessao) {
    const error = new Error('Caixa fechado não encontrado para conferência.');
    error.statusCode = 404;
    throw error;
  }

  return sessao;
}

async function loadSessionDetails(usuarioId, sessionId) {
  const sessao = await resolveClosedSession(usuarioId, sessionId);
  const [conferencia, vendas, despesas] = await Promise.all([
    ConferenciaCaixa.findOne({
      where: {
        usuario_id: usuarioId,
        caixa_id: sessao.id,
      },
    }),
    Venda.findAll({
      where: {
        usuario_id: usuarioId,
        situacao: {
          [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
        },
        [Op.or]: [
          { caixa_id: sessao.id },
          { caixa_recebimento_id: sessao.id },
        ],
      },
      order: [
        ['registrado_em', 'DESC'],
        ['created_at', 'DESC'],
      ],
    }),
    DespesaCaixa.findAll({
      where: {
        usuario_id: usuarioId,
        caixa_id: sessao.id,
      },
      order: [
        ['registrado_em', 'DESC'],
        ['created_at', 'DESC'],
      ],
    }),
  ]);
  const productIds = collectSaleProductIds(vendas);
  const products = productIds.length > 0
    ? await Produto.findAll({
        where: {
          id: {
            [Op.in]: productIds,
          },
          usuario_id: usuarioId,
        },
        include: [
          { model: CategoriaProduto, as: 'categoria', required: false },
          { model: Arquivo, as: 'imagem', required: false },
        ],
      })
    : [];
  const productById = new Map(products.map(product => {
    const data = getPlain(product);
    return [data.id, data];
  }));
  const { resumo, totais_esperados, totais_confirmados } = buildSessionSummary(
    sessao,
    vendas,
    despesas,
    conferencia
  );
  const vendasMapeadas = vendas
    .flatMap(record => {
      const sale = getPlain(record);
      const mapped = [];

      if (sale.caixa_id === sessao.id) {
        mapped.push(mapSale(record, 'venda', productById));
      }

      if (sale.caixa_recebimento_id === sessao.id) {
        mapped.push(mapSale(record, 'recebimento_convenio', productById));
      }

      return mapped;
    })
    .sort((left, right) => new Date(right.registrado_em || 0).getTime() - new Date(left.registrado_em || 0).getTime());

  return {
    resumo,
    vendas: vendasMapeadas,
    despesas_caixa: despesas.map(mapExpense),
    totais_esperados,
    totais_confirmados,
  };
}

function parseConfirmedTotals(body) {
  const source = body?.totais_confirmados || body?.confirmedTotals || {};

  return {
    dinheiro: sanitizeCents(source.dinheiro),
    cartao: sanitizeCents(source.cartao),
    pix: sanitizeCents(source.pix),
    convenio: sanitizeCents(source.convenio),
  };
}

function handleCaixaError(res, error, fallbackMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'Já existe uma conferência para este caixa.' });
  }

  return res.status(500).json({
    message: fallbackMessage,
    detail: error.message,
  });
}

module.exports = {
  async conferenceSnapshot(req, res) {
    try {
      const sessoes = await Caixa.findAll({
        where: {
          usuario_id: req.user.id,
          situacao: {
            [Op.in]: ['fechado', 'closed'],
          },
        },
        order: [
          ['fechado_em', 'DESC'],
          ['updated_at', 'DESC'],
        ],
      });

      if (sessoes.length === 0) {
        return res.json({
          gerado_em: new Date().toISOString(),
          pendentes: [],
          conferidos: [],
        });
      }

      const sessionIds = sessoes.map(sessao => sessao.id);
      const [conferencias, vendas, despesas] = await Promise.all([
        ConferenciaCaixa.findAll({
          where: {
            usuario_id: req.user.id,
            caixa_id: {
              [Op.in]: sessionIds,
            },
          },
        }),
        Venda.findAll({
          where: {
            usuario_id: req.user.id,
            situacao: {
              [Op.notIn]: ['cancelada', 'cancelled', 'canceled'],
            },
            [Op.or]: [
              { caixa_id: { [Op.in]: sessionIds } },
              { caixa_recebimento_id: { [Op.in]: sessionIds } },
            ],
          },
          order: [
            ['registrado_em', 'DESC'],
            ['created_at', 'DESC'],
          ],
        }),
        DespesaCaixa.findAll({
          where: {
            usuario_id: req.user.id,
            caixa_id: {
              [Op.in]: sessionIds,
            },
          },
          order: [
            ['registrado_em', 'DESC'],
            ['created_at', 'DESC'],
          ],
        }),
      ]);
      const conferenceBySessionId = new Map(
        conferencias.map(conferencia => [conferencia.caixa_id, conferencia])
      );
      const salesBySessionId = new Map();
      const expensesBySessionId = new Map();

      vendas.forEach(record => {
        const sale = getPlain(record);

        if (sale.caixa_id && sessionIds.includes(sale.caixa_id)) {
          const sessionSales = salesBySessionId.get(sale.caixa_id) || [];
          sessionSales.push(record);
          salesBySessionId.set(sale.caixa_id, sessionSales);
        }

        if (
          sale.caixa_recebimento_id &&
          sessionIds.includes(sale.caixa_recebimento_id) &&
          sale.caixa_recebimento_id !== sale.caixa_id
        ) {
          const sessionSales = salesBySessionId.get(sale.caixa_recebimento_id) || [];
          sessionSales.push(record);
          salesBySessionId.set(sale.caixa_recebimento_id, sessionSales);
        }
      });

      despesas.forEach(record => {
        const expense = getPlain(record);
        const sessionExpenses = expensesBySessionId.get(expense.caixa_id) || [];
        sessionExpenses.push(record);
        expensesBySessionId.set(expense.caixa_id, sessionExpenses);
      });

      const pendentes = [];
      const conferidos = [];

      sessoes.forEach(sessao => {
        const conferencia = conferenceBySessionId.get(sessao.id) || null;
        const { resumo } = buildSessionSummary(
          sessao,
          salesBySessionId.get(sessao.id) || [],
          expensesBySessionId.get(sessao.id) || [],
          conferencia
        );

        if (isActiveConference(conferencia)) {
          conferidos.push(resumo);
        } else {
          pendentes.push(resumo);
        }
      });

      conferidos.sort((left, right) => {
        const leftTime = new Date(left.revisado_em || 0).getTime();
        const rightTime = new Date(right.revisado_em || 0).getTime();
        return rightTime - leftTime;
      });

      return res.json({
        gerado_em: new Date().toISOString(),
        pendentes,
        conferidos,
      });
    } catch (error) {
      return handleCaixaError(res, error, 'Erro ao carregar conferência de caixa.');
    }
  },

  async conferenceDetails(req, res) {
    try {
      const details = await loadSessionDetails(req.user.id, req.params.caixaId);

      return res.json(details);
    } catch (error) {
      return handleCaixaError(res, error, 'Erro ao carregar detalhes da conferência.');
    }
  },

  async saveConference(req, res) {
    try {
      const sessao = await resolveClosedSession(req.user.id, req.params.caixaId);
      const confirmedTotals = parseConfirmedTotals(req.body);
      const existingConference = await ConferenciaCaixa.findOne({
        where: {
          usuario_id: req.user.id,
          caixa_id: sessao.id,
        },
      });
      const now = new Date();

      if (existingConference?.ativo) {
        return res.status(409).json({
          message: 'Este caixa já foi conferido. Reabra a conferência antes de salvar novos valores.',
        });
      }

      if (existingConference) {
        await existingConference.update({
          dinheiro_confirmado_centavos: confirmedTotals.dinheiro,
          cartao_confirmado_centavos: confirmedTotals.cartao,
          pix_confirmado_centavos: confirmedTotals.pix,
          parcelamento_confirmado_centavos: confirmedTotals.parcelamento,
          convenio_confirmado_centavos: confirmedTotals.convenio,
          ativo: true,
          revisado_em: now,
        });
      } else {
        await ConferenciaCaixa.create({
          id: createId('conferencia-caixa'),
          usuario_id: req.user.id,
          caixa_id: sessao.id,
          dinheiro_confirmado_centavos: confirmedTotals.dinheiro,
          cartao_confirmado_centavos: confirmedTotals.cartao,
          pix_confirmado_centavos: confirmedTotals.pix,
          parcelamento_confirmado_centavos: confirmedTotals.parcelamento,
          convenio_confirmado_centavos: confirmedTotals.convenio,
          ativo: true,
          revisado_em: now,
        });
      }

      const details = await loadSessionDetails(req.user.id, sessao.id);

      return res.status(201).json(details);
    } catch (error) {
      return handleCaixaError(res, error, 'Erro ao salvar conferência de caixa.');
    }
  },

  async reopenConference(req, res) {
    try {
      const sessao = await resolveClosedSession(req.user.id, req.params.caixaId);
      const conferencia = await ConferenciaCaixa.findOne({
        where: {
          usuario_id: req.user.id,
          caixa_id: sessao.id,
        },
      });

      if (!conferencia) {
        return res.status(404).json({
          message: 'Este caixa ainda não possui conferência salva para reabrir.',
        });
      }

      if (conferencia.ativo) {
        await conferencia.update({ ativo: false });
      }

      const details = await loadSessionDetails(req.user.id, sessao.id);

      return res.json(details);
    } catch (error) {
      return handleCaixaError(res, error, 'Erro ao reabrir conferência de caixa.');
    }
  },
};
