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
  getFailedEvents?(payload: { scope: string; limit?: number }): Promise<LocalPdvStorePendingEvent[]>;
  retryFailedEvents(payload: { scope: string }): Promise<{ ok: true; pending: number }>;
  getShiftPreview(payload: { scope: string; dateKey: string; minimumShiftNumber?: number }): Promise<{ shiftNumber: number }>;
  reserveShiftNumber(payload: { scope: string; dateKey: string; minimumShiftNumber?: number }): Promise<{ shiftNumber: number }>;
};

declare global {
  interface Window {
    caixaAgilPdv?: LocalPdvStoreBridge;
  }
}

type StoredFallbackEvent = LocalPdvStorePendingEvent & {
  status: "pending" | "synced" | "failed";
};

const fallbackStatePrefix = "caixaagil:pdv:fallback:state:";
const fallbackEventsPrefix = "caixaagil:pdv:fallback:events:";
const fallbackMetadataPrefix = "caixaagil:pdv:fallback:metadata:";

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
      const id = payload?.eventId || createFallbackId("evento");
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
      const latestSyncedEvent = getLatestEvent(events, "synced");
      const latestFailedEvent = getLatestEvent(events, "failed");

      return {
        total: events.length,
        pending: countPending(events),
        failed: events.filter((event) => event.status === "failed").length,
        lastSyncedAt: latestSyncedEvent?.updated_at ?? null,
        lastFailedAt: latestFailedEvent?.updated_at ?? null,
        lastError: latestFailedEvent?.last_error ?? null
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
        if (!ids.includes(event.id)) {
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

      writeEvents(scope, nextEvents);

      return {
        ok: true,
        pending: countPending(nextEvents)
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
