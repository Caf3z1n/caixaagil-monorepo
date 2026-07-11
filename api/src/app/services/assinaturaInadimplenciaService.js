const { Op } = require('sequelize');
const { Assinatura, PagamentoAssinatura } = require('../models');
const {
  hasSubscriptionActivationEvidence,
  selectSubscriptionReference,
} = require('./assinaturaAccessService');

const DIAS_TOLERANCIA_BLOQUEIO = 7;
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const STATUS_ASSINATURA_BLOQUEADOS = new Set([
  'cancelada',
  'falha',
  'pagamento_falhou',
  'pausada',
]);

const STATUS_ASSINATURA_SEM_OPERACAO = new Set([
  'abandonada',
  'cancelada',
  'falha',
  'pagamento_falhou',
  'pausada',
  'pendente',
  'substituida',
]);

const STATUS_PAGAMENTO_APROVADO = new Set([
  'accredited',
  'approved',
  'authorized',
  'paid',
  'processed',
]);

const STATUS_PAGAMENTO_FALHA = new Set([
  'cancelled',
  'canceled',
  'charged_back',
  'rejected',
]);

function toPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value) {
  const date = toDate(value);

  return date ? date.toISOString() : null;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function getPagamentoDataReferencia(pagamento) {
  return toDate(
    pagamento?.pago_em ||
      pagamento?.processado_em ||
      pagamento?.vencimento_em ||
      pagamento?.created_at ||
      pagamento?.createdAt
  );
}

function isPagamentoAprovado(pagamento) {
  return STATUS_PAGAMENTO_APROVADO.has(normalizeStatus(pagamento?.status));
}

function isPagamentoComFalha(pagamento) {
  return STATUS_PAGAMENTO_FALHA.has(normalizeStatus(pagamento?.status));
}

function getPagamentoReferencia(pagamentos = []) {
  const validos = Array.isArray(pagamentos) ? pagamentos.map(toPlain).filter(Boolean) : [];

  const ordenarPorData = (left, right) => {
    const leftDate = getPagamentoDataReferencia(left)?.getTime() || 0;
    const rightDate = getPagamentoDataReferencia(right)?.getTime() || 0;

    if (rightDate !== leftDate) {
      return rightDate - leftDate;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  };

  const aprovados = validos.filter(isPagamentoAprovado).sort(ordenarPorData);

  if (aprovados.length > 0) {
    return aprovados[0];
  }

  return validos.sort(ordenarPorData)[0] || null;
}

function getValorRecorrenteCentavos(assinatura) {
  const valor = Number(
    assinatura?.valor_recorrente_centavos ??
      assinatura?.valor_centavos ??
      assinatura?.plano_snapshot?.valor_centavos ??
      0
  );

  return Number.isFinite(valor) ? valor : 0;
}

function buildBillingStatus({
  acessoAte = null,
  assinatura,
  bloqueado,
  bloqueiaEm = null,
  diasEmAtraso = 0,
  diasParaBloqueio = null,
  fase,
  mensagem,
  motivo = null,
  pagamentoReferencia = null,
  proximoPagamentoEm = null,
}) {
  return {
    fase,
    bloqueado: Boolean(bloqueado),
    permite_operacao: !bloqueado,
    motivo,
    mensagem,
    acesso_ate: toIso(acessoAte),
    proximo_pagamento_em: toIso(proximoPagamentoEm),
    dias_em_atraso: Math.max(0, Number(diasEmAtraso) || 0),
    dias_para_bloqueio: diasParaBloqueio === null ? null : Math.max(0, Number(diasParaBloqueio) || 0),
    bloqueia_em: toIso(bloqueiaEm),
    tolerancia_dias: DIAS_TOLERANCIA_BLOQUEIO,
    assinatura_id: assinatura?.id || null,
    assinatura_status: assinatura?.status || null,
    pagamento_referencia: pagamentoReferencia
      ? {
          id: pagamentoReferencia.id || null,
          status: pagamentoReferencia.status || null,
          status_detalhe: pagamentoReferencia.status_detalhe || null,
          data_referencia: toIso(getPagamentoDataReferencia(pagamentoReferencia)),
        }
      : null,
  };
}

function calcularReguaInadimplencia({ assinatura, pagamentos = [], now = new Date() } = {}) {
  const data = toPlain(assinatura);
  const referenciaAgora = toDate(now) || new Date();

  if (!data) {
    return buildBillingStatus({
      assinatura: null,
      bloqueado: true,
      fase: 'bloqueada',
      mensagem: 'Assinatura ativa obrigatória para operar.',
      motivo: 'sem_assinatura',
    });
  }

  const statusAssinatura = normalizeStatus(data.status);
  const pagamentosDaAssinatura = pagamentos
    .map(toPlain)
    .filter(Boolean)
    .filter(pagamento => !pagamento.assinatura_id || Number(pagamento.assinatura_id) === Number(data.id));
  const pagamentoReferencia = getPagamentoReferencia(pagamentosDaAssinatura);
  const assinaturaTemHistoricoOperacional =
    hasSubscriptionActivationEvidence(data) || pagamentosDaAssinatura.some(isPagamentoAprovado);

  if (statusAssinatura === 'cancelamento_agendado') {
    const proximoPagamentoEm = toDate(data.proximo_pagamento_em);
    const acessoAte = toDate(data.acesso_ate);

    if (!acessoAte) {
      return buildBillingStatus({
        assinatura: data,
        bloqueado: true,
        fase: 'bloqueada',
        mensagem: 'A renovação foi cancelada, mas o prazo de acesso não pôde ser confirmado.',
        motivo: 'cancelamento_sem_prazo_de_acesso',
        pagamentoReferencia,
        proximoPagamentoEm,
      });
    }

    const diasEmAtraso = proximoPagamentoEm && referenciaAgora > proximoPagamentoEm
      ? Math.max(0, Math.floor((referenciaAgora.getTime() - proximoPagamentoEm.getTime()) / UM_DIA_MS))
      : 0;
    const diasParaBloqueio = Math.max(
      0,
      Math.ceil((acessoAte.getTime() - referenciaAgora.getTime()) / UM_DIA_MS)
    );

    if (referenciaAgora >= acessoAte) {
      return buildBillingStatus({
        acessoAte,
        assinatura: data,
        bloqueado: true,
        bloqueiaEm: acessoAte,
        diasEmAtraso,
        diasParaBloqueio: 0,
        fase: 'bloqueada',
        mensagem: 'Plano encerrado após o fim do período contratado e da carência.',
        motivo: 'renovacao_cancelada_acesso_encerrado',
        pagamentoReferencia,
        proximoPagamentoEm,
      });
    }

    return buildBillingStatus({
      acessoAte,
      assinatura: data,
      bloqueado: false,
      bloqueiaEm: acessoAte,
      diasEmAtraso,
      diasParaBloqueio,
      fase: 'cancelamento_agendado',
      mensagem: 'Renovação cancelada. O acesso permanece disponível até o fim do período contratado e da carência.',
      motivo: 'renovacao_cancelada',
      pagamentoReferencia,
      proximoPagamentoEm,
    });
  }

  if (
    STATUS_ASSINATURA_BLOQUEADOS.has(statusAssinatura) &&
    !(statusAssinatura === 'pagamento_falhou' && assinaturaTemHistoricoOperacional)
  ) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: true,
      fase: 'bloqueada',
      mensagem: 'Assinatura sem permissão operacional no momento.',
      motivo: `status_assinatura_${statusAssinatura || 'indefinido'}`,
      pagamentoReferencia,
      proximoPagamentoEm: data.proximo_pagamento_em,
    });
  }

  if (
    STATUS_ASSINATURA_SEM_OPERACAO.has(statusAssinatura) &&
    !(statusAssinatura === 'pagamento_falhou' && assinaturaTemHistoricoOperacional)
  ) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: true,
      fase: 'bloqueada',
      mensagem: 'Ative a assinatura para liberar a operação.',
      motivo: `status_assinatura_${statusAssinatura || 'indefinido'}`,
      pagamentoReferencia,
      proximoPagamentoEm: data.proximo_pagamento_em,
    });
  }

  const valorRecorrente = getValorRecorrenteCentavos(data);

  if (valorRecorrente <= 0) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: false,
      fase: 'regular',
      mensagem: 'Plano gratuito sem cobrança recorrente.',
      motivo: 'plano_gratuito',
      pagamentoReferencia,
      proximoPagamentoEm: data.proximo_pagamento_em,
    });
  }

  const proximoPagamentoEm = toDate(data.proximo_pagamento_em);

  if (!proximoPagamentoEm) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: false,
      fase: 'regular',
      mensagem: 'Assinatura ativa sem vencimento pendente.',
      pagamentoReferencia,
    });
  }

  const pagamentoAprovado = pagamentosDaAssinatura
    .filter(isPagamentoAprovado)
    .map(pagamento => ({ pagamento, data: getPagamentoDataReferencia(pagamento) }))
    .filter(item => item.data && item.data >= proximoPagamentoEm)
    .sort((left, right) => right.data.getTime() - left.data.getTime())[0];

  if (pagamentoAprovado) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: false,
      fase: 'regular',
      mensagem: 'Pagamento confirmado para o ciclo esperado.',
      motivo: 'pagamento_confirmado',
      pagamentoReferencia: pagamentoAprovado.pagamento,
      proximoPagamentoEm,
    });
  }

  if (referenciaAgora <= proximoPagamentoEm) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: false,
      fase: 'regular',
      mensagem: 'Próximo pagamento ainda dentro do prazo.',
      pagamentoReferencia,
      proximoPagamentoEm,
    });
  }

  const bloqueiaEm = addDays(proximoPagamentoEm, DIAS_TOLERANCIA_BLOQUEIO);
  const diasEmAtraso = Math.max(0, Math.floor((referenciaAgora.getTime() - proximoPagamentoEm.getTime()) / UM_DIA_MS));
  const diasParaBloqueio = Math.max(0, Math.ceil((bloqueiaEm.getTime() - referenciaAgora.getTime()) / UM_DIA_MS));
  const ultimoPagamentoFalhou = pagamentoReferencia && isPagamentoComFalha(pagamentoReferencia);
  const motivo = ultimoPagamentoFalhou ? 'pagamento_recusado' : 'pagamento_nao_confirmado';

  if (referenciaAgora >= bloqueiaEm) {
    return buildBillingStatus({
      assinatura: data,
      bloqueado: true,
      bloqueiaEm,
      diasEmAtraso,
      diasParaBloqueio: 0,
      fase: 'bloqueada',
      mensagem: 'Conta bloqueada por atraso de pagamento.',
      motivo,
      pagamentoReferencia,
      proximoPagamentoEm,
    });
  }

  return buildBillingStatus({
    assinatura: data,
    bloqueado: false,
    bloqueiaEm,
    diasEmAtraso,
    diasParaBloqueio,
    fase: diasEmAtraso <= 0 ? 'aviso' : 'atrasada',
    mensagem: diasEmAtraso <= 0
      ? 'Pagamento esperado vencido. Atualize a forma de pagamento.'
      : 'Pagamento em atraso. Atualize a forma de pagamento para evitar bloqueio.',
    motivo,
    pagamentoReferencia,
    proximoPagamentoEm,
  });
}

async function findAssinaturaReferencia(usuarioId) {
  const assinaturas = await Assinatura.findAll({
    where: {
      usuario_id: usuarioId,
      status: {
        [Op.notIn]: ['abandonada', 'substituida'],
      },
    },
    order: [['id', 'DESC']],
    limit: 8,
  });
  const plainAssinaturas = assinaturas.map(toPlain);

  return selectSubscriptionReference(plainAssinaturas);
}

async function getBillingStatus(usuarioId, options = {}) {
  const assinatura = options.assinatura ? toPlain(options.assinatura) : await findAssinaturaReferencia(usuarioId);
  const assinaturaId = assinatura?.id || null;
  const where = { usuario_id: usuarioId };

  if (assinaturaId) {
    where[Op.or] = [{ assinatura_id: assinaturaId }, { assinatura_id: null }];
  }

  const pagamentos = options.pagamentos
    ? options.pagamentos.map(toPlain).filter(Boolean)
    : await PagamentoAssinatura.findAll({
        where,
        order: [
          ['processado_em', 'DESC'],
          ['pago_em', 'DESC'],
          ['id', 'DESC'],
        ],
        limit: 30,
      });

  return calcularReguaInadimplencia({
    assinatura,
    pagamentos,
    now: options.now,
  });
}

module.exports = {
  DIAS_TOLERANCIA_BLOQUEIO,
  STATUS_PAGAMENTO_APROVADO,
  calcularReguaInadimplencia,
  getBillingStatus,
  isPagamentoAprovado,
};
