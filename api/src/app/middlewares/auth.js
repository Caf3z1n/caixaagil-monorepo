const jwt = require('jsonwebtoken');
const authConfig = require('../../config/auth');
const { Administrador, Subconta, Usuario } = require('../models');
const { getPlatformAccess } = require('../services/assinaturaAccessService');
const { isEmailVerified } = require('../services/emailVerificationPolicyService');

function getRequiredPermissions(req) {
  const baseUrl = req.baseUrl || '';
  const path = req.path || '';
  const method = req.method || '';

  if (baseUrl.startsWith('/pdvs') || baseUrl.startsWith('/subcontas')) {
    return ['pdvs_subcontas'];
  }

  if (baseUrl.startsWith('/configuracoes')) {
    if (
      method === 'GET' &&
      (path.startsWith('/integracoes/cnpja/cnpj/') || path.startsWith('/integracoes/cnpja/cep/'))
    ) {
      return ['configuracoes', 'convenios'];
    }

    return ['configuracoes'];
  }

  if (baseUrl.startsWith('/grupos-fiscais')) {
    return ['grupos_fiscais'];
  }

  if (baseUrl.startsWith('/produtos')) {
    return ['produtos'];
  }

  if (baseUrl.startsWith('/arquivos')) {
    return method === 'GET'
      ? ['produtos', 'documentos_fiscais']
      : ['produtos'];
  }

  if (baseUrl.startsWith('/estoques')) {
    return ['estoque'];
  }

  if (baseUrl.startsWith('/caixa')) {
    return ['conferencia_caixa'];
  }

  if (baseUrl.startsWith('/funcionarios')) {
    return ['funcionarios'];
  }

  if (baseUrl.startsWith('/despesas')) {
    return ['despesas'];
  }

  if (baseUrl.startsWith('/convenios')) {
    return ['convenios'];
  }

  if (baseUrl.startsWith('/nf')) {
    return ['documentos_fiscais'];
  }

  return [];
}

function isMainAccountOnlyRoute(req) {
  const baseUrl = req.baseUrl || '';
  const isEntitlementsRead =
    req.method === 'GET' &&
    baseUrl.startsWith('/assinaturas') &&
    req.path === '/entitlements';

  return (
    baseUrl.startsWith('/usuarios') ||
    (baseUrl.startsWith('/assinaturas') && !isEntitlementsRead) ||
    baseUrl.startsWith('/conta') ||
    baseUrl.startsWith('/pdvs') ||
    baseUrl.startsWith('/subcontas')
  );
}

function isSubscriptionRecoveryRoute(req) {
  const baseUrl = req.baseUrl || '';

  return baseUrl.startsWith('/conta') || baseUrl.startsWith('/assinaturas');
}

function isCancellationAccessBlocked(assinatura, now = new Date()) {
  const status = String(assinatura?.status || '').trim().toLowerCase();
  const hasScheduledCancellation =
    status === 'cancelamento_agendado' || Boolean(assinatura?.renovacao_cancelada_em);

  if (!hasScheduledCancellation) {
    return false;
  }

  const accessUntil = new Date(assinatura.acesso_ate);

  return Number.isNaN(accessUntil.getTime()) || now >= accessUntil;
}

function hasAnyRequiredPermission(permissoes, requiredPermissions) {
  if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
    return true;
  }

  return requiredPermissions.some(requiredPermission => permissoes.includes(requiredPermission));
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
    const isSupportAccess = decoded.acesso_suporte === true && Boolean(decoded.admin_id);
    const usuario = await Usuario.findByPk(decoded.id, {
      attributes: ['id', 'email', 'ativo', 'email_verificado_em', 'onboarding_concluido_em'],
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ message: 'Usuário não encontrado.' });
    }

    if (isSupportAccess) {
      const administrador = await Administrador.findOne({
        where: {
          ativo: true,
          id: decoded.admin_id,
        },
        attributes: ['id', 'nome', 'email'],
      });

      if (!administrador) {
        return res.status(401).json({ message: 'Acesso administrativo encerrado.' });
      }

      req.supportAdmin = administrador.get({ plain: true });
    }

    if (!isSupportAccess && !isEmailVerified(usuario)) {
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

      const requiredPermissions = getRequiredPermissions(req);
      const permissoes = Array.isArray(subconta.permissoes) ? subconta.permissoes : [];

      if (!hasAnyRequiredPermission(permissoes, requiredPermissions)) {
        return res.status(403).json({
          code: 'ACCESS_DENIED',
          message: 'Esta subconta não tem acesso a esta página.',
        });
      }
    }

    const platformAccess = await getPlatformAccess(usuario.id);

    if (!platformAccess.allowed && !isSupportAccess) {
      return res.status(403).json({
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'Assinatura ativa obrigatória para acessar este recurso.',
      });
    }

    if (
      !isSupportAccess &&
      isCancellationAccessBlocked(platformAccess.assinatura) &&
      !isSubscriptionRecoveryRoute(req)
    ) {
      return res.status(402).json({
        code: 'SUBSCRIPTION_BLOCKED',
        message: 'Plano encerrado. Contrate um novo plano para continuar.',
      });
    }

    req.user = {
      ...usuario.get({ plain: true }),
      tipo_conta: subconta ? 'subconta' : 'usuario',
      subconta_id: subconta?.id || null,
      permissoes: subconta ? subconta.permissoes || [] : ['*'],
      email_acesso: subconta?.email || usuario.email,
      acesso_suporte: isSupportAccess,
      admin_id: isSupportAccess ? decoded.admin_id : null,
    };
    req.subscriptionAccess = platformAccess;
    req.subconta = subconta ? subconta.get({ plain: true }) : null;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Token inválido.' });
  }
};
