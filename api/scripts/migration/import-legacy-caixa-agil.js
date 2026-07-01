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
  Caixa,
  CategoriaProduto,
  ClienteConvenio,
  ConferenciaCaixa,
  Estoque,
  Pdv,
  Produto,
  SaldoEstoqueProduto,
  Usuario,
  Venda,
} = requireApiModule('src/app/models', 'dist/app/models');

const SOURCE_COMPANY_ID = '01KPPS7VVWPCQTKJ7SAKXHQNX6';
const IMPORT_PDV_NAME = 'PDV importado Caixa Ágil antigo';
const IMPORT_DEVICE_ID = 'legacy-caixa-agil';
const MAP_FILE = 'legacy-import-map.json';
const SCHEMA_TABLES = [
  'categorias_produtos',
  'produtos',
  'estoques',
  'saldos_estoques_produtos',
  'clientes_convenio',
  'pdvs',
  'caixas',
  'conferencias_caixa',
  'vendas',
];

const EXPECTED_COUNTS = {
  categorias: 8,
  produtos: 406,
  estoques: 2,
  saldos_estoque: 812,
  convenios: 19,
  sessoes_caixa: 58,
  conferencias_caixa: 58,
  vendas: 1279,
  movimentacoes_estoque: 73,
  despesas_caixa: 0,
};

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
  npm --prefix api run legacy:import:caixa-agil -- C:\\exports\\legacy
  node api\\scripts\\migration\\import-legacy-caixa-agil.js --apply --export-dir C:\\exports\\legacy --target-user-email email@empresa.com

Options:
  --export-dir <dir>          Directory created by export-legacy-caixa-agil.js.
  --dry-run                   Validate only. Default mode when --apply is absent.
  --apply                     Import records into the current API database.
  --target-user-email <email> Target user email. Required for --apply unless --target-user-id is used.
  --target-user-id <id>       Target user id. Required for --apply unless --target-user-email is used.
  --confirm-backup            Required when NODE_ENV=production.
  --help                      Show this help.
`);
}

function normalizeText(value, maxLength) {
  const text = String(value ?? '').trim();
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

function onlyDigits(value, maxLength) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return maxLength ? digits.slice(0, maxLength) : digits;
}

function toInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function toDecimalString(value) {
  const number = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(number) ? number.toFixed(3) : '0.000';
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const key = normalizeKey(value);
  if (['true', '1', 'sim', 'yes', 'ativo', 'active'].includes(key)) {
    return true;
  }
  if (['false', '0', 'nao', 'no', 'inativo', 'inactive'].includes(key)) {
    return false;
  }

  return fallback;
}

function parseLegacyDate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
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

function dateFromOperationKey(key) {
  const normalized = normalizeText(key, 10);

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized || '')) {
    return new Date(`${normalized}T12:00:00.000-03:00`);
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized || '')) {
    const [day, month, year] = normalized.split('/');
    return new Date(`${year}-${month}-${day}T12:00:00.000-03:00`);
  }

  return new Date();
}

function operationLabelsFromDate(date) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const labelFormatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return {
    key: formatter.format(safeDate),
    label: labelFormatter.format(safeDate),
  };
}

function legacyId(value) {
  return `legacy-${String(value || '').slice(0, 57)}`;
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

function readExport(exportDir) {
  const manifestPath = path.join(exportDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : null;

  return {
    manifest,
    empresas: readExportTable(exportDir, 'empresas'),
    categorias: readExportTable(exportDir, 'categorias'),
    produtos: readExportTable(exportDir, 'produtos'),
    estoques: readExportTable(exportDir, 'estoques'),
    saldos_estoque: readExportTable(exportDir, 'saldos_estoque'),
    convenios: readExportTable(exportDir, 'convenios'),
    sessoes_caixa: readExportTable(exportDir, 'sessoes_caixa'),
    conferencias_caixa: readExportTable(exportDir, 'conferencias_caixa'),
    vendas: readExportTable(exportDir, 'vendas'),
    movimentacoes_estoque: readExportTable(exportDir, 'movimentacoes_estoque'),
    despesas_caixa: readExportTable(exportDir, 'despesas_caixa'),
  };
}

function emptyMap(exportData, targetUserId = null) {
  return {
    sourceCompanyId: exportData.manifest?.sourceCompanyId || SOURCE_COMPANY_ID,
    targetUserId,
    updatedAt: null,
    categorias: {},
    produtos: {},
    estoques: {},
    convenios: {},
    caixas: {},
    vendas: {},
  };
}

function loadImportMap(exportDir, exportData, targetUserId) {
  const mapPath = path.join(exportDir, MAP_FILE);

  if (!fs.existsSync(mapPath)) {
    return emptyMap(exportData, targetUserId);
  }

  const loaded = readJson(mapPath);
  return {
    ...emptyMap(exportData, targetUserId),
    ...loaded,
    targetUserId,
    categorias: loaded.categorias || {},
    produtos: loaded.produtos || {},
    estoques: loaded.estoques || {},
    convenios: loaded.convenios || {},
    caixas: loaded.caixas || {},
    vendas: loaded.vendas || {},
  };
}

function saveImportMap(exportDir, map) {
  const mapPath = path.join(exportDir, MAP_FILE);
  const payload = {
    ...map,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(mapPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function countBy(rows, keyGetter) {
  const counts = new Map();

  for (const row of rows) {
    const key = keyGetter(row);
    if (!key) {
      continue;
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()].filter(([, count]) => count > 1);
}

function getItemProductId(item) {
  return (
    item?.produto_id ||
    item?.productId ||
    item?.produtoId ||
    item?.product_id ||
    item?.id_produto ||
    item?.id ||
    null
  );
}

function getProductNaturalKey(row) {
  const barcode = onlyDigits(row.codigo_barras, 64);
  if (barcode) {
    return `barcode:${barcode}`;
  }

  return `name:${normalizeKey(row.categoria_id)}:${normalizeKey(row.nome)}`;
}

function getDuplicateProductKeys(rows) {
  return new Set(countBy(rows, getProductNaturalKey).map(([key]) => key));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePaymentMethod(value) {
  const key = normalizeKey(value);

  if (!key) {
    return null;
  }

  if (key.includes('pix')) {
    return 'pix';
  }
  if (key.includes('cartao') || key.includes('credito') || key.includes('debito') || key === 'card') {
    return 'cartao';
  }
  if (key.includes('convenio')) {
    return 'convenio';
  }
  if (key.includes('dinheiro') || key.includes('cash')) {
    return 'dinheiro';
  }

  return key.slice(0, 20);
}

function isCanceledSale(row) {
  return ['cancelada', 'cancelled', 'canceled'].includes(normalizeKey(row.situacao || row.status));
}

function isConvenioSale(row) {
  return Boolean(
    row.convenio_id ||
      normalizePaymentMethod(row.metodo_pagamento) === 'convenio' ||
      normalizeKey(row.situacao) === 'convenio' ||
      ['pendente', 'recebido', 'recebido_caixa', 'pago', 'paid'].includes(normalizeKey(row.situacao_recebimento))
  );
}

function isReceivedConvenio(row) {
  return Boolean(
    row.recebido_em ||
      ['recebido', 'recebido_caixa', 'pago', 'paid'].includes(normalizeKey(row.situacao_recebimento))
  );
}

function getSaleRecordedAt(row) {
  return (
    parseLegacyDate(row.registrado_em) ||
    parseLegacyDate(row.created_at) ||
    parseLegacyDate(row.updated_at) ||
    new Date()
  );
}

function getSourceCounts(exportData) {
  return {
    categorias: exportData.categorias.length,
    produtos: exportData.produtos.length,
    estoques: exportData.estoques.length,
    saldos_estoque: exportData.saldos_estoque.length,
    convenios: exportData.convenios.length,
    sessoes_caixa: exportData.sessoes_caixa.length,
    conferencias_caixa: exportData.conferencias_caixa.length,
    vendas: exportData.vendas.length,
    movimentacoes_estoque: exportData.movimentacoes_estoque.length,
    despesas_caixa: exportData.despesas_caixa.length,
  };
}

function validateExportData(exportData) {
  const warnings = [];
  const sourceCounts = getSourceCounts(exportData);
  const categoryIds = new Set(exportData.categorias.map(row => row.id));
  const productIds = new Set(exportData.produtos.map(row => row.id));
  const stockIds = new Set(exportData.estoques.map(row => row.id));
  const convenioIds = new Set(exportData.convenios.map(row => row.id));
  const salesConvenio = exportData.vendas.filter(row => isConvenioSale(row) && !isCanceledSale(row));
  const convenioPendentes = salesConvenio.filter(row => !isReceivedConvenio(row)).length;
  const convenioPagos = salesConvenio.filter(row => isReceivedConvenio(row)).length;

  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (sourceCounts[table] !== expected) {
      warnings.push(`Count mismatch for ${table}: expected ${expected}, found ${sourceCounts[table]}.`);
    }
  }

  const duplicateBarcodes = countBy(exportData.produtos, row => onlyDigits(row.codigo_barras, 64));
  const duplicateProductNames = countBy(exportData.produtos, row => normalizeKey(row.nome));

  if (duplicateBarcodes.length > 0) {
    warnings.push(`Duplicate barcodes in export: ${duplicateBarcodes.length}.`);
  }

  if (duplicateProductNames.length > 0) {
    warnings.push(`Duplicate product names in export: ${duplicateProductNames.length}.`);
  }

  const productsWithoutCategory = exportData.produtos.filter(row => !categoryIds.has(row.categoria_id));
  if (productsWithoutCategory.length > 0) {
    warnings.push(`Products without category mapping: ${productsWithoutCategory.length}.`);
  }

  const balancesWithoutProduct = exportData.saldos_estoque.filter(row => !productIds.has(row.produto_id));
  if (balancesWithoutProduct.length > 0) {
    warnings.push(`Stock balances without source product: ${balancesWithoutProduct.length}.`);
  }

  const balancesWithoutStock = exportData.saldos_estoque.filter(row => !stockIds.has(row.estoque_id));
  if (balancesWithoutStock.length > 0) {
    warnings.push(`Stock balances without source stock: ${balancesWithoutStock.length}.`);
  }

  let saleItemsWithoutProduct = 0;
  for (const sale of exportData.vendas) {
    for (const item of asArray(sale.itens)) {
      const productId = getItemProductId(item);
      if (productId && !productIds.has(String(productId))) {
        saleItemsWithoutProduct += 1;
      }
    }
  }

  if (saleItemsWithoutProduct > 0) {
    warnings.push(`Sale items without source product mapping: ${saleItemsWithoutProduct}.`);
  }

  const salesWithoutClient = salesConvenio.filter(row => row.convenio_id && !convenioIds.has(row.convenio_id));
  if (salesWithoutClient.length > 0) {
    warnings.push(`Convenio sales without source client mapping: ${salesWithoutClient.length}.`);
  }

  return {
    warnings,
    sourceCounts,
    convenio: {
      pendentes: convenioPendentes,
      pagos: convenioPagos,
    },
    duplicateBarcodes: duplicateBarcodes.slice(0, 20),
    duplicateProductNames: duplicateProductNames.slice(0, 20),
    productsWithoutCategory: productsWithoutCategory.length,
    productsWithoutBalance: exportData.produtos.filter(
      product => !exportData.saldos_estoque.some(balance => balance.produto_id === product.id)
    ).length,
    saleItemsWithoutProduct,
    salesWithoutClient: salesWithoutClient.length,
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

async function getOrCreateFallbackCategory(usuarioId, transaction, counters) {
  const [category, created] = await CategoriaProduto.findOrCreate({
    where: { usuario_id: usuarioId, nome: 'Importados legado' },
    defaults: {
      usuario_id: usuarioId,
      nome: 'Importados legado',
      icone: 'package',
      cor: 'laranja',
      ordem: 999,
      ativo: true,
    },
    transaction,
  });

  counters.categorias[created ? 'inserted' : 'reused'] += 1;
  return category;
}

async function importCategories(exportData, usuarioId, map, transaction, counters) {
  for (const row of exportData.categorias) {
    const nome = normalizeText(row.nome, 80) || `Categoria ${row.id}`;
    let category = await CategoriaProduto.findOne({
      where: { usuario_id: usuarioId, nome },
      transaction,
    });

    const payload = {
      usuario_id: usuarioId,
      nome,
      icone: normalizeText(row.icone, 40) || 'package',
      cor: normalizeText(row.cor, 24) || 'laranja',
      ordem: toInteger(row.ordem_exibicao, 0),
      ativo: true,
    };

    if (category) {
      await category.update(payload, { transaction });
      counters.categorias.updated += 1;
    } else {
      category = await CategoriaProduto.create(payload, { transaction });
      counters.categorias.inserted += 1;
    }

    map.categorias[row.id] = category.id;
  }
}

async function findProductByMapOrNaturalKey(row, usuarioId, categoriaId, map, transaction, duplicateContext) {
  const naturalKey = getProductNaturalKey(row);
  const isDuplicateNaturalKey = duplicateContext.keys.has(naturalKey);
  const mappedId = map.produtos[row.id];

  if (mappedId) {
    const mapped = await Produto.findOne({ where: { id: mappedId, usuario_id: usuarioId }, transaction });
    if (mapped) {
      if (!isDuplicateNaturalKey) {
        return mapped;
      }

      const usedIds = duplicateContext.usedMappedIdsByKey.get(naturalKey) || new Set();
      if (!usedIds.has(mapped.id)) {
        usedIds.add(mapped.id);
        duplicateContext.usedMappedIdsByKey.set(naturalKey, usedIds);
        return mapped;
      }

      delete map.produtos[row.id];
    }
  }

  if (isDuplicateNaturalKey) {
    return null;
  }

  if (mappedId) {
    const mapped = await Produto.findOne({ where: { id: mappedId, usuario_id: usuarioId }, transaction });
    if (mapped) {
      return mapped;
    }
  }

  const codigoBarras = onlyDigits(row.codigo_barras, 64);
  if (codigoBarras) {
    const byBarcode = await Produto.findOne({ where: { usuario_id: usuarioId, codigo_barras: codigoBarras }, transaction });
    if (byBarcode) {
      return byBarcode;
    }
  }

  return Produto.findOne({
    where: {
      usuario_id: usuarioId,
      categoria_id: categoriaId,
      nome: normalizeText(row.nome, 120) || `Produto ${row.id}`,
    },
    transaction,
  });
}

async function importProducts(exportData, usuarioId, map, transaction, counters, warnings) {
  let fallbackCategory = null;
  const duplicateContext = {
    keys: getDuplicateProductKeys(exportData.produtos),
    usedMappedIdsByKey: new Map(),
  };

  for (const row of exportData.produtos) {
    let categoriaId = map.categorias[row.categoria_id];

    if (!categoriaId) {
      fallbackCategory = fallbackCategory || (await getOrCreateFallbackCategory(usuarioId, transaction, counters));
      categoriaId = fallbackCategory.id;
      warnings.push(`Product ${row.id} used fallback category.`);
    }

    let product = await findProductByMapOrNaturalKey(row, usuarioId, categoriaId, map, transaction, duplicateContext);
    const payload = {
      usuario_id: usuarioId,
      categoria_id: categoriaId,
      grupo_fiscal_id: null,
      nome: normalizeText(row.nome, 120) || `Produto ${row.id}`,
      codigo_barras: onlyDigits(row.codigo_barras, 64),
      ncm: onlyDigits(row.codigo_ncm || row.ncm, 8),
      preco_custo_centavos: toInteger(row.custo_centavos, 0),
      preco_venda_centavos: toInteger(row.preco_centavos, 0),
      controla_estoque: toBoolean(row.controla_estoque, true),
      ativo: toBoolean(row.ativo, true),
    };

    if (product) {
      await product.update(payload, { transaction });
      counters.produtos.updated += 1;
    } else {
      product = await Produto.create(payload, { transaction });
      counters.produtos.inserted += 1;
    }

    map.produtos[row.id] = product.id;
  }
}

async function importStocks(exportData, usuarioId, map, transaction, counters) {
  for (const [index, row] of exportData.estoques.entries()) {
    const nome = normalizeText(row.nome, 80) || `Estoque ${row.id}`;
    let stock = null;

    if (map.estoques[row.id]) {
      stock = await Estoque.findOne({ where: { id: map.estoques[row.id], usuario_id: usuarioId }, transaction });
    }

    if (!stock) {
      stock = await Estoque.findOne({ where: { usuario_id: usuarioId, nome }, transaction });
    }

    const ativo = toBoolean(row.ativo, true);
    const payload = {
      usuario_id: usuarioId,
      nome,
      principal_venda: toBoolean(row.principal, index === 0),
      permite_venda: ativo,
      ordem: index,
      ativo,
    };

    if (stock) {
      await stock.update(payload, { transaction });
      counters.estoques.updated += 1;
    } else {
      stock = await Estoque.create(payload, { transaction });
      counters.estoques.inserted += 1;
    }

    map.estoques[row.id] = stock.id;
  }
}

async function importBalances(exportData, usuarioId, map, transaction, counters, warnings) {
  for (const row of exportData.saldos_estoque) {
    const produtoId = map.produtos[row.produto_id];
    const estoqueId = map.estoques[row.estoque_id];

    if (!produtoId || !estoqueId) {
      counters.saldos_estoque.skipped += 1;
      warnings.push(`Skipped stock balance ${row.id}: missing mapped product or stock.`);
      continue;
    }

    let balance = await SaldoEstoqueProduto.findOne({
      where: { produto_id: produtoId, estoque_id: estoqueId },
      transaction,
    });

    const payload = {
      usuario_id: usuarioId,
      produto_id: produtoId,
      estoque_id: estoqueId,
      quantidade: toDecimalString(row.quantidade),
    };

    if (balance) {
      await balance.update(payload, { transaction });
      counters.saldos_estoque.updated += 1;
    } else {
      balance = await SaldoEstoqueProduto.create(payload, { transaction });
      counters.saldos_estoque.inserted += 1;
    }
  }
}

function fiscalDataFromConvenio(row) {
  return {
    legado_id: row.id || null,
    cnpj: onlyDigits(row.cnpj, 14),
    razao_social: normalizeText(row.razao_social, 160),
    nome_fantasia: normalizeText(row.nome_fantasia, 160),
    indicador_inscricao_estadual: normalizeText(row.indicador_inscricao_estadual, 24),
    inscricao_estadual: normalizeText(row.inscricao_estadual, 32),
    email: normalizeText(row.email, 160),
    fone: normalizeText(row.fone, 32),
    logradouro: normalizeText(row.logradouro, 160),
    numero: normalizeText(row.numero, 24),
    complemento: normalizeText(row.complemento, 80),
    bairro: normalizeText(row.bairro, 80),
    codigo_municipio_ibge: onlyDigits(row.codigo_municipio_ibge, 7),
    municipio: normalizeText(row.municipio, 80),
    uf: normalizeText(row.uf, 2),
    cep: onlyDigits(row.cep, 8),
    observacoes: normalizeText(row.observacoes, 1000),
  };
}

async function importClients(exportData, usuarioId, map, transaction, counters) {
  const existingClients = await ClienteConvenio.findAll({ where: { usuario_id: usuarioId }, transaction });

  for (const row of exportData.convenios) {
    const fiscalData = fiscalDataFromConvenio(row);
    const isCompany = toBoolean(row.cliente_pj_nfe, false) || Boolean(fiscalData.cnpj || fiscalData.razao_social);
    const nome =
      normalizeText(isCompany ? row.razao_social || row.nome_fantasia || row.nome : row.nome, 160) ||
      `Cliente ${row.id}`;
    let client = null;

    if (map.convenios[row.id]) {
      client = await ClienteConvenio.findOne({
        where: { id: map.convenios[row.id], usuario_id: usuarioId },
        transaction,
      });
    }

    if (!client) {
      client = existingClients.find(candidate => {
        const candidateData = candidate.dados_fiscais || {};
        const sameCnpj = fiscalData.cnpj && onlyDigits(candidateData.cnpj, 14) === fiscalData.cnpj;
        const sameName = normalizeKey(candidate.nome) === normalizeKey(nome);
        return sameCnpj || sameName;
      });
    }

    const payload = {
      usuario_id: usuarioId,
      tipo_pessoa: isCompany ? 'juridica' : 'fisica',
      nome,
      ativo: toBoolean(row.ativo, true),
      permite_pagamento_frente_caixa: toBoolean(row.ativo, true),
      dados_fiscais: fiscalData,
    };

    if (client) {
      await client.update(payload, { transaction });
      counters.convenios.updated += 1;
    } else {
      client = await ClienteConvenio.create(payload, { transaction });
      existingClients.push(client);
      counters.convenios.inserted += 1;
    }

    map.convenios[row.id] = client.id;
  }
}

async function getOrCreateImportPdv(usuarioId, transaction, counters) {
  let pdv = await Pdv.findOne({
    where: { usuario_id: usuarioId, nome: IMPORT_PDV_NAME },
    transaction,
  });

  const payload = {
    usuario_id: usuarioId,
    nome: IMPORT_PDV_NAME,
    status: 'inativo',
    ativo: false,
    sincronizacao_pendente: false,
  };

  if (pdv) {
    await pdv.update(payload, { transaction });
    counters.pdvs.updated += 1;
  } else {
    pdv = await Pdv.create(payload, { transaction });
    counters.pdvs.inserted += 1;
  }

  return pdv;
}

async function importCashSessions(exportData, usuarioId, pdv, map, transaction, counters) {
  for (const row of exportData.sessoes_caixa) {
    const openedAt = parseLegacyDate(row.aberto_em) || dateFromOperationKey(row.data_operacao_chave);
    const labels = operationLabelsFromDate(openedAt);
    const closedAt = parseLegacyDate(row.fechado_em);
    const id = legacyId(row.id);
    const status = normalizeKey(row.situacao);
    const situacao = status === 'fechado' || status === 'closed' || closedAt ? 'fechado' : 'aberto';
    const payload = {
      id,
      usuario_id: usuarioId,
      pdv_id: pdv.id,
      dispositivo_id: IMPORT_DEVICE_ID,
      data_operacao_chave: normalizeText(row.data_operacao_chave, 10) || labels.key,
      data_operacao_rotulo: normalizeText(row.data_operacao_rotulo, 10) || labels.label,
      numero_turno: toInteger(row.numero_turno, 1),
      situacao,
      aberto_em: openedAt,
      fechado_em: closedAt,
      funcionario_abertura_id: normalizeText(row.funcionario_abertura_id, 64),
      funcionario_abertura_nome: normalizeText(row.funcionario_abertura_nome, 120),
      funcionario_fechamento_id: null,
      funcionario_fechamento_nome: null,
    };

    const existing = await Caixa.findByPk(id, { transaction });
    if (existing) {
      await existing.update(payload, { transaction });
      counters.caixas.updated += 1;
    } else {
      await Caixa.create(payload, { transaction });
      counters.caixas.inserted += 1;
    }

    map.caixas[row.id] = id;
  }
}

async function importCashConferences(exportData, usuarioId, map, transaction, counters, warnings) {
  for (const row of exportData.conferencias_caixa) {
    const caixaId = map.caixas[row.sessao_caixa_id];
    if (!caixaId) {
      counters.conferencias_caixa.skipped += 1;
      warnings.push(`Skipped cash conference ${row.id}: missing mapped cash session.`);
      continue;
    }

    const id = legacyId(row.id);
    const reviewedAt = parseLegacyDate(row.revisado_em) || new Date();
    const payload = {
      id,
      usuario_id: usuarioId,
      caixa_id: caixaId,
      dinheiro_confirmado_centavos: toInteger(row.dinheiro_confirmado_centavos, 0),
      cartao_confirmado_centavos: toInteger(row.cartao_confirmado_centavos, 0),
      pix_confirmado_centavos: toInteger(row.pix_confirmado_centavos, 0),
      convenio_confirmado_centavos: toInteger(row.convenio_confirmado_centavos, 0),
      ativo: toBoolean(row.ativo, true),
      revisado_em: reviewedAt,
    };

    const existing = await ConferenciaCaixa.findByPk(id, { transaction });
    if (existing) {
      await existing.update(payload, { transaction });
      counters.conferencias_caixa.updated += 1;
    } else {
      await ConferenciaCaixa.create(payload, { transaction });
      counters.conferencias_caixa.inserted += 1;
    }
  }
}

function remapSaleItems(row, map, warnings, counters) {
  return asArray(row.itens).map(item => {
    const next = { ...item };
    const oldProductId = getItemProductId(item);
    const newProductId = oldProductId ? map.produtos[String(oldProductId)] : null;

    if (oldProductId && newProductId) {
      next.id = newProductId;
      next.produto_id = newProductId;
      next.productId = newProductId;
      next.produto_legado_id = String(oldProductId);
    } else if (oldProductId) {
      next.produto_legado_id = String(oldProductId);
      counters.vendas.itemsWithoutProduct += 1;
      warnings.push(`Sale ${row.id} has item without mapped product ${oldProductId}.`);
    }

    return next;
  });
}

async function getSafeSaleCode(row, usuarioId, saleId, transaction) {
  const original = normalizeText(row.codigo, 40) || normalizeText(row.code, 40);
  const fallback = normalizeText(`LEG-${String(row.id || '').slice(-12)}`, 40);
  const preferred = original || fallback;
  const existing = await Venda.findOne({
    where: {
      usuario_id: usuarioId,
      codigo: preferred,
      id: { [Op.ne]: saleId },
    },
    transaction,
  });

  return existing ? fallback : preferred;
}

async function importSales(exportData, usuarioId, pdv, map, transaction, counters, warnings) {
  for (const row of exportData.vendas) {
    const id = legacyId(row.id);
    const recordedAt = getSaleRecordedAt(row);
    const convenioSale = isConvenioSale(row);
    const receivedConvenio = convenioSale && isReceivedConvenio(row);
    const canceled = isCanceledSale(row);
    const paymentMethod = convenioSale ? 'convenio' : normalizePaymentMethod(row.metodo_pagamento);
    const receiptPaymentMethod = receivedConvenio ? normalizePaymentMethod(row.metodo_pagamento_recebimento) : null;
    const clientId = row.convenio_id ? map.convenios[row.convenio_id] || null : null;
    const caixaId = row.sessao_caixa_id ? map.caixas[row.sessao_caixa_id] || null : null;
    const receiptCaixaId = row.sessao_caixa_recebimento_id
      ? map.caixas[row.sessao_caixa_recebimento_id] || null
      : null;

    if (convenioSale && row.convenio_id && !clientId) {
      counters.vendas.salesWithoutClient += 1;
      warnings.push(`Convenio sale ${row.id} has no mapped client.`);
    }

    const items = remapSaleItems(row, map, warnings, counters);
    const code = await getSafeSaleCode(row, usuarioId, id, transaction);
    const payload = {
      id,
      usuario_id: usuarioId,
      pdv_id: pdv.id,
      dispositivo_id: IMPORT_DEVICE_ID,
      caixa_id: caixaId,
      codigo: code,
      tipo_origem: normalizeText(row.tipo_origem, 20) || 'caixa',
      referencia_origem: normalizeText(row.referencia_origem, 64),
      titulo: normalizeText(row.titulo, 120) || `Venda ${code}`,
      convenio_id: normalizeText(row.convenio_id, 64),
      cliente_convenio_id: clientId,
      nome_cliente: normalizeText(row.nome_cliente, 120),
      nome_consumidor: normalizeText(row.nome_consumidor, 120),
      documento_consumidor: normalizeText(row.documento_consumidor, 32),
      rotulo_origem: normalizeText(row.rotulo_origem, 120) || 'Caixa antigo',
      canal: normalizeText(row.canal, 80) || 'PDV',
      itens: items,
      quantidade_itens: toInteger(row.quantidade_itens, items.length),
      subtotal_centavos: toInteger(row.subtotal_centavos, 0),
      total_centavos: toInteger(row.total_centavos, 0),
      desconto_pagamento_centavos: toInteger(row.desconto_pagamento_centavos, 0),
      metodo_pagamento: paymentMethod,
      metodo_pagamento_recebimento: receiptPaymentMethod,
      caixa_recebimento_id: receiptCaixaId,
      situacao: canceled ? 'cancelada' : convenioSale ? 'convenio' : 'paga',
      status_convenio: convenioSale ? (receivedConvenio ? 'pago' : 'pendente') : null,
      situacao_recebimento: convenioSale ? (receivedConvenio ? 'recebido_caixa' : 'pendente') : 'nenhum',
      recebido_em: convenioSale
        ? receivedConvenio
          ? parseLegacyDate(row.recebido_em) || recordedAt
          : null
        : canceled
          ? null
          : recordedAt,
      observacao: normalizeText(row.observacao, 4000),
      registrado_em: recordedAt,
    };

    const existing = await Venda.findByPk(id, { transaction });
    if (existing) {
      await existing.update(payload, { transaction });
      counters.vendas.updated += 1;
    } else {
      await Venda.create(payload, { transaction });
      counters.vendas.inserted += 1;
    }

    map.vendas[row.id] = id;
  }
}

function createCounters() {
  return {
    pdvs: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    categorias: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    produtos: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    estoques: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    saldos_estoque: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    convenios: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    caixas: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    conferencias_caixa: { inserted: 0, updated: 0, reused: 0, skipped: 0 },
    vendas: {
      inserted: 0,
      updated: 0,
      reused: 0,
      skipped: 0,
      itemsWithoutProduct: 0,
      salesWithoutClient: 0,
    },
  };
}

async function targetDryRun(exportData, usuarioId) {
  const [barcodeRows, legacySales, legacyCashSessions, pdv] = await Promise.all([
    Produto.findAll({
      attributes: ['id', 'nome', 'codigo_barras'],
      where: {
        usuario_id: usuarioId,
        codigo_barras: {
          [Op.in]: exportData.produtos.map(row => onlyDigits(row.codigo_barras, 64)).filter(Boolean),
        },
      },
    }),
    Venda.count({ where: { usuario_id: usuarioId, id: { [Op.like]: 'legacy-%' } } }),
    Caixa.count({ where: { usuario_id: usuarioId, id: { [Op.like]: 'legacy-%' } } }),
    Pdv.findOne({ where: { usuario_id: usuarioId, nome: IMPORT_PDV_NAME } }),
  ]);

  return {
    targetBarcodeConflicts: barcodeRows.map(row => ({
      id: row.id,
      nome: row.nome,
      codigo_barras: row.codigo_barras,
    })),
    existingLegacySales: legacySales,
    existingLegacyCashSessions: legacyCashSessions,
    importPdvExists: Boolean(pdv),
  };
}

async function runApply(exportData, exportDir, targetUser) {
  const counters = createCounters();
  const warnings = [];
  const map = loadImportMap(exportDir, exportData, targetUser.id);
  const beforeSchema = await schemaSignature();

  await sequelize.transaction(async transaction => {
    await importCategories(exportData, targetUser.id, map, transaction, counters);
    await importProducts(exportData, targetUser.id, map, transaction, counters, warnings);
    await importStocks(exportData, targetUser.id, map, transaction, counters);
    await importBalances(exportData, targetUser.id, map, transaction, counters, warnings);
    await importClients(exportData, targetUser.id, map, transaction, counters);

    const pdv = await getOrCreateImportPdv(targetUser.id, transaction, counters);
    await importCashSessions(exportData, targetUser.id, pdv, map, transaction, counters);
    await importCashConferences(exportData, targetUser.id, map, transaction, counters, warnings);
    await importSales(exportData, targetUser.id, pdv, map, transaction, counters, warnings);
  });

  const afterSchema = await schemaSignature();

  if (beforeSchema !== afterSchema) {
    throw new Error('Schema changed during import. This script should never create or alter tables.');
  }

  saveImportMap(exportDir, map);

  return {
    applied: true,
    targetUser: { id: targetUser.id, email: targetUser.email },
    counters,
    warnings,
    schemaUnchanged: true,
    mapFile: path.join(exportDir, MAP_FILE),
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
  const validation = validateExportData(exportData);
  const targetUser = await resolveTargetUser(args);

  if (!apply) {
    const target = targetUser ? await targetDryRun(exportData, targetUser.id) : null;
    console.log(
      JSON.stringify(
        {
          applied: false,
          mode: 'dry-run',
          sourceCompanyId: exportData.manifest?.sourceCompanyId || SOURCE_COMPANY_ID,
          sourceCounts: validation.sourceCounts,
          convenio: validation.convenio,
          expectedCounts: EXPECTED_COUNTS,
          checks: {
            duplicateBarcodes: validation.duplicateBarcodes,
            duplicateProductNames: validation.duplicateProductNames,
            productsWithoutCategory: validation.productsWithoutCategory,
            productsWithoutBalance: validation.productsWithoutBalance,
            saleItemsWithoutProduct: validation.saleItemsWithoutProduct,
            salesWithoutClient: validation.salesWithoutClient,
          },
          targetUser: targetUser ? { id: targetUser.id, email: targetUser.email } : null,
          target,
          warnings: validation.warnings,
          applyBlockedWithoutTarget: true,
        },
        null,
        2
      )
    );
    return;
  }

  const result = await runApply(exportData, exportDir, targetUser);
  result.sourceCounts = validation.sourceCounts;
  result.convenio = validation.convenio;
  result.validationWarnings = validation.warnings;
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
