const { contextBridge, ipcRenderer } = require("electron");

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
  retryFailedEvents(payload) {
    return ipcRenderer.invoke("pdv-store:retry-failed-events", payload);
  },
  getShiftPreview(payload) {
    return ipcRenderer.invoke("pdv-store:get-shift-preview", payload);
  },
  reserveShiftNumber(payload) {
    return ipcRenderer.invoke("pdv-store:reserve-shift-number", payload);
  }
});
