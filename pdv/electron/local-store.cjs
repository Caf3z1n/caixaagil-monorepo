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
    `);
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
      const row = getOne(
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
      const syncedRow = getOne(
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
      const failedRow = getOne(
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

      return {
        total: Number(row?.total ?? 0),
        pending: Number(row?.pending ?? 0),
        failed: Number(row?.failed ?? 0),
        lastSyncedAt: syncedRow?.updated_at ? String(syncedRow.updated_at) : null,
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

      const summaryRow = getOne(
        database,
        "SELECT COUNT(*) AS pending FROM sync_outbox WHERE scope = ? AND status = 'pending'",
        [scope]
      );

      return {
        ok: true,
        pending: Number(summaryRow?.pending ?? 0)
      };
    });
  }

  async function enqueueEvent({ scope, eventType, aggregateType, aggregateId, payload }) {
    return withWrite((database) => {
      const createdAt = new Date().toISOString();
      const id = payload?.eventId || createId("evento");
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
        "SELECT COUNT(*) AS pending FROM sync_outbox WHERE scope = ? AND status = 'pending'",
        [scope]
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

  function registerIpc(ipcMain) {
    ipcMain.handle("pdv-store:load-state", (_event, payload) => loadState(payload));
    ipcMain.handle("pdv-store:save-state", (_event, payload) => saveState(payload));
    ipcMain.handle("pdv-store:clear-state", (_event, payload) => clearState(payload));
    ipcMain.handle("pdv-store:enqueue-event", (_event, payload) => enqueueEvent(payload));
    ipcMain.handle("pdv-store:get-sync-summary", (_event, payload) => getSyncSummary(payload));
    ipcMain.handle("pdv-store:get-pending-events", (_event, payload) => getPendingEvents(payload));
    ipcMain.handle("pdv-store:mark-events-synced", (_event, payload) => markEventsSynced(payload));
    ipcMain.handle("pdv-store:mark-events-failed", (_event, payload) => markEventsFailed(payload));
    ipcMain.handle("pdv-store:retry-failed-events", (_event, payload) => retryFailedEvents(payload));
    ipcMain.handle("pdv-store:get-shift-preview", (_event, payload) => getShiftPreview(payload));
    ipcMain.handle("pdv-store:reserve-shift-number", (_event, payload) => reserveShiftNumber(payload));
  }

  return {
    registerIpc
  };
}

module.exports = {
  createLocalPdvStore
};
