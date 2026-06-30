const jwt = require('jsonwebtoken');
const { Subconta, Usuario } = require('../models');
const authConfig = require('../../config/auth');
const { isEmailVerified } = require('../services/emailVerificationPolicyService');
const { getPlatformAccess } = require('../services/assinaturaAccessService');

const buildToken = payload =>
  jwt.sign(payload, authConfig.secret, {
    expiresIn: authConfig.expiresIn,
  });

function sanitizeAccessAccount(account) {
  const safeAccount = account.get ? account.get({ plain: true }) : { ...account };
  delete safeAccount.senha_hash;
  delete safeAccount.token_verificacao_email;
  delete safeAccount.token_verificacao_email_expira_em;
  delete safeAccount.token_redefinicao_senha;
  delete safeAccount.token_redefinicao_senha_expira_em;
  return safeAccount;
}

module.exports = {
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
