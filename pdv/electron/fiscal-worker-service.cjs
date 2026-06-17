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

function normalizeWorkerResponse(command, rawOutput) {
  const trimmed = String(rawOutput || "").trim();
  const jsonLine = trimmed
    .split(/\r?\n/)
    .reverse()
    .find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));

  if (!jsonLine) {
    return {
      success: false,
      command,
      status: "worker_saida_invalida",
      friendlyMessage: "O worker fiscal retornou uma saída inválida.",
      technicalMessage: trimmed || "stdout vazio",
      data: null
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
        rawOutput: trimmed
      }
    };
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
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill();
      resolve({
        success: false,
        command: input.command,
        status: "worker_timeout",
        friendlyMessage: "O worker fiscal demorou demais para responder.",
        technicalMessage: stderr || stdout || "Timeout aguardando processo fiscal.",
        data: null
      });
    }, Number(process.env.CAIXA_AGIL_FISCAL_WORKER_TIMEOUT_MS || 120000));

    child.stdout.on("data", chunk => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", error => {
      if (settled) {
        return;
      }

      clearTimeout(timeout);
      settled = true;
      resolve({
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
      if (settled) {
        return;
      }

      clearTimeout(timeout);
      settled = true;
      const response = normalizeWorkerResponse(input.command, stdout);

      if (!response.technicalMessage && stderr) {
        response.technicalMessage = stderr.trim();
      }

      response.exitCode = code;
      resolve(response);
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
  return command === "emitir-nfce" || command === "emitir-nfce-contingencia" || command === "emitir-nfe";
}

function getFiscalModelKey(command, payload, response) {
  const model = String(response?.data?.modelo || payload?.modelo || "");

  return model === "55" || command === "emitir-nfe" ? "nfe" : "nfce";
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

async function advanceFiscalNumber(localStore, scope, config, command, payload, response) {
  const shouldAdvance = (
    response?.success &&
    (response.status === "autorizada" || response.status === "contingencia_emitida")
  ) || isDuplicateFiscalNumberResponse(response);

  if (!shouldAdvance) {
    return;
  }

  const model = String(response?.data?.modelo || payload?.modelo || "");
  const configKey = model === "55" || command === "emitir-nfe" ? "nfe" : "nfce";
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

function createFiscalWorkerService(app, localStore) {
  const emissionLocks = new Map();

  async function withEmissionLock(scope, command, payload, task) {
    if (!isFiscalEmissionCommand(command)) {
      return task();
    }

    const lockKey = `${scope}:${getFiscalModelKey(command, payload?.payload || payload)}`;
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

    return command === "emitir-nfe" ? "55" : "65";
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
    let response = command === "registrar-pendente"
      ? createQueuedFiscalResponse(command, effectivePayload, documentId)
      : await runWorker(app, request);
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
    const response = result.response;
    const responseData = getResponseData(response);

    config = result.config;
    effectivePayload = result.payload;

    const logPath = writeFiscalLog(app, {
      scope,
      command,
      correlationId: request.correlationId,
      success: Boolean(response.success),
      status: response.status,
      friendlyMessage: response.friendlyMessage,
      technicalMessage: response.technicalMessage || null,
      config: sanitizeConfigForLog(config),
      payload: effectivePayload
    });

    if (
      ["registrar-pendente", "emitir-nfce", "emitir-nfce-contingencia", "transmitir-nfce-contingencia", "emitir-nfe", "consultar-protocolo", "cancelar", "inutilizar", "imprimir-danfe", "reimprimir-danfe"].includes(command)
    ) {
      await localStore.recordFiscalDocument({
        scope,
        document: {
          id: documentId,
          venda_id: effectivePayload?.vendaId || effectivePayload?.venda_id || null,
          command,
          ambiente: config.ambiente || null,
          modelo: responseData.modelo || effectivePayload?.modelo || (command === "emitir-nfe" ? "55" : command === "emitir-nfce" || command === "emitir-nfce-contingencia" || command === "transmitir-nfce-contingencia" ? "65" : null),
          serie: responseData.serie || effectivePayload?.serie || null,
          numero: responseData.numero || effectivePayload?.numero || null,
          chave: response?.data?.chave || payload?.payload?.chave || null,
          status: response.status || (response.success ? "sucesso" : "erro"),
          codigo_retorno_sefaz: response.codigoRetornoSefaz || responseData.cStat || null,
          mensagem_sefaz: response.mensagemSefaz || responseData.xMotivo || null,
          mensagem_operador: responseData.mensagemOperador || response.friendlyMessage || responseData.xMotivo || null,
          mensagem_tecnica: response.technicalMessage || null,
          protocolo: response?.data?.protocolo || null,
          xml_enviado_path: response?.data?.xmlEnviadoPath || effectivePayload?.xmlPath || null,
          xml_autorizado_path: response?.data?.xmlAutorizadoPath || null,
          pdf_path: response?.data?.pdfPath || null,
          impressao_status: command.includes("danfe") ? response.status : null,
          raw_result: {
            ...response,
            payload: effectivePayload
          },
          log_path: logPath
        }
      });
    }

    await advanceFiscalNumber(localStore, scope, config, command, effectivePayload, response);

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

  return {
    callFiscalWorker,
    getFiscalConfig,
    saveFiscalConfig,
    saveFiscalCertificate,
    registerIpc
  };
}

module.exports = {
  createFiscalWorkerService
};
