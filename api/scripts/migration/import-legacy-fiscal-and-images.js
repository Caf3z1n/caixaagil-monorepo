#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
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
const { Arquivo, GrupoFiscal, Produto, Usuario } = requireApiModule('src/app/models', 'dist/app/models');
const {
  buildStorageDirectory,
  ensureDirectory,
  toRelativePath,
} = requireApiModule('src/app/services/fileStorageService', 'dist/app/services/fileStorageService');

const MAP_FILE = 'legacy-import-map.json';
const LEGACY_IMAGE_CONTEXT = 'produto_imagem_legado';
const DOWNLOAD_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

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
  node api\\scripts\\migration\\import-legacy-fiscal-and-images.js --dry-run --export-dir C:\\exports\\legacy --target-user-email email@empresa.com
  node api\\scripts\\migration\\import-legacy-fiscal-and-images.js --apply --confirm-backup --export-dir C:\\exports\\legacy --target-user-email email@empresa.com

Options:
  --export-dir <dir>          Legacy export directory.
  --target-user-email <email> Target user email. Required for --apply unless --target-user-id is used.
  --target-user-id <id>       Target user id. Required for --apply unless --target-user-email is used.
  --legacy-media-dir <dir>    Optional old media root containing <companyId>/products files.
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

function onlyDigits(value, maxLength) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  return maxLength ? digits.slice(0, maxLength) : digits;
}

function decimalOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number.toFixed(4) : null;
}

function booleanOrFalse(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return ['1', 'true', 'sim', 'yes', 'ativo', 'active'].includes(normalizeKey(value));
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
      produtos: {},
      grupos_fiscais: {},
      arquivos_produtos: {},
    };
  }

  const loaded = readJson(filePath);
  return {
    ...loaded,
    produtos: loaded.produtos || {},
    grupos_fiscais: loaded.grupos_fiscais || {},
    arquivos_produtos: loaded.arquivos_produtos || {},
  };
}

function saveImportMap(exportDir, map) {
  fs.writeFileSync(
    path.join(exportDir, MAP_FILE),
    `${JSON.stringify({ ...map, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8'
  );
}

function getProductNaturalKey(row) {
  const barcode = onlyDigits(row.codigo_barras, 64);
  if (barcode) {
    return `barcode:${barcode}`;
  }

  return `name:${normalizeKey(row.categoria_id)}:${normalizeKey(row.nome)}`;
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

function getDuplicateProductKeys(rows) {
  return new Set(countBy(rows, getProductNaturalKey).map(([key]) => key));
}

function buildFiscalPayload(row) {
  return {
    nome: normalizeText(row.nome, 120) || `Grupo fiscal ${row.id}`,
    icone: normalizeText(row.icone, 40) || 'package',
    regime_tributario: normalizeText(row.regime_tributario, 32) || 'simples_nacional',
    ativo: row.ativo !== false,
    ncm: onlyDigits(row.ncm, 8),
    cfop: onlyDigits(row.cfop, 4) || '5102',
    cst_icms: onlyDigits(row.cst_icms, 2),
    csosn: onlyDigits(row.csosn, 3),
    aliquota_icms: decimalOrNull(row.aliquota_icms),
    reducao_icms: decimalOrNull(row.reducao_base_icms ?? row.reducao_icms),
    base_icms_st: decimalOrNull(row.base_icms_st),
    cst_pis: onlyDigits(row.cst_pis_saida ?? row.cst_pis, 2) || '49',
    aliquota_pis: decimalOrNull(row.aliquota_pis),
    cst_cofins: onlyDigits(row.cst_cofins_saida ?? row.cst_cofins, 2) || '49',
    aliquota_cofins: decimalOrNull(row.aliquota_cofins),
    ibs_ativo: booleanOrFalse(row.ibs_ativo),
    cst_ibs: onlyDigits(row.ibs_cst ?? row.cst_ibs, 3),
    classificacao_ibs: onlyDigits(row.ibs_classificacao_tributaria ?? row.classificacao_ibs, 6),
    aliquota_ibs_uf: decimalOrNull(row.aliquota_ibs_uf),
    aliquota_ibs_municipal: decimalOrNull(row.aliquota_ibs_municipio ?? row.aliquota_ibs_municipal),
    aliquota_cbs: decimalOrNull(row.aliquota_cbs),
  };
}

function getExtensionFromMime(mimeType, fallback = '.bin') {
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };

  return map[String(mimeType || '').toLowerCase()] || fallback;
}

function parseDataImage(dataUrl) {
  const match = typeof dataUrl === 'string'
    ? dataUrl.trim().match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i)
    : null;

  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    return null;
  }

  return { buffer, mimeType };
}

function downloadImage(url, redirects = 0) {
  return new Promise(resolve => {
    if (!/^https?:\/\//i.test(String(url || '')) || redirects > 4) {
      resolve(null);
      return;
    }

    const client = url.startsWith('https:') ? https : http;
    const request = client.get(
      url,
      {
        timeout: DOWNLOAD_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      },
      response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          resolve(downloadImage(new URL(response.headers.location, url).toString(), redirects + 1));
          return;
        }

        const mimeType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (response.statusCode !== 200 || !mimeType.startsWith('image/')) {
          response.resume();
          resolve(null);
          return;
        }

        const chunks = [];
        let total = 0;
        response.on('data', chunk => {
          total += chunk.length;
          if (total <= MAX_IMAGE_BYTES) {
            chunks.push(chunk);
          } else {
            request.destroy();
            resolve(null);
          }
        });
        response.on('end', () => {
          if (total > MAX_IMAGE_BYTES || !chunks.length) {
            resolve(null);
            return;
          }
          resolve({ buffer: Buffer.concat(chunks), mimeType });
        });
      }
    );

    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

function getLegacyStorageImage(row, legacyMediaDir) {
  if (!legacyMediaDir || !row.imagem_chave) {
    return null;
  }

  const normalizedKey = String(row.imagem_chave).replace(/\\/g, '/');
  const resolved = path.resolve(legacyMediaDir, normalizedKey);
  const root = path.resolve(legacyMediaDir);

  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  if (!fs.existsSync(resolved)) {
    return null;
  }

  const buffer = fs.readFileSync(resolved);
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    return null;
  }

  return {
    buffer,
    mimeType: normalizeText(row.imagem_mime, 120) || 'image/jpeg',
  };
}

async function resolveLegacyImage(row, legacyMediaDir) {
  return (
    parseDataImage(row.imagem_url_dados) ||
    getLegacyStorageImage(row, legacyMediaDir) ||
    (row.imagem_url ? await downloadImage(row.imagem_url) : null)
  );
}

async function createOrUpdateImage({ usuarioId, product, legacyProduct, image, map, transaction }) {
  const existingId = map.arquivos_produtos[legacyProduct.id];
  let arquivo = existingId
    ? await Arquivo.findOne({ where: { id: existingId, usuario_id: usuarioId }, transaction })
    : null;

  if (!arquivo && product.imagem_arquivo_id) {
    arquivo = await Arquivo.findOne({
      where: {
        id: product.imagem_arquivo_id,
        usuario_id: usuarioId,
      },
      transaction,
    });
  }

  const extensionWithDot = getExtensionFromMime(image.mimeType, path.extname(legacyProduct.imagem_chave || '') || '.bin');
  const extension = extensionWithDot.replace('.', '').toLowerCase() || 'bin';
  const fileName = `legacy-${legacyProduct.id.toLowerCase()}${extensionWithDot}`;
  const storageDirectory = buildStorageDirectory(usuarioId, image.mimeType);
  ensureDirectory(storageDirectory);
  const absolutePath = path.join(storageDirectory, fileName);
  fs.writeFileSync(absolutePath, image.buffer);
  const relativePath = toRelativePath(absolutePath);
  const payload = {
    usuario_id: usuarioId,
    nome_original: normalizeText(`${legacyProduct.nome || legacyProduct.id}${extensionWithDot}`, 255) || fileName,
    nome_armazenado: fileName,
    mime_type: image.mimeType,
    extensao: extension,
    tamanho_bytes: image.buffer.length,
    tipo: 'imagem',
    contexto: LEGACY_IMAGE_CONTEXT,
    visibilidade: 'publico',
    caminho_relativo: relativePath,
    metadados: {
      legacy_kind: 'produto_imagem',
      legacy_product_id: legacyProduct.id,
      legacy_storage_key: legacyProduct.imagem_chave || null,
      legacy_image_url: legacyProduct.imagem_url || null,
      legacy_image_hash: legacyProduct.imagem_hash || null,
    },
  };

  if (arquivo) {
    await arquivo.update(payload, { transaction });
  } else {
    arquivo = await Arquivo.create(payload, { transaction });
  }

  await product.update({ imagem_arquivo_id: arquivo.id }, { transaction });
  map.arquivos_produtos[legacyProduct.id] = arquivo.id;
  return arquivo;
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

async function importFiscalAndImages({ exportDir, targetUser, apply, legacyMediaDir }) {
  const profiles = readExportTable(exportDir, 'perfis_fiscais');
  const products = readExportTable(exportDir, 'produtos');
  const map = loadImportMap(exportDir);
  const duplicateProductKeys = getDuplicateProductKeys(products);
  const usedMappedProductIdsByKey = new Map();
  const counters = {
    grupos_fiscais: { inserted: 0, updated: 0 },
    produtos_com_grupo: { updated: 0, skipped: 0 },
    imagens: { imported: 0, updated: 0, skipped_missing_source: 0, skipped_unmapped_product: 0 },
  };
  const warnings = [];

  if (!apply) {
    return {
      applied: false,
      targetUser: targetUser ? { id: targetUser.id, email: targetUser.email } : null,
      sourceCounts: {
        perfis_fiscais: profiles.length,
        produtos_com_perfil: products.filter(product => product.perfil_fiscal_id).length,
        produtos_com_imagem_chave: products.filter(product => product.imagem_chave).length,
        produtos_com_imagem_url: products.filter(product => product.imagem_url).length,
        produtos_com_imagem_dados: products.filter(product => product.imagem_url_dados).length,
      },
      localChecks: {
        legacyMediaDir: legacyMediaDir || null,
        imagens_com_arquivo_local: legacyMediaDir
          ? products.filter(product => getLegacyStorageImage(product, legacyMediaDir)).length
          : 0,
      },
    };
  }

  await sequelize.transaction(async transaction => {
    for (const profile of profiles) {
      const payload = {
        usuario_id: targetUser.id,
        ...buildFiscalPayload(profile),
      };
      let grupo = map.grupos_fiscais[profile.id]
        ? await GrupoFiscal.findOne({ where: { id: map.grupos_fiscais[profile.id], usuario_id: targetUser.id }, transaction })
        : null;

      if (!grupo) {
        grupo = await GrupoFiscal.findOne({
          where: { usuario_id: targetUser.id, nome: payload.nome },
          transaction,
        });
      }

      if (grupo) {
        await grupo.update(payload, { transaction });
        counters.grupos_fiscais.updated += 1;
      } else {
        grupo = await GrupoFiscal.create(payload, { transaction });
        counters.grupos_fiscais.inserted += 1;
      }

      map.grupos_fiscais[profile.id] = grupo.id;
    }

    for (const legacyProduct of products) {
      const mappedProductId = map.produtos[legacyProduct.id];
      const mappedGroupId = legacyProduct.perfil_fiscal_id ? map.grupos_fiscais[legacyProduct.perfil_fiscal_id] : null;

      if (mappedGroupId) {
        const product = mappedProductId
          ? await Produto.findOne({ where: { id: mappedProductId, usuario_id: targetUser.id }, transaction })
          : null;

        if (product) {
          await product.update({ grupo_fiscal_id: mappedGroupId }, { transaction });
          counters.produtos_com_grupo.updated += 1;
        } else {
          counters.produtos_com_grupo.skipped += 1;
        }
      }

      if (!legacyProduct.imagem_url_dados && !legacyProduct.imagem_chave && !legacyProduct.imagem_url) {
        continue;
      }

      let product = mappedProductId
        ? await Produto.findOne({ where: { id: mappedProductId, usuario_id: targetUser.id }, transaction })
        : null;

      if (!product) {
        counters.imagens.skipped_unmapped_product += 1;
        continue;
      }

      const naturalKey = getProductNaturalKey(legacyProduct);
      if (duplicateProductKeys.has(naturalKey)) {
        const usedIds = usedMappedProductIdsByKey.get(naturalKey) || new Set();
        if (usedIds.has(product.id)) {
          counters.imagens.skipped_unmapped_product += 1;
          warnings.push(`Imagem ignorada para produto duplicado sem mapa exclusivo: ${legacyProduct.id}`);
          continue;
        }
        usedIds.add(product.id);
        usedMappedProductIdsByKey.set(naturalKey, usedIds);
      }

      const image = await resolveLegacyImage(legacyProduct, legacyMediaDir);
      if (!image) {
        counters.imagens.skipped_missing_source += 1;
        continue;
      }

      const hadImage = Boolean(product.imagem_arquivo_id || map.arquivos_produtos[legacyProduct.id]);
      await createOrUpdateImage({
        usuarioId: targetUser.id,
        product,
        legacyProduct,
        image,
        map,
        transaction,
      });
      counters.imagens[hadImage ? 'updated' : 'imported'] += 1;
    }
  });

  saveImportMap(exportDir, map);

  return {
    applied: true,
    targetUser: { id: targetUser.id, email: targetUser.email },
    counters,
    warnings,
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

  const targetUser = await resolveTargetUser(args);
  const result = await importFiscalAndImages({
    exportDir: path.resolve(exportDirArg),
    targetUser,
    apply,
    legacyMediaDir: args['legacy-media-dir'] ? path.resolve(args['legacy-media-dir']) : null,
  });
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
