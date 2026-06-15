const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { createLocalPdvStore } = require("./local-store.cjs");

const isDev = !app.isPackaged;
const appIconPath = path.join(
  __dirname,
  "assets",
  process.platform === "win32" ? "app-icon.ico" : "app-icon.png"
);

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
  createLocalPdvStore(app).registerIpc(ipcMain);

  if (process.platform === "win32") {
    app.setAppUserModelId("br.com.eticasistemas.caixaagil.pdv");
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
