const { Op } = require('sequelize');
const sequelize = require('../../database');
const {
  Arquivo,
  CategoriaProduto,
  Estoque,
  GrupoFiscal,
  Produto,
  SaldoEstoqueProduto,
} = require('../models');

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

  return {
    ...data,
    produtos_count: produtosCount,
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

function sanitizeGrupoFiscalResumo(grupoFiscal) {
  if (!grupoFiscal) {
    return null;
  }

  const data = grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal;

  return {
    id: data.id,
    nome: data.nome,
    regime_tributario: data.regime_tributario,
    cfop: data.cfop,
    ncm: data.ncm,
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

function sanitizeProduto(produto) {
  const data = produto.get ? produto.get({ plain: true }) : { ...produto };

  return {
    ...data,
    preco_custo_centavos: parseInteger(data.preco_custo_centavos),
    preco_venda_centavos: parseInteger(data.preco_venda_centavos),
    quantidade_estoque: data.controla_estoque ? getProdutoEstoqueVenda(data) : null,
    categoria: data.categoria ? sanitizeCategoria(data.categoria) : null,
    grupo_fiscal: sanitizeGrupoFiscalResumo(data.grupo_fiscal),
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

  if (payload.grupo_fiscal_id) {
    const grupoFiscal = await findUserGrupoFiscal(usuarioId, payload.grupo_fiscal_id, options);

    if (!grupoFiscal) {
      return 'Grupo fiscal não encontrado.';
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

async function loadSnapshot(usuarioId) {
  await ensureDefaultEstoque(usuarioId);

  const [categorias, produtos, gruposFiscais, estoques] = await Promise.all([
    CategoriaProduto.findAll({
      where: { usuario_id: usuarioId },
      order: [
        ['ordem', 'ASC'],
        ['nome', 'ASC'],
      ],
    }),
    Produto.findAll({
      where: { usuario_id: usuarioId },
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
      where: { usuario_id: usuarioId },
      order: [
        ['ordem', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
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
    produtos: produtos.map(sanitizeProduto),
    grupos_fiscais: gruposFiscais.map(sanitizeGrupoFiscalResumo),
    estoques: estoques.map(sanitizeEstoque),
  };
}

function handleCatalogError(res, error, defaultMessage) {
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
        return res.status(409).json({
          message: 'Não é possível excluir uma categoria com produtos vinculados.',
        });
      }

      await categoria.destroy();

      return res.status(204).send();
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao excluir categoria.');
    }
  },

  async createProduto(req, res) {
    const transaction = await sequelize.transaction();
    let committed = false;

    try {
      const payload = buildProdutoPayload(req.body);
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

      return res.status(201).json(sanitizeProduto(savedProduto));
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
      const validationError = await validateProdutoPayload(req.user.id, payload, {
        transaction,
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

      return res.json(sanitizeProduto(savedProduto));
    } catch (error) {
      if (!committed) {
        await transaction.rollback();
      }
      return handleCatalogError(res, error, 'Erro ao atualizar produto.');
    }
  },

  async deleteProduto(req, res) {
    try {
      const produto = await findUserProduto(req.user.id, req.params.id);

      if (!produto) {
        return res.status(404).json({ message: 'Produto não encontrado.' });
      }

      await produto.destroy();

      return res.status(204).send();
    } catch (error) {
      return handleCatalogError(res, error, 'Erro ao excluir produto.');
    }
  },
};
