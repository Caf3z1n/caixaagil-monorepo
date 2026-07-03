const fs = require('fs');
const forge = require('node-forge');
const { Arquivo, ConfiguracaoSistema, Nf } = require('../models');
const { decryptSecret, encryptSecret } = require('./secretService');
const { toAbsolutePath } = require('./fileStorageService');

const paymentMethodKeys = ['dinheiro', 'pix', 'cartao', 'convenio'];

const defaultPaymentMethods = {
  dinheiro: true,
  pix: true,
  cartao: true,
  convenio: false,
};

const defaultExpenseSettings = {
  ativo: false,
};

const defaultEmployeeControlSettings = {
  ativo: false,
};

const defaultCommandSettings = {
  ativo: false,
};

const defaultShiftSummarySettings = {
  ativo: false,
};

const fiscalEnvironmentKeys = ['homologacao', 'producao'];

const defaultFiscalEnvironmentSettings = {
  ativo: false,
  certificado: {
    tipo: 'A1',
    arquivo_id: null,
    nome_arquivo: '',
    senha_criptografada: null,
    validade: null,
    emitido_para: '',
  },
  nfce: {
    serie: 1,
    proximo_numero: 1,
    csc_id: '',
    csc_token_criptografado: null,
  },
  nfe: {
    serie: 1,
    proximo_numero: 1,
  },
};

const defaultFiscalSettings = {
  ambiente: 'homologacao',
  uf: '',
  modelo_prioritario: '65',
  natureza_operacao_padrao: 'Venda',
  emitente: {
    cnpj_cpf: '',
    razao_social: '',
    nome_fantasia: '',
    inscricao_estadual: '',
    inscricao_municipal: '',
    crt: '',
    cnae: '',
    email: '',
    telefone: '',
    endereco: {
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      codigo_municipio: '',
      municipio: '',
      uf: '',
      cep: '',
    },
  },
  ambientes: {
    homologacao: { ...defaultFiscalEnvironmentSettings },
    producao: { ...defaultFiscalEnvironmentSettings },
  },
  impressao: {
    usar_impressora_padrao: true,
    impressora: '',
    largura_bobina_mm: 80,
  },
};

const defaultIntegrationSettings = {
  cnpja: {
    ativo: false,
    token_criptografado: null,
  },
};

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNullableInteger(value, { min = 1, max = 999999999 } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeText(value, maxLength = 255) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function normalizeDigits(value, maxLength = 20) {
  return normalizeText(value, maxLength).replace(/\D/g, '').slice(0, maxLength);
}

function normalizeInteger(value, fallback, { min = 0, max = 999999999 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function pickFirstDefined(...values) {
  return values.find(value => value !== undefined && value !== null);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveEncryptedSecret({ incoming, previous, clear }) {
  if (clear) {
    return null;
  }

  const plainText = normalizeText(incoming, 2048);

  if (plainText) {
    return encryptSecret(plainText);
  }

  if (typeof previous === 'string' && previous) {
    return previous.startsWith('v1:') ? previous : encryptSecret(previous);
  }

  return null;
}

function toIsoDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return null;
  }

  return value.toISOString().slice(0, 10);
}

function getCertificateSubjectName(certificate) {
  const fields = certificate?.subject?.attributes || [];
  const commonName = fields.find(field => field.name === 'commonName' || field.shortName === 'CN')?.value;
  const organizationName = fields.find(field => field.name === 'organizationName' || field.shortName === 'O')?.value;

  return normalizeText(commonName || organizationName || '', 160);
}

function extractPfxMetadata(filePath, password) {
  const binary = fs.readFileSync(filePath).toString('binary');
  const asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password || '');
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const certificate = certBags.find(bag => bag.cert)?.cert;

  if (!certificate) {
    const error = new Error('Certificado A1 não encontrado dentro do arquivo PFX/P12.');
    error.code = 'CERTIFICATE_NOT_FOUND';
    throw error;
  }

  return {
    validade: toIsoDate(certificate.validity?.notAfter),
    emitido_para: getCertificateSubjectName(certificate),
  };
}

function certificateWasTouched(value = {}, previousValue = {}) {
  const certificado = isObject(value?.certificado) ? value.certificado : {};
  const previousCertificado = isObject(previousValue?.certificado) ? previousValue.certificado : {};

  return Boolean(
    certificado.senha_pfx ||
      certificado.senhaPfx ||
      certificado.senha ||
      value?.certificado_senha ||
      value?.certificadoSenha ||
      (certificado.arquivo_id && Number(certificado.arquivo_id) !== Number(previousCertificado.arquivo_id || 0))
  );
}

function normalizeFiscalNextNumber(source = {}, fallback = 1) {
  const directNumber = pickFirstDefined(source.proximo_numero, source.proximoNumero);

  if (directNumber !== undefined && directNumber !== null && directNumber !== '') {
    return normalizeInteger(directNumber, fallback, { min: 1, max: 999999999 });
  }

  const lastNumber = pickFirstDefined(source.ultimo_numero, source.ultimoNumero);

  if (lastNumber !== undefined && lastNumber !== null && lastNumber !== '') {
    return normalizeInteger(lastNumber, 0, { min: 0, max: 999999998 }) + 1;
  }

  return fallback;
}

function normalizePaymentMethods(value = {}) {
  const nextPaymentMethods = paymentMethodKeys.reduce((settings, key) => {
    settings[key] = normalizeBoolean(value?.[key], defaultPaymentMethods[key]);
    return settings;
  }, {});

  if (!paymentMethodKeys.some(key => nextPaymentMethods[key])) {
    return { ...defaultPaymentMethods };
  }

  return nextPaymentMethods;
}

function normalizeExpenseSettings(value = {}) {
  return {
    ativo: normalizeBoolean(value?.ativo, defaultExpenseSettings.ativo),
  };
}

function normalizeEmployeeControlSettings(value = {}) {
  return {
    ativo: normalizeBoolean(value?.ativo, defaultEmployeeControlSettings.ativo),
  };
}

function normalizeCommandSettings(value = {}) {
  return {
    ativo: normalizeBoolean(value?.ativo, defaultCommandSettings.ativo),
  };
}

function normalizeShiftSummarySettings(value = {}) {
  return {
    ativo: normalizeBoolean(
      pickFirstDefined(
        value?.ativo,
        value?.imprimir_ao_fechar,
        value?.imprimirAoFechar,
        value?.printShiftSummaryOnClose
      ),
      defaultShiftSummarySettings.ativo
    ),
  };
}

function normalizeFiscalAmbiente(value, fallback = 'homologacao') {
  return normalizeText(value, 20) === 'producao' ? 'producao' : fallback === 'producao' ? 'producao' : 'homologacao';
}

function cloneDefaultFiscalEnvironmentSettings() {
  return {
    ativo: defaultFiscalEnvironmentSettings.ativo,
    certificado: { ...defaultFiscalEnvironmentSettings.certificado },
    nfce: { ...defaultFiscalEnvironmentSettings.nfce },
    nfe: { ...defaultFiscalEnvironmentSettings.nfe },
  };
}

function pickEnvironmentSource(settings, ambiente) {
  const ambientes = isObject(settings?.ambientes) ? settings.ambientes : {};

  if (isObject(ambientes?.[ambiente])) {
    return ambientes[ambiente];
  }

  if (normalizeFiscalAmbiente(settings?.ambiente) === ambiente && (
    settings?.ativo !== undefined ||
    isObject(settings?.certificado) ||
    isObject(settings?.nfce) ||
    isObject(settings?.nfe)
  )) {
    return settings;
  }

  return {};
}

function normalizeFiscalEnvironmentSettings(value = {}, previousValue = {}) {
  const certificado = isObject(value?.certificado) ? value.certificado : {};
  const previousCertificado = isObject(previousValue?.certificado) ? previousValue.certificado : {};
  const nfce = isObject(value?.nfce) ? value.nfce : {};
  const previousNfce = isObject(previousValue?.nfce) ? previousValue.nfce : {};
  const nfe = isObject(value?.nfe) ? value.nfe : {};
  const previousNfe = isObject(previousValue?.nfe) ? previousValue.nfe : {};
  const senhaCertificado = pickFirstDefined(
    certificado.senha_pfx,
    certificado.senhaPfx,
    certificado.senha,
    value?.certificado_senha,
    value?.certificadoSenha
  );
  const cscToken = pickFirstDefined(nfce.csc_token, nfce.cscToken, value?.csc_token, value?.cscToken);

  return {
    ativo: normalizeBoolean(pickFirstDefined(value?.ativo, previousValue?.ativo), defaultFiscalEnvironmentSettings.ativo),
    certificado: {
      tipo: 'A1',
      arquivo_id: normalizeNullableInteger(
        pickFirstDefined(certificado.arquivo_id, certificado.arquivoId, previousCertificado.arquivo_id),
        { min: 1, max: 2147483647 }
      ),
      nome_arquivo: normalizeText(
        pickFirstDefined(certificado.nome_arquivo, certificado.nomeArquivo, previousCertificado.nome_arquivo),
        255
      ),
      senha_criptografada: resolveEncryptedSecret({
        incoming: senhaCertificado,
        previous: previousCertificado.senha_criptografada,
        clear: certificado.limpar_senha_pfx === true || certificado.limparSenhaPfx === true,
      }),
      validade: normalizeText(pickFirstDefined(certificado.validade, previousCertificado.validade), 10) || null,
      emitido_para: normalizeText(
        pickFirstDefined(certificado.emitido_para, certificado.emitidoPara, previousCertificado.emitido_para),
        160
      ),
    },
    nfce: {
      serie: normalizeInteger(
        pickFirstDefined(nfce.serie, previousNfce.serie),
        defaultFiscalEnvironmentSettings.nfce.serie,
        { min: 1, max: 999 }
      ),
      proximo_numero: normalizeFiscalNextNumber(
        nfce,
        normalizeFiscalNextNumber(previousNfce, defaultFiscalEnvironmentSettings.nfce.proximo_numero)
      ),
      csc_id: normalizeText(pickFirstDefined(nfce.csc_id, nfce.cscId, previousNfce.csc_id), 12),
      csc_token_criptografado: resolveEncryptedSecret({
        incoming: cscToken,
        previous: previousNfce.csc_token_criptografado || previousNfce.csc_token,
        clear: nfce.limpar_csc_token === true || nfce.limparCscToken === true,
      }),
    },
    nfe: {
      serie: normalizeInteger(
        pickFirstDefined(nfe.serie, previousNfe.serie),
        defaultFiscalEnvironmentSettings.nfe.serie,
        { min: 1, max: 999 }
      ),
      proximo_numero: normalizeFiscalNextNumber(
        nfe,
        normalizeFiscalNextNumber(previousNfe, defaultFiscalEnvironmentSettings.nfe.proximo_numero)
      ),
    },
  };
}

function normalizeFiscalSettings(value = {}, previousValue = {}) {
  const previousFiscal =
    isObject(previousValue) && Object.keys(previousValue).length > 0
      ? previousValue
      : isObject(value)
        ? value
        : {};
  const emitente = isObject(value?.emitente) ? value.emitente : {};
  const previousEmitente = isObject(previousFiscal?.emitente) ? previousFiscal.emitente : {};
  const endereco = isObject(emitente?.endereco) ? emitente.endereco : {};
  const previousEndereco = isObject(previousEmitente?.endereco) ? previousEmitente.endereco : {};
  const impressao = isObject(value?.impressao) ? value.impressao : {};
  const previousImpressao = isObject(previousFiscal?.impressao) ? previousFiscal.impressao : {};
  const ambiente = normalizeFiscalAmbiente(pickFirstDefined(value?.ambiente, previousFiscal.ambiente));
  const modeloPrioritario = normalizeText(
    pickFirstDefined(value?.modelo_prioritario, value?.modeloPrioritario, previousFiscal.modelo_prioritario),
    2
  );

  const ambientes = fiscalEnvironmentKeys.reduce((acc, key) => {
    const source = pickEnvironmentSource(value, key);
    const previousSource = pickEnvironmentSource(previousFiscal, key);

    acc[key] = normalizeFiscalEnvironmentSettings(source, previousSource);
    return acc;
  }, {});
  const activeEnvironment = ambientes[ambiente] || cloneDefaultFiscalEnvironmentSettings();
  const enderecoUf = normalizeText(
    pickFirstDefined(endereco.uf, previousEndereco.uf, value?.uf, previousFiscal.uf),
    2
  ).toUpperCase();

  return {
    ambiente,
    uf: enderecoUf,
    modelo_prioritario: modeloPrioritario === '55' ? '55' : '65',
    natureza_operacao_padrao: normalizeText(
      pickFirstDefined(value?.natureza_operacao_padrao, value?.naturezaOperacaoPadrao, previousFiscal.natureza_operacao_padrao),
      120
    ) || defaultFiscalSettings.natureza_operacao_padrao,
    emitente: {
      cnpj_cpf: normalizeDigits(
        pickFirstDefined(emitente.cnpj_cpf, emitente.cnpjCpf, emitente.cnpj, previousEmitente.cnpj_cpf),
        14
      ),
      razao_social: normalizeText(pickFirstDefined(emitente.razao_social, emitente.razaoSocial, previousEmitente.razao_social), 160),
      nome_fantasia: normalizeText(pickFirstDefined(emitente.nome_fantasia, emitente.nomeFantasia, previousEmitente.nome_fantasia), 160),
      inscricao_estadual: normalizeDigits(
        pickFirstDefined(emitente.inscricao_estadual, emitente.inscricaoEstadual, emitente.ie, previousEmitente.inscricao_estadual),
        20
      ),
      inscricao_municipal: normalizeDigits(
        pickFirstDefined(emitente.inscricao_municipal, emitente.inscricaoMunicipal, previousEmitente.inscricao_municipal),
        20
      ),
      crt: normalizeText(pickFirstDefined(emitente.crt, previousEmitente.crt), 4),
      cnae: normalizeDigits(pickFirstDefined(emitente.cnae, previousEmitente.cnae), 7),
      email: normalizeText(pickFirstDefined(emitente.email, previousEmitente.email), 160).toLowerCase(),
      telefone: normalizeDigits(pickFirstDefined(emitente.telefone, previousEmitente.telefone), 14),
      endereco: {
        logradouro: normalizeText(pickFirstDefined(endereco.logradouro, previousEndereco.logradouro), 160),
        numero: normalizeText(pickFirstDefined(endereco.numero, previousEndereco.numero), 20),
        complemento: normalizeText(pickFirstDefined(endereco.complemento, previousEndereco.complemento), 80),
        bairro: normalizeText(pickFirstDefined(endereco.bairro, previousEndereco.bairro), 80),
        codigo_municipio: normalizeDigits(
          pickFirstDefined(endereco.codigo_municipio, endereco.codigoMunicipio, previousEndereco.codigo_municipio),
          7
        ),
        municipio: normalizeText(pickFirstDefined(endereco.municipio, previousEndereco.municipio), 80),
        uf: enderecoUf,
        cep: normalizeDigits(pickFirstDefined(endereco.cep, previousEndereco.cep), 8),
      },
    },
    ambientes,
    ativo: activeEnvironment.ativo,
    certificado: activeEnvironment.certificado,
    nfce: activeEnvironment.nfce,
    nfe: activeEnvironment.nfe,
    impressao: {
      usar_impressora_padrao: normalizeBoolean(
        pickFirstDefined(
          impressao.usar_impressora_padrao,
          impressao.usarImpressoraPadrao,
          previousImpressao.usar_impressora_padrao
        ),
        defaultFiscalSettings.impressao.usar_impressora_padrao
      ),
      impressora: normalizeText(
        pickFirstDefined(impressao.impressora, impressao.nomeImpressora, impressao.printerName, previousImpressao.impressora),
        160
      ),
      largura_bobina_mm: normalizeInteger(
        pickFirstDefined(
          impressao.largura_bobina_mm,
          impressao.larguraBobinaMm,
          impressao.bobinaMm,
          previousImpressao.largura_bobina_mm
        ),
        defaultFiscalSettings.impressao.largura_bobina_mm,
        { min: 58, max: 210 }
      ),
    },
  };
}

function deactivateFiscalSettings(value = {}) {
  const fiscal = normalizeFiscalSettings(value);
  const ambientes = fiscalEnvironmentKeys.reduce((acc, key) => {
    acc[key] = {
      ...fiscal.ambientes[key],
      ativo: false,
    };
    return acc;
  }, {});
  const activeEnvironment = ambientes[fiscal.ambiente] || cloneDefaultFiscalEnvironmentSettings();

  return {
    ...fiscal,
    ambientes,
    ativo: false,
    certificado: activeEnvironment.certificado,
    nfce: activeEnvironment.nfce,
    nfe: activeEnvironment.nfe,
  };
}

function normalizeIntegrationSettings(value = {}, previousValue = {}) {
  const previousIntegrations =
    isObject(previousValue) && Object.keys(previousValue).length > 0
      ? previousValue
      : isObject(value)
        ? value
        : {};
  const cnpja = isObject(value?.cnpja) ? value.cnpja : {};
  const previousCnpja = isObject(previousIntegrations?.cnpja) ? previousIntegrations.cnpja : {};
  const token = pickFirstDefined(
    cnpja.token,
    cnpja.api_key,
    cnpja.apiKey,
    cnpja.chave_api,
    cnpja.chaveApi
  );
  const hasIncomingToken = normalizeText(token, 2048).length > 0;
  const ativo = normalizeBoolean(
    pickFirstDefined(cnpja.ativo, previousCnpja.ativo),
    defaultIntegrationSettings.cnpja.ativo
  );

  return {
    cnpja: {
      ativo: hasIncomingToken ? true : ativo,
      token_criptografado: resolveEncryptedSecret({
        incoming: token,
        previous: previousCnpja.token_criptografado || previousCnpja.token,
        clear: cnpja.limpar_token === true || cnpja.limparToken === true,
      }),
    },
  };
}

function buildFiscalReadiness(settings) {
  const fiscal = normalizeFiscalSettings(settings);
  const basePendencias = [];

  if (!fiscal.uf) {
    basePendencias.push('Informe a UF da empresa.');
  }

  if (!fiscal.emitente.cnpj_cpf || fiscal.emitente.cnpj_cpf.length < 14) {
    basePendencias.push('Informe o CNPJ do emitente.');
  }

  if (!fiscal.emitente.razao_social) {
    basePendencias.push('Informe a razão social.');
  }

  if (!fiscal.emitente.inscricao_estadual) {
    basePendencias.push('Informe a inscrição estadual.');
  }

  if (!fiscal.emitente.endereco.codigo_municipio) {
    basePendencias.push('Informe o código IBGE do município.');
  }

  if (!fiscal.emitente.endereco.cep) {
    basePendencias.push('Informe o CEP.');
  }

  const certificadoPendencias = [];

  if (!fiscal.certificado.arquivo_id) {
    certificadoPendencias.push('Envie o certificado A1.');
  }

  if (!fiscal.certificado.senha_criptografada) {
    certificadoPendencias.push('Informe a senha do certificado A1.');
  }

  const pendenciasNfce = [...basePendencias, ...certificadoPendencias];

  if (!fiscal.nfce.serie) {
    pendenciasNfce.push('Informe a série da NFC-e.');
  }

  if (!fiscal.nfce.proximo_numero) {
    pendenciasNfce.push('Informe o próximo número da NFC-e.');
  }

  if (!fiscal.nfce.csc_id) {
    pendenciasNfce.push('Informe o identificador do CSC.');
  }

  if (!fiscal.nfce.csc_token_criptografado) {
    pendenciasNfce.push('Informe a chave CSC.');
  }

  const pendenciasNfe = [...basePendencias, ...certificadoPendencias];

  if (!fiscal.nfe.serie) {
    pendenciasNfe.push('Informe a série da NF-e.');
  }

  if (!fiscal.nfe.proximo_numero) {
    pendenciasNfe.push('Informe o próximo número da NF-e.');
  }

  return {
    nfce: pendenciasNfce,
    nfe: pendenciasNfe,
  };
}

function sanitizeFiscalEnvironmentSettings(environment, includeSecrets = false) {
  const senhaPfx = decryptSecret(environment.certificado.senha_criptografada);
  const cscToken = decryptSecret(environment.nfce.csc_token_criptografado);

  return {
    ...environment,
    certificado: {
      ...environment.certificado,
      senha_criptografada: undefined,
      senha_configurada: Boolean(environment.certificado.senha_criptografada),
      ...(includeSecrets ? { senha_pfx: senhaPfx } : {}),
    },
    nfce: {
      ...environment.nfce,
      csc_token_criptografado: undefined,
      csc_token_configurado: Boolean(environment.nfce.csc_token_criptografado),
      ...(includeSecrets ? { csc_token: cscToken } : {}),
    },
  };
}

function sanitizeFiscalSettings(value = {}, options = {}) {
  const fiscal = normalizeFiscalSettings(value);
  const pendencias = buildFiscalReadiness(fiscal);
  const includeSecrets = options.includeSecrets !== false;
  const ambientes = fiscalEnvironmentKeys.reduce((acc, ambiente) => {
    acc[ambiente] = sanitizeFiscalEnvironmentSettings(fiscal.ambientes[ambiente], includeSecrets);
    return acc;
  }, {});
  const activeEnvironment = ambientes[fiscal.ambiente];

  return {
    ...fiscal,
    ambientes,
    ativo: activeEnvironment.ativo,
    certificado: activeEnvironment.certificado,
    nfce: activeEnvironment.nfce,
    nfe: activeEnvironment.nfe,
    prontidao: {
      nfce: pendencias.nfce.length === 0,
      nfe: pendencias.nfe.length === 0,
      pendencias_nfce: pendencias.nfce,
      pendencias_nfe: pendencias.nfe,
    },
  };
}

function sanitizeIntegrationSettings(value = {}) {
  const integracoes = normalizeIntegrationSettings(value);

  return {
    cnpja: {
      ativo: integracoes.cnpja.ativo,
      token_configurado: Boolean(integracoes.cnpja.token_criptografado),
    },
  };
}

async function hydrateFiscalCertificateMetadata(usuarioId, fiscalSettings, incomingFiscalSettings = {}, previousFiscalSettings = {}) {
  await Promise.all(fiscalEnvironmentKeys.map(async ambiente => {
    const environment = fiscalSettings.ambientes[ambiente];
    const incomingEnvironment = pickEnvironmentSource(incomingFiscalSettings, ambiente);
    const previousEnvironment = pickEnvironmentSource(previousFiscalSettings, ambiente);
    const touched = certificateWasTouched(incomingEnvironment, previousEnvironment);
    const senhaPfx = decryptSecret(environment.certificado.senha_criptografada);

    if (!environment.certificado.arquivo_id || !senhaPfx) {
      return;
    }

    const arquivo = await Arquivo.findOne({
      where: {
        id: environment.certificado.arquivo_id,
        usuario_id: usuarioId,
      },
    });
    const absolutePath = arquivo ? toAbsolutePath(arquivo.caminho_relativo) : null;

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      if (touched) {
        const error = new Error('Certificado A1 não encontrado para leitura.');
        error.code = 'CERTIFICATE_FILE_NOT_FOUND';
        error.status = 400;
        throw error;
      }

      return;
    }

    try {
      const metadata = extractPfxMetadata(absolutePath, senhaPfx);

      environment.certificado.validade = metadata.validade;
      environment.certificado.emitido_para = metadata.emitido_para;
    } catch (error) {
      if (touched) {
        const nextError = new Error('Não foi possível ler o certificado A1. Confira o arquivo e a senha.');
        nextError.code = error.code || 'CERTIFICATE_READ_FAILED';
        nextError.status = 400;
        throw nextError;
      }
    }
  }));

  const activeEnvironment = fiscalSettings.ambientes[fiscalSettings.ambiente];

  fiscalSettings.ativo = activeEnvironment.ativo;
  fiscalSettings.certificado = activeEnvironment.certificado;
  fiscalSettings.nfce = activeEnvironment.nfce;
  fiscalSettings.nfe = activeEnvironment.nfe;

  return fiscalSettings;
}

function fiscalCertificateMetadataMissing(settings = {}) {
  const fiscal = normalizeFiscalSettings(settings);

  return fiscalEnvironmentKeys.some(ambiente => {
    const certificate = fiscal.ambientes[ambiente]?.certificado || {};

    return Boolean(
      certificate.arquivo_id &&
        certificate.senha_criptografada &&
        (!certificate.validade || !certificate.emitido_para)
    );
  });
}

function sanitizeConfiguracao(configuracao, options = {}) {
  const data = configuracao?.get ? configuracao.get({ plain: true }) : configuracao || {};
  const fiscal = options.disableFiscalEmission ? deactivateFiscalSettings(data.fiscal) : data.fiscal;

  return {
    id: data.id ?? null,
    usuario_id: data.usuario_id ?? null,
    formas_pagamento: normalizePaymentMethods(data.formas_pagamento),
    lancar_despesas: normalizeExpenseSettings(data.lancar_despesas),
    controle_funcionarios: normalizeEmployeeControlSettings(data.controle_funcionarios),
    comandas: normalizeCommandSettings(data.comandas),
    resumo_turno: normalizeShiftSummarySettings(data.resumo_turno),
    fiscal: sanitizeFiscalSettings(fiscal, options.fiscal),
    integracoes: sanitizeIntegrationSettings(data.integracoes),
    updated_at: data.updated_at ?? data.updatedAt ?? null,
  };
}

async function resolveNextFiscalNumberFromHistory(usuarioId, { ambiente, modelo, serie, fallback }) {
  const normalizedSerie = normalizeInteger(serie, 1, { min: 1, max: 999 });
  const configuredNextNumber = normalizeInteger(fallback, 1, { min: 1, max: 999999999 });
  const lastNumber = await Nf.max('numero', {
    where: {
      usuario_id: usuarioId,
      ambiente,
      modelo,
      serie: normalizedSerie,
    },
  });
  const lastNumberValue = Number(lastNumber);
  const historyNextNumber = Number.isFinite(lastNumberValue) && lastNumberValue > 0
    ? Math.min(Math.floor(lastNumberValue) + 1, 999999999)
    : 1;

  return Math.max(configuredNextNumber, historyNextNumber);
}

async function applyFiscalHistoryNextNumbers(usuarioId, configuracao) {
  const fiscal = configuracao?.fiscal;

  if (!fiscal?.ambientes) {
    return configuracao;
  }

  await Promise.all(fiscalEnvironmentKeys.map(async ambiente => {
    const environment = fiscal.ambientes[ambiente];

    if (!environment) {
      return;
    }

    const nfceSerie = normalizeInteger(environment.nfce?.serie, defaultFiscalEnvironmentSettings.nfce.serie, {
      min: 1,
      max: 999,
    });
    const nfeSerie = normalizeInteger(environment.nfe?.serie, defaultFiscalEnvironmentSettings.nfe.serie, {
      min: 1,
      max: 999,
    });

    const [nextNfceNumber, nextNfeNumber] = await Promise.all([
      resolveNextFiscalNumberFromHistory(usuarioId, {
        ambiente,
        modelo: '65',
        serie: nfceSerie,
        fallback: environment.nfce?.proximo_numero,
      }),
      resolveNextFiscalNumberFromHistory(usuarioId, {
        ambiente,
        modelo: '55',
        serie: nfeSerie,
        fallback: environment.nfe?.proximo_numero,
      }),
    ]);

    environment.nfce = {
      ...environment.nfce,
      serie: nfceSerie,
      proximo_numero: nextNfceNumber,
    };
    environment.nfe = {
      ...environment.nfe,
      serie: nfeSerie,
      proximo_numero: nextNfeNumber,
    };
  }));

  const activeEnvironment = fiscal.ambientes[fiscal.ambiente];

  if (activeEnvironment) {
    fiscal.ativo = activeEnvironment.ativo;
    fiscal.certificado = activeEnvironment.certificado;
    fiscal.nfce = activeEnvironment.nfce;
    fiscal.nfe = activeEnvironment.nfe;
  }

  return configuracao;
}

async function sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao, options = {}) {
  const sanitized = sanitizeConfiguracao(configuracao, options);

  return applyFiscalHistoryNextNumbers(usuarioId, sanitized);
}

async function getOrCreateConfiguracao(usuarioId, options = {}) {
  const [configuracao] = await ConfiguracaoSistema.findOrCreate({
    where: {
      usuario_id: usuarioId,
    },
    defaults: {
      usuario_id: usuarioId,
      formas_pagamento: defaultPaymentMethods,
      lancar_despesas: defaultExpenseSettings,
      controle_funcionarios: defaultEmployeeControlSettings,
      comandas: defaultCommandSettings,
      resumo_turno: defaultShiftSummarySettings,
      fiscal: {},
      integracoes: defaultIntegrationSettings,
    },
    ...options,
  });

  return configuracao;
}

async function getConfiguracaoSnapshot(usuarioId, options = {}) {
  const { disableFiscalEmission, sanitize, ...queryOptions } = options;
  const configuracao = await getOrCreateConfiguracao(usuarioId, queryOptions);

  if (fiscalCertificateMetadataMissing(configuracao.fiscal)) {
    const nextFiscalSettings = normalizeFiscalSettings(configuracao.fiscal);

    await hydrateFiscalCertificateMetadata(usuarioId, nextFiscalSettings, {}, configuracao.fiscal);
    configuracao.fiscal = nextFiscalSettings;
    await configuracao.save();
  }

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao, {
    ...sanitize,
    disableFiscalEmission: disableFiscalEmission === true,
  });
}

async function deactivateFiscalEmission(usuarioId, options = {}) {
  const transaction = options.transaction || null;
  const configuracao = await getOrCreateConfiguracao(usuarioId, { transaction });

  configuracao.fiscal = deactivateFiscalSettings(configuracao.fiscal);
  await configuracao.save({ transaction });

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao, {
    disableFiscalEmission: true,
  });
}

async function updatePaymentMethods(usuarioId, paymentMethods) {
  const nextPaymentMethods = normalizePaymentMethods(paymentMethods);

  if (!paymentMethodKeys.some(key => paymentMethods?.[key] === true)) {
    const error = new Error('Mantenha pelo menos uma forma de pagamento ativa.');
    error.code = 'PAYMENT_METHOD_REQUIRED';
    error.status = 400;
    throw error;
  }

  const configuracao = await getOrCreateConfiguracao(usuarioId);

  configuracao.formas_pagamento = nextPaymentMethods;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function updateFiscalSettings(usuarioId, fiscalSettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextFiscalSettings = normalizeFiscalSettings(fiscalSettings, configuracao.fiscal);
  await hydrateFiscalCertificateMetadata(usuarioId, nextFiscalSettings, fiscalSettings, configuracao.fiscal);

  configuracao.fiscal = nextFiscalSettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function updateCommandSettings(usuarioId, commandSettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextCommandSettings = normalizeCommandSettings(commandSettings);

  configuracao.comandas = nextCommandSettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function updateShiftSummarySettings(usuarioId, shiftSummarySettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextShiftSummarySettings = normalizeShiftSummarySettings(shiftSummarySettings);

  configuracao.resumo_turno = nextShiftSummarySettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function updateExpenseSettings(usuarioId, expenseSettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextExpenseSettings = normalizeExpenseSettings(expenseSettings);

  configuracao.lancar_despesas = nextExpenseSettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function updateEmployeeControlSettings(usuarioId, employeeControlSettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextEmployeeControlSettings = normalizeEmployeeControlSettings(employeeControlSettings);

  configuracao.controle_funcionarios = nextEmployeeControlSettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function getCommandSettings(usuarioId) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);

  return normalizeCommandSettings(configuracao.comandas);
}

async function updateIntegrationSettings(usuarioId, integrationSettings) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const nextIntegrationSettings = normalizeIntegrationSettings(integrationSettings, configuracao.integracoes);

  configuracao.integracoes = nextIntegrationSettings;
  await configuracao.save();

  return sanitizeConfiguracaoWithFiscalHistory(usuarioId, configuracao);
}

async function getCnpjaApiKey(usuarioId) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const integracoes = normalizeIntegrationSettings(configuracao.integracoes);

  if (!integracoes.cnpja.ativo || !integracoes.cnpja.token_criptografado) {
    return '';
  }

  return decryptSecret(integracoes.cnpja.token_criptografado);
}

async function getCnpjaToken(usuarioId) {
  const configuracao = await getOrCreateConfiguracao(usuarioId);
  const integracoes = normalizeIntegrationSettings(configuracao.integracoes);

  if (!integracoes.cnpja.token_criptografado) {
    return '';
  }

  return decryptSecret(integracoes.cnpja.token_criptografado);
}

module.exports = {
  defaultCommandSettings,
  defaultEmployeeControlSettings,
  defaultExpenseSettings,
  defaultFiscalSettings,
  defaultIntegrationSettings,
  defaultPaymentMethods,
  defaultShiftSummarySettings,
  deactivateFiscalEmission,
  deactivateFiscalSettings,
  decryptSecret,
  getCnpjaApiKey,
  getCnpjaToken,
  getCommandSettings,
  getConfiguracaoSnapshot,
  normalizeCommandSettings,
  normalizeEmployeeControlSettings,
  normalizeExpenseSettings,
  normalizeIntegrationSettings,
  normalizeFiscalSettings,
  normalizePaymentMethods,
  normalizeShiftSummarySettings,
  sanitizeConfiguracao,
  sanitizeFiscalSettings,
  sanitizeIntegrationSettings,
  updateCommandSettings,
  updateEmployeeControlSettings,
  updateExpenseSettings,
  updateFiscalSettings,
  updateIntegrationSettings,
  updatePaymentMethods,
  updateShiftSummarySettings,
};
