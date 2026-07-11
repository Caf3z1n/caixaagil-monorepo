const { Op } = require('sequelize');
const { DespesaCaixa, Subconta, Usuario } = require('../models');
const { ensureLimitAvailable } = require('../services/assinaturaEntitlementsService');

const permissoesDisponiveis = [
  {
    chave: 'configuracoes',
    titulo: 'Configurações',
    descricao: 'Acessar preferências de operação, emissão fiscal e recursos do sistema.',
  },
  {
    chave: 'grupos_fiscais',
    titulo: 'Grupos fiscais',
    descricao: 'Acessar o cadastro fiscal usado nos produtos.',
  },
  {
    chave: 'produtos',
    titulo: 'Produtos',
    descricao: 'Acessar categorias e cadastro de produtos.',
  },
  {
    chave: 'estoque',
    titulo: 'Estoque',
    descricao: 'Acessar locais de estoque e ajustar saldos.',
  },
  {
    chave: 'conferencia_caixa',
    titulo: 'Conferência de caixa',
    descricao: 'Acessar conferências, lançamentos e fechamento do caixa.',
  },
  {
    chave: 'funcionarios',
    titulo: 'Funcionários',
    descricao: 'Acessar cadastro de funcionários e regras de acesso.',
  },
  {
    chave: 'despesas',
    titulo: 'Despesas',
    descricao: 'Acessar lançamentos e acompanhamento de despesas.',
  },
  {
    chave: 'convenios',
    titulo: 'Clientes',
    descricao: 'Acessar clientes, convênios e recebimentos.',
  },
  {
    chave: 'documentos_fiscais',
    titulo: 'Documentos fiscais',
    descricao: 'Acessar notas, XMLs e relatórios fiscais.',
  },
];

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeNome(nome) {
  return typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
}

function isValidNome(nome) {
  return typeof nome === 'string' && nome.trim().length >= 2 && nome.trim().length <= 80;
}

function isValidSenha(senha) {
  return (
    typeof senha === 'string' &&
    senha.trim().length >= 8 &&
    /[A-Z]/.test(senha) &&
    /[a-z]/.test(senha) &&
    /\d/.test(senha)
  );
}

function normalizePermissoes(value) {
  const allowed = new Set(permissoesDisponiveis.map(permissao => permissao.chave));
  const raw = Array.isArray(value) ? value : [];

  return Array.from(new Set(raw.filter(permissao => allowed.has(permissao))));
}

function sanitizeSubconta(subconta) {
  const data = subconta.get ? subconta.get({ plain: true }) : { ...subconta };
  const registrosVinculados = Number(data.registros_vinculados ?? 0);

  delete data.senha_hash;
  delete data.token_redefinicao_senha;
  delete data.token_redefinicao_senha_expira_em;

  return {
    ...data,
    registros_vinculados: Number.isFinite(registrosVinculados) ? registrosVinculados : 0,
    pode_excluir: registrosVinculados <= 0,
    acao_remocao: registrosVinculados > 0 ? 'desativar' : 'excluir',
    tipo_conta: 'subconta',
  };
}

async function getSubcontaRegistrosVinculados(usuarioId, subcontaId) {
  return DespesaCaixa.count({
    where: {
      usuario_id: usuarioId,
      lancado_por_subconta_id: subcontaId,
    },
  });
}

async function isEmailInUse(email, ignoredSubcontaId = null) {
  const usuario = await Usuario.findOne({ where: { email } });

  if (usuario) {
    return true;
  }

  const where = { email };

  if (ignoredSubcontaId) {
    where.id = { [Op.ne]: ignoredSubcontaId };
  }

  const subconta = await Subconta.unscoped().findOne({ where });

  return Boolean(subconta);
}

function ensureMainAccount(req, res) {
  if (req.subconta) {
    res.status(403).json({
      code: 'MAIN_ACCOUNT_REQUIRED',
      message: 'Somente a conta principal pode gerenciar subcontas.',
    });
    return false;
  }

  return true;
}

module.exports = {
  permissoesDisponiveis,

  async permissions(req, res) {
    return res.json(permissoesDisponiveis);
  },

  async identify(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const email = normalizeEmail(req.body?.email);

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      const emUso = await isEmailInUse(email);

      return res.json({
        disponivel: !emUso,
        email,
        message: emUso ? 'Este e-mail já está em uso.' : 'E-mail disponível.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao verificar e-mail.', detail: error.message });
    }
  },

  async list(req, res) {
    try {
      const subcontas = await Subconta.findAll({
        where: {
          usuario_id: req.user.id,
        },
        order: [
          ['created_at', 'ASC'],
          ['id', 'ASC'],
        ],
      });

      const registrosPorSubconta = new Map(
        await Promise.all(
          subcontas.map(async subconta => [
            subconta.id,
            await getSubcontaRegistrosVinculados(req.user.id, subconta.id),
          ])
        )
      );

      return res.json(
        subcontas.map(subconta =>
          sanitizeSubconta({
            ...(subconta.get ? subconta.get({ plain: true }) : subconta),
            registros_vinculados: registrosPorSubconta.get(subconta.id) ?? 0,
          })
        )
      );
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao listar subcontas.', detail: error.message });
    }
  },

  async create(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const email = normalizeEmail(req.body?.email);
      const nome = normalizeNome(req.body?.nome);
      const senha = req.body?.senha || req.body?.password;
      const permissoes = normalizePermissoes(req.body?.permissoes);

      if (!isValidNome(nome)) {
        return res.status(400).json({ message: 'Informe um nome para a subconta.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      if (await isEmailInUse(email)) {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      if (!isValidSenha(senha)) {
        return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
      }

      await ensureLimitAvailable(req.user.id, 'subcontas_ativas', { bypass: req.user.acesso_suporte });

      const subconta = await Subconta.create({
        usuario_id: req.user.id,
        email,
        nome,
        senha,
        permissoes,
        ativo: true,
      });

      return res.status(201).json({
        subconta: sanitizeSubconta(subconta),
        message: 'Subconta criada.',
      });
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      return res.status(error.statusCode || 500).json({
        code: error.code,
        message: error.message || 'Erro ao criar subconta.',
        detail: error.statusCode ? undefined : error.message,
        entitlements: error.entitlements,
      });
    }
  },

  async updatePermissions(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const subconta = await Subconta.findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!subconta) {
        return res.status(404).json({ message: 'Subconta não encontrada.' });
      }

      subconta.permissoes = normalizePermissoes(req.body?.permissoes);
      await subconta.save();
      const registrosVinculados = await getSubcontaRegistrosVinculados(req.user.id, subconta.id);

      return res.json(sanitizeSubconta({
        ...(subconta.get ? subconta.get({ plain: true }) : subconta),
        registros_vinculados: registrosVinculados,
      }));
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar permissões.', detail: error.message });
    }
  },

  async updateData(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const subconta = await Subconta.findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!subconta) {
        return res.status(404).json({ message: 'Subconta não encontrada.' });
      }

      const email = normalizeEmail(req.body?.email);
      const nome = normalizeNome(req.body?.nome);

      if (!isValidNome(nome)) {
        return res.status(400).json({ message: 'Informe um nome para a subconta.' });
      }

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      if (await isEmailInUse(email, subconta.id)) {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      subconta.nome = nome;
      subconta.email = email;
      await subconta.save();
      const registrosVinculados = await getSubcontaRegistrosVinculados(req.user.id, subconta.id);

      return res.json(sanitizeSubconta({
        ...(subconta.get ? subconta.get({ plain: true }) : subconta),
        registros_vinculados: registrosVinculados,
      }));
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      return res.status(500).json({ message: 'Erro ao atualizar subconta.', detail: error.message });
    }
  },

  async updatePassword(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const subconta = await Subconta.scope('withSenha').findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!subconta) {
        return res.status(404).json({ message: 'Subconta não encontrada.' });
      }

      const senha = req.body?.senha || req.body?.password;

      if (!isValidSenha(senha)) {
        return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
      }

      subconta.senha = senha;
      await subconta.save();
      const registrosVinculados = await getSubcontaRegistrosVinculados(req.user.id, subconta.id);

      return res.json({
        subconta: sanitizeSubconta({
          ...(subconta.get ? subconta.get({ plain: true }) : subconta),
          registros_vinculados: registrosVinculados,
        }),
        message: 'Senha atualizada.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar senha.', detail: error.message });
    }
  },

  async remove(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const subconta = await Subconta.findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!subconta) {
        return res.status(404).json({ message: 'Subconta não encontrada.' });
      }

      const registrosVinculados = await getSubcontaRegistrosVinculados(req.user.id, subconta.id);

      if (registrosVinculados > 0) {
        await subconta.update({ ativo: false });

        return res.json({
          action: 'deactivated',
          subconta: sanitizeSubconta({
            ...(subconta.get ? subconta.get({ plain: true }) : subconta),
            registros_vinculados: registrosVinculados,
          }),
          message: 'Subconta desativada para preservar os registros vinculados.',
        });
      }

      await subconta.destroy();

      return res.json({
        action: 'deleted',
        id: subconta.id,
        message: 'Subconta removida.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao remover subconta.', detail: error.message });
    }
  },

  async activate(req, res) {
    try {
      if (!ensureMainAccount(req, res)) {
        return null;
      }

      const subconta = await Subconta.findOne({
        where: {
          id: req.params.id,
          usuario_id: req.user.id,
        },
      });

      if (!subconta) {
        return res.status(404).json({ message: 'Subconta não encontrada.' });
      }

      if (await isEmailInUse(subconta.email, subconta.id)) {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      if (!subconta.ativo) {
        await ensureLimitAvailable(req.user.id, 'subcontas_ativas', { bypass: req.user.acesso_suporte });

        await subconta.update({ ativo: true });
      }

      const registrosVinculados = await getSubcontaRegistrosVinculados(req.user.id, subconta.id);

      return res.json({
        action: 'activated',
        subconta: sanitizeSubconta({
          ...(subconta.get ? subconta.get({ plain: true }) : subconta),
          registros_vinculados: registrosVinculados,
        }),
        message: 'Subconta ativada.',
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        code: error.code,
        message: error.message || 'Erro ao ativar subconta.',
        detail: error.statusCode ? undefined : error.message,
        entitlements: error.entitlements,
      });
    }
  },
};
