const { GrupoFiscal, Produto } = require('../models');
const sequelize = require('../../database');

const regimesPermitidos = new Set(['simples_nacional', 'regime_normal']);
const iconesPermitidos = new Set([
  'package',
  'shopping_basket',
  'store',
  'utensils',
  'coffee',
  'beer',
  'apple',
  'beef',
  'truck',
  'shirt',
  'smartphone',
  'warehouse',
  'wrench',
  'sofa',
]);

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function digitsOnly(value, maxLength) {
  const digits = String(value || '').replace(/\D/g, '');

  return digits.slice(0, maxLength);
}

function normalizeNullableDigits(value, maxLength) {
  const digits = digitsOnly(value, maxLength);

  return digits || null;
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalizedValue = Number(String(value).trim().replace(',', '.'));

  return Number.isFinite(normalizedValue) ? normalizedValue : null;
}

function formatDecimal(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

function sanitizeGrupoFiscal(grupoFiscal) {
  const data = grupoFiscal.get ? grupoFiscal.get({ plain: true }) : { ...grupoFiscal };
  const produtosVinculados = Number(data.produtos_vinculados ?? 0);

  return {
    ...data,
    aliquota_icms: formatDecimal(data.aliquota_icms),
    reducao_icms: formatDecimal(data.reducao_icms),
    base_icms_st: formatDecimal(data.base_icms_st),
    aliquota_pis: formatDecimal(data.aliquota_pis),
    aliquota_cofins: formatDecimal(data.aliquota_cofins),
    aliquota_ibs_uf: formatDecimal(data.aliquota_ibs_uf),
    aliquota_ibs_municipal: formatDecimal(data.aliquota_ibs_municipal),
    aliquota_cbs: formatDecimal(data.aliquota_cbs),
    produtos_vinculados: Number.isFinite(produtosVinculados) ? produtosVinculados : 0,
  };
}

function buildGrupoFiscalPayload(body) {
  const regimeTributario = regimesPermitidos.has(body?.regime_tributario)
    ? body.regime_tributario
    : 'simples_nacional';
  const icone = iconesPermitidos.has(body?.icone) ? body.icone : 'package';
  const ibsAtivo = Boolean(body?.ibs_ativo);

  return {
    nome: normalizeText(body?.nome, 120),
    icone,
    regime_tributario: regimeTributario,
    ativo: body?.ativo !== false,
    ncm: normalizeNullableDigits(body?.ncm, 8),
    cfop: digitsOnly(body?.cfop, 4),
    cst_icms: regimeTributario === 'regime_normal' ? digitsOnly(body?.cst_icms, 2) : null,
    csosn: regimeTributario === 'simples_nacional' ? digitsOnly(body?.csosn, 3) : null,
    aliquota_icms: parseDecimal(body?.aliquota_icms),
    reducao_icms: parseDecimal(body?.reducao_icms),
    base_icms_st: parseDecimal(body?.base_icms_st),
    cst_pis: digitsOnly(body?.cst_pis, 2),
    aliquota_pis: parseDecimal(body?.aliquota_pis),
    cst_cofins: digitsOnly(body?.cst_cofins, 2),
    aliquota_cofins: parseDecimal(body?.aliquota_cofins),
    ibs_ativo: ibsAtivo,
    cst_ibs: ibsAtivo ? digitsOnly(body?.cst_ibs, 3) : null,
    classificacao_ibs: ibsAtivo ? digitsOnly(body?.classificacao_ibs, 6) : null,
    aliquota_ibs_uf: ibsAtivo ? parseDecimal(body?.aliquota_ibs_uf) : null,
    aliquota_ibs_municipal: ibsAtivo ? parseDecimal(body?.aliquota_ibs_municipal) : null,
    aliquota_cbs: ibsAtivo ? parseDecimal(body?.aliquota_cbs) : null,
  };
}

function validatePayload(payload) {
  if (payload.nome.length < 2) {
    return 'Informe um nome para o grupo fiscal.';
  }

  if (payload.cfop.length !== 4) {
    return 'Informe um CFOP com 4 dígitos.';
  }

  if (payload.regime_tributario === 'simples_nacional' && !payload.csosn) {
    return 'Informe o CSOSN do grupo fiscal.';
  }

  if (payload.regime_tributario === 'regime_normal' && !payload.cst_icms) {
    return 'Informe o CST ICMS do grupo fiscal.';
  }

  if (!payload.cst_pis) {
    return 'Informe o CST PIS.';
  }

  if (!payload.cst_cofins) {
    return 'Informe o CST COFINS.';
  }

  if (payload.ibs_ativo && (!payload.cst_ibs || !payload.classificacao_ibs)) {
    return 'Informe CST e classificação IBS/CBS.';
  }

  return null;
}

async function findUserGrupoFiscal(usuarioId, id) {
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  return GrupoFiscal.findOne({
    where: {
      id: numericId,
      usuario_id: usuarioId,
    },
  });
}

function getProdutosVinculados(grupoFiscal) {
  const data = grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal;
  const produtosVinculados = Number(data?.produtos_vinculados ?? 0);

  return Number.isFinite(produtosVinculados) ? produtosVinculados : 0;
}

function handleGrupoFiscalError(res, error, defaultMessage) {
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      message: 'Já existe um grupo fiscal com este nome.',
    });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({
      message: error.errors?.[0]?.message || 'Dados inválidos para o grupo fiscal.',
    });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

module.exports = {
  async list(req, res) {
    try {
      const [grupos, produtosPorGrupo] = await Promise.all([
        GrupoFiscal.findAll({
          where: {
            usuario_id: req.user.id,
          },
          order: [
            ['created_at', 'ASC'],
            ['id', 'ASC'],
          ],
        }),
        Produto.findAll({
          attributes: [
            'grupo_fiscal_id',
            [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          ],
          where: {
            usuario_id: req.user.id,
          },
          group: ['grupo_fiscal_id'],
          raw: true,
        }),
      ]);
      const countByGrupoId = new Map(
        produtosPorGrupo
          .filter(item => item.grupo_fiscal_id)
          .map(item => [Number(item.grupo_fiscal_id), Number(item.total) || 0])
      );

      return res.json(
        grupos.map(grupo => ({
          ...sanitizeGrupoFiscal(grupo),
          produtos_vinculados: countByGrupoId.get(grupo.id) ?? 0,
        }))
      );
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar grupos fiscais.', detail: error.message });
    }
  },

  async create(req, res) {
    try {
      const payload = buildGrupoFiscalPayload(req.body);
      const validationError = validatePayload(payload);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const grupoFiscal = await GrupoFiscal.create({
        usuario_id: req.user.id,
        ...payload,
      });

      return res.status(201).json(sanitizeGrupoFiscal(grupoFiscal));
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao criar grupo fiscal.');
    }
  },

  async update(req, res) {
    try {
      const grupoFiscal = await findUserGrupoFiscal(req.user.id, req.params.id);

      if (!grupoFiscal) {
        return res.status(404).json({ message: 'Grupo fiscal não encontrado.' });
      }

      const payload = buildGrupoFiscalPayload(req.body);
      const validationError = validatePayload(payload);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      await grupoFiscal.update(payload);

      return res.json(sanitizeGrupoFiscal(grupoFiscal));
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao atualizar grupo fiscal.');
    }
  },

  async remove(req, res) {
    try {
      const grupoFiscal = await findUserGrupoFiscal(req.user.id, req.params.id);

      if (!grupoFiscal) {
        return res.status(404).json({ message: 'Grupo fiscal não encontrado.' });
      }

      const produtosVinculados = await Produto.count({
        where: {
          usuario_id: req.user.id,
          grupo_fiscal_id: grupoFiscal.id,
        },
      });

      if (getProdutosVinculados(grupoFiscal) > 0 || produtosVinculados > 0) {
        return res.status(409).json({
          message: 'Não é possível excluir este grupo porque ele possui produtos vinculados.',
        });
      }

      await grupoFiscal.destroy();

      return res.status(204).send();
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao excluir grupo fiscal.', detail: error.message });
    }
  },
};
