const { Op } = require('sequelize');
const { PagamentoAssinatura } = require('../models');
const {
  getMercadoPagoPayment,
  searchMercadoPagoAuthorizedPayments,
  searchMercadoPagoPayments,
} = require('./mercadoPagoService');

function toCentavos(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) : null;
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

function firstString(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return null;
}

function findFirstStringByKeys(value, keys, depth = 0, seen = new Set()) {
  if (!value || typeof value !== 'object' || depth > 7 || seen.has(value)) {
    return null;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstStringByKeys(item, keys, depth + 1, seen);

      if (found) {
        return found;
      }
    }

    return null;
  }

  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && item !== null && item !== undefined && String(item).trim()) {
      return String(item).trim();
    }
  }

  for (const item of Object.values(value)) {
    const found = findFirstStringByKeys(item, keys, depth + 1, seen);

    if (found) {
      return found;
    }
  }

  return null;
}

function normalizePaymentType(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  return normalized || null;
}

function normalizeCardLastDigits(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (digits.length < 4) {
    return null;
  }

  return digits.slice(-4);
}

function normalizeCardBrand(value, allowUnknown = false) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');

  if (!normalized) {
    return null;
  }

  if (['master', 'mastercard', 'mc'].includes(normalized)) {
    return 'mastercard';
  }

  if (['amex', 'american_express'].includes(normalized)) {
    return 'amex';
  }

  if (['visa', 'elo', 'hipercard', 'hiper', 'diners', 'discover', 'cabal', 'aura', 'maestro'].includes(normalized)) {
    return normalized === 'hiper' ? 'hipercard' : normalized;
  }

  if (!allowUnknown || ['pix', 'ticket', 'bolbradesco', 'bank_transfer', 'account_money'].includes(normalized)) {
    return null;
  }

  return normalized;
}

function isCardPayment({ tipoPagamento, bandeira, ultimosDigitos }) {
  const type = normalizePaymentType(tipoPagamento);

  return Boolean(ultimosDigitos || bandeira || type?.includes('card') || type?.includes('cartao'));
}

function extractPaymentMethodDetails(payload, fallbackMethod = null) {
  const tipoPagamento = normalizePaymentType(
    firstString(
      payload?.payment_type_id,
      payload?.payment?.payment_type_id,
      payload?.payment_method?.type,
      findFirstStringByKeys(payload, new Set(['payment_type_id']))
    )
  );
  const ultimosDigitos = normalizeCardLastDigits(
    firstString(
      payload?.card?.last_four_digits,
      payload?.card?.last_four,
      payload?.card?.last4,
      payload?.payment?.card?.last_four_digits,
      payload?.payment?.card?.last_four,
      payload?.payment?.card?.last4,
      findFirstStringByKeys(payload, new Set(['last_four_digits', 'last_four', 'last4', 'card_last_four_digits']))
    )
  );
  const directBrand = firstString(
    payload?.payment_method_id,
    payload?.payment?.payment_method_id,
    payload?.payment_method?.id,
    payload?.payment?.payment_method?.id,
    payload?.card?.brand,
    payload?.payment?.card?.brand,
    fallbackMethod
  );
  const knownBrand = normalizeCardBrand(directBrand);
  const cardPayment = isCardPayment({ tipoPagamento, bandeira: knownBrand, ultimosDigitos });
  const bandeira = knownBrand || normalizeCardBrand(directBrand, cardPayment);

  return {
    tipo_pagamento: tipoPagamento || (cardPayment ? 'card' : null),
    cartao_bandeira: cardPayment ? bandeira : null,
    cartao_ultimos_digitos: cardPayment ? ultimosDigitos : null,
  };
}

function extractPreapprovalId(payload) {
  return (
    payload?.preapproval_id ||
    payload?.preapproval?.id ||
    payload?.subscription_id ||
    payload?.metadata?.preapproval_id ||
    payload?.metadata?.mercado_pago_preapproval_id ||
    payload?.payment?.preapproval_id ||
    payload?.payment?.metadata?.preapproval_id ||
    null
  );
}

function extractPaymentId(payload) {
  return payload?.payment_id || payload?.payment?.id || payload?.id || null;
}

function extractReference(payload) {
  return (
    payload?.external_reference ||
    payload?.metadata?.referencia_externa ||
    payload?.metadata?.external_reference ||
    payload?.payment?.external_reference ||
    null
  );
}

function normalizeMercadoPagoPayment(payload) {
  const formaPagamento = payload?.payment_method_id || payload?.payment_type_id || null;
  const paymentMethodDetails = extractPaymentMethodDetails(payload, formaPagamento);

  return {
    mercado_pago_payment_id: payload?.id ? String(payload.id) : null,
    mercado_pago_authorized_payment_id: null,
    mercado_pago_preapproval_id: extractPreapprovalId(payload),
    referencia_externa: extractReference(payload),
    status: payload?.status || 'desconhecido',
    status_detalhe: payload?.status_detail || null,
    valor_centavos: toCentavos(payload?.transaction_amount),
    valor_liquido_centavos: toCentavos(payload?.transaction_details?.net_received_amount),
    moeda: payload?.currency_id || 'BRL',
    forma_pagamento: formaPagamento,
    ...paymentMethodDetails,
    parcelas: payload?.installments ?? null,
    pago_em: toDate(payload?.date_approved),
    vencimento_em: toDate(payload?.date_of_expiration),
    processado_em: toDate(payload?.date_last_updated || payload?.date_created) || new Date(),
    payload_mercado_pago: payload,
  };
}

async function normalizeMercadoPagoAuthorizedPayment(payload) {
  const paymentId = extractPaymentId(payload);
  const nestedPayment = payload?.payment && typeof payload.payment === 'object' ? payload.payment : null;
  const formaPagamento = payload?.payment_method_id || nestedPayment?.payment_method_id || nestedPayment?.payment_type_id || null;
  const paymentMethodDetails = extractPaymentMethodDetails(payload, formaPagamento);
  const authorizedData = {
    mercado_pago_payment_id: paymentId ? String(paymentId) : null,
    mercado_pago_authorized_payment_id: payload?.id ? String(payload.id) : null,
    mercado_pago_preapproval_id: extractPreapprovalId(payload),
    referencia_externa: extractReference(payload),
    status: nestedPayment?.status || payload?.status || 'desconhecido',
    status_detalhe: nestedPayment?.status_detail || payload?.status_detail || null,
    valor_centavos: toCentavos(payload?.transaction_amount ?? payload?.amount ?? nestedPayment?.transaction_amount),
    valor_liquido_centavos: toCentavos(nestedPayment?.transaction_details?.net_received_amount),
    moeda: payload?.currency_id || nestedPayment?.currency_id || 'BRL',
    forma_pagamento: formaPagamento,
    ...paymentMethodDetails,
    parcelas: payload?.installments ?? nestedPayment?.installments ?? null,
    pago_em: toDate(payload?.payment_date || payload?.date_approved || nestedPayment?.date_approved),
    vencimento_em: toDate(payload?.debit_date || payload?.date_of_expiration),
    processado_em: toDate(payload?.last_modified || payload?.date_last_updated || payload?.date_created) || new Date(),
    payload_mercado_pago: payload,
  };

  if (!paymentId) {
    return authorizedData;
  }

  try {
    const payment = await getMercadoPagoPayment(paymentId);
    const paymentData = normalizeMercadoPagoPayment(payment);

    return {
      ...authorizedData,
      ...paymentData,
      mercado_pago_authorized_payment_id: authorizedData.mercado_pago_authorized_payment_id,
      mercado_pago_preapproval_id: paymentData.mercado_pago_preapproval_id || authorizedData.mercado_pago_preapproval_id,
      referencia_externa: paymentData.referencia_externa || authorizedData.referencia_externa,
      vencimento_em: authorizedData.vencimento_em || paymentData.vencimento_em,
      payload_mercado_pago: {
        authorized_payment: payload,
        payment,
      },
    };
  } catch {
    return authorizedData;
  }
}

function getSearchResults(response) {
  if (Array.isArray(response?.results)) {
    return response.results;
  }

  if (Array.isArray(response)) {
    return response;
  }

  return [];
}

function getPaymentDataKey(paymentData) {
  if (paymentData?.mercado_pago_payment_id) {
    return `payment:${paymentData.mercado_pago_payment_id}`;
  }

  if (paymentData?.mercado_pago_authorized_payment_id) {
    return `authorized:${paymentData.mercado_pago_authorized_payment_id}`;
  }

  return null;
}

function mergePaymentData(current, next) {
  if (!current) {
    return next;
  }

  return {
    ...current,
    ...next,
    mercado_pago_authorized_payment_id:
      current.mercado_pago_authorized_payment_id || next.mercado_pago_authorized_payment_id || null,
    mercado_pago_preapproval_id: next.mercado_pago_preapproval_id || current.mercado_pago_preapproval_id || null,
    referencia_externa: next.referencia_externa || current.referencia_externa || null,
    forma_pagamento: next.forma_pagamento || current.forma_pagamento || null,
    tipo_pagamento: next.tipo_pagamento || current.tipo_pagamento || null,
    cartao_bandeira: next.cartao_bandeira || current.cartao_bandeira || null,
    cartao_ultimos_digitos: next.cartao_ultimos_digitos || current.cartao_ultimos_digitos || null,
    vencimento_em: current.vencimento_em || next.vencimento_em || null,
    payload_mercado_pago: current.payload_mercado_pago || next.payload_mercado_pago || null,
  };
}

function addPaymentData(map, paymentData) {
  const key = getPaymentDataKey(paymentData);

  if (!key) {
    return;
  }

  map.set(key, mergePaymentData(map.get(key), paymentData));
}

async function upsertPagamentoAssinatura(paymentData, assinatura) {
  const assinaturaData = toPlain(assinatura);
  const lookupConditions = [];

  if (paymentData.mercado_pago_payment_id) {
    lookupConditions.push({ mercado_pago_payment_id: paymentData.mercado_pago_payment_id });
  }

  if (paymentData.mercado_pago_authorized_payment_id) {
    lookupConditions.push({
      mercado_pago_authorized_payment_id: paymentData.mercado_pago_authorized_payment_id,
    });
  }

  if (lookupConditions.length === 0) {
    return null;
  }

  const existing = await PagamentoAssinatura.findOne({ where: { [Op.or]: lookupConditions } });
  const payload = {
    ...paymentData,
    assinatura_id: assinaturaData?.id || paymentData.assinatura_id || null,
    usuario_id: assinaturaData?.usuario_id || paymentData.usuario_id || null,
    mercado_pago_preapproval_id:
      paymentData.mercado_pago_preapproval_id || assinaturaData?.mercado_pago_preapproval_id || null,
    referencia_externa: paymentData.referencia_externa || assinaturaData?.referencia_externa || null,
  };

  if (existing) {
    const existingData = toPlain(existing);

    for (const key of ['forma_pagamento', 'tipo_pagamento', 'cartao_bandeira', 'cartao_ultimos_digitos']) {
      if ((payload[key] === null || payload[key] === undefined) && existingData?.[key]) {
        payload[key] = existingData[key];
      }
    }

    await existing.update(payload);
    return existing;
  }

  return PagamentoAssinatura.create(payload);
}

async function syncAssinaturaPagamentosMercadoPago(assinatura, options = {}) {
  const assinaturaData = toPlain(assinatura);
  const preapprovalId = String(assinaturaData?.mercado_pago_preapproval_id || '').trim();
  const referenciaExterna = String(assinaturaData?.referencia_externa || '').trim();
  const authorizedLimit = options.authorizedLimit || options.limit || 10;
  const paymentLimit = options.paymentLimit || options.limit || 50;
  const paymentDataMap = new Map();

  if (preapprovalId) {
    const authorizedPayments = await searchMercadoPagoAuthorizedPayments({
      preapprovalId,
      limit: authorizedLimit,
    });

    for (const authorizedPayment of getSearchResults(authorizedPayments)) {
      addPaymentData(paymentDataMap, await normalizeMercadoPagoAuthorizedPayment(authorizedPayment));
    }
  }

  if (referenciaExterna) {
    const payments = await searchMercadoPagoPayments({
      externalReference: referenciaExterna,
      limit: paymentLimit,
    });

    for (const payment of getSearchResults(payments)) {
      addPaymentData(paymentDataMap, normalizeMercadoPagoPayment(payment));
    }
  }

  const pagamentos = [];

  for (const paymentData of paymentDataMap.values()) {
    const pagamento = await upsertPagamentoAssinatura(paymentData, assinatura);

    if (pagamento) {
      pagamentos.push(pagamento);
    }
  }

  return {
    pagamentos,
    total: pagamentos.length,
  };
}

module.exports = {
  normalizeMercadoPagoAuthorizedPayment,
  normalizeMercadoPagoPayment,
  syncAssinaturaPagamentosMercadoPago,
  upsertPagamentoAssinatura,
};
