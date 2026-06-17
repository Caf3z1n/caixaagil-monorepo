const configuracaoSistemaService = require('./configuracaoSistemaService');

const CNPJA_BASE_URL = 'https://api.cnpja.com';

function createIntegrationError(message, status = 400, code = 'CNPJA_ERROR') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeDigits(value, maxLength) {
  return String(value || '').replace(/\D/g, '').slice(0, maxLength);
}

function normalizeText(value, maxLength = 255) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function firstItem(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : null;
}

function normalizeActivityId(activity) {
  const id = activity?.id;

  if (id === undefined || id === null) {
    return '';
  }

  return normalizeDigits(String(id).padStart(7, '0'), 7);
}

function normalizePhone(phone) {
  if (!phone) {
    return '';
  }

  return normalizeDigits(`${phone.area || ''}${phone.number || ''}`, 14);
}

function readBooleanFlag(value, keys = ['optant', 'optante', 'enabled', 'active']) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  for (const key of keys) {
    if (typeof value[key] === 'boolean') {
      return value[key];
    }
  }

  return null;
}

function inferCrt(office = {}) {
  const company = office.company && typeof office.company === 'object' ? office.company : {};
  const simples = office.simples || company.simples || office.taxRegime?.simples;
  const simei = office.simei || company.simei || office.taxRegime?.simei;
  const isMei = readBooleanFlag(simei);
  const isSimples = readBooleanFlag(simples);

  if (isMei === true) {
    return '4';
  }

  if (isSimples === true) {
    return '1';
  }

  if (isSimples === false || isMei === false) {
    return '3';
  }

  return '';
}

function selectStateRegistration(office) {
  const registrations = Array.isArray(office?.registrations) ? office.registrations : [];
  const addressState = normalizeText(office?.address?.state, 2).toUpperCase();

  return (
    registrations.find(registration => registration?.enabled && registration?.state === addressState) ||
    registrations.find(registration => registration?.enabled) ||
    firstItem(registrations)
  );
}

function mapAddress(address = {}) {
  return {
    logradouro: normalizeText(address.street, 160),
    numero: normalizeText(address.number, 20),
    complemento: normalizeText(address.details, 80),
    bairro: normalizeText(address.district, 80),
    codigo_municipio: normalizeDigits(address.municipality, 7),
    municipio: normalizeText(address.city, 80),
    uf: normalizeText(address.state, 2).toUpperCase(),
    cep: normalizeDigits(address.zip || address.code, 8),
  };
}

function mapOfficeToFiscalPrefill(office = {}) {
  const address = mapAddress(office.address);
  const registration = selectStateRegistration(office);
  const phone = firstItem(office.phones);
  const email = firstItem(office.emails);

  return {
    uf: address.uf,
    emitente: {
      cnpj_cpf: normalizeDigits(office.taxId, 14),
      razao_social: normalizeText(office.company?.name || office.name, 160),
      nome_fantasia: normalizeText(office.alias, 160),
      inscricao_estadual: normalizeDigits(registration?.number, 20),
      inscricao_municipal: '',
      crt: inferCrt(office),
      cnae: normalizeActivityId(office.mainActivity),
      email: normalizeText(email?.address, 160).toLowerCase(),
      telefone: normalizePhone(phone),
      endereco: address,
    },
    fonte: 'cnpja',
  };
}

function mapZipToFiscalAddress(zip = {}) {
  return {
    endereco: mapAddress(zip),
    fonte: 'cnpja',
  };
}

async function requestCnpja(usuarioId, path, query = {}) {
  const apiKey = await configuracaoSistemaService.getCnpjaApiKey(usuarioId);

  if (!apiKey) {
    throw createIntegrationError('Configure o token da CNPJá em APIs externas antes de usar o preenchimento automático.', 400, 'CNPJA_NOT_CONFIGURED');
  }

  const url = new URL(`${CNPJA_BASE_URL}/${path}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: apiKey,
      },
      signal: controller.signal,
    });
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => '');

    if (!response.ok) {
      const message = payload?.message || 'Não foi possível consultar a CNPJá.';
      throw createIntegrationError(message, response.status, payload?.code || 'CNPJA_REQUEST_FAILED');
    }

    return payload;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw createIntegrationError('Tempo esgotado ao consultar a CNPJá.', 504, 'CNPJA_TIMEOUT');
    }

    if (error.status) {
      throw error;
    }

    throw createIntegrationError('Não foi possível conectar com a CNPJá.', 502, 'CNPJA_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupCnpj(usuarioId, cnpj) {
  const taxId = normalizeDigits(cnpj, 14);

  if (taxId.length !== 14) {
    throw createIntegrationError('Informe um CNPJ com 14 dígitos.', 400, 'INVALID_CNPJ');
  }

  const office = await requestCnpja(usuarioId, `office/${taxId}`, {
    registrations: 'ORIGIN',
    strategy: 'CACHE_IF_ERROR',
    maxAge: 45,
    maxStale: 365,
  });

  return mapOfficeToFiscalPrefill(office);
}

async function lookupCep(usuarioId, cep) {
  const code = normalizeDigits(cep, 8);

  if (code.length !== 8) {
    throw createIntegrationError('Informe um CEP com 8 dígitos.', 400, 'INVALID_CEP');
  }

  const zip = await requestCnpja(usuarioId, `zip/${code}`);

  return mapZipToFiscalAddress(zip);
}

module.exports = {
  lookupCep,
  lookupCnpj,
};
