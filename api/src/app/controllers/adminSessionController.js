const jwt = require('jsonwebtoken');
const { Administrador } = require('../models');
const authConfig = require('../../config/auth');

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function sanitizeAdministrador(administrador) {
  const data = administrador.get ? administrador.get({ plain: true }) : { ...administrador };

  delete data.senha_hash;

  return data;
}

function buildAdminToken(administrador) {
  return jwt.sign(
    {
      admin_id: administrador.id,
      email: administrador.email,
      tipo: 'admin',
    },
    authConfig.adminSecret,
    {
      expiresIn: authConfig.adminExpiresIn,
    }
  );
}

module.exports = {
  async create(req, res) {
    const email = normalizeEmail(req.body?.email);
    const senha = req.body?.senha || req.body?.password;

    if (!email || !senha) {
      return res.status(400).json({ message: 'E-mail e senha sao obrigatorios.' });
    }

    const administrador = await Administrador.scope('withSenha').findOne({ where: { email } });

    if (!administrador) {
      return res.status(401).json({ message: 'Credenciais administrativas invalidas.' });
    }

    const senhaValida = await administrador.checkPassword(senha);

    if (!senhaValida) {
      return res.status(401).json({ message: 'Credenciais administrativas invalidas.' });
    }

    if (!administrador.ativo) {
      return res.status(403).json({ message: 'Administrador inativo.' });
    }

    administrador.ultimo_acesso_em = new Date();
    await administrador.save();

    return res.json({
      administrador: sanitizeAdministrador(administrador),
      token: buildAdminToken(administrador),
    });
  },
};
