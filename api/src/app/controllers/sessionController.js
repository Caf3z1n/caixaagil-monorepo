const jwt = require('jsonwebtoken');
const sequelize = require('../../database');
const { Administrador, Subconta, Usuario } = require('../models');
const authConfig = require('../../config/auth');
const { isEmailVerified } = require('../services/emailVerificationPolicyService');
const { getPlatformAccess } = require('../services/assinaturaAccessService');
const {
  SESSAO_ACESSO_SUPORTE_SEGUNDOS,
  isSupportCodeHashValid,
} = require('../services/acessoSuporteService');

const buildToken = payload =>
  jwt.sign(payload, authConfig.secret, {
    expiresIn: authConfig.expiresIn,
  });

const buildSupportToken = payload =>
  jwt.sign(payload, authConfig.secret, {
    expiresIn: SESSAO_ACESSO_SUPORTE_SEGUNDOS,
  });

function sanitizeAccessAccount(account) {
  const safeAccount = account.get ? account.get({ plain: true }) : { ...account };
  delete safeAccount.senha_hash;
  delete safeAccount.token_verificacao_email;
  delete safeAccount.token_verificacao_email_expira_em;
  delete safeAccount.token_redefinicao_senha;
  delete safeAccount.token_redefinicao_senha_expira_em;
  delete safeAccount.token_troca_email;
  delete safeAccount.token_troca_email_expira_em;
  delete safeAccount.codigo_acesso_suporte_hash;
  delete safeAccount.codigo_acesso_suporte_expira_em;
  delete safeAccount.codigo_acesso_suporte_admin_id;
  return safeAccount;
}

module.exports = {
  async createSupport(req, res) {
    const usuarioId = Number(req.body?.usuario_id || req.body?.usuarioId || req.body?.usuario);
    const codigo = req.body?.codigo;

    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !codigo) {
      return res.status(400).json({
        code: 'SUPPORT_ACCESS_INVALID',
        message: 'Código de acesso administrativo inválido.',
      });
    }

    try {
      const acesso = await sequelize.transaction(async transaction => {
        const usuario = await Usuario.unscoped().findByPk(usuarioId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!usuario || !usuario.ativo) {
          return null;
        }

        const expiraEm = new Date(usuario.codigo_acesso_suporte_expira_em);
        const codigoValido =
          usuario.codigo_acesso_suporte_hash &&
          !Number.isNaN(expiraEm.getTime()) &&
          expiraEm > new Date() &&
          isSupportCodeHashValid(codigo, usuario.codigo_acesso_suporte_hash);

        if (!codigoValido) {
          return null;
        }

        const administrador = await Administrador.findOne({
          where: {
            ativo: true,
            id: usuario.codigo_acesso_suporte_admin_id,
          },
          transaction,
        });

        if (!administrador) {
          return null;
        }

        usuario.codigo_acesso_suporte_hash = null;
        usuario.codigo_acesso_suporte_expira_em = null;
        usuario.codigo_acesso_suporte_admin_id = null;
        await usuario.save({ transaction });

        return {
          administrador,
          usuario,
        };
      });

      if (!acesso) {
        return res.status(401).json({
          code: 'SUPPORT_ACCESS_EXPIRED',
          message: 'O código expirou ou já foi utilizado. Gere um novo código no painel administrativo.',
        });
      }

      const sessaoExpiraEm = new Date(Date.now() + SESSAO_ACESSO_SUPORTE_SEGUNDOS * 1000);
      const token = buildSupportToken({
        acesso_suporte: true,
        admin_id: acesso.administrador.id,
        email: acesso.usuario.email,
        id: acesso.usuario.id,
        tipo_conta: 'usuario',
      });

      return res.json({
        suporte: {
          administrador_id: acesso.administrador.id,
          administrador_nome: acesso.administrador.nome,
          expira_em: sessaoExpiraEm,
        },
        token,
        user: {
          ...sanitizeAccessAccount(acesso.usuario),
          tipo_conta: 'usuario',
          permissoes: ['*'],
        },
      });
    } catch (error) {
      return res.status(500).json({
        message: 'Não foi possível iniciar o acesso administrativo.',
        detail: error.message,
      });
    }
  },

  async create(req, res) {
    const { email, password, senha } = req.body;
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const senhaInformada = senha || password;

    if (!normalizedEmail || !senhaInformada) {
      return res.status(400).json({ message: 'E-mail e senha são obrigatórios.' });
    }

    const usuario = await Usuario.scope('withSenha').findOne({
      where: { email: normalizedEmail },
    });

    if (usuario) {
      const senhaValida = await usuario.checkPassword(senhaInformada);

      if (!senhaValida) {
        return res.status(401).json({ message: 'Senha inválida.' });
      }

      if (!usuario.ativo) {
        return res.status(403).json({ message: 'Usuário inativo.' });
      }

      if (!isEmailVerified(usuario)) {
        return res.status(403).json({
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Confirme seu e-mail antes de acessar a plataforma.',
        });
      }

      const platformAccess = await getPlatformAccess(usuario.id);

      if (!platformAccess.allowed) {
        return res.status(403).json({
          code: 'SUBSCRIPTION_REQUIRED',
          message: 'Finalize a contratação de um plano para liberar o acesso.',
        });
      }

      const token = buildToken({
        id: usuario.id,
        email: usuario.email,
        tipo_conta: 'usuario',
      });

      return res.json({
        user: {
          ...sanitizeAccessAccount(usuario),
          tipo_conta: 'usuario',
          permissoes: ['*'],
        },
        token,
      });
    }

    const subconta = await Subconta.scope('withSenha').findOne({
      where: { email: normalizedEmail },
    });

    if (!subconta) {
      return res.status(401).json({ message: 'Conta não encontrada.' });
    }

    const senhaValida = await subconta.checkPassword(senhaInformada);

    if (!senhaValida) {
      return res.status(401).json({ message: 'Senha inválida.' });
    }

    if (!subconta.ativo) {
      return res.status(403).json({ message: 'Subconta inativa.' });
    }

    const usuarioPrincipal = await Usuario.findByPk(subconta.usuario_id);

    if (!usuarioPrincipal || !usuarioPrincipal.ativo) {
      return res.status(403).json({ message: 'Conta principal inativa.' });
    }

    const platformAccess = await getPlatformAccess(usuarioPrincipal.id);

    if (!platformAccess.allowed) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'A conta principal precisa de uma assinatura ativa.',
      });
    }

    subconta.ultimo_acesso_em = new Date();
    await subconta.save();

    const token = buildToken({
      id: usuarioPrincipal.id,
      email: subconta.email,
      subconta_id: subconta.id,
      tipo_conta: 'subconta',
    });

    return res.json({
      user: {
        ...sanitizeAccessAccount(subconta),
        usuario_id: usuarioPrincipal.id,
        tipo_conta: 'subconta',
        permissoes: subconta.permissoes || [],
      },
      token,
    });
  },
};
