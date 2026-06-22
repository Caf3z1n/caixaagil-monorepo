const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { createLocalPdvStore } = require("./local-store.cjs");
const { createFiscalWorkerService } = require("./fiscal-worker-service.cjs");

const isDev = !app.isPackaged;
const updateState = {
  status: isDev ? "unsupported" : "idle",
  version: app.getVersion(),
  availableVersion: null,
  error: null,
  progress: null,
  sizeBytes: null
};
const appIconPath = path.join(
  __dirname,
  "assets",
  process.platform === "win32" ? "app-icon.ico" : "app-icon.png"
);

function emitUpdateState() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("pdv-update:status", updateState);
  }
}

function setUpdateState(nextState) {
  Object.assign(updateState, nextState);
  emitUpdateState();
}

function getUpdateSizeBytes(info) {
  const fileSize = Array.isArray(info?.files) ? Number(info.files[0]?.size) : NaN;
  const directSize = Number(info?.size);

  if (Number.isFinite(fileSize) && fileSize > 0) {
    return fileSize;
  }

  if (Number.isFinite(directSize) && directSize > 0) {
    return directSize;
  }

  return null;
}

function registerUpdateService() {
  let updater = null;

  if (!isDev) {
    try {
      updater = require("electron-updater").autoUpdater;
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;

      updater.on("checking-for-update", () => {
        setUpdateState({ status: "checking", error: null, progress: null });
      });

      updater.on("update-available", (info) => {
        setUpdateState({
          status: "available",
          availableVersion: info?.version ?? null,
          error: null,
          progress: null,
          sizeBytes: getUpdateSizeBytes(info)
        });
      });

      updater.on("update-not-available", () => {
        setUpdateState({ status: "idle", availableVersion: null, error: null, progress: null, sizeBytes: null });
      });

      updater.on("download-progress", (progress) => {
        const totalBytes = Number(progress?.total);

        setUpdateState({
          status: "downloading",
          progress: Math.max(0, Math.min(100, Math.round(Number(progress?.percent ?? 0)))),
          sizeBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : updateState.sizeBytes
        });
      });

      updater.on("update-downloaded", (info) => {
        setUpdateState({
          status: "downloaded",
          availableVersion: info?.version ?? updateState.availableVersion,
          progress: 100,
          sizeBytes: getUpdateSizeBytes(info) ?? updateState.sizeBytes
        });
      });

      updater.on("error", (error) => {
        setUpdateState({
          status: "error",
          error: error instanceof Error ? error.message : "Não foi possível verificar atualização.",
          progress: null,
          sizeBytes: null
        });
      });
    } catch (error) {
      setUpdateState({
        status: "unsupported",
        error: error instanceof Error ? error.message : "Atualizador indisponível.",
        progress: null,
        sizeBytes: null
      });
    }
  }

  ipcMain.handle("pdv-update:get-status", () => updateState);
  ipcMain.handle("pdv-update:check", async () => {
    if (!updater) {
      return updateState;
    }

    await updater.checkForUpdates();
    return updateState;
  });
  ipcMain.handle("pdv-update:download", async () => {
    if (!updater) {
      return updateState;
    }

    await updater.downloadUpdate();
    return updateState;
  });
  ipcMain.handle("pdv-update:install", () => {
    if (!updater || updateState.status !== "downloaded") {
      return { ok: false };
    }

    updater.quitAndInstall(false, true);
    return { ok: true };
  });

  if (updater) {
    setTimeout(() => {
      updater.checkForUpdates().catch((error) => {
        setUpdateState({
          status: "error",
          error: error instanceof Error ? error.message : "Não foi possível verificar atualização.",
          progress: null,
          sizeBytes: null
        });
      });
    }, 6000);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 860,
    minHeight: 640,
    title: "Caixa Ágil PDV",
    icon: appIconPath,
    backgroundColor: "#ff6302",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    window.loadURL(process.env.CAIXA_AGIL_PDV_URL || "http://localhost:3030");
    return;
  }

  window.loadFile(path.join(__dirname, "..", "out", "index.html"));
}

app.whenReady().then(() => {
  app.setName("Caixa Ágil PDV");
  registerUpdateService();
  const localStore = createLocalPdvStore(app);
  localStore.registerIpc(ipcMain);
  createFiscalWorkerService(app, localStore).registerIpc(ipcMain);

  if (process.platform === "win32") {
    app.setAppUserModelId("br.com.caixaagil.pdv");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
