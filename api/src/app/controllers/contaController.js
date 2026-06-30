const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const { Op } = require('sequelize');
const { Assinatura, PagamentoAssinatura, Subconta, Usuario } = require('../models');
const { sendEmail } = require('../services/emailService');
const { createEmailChangeVerificationEmail } = require('../services/emailTemplates');
const { getMercadoPagoPreapproval } = require('../services/mercadoPagoService');
const { listarPlanosPublicos } = require('../services/planosService');
const {
  applyDueScheduledChanges,
  attachScheduledChanges,
} = require('../services/alteracoesAssinaturaService');
const {
  syncAssinaturaPagamentosMercadoPago,
} = require('../services/pagamentosAssinaturaService');
const { selectSubscriptionReference } = require('../services/assinaturaAccessService');
const { getAppUrl, getPublicAssetUrl } = require('../services/urlService');

const expiresInMinutes = 30;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
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

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toPlain(record) {
  return record?.get ? record.get({ plain: true }) : record || null;
}

function sanitizeUsuario(usuario) {
  const data = usuario.get ? usuario.get({ plain: true }) : { ...usuario };

  delete data.senha_hash;
  delete data.token_verificacao_email;
  delete data.token_verificacao_email_expira_em;
  delete data.token_redefinicao_senha;
  delete data.token_redefinicao_senha_expira_em;
  delete data.token_troca_email;
  delete data.token_troca_email_expira_em;

  return data;
}

function sanitizeSubconta(subconta) {
  const data = subconta.get ? subconta.get({ plain: true }) : { ...subconta };

  delete data.senha_hash;
  delete data.token_redefinicao_senha;
  delete data.token_redefinicao_senha_expira_em;

  return data;
}

function getPaymentDate(pagamento) {
  return pagamento?.pago_em || pagamento?.processado_em || pagamento?.vencimento_em || pagamento?.created_at || pagamento?.createdAt || null;
}

function sanitizePagamentoAssinatura(pagamento) {
  const data = toPlain(pagamento);

  if (!data) {
    return null;
  }

  delete data.payload_mercado_pago;

  return data;
}

function getFormaPagamentoResumo(assinatura) {
  const pagamentos = Array.isArray(assinatura?.pagamentos)
    ? [...assinatura.pagamentos].sort((left, right) => {
        const leftDate = new Date(getPaymentDate(left) || 0).getTime();
        const rightDate = new Date(getPaymentDate(right) || 0).getTime();

        return rightDate - leftDate;
      })
    : [];
  const pagamento = pagamentos.find(item => item?.cartao_ultimos_digitos || item?.cartao_bandeira || item?.forma_pagamento);

  if (!pagamento) {
    return null;
  }

  return {
    tipo: pagamento.tipo_pagamento || null,
    forma_pagamento: pagamento.forma_pagamento || null,
    bandeira: pagamento.cartao_bandeira || null,
    ultimos_digitos: pagamento.cartao_ultimos_digitos || null,
    atualizado_em: getPaymentDate(pagamento),
  };
}

function sanitizeAssinaturaConta(assinatura) {
  const data = toPlain(assinatura);

  if (!data) {
    return null;
  }

  data.pagamentos = Array.isArray(data.pagamentos)
    ? data.pagamentos.map(sanitizePagamentoAssinatura).filter(Boolean)
    : [];
  data.forma_pagamento_resumo = getFormaPagamentoResumo(data);

  return data;
}

async function isEmailInUse(email, { usuarioId = null, subcontaId = null } = {}) {
  const usuarioWhere = { email };

  if (usuarioId) {
    usuarioWhere.id = { [Op.ne]: usuarioId };
  }

  const usuario = await Usuario.findOne({ where: usuarioWhere });

  if (usuario) {
    return true;
  }

  const subcontaWhere = { email };

  if (subcontaId) {
    subcontaWhere.id = { [Op.ne]: subcontaId };
  }

  const subconta = await Subconta.unscoped().findOne({ where: subcontaWhere });

  return Boolean(subconta);
}

async function findAssinaturas(usuarioId) {
  await applyDueScheduledChanges({ usuarioId });

  const assinaturas = await Assinatura.findAll({
    where: { usuario_id: usuarioId },
    include: [
      {
        model: PagamentoAssinatura,
        as: 'pagamentos',
        separate: true,
        order: [['processado_em', 'DESC']],
        limit: 12,
      },
    ],
    order: [['id', 'DESC']],
  });

  const assinaturaAtual = assinaturas.find(assinatura => assinatura.status === 'ativa');

  if (assinaturaAtual?.mercado_pago_preapproval_id) {
    try {
      const preapproval = await getMercadoPagoPreapproval(assinaturaAtual.mercado_pago_preapproval_id);
      const nextPaymentDate = toDate(preapproval?.next_payment_date);

      if (nextPaymentDate && String(assinaturaAtual.proximo_pagamento_em || '') !== String(nextPaymentDate)) {
        assinaturaAtual.proximo_pagamento_em = nextPaymentDate;
        await assinaturaAtual.save();
      }
    } catch {
      // A tela de conta não deve falhar se o Mercado Pago estiver temporariamente indisponível.
    }
  }

  for (const assinatura of assinaturas) {
    if (!assinatura.mercado_pago_preapproval_id && !assinatura.referencia_externa) {
      continue;
    }

    try {
      await syncAssinaturaPagamentosMercadoPago(assinatura);
      const pagamentos = await PagamentoAssinatura.findAll({
        where: { assinatura_id: assinatura.id },
        order: [['processado_em', 'DESC']],
        limit: 12,
      });
      assinatura.setDataValue('pagamentos', pagamentos);
    } catch {
      // A tela de conta deve continuar exibindo o historico local existente.
    }
  }

  await attachScheduledChanges(assinaturas);

  return assinaturas;
}

function getAssinaturaAtual(assinaturas) {
  return selectSubscriptionReference(assinaturas);
}

async function getCurrentAccess(req) {
  if (req.subconta) {
    const subconta = await Subconta.findOne({
      where: {
        id: req.subconta.id,
        usuario_id: req.user.id,
      },
    });

    return {
      conta: subconta,
      tipo_conta: 'subconta',
    };
  }

  const usuario = await Usuario.findByPk(req.user.id);

  return {
    conta: usuario,
    tipo_conta: 'usuario',
  };
}

async function clearExpiredEmailChangeTokens(email, token) {
  await Usuario.update(
    {
      novo_email_pendente: null,
      token_troca_email: null,
      token_troca_email_expira_em: null,
    },
    {
      where: {
        novo_email_pendente: email,
        token_troca_email: token,
        token_troca_email_expira_em: {
          [Op.lte]: new Date(),
        },
      },
    }
  );
}

module.exports = {
  async show(req, res) {
    try {
      const access = await getCurrentAccess(req);

      if (!access.conta) {
        return res.status(404).json({ message: 'Conta não encontrada.' });
      }

      const planos = await listarPlanosPublicos();
      const payload = {
        tipo_conta: access.tipo_conta,
        conta:
          access.tipo_conta === 'subconta'
            ? sanitizeSubconta(access.conta)
            : sanitizeUsuario(access.conta),
        planos,
      };

      if (access.tipo_conta === 'usuario') {
        const assinaturas = await findAssinaturas(req.user.id);
        const assinaturasSanitizadas = assinaturas.map(sanitizeAssinaturaConta).filter(Boolean);

        payload.assinatura = getAssinaturaAtual(assinaturasSanitizadas);
        payload.assinaturas = assinaturasSanitizadas;
      }

      return res.json(payload);
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao carregar conta.', detail: error.message });
    }
  },

  async requestEmailChange(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);

      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Informe um e-mail válido.' });
      }

      if (req.subconta) {
        const subconta = await Subconta.findOne({
          where: {
            id: req.subconta.id,
            usuario_id: req.user.id,
          },
        });

        if (!subconta) {
          return res.status(404).json({ message: 'Subconta não encontrada.' });
        }

        if (email === subconta.email) {
          return res.json({
            conta: sanitizeSubconta(subconta),
            message: 'E-mail mantido.',
            requer_verificacao: false,
          });
        }

        if (await isEmailInUse(email, { subcontaId: subconta.id })) {
          return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        }

        subconta.email = email;
        await subconta.save();

        return res.json({
          conta: sanitizeSubconta(subconta),
          message: 'E-mail atualizado.',
          requer_verificacao: false,
        });
      }

      const usuario = await Usuario.findByPk(req.user.id);

      if (!usuario) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }

      if (email === usuario.email) {
        return res.json({
          conta: sanitizeUsuario(usuario),
          message: 'E-mail mantido.',
          requer_verificacao: false,
        });
      }

      if (await isEmailInUse(email, { usuarioId: usuario.id })) {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      const token = randomUUID();
      usuario.novo_email_pendente = email;
      usuario.token_troca_email = token;
      usuario.token_troca_email_expira_em = new Date(Date.now() + expiresInMinutes * 60 * 1000);
      await usuario.save();

      const verificationUrl = new URL('/confirmar-troca-email', getAppUrl(req));
      verificationUrl.searchParams.set('token', token);
      verificationUrl.searchParams.set('email', email);

      const emailContent = createEmailChangeVerificationEmail({
        currentEmail: usuario.email,
        expiresInMinutes,
        logoUrl: getPublicAssetUrl('/brand/logo-caixa-agil.png', req),
        newEmail: email,
        verificationUrl: verificationUrl.toString(),
      });

      await sendEmail({
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      return res.json({
        conta: sanitizeUsuario(usuario),
        email_pendente: email,
        message: 'Enviamos um link de confirmação para o novo e-mail.',
        requer_verificacao: true,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message: error.message || 'Não foi possível iniciar a troca de e-mail.',
      });
    }
  },

  async confirmEmailChange(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';

      if (!isValidEmail(email) || !token) {
        return res.status(400).json({ message: 'Link de troca de e-mail inválido.' });
      }

      const usuario = await Usuario.scope('withSenha').findOne({
        where: {
          novo_email_pendente: email,
          token_troca_email: token,
          token_troca_email_expira_em: {
            [Op.gt]: new Date(),
          },
        },
      });

      if (!usuario) {
        await clearExpiredEmailChangeTokens(email, token);
        return res.status(400).json({ message: 'Link de troca de e-mail inválido ou expirado.' });
      }

      if (await isEmailInUse(email, { usuarioId: usuario.id })) {
        return res.status(409).json({ message: 'Este e-mail já está em uso.' });
      }

      usuario.email = email;
      usuario.email_verificado_em = new Date();
      usuario.novo_email_pendente = null;
      usuario.token_troca_email = null;
      usuario.token_troca_email_expira_em = null;
      await usuario.save();

      return res.json({
        email,
        message: 'E-mail atualizado com sucesso.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao confirmar troca de e-mail.', detail: error.message });
    }
  },

  async updatePassword(req, res) {
    try {
      const senhaAtual = req.body?.senha_atual || req.body?.senhaAtual || req.body?.currentPassword;
      const novaSenha = req.body?.senha || req.body?.password;

      if (!senhaAtual) {
        return res.status(400).json({ message: 'Informe a senha atual.' });
      }

      if (!isValidSenha(novaSenha)) {
        return res.status(400).json({ message: 'Senha não atende aos requisitos mínimos.' });
      }

      const account = req.subconta
        ? await Subconta.scope('withSenha').findOne({
            where: {
              id: req.subconta.id,
              usuario_id: req.user.id,
            },
          })
        : await Usuario.scope('withSenha').findByPk(req.user.id);

      if (!account) {
        return res.status(404).json({ message: 'Conta não encontrada.' });
      }

      const senhaAtualValida = await account.checkPassword(senhaAtual);

      if (!senhaAtualValida) {
        return res.status(401).json({ message: 'Senha atual inválida.' });
      }

      account.senha_hash = await bcrypt.hash(novaSenha, 10);
      await account.save();

      return res.json({
        conta: req.subconta ? sanitizeSubconta(account) : sanitizeUsuario(account),
        message: 'Senha atualizada.',
      });
    } catch (error) {
      return res.status(500).json({ message: 'Erro ao atualizar senha.', detail: error.message });
    }
  },
};
