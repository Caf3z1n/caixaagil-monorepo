const { GrupoFiscal, Produto } = require('../models');
const sequelize = require('../../database');
const { ensureFeature } = require('../services/assinaturaEntitlementsService');
const configuracaoSistemaService = require('../services/configuracaoSistemaService');

const regimesPermitidos = new Set(['simples_nacional', 'regime_normal']);
const cfopsVendaComumNfce = new Set(['5101', '5102', '5103', '5104', '5115']);
const cfopsVendaStNfce = new Set(['5405', '5656', '5667']);
const cstsVendaComumNfce = new Set(['00', '20', '40', '41', '90']);
const csosnsVendaComumNfce = new Set(['101', '102', '103', '300', '400']);
const csosnsVendaMeiNfce = new Set(['102', '300']);
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

function getFiscalTaxRegimeOrError(fiscalTaxRegime) {
  if (fiscalTaxRegime?.regime_tributario) {
    return null;
  }

  return 'Informe o regime tributário no cadastro fiscal da empresa antes de criar grupos fiscais.';
}

function sanitizeGrupoFiscal(grupoFiscal, fiscalTaxRegime = null) {
  const data = grupoFiscal.get ? grupoFiscal.get({ plain: true }) : { ...grupoFiscal };
  const produtosVinculados = Number(data.produtos_vinculados ?? 0);
  const regimeTributario = fiscalTaxRegime?.regime_tributario || data.regime_tributario;

  return {
    ...data,
    regime_tributario: regimeTributario,
    aliquota_icms: formatDecimal(data.aliquota_icms),
    reducao_icms: formatDecimal(data.reducao_icms),
    base_icms_st: formatDecimal(data.base_icms_st),
    aliquota_pis: formatDecimal(data.aliquota_pis),
    aliquota_cofins: formatDecimal(data.aliquota_cofins),
    aliquota_ibs_uf: formatDecimal(data.aliquota_ibs_uf),
    aliquota_ibs_municipal: formatDecimal(data.aliquota_ibs_municipal),
    aliquota_cbs: formatDecimal(data.aliquota_cbs),
    produtos_vinculados: Number.isFinite(produtosVinculados) ? produtosVinculados : 0,
    pode_excluir: produtosVinculados <= 0,
    acao_remocao: produtosVinculados > 0 ? 'desativar' : 'excluir',
  };
}

function buildGrupoFiscalPayload(body, fiscalTaxRegime) {
  const regimeTributario = regimesPermitidos.has(fiscalTaxRegime?.regime_tributario)
    ? fiscalTaxRegime.regime_tributario
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

function validatePayload(payload, fiscalTaxRegime = null) {
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

  const cfopTaxCodeValidationError = getCfopTaxCodeValidationError(payload, fiscalTaxRegime);

  if (cfopTaxCodeValidationError) {
    return cfopTaxCodeValidationError;
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

function getCfopTaxCodeValidationError(payload, fiscalTaxRegime = null) {
  if (payload.regime_tributario === 'simples_nacional') {
    if (fiscalTaxRegime?.crt === '4') {
      if (!csosnsVendaMeiNfce.has(payload.csosn)) {
        return 'MEI deve usar CSOSN 102 ou 300 para venda no PDV/NFC-e.';
      }

      if (payload.cfop !== '5102') {
        return 'MEI deve usar CFOP 5102 para venda interna no PDV/NFC-e.';
      }

      return null;
    }

    if (payload.csosn === '500' && !cfopsVendaStNfce.has(payload.cfop)) {
      return 'CSOSN 500 deve usar CFOP de substituição tributária para NFC-e: 5405, 5656 ou 5667.';
    }

    if (cfopsVendaStNfce.has(payload.cfop) && payload.csosn !== '500') {
      return 'CFOP de substituição tributária exige CSOSN 500 no Simples Nacional.';
    }

    if (csosnsVendaComumNfce.has(payload.csosn) && !cfopsVendaComumNfce.has(payload.cfop)) {
      return 'Este CSOSN deve usar CFOP de venda comum para NFC-e: 5101, 5102, 5103, 5104 ou 5115.';
    }

    return null;
  }

  if (payload.cst_icms === '60' && !cfopsVendaStNfce.has(payload.cfop)) {
    return 'CST ICMS 60 deve usar CFOP de substituição tributária para NFC-e: 5405, 5656 ou 5667.';
  }

  if (cfopsVendaStNfce.has(payload.cfop) && payload.cst_icms !== '60') {
    return 'CFOP de substituição tributária exige CST ICMS 60 no regime normal.';
  }

  if (cstsVendaComumNfce.has(payload.cst_icms) && !cfopsVendaComumNfce.has(payload.cfop)) {
    return 'Este CST ICMS deve usar CFOP de venda comum para NFC-e: 5101, 5102, 5103, 5104 ou 5115.';
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
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message || defaultMessage,
      entitlements: error.entitlements,
    });
  }

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
  async showFiscalConfiguration(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      return res.json({
        crt: fiscalTaxRegime?.crt || '',
        regime_tributario: fiscalTaxRegime?.regime_tributario || null,
        usa_csosn: Boolean(fiscalTaxRegime?.usa_csosn),
        usa_cst_icms: Boolean(fiscalTaxRegime?.usa_cst_icms),
      });
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao carregar configuração fiscal dos grupos.');
    }
  },

  async list(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const [grupos, produtosPorGrupo, fiscalTaxRegime] = await Promise.all([
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
        configuracaoSistemaService.getFiscalTaxRegime(req.user.id),
      ]);
      const countByGrupoId = new Map(
        produtosPorGrupo
          .filter(item => item.grupo_fiscal_id)
          .map(item => [Number(item.grupo_fiscal_id), Number(item.total) || 0])
      );

      return res.json(
        grupos.map(grupo => ({
          ...sanitizeGrupoFiscal(grupo, fiscalTaxRegime),
          produtos_vinculados: countByGrupoId.get(grupo.id) ?? 0,
        }))
      );
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao listar grupos fiscais.');
    }
  },

  async create(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);
      const fiscalTaxRegimeError = getFiscalTaxRegimeOrError(fiscalTaxRegime);

      if (fiscalTaxRegimeError) {
        return res.status(400).json({ message: fiscalTaxRegimeError });
      }

      const payload = buildGrupoFiscalPayload(req.body, fiscalTaxRegime);
      const validationError = validatePayload(payload, fiscalTaxRegime);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      const grupoFiscal = await GrupoFiscal.create({
        usuario_id: req.user.id,
        ...payload,
      });

      return res.status(201).json(sanitizeGrupoFiscal(grupoFiscal, fiscalTaxRegime));
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao criar grupo fiscal.');
    }
  },

  async update(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const grupoFiscal = await findUserGrupoFiscal(req.user.id, req.params.id);

      if (!grupoFiscal) {
        return res.status(404).json({ message: 'Grupo fiscal não encontrado.' });
      }

      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);
      const fiscalTaxRegimeError = getFiscalTaxRegimeOrError(fiscalTaxRegime);

      if (fiscalTaxRegimeError) {
        return res.status(400).json({ message: fiscalTaxRegimeError });
      }

      const payload = buildGrupoFiscalPayload(req.body, fiscalTaxRegime);
      const validationError = validatePayload(payload, fiscalTaxRegime);

      if (validationError) {
        return res.status(400).json({ message: validationError });
      }

      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'ativo')) {
        payload.ativo = grupoFiscal.ativo;
      }

      await grupoFiscal.update(payload);
      const produtosVinculados = await Produto.count({
        where: {
          usuario_id: req.user.id,
          grupo_fiscal_id: grupoFiscal.id,
        },
      });

      return res.json(sanitizeGrupoFiscal({
        ...(grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal),
        produtos_vinculados: produtosVinculados,
      }, fiscalTaxRegime));
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao atualizar grupo fiscal.');
    }
  },

  async remove(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

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
      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      if (getProdutosVinculados(grupoFiscal) > 0 || produtosVinculados > 0) {
        await grupoFiscal.update({ ativo: false });

        return res.json({
          action: 'deactivated',
          grupo_fiscal: sanitizeGrupoFiscal({
            ...(grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal),
            ativo: false,
            produtos_vinculados: produtosVinculados,
          }, fiscalTaxRegime),
          message: 'Grupo fiscal desativado para preservar os produtos vinculados.',
        });
      }

      await grupoFiscal.destroy();

      return res.json({
        action: 'deleted',
        id: grupoFiscal.id,
        message: 'Grupo fiscal excluído.',
      });
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao excluir grupo fiscal.');
    }
  },

  async activate(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

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
      const fiscalTaxRegime = await configuracaoSistemaService.getFiscalTaxRegime(req.user.id);

      if (!grupoFiscal.ativo) {
        await grupoFiscal.update({ ativo: true });
      }

      return res.json({
        action: 'activated',
        grupo_fiscal: sanitizeGrupoFiscal({
          ...(grupoFiscal.get ? grupoFiscal.get({ plain: true }) : grupoFiscal),
          ativo: true,
          produtos_vinculados: produtosVinculados,
        }, fiscalTaxRegime),
        message: 'Grupo fiscal ativado.',
      });
    } catch (error) {
      return handleGrupoFiscalError(res, error, 'Erro ao ativar grupo fiscal.');
    }
  },
};
