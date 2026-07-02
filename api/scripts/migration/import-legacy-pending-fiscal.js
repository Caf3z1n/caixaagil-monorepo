#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

function requireApiModule(sourcePath, distPath) {
  const sourceFullPath = path.resolve(__dirname, '..', '..', sourcePath);
  if (fs.existsSync(sourceFullPath) || fs.existsSync(`${sourceFullPath}.js`)) {
    return require(sourceFullPath);
  }

  return require(path.resolve(__dirname, '..', '..', distPath));
}

const sequelize = requireApiModule('src/database', 'dist/database');
const {
  Arquivo,
  Caixa,
  ConfiguracaoSistema,
  DespesaCaixa,
  Estoque,
  MovimentacaoEstoque,
  Nf,
  NfEvento,
  Pdv,
  Produto,
  Usuario,
  Venda,
} = requireApiModule('src/app/models', 'dist/app/models');
const {
  buildStorageDirectory,
  buildStoredFileName,
  ensureDirectory,
  toRelativePath,
} = requireApiModule('src/app/services/fileStorageService', 'dist/app/services/fileStorageService');

const MAP_FILE = 'legacy-import-map.json';
const IMPORT_DEVICE_ID = 'legacy-caixa-agil';
const IMPORT_PDV_NAME = 'PDV importado Caixa Ágil antigo';
const IMPORT_HISTORY_PDV_NAME = 'PDV importado Caixa Ágil antigo - histórico';
const XML_CONTEXT = 'nf_xml_legado';
const MAX_DECIMAL_ABS = 999999999;
const SCHEMA_TABLES = [
  'arquivos',
  'despesas_caixa',
  'movimentacoes_estoque',
  'nf',
  'nf_eventos',
  'configuracoes',
];

function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node api\\scripts\\migration\\import-legacy-pending-fiscal.js --dry-run --export-dir C:\\exports\\legacy --target-user-email email@empresa.com
  node api\\scripts\\migration\\import-legacy-pending-fiscal.js --apply --confirm-backup --export-dir C:\\exports\\legacy --target-user-email email@empresa.com

Options:
  --export-dir <dir>          Legacy export directory with documentos_fiscais.json.
  --target-user-email <email> Target user email. Required for --apply unless --target-user-id is used.
  --target-user-id <id>       Target user id. Required for --apply unless --target-user-email is used.
  --apply                     Write changes.
  --dry-run                   Validate only. Default mode.
  --confirm-backup            Required when NODE_ENV=production and --apply is used.
`);
}

function normalizeText(value, maxLength) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) {
    return null;
  }

  return maxLength ? text.slice(0, maxLength) : text;
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function toPositiveInteger(value, fallback = null) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function toDecimalString(value) {
  const number = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(number) ? number.toFixed(3) : '0.000';
}

function parseLegacyDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' || /^-?\d+$/.test(String(value))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) {
      return null;
    }

    const millis = number < 10000000000 ? number * 1000 : number;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function legacyId(value, suffix = '') {
  const base = `legacy-${String(value || '').slice(0, 57)}`;
  if (!suffix) {
    return base;
  }

  return `${base.slice(0, 64 - suffix.length)}${suffix}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readExportTable(exportDir, tableName) {
  const filePath = path.join(exportDir, `${tableName}.json`);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const payload = readJson(filePath);
  return Array.isArray(payload.rows) ? payload.rows : [];
}

function loadImportMap(exportDir) {
  const filePath = path.join(exportDir, MAP_FILE);
  if (!fs.existsSync(filePath)) {
    return {
      caixas: {},
      estoques: {},
      produtos: {},
      vendas: {},
    };
  }

  const loaded = readJson(filePath);
  return {
    ...loaded,
    caixas: loaded.caixas || {},
    estoques: loaded.estoques || {},
    produtos: loaded.produtos || {},
    vendas: loaded.vendas || {},
  };
}

function readExport(exportDir) {
  const manifestPath = path.join(exportDir, 'manifest.json');

  return {
    manifest: fs.existsSync(manifestPath) ? readJson(manifestPath) : null,
    documentos_fiscais: readExportTable(exportDir, 'documentos_fiscais'),
    despesas_caixa: readExportTable(exportDir, 'despesas_caixa'),
    movimentacoes_estoque: readExportTable(exportDir, 'movimentacoes_estoque'),
  };
}

function createCounters() {
  return {
    despesas_caixa: { inserted: 0, updated: 0, skipped: 0 },
    movimentacoes_estoque: { inserted: 0, updated: 0, skipped: 0, itemRows: 0, missingProducts: 0, missingStocks: 0 },
    documentos_fiscais: { inserted: 0, updated: 0, skipped: 0, missingSales: 0 },
    arquivos_xml: { inserted: 0, reused: 0, skipped: 0 },
    nf_eventos: { inserted: 0, reused: 0 },
    configuracao_fiscal: { updated: 0, unchanged: 0 },
  };
}

async function resolveTargetUser(args) {
  if (args['target-user-id']) {
    const user = await Usuario.unscoped().findByPk(Number(args['target-user-id']));
    if (!user) {
      throw new Error(`Target user not found by id: ${args['target-user-id']}`);
    }
    return user;
  }

  if (args['target-user-email']) {
    const user = await Usuario.unscoped().findOne({
      where: { email: String(args['target-user-email']).trim().toLowerCase() },
    });
    if (!user) {
      throw new Error(`Target user not found by email: ${args['target-user-email']}`);
    }
    return user;
  }

  return null;
}

async function schemaSignature(transaction = null) {
  const queryInterface = sequelize.getQueryInterface();
  const snapshot = {};

  for (const table of SCHEMA_TABLES) {
    try {
      const description = await queryInterface.describeTable(table, { transaction });
      snapshot[table] = Object.keys(description).sort();
    } catch (_) {
      snapshot[table] = null;
    }
  }

  return JSON.stringify(snapshot);
}

function normalizeFiscalStatus(value) {
  const status = normalizeText(value, 32);
  const allowed = new Set([
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

  return allowed.has(status) ? status : 'pendente';
}

function normalizeModelo(value) {
  return String(value || '').trim() === '55' ? '55' : '65';
}

function normalizeAmbiente(value) {
  return String(value || '').trim() === 'producao' ? 'producao' : 'homologacao';
}

function normalizeTipoEmissao(tpEmis, status) {
  const code = Number(tpEmis);
  if (code && code !== 1) {
    return 'contingencia';
  }

  return status === 'contingencia' ? 'contingencia' : 'normal';
}

function getFiscalTotalCentavos(row, venda) {
  if (venda) {
    return toInteger(venda.total_centavos, 0);
  }

  const result = String(row.xml_proc || row.xml_assinado || '').match(/<vNF>(\d+(?:\.\d+)?)<\/vNF>/);
  if (!result) {
    return 0;
  }

  const value = Number(result[1]);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

function buildOriginalFileName(values, type) {
  const key = values.modelo === '55' ? 'nfe' : 'nfce';
  const serie = String(values.serie || 0).padStart(3, '0');
  const numero = String(values.numero || 0).padStart(9, '0');
  return `legado-${key}-serie-${serie}-${numero}-${type}.xml`;
}

async function createXmlArquivo({ usuarioId, values, type, xmlContent, transaction, counters }) {
  if (!xmlContent || typeof xmlContent !== 'string') {
    counters.arquivos_xml.skipped += 1;
    return null;
  }

  const buffer = Buffer.from(xmlContent, 'utf8');
  const file = {
    originalname: buildOriginalFileName(values, type),
    mimetype: 'application/xml',
  };
  const directory = buildStorageDirectory(usuarioId, file.mimetype);
  ensureDirectory(directory);

  const storedName = buildStoredFileName(file);
  const absolutePath = path.join(directory, storedName);
  fs.writeFileSync(absolutePath, buffer);

  const arquivo = await Arquivo.create(
    {
      usuario_id: usuarioId,
      nome_original: file.originalname,
      nome_armazenado: storedName,
      mime_type: file.mimetype,
      extensao: '.xml',
      tamanho_bytes: buffer.length,
      tipo: 'xml',
      contexto: XML_CONTEXT,
      visibilidade: 'privado',
      caminho_relativo: toRelativePath(absolutePath),
      metadados: {
        origem: 'legacy-caixa-agil',
        documento_fiscal_id: values.id,
        tipo_xml: type,
        ambiente: values.ambiente,
        modelo: values.modelo,
        serie: values.serie,
        numero: values.numero,
      },
    },
    { transaction }
  );

  counters.arquivos_xml.inserted += 1;
  return arquivo.id;
}

async function findLegacyPdv(usuarioId, transaction) {
  return Pdv.findOne({
    where: {
      usuario_id: usuarioId,
      nome: {
        [Op.in]: [IMPORT_HISTORY_PDV_NAME, IMPORT_PDV_NAME],
      },
    },
    order: [['ativo', 'ASC'], ['id', 'DESC']],
    transaction,
  });
}

async function importExpenses(rows, usuarioId, map, fallbackPdv, transaction, counters) {
  for (const row of rows) {
    const id = legacyId(row.id);
    const caixaId = row.sessao_caixa_id ? map.caixas[row.sessao_caixa_id] || legacyId(row.sessao_caixa_id) : null;
    const caixa = caixaId
      ? await Caixa.findOne({ where: { id: caixaId, usuario_id: usuarioId }, transaction })
      : null;
    const registradoEm = parseLegacyDate(row.registrado_em) || parseLegacyDate(row.created_at) || new Date();
    const payload = {
      id,
      usuario_id: usuarioId,
      pdv_id: caixa?.pdv_id || fallbackPdv?.id || null,
      dispositivo_id: IMPORT_DEVICE_ID,
      caixa_id: caixa?.id || null,
      origem: 'pdv',
      lancado_por_email: 'importacao-legado@caixaagil.local',
      lancado_por_tipo: 'legado',
      lancado_por_subconta_id: null,
      descricao: normalizeText(row.descricao, 160) || `Despesa legado ${row.id}`,
      valor_centavos: Math.max(toInteger(row.valor_centavos, 0), 0),
      registrado_em: registradoEm,
    };

    const existing = await DespesaCaixa.findOne({ where: { id, usuario_id: usuarioId }, transaction });
    if (existing) {
      await existing.update(payload, { transaction });
      counters.despesas_caixa.updated += 1;
    } else {
      await DespesaCaixa.create(payload, { transaction });
      counters.despesas_caixa.inserted += 1;
    }
  }
}

function normalizeMovementType(type) {
  const key = normalizeKey(type);

  if (key === 'compra' || key === 'entrada') {
    return 'compra';
  }
  if (key === 'transferencia') {
    return 'transferencia';
  }
  if (key === 'venda') {
    return 'venda';
  }

  return 'acerto';
}

function hasOwnValue(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key) && object[key] !== null && object[key] !== undefined;
}

function getMovementQuantity(item, row, hasDetailedItem) {
  const candidates = [];

  if (hasOwnValue(item, 'quantityDelta')) {
    candidates.push(item.quantityDelta);
  }
  if (hasOwnValue(item, 'delta')) {
    candidates.push(item.delta);
  }
  if (hasOwnValue(item, 'quantidade')) {
    candidates.push(item.quantidade);
  }
  if (hasOwnValue(item, 'quantity')) {
    candidates.push(item.quantity);
  }
  if (!hasDetailedItem) {
    candidates.push(Number(row.unidades_adicionadas || 0) || Number(row.unidades_removidas || 0));
  }

  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number)) {
      return Math.abs(number);
    }
  }

  return 0;
}

function getMovementDelta(item, row, hasDetailedItem) {
  const direct = Number(hasOwnValue(item, 'quantityDelta') ? item.quantityDelta : item?.delta);
  if (Number.isFinite(direct)) {
    return direct;
  }

  if (hasDetailedItem) {
    return 0;
  }

  const added = Number(row.unidades_adicionadas || 0);
  const removed = Number(row.unidades_removidas || 0);
  return Number.isFinite(added - removed) ? added - removed : 0;
}

function hasMovementOverflow(item, delta, quantity) {
  const values = [
    delta,
    quantity,
    item?.previousStock,
    item?.nextStock,
  ];

  return values.some(value => {
    const number = Number(value);
    return Number.isFinite(number) && Math.abs(number) > MAX_DECIMAL_ABS;
  });
}

function safeDecimalString(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > MAX_DECIMAL_ABS) {
    return null;
  }

  return toDecimalString(number);
}

async function importStockMovements(rows, usuarioId, map, transaction, counters, warnings) {
  for (const row of rows) {
    const items = Array.isArray(row.itens) && row.itens.length > 0 ? row.itens : [{}];
    const targetStockId = row.estoque_id ? map.estoques[row.estoque_id] || null : null;
    const estoque = targetStockId
      ? await Estoque.findOne({ where: { id: targetStockId, usuario_id: usuarioId }, transaction })
      : null;

    if (row.estoque_id && !estoque) {
      counters.movimentacoes_estoque.missingStocks += 1;
      warnings.push(`Movimentacao ${row.id} sem estoque mapeado.`);
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};
      const oldProductId = item.productId || item.produto_id || item.id;
      const productId = oldProductId ? map.produtos[oldProductId] || null : null;
      const produto = productId
        ? await Produto.findOne({ where: { id: productId, usuario_id: usuarioId }, transaction })
        : null;
      const hasDetailedItem = Object.keys(item).length > 0;

      if (oldProductId && !produto) {
        counters.movimentacoes_estoque.missingProducts += 1;
        warnings.push(`Movimentacao ${row.id} item ${index + 1} sem produto mapeado.`);
      }

      const quantity = getMovementQuantity(item, row, hasDetailedItem);
      const delta = getMovementDelta(item, row, hasDetailedItem);

      if (quantity <= 0) {
        counters.movimentacoes_estoque.skipped += 1;
        continue;
      }

      if (hasMovementOverflow(item, delta, quantity)) {
        counters.movimentacoes_estoque.skipped += 1;
        warnings.push(`Movimentacao ${row.id} item ${index + 1} ignorado por valor numerico legado fora do limite.`);
        continue;
      }

      const lancamentoId = legacyId(row.id, `:${String(index + 1).padStart(2, '0')}`);
      const tipo = normalizeMovementType(row.tipo);
      const payload = {
        usuario_id: usuarioId,
        lancamento_id: lancamentoId,
        produto_id: produto?.id || null,
        produto_nome: normalizeText(item.productName || item.nome || produto?.nome, 120) || `Produto legado ${oldProductId || row.id}`,
        estoque_origem_id: delta < 0 ? estoque?.id || null : null,
        estoque_origem_nome: delta < 0 ? estoque?.nome || normalizeText(row.estoque_nome, 80) : null,
        estoque_destino_id: delta >= 0 ? estoque?.id || null : null,
        estoque_destino_nome: delta >= 0 ? estoque?.nome || normalizeText(row.estoque_nome, 80) : null,
        tipo,
        quantidade: toDecimalString(quantity),
        saldo_origem_antes: delta < 0 && item.previousStock !== undefined ? safeDecimalString(item.previousStock) : null,
        saldo_origem_depois: delta < 0 && item.nextStock !== undefined ? safeDecimalString(item.nextStock) : null,
        saldo_destino_antes: delta >= 0 && item.previousStock !== undefined ? safeDecimalString(item.previousStock) : null,
        saldo_destino_depois: delta >= 0 && item.nextStock !== undefined ? safeDecimalString(item.nextStock) : null,
        documento: normalizeText(row.id, 80),
        observacao: normalizeText(row.observacao, 255) || 'Importado do Caixa Ágil antigo.',
      };

      const existing = await MovimentacaoEstoque.findOne({
        where: { usuario_id: usuarioId, lancamento_id: lancamentoId },
        transaction,
      });

      if (existing) {
        await existing.update(payload, { transaction });
        counters.movimentacoes_estoque.updated += 1;
      } else {
        await MovimentacaoEstoque.create(payload, { transaction });
        counters.movimentacoes_estoque.inserted += 1;
      }

      counters.movimentacoes_estoque.itemRows += 1;
    }
  }
}

async function ensureFiscalEvent(nf, eventData, transaction, counters) {
  const existing = await NfEvento.findOne({
    where: {
      nf_id: nf.id,
      usuario_id: nf.usuario_id,
      tipo: eventData.tipo,
      status: eventData.status,
    },
    transaction,
  });

  if (existing) {
    counters.nf_eventos.reused += 1;
    return existing;
  }

  counters.nf_eventos.inserted += 1;
  return NfEvento.create(eventData, { transaction });
}

async function importFiscalDocuments(rows, usuarioId, map, fallbackPdv, transaction, counters, warnings) {
  for (const row of rows) {
    const serie = toPositiveInteger(row.serie);
    const numero = toPositiveInteger(row.numero);
    if (!serie || !numero) {
      counters.documentos_fiscais.skipped += 1;
      continue;
    }

    const id = legacyId(row.id);
    const mappedVendaId = row.venda_id ? map.vendas[row.venda_id] || legacyId(row.venda_id) : null;
    const venda = mappedVendaId
      ? await Venda.findOne({ where: { id: mappedVendaId, usuario_id: usuarioId }, transaction })
      : null;

    if (row.venda_id && !venda) {
      counters.documentos_fiscais.missingSales += 1;
      warnings.push(`Documento fiscal ${row.id} sem venda mapeada.`);
    }

    const status = normalizeFiscalStatus(row.status);
    const values = {
      id,
      usuario_id: usuarioId,
      venda_id: venda?.id || null,
      pdv_id: venda?.pdv_id || fallbackPdv?.id || null,
      caixa_id: venda?.caixa_id || null,
      ambiente: normalizeAmbiente(row.ambiente),
      modelo: normalizeModelo(row.modelo),
      serie,
      numero,
      chave_acesso: normalizeText(row.chave, 44),
      status,
      tipo_emissao: normalizeTipoEmissao(row.tp_emis, status),
      finalidade: 'normal',
      natureza_operacao: 'Venda',
      total_centavos: getFiscalTotalCentavos(row, venda),
      protocolo_autorizacao: normalizeText(row.protocolo, 80),
      protocolo_cancelamento: null,
      codigo_retorno_sefaz: normalizeText(row.codigo_erro, 20),
      mensagem_retorno_sefaz: normalizeText(row.mensagem_erro, 2000),
      ultimo_erro_tecnico: normalizeText(row.mensagem_erro, 2000),
      payload: {
        origem: 'legacy-caixa-agil',
        legacy: {
          documento_fiscal_id: row.id,
          venda_id: row.venda_id || null,
          venda_id_mapeada: venda?.id || null,
          status_original: row.status || null,
          tp_emis: row.tp_emis ?? null,
          tentativas: row.tentativas ?? null,
          next_retry_at: row.next_retry_at ?? null,
          versao_sincronizacao: row.versao_sincronizacao ?? null,
          qr_code_url: row.qr_code_url || null,
          danfe_html_disponivel: Boolean(row.danfe_html),
        },
      },
      retorno_sefaz: {
        origem: 'legacy-caixa-agil',
        protocolo: row.protocolo || null,
        codigo: row.codigo_erro || null,
        mensagem: row.mensagem_erro || null,
        status: row.status || null,
      },
      emitida_em: parseLegacyDate(row.created_at) || parseLegacyDate(row.updated_at) || new Date(),
      autorizada_em: status === 'autorizada' ? parseLegacyDate(row.authorized_at) || parseLegacyDate(row.updated_at) : null,
      cancelada_em: status === 'cancelada' ? parseLegacyDate(row.updated_at) : null,
    };

    const existingById = await Nf.findOne({ where: { id, usuario_id: usuarioId }, transaction });
    const existingByNumber = existingById
      ? null
      : await Nf.findOne({
          where: {
            usuario_id: usuarioId,
            ambiente: values.ambiente,
            modelo: values.modelo,
            serie: values.serie,
            numero: values.numero,
          },
          transaction,
        });
    const nf = existingById || existingByNumber;
    let xmlEnviadoArquivoId = nf?.xml_enviado_arquivo_id || null;
    let xmlAutorizadoArquivoId = nf?.xml_autorizado_arquivo_id || null;

    if (!xmlEnviadoArquivoId && row.xml_assinado) {
      xmlEnviadoArquivoId = await createXmlArquivo({
        usuarioId,
        values,
        type: 'enviado',
        xmlContent: row.xml_assinado,
        transaction,
        counters,
      });
    } else if (xmlEnviadoArquivoId) {
      counters.arquivos_xml.reused += 1;
    }

    if (!xmlAutorizadoArquivoId && row.xml_proc) {
      if (row.xml_proc === row.xml_assinado && xmlEnviadoArquivoId) {
        xmlAutorizadoArquivoId = xmlEnviadoArquivoId;
        counters.arquivos_xml.reused += 1;
      } else {
        xmlAutorizadoArquivoId = await createXmlArquivo({
          usuarioId,
          values,
          type: 'autorizado',
          xmlContent: row.xml_proc,
          transaction,
          counters,
        });
      }
    } else if (xmlAutorizadoArquivoId) {
      counters.arquivos_xml.reused += 1;
    }

    values.xml_enviado_arquivo_id = xmlEnviadoArquivoId;
    values.xml_autorizado_arquivo_id = xmlAutorizadoArquivoId;

    let savedNf = nf;
    if (savedNf) {
      await savedNf.update(values, { transaction });
      counters.documentos_fiscais.updated += 1;
    } else {
      savedNf = await Nf.create(
        {
          ...values,
          eventos: [],
        },
        { transaction }
      );
      counters.documentos_fiscais.inserted += 1;
    }

    const eventData = {
      nf_id: savedNf.id,
      usuario_id: usuarioId,
      tipo: 'importacao_legado',
      status,
      codigo_retorno_sefaz: values.codigo_retorno_sefaz,
      mensagem: values.mensagem_retorno_sefaz || values.protocolo_autorizacao || null,
      arquivo_xml_id: xmlAutorizadoArquivoId || xmlEnviadoArquivoId || null,
      detalhes: values.retorno_sefaz,
      ocorrido_em: values.autorizada_em || values.emitida_em || new Date(),
    };

    await ensureFiscalEvent(savedNf, eventData, transaction, counters);
    const currentEvents = Array.isArray(savedNf.eventos) ? savedNf.eventos : [];
    const hasImportEvent = currentEvents.some(event => event?.tipo === 'importacao_legado' && event?.status === status);
    if (!hasImportEvent) {
      savedNf.eventos = [
        ...currentEvents,
        {
          tipo: eventData.tipo,
          status: eventData.status,
          codigo_retorno_sefaz: eventData.codigo_retorno_sefaz,
          mensagem: eventData.mensagem,
          arquivo_xml_id: eventData.arquivo_xml_id,
          ocorrido_em: eventData.ocorrido_em.toISOString(),
        },
      ].slice(-80);
      await savedNf.save({ transaction });
    }
  }
}

function buildLegacyFiscalSequences(documentos) {
  const sequences = new Map();

  for (const row of documentos) {
    const serie = toPositiveInteger(row.serie);
    const numero = toPositiveInteger(row.numero);
    if (!serie || !numero) {
      continue;
    }

    const modelo = normalizeModelo(row.modelo);
    const ambiente = normalizeAmbiente(row.ambiente);
    const key = `${ambiente}:${modelo}:${serie}`;
    const current = sequences.get(key) || {
      ambiente,
      modelo,
      serie,
      count: 0,
      max_numero: 0,
      proximo_numero: 1,
    };

    current.count += 1;
    current.max_numero = Math.max(current.max_numero, numero);
    current.proximo_numero = current.max_numero + 1;
    sequences.set(key, current);
  }

  return [...sequences.values()].sort((a, b) =>
    a.ambiente.localeCompare(b.ambiente) ||
    a.modelo.localeCompare(b.modelo) ||
    a.serie - b.serie
  );
}

function getModelKey(modelo) {
  return modelo === '55' ? 'nfe' : 'nfce';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function getCurrentNfSequences(usuarioId, transaction) {
  const rows = await Nf.findAll({
    attributes: [
      'ambiente',
      'modelo',
      'serie',
      [sequelize.fn('MAX', sequelize.col('numero')), 'max_numero'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    where: { usuario_id: usuarioId },
    group: ['ambiente', 'modelo', 'serie'],
    raw: true,
    transaction,
  });

  return rows.map(row => ({
    ambiente: normalizeAmbiente(row.ambiente),
    modelo: normalizeModelo(row.modelo),
    serie: toPositiveInteger(row.serie),
    count: toInteger(row.count, 0),
    max_numero: toInteger(row.max_numero, 0),
    proximo_numero: toInteger(row.max_numero, 0) + 1,
  }));
}

function selectSequenceByModel(sequences) {
  const selected = new Map();

  for (const sequence of sequences) {
    if (!sequence.serie || !sequence.proximo_numero) {
      continue;
    }

    const key = `${sequence.ambiente}:${sequence.modelo}`;
    const current = selected.get(key);
    if (!current || sequence.max_numero > current.max_numero || sequence.count > current.count) {
      selected.set(key, { ...sequence });
    }
  }

  return [...selected.values()];
}

function applySequencePatch(fiscal, sequence) {
  const ambiente = sequence.ambiente;
  const modelKey = getModelKey(sequence.modelo);
  const ambientes = asObject(fiscal.ambientes);
  const envConfig = asObject(ambientes[ambiente]);
  const rootConfig = asObject(fiscal[modelKey]);
  const envModelConfig = asObject(envConfig[modelKey]);
  const nextNumber = Math.max(
    toPositiveInteger(rootConfig.proximo_numero, 1) || 1,
    toPositiveInteger(envModelConfig.proximo_numero, 1) || 1,
    sequence.proximo_numero
  );
  const patch = {
    serie: sequence.serie,
    ultimo_numero: nextNumber - 1,
    proximo_numero: nextNumber,
  };
  const sameSeries = sequence.serie;

  return {
    ...fiscal,
    ambiente,
    modelo_prioritario: sequence.modelo,
    ...(sameSeries ? { serie_fiscal: sameSeries, serie: sameSeries } : {}),
    [modelKey]: {
      ...rootConfig,
      ...patch,
    },
    ambientes: {
      ...ambientes,
      [ambiente]: {
        ...envConfig,
        ativo: envConfig.ativo ?? fiscal.ativo ?? true,
        ...(sameSeries ? { serie_fiscal: sameSeries, serie: sameSeries } : {}),
        [modelKey]: {
          ...envModelConfig,
          ...patch,
        },
      },
    },
  };
}

async function updateFiscalConfig(usuarioId, legacySequences, transaction, counters) {
  const config = await ConfiguracaoSistema.findOne({
    where: { usuario_id: usuarioId },
    transaction,
  });

  if (!config) {
    throw new Error(`Configuracao do usuario ${usuarioId} nao encontrada.`);
  }

  const currentSequences = await getCurrentNfSequences(usuarioId, transaction);
  const combined = selectSequenceByModel([...legacySequences, ...currentSequences]);
  let nextFiscal = asObject(config.fiscal);

  for (const sequence of combined) {
    nextFiscal = applySequencePatch(nextFiscal, sequence);
  }

  if (JSON.stringify(nextFiscal) === JSON.stringify(config.fiscal || {})) {
    counters.configuracao_fiscal.unchanged += 1;
    return combined;
  }

  config.fiscal = nextFiscal;
  await config.save({ transaction });
  counters.configuracao_fiscal.updated += 1;
  return combined;
}

async function buildDryRun(exportData, usuarioId, map) {
  const counters = createCounters();
  const legacySequences = buildLegacyFiscalSequences(exportData.documentos_fiscais);
  const selectedSequences = selectSequenceByModel(legacySequences);
  const legacyNfIds = exportData.documentos_fiscais.map(row => legacyId(row.id));
  const legacyExpenseIds = exportData.despesas_caixa.map(row => legacyId(row.id));
  const legacyMovementIds = [];

  for (const row of exportData.movimentacoes_estoque) {
    const items = Array.isArray(row.itens) && row.itens.length > 0 ? row.itens : [{}];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};
      const hasDetailedItem = Object.keys(item).length > 0;
      const quantity = getMovementQuantity(item, row, hasDetailedItem);
      const delta = getMovementDelta(item, row, hasDetailedItem);

      if (quantity <= 0 || hasMovementOverflow(item, delta, quantity)) {
        continue;
      }

      legacyMovementIds.push(legacyId(row.id, `:${String(index + 1).padStart(2, '0')}`));
    }
  }

  const [existingNfs, existingExpenses, existingMovements, currentSequences] = await Promise.all([
    legacyNfIds.length
      ? Nf.count({ where: { usuario_id: usuarioId, id: { [Op.in]: legacyNfIds } } })
      : 0,
    legacyExpenseIds.length
      ? DespesaCaixa.count({ where: { usuario_id: usuarioId, id: { [Op.in]: legacyExpenseIds } } })
      : 0,
    legacyMovementIds.length
      ? MovimentacaoEstoque.count({ where: { usuario_id: usuarioId, lancamento_id: { [Op.in]: legacyMovementIds } } })
      : 0,
    getCurrentNfSequences(usuarioId),
  ]);

  counters.despesas_caixa.inserted = exportData.despesas_caixa.length - existingExpenses;
  counters.despesas_caixa.updated = existingExpenses;
  counters.movimentacoes_estoque.itemRows = legacyMovementIds.length;
  counters.movimentacoes_estoque.inserted = legacyMovementIds.length - existingMovements;
  counters.movimentacoes_estoque.updated = existingMovements;
  counters.documentos_fiscais.inserted = exportData.documentos_fiscais.length - existingNfs;
  counters.documentos_fiscais.updated = existingNfs;

  const missingMappedSales = exportData.documentos_fiscais.filter(row => {
    if (!row.venda_id) {
      return false;
    }

    return !map.vendas[row.venda_id];
  }).length;

  return {
    sourceCounts: {
      documentos_fiscais: exportData.documentos_fiscais.length,
      despesas_caixa: exportData.despesas_caixa.length,
      movimentacoes_estoque: exportData.movimentacoes_estoque.length,
      movimentacoes_estoque_itens: legacyMovementIds.length,
    },
    counters,
    existing: {
      nfs: existingNfs,
      despesas_caixa: existingExpenses,
      movimentacoes_estoque_itens: existingMovements,
    },
    missingMappedSales,
    legacySequences,
    currentSequences,
    selectedSequences,
  };
}

async function runApply(exportData, targetUser, map) {
  const counters = createCounters();
  const warnings = [];
  const beforeSchema = await schemaSignature();
  const legacySequences = buildLegacyFiscalSequences(exportData.documentos_fiscais);
  let appliedSequences = [];

  await sequelize.transaction(async transaction => {
    const fallbackPdv = await findLegacyPdv(targetUser.id, transaction);

    await importExpenses(exportData.despesas_caixa, targetUser.id, map, fallbackPdv, transaction, counters);
    await importStockMovements(exportData.movimentacoes_estoque, targetUser.id, map, transaction, counters, warnings);
    await importFiscalDocuments(exportData.documentos_fiscais, targetUser.id, map, fallbackPdv, transaction, counters, warnings);
    appliedSequences = await updateFiscalConfig(targetUser.id, legacySequences, transaction, counters);
  });

  const afterSchema = await schemaSignature();
  if (beforeSchema !== afterSchema) {
    throw new Error('Schema changed during import. This script should never create or alter tables.');
  }

  return {
    applied: true,
    targetUser: { id: targetUser.id, email: targetUser.email },
    counters,
    warnings: warnings.slice(0, 50),
    warningCount: warnings.length,
    fiscalSequences: appliedSequences,
    schemaUnchanged: true,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const exportDirArg = args['export-dir'] || args._[0];
  if (!args['target-user-email'] && !args['target-user-id'] && args._[1]) {
    if (/^\d+$/.test(String(args._[1]))) {
      args['target-user-id'] = args._[1];
    } else {
      args['target-user-email'] = args._[1];
    }
  }

  if (!exportDirArg) {
    throw new Error('Missing --export-dir.');
  }

  const apply = Boolean(args.apply);
  if (apply && !args['target-user-id'] && !args['target-user-email']) {
    throw new Error('Apply blocked: pass --target-user-email or --target-user-id.');
  }

  if (apply && process.env.NODE_ENV === 'production' && !args['confirm-backup']) {
    throw new Error('Apply blocked in production: run pg_dump first and pass --confirm-backup.');
  }

  const exportDir = path.resolve(exportDirArg);
  const exportData = readExport(exportDir);
  const targetUser = await resolveTargetUser(args);
  const map = loadImportMap(exportDir);

  if (!targetUser) {
    throw new Error('Target user is required.');
  }

  if (!apply) {
    const dryRun = await buildDryRun(exportData, targetUser.id, map);
    console.log(
      JSON.stringify(
        {
          applied: false,
          mode: 'dry-run',
          targetUser: { id: targetUser.id, email: targetUser.email },
          ...dryRun,
        },
        null,
        2
      )
    );
    return;
  }

  const result = await runApply(exportData, targetUser, map);
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    if (process.env.LEGACY_IMPORT_DEBUG === '1') {
      console.error(JSON.stringify({
        name: error.name,
        message: error.message,
        errors: Array.isArray(error.errors)
          ? error.errors.map(item => ({
              message: item.message,
              path: item.path,
              value: item.value,
              type: item.type,
            }))
          : undefined,
        stack: error.stack,
      }, null, 2));
    } else {
      console.error(error.message);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
