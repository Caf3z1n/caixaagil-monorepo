const crypto = require('crypto');
const { isLocalUrl } = require('./urlService');

function isProductionCheckoutEnabled() {
  return process.env.MERCADO_PAGO_USE_PRODUCTION_CHECKOUT === 'true';
}

function getMercadoPagoPayerEmail(accountEmail) {
  if (isProductionCheckoutEnabled()) {
    return accountEmail;
  }

  return process.env.MERCADO_PAGO_TEST_PAYER_EMAIL?.trim() || '';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function getAccessToken() {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    const error = new Error('MERCADO_PAGO_ACCESS_TOKEN nao configurado.');
    error.statusCode = 500;
    throw error;
  }

  return accessToken;
}

function getValorEmReaisDeCentavos(centavos) {
  return Number((Number(centavos || 0) / 100).toFixed(2));
}

function getMercadoPagoFrequency(plano) {
  const intervalo = plano?.intervalo === 'dias' ? 'dias' : 'mensal';
  const quantidade = Number(plano?.intervalo_quantidade || 1);

  return {
    frequency: Number.isInteger(quantidade) && quantidade > 0 ? quantidade : 1,
    frequency_type: intervalo === 'dias' ? 'days' : 'months',
  };
}

function normalizeMercadoPagoDeviceSessionId(value) {
  const deviceSessionId = String(value || '').trim();

  if (!deviceSessionId || deviceSessionId.length > 256) {
    return null;
  }

  return /^[A-Za-z0-9._:-]+$/.test(deviceSessionId) ? deviceSessionId : null;
}

async function mercadoPagoGet(path) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(result?.message || 'Nao foi possivel consultar o Mercado Pago.');
    error.statusCode = response.status;
    throw error;
  }

  return result;
}

async function mercadoPagoPut(path, payload) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(result?.message || 'Nao foi possivel atualizar o Mercado Pago.');
    error.statusCode = response.status;
    throw error;
  }

  return result;
}

function parseSignatureHeader(header) {
  return String(header || '')
    .split(',')
    .reduce((acc, part) => {
      const [key, value] = part.split('=');

      if (key && value) {
        acc[key.trim()] = value.trim();
      }

      return acc;
    }, {});
}

function getWebhookDataId(req) {
  const queryDataId = req.query?.['data.id'] || req.query?.id;
  const bodyDataId = req.body?.data?.id || req.body?.id;
  const dataId = queryDataId || bodyDataId;

  return dataId ? String(dataId).toLowerCase() : '';
}

function validateMercadoPagoWebhookSignature(req) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

  if (!secret) {
    return { checked: false, valid: true };
  }

  const signature = req.headers['x-signature'];
  const requestId = req.headers['x-request-id'];
  const dataId = getWebhookDataId(req);
  const parts = parseSignatureHeader(signature);
  const timestamp = parts.ts;
  const hash = parts.v1;

  if (!signature || !requestId || !dataId || !timestamp || !hash) {
    return { checked: true, valid: false };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const expectedHash = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  try {
    return {
      checked: true,
      valid: crypto.timingSafeEqual(Buffer.from(expectedHash), Buffer.from(hash)),
    };
  } catch {
    return { checked: true, valid: false };
  }
}

async function getMercadoPagoPayment(paymentId) {
  return mercadoPagoGet(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

async function getMercadoPagoAuthorizedPayment(authorizedPaymentId) {
  return mercadoPagoGet(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
}

async function getMercadoPagoPreapproval(preapprovalId) {
  return mercadoPagoGet(`/preapproval/${encodeURIComponent(preapprovalId)}`);
}

function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();

  return query ? `?${query}` : '';
}

async function searchMercadoPagoAuthorizedPayments({ preapprovalId, limit = 10, offset = 0 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 10);

  return mercadoPagoGet(
    `/authorized_payments/search${buildQueryString({
      preapproval_id: preapprovalId,
      limit: safeLimit,
      offset,
    })}`
  );
}

async function searchMercadoPagoPayments({ externalReference, limit = 50, offset = 0 } = {}) {
  return mercadoPagoGet(
    `/v1/payments/search${buildQueryString({
      external_reference: externalReference,
      limit,
      offset,
    })}`
  );
}

async function cancelMercadoPagoPreapproval(preapprovalId) {
  if (!preapprovalId) {
    return null;
  }

  try {
    return await updateMercadoPagoPreapprovalStatus(preapprovalId, 'canceled');
  } catch (error) {
    const message = String(error?.message || '').toLowerCase();

    if (error?.statusCode !== 400 || !message.includes('invalid preapproval status param')) {
      throw error;
    }

    return updateMercadoPagoPreapprovalStatus(preapprovalId, 'cancelled');
  }
}

function isMercadoPagoPreapprovalCanceled(preapproval) {
  return ['canceled', 'cancelled'].includes(String(preapproval?.status || '').trim().toLowerCase());
}

function isUncertainMercadoPagoError(error) {
  const statusCode = Number(error?.statusCode);

  return !Number.isInteger(statusCode) || statusCode >= 500 || [408, 409, 429].includes(statusCode);
}

async function cancelMercadoPagoPreapprovalConfirmed(preapprovalId) {
  if (!preapprovalId) {
    const error = new Error('Assinatura Mercado Pago nao encontrada.');
    error.statusCode = 400;
    throw error;
  }

  const preapprovalAntes = await getMercadoPagoPreapproval(preapprovalId);

  if (isMercadoPagoPreapprovalCanceled(preapprovalAntes)) {
    return {
      jaCancelada: true,
      preapprovalAntes,
      preapprovalDepois: preapprovalAntes,
      tentativas: 0,
    };
  }

  let anyCancelSucceeded = false;
  let lastCancelError = null;
  let lastVerificationError = null;
  let preapprovalDepois = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lastCancelError = null;
    lastVerificationError = null;

    try {
      await cancelMercadoPagoPreapproval(preapprovalId);
      anyCancelSucceeded = true;
    } catch (error) {
      lastCancelError = error;
    }

    try {
      preapprovalDepois = await getMercadoPagoPreapproval(preapprovalId);

      if (isMercadoPagoPreapprovalCanceled(preapprovalDepois)) {
        return {
          jaCancelada: false,
          preapprovalAntes,
          preapprovalDepois,
          tentativas: attempt,
        };
      }
    } catch (error) {
      lastVerificationError = error;
    }

    const shouldRetry =
      attempt === 1 &&
      (!lastCancelError ||
        isUncertainMercadoPagoError(lastCancelError) ||
        (lastVerificationError && isUncertainMercadoPagoError(lastVerificationError)));

    if (!shouldRetry) {
      break;
    }
  }

  const providerError = lastVerificationError || lastCancelError;
  const error = new Error('O Mercado Pago não confirmou o cancelamento da renovação. Tente novamente.');

  error.statusCode = 502;
  error.code = 'MERCADO_PAGO_CANCEL_CONFIRMATION_FAILED';
  error.cancelRequestReachedProvider = anyCancelSucceeded;
  error.providerError = providerError || null;
  throw error;
}

async function updateMercadoPagoPreapprovalStatus(preapprovalId, status) {
  if (!preapprovalId) {
    return null;
  }

  return mercadoPagoPut(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
    status,
  });
}

async function pauseMercadoPagoPreapproval(preapprovalId) {
  return updateMercadoPagoPreapprovalStatus(preapprovalId, 'paused');
}

async function reactivateMercadoPagoPreapproval(preapprovalId) {
  return updateMercadoPagoPreapprovalStatus(preapprovalId, 'authorized');
}

async function updateMercadoPagoPreapprovalAmount(preapprovalId, { valorCentavos, moeda = 'BRL' }) {
  if (!preapprovalId) {
    const error = new Error('Assinatura Mercado Pago nao encontrada.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) {
    const error = new Error('Valor recorrente invalido para atualizar a assinatura.');
    error.statusCode = 400;
    throw error;
  }

  return mercadoPagoPut(`/preapproval/${encodeURIComponent(preapprovalId)}`, {
    auto_recurring: {
      transaction_amount: getValorEmReaisDeCentavos(valorCentavos),
      currency_id: moeda,
    },
  });
}

async function createMercadoPagoPreapproval({
  acao = 'contratar',
  appUrl,
  creditoRateioCentavos = 0,
  email,
  deviceSessionId = null,
  plano,
  referenciaExterna,
  startDate = null,
  transactionAmountCentavos = null,
  valorRecorrenteCentavos = null,
}) {
  const accessToken = getAccessToken();
  const backUrlBase = isLocalUrl(appUrl)
    ? process.env.MERCADO_PAGO_LOCAL_BACK_URL?.trim() ||
      process.env.MERCADO_PAGO_SITE_URL?.trim() ||
      'https://www.mercadopago.com.br'
    : appUrl;

  const payerEmail = getMercadoPagoPayerEmail(email);
  const valorCobrancaCentavos = Number.isInteger(transactionAmountCentavos)
    ? transactionAmountCentavos
    : plano.valor_centavos;
  const valorRecorrente = Number.isInteger(valorRecorrenteCentavos) ? valorRecorrenteCentavos : plano.valor_centavos;

  if (!isValidEmail(payerEmail)) {
    const error = new Error('Nao foi possivel validar os dados do pagador. Confira MERCADO_PAGO_TEST_PAYER_EMAIL.');
    error.statusCode = 400;
    throw error;
  }

  const returnUrl = new URL('/pagamento/sucesso', backUrlBase);
  returnUrl.searchParams.set('plan', plano.id);
  returnUrl.searchParams.set('email', email);
  returnUrl.searchParams.set('amount', String(getValorEmReaisDeCentavos(valorCobrancaCentavos)));
  returnUrl.searchParams.set('recurring_amount', String(getValorEmReaisDeCentavos(valorRecorrente)));

  if (acao) {
    returnUrl.searchParams.set('acao', acao);
  }

  if (creditoRateioCentavos > 0) {
    returnUrl.searchParams.set('credit', String(getValorEmReaisDeCentavos(creditoRateioCentavos)));
  }

  const payload = {
    reason: `Caixa Agil ${plano.nome}`,
    external_reference: referenciaExterna,
    payer_email: payerEmail,
    auto_recurring: {
      ...getMercadoPagoFrequency(plano),
      transaction_amount: getValorEmReaisDeCentavos(valorCobrancaCentavos),
      currency_id: 'BRL',
    },
    back_url: returnUrl.toString(),
    status: 'pending',
  };

  if (startDate) {
    payload.auto_recurring.start_date = startDate instanceof Date ? startDate.toISOString() : startDate;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const normalizedDeviceSessionId = normalizeMercadoPagoDeviceSessionId(deviceSessionId);

  if (normalizedDeviceSessionId) {
    headers['X-meli-session-id'] = normalizedDeviceSessionId;
  }

  const response = await fetch('https://api.mercadopago.com/preapproval', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      result?.message === 'Both payer and collector must be real or test users'
        ? 'O Mercado Pago recusou o checkout porque pagador e vendedor precisam ser contas do mesmo ambiente. Confira MERCADO_PAGO_ACCESS_TOKEN e MERCADO_PAGO_TEST_PAYER_EMAIL.'
        : result?.message || 'Nao foi possivel criar a assinatura do Mercado Pago.';
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  if (!result?.init_point) {
    const error = new Error('O Mercado Pago nao retornou um link de assinatura.');
    error.statusCode = 502;
    throw error;
  }

  return {
    emailPagador: payerEmail,
    id: result.id || null,
    initPoint: result.init_point,
  };
}

module.exports = {
  cancelMercadoPagoPreapproval,
  cancelMercadoPagoPreapprovalConfirmed,
  createMercadoPagoPreapproval,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoPreapproval,
  pauseMercadoPagoPreapproval,
  reactivateMercadoPagoPreapproval,
  searchMercadoPagoAuthorizedPayments,
  searchMercadoPagoPayments,
  updateMercadoPagoPreapprovalAmount,
  updateMercadoPagoPreapprovalStatus,
  validateMercadoPagoWebhookSignature,
};
