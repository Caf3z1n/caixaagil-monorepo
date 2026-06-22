const { Op } = require('sequelize');
const { randomUUID } = require('crypto');
const sequelize = require('../../database');
const {
  Arquivo,
  CategoriaProduto,
  Estoque,
  MovimentacaoEstoque,
  Produto,
  SaldoEstoqueProduto,
} = require('../models');

const ESTOQUE_PRINCIPAL_NOME = 'Estoque principal';
const movimentoTipos = new Set(['compra', 'acerto', 'transferencia', 'venda']);

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeOptionalText(value, maxLength) {
  const normalized = normalizeText(value, maxLength);

  return normalized || null;
}

function parseQuantity(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number(String(value).replace(',', '.'));

  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(3)) : 0;
}

function formatDecimalNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeStockOperationItems(body) {
  const rawItems = Array.isArray(body?.itens)
    ? body.itens
    : [{ produto_id: body?.produto_id, quantidade: body?.quantidade }];
  const groupedItems = new Map();

  rawItems.forEach(item => {
    const produtoId = parsePositiveInteger(item?.produto_id ?? item?.produtoId);

    if (!produtoId) {
      return;
    }

    const quantidade = parseQuantity(item?.quantidade ?? item?.quantity);
    groupedItems.set(produtoId, Number(((groupedItems.get(produtoId) ?? 0) + quantidade).toFixed(3)));
  });

  return Array.from(groupedItems.entries()).map(([produtoId, quantidade]) => ({
    produtoId,
    quantidade,
  }));
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
    url: data.visibilidade === 'publico' ? `/arquivos/publicos/${data.id}` : null,
  };
}

function sanitizeCategoria(categoria) {
  if (!categoria) {
    return null;
  }

  const data = categoria.get ? categoria.get({ plain: true }) : categoria;

  return {
    id: data.id,
    nome: data.nome,
    icone: data.icone,
    cor: data.cor,
    ordem: data.ordem,
  };
}

function sanitizeEstoque(estoque, resumo = {}) {
  const data = estoque.get ? estoque.get({ plain: true }) : { ...estoque };
  const principalVenda = Boolean(data.principal_venda);
  const registrosVinculados = Number(resumo.registros_vinculados ?? data.registros_vinculados ?? 0);

  return {
    id: data.id,
    usuario_id: data.usuario_id,
    nome: data.nome,
    ativo: data.ativo !== false,
    principal_venda: principalVenda,
    permite_venda: principalVenda,
    tipo: principalVenda ? 'principal' : 'reposicao',
    bloqueado: principalVenda,
    ordem: Number(data.ordem || 0),
    produtos_count: resumo.produtos_count ?? 0,
    total_quantidade: resumo.total_quantidade ?? 0,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
  };
}

function sanitizeProdutoEstoque(produto, estoques) {
  const data = produto.get ? produto.get({ plain: true }) : { ...produto };
  const saldos = Array.isArray(data.saldos_estoque) ? data.saldos_estoque : [];
  const saldoByEstoque = new Map(
    saldos.map(saldo => [Number(saldo.estoque_id), formatDecimalNumber(saldo.quantidade)])
  );
  const principal = estoques.find(estoque => estoque.principal_venda) ?? estoques[0] ?? null;
  const saldosNormalizados = estoques.map(estoque => ({
    estoque_id: estoque.id,
    quantidade: saldoByEstoque.get(estoque.id) ?? 0,
  }));
  const quantidadeTotal = saldosNormalizados.reduce(
    (total, saldo) => total + saldo.quantidade,
    0
  );

  return {
    id: data.id,
    nome: data.nome,
    codigo_barras: data.codigo_barras,
    categoria_id: data.categoria_id,
    preco_custo_centavos: Number(data.preco_custo_centavos || 0),
    preco_venda_centavos: Number(data.preco_venda_centavos || 0),
    controla_estoque: Boolean(data.controla_estoque),
    categoria: sanitizeCategoria(data.categoria),
    imagem: sanitizeArquivoResumo(data.imagem),
    saldos: saldosNormalizados,
    quantidade_total: Number(quantidadeTotal.toFixed(3)),
    quantidade_venda: principal ? saldoByEstoque.get(principal.id) ?? 0 : 0,
  };
}

function sanitizeMovimentacao(movimentacao) {
  const data = movimentacao.get ? movimentacao.get({ plain: true }) : { ...movimentacao };

  return {
    id: data.id,
    lancamento_id: data.lancamento_id ?? null,
    produto_id: data.produto_id,
    produto_nome: data.produto_nome,
    estoque_origem_id: data.estoque_origem_id,
    estoque_origem_nome: data.estoque_origem_nome,
    estoque_destino_id: data.estoque_destino_id,
    estoque_destino_nome: data.estoque_destino_nome,
    tipo: data.tipo,
    quantidade: formatDecimalNumber(data.quantidade),
    saldo_origem_antes: data.saldo_origem_antes === null ? null : formatDecimalNumber(data.saldo_origem_antes),
    saldo_origem_depois: data.saldo_origem_depois === null ? null : formatDecimalNumber(data.saldo_origem_depois),
    saldo_destino_antes: data.saldo_destino_antes === null ? null : formatDecimalNumber(data.saldo_destino_antes),
    saldo_destino_depois: data.saldo_destino_depois === null ? null : formatDecimalNumber(data.saldo_destino_depois),
    created_at: data.created_at ?? data.createdAt,
    updated_at: data.updated_at ?? data.updatedAt,
  };
}

function buildEstoquePayload(body) {
  return {
    nome: normalizeText(body?.nome, 80),
    principal_venda: false,
    permite_venda: false,
  };
}

function validateEstoquePayload(payload) {
  if (payload.nome.length < 2) {
    return 'Informe um nome para o estoque.';
  }

  if (payload.nome.toLocaleLowerCase('pt-BR') === ESTOQUE_PRINCIPAL_NOME.toLocaleLowerCase('pt-BR')) {
    return 'Esse nome é reservado para o estoque principal.';
  }

  return null;
}

async function ensureDefaultEstoque(usuarioId, transaction) {
  const estoques = await Estoque.findAll({
    where: { usuario_id: usuarioId },
    order: [
      ['principal_venda', 'DESC'],
      ['id', 'ASC'],
    ],
    transaction,
  });
  let principal = estoques.find(estoque => estoque.principal_venda) ?? estoques[0] ?? null;

  if (!principal) {
    principal = await Estoque.create(
      {
        usuario_id: usuarioId,
        nome: ESTOQUE_PRINCIPAL_NOME,
        principal_venda: true,
        permite_venda: true,
        ativo: true,
        ordem: 0,
      },
      { transaction }
    );
  }

  if (
    principal.nome !== ESTOQUE_PRINCIPAL_NOME ||
    !principal.principal_venda ||
    !principal.permite_venda ||
    principal.ativo === false ||
    principal.ordem !== 0
  ) {
    await principal.update(
      {
        nome: ESTOQUE_PRINCIPAL_NOME,
        principal_venda: true,
        permite_venda: true,
        ativo: true,
        ordem: 0,
      },
      { transaction }
    );
  }

  await Estoque.update(
    {
      principal_venda: false,
      permite_venda: false,
    },
    {
      where: {
        usuario_id: usuarioId,
        id: { [Op.ne]: principal.id },
      },
      transaction,
    }
  );

  return principal;
}

async function findUserEstoque(usuarioId, id, options = {}) {
  const estoqueId = parsePositiveInteger(id);

  if (!estoqueId) {
    return null;
  }

  return Estoque.findOne({
    where: {
      id: estoqueId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function findUserProdutoControlado(usuarioId, id, options = {}) {
  const produtoId = parsePositiveInteger(id);

  if (!produtoId) {
    return null;
  }

  return Produto.findOne({
    where: {
      id: produtoId,
      usuario_id: usuarioId,
      controla_estoque: true,
      ativo: true,
    },
    ...options,
  });
}

async function getResumoEstoques(usuarioId) {
  const [saldos, movimentacoes] = await Promise.all([
    SaldoEstoqueProduto.findAll({
      where: { usuario_id: usuarioId },
    }),
    MovimentacaoEstoque.findAll({
      where: {
        usuario_id: usuarioId,
        [Op.or]: [
          { estoque_origem_id: { [Op.ne]: null } },
          { estoque_destino_id: { [Op.ne]: null } },
        ],
      },
      attributes: ['estoque_origem_id', 'estoque_destino_id'],
    }),
  ]);
  const resumo = new Map();

  saldos.forEach(saldo => {
    const estoqueId = Number(saldo.estoque_id);
    const quantidade = formatDecimalNumber(saldo.quantidade);
    const current = resumo.get(estoqueId) ?? {
      produtos_count: 0,
      total_quantidade: 0,
      registros_vinculados: 0,
    };

    if (quantidade > 0) {
      current.produtos_count += 1;
    }

    current.total_quantidade = Number((current.total_quantidade + quantidade).toFixed(3));
    current.registros_vinculados = Number(current.registros_vinculados ?? 0) + 1;
    resumo.set(estoqueId, current);
  });

  movimentacoes.forEach(movimentacao => {
    [movimentacao.estoque_origem_id, movimentacao.estoque_destino_id]
      .filter(Boolean)
      .forEach(estoqueId => {
        const numericId = Number(estoqueId);
        const current = resumo.get(numericId) ?? {
          produtos_count: 0,
          total_quantidade: 0,
          registros_vinculados: 0,
        };

        current.registros_vinculados = Number(current.registros_vinculados ?? 0) + 1;
        resumo.set(numericId, current);
      });
  });

  return resumo;
}

async function getEstoqueRegistrosVinculados(usuarioId, estoqueId, options = {}) {
  const [saldosCount, movimentacoesCount] = await Promise.all([
    SaldoEstoqueProduto.count({
      where: {
        usuario_id: usuarioId,
        estoque_id: estoqueId,
      },
      transaction: options.transaction,
    }),
    MovimentacaoEstoque.count({
      where: {
        usuario_id: usuarioId,
        [Op.or]: [{ estoque_origem_id: estoqueId }, { estoque_destino_id: estoqueId }],
      },
      transaction: options.transaction,
    }),
  ]);

  return saldosCount + movimentacoesCount;
}

async function getOrCreateSaldo(usuarioId, produtoId, estoqueId, transaction) {
  const [saldo] = await SaldoEstoqueProduto.findOrCreate({
    where: {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoqueId,
    },
    defaults: {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoqueId,
      quantidade: 0,
    },
    transaction,
  });

  return saldo;
}

async function registrarMovimentacao(
  {
    usuarioId,
    produto,
    tipo,
    quantidade,
    origem = null,
    destino = null,
    saldoOrigemAntes = null,
    saldoOrigemDepois = null,
    saldoDestinoAntes = null,
    saldoDestinoDepois = null,
    lancamentoId = null,
  },
  transaction
) {
  return MovimentacaoEstoque.create(
    {
      usuario_id: usuarioId,
      lancamento_id: lancamentoId,
      produto_id: produto.id,
      produto_nome: produto.nome,
      estoque_origem_id: origem?.id ?? null,
      estoque_origem_nome: origem?.nome ?? null,
      estoque_destino_id: destino?.id ?? null,
      estoque_destino_nome: destino?.nome ?? null,
      tipo,
      quantidade,
      saldo_origem_antes: saldoOrigemAntes,
      saldo_origem_depois: saldoOrigemDepois,
      saldo_destino_antes: saldoDestinoAntes,
      saldo_destino_depois: saldoDestinoDepois,
    },
    { transaction }
  );
}

async function loadMovimentacoes(usuarioId, filters = {}) {
  const where = { usuario_id: usuarioId };
  const limit = Math.min(Math.max(Number(filters.limit) || 80, 1), 200);
  const estoqueId = parsePositiveInteger(filters.estoque_id);
  const produtoId = parsePositiveInteger(filters.produto_id);
  const tipo = movimentoTipos.has(filters.tipo) ? filters.tipo : null;

  if (tipo) {
    where.tipo = tipo;
  }

  if (produtoId) {
    where.produto_id = produtoId;
  }

  if (estoqueId) {
    where[Op.or] = [
      { estoque_origem_id: estoqueId },
      { estoque_destino_id: estoqueId },
    ];
  }

  const movimentacoes = await MovimentacaoEstoque.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
  });

  return movimentacoes.map(sanitizeMovimentacao);
}

async function loadSnapshot(usuarioId) {
  await ensureDefaultEstoque(usuarioId);

  const [estoques, produtos, resumoEstoques, movimentacoes] = await Promise.all([
    Estoque.findAll({
      where: { usuario_id: usuarioId },
      order: [
        ['ordem', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
    Produto.findAll({
      where: {
        usuario_id: usuarioId,
        controla_estoque: true,
        ativo: true,
      },
      include: [
        {
          model: CategoriaProduto,
          as: 'categoria',
          required: false,
        },
        {
          model: Arquivo,
          as: 'imagem',
          required: false,
        },
        {
          model: SaldoEstoqueProduto,
          as: 'saldos_estoque',
          required: false,
        },
      ],
      order: [
        [{ model: CategoriaProduto, as: 'categoria' }, 'ordem', 'ASC'],
        ['nome', 'ASC'],
      ],
    }),
    getResumoEstoques(usuarioId),
    loadMovimentacoes(usuarioId, { limit: 80 }),
  ]);

  return {
    estoques: estoques.map(estoque => sanitizeEstoque(estoque, resumoEstoques.get(estoque.id))),
    produtos: produtos.map(produto => sanitizeProdutoEstoque(produto, estoques)),
    movimentacoes,
  };
}

function handleEstoqueError(res, error, defaultMessage) {
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'Já existe um estoque com esse nome.',
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: error.errors?.[0]?.message || 'Dados inválidos.',
    });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

async function aplicarCompra(req, res) {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    await ensureDefaultEstoque(req.user.id, transaction);

    const destino = await findUserEstoque(req.user.id, req.body?.estoque_id, { transaction });
    const itens = normalizeStockOperationItems(req.body);

    if (!destino) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Estoque não encontrado.' });
    }

    if (destino.ativo === false) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Estoque desativado não pode receber compra.' });
    }

    if (itens.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Adicione ao menos um produto à compra.' });
    }

    if (itens.some(item => item.quantidade <= 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Informe uma quantidade maior que zero.' });
    }

    const lancamentoId = randomUUID();

    for (const item of itens) {
      const produto = await findUserProdutoControlado(req.user.id, item.produtoId, {
        transaction,
      });

      if (!produto) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Produto com controle de estoque não encontrado.' });
      }

      const saldo = await getOrCreateSaldo(req.user.id, produto.id, destino.id, transaction);
      const saldoAntes = formatDecimalNumber(saldo.quantidade);
      const saldoDepois = Number((saldoAntes + item.quantidade).toFixed(3));

      await saldo.update({ quantidade: saldoDepois }, { transaction });
      await registrarMovimentacao(
        {
          usuarioId: req.user.id,
          produto,
          tipo: 'compra',
          quantidade: item.quantidade,
          destino,
          saldoDestinoAntes: saldoAntes,
          saldoDestinoDepois: saldoDepois,
          lancamentoId,
        },
        transaction
      );
    }

    await transaction.commit();
    committed = true;

    return res.status(201).json(await loadSnapshot(req.user.id));
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }

    return handleEstoqueError(res, error, 'Erro ao registrar compra.');
  }
}

async function aplicarAcerto(req, res) {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    await ensureDefaultEstoque(req.user.id, transaction);

    const estoque = await findUserEstoque(req.user.id, req.body?.estoque_id, { transaction });
    const itens = normalizeStockOperationItems(req.body);

    if (!estoque) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Estoque não encontrado.' });
    }

    if (estoque.ativo === false) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Estoque desativado não pode receber acerto.' });
    }

    if (itens.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Adicione ao menos um produto ao acerto.' });
    }

    const lancamentoId = randomUUID();

    for (const item of itens) {
      const produto = await findUserProdutoControlado(req.user.id, item.produtoId, {
        transaction,
      });

      if (!produto) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Produto com controle de estoque não encontrado.' });
      }

      const saldo = await getOrCreateSaldo(req.user.id, produto.id, estoque.id, transaction);
      const saldoAntes = formatDecimalNumber(saldo.quantidade);

      await saldo.update({ quantidade: item.quantidade }, { transaction });
      await registrarMovimentacao(
        {
          usuarioId: req.user.id,
          produto,
          tipo: 'acerto',
          quantidade: item.quantidade,
          destino: estoque,
          saldoDestinoAntes: saldoAntes,
          saldoDestinoDepois: item.quantidade,
          lancamentoId,
        },
        transaction
      );
    }

    await transaction.commit();
    committed = true;

    return res.status(201).json(await loadSnapshot(req.user.id));
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }

    return handleEstoqueError(res, error, 'Erro ao registrar acerto.');
  }
}

async function aplicarTransferencia(req, res) {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    await ensureDefaultEstoque(req.user.id, transaction);

    const origem = await findUserEstoque(req.user.id, req.body?.estoque_origem_id, { transaction });
    const destino = await findUserEstoque(req.user.id, req.body?.estoque_destino_id, { transaction });
    const itens = normalizeStockOperationItems(req.body);

    if (!origem || !destino) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Selecione origem e destino da transferência.' });
    }

    if (origem.ativo === false || destino.ativo === false) {
      await transaction.rollback();
      return res.status(409).json({ message: 'Use apenas estoques ativos na transferência.' });
    }

    if (origem.id === destino.id) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Origem e destino devem ser diferentes.' });
    }

    if (itens.length === 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Adicione ao menos um produto para transferir.' });
    }

    if (itens.some(item => item.quantidade <= 0)) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Informe uma quantidade maior que zero.' });
    }

    const lancamentoId = randomUUID();

    for (const item of itens) {
      const produto = await findUserProdutoControlado(req.user.id, item.produtoId, {
        transaction,
      });

      if (!produto) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Produto com controle de estoque não encontrado.' });
      }

      const saldoOrigem = await getOrCreateSaldo(req.user.id, produto.id, origem.id, transaction);
      const saldoDestino = await getOrCreateSaldo(req.user.id, produto.id, destino.id, transaction);
      const saldoOrigemAntes = formatDecimalNumber(saldoOrigem.quantidade);
      const saldoDestinoAntes = formatDecimalNumber(saldoDestino.quantidade);

      if (saldoOrigemAntes < item.quantidade) {
        await transaction.rollback();
        return res.status(409).json({ message: `Saldo insuficiente para ${produto.nome}.` });
      }

      const saldoOrigemDepois = Number((saldoOrigemAntes - item.quantidade).toFixed(3));
      const saldoDestinoDepois = Number((saldoDestinoAntes + item.quantidade).toFixed(3));

      await saldoOrigem.update({ quantidade: saldoOrigemDepois }, { transaction });
      await saldoDestino.update({ quantidade: saldoDestinoDepois }, { transaction });
      await registrarMovimentacao(
        {
          usuarioId: req.user.id,
          produto,
          tipo: 'transferencia',
          quantidade: item.quantidade,
          origem,
          destino,
          saldoOrigemAntes,
          saldoOrigemDepois,
          saldoDestinoAntes,
          saldoDestinoDepois,
          lancamentoId,
        },
        transaction
      );
    }

    await transaction.commit();
    committed = true;

    return res.status(201).json(await loadSnapshot(req.user.id));
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }

    return handleEstoqueError(res, error, 'Erro ao registrar transferência.');
  }
}

async function aplicarReversaoMovimentacao(usuarioId, movimentacao, transaction) {
  const produto = await Produto.findOne({
    where: {
      id: movimentacao.produto_id,
      usuario_id: usuarioId,
    },
    transaction,
  });
  const quantidade = formatDecimalNumber(movimentacao.quantidade);

  if (!produto) {
    const error = new Error('Produto não encontrado.');
    error.statusCode = 404;
    throw error;
  }

  if (movimentacao.tipo === 'compra') {
    const destino = await findUserEstoque(usuarioId, movimentacao.estoque_destino_id, { transaction });

    if (!destino) {
      const error = new Error('Estoque não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const saldo = await getOrCreateSaldo(usuarioId, produto.id, destino.id, transaction);
    const saldoAtual = formatDecimalNumber(saldo.quantidade);

    if (saldoAtual < quantidade) {
      const error = new Error('Saldo insuficiente para reverter esta compra.');
      error.statusCode = 409;
      throw error;
    }

    await saldo.update(
      { quantidade: Number((saldoAtual - quantidade).toFixed(3)) },
      { transaction }
    );
  }

  if (movimentacao.tipo === 'acerto') {
    const destino = await findUserEstoque(usuarioId, movimentacao.estoque_destino_id, { transaction });

    if (!destino) {
      const error = new Error('Estoque não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const saldo = await getOrCreateSaldo(usuarioId, produto.id, destino.id, transaction);

    await saldo.update(
      { quantidade: formatDecimalNumber(movimentacao.saldo_destino_antes) },
      { transaction }
    );
  }

  if (movimentacao.tipo === 'transferencia') {
    const origem = await findUserEstoque(usuarioId, movimentacao.estoque_origem_id, { transaction });
    const destino = await findUserEstoque(usuarioId, movimentacao.estoque_destino_id, { transaction });

    if (!origem || !destino) {
      const error = new Error('Origem ou destino não encontrado.');
      error.statusCode = 404;
      throw error;
    }

    const saldoOrigem = await getOrCreateSaldo(usuarioId, produto.id, origem.id, transaction);
    const saldoDestino = await getOrCreateSaldo(usuarioId, produto.id, destino.id, transaction);
    const saldoOrigemAtual = formatDecimalNumber(saldoOrigem.quantidade);
    const saldoDestinoAtual = formatDecimalNumber(saldoDestino.quantidade);

    if (saldoDestinoAtual < quantidade) {
      const error = new Error('Saldo insuficiente no destino para reverter esta transferência.');
      error.statusCode = 409;
      throw error;
    }

    await saldoOrigem.update(
      { quantidade: Number((saldoOrigemAtual + quantidade).toFixed(3)) },
      { transaction }
    );
    await saldoDestino.update(
      { quantidade: Number((saldoDestinoAtual - quantidade).toFixed(3)) },
      { transaction }
    );
  }

  await movimentacao.destroy({ transaction });
}

async function reverterMovimentacao(req, res) {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    const movimentacao = await MovimentacaoEstoque.findOne({
      where: {
        id: req.params.id,
        usuario_id: req.user.id,
      },
      transaction,
    });

    if (!movimentacao) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Movimentação não encontrada.' });
    }

    await aplicarReversaoMovimentacao(req.user.id, movimentacao, transaction);
    await transaction.commit();
    committed = true;

    return res.json(await loadSnapshot(req.user.id));
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return handleEstoqueError(res, error, 'Erro ao reverter movimentação.');
  }
}

async function reverterLancamento(req, res) {
  const transaction = await sequelize.transaction();
  let committed = false;

  try {
    const lancamentoId = normalizeText(req.params.id, 64);

    if (!lancamentoId) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Lançamento inválido.' });
    }

    const movimentacoes = await MovimentacaoEstoque.findAll({
      where: {
        lancamento_id: lancamentoId,
        usuario_id: req.user.id,
      },
      order: [['id', 'DESC']],
      transaction,
    });

    if (movimentacoes.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Lançamento não encontrado.' });
    }

    for (const movimentacao of movimentacoes) {
      await aplicarReversaoMovimentacao(req.user.id, movimentacao, transaction);
    }

    await transaction.commit();
    committed = true;

    return res.json(await loadSnapshot(req.user.id));
  } catch (error) {
    if (!committed) {
      await transaction.rollback();
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    return handleEstoqueError(res, error, 'Erro ao reverter lançamento.');
  }
}

module.exports = {
  async snapshot(req, res) {
    try {
      const snapshot = await loadSnapshot(req.user.id);

      return res.json(snapshot);
    } catch (error) {
      return handleEstoqueError(res, error, 'Erro ao carregar estoque.');
    }
  },

  async movimentacoes(req, res) {
    try {
      const movimentacoes = await loadMovimentacoes(req.user.id, req.query);

      return res.json({ movimentacoes });
    } catch (error) {
      return handleEstoqueError(res, error, 'Erro ao carregar histórico.');
    }
  },

  async createEstoque(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      await ensureDefaultEstoque(req.user.id, transaction);

      const payload = buildEstoquePayload(req.body);
      const validationError = validateEstoquePayload(payload);

      if (validationError) {
        await transaction.rollback();
        return res.status(400).json({ message: validationError });
      }

      const maxOrder = await Estoque.max('ordem', {
        where: { usuario_id: req.user.id },
        transaction,
      });

      const estoque = await Estoque.create(
        {
          usuario_id: req.user.id,
          ...payload,
          ativo: true,
          ordem: Number.isFinite(Number(maxOrder)) ? Number(maxOrder) + 1 : 1,
        },
        { transaction }
      );

      await transaction.commit();
      committed = true;

      return res.status(201).json(sanitizeEstoque(estoque));
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }

      return handleEstoqueError(res, error, 'Erro ao criar estoque.');
    }
  },

  async updateEstoque(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      await ensureDefaultEstoque(req.user.id, transaction);

      const estoque = await findUserEstoque(req.user.id, req.params.id, { transaction });

      if (!estoque) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Estoque não encontrado.' });
      }

      if (estoque.principal_venda) {
        await transaction.rollback();
        return res.status(409).json({ message: 'O estoque principal é fixo e não pode ser editado.' });
      }

      const payload = buildEstoquePayload(req.body);
      const validationError = validateEstoquePayload(payload);

      if (validationError) {
        await transaction.rollback();
        return res.status(400).json({ message: validationError });
      }

      await estoque.update(payload, { transaction });
      const registrosVinculados = await getEstoqueRegistrosVinculados(req.user.id, estoque.id, { transaction });
      await transaction.commit();
      committed = true;

      return res.json(sanitizeEstoque(estoque, { registros_vinculados: registrosVinculados }));
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }

      return handleEstoqueError(res, error, 'Erro ao atualizar estoque.');
    }
  },

  async deleteEstoque(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const estoque = await findUserEstoque(req.user.id, req.params.id, { transaction });

      if (!estoque) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Estoque não encontrado.' });
      }

      if (estoque.principal_venda) {
        await transaction.rollback();
        return res.status(409).json({
          message: 'Não é possível excluir o estoque principal.',
        });
      }

      const registrosVinculados = await getEstoqueRegistrosVinculados(req.user.id, estoque.id, { transaction });
      const saldosComQuantidade = await SaldoEstoqueProduto.count({
        where: {
          usuario_id: req.user.id,
          estoque_id: estoque.id,
          quantidade: { [Op.gt]: 0 },
        },
        transaction,
      });

      if (registrosVinculados > 0) {
        await estoque.update({ ativo: false }, { transaction });
        await transaction.commit();
        committed = true;

        return res.json({
          action: 'deactivated',
          estoque: sanitizeEstoque(estoque, {
            registros_vinculados: registrosVinculados,
            produtos_count: saldosComQuantidade,
          }),
          message: 'Estoque desativado para preservar saldos e movimentações vinculadas.',
        });
      }

      await SaldoEstoqueProduto.destroy({
        where: {
          usuario_id: req.user.id,
          estoque_id: estoque.id,
        },
        transaction,
      });
      await estoque.destroy({ transaction });
      await transaction.commit();
      committed = true;

      return res.json({
        action: 'deleted',
        id: estoque.id,
        message: 'Estoque excluído.',
      });
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }

      return handleEstoqueError(res, error, 'Erro ao excluir estoque.');
    }
  },

  async activateEstoque(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      await ensureDefaultEstoque(req.user.id, transaction);

      const estoque = await findUserEstoque(req.user.id, req.params.id, { transaction });

      if (!estoque) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Estoque não encontrado.' });
      }

      if (!estoque.ativo) {
        await estoque.update({ ativo: true }, { transaction });
      }

      const registrosVinculados = await getEstoqueRegistrosVinculados(req.user.id, estoque.id, { transaction });

      await transaction.commit();
      committed = true;

      return res.json({
        action: 'activated',
        estoque: sanitizeEstoque(estoque, { registros_vinculados: registrosVinculados }),
        message: 'Estoque ativado.',
      });
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }

      return handleEstoqueError(res, error, 'Erro ao ativar estoque.');
    }
  },

  registrarCompra: aplicarCompra,
  registrarAcerto: aplicarAcerto,
  registrarTransferencia: aplicarTransferencia,
  reverterLancamento,
  reverterMovimentacao,
  updateSaldo: aplicarAcerto,
};
