const jwt = require('jsonwebtoken');
const authConfig = require('../../config/auth');
const { Assinatura, Subconta, Usuario } = require('../models');

function getRequiredPermission(req) {
  const baseUrl = req.baseUrl || '';

  if (baseUrl.startsWith('/pdvs') || baseUrl.startsWith('/subcontas')) {
    return 'pdvs_subcontas';
  }

  if (baseUrl.startsWith('/grupos-fiscais')) {
    return 'grupos_fiscais';
  }

  if (baseUrl.startsWith('/produtos') || baseUrl.startsWith('/arquivos')) {
    return 'produtos';
  }

  if (baseUrl.startsWith('/estoques')) {
    return 'estoque';
  }

  return null;
}

function isMainAccountOnlyRoute(req) {
  const baseUrl = req.baseUrl || '';

  return (
    baseUrl.startsWith('/usuarios') ||
    baseUrl.startsWith('/assinaturas') ||
    baseUrl.startsWith('/configuracoes') ||
    baseUrl.startsWith('/funcionarios') ||
    baseUrl.startsWith('/nf')
  );
}

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token não fornecido.' });
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Token mal formatado.' });
  }

  try {
    const decoded = jwt.verify(token, authConfig.secret);
    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: ['id', 'email', 'ativo', 'email_verificado_em', 'onboarding_concluido_em'],
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ message: 'Usuário não encontrado.' });
    }

    if (!usuario.email_verificado_em) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Confirme seu e-mail para continuar.',
      });
    }

    let subconta = null;

    if (decoded.subconta_id) {
      subconta = await Subconta.findOne({
        where: {
          id: decoded.subconta_id,
          usuario_id: usuario.id,
        },
      });

      if (!subconta || !subconta.ativo) {
        return res.status(401).json({ message: 'Subconta não encontrada.' });
      }

      if (isMainAccountOnlyRoute(req)) {
        return res.status(403).json({
          code: 'MAIN_ACCOUNT_REQUIRED',
          message: 'Este recurso exige a conta principal.',
        });
      }

      const requiredPermission = getRequiredPermission(req);
      const permissoes = Array.isArray(subconta.permissoes) ? subconta.permissoes : [];

      if (requiredPermission && !permissoes.includes(requiredPermission)) {
        return res.status(403).json({
          code: 'ACCESS_DENIED',
          message: 'Esta subconta não tem acesso a esta página.',
        });
      }
    }

    const assinaturaAtiva = await Assinatura.findOne({
      where: {
        usuario_id: usuario.id,
        status: 'ativa',
      },
    });

    if (!assinaturaAtiva) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Assinatura ativa obrigatória para acessar este recurso.',
      });
    }

    req.user = {
      ...usuario.get({ plain: true }),
      tipo_conta: subconta ? 'subconta' : 'usuario',
      subconta_id: subconta?.id || null,
      permissoes: subconta ? subconta.permissoes || [] : ['*'],
      email_acesso: subconta?.email || usuario.email,
    };
    req.subconta = subconta ? subconta.get({ plain: true }) : null;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido.' });
  }
};
