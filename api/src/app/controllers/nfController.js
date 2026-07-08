const { ulid } = require('ulid');
const { Op } = require('sequelize');
const archiver = require('archiver');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const {
  Arquivo,
  Caixa,
  CategoriaProduto,
  GrupoFiscal,
  Nf,
  NfEvento,
  Pdv,
  Produto,
  Venda,
} = require('../models');
const configuracaoSistemaService = require('../services/configuracaoSistemaService');
const { ensureFeature } = require('../services/assinaturaEntitlementsService');
const {
  buildStorageDirectory,
  buildStoredFileName,
  ensureDirectory,
  removePhysicalFile,
  toAbsolutePath,
  toRelativePath,
} = require('../services/fileStorageService');

const allowedStatuses = new Set([
  'rascunho',
  'pendente',
  'transmitindo',
  'autorizada',
  'contingencia',
  'rejeitada',
  'denegada',
  'cancelada',
  'inutilizada',
  'erro_tecnico',
  'duplicidade',
]);
const reportableFiscalStatuses = new Set(['autorizada']);
const nonTaxedPisCofinsCsts = new Set(['04', '05', '06', '07', '08', '09']);
const fiscalNatureByNcmPrefix = [
  { prefix: '22011000', nature: '415' },
  { prefix: '2201', nature: '415' },
  { prefix: '22030000', nature: '423' },
  { prefix: '2203', nature: '423' },
  { prefix: '21069090', nature: '651' },
];

function getPlain(record) {
  return record?.get ? record.get({ plain: true }) : record;
}

function normalizeText(value, maxLength = 255) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeInteger(value, fallback, { min = 0, max = 999999999 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeNullableInteger(value, { min = 1, max = 2147483647 } = {}) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function normalizeModelo(value, fallback = '65') {
  const modelo = normalizeText(value, 2);

  if (modelo === '55' || modelo === '65') {
    return modelo;
  }

  if (fallback === '') {
    return '';
  }

  return fallback === '55' ? '55' : '65';
}

function normalizeAmbiente(value, fallback = 'homologacao') {
  const ambiente = normalizeText(value, 20);

  if (ambiente === 'producao' || ambiente === 'homologacao') {
    return ambiente;
  }

  return fallback === 'producao' ? 'producao' : 'homologacao';
}

function normalizeStatus(value, fallback = 'rascunho') {
  const status = normalizeText(value, 32);

  return allowedStatuses.has(status) ? status : fallback;
}

function sanitizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeDateFilter(value, boundary = 'start') {
  const rawValue = normalizeText(value, 24);

  if (!rawValue) {
    return null;
  }

  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return boundary === 'end'
      ? new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999)
      : new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0);
  }

  return sanitizeDate(rawValue);
}

function toIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sanitizeArquivoResumo(arquivo) {
  if (!arquivo) {
    return null;
  }

  const data = getPlain(arquivo);

  return {
    id: data.id,
    nome_original: data.nome_original,
    mime_type: data.mime_type,
    tipo: data.tipo,
    tamanho_bytes: Number(data.tamanho_bytes || 0),
    created_at: data.created_at,
  };
}

const maxFiscalXmlBytes = 8 * 1024 * 1024;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeXmlContent(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const content = value.trim();

  if (!content || !content.includes('<') || Buffer.byteLength(content, 'utf8') > maxFiscalXmlBytes) {
    return null;
  }

  return content;
}

function firstXmlContent(...values) {
  for (const value of values) {
    const content = normalizeXmlContent(value);

    if (content) {
      return content;
    }
  }

  return null;
}

function buildNfXmlPayload(nfData) {
  const retornoSefaz = asObject(nfData.retorno_sefaz);
  const resposta = asObject(retornoSefaz.resposta);
  const responseData = asObject(resposta.data);
  const payload = asObject(nfData.payload);

  return {
    enviado: firstXmlContent(
      responseData.xmlAssinado,
      responseData.xmlEnviado,
      resposta.xmlAssinado,
      resposta.xmlEnviado,
      payload.xmlAssinado,
      payload.xmlEnviado
    ),
    autorizado: firstXmlContent(
      responseData.xmlProc,
      responseData.xmlAutorizado,
      resposta.xmlProc,
      resposta.xmlAutorizado,
      retornoSefaz.xmlProc,
      payload.xmlProc
    ),
  };
}

function buildNfXmlOriginalName(nfData, tipoXml) {
  const modelo = nfData.modelo === '55' ? 'nfe' : 'nfce';
  const serie = String(nfData.serie || 'sem-serie').padStart(3, '0');
  const numero = String(nfData.numero || 'sem-numero').padStart(9, '0');

  return `${modelo}-serie-${serie}-${numero}-${tipoXml}.xml`;
}

function getNfXmlContext(tipoXml) {
  if (tipoXml === 'autorizado') {
    return 'nf_xml_autorizado';
  }

  if (tipoXml === 'enviado') {
    return 'nf_xml_enviado';
  }

  return `nf_xml_${tipoXml}`;
}

function getTerminalNfEventXmlType(status) {
  if (status === 'cancelada') {
    return 'cancelamento';
  }

  if (status === 'inutilizada') {
    return 'inutilizacao';
  }

  return null;
}

async function createNfXmlArquivo(usuarioId, nfData, tipoXml, xmlContent) {
  const mimeType = 'application/xml';
  const originalName = buildNfXmlOriginalName(nfData, tipoXml);
  const storageDirectory = buildStorageDirectory(usuarioId, mimeType);
  const storedFileName = buildStoredFileName({ originalname: originalName, mimetype: mimeType });
  const absolutePath = path.join(storageDirectory, storedFileName);
  const buffer = Buffer.from(xmlContent, 'utf8');

  ensureDirectory(storageDirectory);
  await fs.promises.writeFile(absolutePath, buffer);

  try {
    return await Arquivo.create({
      usuario_id: usuarioId,
      nome_original: originalName,
      nome_armazenado: storedFileName,
      mime_type: mimeType,
      extensao: 'xml',
      tamanho_bytes: buffer.length,
      tipo: 'xml',
      contexto: getNfXmlContext(tipoXml),
      visibilidade: 'privado',
      caminho_relativo: toRelativePath(absolutePath),
      metadados: {
        origem: 'nf_backfill',
        nf_id: nfData.id,
        venda_id: nfData.venda_id || null,
        chave_acesso: nfData.chave_acesso || null,
        modelo: nfData.modelo,
        serie: nfData.serie,
        numero: nfData.numero,
        tipo_xml: tipoXml,
      },
    });
  } catch (error) {
    removePhysicalFile(absolutePath);
    throw error;
  }
}

async function ensureNfXmlArquivos(nf) {
  const nfData = getPlain(nf);
  const xmlPayload = buildNfXmlPayload(nfData);
  let xmlEnviadoArquivoId = nfData.xml_enviado_arquivo_id || null;
  let xmlAutorizadoArquivoId = nfData.xml_autorizado_arquivo_id || null;
  let changed = false;
  const terminalXmlType = getTerminalNfEventXmlType(nfData.status);

  if (!xmlEnviadoArquivoId && xmlPayload.enviado) {
    const arquivo = await createNfXmlArquivo(nf.usuario_id, nfData, 'enviado', xmlPayload.enviado);
    xmlEnviadoArquivoId = arquivo.id;
    changed = true;
  }

  if (!xmlAutorizadoArquivoId && xmlPayload.autorizado && !terminalXmlType) {
    if (xmlPayload.autorizado === xmlPayload.enviado && xmlEnviadoArquivoId) {
      xmlAutorizadoArquivoId = xmlEnviadoArquivoId;
    } else {
      const arquivo = await createNfXmlArquivo(nf.usuario_id, nfData, 'autorizado', xmlPayload.autorizado);
      xmlAutorizadoArquivoId = arquivo.id;
    }

    changed = true;
  }

  if (changed) {
    nf.xml_enviado_arquivo_id = xmlEnviadoArquivoId;
    nf.xml_autorizado_arquivo_id = xmlAutorizadoArquivoId;
    await nf.save();
  }

  if (terminalXmlType) {
    const existingTerminalEvent = await NfEvento.findOne({
      where: {
        nf_id: nf.id,
        usuario_id: nf.usuario_id,
        status: nfData.status,
        arquivo_xml_id: { [Op.not]: null },
      },
      order: [['ocorrido_em', 'DESC']],
    });
    const terminalXmlContent = xmlPayload.autorizado || xmlPayload.enviado;

    if (!existingTerminalEvent && terminalXmlContent) {
      const arquivo = await createNfXmlArquivo(nf.usuario_id, nfData, terminalXmlType, terminalXmlContent);
      const now = new Date();
      const eventSummary = {
        tipo: terminalXmlType,
        status: nfData.status,
        codigo_retorno_sefaz: nfData.codigo_retorno_sefaz || null,
        mensagem: nfData.mensagem_retorno_sefaz || nfData.ultimo_erro_tecnico || null,
        arquivo_xml_id: arquivo.id,
        ocorrido_em: now.toISOString(),
      };

      nf.eventos = [...(Array.isArray(nfData.eventos) ? nfData.eventos : []), eventSummary].slice(-80);
      await NfEvento.create({
        nf_id: nf.id,
        usuario_id: nf.usuario_id,
        tipo: terminalXmlType,
        status: nfData.status,
        codigo_retorno_sefaz: nfData.codigo_retorno_sefaz || null,
        mensagem: nfData.mensagem_retorno_sefaz || nfData.ultimo_erro_tecnico || null,
        arquivo_xml_id: arquivo.id,
        detalhes: { origem: 'nf_xml_backfill' },
        ocorrido_em: now,
      });
      await nf.save();

      return true;
    }
  }

  return changed;
}

function sanitizeEvento(evento) {
  const data = getPlain(evento);

  return {
    id: data.id,
    nf_id: data.nf_id,
    tipo: data.tipo,
    status: data.status,
    codigo_retorno_sefaz: data.codigo_retorno_sefaz || null,
    mensagem: data.mensagem || null,
    arquivo_xml_id: data.arquivo_xml_id || null,
    arquivo_xml: sanitizeArquivoResumo(data.arquivo_xml),
    detalhes: data.detalhes && typeof data.detalhes === 'object' ? data.detalhes : {},
    ocorrido_em: toIso(data.ocorrido_em),
    created_at: toIso(data.created_at),
  };
}

function getNfEventoInclude() {
  return {
    model: NfEvento,
    as: 'historico',
    required: false,
    include: [{ model: Arquivo, as: 'arquivo_xml', required: false }],
  };
}

async function attachHistoricoToNfs(nfs, usuarioId) {
  if (!nfs.length) {
    return;
  }

  const eventos = await NfEvento.findAll({
    where: {
      usuario_id: usuarioId,
      nf_id: nfs.map(nf => nf.id),
    },
    include: [{ model: Arquivo, as: 'arquivo_xml', required: false }],
    order: [['ocorrido_em', 'DESC']],
  });
  const eventosByNfId = new Map();

  for (const evento of eventos) {
    const list = eventosByNfId.get(evento.nf_id) || [];
    list.push(evento);
    eventosByNfId.set(evento.nf_id, list);
  }

  for (const nf of nfs) {
    nf.setDataValue('historico', eventosByNfId.get(nf.id) || []);
  }
}

function sanitizeNf(nf, { includePayload = false } = {}) {
  const data = getPlain(nf);

  return {
    id: data.id,
    venda_id: data.venda_id || null,
    pdv_id: data.pdv_id || null,
    caixa_id: data.caixa_id || null,
    ambiente: data.ambiente,
    modelo: data.modelo,
    serie: Number(data.serie || 0),
    numero: Number(data.numero || 0),
    chave_acesso: data.chave_acesso || null,
    status: data.status,
    tipo_emissao: data.tipo_emissao,
    finalidade: data.finalidade,
    natureza_operacao: data.natureza_operacao,
    total_centavos: Number(data.total_centavos || 0),
    protocolo_autorizacao: data.protocolo_autorizacao || null,
    protocolo_cancelamento: data.protocolo_cancelamento || null,
    codigo_retorno_sefaz: data.codigo_retorno_sefaz || null,
    mensagem_retorno_sefaz: data.mensagem_retorno_sefaz || null,
    ultimo_erro_tecnico: data.ultimo_erro_tecnico || null,
    xml_enviado_arquivo_id: data.xml_enviado_arquivo_id || null,
    xml_autorizado_arquivo_id: data.xml_autorizado_arquivo_id || null,
    danfe_pdf_arquivo_id: data.danfe_pdf_arquivo_id || null,
    xml_enviado: sanitizeArquivoResumo(data.xml_enviado),
    xml_autorizado: sanitizeArquivoResumo(data.xml_autorizado),
    danfe_pdf: sanitizeArquivoResumo(data.danfe_pdf),
    retorno_sefaz: data.retorno_sefaz && typeof data.retorno_sefaz === 'object' ? data.retorno_sefaz : {},
    eventos: Array.isArray(data.eventos) ? data.eventos : [],
    historico: Array.isArray(data.historico) ? data.historico.map(sanitizeEvento) : [],
    payload: includePayload && data.payload && typeof data.payload === 'object' ? data.payload : undefined,
    emitida_em: toIso(data.emitida_em),
    autorizada_em: toIso(data.autorizada_em),
    cancelada_em: toIso(data.cancelada_em),
    created_at: toIso(data.created_at),
    updated_at: toIso(data.updated_at),
  };
}

function createNfId() {
  return `nf-${ulid().toLowerCase()}`;
}

function getNfArquivoIncludes() {
  return [
    { model: Arquivo, as: 'xml_enviado', required: false },
    { model: Arquivo, as: 'xml_autorizado', required: false },
    { model: Arquivo, as: 'danfe_pdf', required: false },
  ];
}

function getFiscalDefaults(fiscal, modelo, ambiente) {
  const targetAmbiente = normalizeAmbiente(ambiente, fiscal?.ambiente);
  const environmentConfig = fiscal?.ambientes?.[targetAmbiente] || fiscal || {};
  const serieConfig = modelo === '55' ? environmentConfig?.nfe : environmentConfig?.nfce;

  return {
    ambiente: targetAmbiente,
    modelo,
    serie: normalizeInteger(serieConfig?.serie, 1, { min: 1, max: 999 }),
    numero: normalizeInteger(serieConfig?.proximo_numero, 1, { min: 1, max: 999999999 }),
    natureza_operacao: normalizeText(fiscal?.natureza_operacao_padrao, 120) || 'Venda',
  };
}

async function findNfForUser(usuarioId, id, options = {}) {
  return Nf.findOne({
    where: {
      id,
      usuario_id: usuarioId,
    },
    ...options,
  });
}

async function appendNfEvent(nf, eventData) {
  const now = new Date();
  const eventoResumo = {
    tipo: eventData.tipo,
    status: eventData.status,
    codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
    mensagem: eventData.mensagem || null,
    arquivo_xml_id: eventData.arquivo_xml_id || null,
    ocorrido_em: now.toISOString(),
  };

  const eventos = Array.isArray(nf.eventos) ? nf.eventos : [];

  nf.eventos = [...eventos, eventoResumo].slice(-80);

  return NfEvento.create({
    nf_id: nf.id,
    usuario_id: nf.usuario_id,
    tipo: eventData.tipo,
    status: eventData.status,
    codigo_retorno_sefaz: eventData.codigo_retorno_sefaz || null,
    mensagem: eventData.mensagem || null,
    arquivo_xml_id: eventData.arquivo_xml_id || null,
    detalhes: eventData.detalhes && typeof eventData.detalhes === 'object' ? eventData.detalhes : {},
    ocorrido_em: now,
  });
}

function handleNfError(res, error, defaultMessage) {
  if (error.statusCode) {
    return res.status(error.statusCode).json({
      code: error.code,
      message: error.message || defaultMessage,
      entitlements: error.entitlements,
    });
  }

  return res.status(500).json({
    message: defaultMessage,
    detail: error.message,
  });
}

function buildNfWhereFromQuery(usuarioId, query = {}) {
  const where = {
    usuario_id: usuarioId,
  };
  const status = normalizeText(query.status, 32);
  const modelo = normalizeModelo(query.modelo, '');
  const ambiente = normalizeText(query.ambiente, 20);
  const termo = normalizeText(query.q, 80);
  const dataInicio = sanitizeDateFilter(query.data_inicio || query.dataInicio, 'start');
  const dataFim = sanitizeDateFilter(query.data_fim || query.dataFim, 'end');
  const andConditions = [];

  if (status && allowedStatuses.has(status)) {
    where.status = status;
  }

  if (modelo) {
    where.modelo = modelo;
  }

  if (ambiente === 'homologacao' || ambiente === 'producao') {
    where.ambiente = ambiente;
  }

  if (termo) {
    const numero = Number(termo);
    const searchConditions = [
      { chave_acesso: { [Op.iLike]: `%${termo}%` } },
      { protocolo_autorizacao: { [Op.iLike]: `%${termo}%` } },
    ];

    if (Number.isInteger(numero)) {
      searchConditions.push({ numero });
    }

    andConditions.push({ [Op.or]: searchConditions });
  }

  if (dataInicio || dataFim) {
    const dateRange = {};

    if (dataInicio) {
      dateRange[Op.gte] = dataInicio;
    }

    if (dataFim) {
      dateRange[Op.lte] = dataFim;
    }

    andConditions.push({
      [Op.or]: [
        { emitida_em: dateRange },
        { emitida_em: null, created_at: dateRange },
      ],
    });
  }

  if (andConditions.length > 0) {
    where[Op.and] = andConditions;
  }

  return where;
}

function buildReportWhereFromQuery(usuarioId, query = {}) {
  const where = buildNfWhereFromQuery(usuarioId, query);

  if (where.status) {
    return reportableFiscalStatuses.has(where.status) ? where : null;
  }

  where.status = { [Op.in]: [...reportableFiscalStatuses] };
  return where;
}

async function findFilteredNfs(usuarioId, query = {}, options = {}) {
  const where = options.reportOnly
    ? buildReportWhereFromQuery(usuarioId, query)
    : buildNfWhereFromQuery(usuarioId, query);

  if (!where) {
    return [];
  }

  const include = options.includeHistorico
    ? [...getNfArquivoIncludes(), getNfEventoInclude()]
    : getNfArquivoIncludes();
  const rows = await Nf.findAll({
    where,
    include,
    order: [['created_at', 'DESC']],
  });
  const materializedXml = await Promise.all(rows.map(nf => ensureNfXmlArquivos(nf).catch(() => false)));

  if (!materializedXml.some(Boolean)) {
    return rows;
  }

  return Nf.findAll({
    where,
    include,
    order: [['created_at', 'DESC']],
  });
}

function sanitizeFilePart(value, fallback = 'arquivo') {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140);

  return normalized || fallback;
}

function buildFilteredExportName(prefix, query = {}, extension = 'zip') {
  const start = normalizeText(query.data_inicio || query.dataInicio, 10) || 'inicio';
  const end = normalizeText(query.data_fim || query.dataFim, 10) || 'fim';
  const status = normalizeText(query.status, 32) || 'todos';

  return `${prefix}-${sanitizeFilePart(status)}-${sanitizeFilePart(start)}-${sanitizeFilePart(end)}.${extension}`;
}

function getNfArchiveBaseName(nf) {
  const data = getPlain(nf);
  const model = data.modelo === '55' ? 'nfe' : 'nfce';
  const serie = String(data.serie || '0').padStart(3, '0');
  const numero = String(data.numero || '0').padStart(9, '0');
  const key = data.chave_acesso ? `-${data.chave_acesso}` : '';

  return `${model}-serie-${serie}-${numero}${key}`;
}

function collectNfXmlFiles(nf) {
  const data = getPlain(nf);
  const files = [];
  const seen = new Set();

  function addFile(kind, arquivo) {
    const file = getPlain(arquivo);

    if (!file?.id || seen.has(file.id)) {
      return;
    }

    seen.add(file.id);
    files.push({ kind, file });
  }

  if (data.status === 'cancelada' || data.status === 'inutilizada') {
    for (const event of data.historico || []) {
      addFile(normalizeText(event.tipo, 40) || data.status, event.arquivo_xml);
    }
  }

  addFile('autorizado', data.xml_autorizado);
  addFile('enviado', data.xml_enviado);

  if (data.status !== 'cancelada' && data.status !== 'inutilizada') {
    for (const event of data.historico || []) {
      addFile(normalizeText(event.tipo, 40) || 'evento', event.arquivo_xml);
    }
  }

  return files;
}

function sendZipResponse(res, fileName) {
  const archive = archiver('zip', { zlib: { level: 9 } });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilePart(fileName, 'exportacao.zip')}"`);

  archive.on('error', error => {
    if (!res.headersSent) {
      res.status(500).json({
        message: 'Não foi possível gerar o arquivo compactado.',
        detail: error.message,
      });
      return;
    }

    res.destroy(error);
  });

  archive.pipe(res);
  return archive;
}

function getFirstObject(...values) {
  for (const value of values) {
    const objectValue = asObject(value);

    if (Object.keys(objectValue).length > 0) {
      return objectValue;
    }
  }

  return {};
}

function getArrayItems(value) {
  if (Array.isArray(value)) {
    return value.filter(item => item && typeof item === 'object' && !Array.isArray(item));
  }

  return [];
}

function getPayloadItemsForReport(payload = {}) {
  const directItems = getArrayItems(payload.itens);

  if (directItems.length > 0) {
    return directItems;
  }

  const sale = asObject(payload.venda);
  return getArrayItems(sale.itens).concat(getArrayItems(sale.items));
}

function firstTextFromObject(object, keys, maxLength = 255) {
  for (const key of keys) {
    const value = object?.[key];

    if (typeof value === 'string' && value.trim()) {
      return normalizeText(value, maxLength);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value).slice(0, maxLength);
    }
  }

  return '';
}

function firstNumberFromObject(object, keys, fallback = null) {
  for (const key of keys) {
    const value = object?.[key];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    const numberValue = Number(value);

    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return fallback;
}

function normalizeDigits(value, maxLength = 20) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

function normalizeDecimal(value, fallback = 0) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function getProductIdFromLine(line) {
  const rawId = firstTextFromObject(line, ['produto_id', 'produtoId', 'productId', 'id'], 32);
  const numericId = Number(rawId);

  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

async function fetchReportProductMap(usuarioId, nfs) {
  const productIds = [
    ...new Set(
      nfs
        .flatMap(nf => getPayloadItemsForReport(getPlain(nf).payload))
        .map(getProductIdFromLine)
        .filter(Boolean)
    ),
  ];

  if (productIds.length === 0) {
    return new Map();
  }

  const products = await Produto.findAll({
    where: {
      usuario_id: usuarioId,
      id: { [Op.in]: productIds },
    },
    include: [
      { model: CategoriaProduto, as: 'categoria', required: false },
      { model: GrupoFiscal, as: 'grupo_fiscal', required: false },
    ],
  });

  return new Map(products.map(product => [product.id, getPlain(product)]));
}

function resolveFiscalNature(ncm, pisCst, cofinsCst) {
  const normalizedNcm = normalizeDigits(ncm, 8);
  const hasNonTaxedPisCofins =
    nonTaxedPisCofinsCsts.has(normalizeDigits(pisCst, 2).padStart(2, '0')) ||
    nonTaxedPisCofinsCsts.has(normalizeDigits(cofinsCst, 2).padStart(2, '0'));

  if (!hasNonTaxedPisCofins) {
    return '999';
  }

  const matchedRule = fiscalNatureByNcmPrefix.find(rule => normalizedNcm.startsWith(rule.prefix));
  return matchedRule?.nature || '999';
}

function calculateTaxCents(baseCents, rate, cst, options = {}) {
  const normalizedRate = normalizeDecimal(rate, 0);
  const normalizedCst = normalizeDigits(cst, 2).padStart(2, '0');

  if (options.skipNonTaxedPisCofins && nonTaxedPisCofinsCsts.has(normalizedCst)) {
    return 0;
  }

  if (normalizedRate <= 0 || baseCents <= 0) {
    return 0;
  }

  return Math.round(baseCents * (normalizedRate / 100));
}

function buildEmptyReportTotals() {
  return {
    quantidade_total: 0,
    valor_total_centavos: 0,
    icms_total_centavos: 0,
    pis_total_centavos: 0,
    cofins_total_centavos: 0,
  };
}

function addProductTotals(totals, line) {
  totals.quantidade_total += line.quantidade;
  totals.valor_total_centavos += line.valor_centavos;
  totals.icms_total_centavos += line.icms.valor_centavos;
  totals.pis_total_centavos += line.pis.valor_centavos;
  totals.cofins_total_centavos += line.cofins.valor_centavos;
}

function mergeProductReportLine(currentLine, nextLine) {
  currentLine.quantidade += nextLine.quantidade;
  currentLine.valor_centavos += nextLine.valor_centavos;
  currentLine.icms.valor_centavos += nextLine.icms.valor_centavos;
  currentLine.pis.valor_centavos += nextLine.pis.valor_centavos;
  currentLine.cofins.valor_centavos += nextLine.cofins.valor_centavos;
}

function buildReportLine({ line, index, product }) {
  const fiscal = getFirstObject(line.fiscal, line.grupo_fiscal, line.perfil_fiscal, product?.grupo_fiscal);
  const quantity = firstNumberFromObject(line, ['quantidade', 'quantity', 'qtd'], 1) || 1;
  const directTotalCents = firstNumberFromObject(line, [
    'total_centavos',
    'totalCents',
    'totalPriceCents',
    'total_price_cents',
    'valor_total_centavos',
    'valorTotalCentavos',
  ]);
  const unitPriceCents = firstNumberFromObject(line, [
    'preco_unitario_centavos',
    'priceCents',
    'preco_venda_centavos',
    'valor_unitario_centavos',
    'unitPriceCents',
  ]);
  const totalCents = Number.isFinite(directTotalCents)
    ? Math.round(directTotalCents)
    : Math.round((unitPriceCents || product?.preco_venda_centavos || 0) * quantity);
  const description =
    firstTextFromObject(line, ['nome', 'name', 'descricao', 'produto_nome'], 120) ||
    product?.nome ||
    `Item ${index + 1}`;
  const ncm = normalizeDigits(
    firstTextFromObject(line, ['ncm'], 8) ||
      firstTextFromObject(fiscal, ['ncm'], 8) ||
      product?.ncm,
    8
  );
  const cfop = normalizeDigits(firstTextFromObject(fiscal, ['cfop'], 4) || firstTextFromObject(line, ['cfop'], 4), 4);
  const icmsCode = normalizeDigits(
    firstTextFromObject(fiscal, ['cst_icms', 'cstIcms', 'csosn'], 3) ||
      firstTextFromObject(line, ['cst_icms', 'cstIcms', 'csosn'], 3),
    3
  );
  const pisCst = normalizeDigits(
    firstTextFromObject(fiscal, ['cst_pis', 'pisCst'], 2) || firstTextFromObject(line, ['cst_pis', 'pisCst'], 2),
    2
  );
  const cofinsCst = normalizeDigits(
    firstTextFromObject(fiscal, ['cst_cofins', 'cofinsCst'], 2) || firstTextFromObject(line, ['cst_cofins', 'cofinsCst'], 2),
    2
  );
  const icmsRate = normalizeDecimal(fiscal.aliquota_icms ?? fiscal.aliquotaIcms ?? fiscal.icmsRate, 0);
  const pisRate = normalizeDecimal(fiscal.aliquota_pis ?? fiscal.aliquotaPis ?? fiscal.pisRate, 0);
  const cofinsRate = normalizeDecimal(fiscal.aliquota_cofins ?? fiscal.aliquotaCofins ?? fiscal.cofinsRate, 0);

  return {
    produto_id: product?.id || getProductIdFromLine(line),
    codigo:
      firstTextFromObject(line, ['codigo_barras', 'barcode', 'codigo'], 32) ||
      (product?.codigo_barras ? String(product.codigo_barras) : '') ||
      String(product?.id || getProductIdFromLine(line) || index + 1),
    descricao: description,
    categoria_id: product?.categoria?.id || null,
    categoria_nome:
      product?.categoria?.nome ||
      firstTextFromObject(line, ['categoria_nome', 'categoryName'], 80) ||
      'Sem categoria',
    quantidade: quantity,
    valor_centavos: totalCents,
    cfop,
    icms: {
      cst: icmsCode,
      aliquota: icmsRate,
      valor_centavos: calculateTaxCents(totalCents, icmsRate, icmsCode),
    },
    pis: {
      cst: pisCst,
      aliquota: pisRate,
      valor_centavos: calculateTaxCents(totalCents, pisRate, pisCst, { skipNonTaxedPisCofins: true }),
    },
    cofins: {
      cst: cofinsCst,
      aliquota: cofinsRate,
      valor_centavos: calculateTaxCents(totalCents, cofinsRate, cofinsCst, { skipNonTaxedPisCofins: true }),
    },
    ncm,
    natureza: resolveFiscalNature(ncm, pisCst, cofinsCst),
  };
}

function getFiscalReportPeriod(query = {}) {
  const start = normalizeText(query.data_inicio || query.dataInicio, 10);
  const end = normalizeText(query.data_fim || query.dataFim, 10);

  return {
    data_inicio: start || 'Todo o periodo',
    data_fim: end || 'Todo o periodo',
  };
}

function formatReportDate(value) {
  if (!value || value === 'Todo o periodo') {
    return value || 'Todo o periodo';
  }

  const date = sanitizeDateFilter(value, 'start');
  return date ? new Intl.DateTimeFormat('pt-BR').format(date) : value;
}

function resolveReportCompanyName(configuracao) {
  const emitente = configuracao?.fiscal?.emitente || {};

  return normalizeText(emitente.razao_social, 160) ||
    normalizeText(emitente.nome_fantasia, 160) ||
    'Empresa';
}

function buildProductFiscalReport({ configuracao, nfs, productMap, query }) {
  const groupsByKey = new Map();
  const totals = buildEmptyReportTotals();
  const warnings = new Set([
    'A coluna NAT. usa regra padrao por NCM/CST porque o cadastro atual ainda nao possui um campo especifico de natureza da receita.',
  ]);
  let processedItemCount = 0;

  for (const nf of nfs) {
    const payloadItems = getPayloadItemsForReport(getPlain(nf).payload);

    payloadItems.forEach((line, index) => {
      const productId = getProductIdFromLine(line);
      const product = productId ? productMap.get(productId) : null;
      const reportLine = buildReportLine({ line, index, product });
      const groupKey = reportLine.categoria_id || reportLine.categoria_nome;
      const productKey = [
        reportLine.produto_id || reportLine.codigo,
        reportLine.descricao,
        reportLine.cfop,
        reportLine.icms.cst,
        reportLine.pis.cst,
        reportLine.cofins.cst,
        reportLine.ncm,
        reportLine.natureza,
      ].join('|');
      const existingGroup = groupsByKey.get(groupKey) || {
        categoria_id: reportLine.categoria_id,
        categoria_nome: reportLine.categoria_nome,
        ...buildEmptyReportTotals(),
        itens: [],
        itemMap: new Map(),
      };
      const existingLine = existingGroup.itemMap.get(productKey);

      if (existingLine) {
        mergeProductReportLine(existingLine, reportLine);
      } else {
        existingGroup.itemMap.set(productKey, reportLine);
        existingGroup.itens.push(reportLine);
      }

      addProductTotals(existingGroup, reportLine);
      addProductTotals(totals, reportLine);
      groupsByKey.set(groupKey, existingGroup);
      processedItemCount += 1;
    });
  }

  const grupos = [...groupsByKey.values()]
    .map(({ itemMap: _itemMap, ...group }) => ({
      ...group,
      itens: group.itens.sort((firstItem, secondItem) => firstItem.descricao.localeCompare(secondItem.descricao, 'pt-BR')),
    }))
    .sort((firstGroup, secondGroup) => firstGroup.categoria_nome.localeCompare(secondGroup.categoria_nome, 'pt-BR'));

  return {
    relatorio: 'produtos',
    titulo: 'Resumo de Vendas por Produto',
    gerado_em: new Date().toISOString(),
    periodo: getFiscalReportPeriod(query),
    empresa: {
      nome_relatorio: resolveReportCompanyName(configuracao),
      cnpj: configuracao?.fiscal?.emitente?.cnpj_cpf || '',
    },
    resumo: {
      documentos_fiscais_considerados: nfs.length,
      itens_vendidos_total: processedItemCount,
      produtos_total: grupos.reduce((total, group) => total + group.itens.length, 0),
      grupos_total: grupos.length,
      ...totals,
    },
    grupos,
    avisos: [...warnings],
  };
}

function buildCfopFiscalReport(productReport) {
  const itemsByCfop = new Map();
  const totals = {
    quantidade_total: 0,
    valor_item_centavos: 0,
    valor_icms_centavos: 0,
    valor_pis_centavos: 0,
    valor_cofins_centavos: 0,
  };

  for (const group of productReport.grupos) {
    for (const item of group.itens) {
      const cfop = normalizeText(item.cfop, 4) || 'Sem CFOP';
      const existingItem = itemsByCfop.get(cfop) || {
        cfop,
        quantidade_total: 0,
        valor_item_centavos: 0,
        valor_icms_centavos: 0,
        valor_pis_centavos: 0,
        valor_cofins_centavos: 0,
      };

      existingItem.quantidade_total += item.quantidade;
      existingItem.valor_item_centavos += item.valor_centavos;
      existingItem.valor_icms_centavos += item.icms.valor_centavos;
      existingItem.valor_pis_centavos += item.pis.valor_centavos;
      existingItem.valor_cofins_centavos += item.cofins.valor_centavos;
      totals.quantidade_total += item.quantidade;
      totals.valor_item_centavos += item.valor_centavos;
      totals.valor_icms_centavos += item.icms.valor_centavos;
      totals.valor_pis_centavos += item.pis.valor_centavos;
      totals.valor_cofins_centavos += item.cofins.valor_centavos;
      itemsByCfop.set(cfop, existingItem);
    }
  }

  const itens = [...itemsByCfop.values()].sort((firstItem, secondItem) => {
    if (firstItem.cfop === 'Sem CFOP') return 1;
    if (secondItem.cfop === 'Sem CFOP') return -1;
    return firstItem.cfop.localeCompare(secondItem.cfop, 'pt-BR', { numeric: true });
  });

  return {
    relatorio: 'cfop',
    titulo: 'Resumo de Vendas por CFOP',
    gerado_em: productReport.gerado_em,
    periodo: productReport.periodo,
    empresa: productReport.empresa,
    resumo: {
      ...productReport.resumo,
      cfops_total: itens.length,
      ...totals,
    },
    itens,
    avisos: productReport.avisos.filter(warning => !warning.includes('NAT.')),
  };
}

function formatPdfMoneyFromCents(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(value) || 0) / 100);
}

function formatPdfQuantity(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatPdfRate(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function truncatePdfText(value, maxLength) {
  const text = String(value || '');

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}.` : text;
}

function createPdfBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = build();
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function drawReportHeader(doc, report, pageNumber) {
  const pageWidth = doc.page.width;
  const footerDateY = doc.page.height - doc.page.margins.bottom - 10;
  const footerPageY = footerDateY - 12;
  const period = `${formatReportDate(report.periodo.data_inicio)} - ${formatReportDate(report.periodo.data_fim)}`;

  doc.font('Helvetica-BoldOblique').fontSize(12).fillColor('#141414');
  doc.text(report.empresa.nome_relatorio.toUpperCase(), 24, 28, {
    align: 'center',
    width: pageWidth - 48,
  });
  doc.font('Helvetica-Oblique').fontSize(11);
  doc.text(report.titulo, 24, 44, { align: 'center', width: pageWidth - 48 });
  doc.text(period, 24, 60, { align: 'center', width: pageWidth - 48 });
  doc.font('Helvetica').fontSize(7);
  doc.text(String(pageNumber), pageWidth - 58, footerPageY, { align: 'right', width: 34, lineBreak: false });
  doc.text(new Intl.DateTimeFormat('pt-BR').format(new Date(report.gerado_em)), pageWidth - 112, footerDateY, {
    align: 'right',
    lineBreak: false,
    width: 88,
  });
}

function drawTableCell(doc, text, x, y, width, height, options = {}) {
  if (options.fillColor) {
    doc.rect(x, y, width, height).fill(options.fillColor);
  }

  doc.rect(x, y, width, height).strokeColor('#141414').lineWidth(0.45).stroke();
  doc.fillColor(options.color || '#0f172a')
    .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(options.fontSize || 7)
    .text(String(text ?? ''), x + 3, y + 4, {
      width: Math.max(1, width - 6),
      height: Math.max(1, height - 6),
      align: options.align || 'left',
      lineBreak: false,
    });
}

function buildProductReportPdf(report) {
  return createPdfBuffer(() => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 18, autoFirstPage: false });
    const columns = [
      ['CODIGO', 48, 'right'],
      ['DESCRICAO DO ITEM', 153, 'left'],
      ['QUANT.', 42, 'right'],
      ['VALOR', 48, 'right'],
      ['CFOP', 36, 'center'],
      ['CST', 28, 'center'],
      ['ALIQ.', 36, 'right'],
      ['VLR', 42, 'right'],
      ['CST', 28, 'center'],
      ['ALIQ.', 36, 'right'],
      ['VLR', 42, 'right'],
      ['CST', 28, 'center'],
      ['ALIQ.', 36, 'right'],
      ['VLR', 42, 'right'],
      ['NCM', 52, 'center'],
      ['NAT', 32, 'center'],
    ];
    const startX = 18;
    const rowHeight = 18;
    let pageNumber = 1;
    let y = 82;

    function drawHeader() {
      drawReportHeader(doc, report, pageNumber);
      let x = startX;

      for (const [label, width, align] of columns) {
        drawTableCell(doc, label, x, y, width, rowHeight, {
          align,
          bold: true,
          color: '#141414',
          fillColor: '#ffffff',
        });
        x += width;
      }

      y += rowHeight;
    }

    function ensureSpace(height = rowHeight) {
      if (y + height <= doc.page.height - 42) {
        return;
      }

      doc.addPage();
      pageNumber += 1;
      y = 82;
      drawHeader();
    }

    function drawDataRow(values, options = {}) {
      ensureSpace(options.height || rowHeight);
      let x = startX;

      values.forEach((value, index) => {
        drawTableCell(doc, value, x, y, columns[index][1], options.height || rowHeight, {
          align: columns[index][2],
          bold: options.bold,
          fillColor: options.fillColor,
        });
        x += columns[index][1];
      });
      y += options.height || rowHeight;
    }

    doc.addPage();
    drawHeader();

    for (const group of report.grupos) {
      ensureSpace(rowHeight);
      drawTableCell(doc, group.categoria_nome.toUpperCase(), startX, y, columns.reduce((total, column) => total + column[1], 0), rowHeight, {
        bold: true,
        color: '#141414',
        fillColor: '#f8fafc',
      });
      y += rowHeight;

      for (const item of group.itens) {
        drawDataRow([
          truncatePdfText(item.codigo || '-', 14),
          truncatePdfText(item.descricao.toUpperCase(), 42),
          formatPdfQuantity(item.quantidade),
          formatPdfMoneyFromCents(item.valor_centavos),
          item.cfop || '-',
          item.icms.cst || '-',
          formatPdfRate(item.icms.aliquota),
          formatPdfMoneyFromCents(item.icms.valor_centavos),
          item.pis.cst || '-',
          formatPdfRate(item.pis.aliquota),
          formatPdfMoneyFromCents(item.pis.valor_centavos),
          item.cofins.cst || '-',
          formatPdfRate(item.cofins.aliquota),
          formatPdfMoneyFromCents(item.cofins.valor_centavos),
          item.ncm || '-',
          item.natureza || '-',
        ]);
      }

      drawDataRow([
        '',
        'Total Grupo',
        formatPdfQuantity(group.quantidade_total),
        formatPdfMoneyFromCents(group.valor_total_centavos),
        '',
        '',
        '',
        formatPdfMoneyFromCents(group.icms_total_centavos),
        '',
        '',
        formatPdfMoneyFromCents(group.pis_total_centavos),
        '',
        '',
        formatPdfMoneyFromCents(group.cofins_total_centavos),
        '',
        '',
      ], { bold: true, fillColor: '#ffffff' });
    }

    drawDataRow([
      '',
      'Total Geral',
      formatPdfQuantity(report.resumo.quantidade_total),
      formatPdfMoneyFromCents(report.resumo.valor_total_centavos),
      '',
      '',
      '',
      formatPdfMoneyFromCents(report.resumo.icms_total_centavos),
      '',
      '',
      formatPdfMoneyFromCents(report.resumo.pis_total_centavos),
      '',
      '',
      formatPdfMoneyFromCents(report.resumo.cofins_total_centavos),
      '',
      '',
    ], { bold: true, fillColor: '#f8fafc' });

    if (report.grupos.length === 0) {
      drawDataRow(['', 'Sem itens fiscais para o filtro selecionado.', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    return doc;
  });
}

function buildCfopReportPdf(report) {
  return createPdfBuffer(() => {
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: 36, autoFirstPage: false });
    const columns = [
      ['CFOP', 43, 160, 'left'],
      ['QUANT', 178, 72, 'right'],
      ['VL_ITEM', 270, 72, 'right'],
      ['VL_ICMS', 360, 58, 'right'],
      ['VL_PIS', 432, 60, 'right'],
      ['VL_COFINS', 505, 60, 'right'],
    ];
    let pageNumber = 1;
    let y = 104;

    function drawHeader() {
      drawReportHeader(doc, report, pageNumber);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#141414');

      for (const [label, x, width, align] of columns) {
        doc.text(label, x, y, { width, align });
      }

      y += 28;
    }

    function ensureSpace() {
      if (y <= doc.page.height - 58) {
        return;
      }

      doc.addPage();
      pageNumber += 1;
      y = 104;
      drawHeader();
    }

    function drawValueLine(start, end, lineY) {
      doc.strokeColor('#141414').lineWidth(0.9).moveTo(start, lineY).lineTo(end, lineY).stroke();
    }

    function drawRow(values, bold = true) {
      ensureSpace();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#141414');

      values.forEach((value, index) => {
        const [, x, width, align] = columns[index];
        doc.text(String(value), x, y, { width, align });
      });

      for (const [, x, width] of columns.slice(1)) {
        drawValueLine(x, x + width, y + 7);
      }

      y += 28;
    }

    doc.addPage();
    drawHeader();

    for (const item of report.itens) {
      drawRow([
        item.cfop,
        formatPdfQuantity(item.quantidade_total),
        formatPdfMoneyFromCents(item.valor_item_centavos),
        formatPdfMoneyFromCents(item.valor_icms_centavos),
        formatPdfMoneyFromCents(item.valor_pis_centavos),
        formatPdfMoneyFromCents(item.valor_cofins_centavos),
      ]);
    }

    drawRow([
      'Total:',
      formatPdfQuantity(report.resumo.quantidade_total),
      formatPdfMoneyFromCents(report.resumo.valor_item_centavos),
      formatPdfMoneyFromCents(report.resumo.valor_icms_centavos),
      formatPdfMoneyFromCents(report.resumo.valor_pis_centavos),
      formatPdfMoneyFromCents(report.resumo.valor_cofins_centavos),
    ]);

    if (report.itens.length === 0) {
      drawRow(['Sem CFOP', '0,00', '0,00', '0,00', '0,00', '0,00'], false);
    }

    return doc;
  });
}

function buildReportFileName(report) {
  const prefix = report.relatorio === 'cfop' ? 'relatorio-fiscal-cfop' : 'relatorio-fiscal-produtos';
  const company = sanitizeFilePart(report.empresa.nome_relatorio, 'empresa');
  const start = sanitizeFilePart(report.periodo.data_inicio, 'inicio');
  const end = sanitizeFilePart(report.periodo.data_fim, 'fim');

  return `${prefix}-${company}-${start}-${end}.pdf`;
}

module.exports = {
  async list(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const limit = normalizeInteger(req.query.limit, 50, { min: 1, max: 100 });
      const offset = normalizeInteger(req.query.offset, 0, { min: 0, max: 1000000 });
      const where = buildNfWhereFromQuery(req.user.id, req.query);
      const { rows, count } = await Nf.findAndCountAll({
        where,
        include: getNfArquivoIncludes(),
        order: [['created_at', 'DESC']],
        limit,
        offset,
      });
      const materializedXml = await Promise.all(rows.map(nf => ensureNfXmlArquivos(nf).catch(() => false)));

      if (materializedXml.some(Boolean)) {
        await Promise.all(rows.map(nf => nf.reload({ include: getNfArquivoIncludes() })));
      }

      await attachHistoricoToNfs(rows, req.user.id);

      return res.json({
        items: rows.map(nf => sanitizeNf(nf)),
        total: count,
        limit,
        offset,
      });
    } catch (error) {
      return handleNfError(res, error, 'Erro ao listar documentos fiscais.');
    }
  },

  async downloadXmls(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const nfs = await findFilteredNfs(req.user.id, req.query, { includeHistorico: true });
      const manifest = [
        'Documento;Status;Arquivo;Situacao',
      ];
      const entries = [];

      for (const nf of nfs) {
        const baseName = getNfArchiveBaseName(nf);
        const data = getPlain(nf);

        for (const { kind, file } of collectNfXmlFiles(nf)) {
          const absolutePath = toAbsolutePath(file.caminho_relativo);
          const fallbackName = `${baseName}-${sanitizeFilePart(kind, 'xml')}.xml`;
          const originalName = sanitizeFilePart(file.nome_original || fallbackName, fallbackName);
          const zipPath = `${baseName}/${originalName}`;

          if (!absolutePath || !fs.existsSync(absolutePath)) {
            manifest.push(`${baseName};${data.status};${originalName};arquivo fisico nao encontrado`);
            continue;
          }

          entries.push({ absolutePath, zipPath });
          manifest.push(`${baseName};${data.status};${zipPath};incluido`);
        }
      }

      const archive = sendZipResponse(res, buildFilteredExportName('documentos-fiscais-xml', req.query));

      for (const entry of entries) {
        archive.file(entry.absolutePath, { name: entry.zipPath });
      }

      if (entries.length === 0) {
        archive.append('Nenhum XML encontrado para os filtros selecionados.\n', { name: 'sem-xmls.txt' });
      }

      archive.append(`${manifest.join('\n')}\n`, { name: 'manifesto.csv' });
      await archive.finalize();
    } catch (error) {
      return handleNfError(res, error, 'Não foi possível baixar os documentos fiscais.');
    }
  },

  async downloadReports(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const [configuracao, nfs] = await Promise.all([
        configuracaoSistemaService.getConfiguracaoSnapshot(req.user.id),
        findFilteredNfs(req.user.id, req.query, { reportOnly: true }),
      ]);
      const productMap = await fetchReportProductMap(req.user.id, nfs);
      const productReport = buildProductFiscalReport({
        configuracao,
        nfs,
        productMap,
        query: req.query,
      });
      const cfopReport = buildCfopFiscalReport(productReport);
      const [productsPdf, cfopPdf] = await Promise.all([
        buildProductReportPdf(productReport),
        buildCfopReportPdf(cfopReport),
      ]);
      const archive = sendZipResponse(res, buildFilteredExportName('relatorios-fiscais', req.query));

      archive.append(productsPdf, { name: buildReportFileName(productReport) });
      archive.append(cfopPdf, { name: buildReportFileName(cfopReport) });
      archive.append(JSON.stringify({
        filtros: {
          status: normalizeText(req.query.status, 32) || 'todos',
          modelo: normalizeModelo(req.query.modelo, ''),
          ambiente: normalizeText(req.query.ambiente, 20) || 'todos',
          data_inicio: normalizeText(req.query.data_inicio || req.query.dataInicio, 10) || null,
          data_fim: normalizeText(req.query.data_fim || req.query.dataFim, 10) || null,
          busca: normalizeText(req.query.q, 80) || null,
        },
        documentos_considerados: nfs.length,
        avisos: productReport.avisos,
      }, null, 2), { name: 'manifesto-relatorios.json' });
      await archive.finalize();
    } catch (error) {
      return handleNfError(res, error, 'Não foi possível baixar os relatórios fiscais.');
    }
  },

  async create(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const body = req.body || {};
      const configuracao = await configuracaoSistemaService.getConfiguracaoSnapshot(req.user.id);
      const modelo = normalizeModelo(body.modelo, configuracao.fiscal?.modelo_prioritario || '65');
      const ambiente = normalizeAmbiente(body.ambiente, configuracao.fiscal?.ambiente);
      const defaults = getFiscalDefaults(configuracao.fiscal, modelo, ambiente);
      const vendaId = normalizeText(body.venda_id || body.vendaId, 64) || null;
      let venda = null;

      if (vendaId) {
        venda = await Venda.findOne({
          where: {
            id: vendaId,
            usuario_id: req.user.id,
          },
        });

        if (!venda) {
          return res.status(404).json({ message: 'Venda não encontrada para esta conta.' });
        }
      }

      const vendaData = venda ? getPlain(venda) : null;
      const nf = await Nf.create({
        id: normalizeText(body.id, 64) || createNfId(),
        usuario_id: req.user.id,
        venda_id: vendaId,
        pdv_id: normalizeNullableInteger(body.pdv_id || body.pdvId) || vendaData?.pdv_id || null,
        caixa_id: normalizeText(body.caixa_id || body.caixaId, 64) || vendaData?.caixa_id || null,
        ambiente: defaults.ambiente,
        modelo,
        serie: normalizeInteger(body.serie, defaults.serie, { min: 1, max: 999 }),
        numero: normalizeInteger(body.numero, defaults.numero, { min: 1, max: 999999999 }),
        chave_acesso: normalizeText(body.chave_acesso || body.chaveAcesso, 44) || null,
        status: normalizeStatus(body.status),
        tipo_emissao: normalizeText(body.tipo_emissao || body.tipoEmissao, 24) || 'normal',
        finalidade: normalizeText(body.finalidade, 24) || 'normal',
        natureza_operacao: normalizeText(body.natureza_operacao || body.naturezaOperacao, 120) || defaults.natureza_operacao,
        total_centavos: normalizeInteger(body.total_centavos || body.totalCentavos, vendaData?.total_centavos || 0),
        protocolo_autorizacao: normalizeText(body.protocolo_autorizacao || body.protocoloAutorizacao, 80) || null,
        protocolo_cancelamento: normalizeText(body.protocolo_cancelamento || body.protocoloCancelamento, 80) || null,
        codigo_retorno_sefaz: normalizeText(body.codigo_retorno_sefaz || body.codigoRetornoSefaz, 20) || null,
        mensagem_retorno_sefaz: normalizeText(body.mensagem_retorno_sefaz || body.mensagemRetornoSefaz, 2000) || null,
        ultimo_erro_tecnico: normalizeText(body.ultimo_erro_tecnico || body.ultimoErroTecnico, 2000) || null,
        xml_enviado_arquivo_id: normalizeNullableInteger(body.xml_enviado_arquivo_id || body.xmlEnviadoArquivoId),
        xml_autorizado_arquivo_id: normalizeNullableInteger(body.xml_autorizado_arquivo_id || body.xmlAutorizadoArquivoId),
        danfe_pdf_arquivo_id: normalizeNullableInteger(body.danfe_pdf_arquivo_id || body.danfePdfArquivoId),
        payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
        retorno_sefaz: body.retorno_sefaz && typeof body.retorno_sefaz === 'object' ? body.retorno_sefaz : {},
        eventos: [],
        emitida_em: sanitizeDate(body.emitida_em || body.emitidaEm),
        autorizada_em: sanitizeDate(body.autorizada_em || body.autorizadaEm),
        cancelada_em: sanitizeDate(body.cancelada_em || body.canceladaEm),
      });

      await appendNfEvent(nf, {
        tipo: 'registro',
        status: nf.status,
        codigo_retorno_sefaz: nf.codigo_retorno_sefaz,
        mensagem: nf.mensagem_retorno_sefaz,
        detalhes: {
          origem: 'api',
        },
      });
      await nf.save();

      return res.status(201).json(sanitizeNf(nf, { includePayload: true }));
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        return res.status(409).json({
          code: 'NF_NUMBER_ALREADY_EXISTS',
          message: 'Já existe uma nota com este ambiente, modelo, série e número.',
        });
      }

      return handleNfError(res, error, 'Não foi possível registrar a nota fiscal.');
    }
  },

  async show(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

    const nf = await findNfForUser(req.user.id, req.params.id, {
      include: [
        { model: Venda, as: 'venda', required: false },
        { model: Pdv, as: 'pdv', required: false },
        { model: Caixa, as: 'caixa', required: false },
        ...getNfArquivoIncludes(),
        getNfEventoInclude(),
      ],
      order: [[{ model: NfEvento, as: 'historico' }, 'ocorrido_em', 'DESC']],
    });

    if (!nf) {
      return res.status(404).json({ message: 'Nota fiscal não encontrada.' });
    }

    if (await ensureNfXmlArquivos(nf).catch(() => false)) {
      await nf.reload({
        include: [
          { model: Venda, as: 'venda', required: false },
          { model: Pdv, as: 'pdv', required: false },
          { model: Caixa, as: 'caixa', required: false },
          ...getNfArquivoIncludes(),
          getNfEventoInclude(),
        ],
        order: [[{ model: NfEvento, as: 'historico' }, 'ocorrido_em', 'DESC']],
      });
    }

    return res.json(sanitizeNf(nf, { includePayload: true }));
    } catch (error) {
      return handleNfError(res, error, 'Erro ao carregar documento fiscal.');
    }
  },

  async updateStatus(req, res) {
    try {
      await ensureFeature(req.user.id, 'emissao_fiscal');

      const nf = await findNfForUser(req.user.id, req.params.id);

      if (!nf) {
        return res.status(404).json({ message: 'Nota fiscal não encontrada.' });
      }

      const body = req.body || {};
      const nextStatus = normalizeStatus(body.status, nf.status);
      const now = new Date();

      nf.status = nextStatus;
      nf.chave_acesso = normalizeText(body.chave_acesso || body.chaveAcesso, 44) || nf.chave_acesso || null;
      nf.protocolo_autorizacao = normalizeText(body.protocolo_autorizacao || body.protocoloAutorizacao, 80) || nf.protocolo_autorizacao || null;
      nf.protocolo_cancelamento = normalizeText(body.protocolo_cancelamento || body.protocoloCancelamento, 80) || nf.protocolo_cancelamento || null;
      nf.codigo_retorno_sefaz = normalizeText(body.codigo_retorno_sefaz || body.codigoRetornoSefaz, 20) || nf.codigo_retorno_sefaz || null;
      nf.mensagem_retorno_sefaz = normalizeText(body.mensagem_retorno_sefaz || body.mensagemRetornoSefaz, 2000) || nf.mensagem_retorno_sefaz || null;
      nf.ultimo_erro_tecnico = normalizeText(body.ultimo_erro_tecnico || body.ultimoErroTecnico, 2000) || nf.ultimo_erro_tecnico || null;
      nf.xml_enviado_arquivo_id = normalizeNullableInteger(body.xml_enviado_arquivo_id || body.xmlEnviadoArquivoId) || nf.xml_enviado_arquivo_id || null;
      nf.xml_autorizado_arquivo_id = normalizeNullableInteger(body.xml_autorizado_arquivo_id || body.xmlAutorizadoArquivoId) || nf.xml_autorizado_arquivo_id || null;
      nf.danfe_pdf_arquivo_id = normalizeNullableInteger(body.danfe_pdf_arquivo_id || body.danfePdfArquivoId) || nf.danfe_pdf_arquivo_id || null;
      nf.retorno_sefaz = body.retorno_sefaz && typeof body.retorno_sefaz === 'object' ? body.retorno_sefaz : nf.retorno_sefaz || {};

      if (nextStatus === 'transmitindo' && !nf.emitida_em) {
        nf.emitida_em = now;
      }

      if (nextStatus === 'autorizada' && !nf.autorizada_em) {
        nf.autorizada_em = now;
      }

      if (nextStatus === 'cancelada' && !nf.cancelada_em) {
        nf.cancelada_em = now;
      }

      await appendNfEvent(nf, {
        tipo: normalizeText(body.tipo_evento || body.tipoEvento, 32) || nextStatus,
        status: nextStatus,
        codigo_retorno_sefaz: nf.codigo_retorno_sefaz,
        mensagem: nf.mensagem_retorno_sefaz || nf.ultimo_erro_tecnico,
        arquivo_xml_id: nf.xml_autorizado_arquivo_id || nf.xml_enviado_arquivo_id,
        detalhes: body.detalhes && typeof body.detalhes === 'object' ? body.detalhes : {},
      });
      await nf.save();

      return res.json(sanitizeNf(nf, { includePayload: true }));
    } catch (error) {
      return handleNfError(res, error, 'Não foi possível atualizar a nota fiscal.');
    }
  },
};
