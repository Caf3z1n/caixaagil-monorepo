const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const syncFs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

let fallbackPrintQueue = Promise.resolve();

function normalizeOptionalText(value) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  return normalizedValue || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function repairMojibakeText(value) {
  return String(value)
    .replace(/Â /g, " ")
    .replace(/Ã¡/g, "á")
    .replace(/Ã /g, "à")
    .replace(/Ã¢/g, "â")
    .replace(/Ã£/g, "ã")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã©/g, "é")
    .replace(/Ãª/g, "ê")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ã´/g, "ô")
    .replace(/Ãµ/g, "õ")
    .replace(/Ãº/g, "ú")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã§/g, "ç")
    .replace(/Ã/g, "Á")
    .replace(/Ã/g, "À")
    .replace(/Ã/g, "Â")
    .replace(/Ã/g, "Ã")
    .replace(/Ã/g, "É")
    .replace(/Ã/g, "Ê")
    .replace(/Ã/g, "Í")
    .replace(/Ã/g, "Ó")
    .replace(/Ã/g, "Ô")
    .replace(/Ã/g, "Õ")
    .replace(/Ã/g, "Ú")
    .replace(/Ã/g, "Ç");
}

function normalizePrinterText(value) {
  return repairMojibakeText(value)
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function normalizePrinterPayload(value) {
  if (typeof value === "string") {
    return normalizePrinterText(value);
  }

  if (Array.isArray(value)) {
    return value.map(normalizePrinterPayload);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, normalizePrinterPayload(entryValue)])
    );
  }

  return value;
}

function sanitizePathSegment(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180) || "documento";
}

function extractExecErrorMessage(error) {
  if (error && typeof error === "object") {
    const messages = [error.stderr, error.stdout, error.message]
      .map((value) => normalizeOptionalText(value))
      .filter(Boolean);

    if (messages.length > 0) {
      return messages[0];
    }
  }

  return "Falha ao enviar o comprovante para a impressora não fiscal.";
}

function getPowerShellExecutable() {
  if (process.platform !== "win32") {
    throw new Error("A impressão não fiscal direta está disponível apenas no Windows.");
  }

  return process.env.POWERSHELL_EXE || "powershell.exe";
}

async function getPrintScriptPath(app) {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "non-fiscal-receipt-printer.ps1"),
        path.join(app.getAppPath(), "electron", "services", "non-fiscal-receipt-printer.ps1")
      ]
    : [
        path.join(__dirname, "services", "non-fiscal-receipt-printer.ps1"),
        path.join(process.cwd(), "electron", "services", "non-fiscal-receipt-printer.ps1"),
        path.join(process.resourcesPath || "", "non-fiscal-receipt-printer.ps1")
      ];

  for (const candidate of candidates) {
    try {
      const stats = syncFs.statSync(candidate);

      if (stats.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Script de impressão não fiscal não encontrado nesta instalação.");
}

function buildPreviewText(payload) {
  const lines = [];

  if (payload.companyName) {
    lines.push(String(payload.companyName).toUpperCase());
  }

  for (const companyLine of payload.companyLines || []) {
    const normalizedLine = normalizeOptionalText(companyLine);

    if (normalizedLine) {
      lines.push(normalizedLine);
    }
  }

  lines.push("");
  lines.push(payload.title || "COMPROVANTE");

  if (payload.subtitle) {
    lines.push(payload.subtitle);
  }

  if (payload.highlightLabel || payload.highlightValue) {
    lines.push("");
    lines.push(`${payload.highlightLabel || "Valor"}: ${payload.highlightValue || "--"}`);
  }

  for (const field of payload.fields || []) {
    if (field?.label && field?.value) {
      lines.push(`${field.label}: ${field.value}`);
    }
  }

  for (const section of payload.sections || []) {
    lines.push("");
    lines.push(section.title || "");
    lines.push(section.content || "");
  }

  if (payload.footerNote) {
    lines.push("");
    lines.push(payload.footerNote);
  }

  if (payload.signatureLabel) {
    lines.push("");
    lines.push("______________________________");
    lines.push(payload.signatureLabel);
  }

  if (payload.signatureName) {
    lines.push(payload.signatureName);
  }

  return `${lines.join("\n")}\n`;
}

async function persistPrintPayload(app, input) {
  const documentFolderName = sanitizePathSegment(input.documentKey || `${Date.now()}-${crypto.randomUUID()}`);
  const type = sanitizePathSegment(input.payload?.type || "comprovante");
  const directory = path.join(app.getPath("userData"), "comprovantes-nao-fiscais", type, documentFolderName);

  await fs.mkdir(directory, { recursive: true });

  const payloadPath = path.join(directory, "payload.json");
  const previewPath = path.join(directory, "preview.txt");

  await fs.writeFile(payloadPath, `${JSON.stringify(input.payload, null, 2)}\n`, "utf8");
  await fs.writeFile(previewPath, buildPreviewText(input.payload), "utf8");

  return {
    directory,
    payloadPath,
    previewPath
  };
}

function parsePowerShellOutput(stdout) {
  const rawOutput = normalizeOptionalText(stdout);

  if (!rawOutput) {
    return null;
  }

  try {
    return JSON.parse(rawOutput);
  } catch {
    return null;
  }
}

function normalizeReceiptPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Informe os dados do comprovante para impressão.");
  }

  return {
    ...payload,
    type: normalizeOptionalText(payload.type) || "resumo-turno",
    title: normalizeOptionalText(payload.title) || "RESUMO DO TURNO",
    companyName: normalizeOptionalText(payload.companyName) || "CAIXA ÁGIL",
    companyLines: Array.isArray(payload.companyLines) ? payload.companyLines.map(String) : [],
    fields: Array.isArray(payload.fields) ? payload.fields : [],
    sections: Array.isArray(payload.sections) ? payload.sections : []
  };
}

async function printNonFiscalReceipt(app, input) {
  const receiptPayload = normalizeReceiptPayload(input?.payload);
  const payload = {
    ...normalizePrinterPayload(receiptPayload),
    printerName: receiptPayload.printerName,
    preferredPrinterPatterns: receiptPayload.preferredPrinterPatterns
  };
  const savedPayload = await persistPrintPayload(app, {
    documentKey: input?.documentKey,
    payload
  });
  const printerName = normalizeOptionalText(receiptPayload.printerName) || normalizeOptionalText(process.env.NON_FISCAL_PRINTER_NAME);
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    await getPrintScriptPath(app),
    "-PayloadPath",
    savedPayload.payloadPath
  ];

  if (printerName) {
    args.push("-PrinterName", printerName);
  }

  try {
    const { stdout } = await execFileAsync(getPowerShellExecutable(), args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 120_000
    });
    const parsedOutput = parsePowerShellOutput(stdout);

    return {
      printer: normalizeOptionalText(parsedOutput?.printer) || printerName || "Impressora não fiscal",
      message: normalizeOptionalText(parsedOutput?.message) || "Comprovante enviado para impressão.",
      payloadPath: savedPayload.payloadPath
    };
  } catch (error) {
    throw new Error(extractExecErrorMessage(error));
  }
}

function createNonFiscalReceiptService(app, printJobQueue = null) {
  async function printReceipt(input) {
    const run = async () => {
      const printedAt = new Date().toISOString();
      const result = await printNonFiscalReceipt(app, input);

      await delay(500);

      return {
        ...result,
        printedAt
      };
    };
    const printerName = normalizeOptionalText(input?.payload?.printerName) || normalizeOptionalText(process.env.NON_FISCAL_PRINTER_NAME);

    if (printJobQueue?.enqueuePrintJob) {
      return printJobQueue.enqueuePrintJob({
        printerName,
        beforeTimeoutMs: 30_000,
        afterTimeoutMs: 0,
        afterSettleMs: 700
      }, run);
    }

    const queuedPrint = fallbackPrintQueue.then(run, run);
    fallbackPrintQueue = queuedPrint.catch(() => {});

    return queuedPrint;
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("pdv-print:shift-summary", (_event, payload) => printReceipt(payload));
    ipcMain.handle("pdv-printshift-summary", (_event, payload) => printReceipt(payload));
    ipcMain.handle("pdv-print:promissory-note", (_event, payload) => printReceipt(payload));
  }

  return {
    registerIpc,
    printShiftSummary: printReceipt,
    printPromissoryNote: printReceipt
  };
}

module.exports = {
  createNonFiscalReceiptService
};
