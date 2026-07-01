const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getProgramDataPath(app) {
  return process.env.ProgramData || path.dirname(app.getPath("userData"));
}

function getStatusPath(app) {
  return path.join(getProgramDataPath(app), "CaixaAgil", "support", "rustdesk-status.json");
}

function getScriptPath(app) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "rustdesk-support-installer.ps1");
  }

  return path.join(__dirname, "services", "rustdesk-support-installer.ps1");
}

function normalizeSupportStatus(statusPath) {
  const status = readJson(statusPath, null);

  if (!status || typeof status !== "object") {
    return {
      status: "nao_configurado",
      rustdeskId: null,
      password: null,
      version: null,
      error: null,
      updatedAt: null
    };
  }

  return {
    status: status.status || "nao_configurado",
    rustdeskId: status.rustdesk_id || status.rustdeskId || null,
    password: status.senha || status.password || null,
    version: status.versao || status.version || null,
    error: status.erro || status.error || null,
    updatedAt: status.atualizado_em || status.updatedAt || null
  };
}

function runPowerShell(args) {
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        error: error.message
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        ok: exitCode === 0,
        exitCode,
        stdout,
        stderr,
        error: exitCode === 0 ? null : stderr || stdout || "Falha ao configurar RustDesk."
      });
    });
  });
}

function createRemoteSupportService(app) {
  const statusPath = getStatusPath(app);

  return {
    registerIpc(ipcMain) {
      ipcMain.handle("pdv-support:get-status", () => normalizeSupportStatus(statusPath));
      ipcMain.handle("pdv-support:install-rustdesk", async (_event, payload = {}) => {
        if (process.platform !== "win32") {
          return {
            ...normalizeSupportStatus(statusPath),
            status: "erro",
            error: "Instalação automática disponível apenas no Windows."
          };
        }

        const scriptPath = getScriptPath(app);
        const installerUrl = String(payload.installerUrl || "");
        const installerSha256 = String(payload.installerSha256 || "");
        const configString = String(payload.configString || "");

        if (!fs.existsSync(scriptPath)) {
          return {
            ...normalizeSupportStatus(statusPath),
            status: "erro",
            error: "Script de instalação do RustDesk não encontrado."
          };
        }

        if (!installerUrl || !installerSha256 || !configString) {
          return {
            ...normalizeSupportStatus(statusPath),
            status: "erro",
            error: "Configuração do RustDesk incompleta."
          };
        }

        const result = await runPowerShell([
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-InstallerUrl",
          installerUrl,
          "-InstallerSha256",
          installerSha256,
          "-ConfigString",
          configString,
          "-StatusPath",
          statusPath
        ]);
        const status = normalizeSupportStatus(statusPath);

        if (!result.ok && status.status !== "erro") {
          return {
            ...status,
            status: "erro",
            error: result.error || "Falha ao configurar RustDesk."
          };
        }

        return status;
      });
    }
  };
}

module.exports = {
  createRemoteSupportService
};
