const { createHash } = require('crypto');
const { Op } = require('sequelize');
const { Caixa, Funcionario } = require('../models');

function normalizeText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizePassword(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function hashEmployeeCode(value) {
  return createHash('sha256').update(normalizePassword(value)).digest('hex');
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

function sanitizeFuncionario(funcionario, { includeCodeHash = false, registros_vinculados = undefined } = {}) {
  const data = funcionario.get ? funcionario.get({ plain: true }) : funcionario;
  const registrosVinculados = Number(registros_vinculados ?? data.registros_vinculados ?? 0);

  return {
    id: data.id,
    nome: data.nome,
    codigo: data.codigo || '',
    ativo: Boolean(data.ativo),
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
    ...(includeCodeHash ? { codigo_hash: data.codigo_hash } : {}),
    created_at: toIso(data.created_at || data.createdAt),
    updated_at: toIso(data.updated_at || data.updatedAt),
  };
}

async function findUserFuncionario(usuarioId, id, options = {}) {
  const funcionarioId = Number(id);

  if (!Number.isInteger(funcionarioId) || funcionarioId <= 0) {
    return null;
  }

  return Funcionario.findOne({
    where: {
      id: funcionarioId,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function ensureUniqueCode(usuarioId, code, ignoredId = null) {
  const codigoHash = hashEmployeeCode(code);
  const conflict = await Funcionario.findOne({
    where: {
      usuario_id: usuarioId,
      codigo_hash: codigoHash,
      ativo: true,
      ...(ignoredId ? { id: { [Op.ne]: ignoredId } } : {}),
    },
  });

  if (conflict) {
    const error = new Error('Esta senha já está em uso por outro funcionário.');
    error.status = 409;
    error.code = 'EMPLOYEE_CODE_IN_USE';
    throw error;
  }

  return codigoHash;
}

async function getFuncionarioRegistrosVinculados(usuarioId, funcionarioId) {
  const stringId = String(funcionarioId);

  return Caixa.count({
    where: {
      usuario_id: usuarioId,
      [Op.or]: [
        { funcionario_abertura_id: stringId },
        { funcionario_fechamento_id: stringId },
      ],
    },
  });
}

function handleFuncionarioError(res, error, defaultMessage) {
  if (error.status) {
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
    });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'Esta senha já está em uso por outro funcionário.' });
  }

  if (error.name === 'SequelizeValidationError') {
    return res.status(400).json({ message: error.errors?.[0]?.message || 'Dados inválidos para o funcionário.' });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
}

module.exports = {
  sanitizeFuncionario,

  async list(req, res) {
    try {
      const funcionarios = await Funcionario.findAll({
        where: {
          usuario_id: req.user.id,
        },
        order: [
          ['ativo', 'DESC'],
          ['nome', 'ASC'],
          ['id', 'ASC'],
        ],
      });
      const registrosPorFuncionario = new Map(
        await Promise.all(
          funcionarios.map(async funcionario => [
            funcionario.id,
            await getFuncionarioRegistrosVinculados(req.user.id, funcionario.id),
          ])
        )
      );

      return res.json({
        funcionarios: funcionarios.map(funcionario =>
          sanitizeFuncionario(funcionario, {
            registros_vinculados: registrosPorFuncionario.get(funcionario.id) ?? 0,
          })
        ),
        resumo: {
          ativos: funcionarios.filter(funcionario => funcionario.ativo).length,
        },
      });
    } catch (error) {
      return handleFuncionarioError(res, error, 'Erro ao listar funcionários.');
    }
  },

  async create(req, res) {
    try {
      const nome = normalizeText(req.body?.nome || req.body?.name, 120);
      const codigo = normalizePassword(req.body?.codigo ?? req.body?.code);

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do funcionário.' });
      }

      if (!codigo) {
        return res.status(400).json({ message: 'Informe a senha do funcionário.' });
      }

      const codigoHash = await ensureUniqueCode(req.user.id, codigo);
      const funcionario = await Funcionario.create({
        usuario_id: req.user.id,
        nome,
        codigo,
        codigo_hash: codigoHash,
        ativo: true,
      });

      return res.status(201).json(sanitizeFuncionario(funcionario));
    } catch (error) {
      return handleFuncionarioError(res, error, 'Erro ao criar funcionário.');
    }
  },

  async update(req, res) {
    try {
      const funcionario = await findUserFuncionario(req.user.id, req.params.id);

      if (!funcionario) {
        return res.status(404).json({ message: 'Funcionário não encontrado.' });
      }

      const nome = normalizeText(req.body?.nome || req.body?.name, 120);
      const hasCodigo = Object.prototype.hasOwnProperty.call(req.body || {}, 'codigo')
        || Object.prototype.hasOwnProperty.call(req.body || {}, 'code');
      const codigo = hasCodigo ? normalizePassword(req.body?.codigo ?? req.body?.code) : '';
      const values = {};

      if (nome.length < 2) {
        return res.status(400).json({ message: 'Informe o nome do funcionário.' });
      }

      values.nome = nome;

      if (hasCodigo) {
        if (!codigo) {
          return res.status(400).json({ message: 'Informe a senha do funcionário.' });
        }

        values.codigo_hash = await ensureUniqueCode(req.user.id, codigo, funcionario.id);
        values.codigo = codigo;
      }

      await funcionario.update(values);
      const registrosVinculados = await getFuncionarioRegistrosVinculados(req.user.id, funcionario.id);

      return res.json(sanitizeFuncionario(funcionario, { registros_vinculados: registrosVinculados }));
    } catch (error) {
      return handleFuncionarioError(res, error, 'Erro ao atualizar funcionário.');
    }
  },

  async delete(req, res) {
    try {
      const funcionario = await findUserFuncionario(req.user.id, req.params.id);

      if (!funcionario) {
        return res.status(404).json({ message: 'Funcionário não encontrado.' });
      }

      const registrosVinculados = await getFuncionarioRegistrosVinculados(req.user.id, funcionario.id);

      if (registrosVinculados > 0) {
        await funcionario.update({
          ativo: false,
        });

        return res.json({
          action: 'deactivated',
          funcionario: sanitizeFuncionario(funcionario, { registros_vinculados: registrosVinculados }),
          message: 'Funcionário desativado para preservar os caixas vinculados.',
        });
      }

      await funcionario.destroy();

      return res.json({
        action: 'deleted',
        id: funcionario.id,
        message: 'Funcionário excluído.',
      });
    } catch (error) {
      return handleFuncionarioError(res, error, 'Erro ao excluir funcionário.');
    }
  },

  async activate(req, res) {
    try {
      const funcionario = await findUserFuncionario(req.user.id, req.params.id);

      if (!funcionario) {
        return res.status(404).json({ message: 'Funcionário não encontrado.' });
      }

      await ensureUniqueCode(req.user.id, funcionario.codigo, funcionario.id);

      if (!funcionario.ativo) {
        await funcionario.update({ ativo: true });
      }

      const registrosVinculados = await getFuncionarioRegistrosVinculados(req.user.id, funcionario.id);

      return res.json({
        action: 'activated',
        funcionario: sanitizeFuncionario(funcionario, { registros_vinculados: registrosVinculados }),
        message: 'Funcionário ativado.',
      });
    } catch (error) {
      return handleFuncionarioError(res, error, 'Erro ao ativar funcionário.');
    }
  },
};
