const fs = require("node:fs");
const path = require("node:path");
const initSqlJs = require("sql.js");

function createLocalPdvStore(app) {
  const dbDirectory = path.join(app.getPath("userData"), "data");
  const dbPath = path.join(dbDirectory, "caixa-agil-pdv.sqlite");
  const wasmDirectory = path.join(__dirname, "..", "node_modules", "sql.js", "dist");
  let databasePromise = null;
  let writeQueue = Promise.resolve();

  async function getDatabase() {
    if (!databasePromise) {
      databasePromise = (async () => {
        fs.mkdirSync(dbDirectory, { recursive: true });

        const SQL = await initSqlJs({
          locateFile: (file) => path.join(wasmDirectory, file)
        });
        const fileBuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;
        const database = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();

        migrate(database);
        persist(database);

        return database;
      })();
    }

    return databasePromise;
  }

  function migrate(database) {
    database.run(`
      CREATE TABLE IF NOT EXISTS pdv_state (
        scope TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pdv_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_error TEXT
      );

      CREATE INDEX IF NOT EXISTS sync_outbox_scope_status_idx
        ON sync_outbox (scope, status, created_at);

      CREATE TABLE IF NOT EXISTS fiscal_documents (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        venda_id TEXT,
        command TEXT NOT NULL,
        ambiente TEXT,
        modelo TEXT,
        serie INTEGER,
        numero INTEGER,
        chave TEXT,
        status TEXT NOT NULL,
        codigo_retorno_sefaz TEXT,
        mensagem_sefaz TEXT,
        mensagem_operador TEXT,
        mensagem_tecnica TEXT,
        protocolo TEXT,
        xml_enviado_path TEXT,
        xml_autorizado_path TEXT,
        pdf_path TEXT,
        impressao_status TEXT,
        raw_result TEXT,
        log_path TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        sync_attempts INTEGER NOT NULL DEFAULT 0,
        sync_error TEXT,
        synced_at TEXT,
        api_nf_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS fiscal_documents_scope_status_idx
        ON fiscal_documents (scope, status, updated_at);

      CREATE INDEX IF NOT EXISTS fiscal_documents_scope_venda_idx
        ON fiscal_documents (scope, venda_id, updated_at);

      CREATE INDEX IF NOT EXISTS fiscal_documents_scope_chave_idx
        ON fiscal_documents (scope, chave);
    `);

    ensureTableColumn(database, "fiscal_documents", "sync_status", "TEXT NOT NULL DEFAULT 'pending'");
    ensureTableColumn(database, "fiscal_documents", "sync_attempts", "INTEGER NOT NULL DEFAULT 0");
    ensureTableColumn(database, "fiscal_documents", "sync_error", "TEXT");
    ensureTableColumn(database, "fiscal_documents", "synced_at", "TEXT");
    ensureTableColumn(database, "fiscal_documents", "api_nf_id", "TEXT");

    database.run(`
      CREATE INDEX IF NOT EXISTS fiscal_documents_scope_sync_idx
        ON fiscal_documents (scope, sync_status, updated_at);

      CREATE INDEX IF NOT EXISTS fiscal_documents_scope_number_idx
        ON fiscal_documents (scope, ambiente, modelo, serie, numero);
    `);
  }

  function ensureTableColumn(database, tableName, columnName, definition) {
    const columns = getAll(database, `PRAGMA table_info(${tableName})`);
    const exists = columns.some((column) => column.name === columnName);

    if (!exists) {
      database.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  function persist(database) {
    const exported = database.export();
    const temporaryPath = `${dbPath}.${process.pid}.tmp`;

    fs.writeFileSync(temporaryPath, Buffer.from(exported));
    fs.renameSync(temporaryPath, dbPath);
  }

  function withWrite(work) {
    writeQueue = writeQueue.then(async () => {
      const database = await getDatabase();
      const result = await work(database);

      persist(database);

      return result;
    });

    return writeQueue;
  }

  async function withRead(work) {
    const database = await getDatabase();
    return work(database);
  }

  function getOne(database, sql, params = []) {
    const statement = database.prepare(sql);

    try {
      statement.bind(params);

      if (!statement.step()) {
        return null;
      }

      return statement.getAsObject();
    } finally {
      statement.free();
    }
  }

  function getAll(database, sql, params = []) {
    const statement = database.prepare(sql);
    const rows = [];

    try {
      statement.bind(params);

      while (statement.step()) {
        rows.push(statement.getAsObject());
      }

      return rows;
    } finally {
      statement.free();
    }
  }

  function createId(prefix) {
    if (globalThis.crypto?.randomUUID) {
      return `${prefix}-${globalThis.crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function hashText(value) {
    let primaryHash = 2166136261;
    let secondaryHash = 2166136261 ^ value.length;

    for (let index = 0; index < value.length; index += 1) {
      const charCode = value.charCodeAt(index);
      primaryHash ^= charCode;
      primaryHash = Math.imul(primaryHash, 16777619);
      secondaryHash ^= charCode + index;
      secondaryHash = Math.imul(secondaryHash, 16777619);
    }

    return `${(primaryHash >>> 0).toString(36).padStart(7, "0")}${(secondaryHash >>> 0).toString(36).padStart(7, "0")}`;
  }

  function normalizeEventId(value, prefix) {
    const rawValue = typeof value === "string" ? value.trim() : "";
    const eventId = rawValue || createId(prefix);

    if (eventId.length <= 64) {
      return eventId;
    }

    const digest = hashText(eventId).slice(0, 12);
    return `${eventId.slice(0, 63 - digest.length)}-${digest}`;
  }

  async function loadState({ scope }) {
    return withRead((database) => {
      const row = getOne(database, "SELECT value FROM pdv_state WHERE scope = ?", [scope]);

      if (!row?.value) {
        return null;
      }

      return JSON.parse(row.value);
    });
  }

  async function saveState({ scope, state }) {
    return withWrite((database) => {
      const updatedAt = new Date().toISOString();

      database.run(
        `
          INSERT INTO pdv_state (scope, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(scope) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
        [scope, JSON.stringify(state), updatedAt]
      );

      return { ok: true, updatedAt };
    });
  }

  async function clearState({ scope }) {
    return withWrite((database) => {
      database.run("DELETE FROM pdv_state WHERE scope = ?", [scope]);

      return { ok: true };
    });
  }

  async function getSyncSummary({ scope }) {
    return withRead((database) => {
      const eventsRow = getOne(
        database,
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
          FROM sync_outbox
          WHERE scope = ?
        `,
        [scope]
      );
      const fiscalRow = getOne(
        database,
        `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END) AS failed
          FROM fiscal_documents
          WHERE scope = ?
        `,
        [scope]
      );
      const syncedEventRow = getOne(
        database,
        `
          SELECT updated_at
          FROM sync_outbox
          WHERE scope = ? AND status = 'synced'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [scope]
      );
      const syncedFiscalRow = getOne(
        database,
        `
          SELECT synced_at AS updated_at
          FROM fiscal_documents
          WHERE scope = ? AND sync_status = 'synced' AND synced_at IS NOT NULL
          ORDER BY synced_at DESC
          LIMIT 1
        `,
        [scope]
      );
      const failedEventRow = getOne(
        database,
        `
          SELECT updated_at, last_error
          FROM sync_outbox
          WHERE scope = ? AND status = 'failed'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [scope]
      );
      const failedFiscalRow = getOne(
        database,
        `
          SELECT updated_at, sync_error AS last_error
          FROM fiscal_documents
          WHERE scope = ? AND sync_status = 'failed'
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [scope]
      );
      const lastSyncedAt = [syncedEventRow?.updated_at, syncedFiscalRow?.updated_at]
        .filter(Boolean)
        .map(String)
        .sort()
        .at(-1) || null;
      const failedCandidates = [failedEventRow, failedFiscalRow]
        .filter(Boolean)
        .sort((first, second) => String(second.updated_at || "").localeCompare(String(first.updated_at || "")));
      const failedRow = failedCandidates[0] || null;

      return {
        total: Number(eventsRow?.total ?? 0) + Number(fiscalRow?.total ?? 0),
        pending: Number(eventsRow?.pending ?? 0) + Number(fiscalRow?.pending ?? 0),
        failed: Number(eventsRow?.failed ?? 0) + Number(fiscalRow?.failed ?? 0),
        lastSyncedAt,
        lastFailedAt: failedRow?.updated_at ? String(failedRow.updated_at) : null,
        lastError: failedRow?.last_error ? String(failedRow.last_error) : null
      };
    });
  }

  async function getPendingEvents({ scope, limit = 100 }) {
    return withRead((database) => {
      const rows = getAll(
        database,
        `
          SELECT
            id,
            event_type,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload,
            attempts,
            created_at,
            updated_at,
            last_error
          FROM sync_outbox
          WHERE scope = ? AND status = 'pending'
          ORDER BY created_at ASC
          LIMIT ?
        `,
        [scope, Math.min(Math.max(Number(limit) || 100, 1), 250)]
      );

      return rows.map((row) => ({
        id: row.id,
        event_type: row.event_type,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        idempotency_key: row.idempotency_key,
        payload: row.payload ? JSON.parse(row.payload) : {},
        attempts: Number(row.attempts || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_error: row.last_error || null
      }));
    });
  }

  async function markEventsSynced({ scope, eventIds }) {
    return withWrite((database) => {
      const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
      const updatedAt = new Date().toISOString();

      if (ids.length === 0) {
        return { ok: true, updated: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      database.run(
        `
          UPDATE sync_outbox
          SET status = 'synced',
            updated_at = ?,
            last_error = NULL
          WHERE scope = ? AND id IN (${placeholders})
        `,
        [updatedAt, scope, ...ids]
      );

      return { ok: true, updated: ids.length };
    });
  }

  async function markEventsFailed({ scope, eventIds, error }) {
    return withWrite((database) => {
      const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
      const updatedAt = new Date().toISOString();

      if (ids.length === 0) {
        return { ok: true, updated: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      database.run(
        `
          UPDATE sync_outbox
          SET status = 'failed',
            attempts = attempts + 1,
            updated_at = ?,
            last_error = ?
          WHERE scope = ? AND id IN (${placeholders})
        `,
        [updatedAt, String(error || "Falha ao sincronizar evento."), scope, ...ids]
      );

      return { ok: true, updated: ids.length };
    });
  }

  async function ignoreEvents({ scope, eventIds }) {
    return withWrite((database) => {
      const ids = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
      const updatedAt = new Date().toISOString();

      if (ids.length === 0) {
        return { ok: true, updated: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      const countRow = getOne(
        database,
        `
          SELECT COUNT(*) AS total
          FROM sync_outbox
          WHERE scope = ? AND status = 'failed' AND id IN (${placeholders})
        `,
        [scope, ...ids]
      );
      const updated = Number(countRow?.total ?? 0);

      if (updated === 0) {
        return { ok: true, updated: 0 };
      }

      database.run(
        `
          UPDATE sync_outbox
          SET status = 'ignored',
            updated_at = ?,
            last_error = COALESCE(last_error, 'Ignorado pelo operador.')
          WHERE scope = ? AND status = 'failed' AND id IN (${placeholders})
        `,
        [updatedAt, scope, ...ids]
      );

      return { ok: true, updated };
    });
  }

  async function getFailedEvents({ scope, limit = 10 }) {
    return withRead((database) => {
      const rows = getAll(
        database,
        `
          SELECT
            id,
            event_type,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload,
            attempts,
            created_at,
            updated_at,
            last_error
          FROM sync_outbox
          WHERE scope = ? AND status = 'failed'
          ORDER BY updated_at DESC
          LIMIT ?
        `,
        [scope, Math.min(Math.max(Number(limit) || 10, 1), 50)]
      );

      return rows.map((row) => ({
        id: row.id,
        event_type: row.event_type,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_id,
        idempotency_key: row.idempotency_key,
        payload: row.payload ? JSON.parse(row.payload) : {},
        attempts: Number(row.attempts || 0),
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_error: row.last_error || null
      }));
    });
  }

  async function retryFailedEvents({ scope }) {
    return withWrite((database) => {
      const updatedAt = new Date().toISOString();

      database.run(
        `
          UPDATE sync_outbox
          SET status = 'pending',
            updated_at = ?,
            last_error = NULL
          WHERE scope = ? AND status = 'failed'
        `,
        [updatedAt, scope]
      );
      database.run(
        `
          UPDATE fiscal_documents
          SET sync_status = 'pending',
            updated_at = ?,
            sync_error = NULL
          WHERE scope = ? AND sync_status = 'failed'
        `,
        [updatedAt, scope]
      );

      const summaryRow = getOne(
        database,
        `
          SELECT
            (SELECT COUNT(*) FROM sync_outbox WHERE scope = ? AND status = 'pending') +
            (SELECT COUNT(*) FROM fiscal_documents WHERE scope = ? AND sync_status = 'pending') AS pending
        `,
        [scope, scope]
      );

      return {
        ok: true,
        pending: Number(summaryRow?.pending ?? 0)
      };
    });
  }

  async function getPendingFiscalDocuments({ scope, limit = 100 }) {
    return withRead((database) => {
      const rows = getAll(
        database,
        `
          SELECT *
          FROM fiscal_documents
          WHERE scope = ? AND sync_status = 'pending'
          ORDER BY updated_at ASC
          LIMIT ?
        `,
        [scope, Math.min(Math.max(Number(limit) || 100, 1), 250)]
      );

      return rows.map(enrichFiscalDocumentForSync);
    });
  }

  async function getFailedFiscalDocuments({ scope, limit = 10 }) {
    return withRead((database) => {
      const rows = getAll(
        database,
        `
          SELECT *
          FROM fiscal_documents
          WHERE scope = ? AND sync_status = 'failed'
          ORDER BY updated_at DESC
          LIMIT ?
        `,
        [scope, Math.min(Math.max(Number(limit) || 10, 1), 50)]
      );

      return rows.map((row) => ({
        ...row,
        raw_result: row.raw_result ? JSON.parse(row.raw_result) : {}
      }));
    });
  }

  async function markFiscalDocumentsSynced({ scope, documents, documentIds }) {
    return withWrite((database) => {
      const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : [];
      const documentRows = Array.isArray(documents) ? documents.filter(document => document?.id) : [];
      const updatedAt = new Date().toISOString();
      let updated = 0;

      for (const document of documentRows) {
        database.run(
          `
            UPDATE fiscal_documents
            SET sync_status = 'synced',
              synced_at = ?,
              updated_at = ?,
              sync_error = NULL,
              api_nf_id = COALESCE(?, api_nf_id)
            WHERE scope = ? AND id = ?
          `,
          [updatedAt, updatedAt, normalizeOptionalString(document.api_nf_id || document.apiNfId), scope, document.id]
        );
        updated += 1;
      }

      const handledIds = new Set(documentRows.map(document => document.id));
      const remainingIds = ids.filter(id => !handledIds.has(id));

      if (remainingIds.length > 0) {
        const placeholders = remainingIds.map(() => "?").join(", ");
        database.run(
          `
            UPDATE fiscal_documents
            SET sync_status = 'synced',
              synced_at = ?,
              updated_at = ?,
              sync_error = NULL
            WHERE scope = ? AND id IN (${placeholders})
          `,
          [updatedAt, updatedAt, scope, ...remainingIds]
        );
        updated += remainingIds.length;
      }

      return { ok: true, updated };
    });
  }

  async function markFiscalDocumentsFailed({ scope, documentIds, error }) {
    return withWrite((database) => {
      const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : [];
      const updatedAt = new Date().toISOString();

      if (ids.length === 0) {
        return { ok: true, updated: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      database.run(
        `
          UPDATE fiscal_documents
          SET sync_status = 'failed',
            sync_attempts = sync_attempts + 1,
            updated_at = ?,
            sync_error = ?
          WHERE scope = ? AND id IN (${placeholders})
        `,
        [updatedAt, String(error || "Falha ao sincronizar documento fiscal."), scope, ...ids]
      );

      return { ok: true, updated: ids.length };
    });
  }

  async function ignoreFiscalDocuments({ scope, documentIds }) {
    return withWrite((database) => {
      const ids = Array.isArray(documentIds) ? documentIds.filter(Boolean) : [];
      const updatedAt = new Date().toISOString();

      if (ids.length === 0) {
        return { ok: true, updated: 0 };
      }

      const placeholders = ids.map(() => "?").join(", ");
      const countRow = getOne(
        database,
        `
          SELECT COUNT(*) AS total
          FROM fiscal_documents
          WHERE scope = ? AND sync_status = 'failed' AND id IN (${placeholders})
        `,
        [scope, ...ids]
      );
      const updated = Number(countRow?.total ?? 0);

      if (updated === 0) {
        return { ok: true, updated: 0 };
      }

      database.run(
        `
          UPDATE fiscal_documents
          SET sync_status = 'ignored',
            updated_at = ?,
            sync_error = COALESCE(sync_error, 'Ignorado pelo operador.')
          WHERE scope = ? AND sync_status = 'failed' AND id IN (${placeholders})
        `,
        [updatedAt, scope, ...ids]
      );

      return { ok: true, updated };
    });
  }

  async function enqueueEvent({ scope, eventType, aggregateType, aggregateId, payload }) {
    return withWrite((database) => {
      const createdAt = new Date().toISOString();
      const id = normalizeEventId(payload?.eventId, "evento");
      const idempotencyKey = `${scope}:${eventType}:${aggregateId}:${id}`;
      const eventPayload = {
        ...payload,
        eventId: id,
        localScope: scope,
        createdAt
      };

      database.run(
        `
          INSERT OR IGNORE INTO sync_outbox (
            id,
            scope,
            event_type,
            aggregate_type,
            aggregate_id,
            idempotency_key,
            payload,
            status,
            attempts,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
        `,
        [
          id,
          scope,
          eventType,
          aggregateType,
          aggregateId,
          idempotencyKey,
          JSON.stringify(eventPayload),
          createdAt,
          createdAt
        ]
      );

      const summaryRow = getOne(
        database,
        `
          SELECT
            (SELECT COUNT(*) FROM sync_outbox WHERE scope = ? AND status = 'pending') +
            (SELECT COUNT(*) FROM fiscal_documents WHERE scope = ? AND sync_status = 'pending') AS pending
        `,
        [scope, scope]
      );

      return {
        ok: true,
        eventId: id,
        idempotencyKey,
        pending: Number(summaryRow?.pending ?? 0)
      };
    });
  }

  async function getShiftPreview({ scope, dateKey }) {
    return withRead((database) => {
      const key = `shift-sequence:${scope}:${dateKey}`;
      const row = getOne(database, "SELECT value FROM pdv_metadata WHERE key = ?", [key]);
      const lastShiftNumber = row?.value ? Number.parseInt(String(row.value), 10) || 0 : 0;

      return { shiftNumber: lastShiftNumber + 1 };
    });
  }

  async function reserveShiftNumber({ scope, dateKey }) {
    return withWrite((database) => {
      const key = `shift-sequence:${scope}:${dateKey}`;
      const row = getOne(database, "SELECT value FROM pdv_metadata WHERE key = ?", [key]);
      const lastShiftNumber = row?.value ? Number.parseInt(String(row.value), 10) || 0 : 0;
      const shiftNumber = lastShiftNumber + 1;
      const updatedAt = new Date().toISOString();

      database.run(
        `
          INSERT INTO pdv_metadata (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
        [key, String(shiftNumber), updatedAt]
      );

      return { shiftNumber };
    });
  }

  async function getFiscalConfig({ scope }) {
    return withRead((database) => {
      const key = `fiscal-config:${scope}`;
      const row = getOne(database, "SELECT value FROM pdv_metadata WHERE key = ?", [key]);

      if (!row?.value) {
        return null;
      }

      return JSON.parse(row.value);
    });
  }

  async function saveFiscalConfig({ scope, config }) {
    return withWrite((database) => {
      const key = `fiscal-config:${scope}`;
      const updatedAt = new Date().toISOString();

      database.run(
        `
          INSERT INTO pdv_metadata (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
        [key, JSON.stringify(config || {}), updatedAt]
      );

      return { ok: true, updatedAt, config: config || {} };
    });
  }

  function normalizeOptionalString(value) {
    const normalized = value === null || value === undefined ? "" : String(value).trim();
    return normalized || null;
  }

  const maxFiscalXmlSyncBytes = 8 * 1024 * 1024;

  function readFiscalXmlContent(filePath) {
    const normalizedPath = normalizeOptionalString(filePath);

    if (!normalizedPath) {
      return null;
    }

    try {
      const stats = fs.statSync(normalizedPath);

      if (!stats.isFile() || stats.size > maxFiscalXmlSyncBytes) {
        return null;
      }

      return normalizeOptionalString(fs.readFileSync(normalizedPath, "utf8"));
    } catch {
      return null;
    }
  }

  function parseFiscalRawResult(rawResult) {
    if (!rawResult) {
      return {};
    }

    try {
      return JSON.parse(rawResult);
    } catch {
      return {};
    }
  }

  function enrichFiscalDocumentForSync(row) {
    const rawResult = parseFiscalRawResult(row.raw_result);
    const data = rawResult?.data && typeof rawResult.data === "object" ? rawResult.data : {};
    const xmlAutorizadoConteudo = normalizeOptionalString(data.xmlProc) ||
      readFiscalXmlContent(row.xml_autorizado_path || data.xmlAutorizadoPath);
    const xmlEnviadoConteudo = readFiscalXmlContent(
      data.xmlAssinadoPath ||
        data.xmlEnviadoPath ||
        row.xml_enviado_path ||
        data.xmlPath
    );

    return {
      ...row,
      raw_result: rawResult,
      xml_autorizado_conteudo: xmlAutorizadoConteudo,
      xml_enviado_conteudo: xmlEnviadoConteudo
    };
  }

  function normalizeOptionalInteger(value) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return null;
    }

    return Math.floor(parsed);
  }

  async function recordFiscalDocument({ scope, document }) {
    return withWrite((database) => {
      const updatedAt = new Date().toISOString();
      const createdAt = normalizeOptionalString(document?.created_at || document?.createdAt) || updatedAt;
      const command = normalizeOptionalString(document?.command);
      const vendaId = normalizeOptionalString(document?.venda_id || document?.vendaId);
      const ambiente = normalizeOptionalString(document?.ambiente);
      const modelo = normalizeOptionalString(document?.modelo);
      const serie = normalizeOptionalInteger(document?.serie);
      const numero = normalizeOptionalInteger(document?.numero);
      const chave = normalizeOptionalString(document?.chave);
      const status = normalizeOptionalString(document?.status) || "registrado";
      const codigoRetornoSefaz = normalizeOptionalString(document?.codigo_retorno_sefaz || document?.codigoRetornoSefaz);
      const mensagemSefaz = normalizeOptionalString(document?.mensagem_sefaz || document?.mensagemSefaz);
      const mensagemOperador = normalizeOptionalString(document?.mensagem_operador || document?.mensagemOperador);
      const mensagemTecnica = normalizeOptionalString(document?.mensagem_tecnica || document?.mensagemTecnica);
      const protocolo = normalizeOptionalString(document?.protocolo);
      const xmlEnviadoPath = normalizeOptionalString(document?.xml_enviado_path || document?.xmlEnviadoPath);
      const xmlAutorizadoPath = normalizeOptionalString(document?.xml_autorizado_path || document?.xmlAutorizadoPath);
      const pdfPath = normalizeOptionalString(document?.pdf_path || document?.pdfPath);
      const impressaoStatus = normalizeOptionalString(document?.impressao_status || document?.impressaoStatus);
      const rawResult = JSON.stringify(document?.raw_result || document?.rawResult || {});
      const logPath = normalizeOptionalString(document?.log_path || document?.logPath);
      let documentId = normalizeOptionalString(document?.id) || createId("documento-fiscal");
      const canReuseFiscalRow = command &&
        command.startsWith("emitir-") &&
        vendaId &&
        modelo &&
        serie &&
        numero &&
        status &&
        codigoRetornoSefaz;

      if (canReuseFiscalRow) {
        const existingEquivalent = getOne(
          database,
          `
            SELECT id
            FROM fiscal_documents
            WHERE scope = ?
              AND venda_id = ?
              AND modelo = ?
              AND serie = ?
              AND numero = ?
              AND status = ?
              AND codigo_retorno_sefaz = ?
              AND COALESCE(chave, '') = COALESCE(?, '')
            ORDER BY updated_at DESC
            LIMIT 1
          `,
          [scope, vendaId, modelo, serie, numero, status, codigoRetornoSefaz, chave]
        );

        if (existingEquivalent?.id) {
          documentId = String(existingEquivalent.id);
        }
      }

      database.run(
        `
          INSERT INTO fiscal_documents (
            id,
            scope,
            venda_id,
            command,
            ambiente,
            modelo,
            serie,
            numero,
            chave,
            status,
            codigo_retorno_sefaz,
            mensagem_sefaz,
            mensagem_operador,
            mensagem_tecnica,
            protocolo,
            xml_enviado_path,
            xml_autorizado_path,
            pdf_path,
            impressao_status,
            raw_result,
            log_path,
            sync_status,
            sync_attempts,
            sync_error,
            synced_at,
            api_nf_id,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            venda_id = COALESCE(excluded.venda_id, fiscal_documents.venda_id),
            command = CASE
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe', 'transmitir-nfce-contingencia', 'transmitir-nfe-contingencia') THEN fiscal_documents.command
              ELSE excluded.command
            END,
            ambiente = COALESCE(excluded.ambiente, fiscal_documents.ambiente),
            modelo = COALESCE(excluded.modelo, fiscal_documents.modelo),
            serie = COALESCE(excluded.serie, fiscal_documents.serie),
            numero = COALESCE(excluded.numero, fiscal_documents.numero),
            chave = COALESCE(excluded.chave, fiscal_documents.chave),
            status = CASE
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe') THEN fiscal_documents.status
              ELSE excluded.status
            END,
            codigo_retorno_sefaz = COALESCE(excluded.codigo_retorno_sefaz, fiscal_documents.codigo_retorno_sefaz),
            mensagem_sefaz = COALESCE(excluded.mensagem_sefaz, fiscal_documents.mensagem_sefaz),
            mensagem_operador = COALESCE(excluded.mensagem_operador, fiscal_documents.mensagem_operador),
            mensagem_tecnica = COALESCE(excluded.mensagem_tecnica, fiscal_documents.mensagem_tecnica),
            protocolo = COALESCE(excluded.protocolo, fiscal_documents.protocolo),
            xml_enviado_path = COALESCE(excluded.xml_enviado_path, fiscal_documents.xml_enviado_path),
            xml_autorizado_path = COALESCE(excluded.xml_autorizado_path, fiscal_documents.xml_autorizado_path),
            pdf_path = COALESCE(excluded.pdf_path, fiscal_documents.pdf_path),
            impressao_status = excluded.impressao_status,
            raw_result = CASE
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe') THEN fiscal_documents.raw_result
              ELSE excluded.raw_result
            END,
            log_path = COALESCE(excluded.log_path, fiscal_documents.log_path),
            sync_status = CASE
              WHEN fiscal_documents.sync_status = 'ignored' THEN fiscal_documents.sync_status
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe') THEN fiscal_documents.sync_status
              ELSE 'pending'
            END,
            sync_error = CASE
              WHEN fiscal_documents.sync_status = 'ignored' THEN fiscal_documents.sync_error
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe') THEN fiscal_documents.sync_error
              ELSE NULL
            END,
            synced_at = CASE
              WHEN fiscal_documents.sync_status = 'ignored' THEN fiscal_documents.synced_at
              WHEN excluded.command IN ('imprimir-danfe', 'reimprimir-danfe') THEN fiscal_documents.synced_at
              ELSE NULL
            END,
            updated_at = excluded.updated_at
        `,
        [
          documentId,
          scope,
          vendaId,
          command,
          ambiente,
          modelo,
          serie,
          numero,
          chave,
          status,
          codigoRetornoSefaz,
          mensagemSefaz,
          mensagemOperador,
          mensagemTecnica,
          protocolo,
          xmlEnviadoPath,
          xmlAutorizadoPath,
          pdfPath,
          impressaoStatus,
          rawResult,
          logPath,
          createdAt,
          updatedAt
        ]
      );

      return { ok: true, id: documentId, updatedAt };
    });
  }

  async function getFiscalNumberGuard({ scope, ambiente, modelo, serie } = {}) {
    return withRead((database) => {
      const normalizedScope = normalizeOptionalString(scope);
      const normalizedAmbiente = normalizeOptionalString(ambiente);
      const normalizedModelo = normalizeOptionalString(modelo);
      const normalizedSerie = normalizeOptionalInteger(serie);

      if (!normalizedScope || !normalizedModelo || !normalizedSerie) {
        return {
          maxNumero: null,
          nextNumero: null,
          ambiente: normalizedAmbiente,
          modelo: normalizedModelo,
          serie: normalizedSerie
        };
      }

      const where = [
        "scope = ?",
        "modelo = ?",
        "serie = ?",
        "numero IS NOT NULL",
        "numero > 0",
        "command IN ('emitir-nfce', 'emitir-nfce-contingencia', 'transmitir-nfce-contingencia', 'emitir-nfe', 'emitir-nfe-contingencia', 'transmitir-nfe-contingencia', 'registrar-pendente')"
      ];
      const params = [normalizedScope, normalizedModelo, normalizedSerie];

      if (normalizedAmbiente) {
        where.push("(ambiente = ? OR ambiente IS NULL OR ambiente = '')");
        params.push(normalizedAmbiente);
      }

      const row = getOne(
        database,
        `
          SELECT MAX(numero) AS max_numero
          FROM fiscal_documents
          WHERE ${where.join(" AND ")}
        `,
        params
      );
      const maxNumero = normalizeOptionalInteger(row?.max_numero);

      return {
        maxNumero,
        nextNumero: maxNumero ? maxNumero + 1 : null,
        ambiente: normalizedAmbiente,
        modelo: normalizedModelo,
        serie: normalizedSerie
      };
    });
  }

  async function listFiscalDocuments({ scope, limit = 100, vendaId, chave, status } = {}) {
    return withRead((database) => {
      const where = ["scope = ?"];
      const params = [scope];
      const normalizedVendaId = normalizeOptionalString(vendaId);
      const normalizedChave = normalizeOptionalString(chave);
      const normalizedStatus = normalizeOptionalString(status);

      if (normalizedVendaId) {
        where.push("venda_id = ?");
        params.push(normalizedVendaId);
      }

      if (normalizedChave) {
        where.push("chave = ?");
        params.push(normalizedChave);
      }

      if (normalizedStatus) {
        where.push("status = ?");
        params.push(normalizedStatus);
      }

      const rows = getAll(
        database,
        `
          SELECT *
          FROM fiscal_documents
          WHERE ${where.join(" AND ")}
          ORDER BY updated_at DESC
          LIMIT ?
        `,
        [...params, Math.min(Math.max(Number(limit) || 100, 1), 250)]
      );

      return rows.map((row) => ({
        ...row,
        raw_result: row.raw_result ? JSON.parse(row.raw_result) : {}
      }));
    });
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("pdv-store:load-state", (_event, payload) => loadState(payload));
    ipcMain.handle("pdv-store:save-state", (_event, payload) => saveState(payload));
    ipcMain.handle("pdv-store:clear-state", (_event, payload) => clearState(payload));
    ipcMain.handle("pdv-store:enqueue-event", (_event, payload) => enqueueEvent(payload));
    ipcMain.handle("pdv-store:get-sync-summary", (_event, payload) => getSyncSummary(payload));
    ipcMain.handle("pdv-store:get-pending-events", (_event, payload) => getPendingEvents(payload));
    ipcMain.handle("pdv-store:mark-events-synced", (_event, payload) => markEventsSynced(payload));
    ipcMain.handle("pdv-store:mark-events-failed", (_event, payload) => markEventsFailed(payload));
    ipcMain.handle("pdv-store:ignore-events", (_event, payload) => ignoreEvents(payload));
    ipcMain.handle("pdv-store:get-failed-events", (_event, payload) => getFailedEvents(payload));
    ipcMain.handle("pdv-store:retry-failed-events", (_event, payload) => retryFailedEvents(payload));
    ipcMain.handle("pdv-store:get-pending-fiscal-documents", (_event, payload) => getPendingFiscalDocuments(payload));
    ipcMain.handle("pdv-store:get-failed-fiscal-documents", (_event, payload) => getFailedFiscalDocuments(payload));
    ipcMain.handle("pdv-store:mark-fiscal-documents-synced", (_event, payload) => markFiscalDocumentsSynced(payload));
    ipcMain.handle("pdv-store:mark-fiscal-documents-failed", (_event, payload) => markFiscalDocumentsFailed(payload));
    ipcMain.handle("pdv-store:ignore-fiscal-documents", (_event, payload) => ignoreFiscalDocuments(payload));
    ipcMain.handle("pdv-store:get-shift-preview", (_event, payload) => getShiftPreview(payload));
    ipcMain.handle("pdv-store:reserve-shift-number", (_event, payload) => reserveShiftNumber(payload));
    ipcMain.handle("pdv-store:get-fiscal-config", (_event, payload) => getFiscalConfig(payload));
    ipcMain.handle("pdv-store:save-fiscal-config", (_event, payload) => saveFiscalConfig(payload));
    ipcMain.handle("pdv-store:list-fiscal-documents", (_event, payload) => listFiscalDocuments(payload));
  }

  return {
    registerIpc,
    getFiscalConfig,
    saveFiscalConfig,
    recordFiscalDocument,
    getFiscalNumberGuard,
    getFailedEvents,
    ignoreEvents,
    getPendingFiscalDocuments,
    getFailedFiscalDocuments,
    markFiscalDocumentsSynced,
    markFiscalDocumentsFailed,
    ignoreFiscalDocuments,
    listFiscalDocuments
  };
}

module.exports = {
  createLocalPdvStore
};
