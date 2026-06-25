const jwt = require('jsonwebtoken');
const authConfig = require('../../config/auth');
const { Administrador } = require('../models');

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token administrativo nao fornecido.' });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token administrativo mal formatado.' });
  }

  try {
    const decoded = jwt.verify(token, authConfig.adminSecret);
    const adminId = decoded.admin_id || decoded.id;

    if (decoded.tipo !== 'admin' || !adminId) {
      return res.status(401).json({ message: 'Token administrativo invalido.' });
    }

    const administrador = await Administrador.findByPk(adminId, {
      attributes: ['id', 'nome', 'email', 'ativo', 'ultimo_acesso_em'],
    });

    if (!administrador || !administrador.ativo) {
      return res.status(401).json({ message: 'Administrador nao encontrado.' });
    }

    req.admin = administrador.get({ plain: true });
    return next();
  } catch {
    return res.status(401).json({ message: 'Token administrativo invalido.' });
  }
};
