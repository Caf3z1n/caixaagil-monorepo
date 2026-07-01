#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const SOURCE_COMPANY_ID = '01KPPS7VVWPCQTKJ7SAKXHQNX6';

const TABLES = [
  'categorias',
  'categorias_fiscais',
  'perfis_fiscais',
  'produtos',
  'estoques',
  'saldos_estoque',
  'convenios',
  'sessoes_caixa',
  'conferencias_caixa',
  'vendas',
  'movimentacoes_estoque',
  'despesas_caixa',
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
  node export-legacy-caixa-agil.js --output /home/deploy/legacy-caixa-agil-export-YYYYMMDD-HHMMSS

Options:
  --company-id <id>   Source company id. Defaults to PH Service Ltda.
  --output <dir>      Output directory. Defaults to a timestamped directory outside cwd.
  --force             Allow using a non-empty output directory.
  --help              Show this help.

Environment:
  Uses DB_USER, DB_PASSWORD, DB_NAME, DB_HOST and DB_PORT, or the old API src/config/database.js.
`);
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
}

function defaultOutputDir() {
  return path.resolve(process.cwd(), '..', `legacy-caixa-agil-export-${timestamp()}`);
}

function loadDotenvIfAvailable() {
  const dotenvPath = path.resolve(process.cwd(), '.env');

  if (fs.existsSync(dotenvPath)) {
    try {
      require('dotenv').config({ path: dotenvPath, quiet: true });
    } catch (_) {
      require('dotenv').config({ path: dotenvPath });
    }
  }
}

function loadDatabaseConfig() {
  loadDotenvIfAvailable();

  const nodeEnv = process.env.NODE_ENV || 'development';
  const configPath = path.resolve(process.cwd(), 'src', 'config', 'database.js');

  if (fs.existsSync(configPath)) {
    const config = require(configPath)[nodeEnv];

    if (config?.database && config?.username) {
      return {
        user: config.username,
        password: config.password,
        database: config.database,
        host: config.host || '127.0.0.1',
        port: Number(config.port || 5432),
      };
    }
  }

  return {
    user: process.env.DB_USER || process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || process.env.POSTGRES_DB || 'caixa_agil',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
  };
}

function ensureOutputDir(outputDir, force) {
  fs.mkdirSync(outputDir, { recursive: true });

  const existing = fs.readdirSync(outputDir);
  if (existing.length > 0 && !force) {
    throw new Error(`Output directory is not empty: ${outputDir}. Use --force only if this is intentional.`);
  }
}

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
          FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
      ) AS exists
    `,
    [tableName, columnName]
  );

  return Boolean(result.rows[0]?.exists);
}

async function exportTable(client, tableName, companyId, outputDir) {
  if (!(await tableExists(client, tableName))) {
    return {
      table: tableName,
      skipped: true,
      reason: 'missing_table',
      rowCount: 0,
    };
  }

  if (!(await columnExists(client, tableName, 'empresa_id'))) {
    return {
      table: tableName,
      skipped: true,
      reason: 'missing_empresa_id',
      rowCount: 0,
    };
  }

  const result = await client.query(`SELECT * FROM "${tableName}" WHERE empresa_id = $1 ORDER BY id`, [companyId]);
  const payload = {
    table: tableName,
    sourceCompanyId: companyId,
    exportedAt: new Date().toISOString(),
    rowCount: result.rowCount,
    rows: result.rows,
  };
  const fileName = `${tableName}.json`;
  const filePath = path.join(outputDir, fileName);
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;

  fs.writeFileSync(filePath, serialized, 'utf8');

  return {
    table: tableName,
    skipped: false,
    rowCount: result.rowCount,
    fileName,
    bytes: Buffer.byteLength(serialized),
    sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
  };
}

async function exportCompany(client, companyId, outputDir) {
  if (!(await tableExists(client, 'empresas'))) {
    return null;
  }

  const result = await client.query('SELECT * FROM empresas WHERE id = $1 LIMIT 1', [companyId]);
  const payload = {
    table: 'empresas',
    sourceCompanyId: companyId,
    exportedAt: new Date().toISOString(),
    rowCount: result.rowCount,
    rows: result.rows,
  };
  const filePath = path.join(outputDir, 'empresas.json');
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(filePath, serialized, 'utf8');

  return {
    table: 'empresas',
    rowCount: result.rowCount,
    fileName: 'empresas.json',
    bytes: Buffer.byteLength(serialized),
    sha256: crypto.createHash('sha256').update(serialized).digest('hex'),
  };
}

async function getConvenioSummary(client, companyId) {
  if (!(await tableExists(client, 'vendas'))) {
    return null;
  }

  const result = await client.query(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE convenio_id IS NOT NULL
            AND COALESCE(LOWER(situacao), '') NOT IN ('cancelada', 'cancelled', 'canceled')
            AND (
              recebido_em IS NULL
              AND COALESCE(LOWER(situacao_recebimento), '') NOT IN ('recebido', 'recebido_caixa', 'pago', 'paid')
            )
        )::integer AS pendentes,
        COUNT(*) FILTER (
          WHERE convenio_id IS NOT NULL
            AND COALESCE(LOWER(situacao), '') NOT IN ('cancelada', 'cancelled', 'canceled')
            AND (
              recebido_em IS NOT NULL
              OR COALESCE(LOWER(situacao_recebimento), '') IN ('recebido', 'recebido_caixa', 'pago', 'paid')
            )
        )::integer AS pagos
      FROM vendas
      WHERE empresa_id = $1
    `,
    [companyId]
  );

  return result.rows[0] || null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const companyId = args['company-id'] || SOURCE_COMPANY_ID;
  const outputDir = path.resolve(args.output || args._[0] || defaultOutputDir());

  ensureOutputDir(outputDir, Boolean(args.force));

  const client = new Client(loadDatabaseConfig());
  await client.connect();

  try {
    const files = [];
    const companyFile = await exportCompany(client, companyId, outputDir);

    if (companyFile) {
      files.push(companyFile);
    }

    for (const table of TABLES) {
      files.push(await exportTable(client, table, companyId, outputDir));
    }

    const convenioSummary = await getConvenioSummary(client, companyId);
    const manifest = {
      kind: 'caixa-agil-legacy-export',
      sourceCompanyId: companyId,
      generatedAt: new Date().toISOString(),
      outputDir,
      files,
      rowCounts: Object.fromEntries(files.map(file => [file.table, file.rowCount || 0])),
      convenioSummary,
    };
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    fs.writeFileSync(path.join(outputDir, 'manifest.json'), manifestText, 'utf8');

    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    await client.end();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
