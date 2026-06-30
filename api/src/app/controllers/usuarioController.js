const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { Assinatura, Subconta, Usuario } = require('../models');
const { sendEmail } = require('../services/emailService');
const {
  createAccountVerificationEmail,
  createPasswordResetEmail,
} = require('../services/emailTemplates');
const { getAppUrl, getPublicAssetUrl } = require('../services/urlService');
const {
  getEmailVerifiedAtForNewAccount,
  isEmailVerificationBypassEnabled,
  isEmailVerified,
} = require('../services/emailVerificationPolicyService');
const { getPlatformAccess } = require('../services/assinaturaAccessService');

const expiresInMinutes = 30;
const allowedFields = ['email', 'senha', 'password', 'ativo', 'active'];

const buildPayload = (body = {}) =>
  allowedFields.reduce((acc, field) => {
    if (body[field] !== undefined) acc[field] = body[field];
    return acc;
  }, {});

const normalizePayload = payload => {
  if (payload.email) payload.email = payload.email.trim().toLowerCase();
  if (payload.password !== undefined && payload.senha === undefined) payload.senha = payload.password;
  if (payload.active !== undefined && payload.ativo === undefined) payload.ativo = payload.active;
  delete payload.password;
  delete payload.active;
  return payload;
};

const isValidEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const isValidSenha = senha =>
  typeof senha === 'string' &&
  senha.trim().length >= 8 &&
  /[A-Z]/.test(senha) &&
  /[a-z]/.test(senha) &&
  /\d/.test(senha);

const sanitizeUsuario = usuario => {
  const safeUser = usuario.get ? usuario.get({ plain: true }) : { ...usuario };
  delete safeUser.senha_hash;
  delete safeUser.token_verificacao_email;
  delete safeUser.token_verificacao_email_expira_em;
  delete safeUser.token_redefinicao_senha;
  delete safeUser.token_redefinicao_senha_expira_em;
  return safeUser;
};

async function findAccessAccountByEmail(email) {
  const usuario = await Usuario.scope('withSenha').findOne({ where: { email } });

  if (usuario) {
    return {
      conta: usuario,
      tipo: 'usuario',
      usuarioId: usuario.id,
    };
  }

  const subconta = await Subconta.scope('withSenha').findOne({ where: { email } });

  if (!subconta) {
    return null;
  }

  return {
    conta: subconta,
    tipo: 'subconta',
    usuarioId: subconta.usuario_id,
  };
}

async function emailJaEstaEmUso(email) {
  const usuario = await Usuario.findOne({ where: { email } });

  if (usuario) {
    return true;
  }

  const subconta = await Subconta.findOne({ where: { email } });

  return Boolean(subconta);
}

const handlePersistenceError = (res, error, defaultMessage) => {
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'E-mail já existe.' });
  }

  if (error.name === 'SequelizeValidationError') {
    const notNullError = error.errors?.find?.(err => err.type === 'notNull Violation');
    if (notNullError) {
      const field = notNullError.path === 'senha_hash' ? 'senha' : notNullError.path;
      return res.status(400).json({ message: `${field} é obrigatória.` });
    }

    return res.status(400).json({ message: error.errors?.[0]?.message || 'Dados inválidos.' });
  }

  return res.status(500).json({ message: defaultMessage, detail: error.message });
};

const generateTokenExpiration = () => new Date(Date.now() + expiresInMinutes * 60 * 1000);

const invalidPasswordResetMessage = 'Link de redefinição inválido ou expirado.';

const buildValidPasswordResetWhere = (email, token, now = new Date()) => ({
  email,
  token_redefinicao_senha: token,
  token_redefinicao_senha_expira_em: {
    [Op.gt]: now,
  },
});

async function clearExpiredPasswordResetToken(email, token) {
  if (!isValidEmail(email) || !token) {
    return;
  }

  await Usuario.update(
    {
      token_redefinicao_senha: null,
      token_redefinicao_senha_expira_em: null,
    },
    {
      where: {
        email,
        token_redefinicao_senha: token,
        token_redefinicao_senha_expira_em: {
          [Op.lte]: new Date(),
        },
      },
    }
  );

  await Subconta.update(
    {
      token_redefinicao_senha: null,
      token_redefinicao_senha_expira_em: null,
    },
    {
      where: {
        email,
        token_redefinicao_senha: token,
        token_redefinicao_senha_expira_em: {
          [Op.lte]: new Date(),
        },
      },
    }
  );
}

async function findValidPasswordResetAccount(email, token) {
  const where = buildValidPasswordResetWhere(email, token);
  const usuario = await Usuario.scope('withSenha').findOne({ where });

  if (usuario) {
    return {
      conta: usuario,
      tipo: 'usuario',
    };
  }

  const subconta = await Subconta.scope('withSenha').findOne({ where });

  if (!subconta) {
    return null;
  }

  return {
    conta: subconta,
    tipo: 'subconta',
  };
}

module.exports = {
  async list(req, res) {
    try {
      const usuarios = await Usuario.findAll({ order: [['id', 'ASC']] });
      res.json(usuarios);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao listar usuários.', detail: error.message });
    }
  },

  async show(req, res) {
    try {
      const usuario = await Usuario.findByPk(req.params.id);
      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }
      res.json(usuario);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar usuário.', detail: error.message });
    }
  },

  async create(req, res) {
    try {
      const payload = normalizePayload(buildPayload(req.body));

      if (!isValidEmail(payload.email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      if (!isValidSenha(payload.senha)) {
        return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
      }

      if (await emailJaEstaEmUso(payload.email)) {
        return res.status(409).json({ message: 'E-mail já existe.' });
      }

      const created = await Usuario.create({
        ...payload,
        email_verificado_em: getEmailVerifiedAtForNewAccount(),
      });
      res.status(201).json(sanitizeUsuario(created));
    } catch (error) {
      handlePersistenceError(res, error, 'Erro ao criar usuário.');
    }
  },

  async identify(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      const account = await findAccessAccountByEmail(email);
      const usuarioId = account?.usuarioId;
      const assinaturaAtiva = usuarioId
        ? await Assinatura.findOne({
            where: {
              usuario_id: usuarioId,
              status: 'ativa',
            },
          })
        : null;
      const platformAccess = usuarioId ? await getPlatformAccess(usuarioId) : { allowed: false };

      return res.json({
        existe: Boolean(account),
        email,
        tipoConta: account?.tipo || null,
        emailVerificado: account?.tipo === 'subconta' ? true : isEmailVerified(account?.conta),
        assinaturaAtiva: Boolean(assinaturaAtiva),
        acessoPlataforma: Boolean(platformAccess.allowed),
        permissoes: account?.tipo === 'subconta' ? account.conta.permissoes || [] : ['*'],
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao identificar usuário.', detail: error.message });
    }
  },

  async sendVerification(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      const account = await findAccessAccountByEmail(email);

      if (!account) {
        return res.status(404).json({ message: 'Conta não encontrada.' });
      }

      if (account.tipo !== 'usuario') {
        return res.status(400).json({ message: 'Subcontas não exigem verificação de e-mail.' });
      }

      if (isEmailVerificationBypassEnabled()) {
        account.conta.email_verificado_em = account.conta.email_verificado_em || new Date();
        account.conta.token_verificacao_email = null;
        account.conta.token_verificacao_email_expira_em = null;
        await account.conta.save();

        return res.json({
          id: null,
          message: 'Verificação de e-mail dispensada temporariamente para testes.',
          tipoConta: account.tipo,
        });
      }

      const token = randomUUID();
      account.conta.token_verificacao_email = token;
      account.conta.token_verificacao_email_expira_em = generateTokenExpiration();
      await account.conta.save();

      const verificationUrl = new URL('/verificar-email', getAppUrl(req));
      verificationUrl.searchParams.set('token', token);
      verificationUrl.searchParams.set('email', email);

      const emailContent = createAccountVerificationEmail({
        expiresInMinutes,
        logoUrl: getPublicAssetUrl('/brand/logo-caixa-agil.png', req),
        recipientEmail: email,
        verificationUrl: verificationUrl.toString(),
      });

      const result = await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      return res.json({
        id: result.id,
        message: 'E-mail de verificação enviado com sucesso.',
        tipoConta: account.tipo,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível enviar o e-mail de verificação.',
      });
    }
  },

  async confirmVerification(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

      if (!isValidEmail(email) || !token) {
        return res.status(400).json({ message: 'Link de verificação inválido.' });
      }

      const account = await findAccessAccountByEmail(email);

      if (
        !account ||
        account.tipo !== 'usuario' ||
        account.conta.token_verificacao_email !== token ||
        !account.conta.token_verificacao_email_expira_em ||
        account.conta.token_verificacao_email_expira_em < new Date()
      ) {
        return res.status(400).json({ message: 'Link de verificação inválido ou expirado.' });
      }

      account.conta.email_verificado_em = new Date();
      account.conta.token_verificacao_email = null;
      account.conta.token_verificacao_email_expira_em = null;
      await account.conta.save();

      return res.json({
        message: 'Conta verificada com sucesso.',
        tipoConta: account.tipo,
        usuario: sanitizeUsuario(account.conta),
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao verificar e-mail.', detail: error.message });
    }
  },

  async requestPasswordReset(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      const account = await findAccessAccountByEmail(email);
      const safeMessage = 'Se a conta existir, enviaremos um link de redefinição.';

      if (!account) {
        return res.json({ message: safeMessage });
      }

      const token = randomUUID();
      account.conta.token_redefinicao_senha = token;
      account.conta.token_redefinicao_senha_expira_em = generateTokenExpiration();
      await account.conta.save();

      const resetUrl = new URL('/redefinir-senha', getAppUrl(req));
      resetUrl.searchParams.set('token', token);
      resetUrl.searchParams.set('email', email);

      const emailContent = createPasswordResetEmail({
        expiresInMinutes,
        logoUrl: getPublicAssetUrl('/brand/logo-caixa-agil.png', req),
        recipientEmail: email,
        resetUrl: resetUrl.toString(),
      });

      await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      return res.json({ message: 'Link de redefinição enviado com sucesso.' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível enviar o e-mail de redefinição.',
      });
    }
  },

  async validatePasswordReset(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

      if (!isValidEmail(email) || !token) {
        return res.status(400).json({ message: invalidPasswordResetMessage });
      }

      const account = await findValidPasswordResetAccount(email, token);

      if (!account) {
        await clearExpiredPasswordResetToken(email, token);
        return res.status(400).json({ message: invalidPasswordResetMessage });
      }

      return res.json({
        message: 'Link de redefinição válido.',
        expiraEm: account.conta.token_redefinicao_senha_expira_em,
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao validar link de redefinição.', detail: error.message });
    }
  },

  async resetPassword(req, res) {
    try {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
      const senha = req.body?.senha || req.body?.password;

      if (!isValidEmail(email) || !token) {
        return res.status(400).json({ message: 'Link de redefinição inválido.' });
      }

      if (!isValidSenha(senha)) {
        return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
      }

      const account = await findValidPasswordResetAccount(email, token);

      if (!account) {
        await clearExpiredPasswordResetToken(email, token);
        return res.status(400).json({ message: invalidPasswordResetMessage });
      }

      const senhaHash = await bcrypt.hash(senha, 10);
      account.conta.senha_hash = senhaHash;
      account.conta.token_redefinicao_senha = null;
      account.conta.token_redefinicao_senha_expira_em = null;
      account.conta.ativo = true;
      await account.conta.save();

      return res.json({ message: 'Senha redefinida com sucesso.' });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao redefinir senha', detail: error.message });
    }
  },

  async update(req, res) {
    try {
      const usuario = await Usuario.scope('withSenha').findByPk(req.params.id);
      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      const payload = normalizePayload(buildPayload(req.body));

      if (payload.email !== undefined) usuario.email = payload.email;
      if (payload.ativo !== undefined) usuario.ativo = payload.ativo;

      if (Object.prototype.hasOwnProperty.call(payload, 'senha')) {
        if (!isValidSenha(payload.senha)) {
          return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
        }
        usuario.senha_hash = await bcrypt.hash(payload.senha, 10);
      }

      await usuario.save();
      const sanitized = await Usuario.findByPk(usuario.id);

      res.json(sanitized);
    } catch (error) {
      handlePersistenceError(res, error, 'Erro ao atualizar usuario');
    }
  },

  async remove(req, res) {
    try {
      const usuario = await Usuario.findByPk(req.params.id);
      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      await usuario.destroy();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: 'Erro ao remover usuario', detail: error.message });
    }
  },
};
