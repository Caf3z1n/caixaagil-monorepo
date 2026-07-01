export type LocalPdvStoreSummary = {
  total: number;
  pending: number;
  failed: number;
  lastSyncedAt?: string | null;
  lastFailedAt?: string | null;
  lastError?: string | null;
};

export type LocalPdvStoreEventPayload = {
  eventId?: string;
  [key: string]: unknown;
};

export type LocalPdvStorePendingEvent = {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  idempotency_key: string;
  payload: LocalPdvStoreEventPayload;
  attempts: number;
  created_at: string;
  updated_at: string;
  last_error: string | null;
};

export type FiscalWorkerResponse = {
  success: boolean;
  command: string;
  status: string;
  codigoRetornoSefaz?: string | null;
  mensagemSefaz?: string | null;
  friendlyMessage: string;
  technicalMessage?: string | null;
  data?: unknown;
  logPath?: string;
  exitCode?: number | null;
};

export type FiscalWorkerRequest = {
  scope: string;
  command: string;
  correlationId?: string;
  documentId?: string;
  config?: Record<string, unknown>;
  payload?: Record<string, unknown>;
};

export type FiscalDocumentRecord = {
  id: string;
  scope: string;
  venda_id: string | null;
  command: string;
  ambiente: string | null;
  modelo: string | null;
  serie: number | null;
  numero: number | null;
  chave: string | null;
  status: string;
  codigo_retorno_sefaz: string | null;
  mensagem_sefaz: string | null;
  mensagem_operador: string | null;
  mensagem_tecnica: string | null;
  protocolo: string | null;
  xml_enviado_path: string | null;
  xml_autorizado_path: string | null;
  xml_enviado_conteudo?: string | null;
  xml_autorizado_conteudo?: string | null;
  pdf_path: string | null;
  impressao_status: string | null;
  raw_result: unknown;
  log_path: string | null;
  sync_status?: "pending" | "synced" | "failed" | "ignored" | string | null;
  sync_attempts?: number | null;
  sync_error?: string | null;
  synced_at?: string | null;
  api_nf_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type PdvUpdateStatusName =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error"
  | "unsupported";

export type PdvUpdateStatus = {
  status: PdvUpdateStatusName;
  version?: string | null;
  availableVersion?: string | null;
  error?: string | null;
  progress?: number | null;
  sizeBytes?: number | null;
  bytesPerSecond?: number | null;
};

export type PdvRemoteSupportStatus = {
  status: "nao_configurado" | "configurando" | "configurado" | "erro" | string;
  rustdeskId?: string | null;
  password?: string | null;
  version?: string | null;
  error?: string | null;
  updatedAt?: string | null;
};

export type NonFiscalReceiptPayload = {
  type: string;
  title: string;
  subtitle?: string;
  companyName: string;
  companyLines?: string[];
  highlightLabel?: string;
  highlightValue?: string;
  fields?: Array<{ label: string; value: string }>;
  sections?: Array<{ title: string; kind: "text" | "preformatted"; content: string }>;
  footerNote?: string;
  signatureLabel?: string;
  signatureName?: string;
  printerName?: string;
  preferredPrinterPatterns?: string[];
};

export type PrintShiftSummaryResult = {
  printer: string;
  message: string;
  payloadPath?: string;
  printedAt: string;
};

export type LocalPdvStoreBridge = {
  loadState<TState>(payload: { scope: string }): Promise<TState | null>;
  saveState(payload: { scope: string; state: unknown }): Promise<{ ok: true; updatedAt: string }>;
  clearState(payload: { scope: string }): Promise<{ ok: true }>;
  enqueueEvent(payload: {
    scope: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: LocalPdvStoreEventPayload;
  }): Promise<{ ok: true; eventId: string; idempotencyKey: string; pending: number }>;
  getSyncSummary(payload: { scope: string }): Promise<LocalPdvStoreSummary>;
  getPendingEvents(payload: { scope: string; limit?: number }): Promise<LocalPdvStorePendingEvent[]>;
  markEventsSynced(payload: { scope: string; eventIds: string[] }): Promise<{ ok: true; updated: number }>;
  markEventsFailed(payload: {
    scope: string;
    eventIds: string[];
    error?: string;
  }): Promise<{ ok: true; updated: number }>;
  ignoreEvents?(payload: {
    scope: string;
    eventIds: string[];
  }): Promise<{ ok: true; updated: number }>;
  getFailedEvents?(payload: { scope: string; limit?: number }): Promise<LocalPdvStorePendingEvent[]>;
  retryFailedEvents(payload: { scope: string }): Promise<{ ok: true; pending: number }>;
  getPendingFiscalDocuments?(payload: { scope: string; limit?: number }): Promise<FiscalDocumentRecord[]>;
  getFailedFiscalDocuments?(payload: { scope: string; limit?: number }): Promise<FiscalDocumentRecord[]>;
  markFiscalDocumentsSynced?(payload: {
    scope: string;
    documentIds?: string[];
    documents?: Array<{ id: string; api_nf_id?: string | null; apiNfId?: string | null }>;
  }): Promise<{ ok: true; updated: number }>;
  markFiscalDocumentsFailed?(payload: {
    scope: string;
    documentIds: string[];
    error?: string;
  }): Promise<{ ok: true; updated: number }>;
  ignoreFiscalDocuments?(payload: {
    scope: string;
    documentIds: string[];
  }): Promise<{ ok: true; updated: number }>;
  getShiftPreview(payload: { scope: string; dateKey: string; minimumShiftNumber?: number }): Promise<{ shiftNumber: number }>;
  reserveShiftNumber(payload: { scope: string; dateKey: string; minimumShiftNumber?: number }): Promise<{ shiftNumber: number }>;
  getFiscalConfig?(payload: { scope: string }): Promise<Record<string, unknown> | null>;
  saveFiscalConfig?(payload: { scope: string; config: Record<string, unknown> }): Promise<{ ok: true; updatedAt: string; config: Record<string, unknown> }>;
  saveFiscalCertificate?(payload: {
    scope: string;
    fileName: string;
    base64: string;
  }): Promise<{ ok: true; path: string; fileName: string }>;
  callFiscalWorker?(payload: FiscalWorkerRequest): Promise<FiscalWorkerResponse>;
  listFiscalDocuments?(payload: {
    scope: string;
    limit?: number;
    vendaId?: string;
    chave?: string;
    status?: string;
  }): Promise<FiscalDocumentRecord[]>;
  printShiftSummary?(payload: {
    documentKey?: string;
    payload: NonFiscalReceiptPayload;
  }): Promise<PrintShiftSummaryResult>;
  getUpdateStatus?(): Promise<PdvUpdateStatus>;
  checkForUpdates?(): Promise<PdvUpdateStatus>;
  downloadUpdate?(): Promise<PdvUpdateStatus>;
  installUpdate?(): Promise<{ ok: boolean }>;
  getRemoteSupportStatus?(): Promise<PdvRemoteSupportStatus>;
  installRustDeskSupport?(payload: {
    installerUrl: string;
    installerSha256: string;
    configString: string;
  }): Promise<PdvRemoteSupportStatus>;
  onUpdateStatus?(callback: (status: PdvUpdateStatus) => void): () => void;
};

declare global {
  interface Window {
    caixaAgilPdv?: LocalPdvStoreBridge;
  }
}

type StoredFallbackEvent = LocalPdvStorePendingEvent & {
  status: "pending" | "synced" | "failed" | "ignored";
};

const fallbackStatePrefix = "caixaagil:pdv:fallback:state:";
const fallbackEventsPrefix = "caixaagil:pdv:fallback:events:";
const fallbackMetadataPrefix = "caixaagil:pdv:fallback:metadata:";
const fallbackFiscalConfigPrefix = "caixaagil:pdv:fallback:fiscal-config:";
const fallbackFiscalDocumentsPrefix = "caixaagil:pdv:fallback:fiscal-documents:";

let browserFallbackStore: LocalPdvStoreBridge | null = null;

function readJson<TValue>(key: string, fallback: TValue): TValue {
  try {
    const rawValue = window.localStorage.getItem(key);

    if (!rawValue) {
      return fallback;
    }

    return JSON.parse(rawValue) as TValue;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getStateKey(scope: string) {
  return `${fallbackStatePrefix}${scope}`;
}

function getEventsKey(scope: string) {
  return `${fallbackEventsPrefix}${scope}`;
}

function getShiftSequenceKey(scope: string, dateKey: string) {
  return `${fallbackMetadataPrefix}shift-sequence:${scope}:${dateKey}`;
}

function getFiscalConfigKey(scope: string) {
  return `${fallbackFiscalConfigPrefix}${scope}`;
}

function getFiscalDocumentsKey(scope: string) {
  return `${fallbackFiscalDocumentsPrefix}${scope}`;
}

function readEvents(scope: string): StoredFallbackEvent[] {
  return readJson<StoredFallbackEvent[]>(getEventsKey(scope), []);
}

function writeEvents(scope: string, events: StoredFallbackEvent[]) {
  writeJson(getEventsKey(scope), events);
}

function createFallbackId(prefix: string) {
  const cryptoWithRandomUuid = window.crypto as Crypto & { randomUUID?: () => string };

  if (typeof cryptoWithRandomUuid?.randomUUID === "function") {
    return `${prefix}-${cryptoWithRandomUuid.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hashFallbackText(value: string) {
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

function normalizeLocalEventId(value: unknown, prefix: string) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  const eventId = rawValue || createFallbackId(prefix);

  if (eventId.length <= 64) {
    return eventId;
  }

  const digest = hashFallbackText(eventId).slice(0, 12);
  return `${eventId.slice(0, 63 - digest.length)}-${digest}`;
}

function sanitizeEventIds(eventIds: string[]) {
  return Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
}

function countPending(events: StoredFallbackEvent[]) {
  return events.filter((event) => event.status === "pending").length;
}

function getLatestEvent(events: StoredFallbackEvent[], status: StoredFallbackEvent["status"]) {
  return events
    .filter((event) => event.status === status)
    .sort((first, second) => second.updated_at.localeCompare(first.updated_at))[0] ?? null;
}

function normalizeMinimumShiftNumber(value?: number) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function omitEventStatus(event: StoredFallbackEvent): LocalPdvStorePendingEvent {
  const { status: _status, ...eventWithoutStatus } = event;

  return eventWithoutStatus;
}

function createBrowserFallbackStore(): LocalPdvStoreBridge {
  return {
    async loadState<TState>(payload: { scope: string }) {
      const { scope } = payload;

      return readJson<TState | null>(getStateKey(scope), null);
    },

    async saveState({ scope, state }) {
      const updatedAt = new Date().toISOString();
      writeJson(getStateKey(scope), state);

      return { ok: true, updatedAt };
    },

    async clearState({ scope }) {
      window.localStorage.removeItem(getStateKey(scope));

      return { ok: true };
    },

    async enqueueEvent({ scope, eventType, aggregateType, aggregateId, payload }) {
      const events = readEvents(scope);
      const createdAt = new Date().toISOString();
      const id = normalizeLocalEventId(payload?.eventId, "evento");
      const idempotencyKey = `${scope}:${eventType}:${aggregateId}:${id}`;

      if (!events.some((event) => event.id === id || event.idempotency_key === idempotencyKey)) {
        events.push({
          id,
          event_type: eventType,
          aggregate_type: aggregateType,
          aggregate_id: aggregateId,
          idempotency_key: idempotencyKey,
          payload: {
            ...payload,
            eventId: id,
            localScope: scope,
            createdAt
          },
          status: "pending",
          attempts: 0,
          created_at: createdAt,
          updated_at: createdAt,
          last_error: null
        });

        writeEvents(scope, events);
      }

      return {
        ok: true,
        eventId: id,
        idempotencyKey,
        pending: countPending(events)
      };
    },

    async getSyncSummary({ scope }) {
      const events = readEvents(scope);
      const fiscalDocuments = readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []);
      const latestSyncedEvent = getLatestEvent(events, "synced");
      const latestFailedEvent = getLatestEvent(events, "failed");
      const latestSyncedDocument = fiscalDocuments
        .filter((document) => document.sync_status === "synced" && document.synced_at)
        .sort((first, second) => String(second.synced_at || "").localeCompare(String(first.synced_at || "")))[0];
      const latestFailedDocument = fiscalDocuments
        .filter((document) => document.sync_status === "failed")
        .sort((first, second) => second.updated_at.localeCompare(first.updated_at))[0];
      const syncedCandidates = [latestSyncedEvent?.updated_at, latestSyncedDocument?.synced_at]
        .filter(Boolean)
        .map(String)
        .sort();
      const syncedAt = syncedCandidates.length > 0 ? syncedCandidates[syncedCandidates.length - 1] : null;
      const failedCandidates = [
        latestFailedEvent ? { updatedAt: latestFailedEvent.updated_at, error: latestFailedEvent.last_error } : null,
        latestFailedDocument ? { updatedAt: latestFailedDocument.updated_at, error: latestFailedDocument.sync_error } : null
      ]
        .filter(Boolean)
        .sort((first, second) => String(second?.updatedAt || "").localeCompare(String(first?.updatedAt || "")));

      return {
        total: events.length + fiscalDocuments.length,
        pending: countPending(events) + fiscalDocuments.filter((document) => (document.sync_status ?? "pending") === "pending").length,
        failed: events.filter((event) => event.status === "failed").length + fiscalDocuments.filter((document) => document.sync_status === "failed").length,
        lastSyncedAt: syncedAt,
        lastFailedAt: failedCandidates[0]?.updatedAt ?? null,
        lastError: failedCandidates[0]?.error ?? null
      };
    },

    async getPendingEvents({ scope, limit = 100 }) {
      return readEvents(scope)
        .filter((event) => event.status === "pending")
        .sort((first, second) => first.created_at.localeCompare(second.created_at))
        .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 250))
        .map(omitEventStatus);
    },

    async markEventsSynced({ scope, eventIds }) {
      const ids = sanitizeEventIds(eventIds);
      const updatedAt = new Date().toISOString();
      const events = readEvents(scope);
      let updated = 0;

      const nextEvents = events.map((event) => {
        if (!ids.includes(event.id) || event.status === "synced" || event.status === "ignored") {
          return event;
        }

        updated += 1;
        return {
          ...event,
          status: "synced" as const,
          updated_at: updatedAt,
          last_error: null
        };
      });

      writeEvents(scope, nextEvents);

      return { ok: true, updated };
    },

    async markEventsFailed({ scope, eventIds, error }) {
      const ids = sanitizeEventIds(eventIds);
      const updatedAt = new Date().toISOString();
      const events = readEvents(scope);
      let updated = 0;

      const nextEvents = events.map((event) => {
        if (!ids.includes(event.id)) {
          return event;
        }

        updated += 1;
        return {
          ...event,
          status: "failed" as const,
          attempts: event.attempts + 1,
          updated_at: updatedAt,
          last_error: String(error || "Falha ao sincronizar evento.")
        };
      });

      writeEvents(scope, nextEvents);

      return { ok: true, updated };
    },

    async ignoreEvents({ scope, eventIds }) {
      const ids = sanitizeEventIds(eventIds);
      const updatedAt = new Date().toISOString();
      const events = readEvents(scope);
      let updated = 0;

      const nextEvents = events.map((event) => {
        if (!ids.includes(event.id)) {
          return event;
        }

        updated += 1;
        return {
          ...event,
          status: "ignored" as const,
          updated_at: updatedAt,
          last_error: event.last_error || "Ignorado pelo operador."
        };
      });

      writeEvents(scope, nextEvents);

      return { ok: true, updated };
    },

    async getFailedEvents({ scope, limit = 10 }) {
      return readEvents(scope)
        .filter((event) => event.status === "failed")
        .sort((first, second) => second.updated_at.localeCompare(first.updated_at))
        .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 50))
        .map(omitEventStatus);
    },

    async retryFailedEvents({ scope }) {
      const updatedAt = new Date().toISOString();
      const nextEvents = readEvents(scope).map((event) => {
        if (event.status !== "failed") {
          return event;
        }

        return {
          ...event,
          status: "pending" as const,
          updated_at: updatedAt,
          last_error: null
        };
      });
      const nextDocuments = readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []).map((document) => {
        if (document.sync_status !== "failed") {
          return document;
        }

        return {
          ...document,
          sync_status: "pending",
          sync_error: null,
          updated_at: updatedAt
        };
      });

      writeEvents(scope, nextEvents);
      writeJson(getFiscalDocumentsKey(scope), nextDocuments);

      return {
        ok: true,
        pending: countPending(nextEvents) + nextDocuments.filter((document) => (document.sync_status ?? "pending") === "pending").length
      };
    },

    async getShiftPreview({ scope, dateKey, minimumShiftNumber }) {
      const lastShiftNumber = Number.parseInt(window.localStorage.getItem(getShiftSequenceKey(scope, dateKey)) || "0", 10) || 0;

      return { shiftNumber: Math.max(lastShiftNumber + 1, normalizeMinimumShiftNumber(minimumShiftNumber)) };
    },

    async reserveShiftNumber({ scope, dateKey, minimumShiftNumber }) {
      const key = getShiftSequenceKey(scope, dateKey);
      const lastShiftNumber = Number.parseInt(window.localStorage.getItem(key) || "0", 10) || 0;
      const shiftNumber = Math.max(lastShiftNumber + 1, normalizeMinimumShiftNumber(minimumShiftNumber));

      window.localStorage.setItem(key, String(shiftNumber));

      return { shiftNumber };
    },

    async getFiscalConfig({ scope }) {
      return readJson<Record<string, unknown> | null>(getFiscalConfigKey(scope), null);
    },

    async saveFiscalConfig({ scope, config }) {
      const updatedAt = new Date().toISOString();
      writeJson(getFiscalConfigKey(scope), config);

      return { ok: true, updatedAt, config };
    },

    async saveFiscalCertificate({ fileName }) {
      throw new Error(`Certificado ${fileName || "A1"} só pode ser salvo no app desktop.`);
    },

    async callFiscalWorker({ command }) {
      return {
        success: false,
        command,
        status: "worker_indisponivel_browser",
        friendlyMessage: "Worker fiscal disponível apenas no app desktop.",
        technicalMessage: "Browser fallback não executa worker .NET.",
        data: null
      };
    },

    async listFiscalDocuments({ scope, limit = 100 }) {
      return readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []).slice(0, limit);
    },

    async getPendingFiscalDocuments({ scope, limit = 100 }) {
      return readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), [])
        .filter((document) => (document.sync_status ?? "pending") === "pending")
        .slice(0, Math.min(Math.max(Number(limit) || 100, 1), 250));
    },

    async getFailedFiscalDocuments({ scope, limit = 10 }) {
      return readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), [])
        .filter((document) => document.sync_status === "failed")
        .sort((first, second) => second.updated_at.localeCompare(first.updated_at))
        .slice(0, Math.min(Math.max(Number(limit) || 10, 1), 50));
    },

    async markFiscalDocumentsSynced({ scope, documentIds = [], documents = [] }) {
      const ids = new Set([
        ...documentIds.filter(Boolean),
        ...documents.map((document) => document.id).filter(Boolean)
      ]);
      const apiIds = new Map(documents.map((document) => [document.id, document.api_nf_id ?? document.apiNfId ?? null]));
      const syncedAt = new Date().toISOString();
      let updated = 0;

      const nextDocuments = readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []).map((document) => {
        const syncStatus = document.sync_status ?? "pending";

        if (!ids.has(document.id) || syncStatus === "synced" || syncStatus === "ignored") {
          return document;
        }

        updated += 1;
        return {
          ...document,
          sync_status: "synced",
          sync_error: null,
          synced_at: syncedAt,
          api_nf_id: apiIds.get(document.id) ?? document.api_nf_id ?? null,
          updated_at: syncedAt
        };
      });

      writeJson(getFiscalDocumentsKey(scope), nextDocuments);
      return { ok: true, updated };
    },

    async markFiscalDocumentsFailed({ scope, documentIds, error }) {
      const ids = new Set(documentIds.filter(Boolean));
      const updatedAt = new Date().toISOString();
      let updated = 0;

      const nextDocuments = readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []).map((document) => {
        if (!ids.has(document.id)) {
          return document;
        }

        updated += 1;
        return {
          ...document,
          sync_status: "failed",
          sync_attempts: Number(document.sync_attempts || 0) + 1,
          sync_error: String(error || "Falha ao sincronizar documento fiscal."),
          updated_at: updatedAt
        };
      });

      writeJson(getFiscalDocumentsKey(scope), nextDocuments);
      return { ok: true, updated };
    },

    async ignoreFiscalDocuments({ scope, documentIds }) {
      const ids = new Set(documentIds.filter(Boolean));
      const updatedAt = new Date().toISOString();
      let updated = 0;

      const nextDocuments = readJson<FiscalDocumentRecord[]>(getFiscalDocumentsKey(scope), []).map((document) => {
        if (!ids.has(document.id)) {
          return document;
        }

        updated += 1;
        return {
          ...document,
          sync_status: "ignored",
          sync_error: document.sync_error || "Ignorado pelo operador.",
          updated_at: updatedAt
        };
      });

      writeJson(getFiscalDocumentsKey(scope), nextDocuments);
      return { ok: true, updated };
    },

    async printShiftSummary() {
      throw new Error("Impressão do resumo do turno disponível apenas no app desktop.");
    }
  };
}

function getBrowserFallbackStore() {
  if (!browserFallbackStore) {
    browserFallbackStore = createBrowserFallbackStore();
  }

  return browserFallbackStore;
}

export function getLocalPdvStore() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.caixaAgilPdv ?? getBrowserFallbackStore();
}
