const { contextBridge, ipcRenderer } = require("electron");

function isMissingHandlerError(error) {
  return /No handler registered/i.test(String(error?.message || error || ""));
}

async function invokeOptional(channel, payload, fallback) {
  try {
    return await ipcRenderer.invoke(channel, payload);
  } catch (error) {
    if (isMissingHandlerError(error)) {
      return fallback;
    }

    throw error;
  }
}

contextBridge.exposeInMainWorld("caixaAgilPdv", {
  loadState(payload) {
    return ipcRenderer.invoke("pdv-store:load-state", payload);
  },
  saveState(payload) {
    return ipcRenderer.invoke("pdv-store:save-state", payload);
  },
  clearState(payload) {
    return ipcRenderer.invoke("pdv-store:clear-state", payload);
  },
  enqueueEvent(payload) {
    return ipcRenderer.invoke("pdv-store:enqueue-event", payload);
  },
  getSyncSummary(payload) {
    return ipcRenderer.invoke("pdv-store:get-sync-summary", payload);
  },
  getPendingEvents(payload) {
    return ipcRenderer.invoke("pdv-store:get-pending-events", payload);
  },
  markEventsSynced(payload) {
    return ipcRenderer.invoke("pdv-store:mark-events-synced", payload);
  },
  markEventsFailed(payload) {
    return ipcRenderer.invoke("pdv-store:mark-events-failed", payload);
  },
  ignoreEvents(payload) {
    return ipcRenderer.invoke("pdv-store:ignore-events", payload);
  },
  getFailedEvents(payload) {
    return ipcRenderer.invoke("pdv-store:get-failed-events", payload);
  },
  retryFailedEvents(payload) {
    return ipcRenderer.invoke("pdv-store:retry-failed-events", payload);
  },
  getPendingFiscalDocuments(payload) {
    return invokeOptional("pdv-store:get-pending-fiscal-documents", payload, []);
  },
  getFailedFiscalDocuments(payload) {
    return invokeOptional("pdv-store:get-failed-fiscal-documents", payload, []);
  },
  markFiscalDocumentsSynced(payload) {
    return invokeOptional("pdv-store:mark-fiscal-documents-synced", payload, { ok: true, updated: 0 });
  },
  markFiscalDocumentsFailed(payload) {
    return invokeOptional("pdv-store:mark-fiscal-documents-failed", payload, { ok: true, updated: 0 });
  },
  ignoreFiscalDocuments(payload) {
    return ipcRenderer.invoke("pdv-store:ignore-fiscal-documents", payload);
  },
  getShiftPreview(payload) {
    return ipcRenderer.invoke("pdv-store:get-shift-preview", payload);
  },
  reserveShiftNumber(payload) {
    return ipcRenderer.invoke("pdv-store:reserve-shift-number", payload);
  },
  getFiscalConfig(payload) {
    return ipcRenderer.invoke("pdv-fiscal:get-config", payload);
  },
  saveFiscalConfig(payload) {
    return ipcRenderer.invoke("pdv-fiscal:save-config", payload);
  },
  saveFiscalCertificate(payload) {
    return ipcRenderer.invoke("pdv-fiscal:save-certificate", payload);
  },
  callFiscalWorker(payload) {
    return ipcRenderer.invoke("pdv-fiscal:call-worker", payload);
  },
  listFiscalDocuments(payload) {
    return ipcRenderer.invoke("pdv-fiscal:list-documents", payload);
  },
  printShiftSummary(payload) {
    return ipcRenderer.invoke("pdv-print:shift-summary", payload);
  },
  getUpdateStatus() {
    return ipcRenderer.invoke("pdv-update:get-status");
  },
  checkForUpdates() {
    return ipcRenderer.invoke("pdv-update:check");
  },
  downloadUpdate() {
    return ipcRenderer.invoke("pdv-update:download");
  },
  installUpdate() {
    return ipcRenderer.invoke("pdv-update:install");
  },
  onUpdateStatus(callback) {
    if (typeof callback !== "function") {
      return () => {};
    }

    const listener = (_event, status) => callback(status);
    ipcRenderer.on("pdv-update:status", listener);

    return () => {
      ipcRenderer.removeListener("pdv-update:status", listener);
    };
  }
});
