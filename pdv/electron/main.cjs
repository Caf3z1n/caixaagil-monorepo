const { app, BrowserWindow, ipcMain, nativeTheme, shell } = require("electron");
const path = require("node:path");
const { createLocalPdvStore } = require("./local-store.cjs");
const { createFiscalWorkerService } = require("./fiscal-worker-service.cjs");
const { createNonFiscalReceiptService } = require("./non-fiscal-receipt-service.cjs");
const { createRemoteSupportService } = require("./remote-support-service.cjs");
const { createPrintJobQueue } = require("./print-job-queue.cjs");

// Mantem o pacote menor evitando backends graficos opcionais removidos no empacotamento.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-features", "Vulkan,D3D12Rasterization");

const isDev = !app.isPackaged;
const updateState = {
  status: isDev ? "unsupported" : "idle",
  version: app.getVersion(),
  availableVersion: null,
  error: null,
  progress: null,
  sizeBytes: null,
  bytesPerSecond: null
};
const appIconPath = path.join(
  __dirname,
  "assets",
  process.platform === "win32" ? "app-icon.ico" : "app-icon.png"
);
let mainWindow = null;

function focusMainWindow() {
  const window = mainWindow && !mainWindow.isDestroyed()
    ? mainWindow
    : BrowserWindow.getAllWindows()[0];

  if (!window) {
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

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
        setUpdateState({ status: "checking", error: null, progress: null, bytesPerSecond: null });
      });

      updater.on("update-available", (info) => {
        setUpdateState({
          status: "available",
          availableVersion: info?.version ?? null,
          error: null,
          progress: null,
          sizeBytes: getUpdateSizeBytes(info),
          bytesPerSecond: null
        });
      });

      updater.on("update-not-available", () => {
        setUpdateState({ status: "idle", availableVersion: null, error: null, progress: null, sizeBytes: null, bytesPerSecond: null });
      });

      updater.on("download-progress", (progress) => {
        const totalBytes = Number(progress?.total);
        const bytesPerSecond = Number(progress?.bytesPerSecond);

        setUpdateState({
          status: "downloading",
          progress: Math.max(0, Math.min(100, Math.round(Number(progress?.percent ?? 0)))),
          sizeBytes: Number.isFinite(totalBytes) && totalBytes > 0 ? totalBytes : updateState.sizeBytes,
          bytesPerSecond: Number.isFinite(bytesPerSecond) && bytesPerSecond > 0 ? bytesPerSecond : null
        });
      });

      updater.on("update-downloaded", (info) => {
        setUpdateState({
          status: "downloaded",
          availableVersion: info?.version ?? updateState.availableVersion,
          progress: 100,
          sizeBytes: getUpdateSizeBytes(info) ?? updateState.sizeBytes,
          bytesPerSecond: null
        });
      });

      updater.on("error", (error) => {
        setUpdateState({
          status: "error",
          error: error instanceof Error ? error.message : "Não foi possível verificar atualização.",
          progress: null,
          sizeBytes: null,
          bytesPerSecond: null
        });
      });
    } catch (error) {
      setUpdateState({
        status: "unsupported",
        error: error instanceof Error ? error.message : "Atualizador indisponível.",
        progress: null,
        sizeBytes: null,
        bytesPerSecond: null
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

  mainWindow = window;
  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  if (isDev) {
    window.loadURL(process.env.CAIXA_AGIL_PDV_URL || "http://localhost:3030");
    return window;
  }

  window.loadFile(path.join(__dirname, "..", "out", "index.html"));
  return window;
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    focusMainWindow();
  });

  app.whenReady().then(() => {
    app.setName("Caixa Ágil PDV");
    nativeTheme.themeSource = "light";
    registerUpdateService();
    const localStore = createLocalPdvStore(app);
    const printJobQueue = createPrintJobQueue();
    const fiscalWorkerService = createFiscalWorkerService(app, localStore, printJobQueue);
    localStore.registerIpc(ipcMain);
    fiscalWorkerService.registerIpc(ipcMain);
    createNonFiscalReceiptService(app, printJobQueue).registerIpc(ipcMain);
    createRemoteSupportService(app).registerIpc(ipcMain);

    if (process.platform === "win32") {
      app.setAppUserModelId("br.com.caixaagil.pdv");
    }

    createWindow();
    setTimeout(() => {
      fiscalWorkerService.warmUpFiscalWorker().catch(() => {});
    }, 1500);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        return;
      }

      focusMainWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
