const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const workerProjectPath = path.join(
  __dirname,
  "..",
  "fiscal-worker",
  "CaixaAgil.FiscalWorker",
  "CaixaAgil.FiscalWorker.csproj"
);

function normalizeScope(scope) {
  const value = String(scope || "").trim();
  return value || "default";
}

function normalizeScopeDirectoryName(scope) {
  const normalized = normalizeScope(scope)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180);

  return normalized || "default";
}

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getWorkerCandidates(app) {
  const envPath = process.env.CAIXA_AGIL_FISCAL_WORKER_EXE;
  const resourcesPath = process.resourcesPath || path.join(__dirname, "resources");
  const packagedPath = path.join(resourcesPath, "fiscal-worker", "CaixaAgil.FiscalWorker.exe");
  const localPublishedPath = path.join(__dirname, "resources", "fiscal-worker", "win-x64", "CaixaAgil.FiscalWorker.exe");
  const debugPath = path.join(
    __dirname,
    "..",
    "fiscal-worker",
    "CaixaAgil.FiscalWorker",
    "bin",
    "Debug",
    "net8.0-windows",
    "CaixaAgil.FiscalWorker.exe"
  );
  const userDataPath = path.join(app.getPath("userData"), "fiscal-worker", "CaixaAgil.FiscalWorker.exe");

  return [envPath, debugPath, localPublishedPath, packagedPath, userDataPath].filter(Boolean);
}

function resolveWorkerCommand(app) {
  const executablePath = getWorkerCandidates(app).find(candidate => fs.existsSync(candidate));

  if (executablePath) {
    return {
      command: executablePath,
      args: []
    };
  }

  if (fs.existsSync(workerProjectPath)) {
    return {
      command: "dotnet",
      args: ["run", "--project", workerProjectPath, "--no-launch-profile", "--"]
    };
  }

  return null;
}

function sanitizeConfigForLog(config) {
  if (!config || typeof config !== "object") {
    return {};
  }

  return JSON.parse(
    JSON.stringify(config, (key, value) => {
      const lowerKey = String(key).toLowerCase();

      if (
        lowerKey.includes("senha") ||
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("csc")
      ) {
        return value ? "***" : value;
      }

      return value;
    })
  );
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
  return directoryPath;
}

function getFiscalBaseDir(app) {
  return ensureDirectory(path.join(app.getPath("userData"), "fiscal"));
}

function getFiscalLogDir(app) {
  return ensureDirectory(path.join(getFiscalBaseDir(app), "logs"));
}

function writeFiscalLog(app, entry) {
  const logDir = getFiscalLogDir(app);
  const dateKey = new Date().toISOString().slice(0, 10);
  const logPath = path.join(logDir, `${dateKey}.jsonl`);
  const payload = {
    ...entry,
    createdAt: new Date().toISOString()
  };

  fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
  return logPath;
}

function buildDefaultDirectories(app, scope) {
  const baseDir = getFiscalBaseDir(app);
  const scopeDir = ensureDirectory(path.join(baseDir, normalizeScopeDirectoryName(scope)));

  return {
    xml: ensureDirectory(path.join(scopeDir, "xml")),
    logs: ensureDirectory(path.join(scopeDir, "logs")),
    pdf: ensureDirectory(path.join(scopeDir, "pdf")),
    certificados: ensureDirectory(path.join(scopeDir, "certificados"))
  };
}

function sanitizeFileName(value) {
  const fileName = String(value || "certificado-a1.pfx")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);

  return fileName || "certificado-a1.pfx";
}

function mergeFiscalConfig(app, scope, savedConfig, overrideConfig) {
  const directories = buildDefaultDirectories(app, scope);
  const baseConfig = savedConfig && typeof savedConfig === "object" ? savedConfig : {};
  const nextConfig = overrideConfig && typeof overrideConfig === "object"
    ? { ...baseConfig, ...overrideConfig }
    : baseConfig;

  return {
    ...nextConfig,
    diretorios: {
      ...directories,
      ...(baseConfig.diretorios || {}),
      ...(overrideConfig?.diretorios || {})
    }
  };
}

function normalizeWorkerResponse(command, rawOutput, rawErrorOutput) {
  const trimmed = String(rawOutput || "").trim();
  const errorOutput = String(rawErrorOutput || "").trim();
  const jsonLine = trimmed
    .split(/\r?\n/)
    .reverse()
    .find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));

  if (!jsonLine) {
    const technicalMessages = [trimmed, errorOutput].filter(Boolean);

    return {
      success: false,
      command,
      status: "worker_saida_invalida",
      friendlyMessage: "O worker fiscal retornou uma saída inválida.",
      technicalMessage: technicalMessages.length > 0 ? technicalMessages.join("\n") : "stdout vazio",
      data: {
        rawOutput: trimmed || null,
        rawErrorOutput: errorOutput || null
      }
    };
  }

  try {
    return JSON.parse(jsonLine);
  } catch (error) {
    return {
      success: false,
      command,
      status: "worker_json_invalido",
      friendlyMessage: "O worker fiscal retornou JSON inválido.",
      technicalMessage: error instanceof Error ? error.message : String(error),
      data: {
        rawOutput: trimmed,
        rawErrorOutput: errorOutput || null
      }
    };
  }
}

function tryReadWorkerResponse(command, rawOutput, rawErrorOutput) {
  const trimmed = String(rawOutput || "").trim();
  const jsonLine = trimmed
    .split(/\r?\n/)
    .reverse()
    .find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));

  if (!jsonLine) {
    return null;
  }

  try {
    JSON.parse(jsonLine);
  } catch {
    return null;
  }

  return normalizeWorkerResponse(command, rawOutput, rawErrorOutput);
}

function killProcessTree(child) {
  if (!child?.pid) {
    return;
  }

  try {
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.unref?.();
      return;
    }
  } catch {
    // Fallback below.
  }

  try {
    child.kill("SIGKILL");
  } catch {
    try {
      child.kill();
    } catch {
      // Processo já finalizado.
    }
  }
}

function runWorker(app, input) {
  const worker = resolveWorkerCommand(app);

  if (!worker) {
    return Promise.resolve({
      success: false,
      command: input.command,
      status: "worker_nao_encontrado",
      friendlyMessage: "Worker fiscal não encontrado.",
      technicalMessage: "Publique o worker .NET ou configure CAIXA_AGIL_FISCAL_WORKER_EXE.",
      data: {
        candidates: getWorkerCandidates(app)
      }
    });
  }

  return new Promise((resolve) => {
    const child = spawn(worker.command, worker.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const settle = (response, options = {}) => {
      if (settled) {
        return;
      }

      clearTimeout(timeout);
      settled = true;

      if (!response.technicalMessage && stderr) {
        response.technicalMessage = stderr.trim();
      }

      if (Object.prototype.hasOwnProperty.call(options, "exitCode")) {
        response.exitCode = options.exitCode;
      }

      if (options.killTree) {
        killProcessTree(child);
      }

      resolve(response);
    };
    const timeoutMs = Number(
      isFiscalPrintCommand(input.command)
        ? process.env.CAIXA_AGIL_FISCAL_PRINT_TIMEOUT_MS || process.env.CAIXA_AGIL_FISCAL_WORKER_TIMEOUT_MS || 60000
        : process.env.CAIXA_AGIL_FISCAL_WORKER_TIMEOUT_MS || 120000
    );
    const timeout = setTimeout(() => {
      settle({
        success: false,
        command: input.command,
        status: "worker_timeout",
        friendlyMessage: "O worker fiscal demorou demais para responder.",
        technicalMessage: stderr || stdout || "Timeout aguardando processo fiscal.",
        data: null
      }, { killTree: true });
    }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 120000);

    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");

      const response = tryReadWorkerResponse(input.command, stdout, stderr);

      if (response) {
        settle(response, { killTree: isFiscalPrintCommand(input.command) && response.success === false });
      }
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", error => {
      settle({
        success: false,
        command: input.command,
        status: "worker_spawn_error",
        friendlyMessage: "Não foi possível iniciar o worker fiscal.",
        technicalMessage: error.message,
        data: {
          worker
        }
      });
    });
    child.once("close", code => {
      const response = normalizeWorkerResponse(input.command, stdout, stderr);
      settle(response, { exitCode: code });
    });

    child.stdin.end(JSON.stringify(input), "utf8");
  });
}

function createQueuedFiscalResponse(command, payload, documentId) {
  return {
    success: true,
    command,
    status: "pendente",
    codigoRetornoSefaz: null,
    mensagemSefaz: null,
    friendlyMessage: "Documento fiscal registrado na fila local.",
    technicalMessage: "Emissão reservada para processamento posterior no PDV.",
    data: {
      documentId,
      modelo: payload?.modelo || "65",
      serie: payload?.serie || null,
      numero: payload?.numero || null
    }
  };
}

function asPositiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getNextFiscalNumber(modelConfig) {
  if (!modelConfig || typeof modelConfig !== "object") {
    return null;
  }

  return (
    asPositiveNumber(modelConfig.proximo_numero) ||
    asPositiveNumber(modelConfig.proximoNumero) ||
    asPositiveNumber(modelConfig.ultimo_numero) ||
    asPositiveNumber(modelConfig.ultimoNumero)
  );
}

function isFiscalEmissionCommand(command) {
  return command === "emitir-nfce" ||
    command === "emitir-nfce-contingencia" ||
    command === "emitir-nfe" ||
    command === "emitir-nfe-contingencia";
}

function isFiscalPrintCommand(command) {
  return command === "imprimir-danfe" || command === "reimprimir-danfe";
}

function isFiscalSerializedCommand(command) {
  return isFiscalEmissionCommand(command) || isFiscalPrintCommand(command);
}

function normalizePrinterName(value) {
  const normalizedValue = typeof value === "string" ? value.trim() : "";

  return normalizedValue || null;
}

function getNestedObject(value) {
  return value && typeof value === "object" ? value : {};
}

function getFiscalPrintPrinterName(config) {
  const printing = getNestedObject(config?.printing);
  const impressao = getNestedObject(config?.impressao);
  const candidates = [
    printing.printerName,
    printing.impressora,
    printing.nomeImpressora,
    impressao.printerName,
    impressao.impressora,
    impressao.nomeImpressora,
    impressao.nome_impressora
  ];

  for (const candidate of candidates) {
    const printerName = normalizePrinterName(candidate);

    if (printerName) {
      return printerName;
    }
  }

  return null;
}

function createPrintQueueFailureResponse(command, error) {
  const message = error instanceof Error ? error.message : String(error || "");

  return {
    success: false,
    command,
    status: "fila_impressao_bloqueada",
    friendlyMessage: message || "A fila de impressão está bloqueada.",
    technicalMessage: message || null,
    data: null
  };
}

function getFiscalModelKey(command, payload, response) {
  const model = String(response?.data?.modelo || payload?.modelo || "");

  return model === "55" || command === "emitir-nfe" || command === "emitir-nfe-contingencia" ? "nfe" : "nfce";
}

function getFiscalWorkerLockKey(scope, command, payload) {
  if (isFiscalPrintCommand(command)) {
    return `${scope}:danfe-print`;
  }

  return `${scope}:emissao:${getFiscalModelKey(command, payload)}`;
}

function getFiscalEnvironment(config) {
  return config?.ambiente === "producao" ? "producao" : "homologacao";
}

function getObject(value) {
  return value && typeof value === "object" ? value : {};
}

function getEnvironmentModelConfig(config, configKey) {
  const ambientes = getObject(config?.ambientes);
  const environment = getObject(ambientes[getFiscalEnvironment(config)]);

  return getObject(environment[configKey]);
}

function getRootModelConfig(config, configKey) {
  return getObject(config?.[configKey]);
}

function getConfiguredNextNumber(modelConfig) {
  const nextNumber = asPositiveNumber(modelConfig?.proximo_numero) || asPositiveNumber(modelConfig?.proximoNumero);

  if (nextNumber) {
    return nextNumber;
  }

  const lastNumber = asPositiveNumber(modelConfig?.ultimo_numero) || asPositiveNumber(modelConfig?.ultimoNumero);

  return lastNumber ? lastNumber + 1 : null;
}

function getConfiguredSerie(modelConfig) {
  return asPositiveNumber(modelConfig?.serie) || asPositiveNumber(modelConfig?.Serie);
}

function getConfiguredCommonSerie(config) {
  const ambiente = getFiscalEnvironment(config);
  const ambientes = getObject(config?.ambientes);
  const environment = getObject(ambientes[ambiente]);
  const series = getObject(config?.series);
  const environmentSeries = getObject(environment?.series);

  return asPositiveNumber(config?.serie_fiscal) ||
    asPositiveNumber(config?.serieFiscal) ||
    asPositiveNumber(config?.serie) ||
    asPositiveNumber(series?.fiscal) ||
    asPositiveNumber(environment?.serie_fiscal) ||
    asPositiveNumber(environment?.serieFiscal) ||
    asPositiveNumber(environment?.serie) ||
    asPositiveNumber(environmentSeries?.fiscal);
}

function updateFiscalModelConfig(config, configKey, modelPatch) {
  const ambiente = getFiscalEnvironment(config);
  const ambientes = getObject(config?.ambientes);
  const currentEnvironment = getObject(ambientes[ambiente]);
  const rootModelConfig = getRootModelConfig(config, configKey);
  const environmentModelConfig = getObject(currentEnvironment[configKey]);
  const nextRootModelConfig = {
    ...rootModelConfig,
    ...modelPatch
  };

  return {
    ...config,
    ...(modelPatch.serie ? { serie_fiscal: modelPatch.serie, serie: modelPatch.serie } : {}),
    [configKey]: nextRootModelConfig,
    ambientes: {
      ...ambientes,
      [ambiente]: {
        ...currentEnvironment,
        ...(modelPatch.serie ? { serie_fiscal: modelPatch.serie, serie: modelPatch.serie } : {}),
        [configKey]: {
          ...environmentModelConfig,
          ...modelPatch
        }
      }
    }
  };
}

function prepareFreshEmissionInput(savedConfig, config, command, payload, options = {}) {
  if (!isFiscalEmissionCommand(command)) {
    return { config, payload };
  }

  const configKey = getFiscalModelKey(command, payload);
  const rootModelConfig = getRootModelConfig(config, configKey);
  const environmentModelConfig = getEnvironmentModelConfig(config, configKey);
  const savedRootModelConfig = getRootModelConfig(savedConfig, configKey);
  const savedEnvironmentModelConfig = getEnvironmentModelConfig(savedConfig, configKey);
  const numberCandidates = [
    asPositiveNumber(payload?.numero),
    getConfiguredNextNumber(rootModelConfig),
    getConfiguredNextNumber(environmentModelConfig),
    getConfiguredNextNumber(savedRootModelConfig),
    getConfiguredNextNumber(savedEnvironmentModelConfig),
    asPositiveNumber(options.minimumNumber)
  ].filter(Boolean);
  const serie = asPositiveNumber(payload?.serie) ||
    getConfiguredCommonSerie(config) ||
    getConfiguredCommonSerie(savedConfig) ||
    getConfiguredSerie(rootModelConfig) ||
    getConfiguredSerie(environmentModelConfig) ||
    getConfiguredSerie(savedRootModelConfig) ||
    getConfiguredSerie(savedEnvironmentModelConfig);
  const numero = numberCandidates.length > 0 ? Math.max(...numberCandidates) : null;
  const modelPatch = {
    ...rootModelConfig,
    ...environmentModelConfig
  };
  const nextPayload = {
    ...payload,
    modelo: payload?.modelo || (configKey === "nfe" ? "55" : "65")
  };

  if (serie) {
    modelPatch.serie = serie;
    nextPayload.serie = serie;
  }

  if (numero) {
    modelPatch.proximo_numero = numero;
    nextPayload.numero = numero;
  }

  return {
    config: updateFiscalModelConfig(config, configKey, modelPatch),
    payload: nextPayload
  };
}

function getResponseData(response) {
  return response?.data && typeof response.data === "object" ? response.data : {};
}

function getSefazCode(response) {
  const data = getResponseData(response);

  return asPositiveNumber(response?.codigoRetornoSefaz) ||
    asPositiveNumber(data.cStat) ||
    asPositiveNumber(data.codigoRetornoSefaz);
}

function getSefazMessage(response) {
  const data = getResponseData(response);

  return String(response?.mensagemSefaz || data.xMotivo || response?.friendlyMessage || "");
}

function isDuplicateFiscalNumberResponse(response) {
  const code = getSefazCode(response);
  const message = getSefazMessage(response);
  const status = String(response?.status || "");

  return status.includes("duplicidade") || code === 204 || code === 539 || /duplicidade\s+de\s+nf-e/i.test(message);
}

function isAutoInutilizationEligible(command, response, payload) {
  if (!isFiscalEmissionCommand(command) || response?.success) {
    return false;
  }

  const status = String(response?.status || "").toLowerCase();
  const code = getSefazCode(response);
  const data = getResponseData(response);
  const numero = asPositiveNumber(data.numero || payload?.numero);
  const serie = asPositiveNumber(data.serie || payload?.serie);

  if (!numero || !serie) {
    return false;
  }

  if (
    status.includes("contingencia") ||
    status.includes("duplicidade") ||
    status.includes("denegada") ||
    status.includes("configuracao") ||
    status.includes("worker") ||
    status.includes("certificado") ||
    status.includes("timeout")
  ) {
    return false;
  }

  if ([100, 101, 102, 110, 135, 155, 204, 301, 302, 539].includes(code)) {
    return false;
  }

  return status.includes("rejeitada") ||
    status.includes("erro_emissao") ||
    status.includes("erro") ||
    response?.success === false;
}

async function advanceFiscalNumber(localStore, scope, config, command, payload, response) {
  const shouldAdvance = (
    response?.success &&
    (response.status === "autorizada" || response.status === "contingencia_emitida" || response.status === "inutilizada")
  ) || isDuplicateFiscalNumberResponse(response);

  if (!shouldAdvance) {
    return;
  }

  const model = String(response?.data?.modelo || payload?.modelo || "");
  const configKey = model === "55" || command === "emitir-nfe" || command === "emitir-nfe-contingencia" || command === "transmitir-nfe-contingencia" ? "nfe" : "nfce";
  const fiscalNumber = asPositiveNumber(response?.data?.numero || payload?.numero);

  if (!fiscalNumber) {
    return;
  }

  const currentModelConfig = config?.[configKey] && typeof config[configKey] === "object" ? config[configKey] : {};
  const currentEnvironmentModelConfig = getEnvironmentModelConfig(config, configKey);
  const currentNext = Math.max(
    getConfiguredNextNumber(currentModelConfig) || getNextFiscalNumber(currentModelConfig) || 1,
    getConfiguredNextNumber(currentEnvironmentModelConfig) || getNextFiscalNumber(currentEnvironmentModelConfig) || 1
  );
  const nextNumber = Math.max(fiscalNumber + 1, currentNext);

  await localStore.saveFiscalConfig({
    scope,
    config: updateFiscalModelConfig(config, configKey, {
      ...currentModelConfig,
      ...currentEnvironmentModelConfig,
      ultimo_numero: fiscalNumber,
      proximo_numero: nextNumber
    })
  });
}

function createFiscalWorkerService(app, localStore, printJobQueue = null) {
  const emissionLocks = new Map();
  let warmupPromise = null;

  async function withEmissionLock(scope, command, payload, task) {
    if (!isFiscalSerializedCommand(command)) {
      return task();
    }

    const lockKey = getFiscalWorkerLockKey(scope, command, payload?.payload || payload);
    const previous = emissionLocks.get(lockKey) || Promise.resolve();
    const current = previous.catch(() => null).then(task);

    emissionLocks.set(lockKey, current);

    try {
      return await current;
    } finally {
      if (emissionLocks.get(lockKey) === current) {
        emissionLocks.delete(lockKey);
      }
    }
  }

  function getFiscalModel(command, payload) {
    const model = String(payload?.modelo || "").trim();

    if (model === "55" || model === "65") {
      return model;
    }

    return command === "emitir-nfe" || command === "emitir-nfe-contingencia" ? "55" : "65";
  }

  async function recordFiscalResponse(scope, command, documentId, config, effectivePayload, response, correlationId) {
    const responseData = getResponseData(response);
    const logPath = writeFiscalLog(app, {
      scope,
      command,
      correlationId,
      success: Boolean(response.success),
      status: response.status,
      friendlyMessage: response.friendlyMessage,
      technicalMessage: response.technicalMessage || null,
      responseData,
      config: sanitizeConfigForLog(config),
      payload: effectivePayload
    });

    if (
      ["registrar-pendente", "emitir-nfce", "emitir-nfce-contingencia", "transmitir-nfce-contingencia", "emitir-nfe", "emitir-nfe-contingencia", "transmitir-nfe-contingencia", "consultar-protocolo", "cancelar", "inutilizar", "imprimir-danfe", "reimprimir-danfe"].includes(command)
    ) {
      await localStore.recordFiscalDocument({
        scope,
        document: {
          id: documentId,
          venda_id: effectivePayload?.vendaId || effectivePayload?.venda_id || null,
          command,
          ambiente: config.ambiente || null,
          modelo: responseData.modelo || effectivePayload?.modelo || (command === "emitir-nfe" || command === "emitir-nfe-contingencia" || command === "transmitir-nfe-contingencia" ? "55" : command === "emitir-nfce" || command === "emitir-nfce-contingencia" || command === "transmitir-nfce-contingencia" ? "65" : null),
          serie: responseData.serie || effectivePayload?.serie || null,
          numero: responseData.numero || responseData.numeroInicial || effectivePayload?.numero || effectivePayload?.numeroInicial || null,
          chave: responseData.chave || effectivePayload?.chave || effectivePayload?.chaveAcesso || null,
          status: response.status || (response.success ? "sucesso" : "erro"),
          codigo_retorno_sefaz: response.codigoRetornoSefaz || responseData.cStat || null,
          mensagem_sefaz: response.mensagemSefaz || responseData.xMotivo || null,
          mensagem_operador: responseData.mensagemOperador || response.friendlyMessage || responseData.xMotivo || null,
          mensagem_tecnica: response.technicalMessage || null,
          protocolo: responseData.protocolo || null,
          xml_enviado_path: responseData.xmlEnviadoPath || effectivePayload?.xmlPath || null,
          xml_autorizado_path: responseData.xmlAutorizadoPath || null,
          pdf_path: responseData.pdfPath || null,
          impressao_status: command.includes("danfe") ? response.status : null,
          raw_result: {
            ...response,
            payload: effectivePayload
          },
          log_path: logPath
        }
      });
    }

    return { logPath, responseData };
  }

  async function tryAutoInvalidateFailedEmission(scope, command, config, effectivePayload, response) {
    if (!isAutoInutilizationEligible(command, response, effectivePayload)) {
      return null;
    }

    const responseData = getResponseData(response);
    const modelo = responseData.modelo || effectivePayload?.modelo || getFiscalModel(command, effectivePayload);
    const serie = responseData.serie || effectivePayload?.serie || null;
    const numero = responseData.numero || effectivePayload?.numero || null;
    const documentId = createId("documento-fiscal");
    const invalidationPayload = {
      documentId,
      vendaId: effectivePayload?.vendaId || effectivePayload?.venda_id || null,
      modelo,
      serie,
      numero,
      numeroInicial: numero,
      numeroFinal: numero,
      ano: effectivePayload?.issuedAt || effectivePayload?.createdAt || effectivePayload?.dhEmi || new Date().toISOString(),
      justificativa: responseData.mensagemOperador || response.friendlyMessage || "Erro tecnico na emissao fiscal do PDV.",
      motivo: responseData.xMotivo || response.status || "Falha de emissao",
      sale: effectivePayload?.sale || null,
      itens: Array.isArray(effectivePayload?.itens) ? effectivePayload.itens : []
    };
    const invalidationRequest = {
      command: "inutilizar",
      correlationId: createId("fiscal-correlation"),
      config,
      payload: invalidationPayload
    };
    const invalidationResponse = await runWorker(app, invalidationRequest);
    const recorded = await recordFiscalResponse(
      scope,
      "inutilizar",
      documentId,
      config,
      invalidationPayload,
      invalidationResponse,
      invalidationRequest.correlationId
    );

    await advanceFiscalNumber(localStore, scope, config, "inutilizar", invalidationPayload, invalidationResponse);

    return {
      documentId,
      success: Boolean(invalidationResponse.success),
      status: invalidationResponse.status,
      friendlyMessage: invalidationResponse.friendlyMessage,
      codigoRetornoSefaz: invalidationResponse.codigoRetornoSefaz || recorded.responseData.cStat || null,
      mensagemSefaz: invalidationResponse.mensagemSefaz || recorded.responseData.xMotivo || null,
      logPath: recorded.logPath,
      modelo,
      serie,
      numero
    };
  }

  async function prepareEmissionWithLocalNumberGuard(scope, savedConfig, config, command, payload, options = {}) {
    let prepared = prepareFreshEmissionInput(savedConfig, config, command, payload, options);

    if (!isFiscalEmissionCommand(command) || typeof localStore.getFiscalNumberGuard !== "function") {
      return prepared;
    }

    const guard = await localStore.getFiscalNumberGuard({
      scope,
      ambiente: getFiscalEnvironment(prepared.config),
      modelo: getFiscalModel(command, prepared.payload),
      serie: prepared.payload?.serie
    });
    const guardMinimum = asPositiveNumber(guard?.nextNumero);

    if (!guardMinimum) {
      return prepared;
    }

    const currentNumber = asPositiveNumber(prepared.payload?.numero);
    const minimumNumber = Math.max(asPositiveNumber(options.minimumNumber) || 0, guardMinimum);

    if (currentNumber && currentNumber >= minimumNumber) {
      return prepared;
    }

    prepared = prepareFreshEmissionInput(savedConfig, prepared.config, command, prepared.payload, {
      ...options,
      minimumNumber
    });

    return prepared;
  }

  async function executeFiscalWorkerRequest(scope, command, savedConfig, config, request, documentId, originalPayload) {
    let effectiveConfig = config;
    let effectivePayload = request.payload;
    async function runRequest() {
      return command === "registrar-pendente"
        ? createQueuedFiscalResponse(command, effectivePayload, documentId)
        : runWorker(app, request);
    }

    let response = null;

    if (isFiscalPrintCommand(command) && printJobQueue?.enqueuePrintJob) {
      try {
        response = await printJobQueue.enqueuePrintJob({
          printerName: getFiscalPrintPrinterName(effectiveConfig),
          beforeTimeoutMs: 30_000,
          afterTimeoutMs: 90_000,
          afterSettleMs: 1500,
          shouldWaitAfterResult: (result) => Boolean(result?.success)
        }, runRequest);
      } catch (error) {
        response = createPrintQueueFailureResponse(command, error);
      }
    } else {
      response = await runRequest();
    }
    const duplicateAttempts = [];

    while (isFiscalEmissionCommand(command) && isDuplicateFiscalNumberResponse(response) && duplicateAttempts.length < 3) {
      const duplicatedNumber = asPositiveNumber(getResponseData(response).numero || effectivePayload.numero);
      const duplicateAttempt = {
        status: response.status,
        cStat: getSefazCode(response),
        numero: duplicatedNumber,
        chave: getResponseData(response).chave || null,
        mensagem: getSefazMessage(response)
      };

      duplicateAttempts.push(duplicateAttempt);
      await advanceFiscalNumber(localStore, scope, effectiveConfig, command, effectivePayload, response);

      const refreshedSavedConfig = await localStore.getFiscalConfig({ scope });
      const refreshedConfig = mergeFiscalConfig(app, scope, refreshedSavedConfig, config);
      const preparedRetry = await prepareEmissionWithLocalNumberGuard(
        scope,
        refreshedSavedConfig,
        refreshedConfig,
        command,
        originalPayload,
        { minimumNumber: duplicatedNumber ? duplicatedNumber + 1 : null }
      );

      effectiveConfig = preparedRetry.config;
      effectivePayload = preparedRetry.payload;
      response = await runWorker(app, {
        ...request,
        correlationId: createId("fiscal-correlation"),
        config: effectiveConfig,
        payload: effectivePayload
      });
    }

    if (duplicateAttempts.length > 0) {
      const retryData = getResponseData(response);
      response = {
        ...response,
        data: {
          ...retryData,
          tentativasDuplicidade: duplicateAttempts,
          recuperadoDeDuplicidade: Boolean(response.success)
        }
      };
    }

    return {
      response,
      config: effectiveConfig,
      payload: effectivePayload
    };
  }

  async function callFiscalWorkerUnlocked(payload, scope, command) {
    const savedConfig = await localStore.getFiscalConfig({ scope });
    let config = mergeFiscalConfig(app, scope, savedConfig, payload?.config);
    const documentId = payload?.documentId || payload?.payload?.documentId || createId("documento-fiscal");
    let effectivePayload = payload?.payload || {};

    if (isFiscalEmissionCommand(command)) {
      const prepared = await prepareEmissionWithLocalNumberGuard(scope, savedConfig, config, command, effectivePayload);

      config = prepared.config;
      effectivePayload = prepared.payload;
    }

    const request = {
      command,
      correlationId: payload?.correlationId || createId("fiscal-correlation"),
      config,
      payload: effectivePayload
    };
    const result = await executeFiscalWorkerRequest(scope, command, savedConfig, config, request, documentId, effectivePayload);
    let response = result.response;
    let responseData = getResponseData(response);

    config = result.config;
    effectivePayload = result.payload;

    const recorded = await recordFiscalResponse(scope, command, documentId, config, effectivePayload, response, request.correlationId);
    const logPath = recorded.logPath;

    await advanceFiscalNumber(localStore, scope, config, command, effectivePayload, response);

    const autoInutilization = await tryAutoInvalidateFailedEmission(scope, command, config, effectivePayload, response);

    if (autoInutilization) {
      responseData = getResponseData(response);
      response = {
        ...response,
        friendlyMessage: autoInutilization.success
          ? `${response.friendlyMessage} Numero fiscal inutilizado automaticamente.`
          : response.friendlyMessage,
        data: {
          ...responseData,
          inutilizacaoAutomatica: autoInutilization
        }
      };
    }

    return {
      ...response,
      logPath
    };
  }

  async function callFiscalWorker(payload) {
    const scope = normalizeScope(payload?.scope);
    const command = String(payload?.command || "").trim();

    if (!command) {
      return {
        success: false,
        command: "desconhecido",
        status: "comando_invalido",
        friendlyMessage: "Informe o comando fiscal.",
        technicalMessage: "Campo command ausente.",
        data: null
      };
    }

    return withEmissionLock(scope, command, payload, () => callFiscalWorkerUnlocked(payload, scope, command));
  }

  async function getFiscalConfig(payload) {
    const scope = normalizeScope(payload?.scope);
    const savedConfig = await localStore.getFiscalConfig({ scope });

    return mergeFiscalConfig(app, scope, savedConfig, null);
  }

  async function saveFiscalConfig(payload) {
    const scope = normalizeScope(payload?.scope);
    const currentConfig = await localStore.getFiscalConfig({ scope });
    const config = mergeFiscalConfig(app, scope, currentConfig, payload?.config || {});

    return localStore.saveFiscalConfig({ scope, config });
  }

  async function saveFiscalCertificate(payload) {
    const scope = normalizeScope(payload?.scope);
    const directories = buildDefaultDirectories(app, scope);
    const fileName = sanitizeFileName(payload?.fileName);
    const base64 = String(payload?.base64 || "");

    if (!base64) {
      throw new Error("Conteúdo do certificado A1 não informado.");
    }

    const filePath = path.join(directories.certificados, fileName);

    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));

    return {
      ok: true,
      path: filePath,
      fileName
    };
  }

  function registerIpc(ipcMain) {
    ipcMain.handle("pdv-fiscal:call-worker", (_event, payload) => callFiscalWorker(payload));
    ipcMain.handle("pdv-fiscal:get-config", (_event, payload) => getFiscalConfig(payload));
    ipcMain.handle("pdv-fiscal:save-config", (_event, payload) => saveFiscalConfig(payload));
    ipcMain.handle("pdv-fiscal:save-certificate", (_event, payload) => saveFiscalCertificate(payload));
    ipcMain.handle("pdv-fiscal:list-documents", (_event, payload) => localStore.listFiscalDocuments(payload));
  }

  function warmUpFiscalWorker() {
    if (warmupPromise) {
      return warmupPromise;
    }

    warmupPromise = runWorker(app, {
      command: "listar-impressoras-disponiveis",
      correlationId: createId("fiscal-warmup"),
      config: {},
      payload: {}
    }).catch(error => ({
      success: false,
      command: "listar-impressoras-disponiveis",
      status: "warmup_error",
      friendlyMessage: "Aquecimento do worker fiscal falhou.",
      technicalMessage: error instanceof Error ? error.message : String(error),
      data: null
    }));

    return warmupPromise;
  }

  return {
    callFiscalWorker,
    getFiscalConfig,
    saveFiscalConfig,
    saveFiscalCertificate,
    registerIpc,
    warmUpFiscalWorker
  };
}

module.exports = {
  createFiscalWorkerService
};
