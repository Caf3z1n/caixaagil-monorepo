const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../../database');
const {
  Arquivo,
  CategoriaProduto,
  Estoque,
  GrupoFiscal,
  MovimentacaoEstoque,
  Produto,
  SaldoEstoqueProduto,
} = require('../models');
const { ensureFeature } = require('../services/assinaturaEntitlementsService');
const configuracaoSistemaService = require('../services/configuracaoSistemaService');

const iconesPermitidos = new Set([
  'package',
  'shopping_basket',
  'store',
  'utensils',
  'coffee',
  'beer',
  'apple',
  'beef',
  'shirt',
  'beauty',
  'smartphone',
  'warehouse',
  'wrench',
  'sports',
  'soda',
  'sofa',
  'briefcase',
  'book',
  'pill',
  'gift',
]);

const coresPermitidas = new Set([
  'laranja',
  'ambar',
  'limao',
  'menta',
  'azul',
  'ciano',
  'indigo',
  'verde',
  'vermelho',
  'rosa',
  'vinho',
  'violeta',
  'marrom',
  'areia',
  'cinza',
  'grafite',
]);

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeNomeProduto(value) {
  return normalizeText(value, 120).toLocaleUpperCase('pt-BR');
}

function normalizeDigits(value, maxLength) {
  const digits = String(value || '').replace(/\D/g, '');

  return digits.slice(0, maxLength);
}

function normalizeOptionalText(value, maxLength) {
  const normalized = normalizeText(value, maxLength);

  return normalized || null;
}

function normalizeOptionalDigits(value, maxLength) {
  const normalized = normalizeDigits(value, maxLength);

  return normalized || null;
}

function parseInteger(value, fallbackValue = 0) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallbackValue;
}

function parseOptionalId(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parsePriceCents(value) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
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

  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeCategoria(categoria, produtosCount = 0) {
  const data = categoria.get ? categoria.get({ plain: true }) : { ...categoria };
  const registrosVinculados = Number(produtosCount ?? data.registros_vinculados ?? 0);

  return {
    ...data,
    ativo: data.ativo !== false,
    produtos_count: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
  };
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

function sanitizeGrupoFiscalResumo(grupoFiscal, fiscalTaxRegime = null) {
  if (!grupoFiscal) {
    return null;
  }

  const data = grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal;
  const regimeTributario = fiscalTaxRegime?.regime_tributario || data.regime_tributario;

  return {
    id: data.id,
    nome: data.nome,
    ativo: Boolean(data.ativo),
    regime_tributario: regimeTributario,
    cfop: data.cfop,
    ncm: data.ncm,
    cst_icms: data.cst_icms,
    csosn: data.csosn,
    aliquota_icms: data.aliquota_icms,
    reducao_icms: data.reducao_icms,
    base_icms_st: data.base_icms_st,
    cst_pis: data.cst_pis,
    aliquota_pis: data.aliquota_pis,
    cst_cofins: data.cst_cofins,
    aliquota_cofins: data.aliquota_cofins,
    ibs_ativo: data.ibs_ativo,
    cst_ibs: data.cst_ibs,
    classificacao_ibs: data.classificacao_ibs,
    aliquota_ibs_uf: data.aliquota_ibs_uf,
    aliquota_ibs_municipal: data.aliquota_ibs_municipal,
    aliquota_cbs: data.aliquota_cbs,
  };
}

function getProdutoEstoqueVenda(data) {
  const saldos = Array.isArray(data.saldos_estoque) ? data.saldos_estoque : [];
  const saldoPrincipal =
    saldos.find(saldo => saldo.estoque?.principal_venda) ?? saldos[0] ?? null;

  if (!saldoPrincipal) {
    return 0;
  }

  return formatDecimalNumber(saldoPrincipal.quantidade);
}

function sanitizeProduto(produto, extra = {}) {
  const data = produto.get ? produto.get({ plain: true }) : { ...produto };
  const registrosVinculados = Number(extra.registros_vinculados ?? data.registros_vinculados ?? 0);

  return {
    ...data,
    preco_custo_centavos: parseInteger(data.preco_custo_centavos),
    preco_venda_centavos: parseInteger(data.preco_venda_centavos),
    quantidade_estoque: data.controla_estoque ? getProdutoEstoqueVenda(data) : null,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
    categoria: data.categoria ? sanitizeCategoria(data.categoria) : null,
    grupo_fiscal: sanitizeGrupoFiscalResumo(data.grupo_fiscal, extra.fiscalTaxRegime),
    imagem: sanitizeArquivoResumo(data.imagem),
  };
}

function sanitizeEstoque(estoque) {
  const data = estoque.get ? estoque.get({ plain: true }) : { ...estoque };

  return data;
}

async function ensureDefaultEstoque(usuarioId, transaction) {
  const current =
    (await Estoque.findOne({
      where: {
        usuario_id: usuarioId,
        principal_venda: true,
      },
      transaction,
    })) ??
    (await Estoque.findOne({
      where: {
        usuario_id: usuarioId,
      },
      order: [['id', 'ASC']],
      transaction,
    }));

  if (current) {
    await current.update(
      {
        nome: 'Estoque principal',
        principal_venda: true,
        permite_venda: true,
        ativo: true,
        ordem: 0,
      },
      { transaction }
    );
    await Estoque.update(
      {
        principal_venda: false,
        permite_venda: false,
      },
      {
        where: {
          usuario_id: usuarioId,
          id: { [Op.ne]: current.id },
        },
        transaction,
      }
    );

    return current;
  }

  return Estoque.create(
    {
      usuario_id: usuarioId,
      nome: 'Estoque principal',
      principal_venda: true,
      permite_venda: true,
      ativo: true,
      ordem: 0,
    },
    { transaction }
  );
}

async function findUserCategoria(usuarioId, id, options = {}) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return CategoriaProduto.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function findUserGrupoFiscal(usuarioId, id, options = {}) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return GrupoFiscal.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function findUserArquivo(usuarioId, id, options = {}) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return Arquivo.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function findUserProduto(usuarioId, id, options = {}) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return Produto.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function countVendasComProduto(usuarioId, produtoId, options = {}) {
  const [result] = await sequelize.query(
    `
      SELECT COUNT(*)::int AS total
      FROM vendas
      WHERE usuario_id = :usuarioId
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(itens, '[]'::jsonb)) AS item
          WHERE item->>'produto_id' = :produtoId
             OR item->>'productId' = :produtoId
             OR item->>'id' = :produtoId
        )
    `,
    {
      replacements: {
        usuarioId,
        produtoId: String(produtoId),
      },
      type: QueryTypes.SELECT,
      transaction: options.transaction,
    }
  );

  return Number(result?.total || 0);
}

async function getProdutoRegistrosVinculados(usuarioId, produtoId, options = {}) {
  const [movimentacoes, saldosPositivos, vendas] = await Promise.all([
    MovimentacaoEstoque.count({
      where: {
        usuario_id: usuarioId,
        produto_id: produtoId,
      },
      ...options,
    }),
    SaldoEstoqueProduto.count({
      where: {
        usuario_id: usuarioId,
        produto_id: produtoId,
        quantidade: { [Op.gt]: 0 },
      },
      ...options,
    }),
    countVendasComProduto(usuarioId, produtoId, options),
  ]);

  return movimentacoes + saldosPositivos + vendas;
}

function buildCategoriaPayload(body) {
  const icone = iconesPermitidos.has(body?.icone) ? body.icone : 'package';
  const cor = coresPermitidas.has(body?.cor) ? body.cor : 'laranja';

  const payload = {
    nome: normalizeText(body?.nome, 80),
    icone,
    cor,
  };

  if (Number.isInteger(Number(body?.ordem))) {
    payload.ordem = parseInteger(body.ordem);
  }

  return payload;
}

function validateCategoriaPayload(payload) {
  if (payload.nome.length < 2) {
    return 'Informe um nome para a categoria.';
  }

  return null;
}

function buildProdutoPayload(body) {
  return {
    nome: normalizeNomeProduto(body?.nome),
    categoria_id: Number(body?.categoria_id),
    grupo_fiscal_id: body?.grupo_fiscal_id ? Number(body.grupo_fiscal_id) : null,
    imagem_arquivo_id: parseOptionalId(body?.imagem_arquivo_id),
    codigo_barras: normalizeOptionalText(body?.codigo_barras, 64),
    ncm: normalizeOptionalDigits(body?.ncm, 8),
    preco_custo_centavos: parsePriceCents(body?.preco_custo_centavos),
    preco_venda_centavos: parsePriceCents(body?.preco_venda_centavos),
    controla_estoque: Boolean(body?.controla_estoque),
    quantidade_estoque: parseQuantity(body?.quantidade_estoque),
  };
}

async function validateProdutoPayload(usuarioId, payload, options = {}) {
  if (payload.nome.length < 2) {
    return 'Informe um nome para o produto.';
  }

  if (!Number.isInteger(payload.categoria_id) || payload.categoria_id <= 0) {
    return 'Selecione uma categoria para o produto.';
  }

  const categoria = await findUserCategoria(usuarioId, payload.categoria_id, options);

  if (!categoria) {
    return 'Categoria não encontrada.';
  }

  if (categoria.ativo === false && categoria.id !== options.allowInactiveCategoriaId) {
    return 'Categoria desativada não pode receber novos produtos.';
  }

  if (payload.grupo_fiscal_id) {
    const grupoFiscal = await findUserGrupoFiscal(usuarioId, payload.grupo_fiscal_id, options);

    if (!grupoFiscal) {
      return 'Grupo fiscal não encontrado.';
    }

    if (grupoFiscal.ativo === false && grupoFiscal.id !== options.allowInactiveGrupoFiscalId) {
      return 'Grupo fiscal desativado não pode ser usado em novos produtos.';
    }
  }

  if (payload.imagem_arquivo_id) {
    const arquivo = await findUserArquivo(usuarioId, payload.imagem_arquivo_id, options);

    if (!arquivo) {
      return 'Imagem do produto não encontrada.';
    }

    if (arquivo.tipo !== 'imagem') {
      return 'Selecione um arquivo de imagem para o produto.';
    }
  }

  if (payload.ncm && payload.ncm.length !== 8) {
    return 'Informe um NCM com 8 dígitos ou deixe em branco.';
  }

  if (payload.preco_venda_centavos <= 0) {
    return 'Informe o preço de venda do produto.';
  }

  if (payload.preco_custo_centavos > payload.preco_venda_centavos) {
    return 'O preço de custo não pode ser maior que o preço de venda.';
  }

  return null;
}

async function setProdutoEstoquePrincipal(usuarioId, produtoId, quantidade, transaction) {
  const estoque = await ensureDefaultEstoque(usuarioId, transaction);
  const current = await SaldoEstoqueProduto.findOne({
    where: {
      produto_id: produtoId,
      estoque_id: estoque.id,
    },
    transaction,
  });

  if (current) {
    await current.update({ quantidade }, { transaction });
    return current;
  }

  return SaldoEstoqueProduto.create(
    {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoque.id,
      quantidade,
    },
    { transaction }
  );
}

async function loadSnapshot(usuarioId, options = {}) {
  await ensureDefaultEstoque(usuarioId);
  const onlyActive = options.onlyActive === true || options.includeInactive === false;
  const productWhere = {
    usuario_id: usuarioId,
    ...(onlyActive ? { ativo: true } : {}),
  };
  const activeScopedWhere = {
    usuario_id: usuarioId,
    ...(onlyActive ? { ativo: true } : {}),
  };

  const [categorias, produtos, gruposFiscais, estoques, fiscalTaxRegime] = await Promise.all([
    CategoriaProduto.findAll({
      where: activeScopedWhere,
      order: [
        ['ordem', 'ASC'],
        ['nome', 'ASC'],
      ],
    }),
    Produto.findAll({
      where: productWhere,
      include: [
        {
          model: CategoriaProduto,
          as: 'categoria',
          required: false,
        },
        {
          model: GrupoFiscal,
          as: 'grupo_fiscal',
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
          include: [
            {
              model: Estoque,
              as: 'estoque',
              required: false,
            },
          ],
        },
      ],
      order: [
        [{ model: CategoriaProduto, as: 'categoria' }, 'ordem', 'ASC'],
        ['nome', 'ASC'],
      ],
    }),
    GrupoFiscal.findAll({
      where: { usuario_id: usuarioId },
      order: [
        ['created_at', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
    Estoque.findAll({
      where: activeScopedWhere,
      order: [
        ['ordem', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
    configuracaoSistemaService.getFiscalTaxRegime(usuarioId),
  ]);

  const countByCategoria = new Map();

  produtos.forEach(produto => {
    const categoriaId = produto.categoria_id;

    countByCategoria.set(categoriaId, (countByCategoria.get(categoriaId) ?? 0) + 1);
  });

  return {
    categorias: categorias.map(categoria =>
      sanitizeCategoria(categoria, countByCategoria.get(categoria.id) ?? 0)
    ),
    produtos: await Promise.all(
      produtos.map(async produto =>
        sanitizeProduto(produto, {
          registros_vinculados: await getProdutoRegistrosVinculados(usuarioId, produto.id),
          fiscalTaxRegime,
        })
      )
    ),
    grupos_fiscais: gruposFiscais.map(grupoFiscal => sanitizeGrupoFiscalResumo(grupoFiscal, fiscalTaxRegime)),
    estoques: estoques.map(sanitizeEstoque),
  };
}

function handleCatalogError(res, error, defaultMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message || defaultMessage,
      entitlements: error.entitlements,
    });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'Já existe um cadastro com esses dados.',
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: error.errors?.[0]?.message || 'Dados inválidos.',
    });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

module.exports = {
  loadSnapshot,

  async snapshot(req, res) {
    try {
      const snapshot = await loadSnapshot(req.user.id);

      return res.json(snapshot);
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao carregar produtos.');
    }
  },

  async createCategoria(req, res) {
    try {
      const payload = buildCategoriaPayload(req.body);
      const validationError = validateCategoriaPayload(payload);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      if (!Number.isInteger(Number(req.body?.ordem))) {
        const maxOrder = await CategoriaProduto.max('ordem', {
          where: { usuario_id: req.user.id },
        });

        payload.ordem = Number.isFinite(Number(maxOrder)) ? Number(maxOrder) + 1 : 0;
      }

      const categoria = await CategoriaProduto.create({
        usuario_id: req.user.id,
        ...payload,
      });

      return res.status(201).json(sanitizeCategoria(categoria));
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao criar categoria.');
    }
  },

  async updateCategoria(req, res) {
    try {
      const categoria = await findUserCategoria(req.user.id, req.params.id);

      if (!categoria) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const payload = buildCategoriaPayload(req.body);
      const validationError = validateCategoriaPayload(payload);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      await categoria.update(payload);

      const produtosCount = await Produto.count({
        where: {
          usuario_id: req.user.id,
          categoria_id: categoria.id,
        },
      });

      return res.json(sanitizeCategoria(categoria, produtosCount));
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao atualizar categoria.');
    }
  },

  async reorderCategorias(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const orderedIds = Array.isArray(req.body?.ordered_ids)
        ? req.body.ordered_ids.map(id => Number(id)).filter(id => Number.isInteger(id) && id > 0)
        : [];

      if (!orderedIds.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Informe a nova ordem das categorias.' });
      }

      const categorias = await CategoriaProduto.findAll({
        where: {
          usuario_id: req.user.id,
        },
        transaction,
      });
      const categoryIds = new Set(categorias.map(categoria => categoria.id));

      if (orderedIds.length !== categorias.length || orderedIds.some(id => !categoryIds.has(id))) {
        await transaction.rollback();
        return res.status(400).json({ message: 'A nova ordem precisa conter todas as categorias.' });
      }

      await Promise.all(
        orderedIds.map((id, index) =>
          CategoriaProduto.update(
            { ordem: index },
            {
              where: {
                id,
                usuario_id: req.user.id,
              },
              transaction,
            }
          )
        )
      );

      await transaction.commit();

      return res.json({ ordered_ids: orderedIds });
    } catch (error) {
      await transaction.rollback();
      return handleCatalogError(res, error, 'Erro ao reordenar categorias.');
    }
  },

  async deleteCategoria(req, res) {
    try {
      const categoria = await findUserCategoria(req.user.id, req.params.id);

      if (!categoria) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const produtosCount = await Produto.count({
        where: {
          usuario_id: req.user.id,
          categoria_id: categoria.id,
        },
      });

      if (produtosCount > 0) {
        await categoria.update({ ativo: false });

        return res.json({
          action: 'deactivated',
          categoria: sanitizeCategoria(categoria, produtosCount),
          message: 'Categoria desativada para preservar os produtos vinculados.',
        });
      }

      await categoria.destroy();

      return res.json({
        action: 'deleted',
        id: categoria.id,
        message: 'Categoria excluída.',
      });
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao excluir categoria.');
    }
  },

  async activateCategoria(req, res) {
    try {
      const categoria = await findUserCategoria(req.user.id, req.params.id);

      if (!categoria) {
        return res.status(404).json({ message: 'Categoria não encontrada.' });
      }

      const produtosCount = await Produto.count({
        where: {
          usuario_id: req.user.id,
          categoria_id: categoria.id,
        },
      });

      if (!categoria.ativo) {
        await categoria.update({ ativo: true });
      }

      return res.json({
        action: 'activated',
        categoria: sanitizeCategoria(categoria, produtosCount),
        message: 'Categoria ativada.',
      });
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao ativar categoria.');
    }
  },

  async createProduto(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const payload = buildProdutoPayload(req.body);

      if (payload.grupo_fiscal_id) {
        await ensureFeature(req.user.id, 'emissao_fiscal');
      }

      const validationError = await validateProdutoPayload(req.user.id, payload, {
        transaction,
      });

      if (validationError) {
        await transaction.rollback();
        return res.status(400).json({ message: validationError });
      }

      const produto = await Produto.create(
        {
          usuario_id: req.user.id,
          categoria_id: payload.categoria_id,
          grupo_fiscal_id: payload.grupo_fiscal_id,
          imagem_arquivo_id: payload.imagem_arquivo_id,
          nome: payload.nome,
          codigo_barras: payload.codigo_barras,
          ncm: payload.ncm,
          preco_custo_centavos: payload.preco_custo_centavos,
          preco_venda_centavos: payload.preco_venda_centavos,
          controla_estoque: payload.controla_estoque,
          ativo: true,
        },
        { transaction }
      );

      if (payload.controla_estoque) {
        await setProdutoEstoquePrincipal(
          req.user.id,
          produto.id,
          payload.quantidade_estoque,
          transaction
        );
      }

      await transaction.commit();
      committed = true;

      const savedProduto = await findUserProduto(req.user.id, produto.id, {
        include: [
          { model: CategoriaProduto, as: 'categoria', required: false },
          { model: GrupoFiscal, as: 'grupo_fiscal', required: false },
          { model: Arquivo, as: 'imagem', required: false },
          {
            model: SaldoEstoqueProduto,
            as: 'saldos_estoque',
            required: false,
            include: [{ model: Estoque, as: 'estoque', required: false }],
          },
        ],
      });
      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      return res.status(201).json(sanitizeProduto(savedProduto, { fiscalTaxRegime }));
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }
      return handleCatalogError(res, error, 'Erro ao criar produto.');
    }
  },

  async updateProduto(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const produto = await findUserProduto(req.user.id, req.params.id, {
        transaction,
      });

      if (!produto) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const payload = buildProdutoPayload(req.body);

      if (payload.grupo_fiscal_id && payload.grupo_fiscal_id !== produto.grupo_fiscal_id) {
        await ensureFeature(req.user.id, 'emissao_fiscal');
      }

      const validationError = await validateProdutoPayload(req.user.id, payload, {
        transaction,
        allowInactiveCategoriaId: produto.categoria_id,
        allowInactiveGrupoFiscalId: produto.grupo_fiscal_id,
      });

      if (validationError) {
        await transaction.rollback();
        return res.status(400).json({ message: validationError });
      }

      await produto.update(
        {
          categoria_id: payload.categoria_id,
          grupo_fiscal_id: payload.grupo_fiscal_id,
          imagem_arquivo_id: payload.imagem_arquivo_id,
          nome: payload.nome,
          codigo_barras: payload.codigo_barras,
          ncm: payload.ncm,
          preco_custo_centavos: payload.preco_custo_centavos,
          preco_venda_centavos: payload.preco_venda_centavos,
          controla_estoque: payload.controla_estoque,
        },
        { transaction }
      );

      await transaction.commit();
      committed = true;

      const savedProduto = await findUserProduto(req.user.id, produto.id, {
        include: [
          { model: CategoriaProduto, as: 'categoria', required: false },
          { model: GrupoFiscal, as: 'grupo_fiscal', required: false },
          { model: Arquivo, as: 'imagem', required: false },
          {
            model: SaldoEstoqueProduto,
            as: 'saldos_estoque',
            required: false,
            include: [{ model: Estoque, as: 'estoque', required: false }],
          },
        ],
      });

      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      return res.json(
        sanitizeProduto(savedProduto, {
          registros_vinculados: await getProdutoRegistrosVinculados(req.user.id, produto.id),
          fiscalTaxRegime,
        })
      );
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }
      return handleCatalogError(res, error, 'Erro ao atualizar produto.');
    }
  },

  async deleteProduto(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const produto = await findUserProduto(req.user.id, req.params.id, { transaction });

      if (!produto) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const registrosVinculados = await getProdutoRegistrosVinculados(req.user.id, produto.id, { transaction });

      if (registrosVinculados > 0) {
        await produto.update({ ativo: false }, { transaction });
        await transaction.commit();
        committed = true;

        const savedProduto = await findUserProduto(req.user.id, produto.id, {
          include: [
            { model: CategoriaProduto, as: 'categoria', required: false },
            { model: GrupoFiscal, as: 'grupo_fiscal', required: false },
            { model: Arquivo, as: 'imagem', required: false },
            {
              model: SaldoEstoqueProduto,
              as: 'saldos_estoque',
              required: false,
              include: [{ model: Estoque, as: 'estoque', required: false }],
            },
          ],
        });

        const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

        return res.json({
          action: 'deactivated',
          produto: sanitizeProduto(savedProduto, { registros_vinculados: registrosVinculados, fiscalTaxRegime }),
          message: 'Produto desativado para preservar os registros vinculados.',
        });
      }

      await SaldoEstoqueProduto.destroy({
        where: {
          usuario_id: req.user.id,
          produto_id: produto.id,
        },
        transaction,
      });
      await produto.destroy({ transaction });
      await transaction.commit();
      committed = true;

      return res.json({
        action: 'deleted',
        id: produto.id,
        message: 'Produto excluído.',
      });
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }
      return handleCatalogError(res, error, 'Erro ao excluir produto.');
    }
  },

  async activateProduto(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const produto = await findUserProduto(req.user.id, req.params.id, { transaction });

      if (!produto) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      const categoria = await findUserCategoria(req.user.id, produto.categoria_id, { transaction });

      if (!categoria || categoria.ativo === false) {
        await transaction.rollback();
        return res.status(409).json({
          message: 'Ative a categoria do produto antes de ativar o produto.',
        });
      }

      if (produto.grupo_fiscal_id) {
        const grupoFiscal = await findUserGrupoFiscal(req.user.id, produto.grupo_fiscal_id, { transaction });

        if (!grupoFiscal || grupoFiscal.ativo === false) {
          await transaction.rollback();
          return res.status(409).json({
            message: 'Ative o grupo fiscal do produto antes de ativar o produto.',
          });
        }
      }

      if (!produto.ativo) {
        await produto.update({ ativo: true }, { transaction });
      }

      await transaction.commit();
      committed = true;

      const savedProduto = await findUserProduto(req.user.id, produto.id, {
        include: [
          { model: CategoriaProduto, as: 'categoria', required: false },
          { model: GrupoFiscal, as: 'grupo_fiscal', required: false },
          { model: Arquivo, as: 'imagem', required: false },
          {
            model: SaldoEstoqueProduto,
            as: 'saldos_estoque',
            required: false,
            include: [{ model: Estoque, as: 'estoque', required: false }],
          },
        ],
      });
      const registrosVinculados = await getProdutoRegistrosVinculados(req.user.id, produto.id);
      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      return res.json({
        action: 'activated',
        produto: sanitizeProduto(savedProduto, { registros_vinculados: registrosVinculados, fiscalTaxRegime }),
        message: 'Produto ativado.',
      });
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }
      return handleCatalogError(res, error, 'Erro ao ativar produto.');
    }
  },
};
