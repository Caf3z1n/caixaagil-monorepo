const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

function normalizeOptionalText(value) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  return normalizedValue || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPowerShellExecutable() {
  if (process.platform !== "win32") {
    return null;
  }

  return process.env.POWERSHELL_EXE || "powershell.exe";
}

async function runPowerShell(script, env = {}) {
  const executable = getPowerShellExecutable();

  if (!executable) {
    return "";
  }

  const { stdout } = await execFileAsync(
    executable,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 15_000,
      env: {
        ...process.env,
        ...env
      }
    }
  );

  return stdout;
}

async function getPrinterJobs(printerName) {
  const normalizedPrinterName = normalizeOptionalText(printerName);

  if (!normalizedPrinterName || process.platform !== "win32") {
    return [];
  }

  const script = [
    "$name = $env:CAIXA_AGIL_PRINT_QUEUE_PRINTER",
    "$jobs = @(Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue | Select-Object ID,DocumentName,JobStatus,SubmittedTime,Size,TotalPages,PagesPrinted)",
    "$jobs | ConvertTo-Json -Compress"
  ].join("; ");
  const stdout = await runPowerShell(script, {
    CAIXA_AGIL_PRINT_QUEUE_PRINTER: normalizedPrinterName
  });
  const trimmed = String(stdout || "").trim();

  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);

    return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
  } catch {
    return [];
  }
}

async function clearPrinterJobs(printerName) {
  const normalizedPrinterName = normalizeOptionalText(printerName);

  if (!normalizedPrinterName || process.platform !== "win32") {
    return;
  }

  const script = [
    "$name = $env:CAIXA_AGIL_PRINT_QUEUE_PRINTER",
    "Get-PrintJob -PrinterName $name -ErrorAction SilentlyContinue | Remove-PrintJob -ErrorAction SilentlyContinue"
  ].join("; ");

  await runPowerShell(script, {
    CAIXA_AGIL_PRINT_QUEUE_PRINTER: normalizedPrinterName
  }).catch(() => "");
}

async function waitForPrinterQueueIdle(printerName, options = {}) {
  const normalizedPrinterName = normalizeOptionalText(printerName);
  const timeoutMs = Number(options.timeoutMs ?? 30_000);
  const pollMs = Number(options.pollMs ?? 700);
  const settleMs = Number(options.settleMs ?? 0);
  const startedAt = Date.now();
  let lastJobs = [];

  if (!normalizedPrinterName || process.platform !== "win32") {
    if (settleMs > 0) {
      await delay(settleMs);
    }

    return {
      status: "idle",
      waitedMs: 0,
      pendingJobs: 0,
      jobs: []
    };
  }

  do {
    lastJobs = await getPrinterJobs(normalizedPrinterName);

    if (lastJobs.length === 0) {
      if (settleMs > 0) {
        await delay(settleMs);
      }

      return {
        status: "idle",
        waitedMs: Date.now() - startedAt,
        pendingJobs: 0,
        jobs: []
      };
    }

    await delay(pollMs);
  } while (Date.now() - startedAt < timeoutMs);

  return {
    status: "timeout",
    waitedMs: Date.now() - startedAt,
    pendingJobs: lastJobs.length,
    jobs: lastJobs
  };
}

function createQueueBusyError(printerName, idleState, phase) {
  const jobs = Array.isArray(idleState?.jobs) ? idleState.jobs : [];
  const firstJob = jobs[0] || {};
  const documentName = normalizeOptionalText(firstJob.DocumentName || firstJob.Name);
  const status = normalizeOptionalText(String(firstJob.JobStatus || firstJob.Status || ""));
  const detail = [documentName, status].filter(Boolean).join(" - ");
  const phaseLabel = phase === "after"
    ? "O Windows recebeu a impressão, mas não confirmou a conclusão do trabalho."
    : "A impressora ainda possui um trabalho pendente na fila.";
  const suffix = detail ? ` Trabalho atual: ${detail}.` : "";

  return new Error(`${phaseLabel} Limpe a fila da impressora ${printerName} e tente novamente.${suffix}`);
}

function createPrintJobQueue() {
  let chain = Promise.resolve();

  async function runQueuedPrintJob(options, task) {
    const printerName = normalizeOptionalText(options?.printerName);
    const beforeTimeoutMs = Number(options?.beforeTimeoutMs ?? 30_000);
    const afterTimeoutMs = Number(options?.afterTimeoutMs ?? 0);
    const afterSettleMs = Number(options?.afterSettleMs ?? 1200);
    const shouldWaitAfterResult = typeof options?.shouldWaitAfterResult === "function"
      ? options.shouldWaitAfterResult
      : () => afterTimeoutMs > 0;

    if (printerName) {
      const beforeState = await waitForPrinterQueueIdle(printerName, {
        timeoutMs: beforeTimeoutMs,
        settleMs: 250
      });

      if (beforeState.status !== "idle") {
        await clearPrinterJobs(printerName);

        const recoveredState = await waitForPrinterQueueIdle(printerName, {
          timeoutMs: 10_000,
          settleMs: 250
        });

        if (recoveredState.status !== "idle") {
          throw createQueueBusyError(printerName, recoveredState, "before");
        }
      }
    }

    const result = await task();

    if (printerName && afterTimeoutMs > 0 && shouldWaitAfterResult(result)) {
      const afterState = await waitForPrinterQueueIdle(printerName, {
        timeoutMs: afterTimeoutMs,
        settleMs: afterSettleMs
      });

      if (afterState.status !== "idle") {
        await clearPrinterJobs(printerName);
        await waitForPrinterQueueIdle(printerName, {
          timeoutMs: 10_000,
          settleMs: 250
        }).catch(() => null);
        throw createQueueBusyError(printerName, afterState, "after");
      }
    } else if (afterSettleMs > 0) {
      await delay(afterSettleMs);
    }

    return result;
  }

  function enqueuePrintJob(options, task) {
    const queued = chain.then(() => runQueuedPrintJob(options, task), () => runQueuedPrintJob(options, task));
    chain = queued.catch(() => null);

    return queued;
  }

  return {
    enqueuePrintJob,
    waitForPrinterQueueIdle,
    clearPrinterJobs
  };
}

module.exports = {
  createPrintJobQueue,
  getPrinterJobs,
  waitForPrinterQueueIdle,
  clearPrinterJobs
};
