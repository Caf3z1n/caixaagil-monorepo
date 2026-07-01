"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  PlugZap,
  ShieldCheck
} from "lucide-react";

import { ApiError, apiPost } from "@/lib/api-client";
import { getLocalPdvStore, type PdvRemoteSupportStatus, type PdvUpdateStatus } from "@/lib/local-pdv-store";
import { applyStoredPdvAppScale } from "@/lib/pdv-app-scale";
import { DesktopCashierFlow } from "./cashier-flow";
import { CashierModal } from "./cashier-modal";
import {
  PdvUpdateModal,
  pdvUpdatePreviewStatus,
  previewPdvUpdateModalInDevelopment,
  shouldShowPdvUpdateModal
} from "./pdv-update-modal";
import { PdvScaleSurface } from "./pdv-scale-surface";

type PdvStep = "intro" | "activation" | "success";
type AppState = "checking" | "activation" | "system";
type ConnectivityState = "online" | "offline";

type PdvSession = {
  id: number;
  usuario_id?: number | null;
  identificacao: string | null;
  nome: string;
  status_operacional?: string;
  ultimo_acesso_em?: string | null;
  ultima_sincronizacao_em?: string | null;
};

type BillingStatus = {
  fase: "regular" | "aviso" | "atrasada" | "bloqueada" | string;
  bloqueado: boolean;
  permite_operacao: boolean;
  mensagem?: string | null;
  proximo_pagamento_em?: string | null;
  dias_em_atraso?: number;
  dias_para_bloqueio?: number | null;
  bloqueia_em?: string | null;
};

type CommandSettings = {
  ativo?: boolean;
};

type ShiftSummarySettings = {
  ativo?: boolean;
};

type ExpenseSettings = {
  ativo?: boolean;
};

type EmployeeControlSettings = {
  ativo?: boolean;
};

type ApiPdvSettings = {
  comandas?: CommandSettings | null;
  resumo_turno?: ShiftSummarySettings | null;
  lancar_despesas?: ExpenseSettings | null;
  controle_funcionarios?: EmployeeControlSettings | null;
  formas_pagamento?: Record<string, boolean> | null;
  fiscal?: Record<string, unknown> | null;
};

type ApiEmployee = {
  id: number;
  nome: string;
  codigo_hash: string;
  ativo?: boolean;
  updated_at?: string | null;
};

type PairResponse = {
  credencial_dispositivo: string;
  pdv: PdvSession;
  configuracoes?: ApiPdvSettings | null;
  funcionarios?: ApiEmployee[];
  billing_status?: BillingStatus | null;
};

type SessionResponse = {
  autenticado: boolean;
  pdv: PdvSession;
  configuracoes?: ApiPdvSettings | null;
  funcionarios?: ApiEmployee[];
  billing_status?: BillingStatus | null;
};

type RemoteSupportConfigResponse = {
  provider: "rustdesk" | string;
  servidor: string;
  relay_servidor?: string | null;
  chave_publica?: string | null;
  config_string: string;
  instalador: {
    url: string;
    sha256: string;
  };
};

type RemoteSupportApiStatusResponse = {
  suporte_remoto: {
    status: string;
    rustdesk_id?: string | null;
    versao?: string | null;
    erro?: string | null;
  };
};

const progressSteps: Array<{ id: PdvStep; label: string }> = [
  { id: "intro", label: "Introdução" },
  { id: "activation", label: "Ativação" },
  { id: "success", label: "Pronto" }
];

const deviceIdKey = "caixaagil:pdv:device-id";
const deviceCredentialKey = "caixaagil:pdv:credential";
const activatedPdvKey = "caixaagil:pdv:activated-pdv";
const billingStatusKey = "caixaagil:pdv:billing-status";

function normalizeActivationCode(value: string) {
  const rawCode = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

  if (rawCode.length > 3) {
    return `${rawCode.slice(0, 3)}-${rawCode.slice(3)}`;
  }

  return rawCode;
}

function getRawCode(value: string) {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function getDeviceId() {
  if (typeof window === "undefined") {
    return "desktop-pdv";
  }

  const storedDeviceId = window.localStorage.getItem(deviceIdKey);

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const nextDeviceId = `desktop-${crypto.randomUUID?.() ?? Date.now()}`;
  window.localStorage.setItem(deviceIdKey, nextDeviceId);
  return nextDeviceId;
}

function getStoredCredential() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(deviceCredentialKey);
}

function getStoredPdv() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawPdv = window.localStorage.getItem(activatedPdvKey);

  if (!rawPdv) {
    return null;
  }

  try {
    return JSON.parse(rawPdv) as PdvSession;
  } catch {
    return null;
  }
}

function getStoredBillingStatus() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawStatus = window.localStorage.getItem(billingStatusKey);

  if (!rawStatus) {
    return null;
  }

  try {
    return JSON.parse(rawStatus) as BillingStatus;
  } catch {
    return null;
  }
}

function saveDesktopSession(credencial: string, pdv: PdvSession) {
  window.localStorage.setItem(deviceCredentialKey, credencial);
  window.localStorage.setItem(activatedPdvKey, JSON.stringify(pdv));
}

function saveBillingStatus(status?: BillingStatus | null) {
  if (!status) {
    window.localStorage.removeItem(billingStatusKey);
    return;
  }

  window.localStorage.setItem(billingStatusKey, JSON.stringify(status));
}

function clearDesktopSession() {
  window.localStorage.removeItem(deviceCredentialKey);
  window.localStorage.removeItem(activatedPdvKey);
  window.localStorage.removeItem(billingStatusKey);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Sem registro";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem registro";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function getShiftSequenceScope(pdv: PdvSession | null) {
  if (pdv?.usuario_id && pdv?.id) {
    return `usuario:${pdv.usuario_id}:pdv:${pdv.id}`;
  }

  if (pdv?.id) {
    return `pdv:${pdv.id}`;
  }

  return "local";
}

export default function PdvActivationPage() {
  const [appState, setAppState] = useState<AppState>("checking");
  const [connectivity, setConnectivity] = useState<ConnectivityState>("online");
  const [step, setStep] = useState<PdvStep>("intro");
  const [activationCode, setActivationCode] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [systemMessage, setSystemMessage] = useState("");
  const [hasCompletedStartupUpdateCheck, setHasCompletedStartupUpdateCheck] = useState(false);
  const [startupUpdateStatus, setStartupUpdateStatus] = useState<PdvUpdateStatus | null>(() =>
    previewPdvUpdateModalInDevelopment ? pdvUpdatePreviewStatus : null
  );
  const [isStartupUpdateActionRunning, setIsStartupUpdateActionRunning] = useState(false);
  const [dismissedStartupUpdateVersion, setDismissedStartupUpdateVersion] = useState<string | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [isSupportConfiguring, setIsSupportConfiguring] = useState(false);
  const [supportStatus, setSupportStatus] = useState<PdvRemoteSupportStatus | null>(null);
  const [supportMessage, setSupportMessage] = useState("");
  const [activatedPdv, setActivatedPdv] = useState<PdvSession | null>(null);
  const [initialPdvSettings, setInitialPdvSettings] = useState<ApiPdvSettings | null>(null);
  const [initialEmployees, setInitialEmployees] = useState<ApiEmployee[]>([]);
  const [initialBillingStatus, setInitialBillingStatus] = useState<BillingStatus | null>(null);
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, progressSteps.findIndex((item) => item.id === step));
  const canActivate = getRawCode(activationCode).length === 6 && !isActivating;
  const startupUpdateVersionKey = startupUpdateStatus?.availableVersion || "unknown";
  const shouldShowStartupUpdateModal =
    shouldShowPdvUpdateModal(startupUpdateStatus) && dismissedStartupUpdateVersion !== startupUpdateVersionKey;

  const handleBillingStatusChange = useCallback((status: BillingStatus | null) => {
    setInitialBillingStatus(status);
    saveBillingStatus(status);
  }, []);

  useLayoutEffect(() => {
    applyStoredPdvAppScale();
  }, []);

  useEffect(() => {
    if (hasCompletedStartupUpdateCheck) {
      return undefined;
    }

    if (previewPdvUpdateModalInDevelopment) {
      setStartupUpdateStatus(pdvUpdatePreviewStatus);
      return undefined;
    }

    const store = getLocalPdvStore();
    let isMounted = true;

    if (!store?.checkForUpdates) {
      setHasCompletedStartupUpdateCheck(true);
      return undefined;
    }

    const finishIfNoPendingUpdate = (status: PdvUpdateStatus | null) => {
      if (!shouldShowPdvUpdateModal(status) && status?.status !== "checking") {
        setHasCompletedStartupUpdateCheck(true);
      }
    };

    const unsubscribe = store.onUpdateStatus?.((status) => {
      if (!isMounted) {
        return;
      }

      setStartupUpdateStatus(status);
      finishIfNoPendingUpdate(status);
    });

    store.checkForUpdates()
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setStartupUpdateStatus(status);
        finishIfNoPendingUpdate(status);
      })
      .catch(() => {
        if (isMounted) {
          setHasCompletedStartupUpdateCheck(true);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [hasCompletedStartupUpdateCheck]);

  useEffect(() => {
    if (!previewPdvUpdateModalInDevelopment || startupUpdateStatus?.status !== "downloading") {
      return undefined;
    }

    const updateProgressSteps = [
      { progress: 24, bytesPerSecond: 4.8 * 1024 * 1024 },
      { progress: 48, bytesPerSecond: 7.2 * 1024 * 1024 },
      { progress: 72, bytesPerSecond: 6.6 * 1024 * 1024 },
      { progress: 91, bytesPerSecond: 5.1 * 1024 * 1024 },
      { progress: 100, bytesPerSecond: null }
    ];
    let progressIndex = 0;
    const timer = window.setInterval(() => {
      const nextStep = updateProgressSteps[progressIndex] ?? updateProgressSteps[updateProgressSteps.length - 1];
      progressIndex += 1;

      setStartupUpdateStatus((currentStatus) => {
        if (currentStatus?.status !== "downloading") {
          return currentStatus;
        }

        if (nextStep.progress >= 100) {
          window.clearInterval(timer);
          return {
            ...currentStatus,
            status: "downloaded",
            progress: 100,
            bytesPerSecond: null
          };
        }

        return {
          ...currentStatus,
          progress: nextStep.progress,
          bytesPerSecond: nextStep.bytesPerSecond
        };
      });
    }, 600);

    return () => {
      window.clearInterval(timer);
    };
  }, [startupUpdateStatus?.status]);

  useEffect(() => {
    if (!hasCompletedStartupUpdateCheck) {
      return;
    }

    const storedCredential = getStoredCredential();
    const storedPdv = getStoredPdv();

    if (!storedCredential || !storedPdv) {
      clearDesktopSession();
      setInitialPdvSettings(null);
      setInitialEmployees([]);
      setInitialBillingStatus(null);
      setAppState("activation");
      return;
    }

    setActivatedPdv(storedPdv);
    setInitialBillingStatus(getStoredBillingStatus());

    apiPost<SessionResponse>("/pdvs/sessao", {
      credencial_dispositivo: storedCredential,
      dispositivo_id: getDeviceId()
    })
      .then((response) => {
        saveDesktopSession(storedCredential, response.pdv);
        setActivatedPdv(response.pdv);
        setInitialPdvSettings(response.configuracoes ?? null);
        setInitialEmployees(response.funcionarios ?? []);
        setInitialBillingStatus(response.billing_status ?? null);
        saveBillingStatus(response.billing_status ?? null);
        setConnectivity("online");
        setSystemMessage("");
        setAppState("system");
      })
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
          clearDesktopSession();
          setActivatedPdv(null);
          setInitialPdvSettings(null);
          setInitialEmployees([]);
          setInitialBillingStatus(null);
          setStep("intro");
          setAppState("activation");
          return;
        }

        setConnectivity("offline");
        setSystemMessage("Sem conexão com a API. Mantivemos este PDV aberto com a credencial local salva.");
        setAppState("system");
      });
  }, [hasCompletedStartupUpdateCheck]);

  useEffect(() => {
    if (appState !== "system" || connectivity !== "offline") {
      return;
    }

    let cancelled = false;

    async function retryDesktopSession() {
      const storedCredential = getStoredCredential();
      const storedPdv = getStoredPdv();

      if (!storedCredential || !storedPdv) {
        clearDesktopSession();
        setActivatedPdv(null);
        setInitialPdvSettings(null);
        setInitialEmployees([]);
        setInitialBillingStatus(null);
        setStep("intro");
        setAppState("activation");
        return;
      }

      try {
        const response = await apiPost<SessionResponse>("/pdvs/sessao", {
          credencial_dispositivo: storedCredential,
          dispositivo_id: getDeviceId()
        });

        if (cancelled) {
          return;
        }

        saveDesktopSession(storedCredential, response.pdv);
        setActivatedPdv(response.pdv);
        setInitialPdvSettings(response.configuracoes ?? null);
        setInitialEmployees(response.funcionarios ?? []);
        setInitialBillingStatus(response.billing_status ?? null);
        saveBillingStatus(response.billing_status ?? null);
        setConnectivity("online");
        setSystemMessage("");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
          clearDesktopSession();
          setActivatedPdv(null);
          setInitialPdvSettings(null);
          setInitialEmployees([]);
          setInitialBillingStatus(null);
          setStep("intro");
          setAppState("activation");
        }
      }
    }

    const intervalId = window.setInterval(() => void retryDesktopSession(), 15000);
    window.addEventListener("online", retryDesktopSession);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("online", retryDesktopSession);
    };
  }, [appState, connectivity]);

  useLayoutEffect(() => {
    if (appState !== "activation") {
      return;
    }

    const activePanel = stageRef.current?.querySelector<HTMLElement>(".pdv-onboarding-panel-active");

    if (!activePanel) {
      return;
    }

    const updateHeight = () => {
      setStageHeight(Math.ceil(activePanel.getBoundingClientRect().height));
    };

    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(activePanel);

    return () => observer.disconnect();
  }, [appState, step, activationCode, statusMessage, isActivating, activatedPdv]);

  function goToStep(nextStep: PdvStep) {
    if (nextStep !== step) {
      setStep(nextStep);
    }
  }

  function enterSystem() {
    setConnectivity("online");
    setSystemMessage("");
    setAppState("system");
  }

  function continueAfterStartupUpdateCheck() {
    setDismissedStartupUpdateVersion(startupUpdateVersionKey);
    setHasCompletedStartupUpdateCheck(true);
  }

  async function downloadStartupPdvUpdate() {
    if (previewPdvUpdateModalInDevelopment) {
      setStartupUpdateStatus((currentStatus) => currentStatus
        ? {
            ...currentStatus,
            status: "downloading",
            progress: 8,
            bytesPerSecond: 3.4 * 1024 * 1024
          }
        : currentStatus);
      return;
    }

    const store = getLocalPdvStore();

    if (!store?.downloadUpdate) {
      continueAfterStartupUpdateCheck();
      return;
    }

    setIsStartupUpdateActionRunning(true);

    try {
      const status = await store.downloadUpdate();
      setStartupUpdateStatus(status);
    } finally {
      setIsStartupUpdateActionRunning(false);
    }
  }

  async function installStartupPdvUpdate() {
    if (previewPdvUpdateModalInDevelopment) {
      continueAfterStartupUpdateCheck();
      return;
    }

    const store = getLocalPdvStore();

    if (!store?.installUpdate) {
      continueAfterStartupUpdateCheck();
      return;
    }

    setIsStartupUpdateActionRunning(true);

    try {
      await store.installUpdate();
    } finally {
      setIsStartupUpdateActionRunning(false);
    }
  }

  async function runStartupPdvUpdateAction() {
    if (startupUpdateStatus?.status === "downloaded") {
      await installStartupPdvUpdate();
      return;
    }

    if (startupUpdateStatus?.status === "available") {
      await downloadStartupPdvUpdate();
    }
  }

  function getDesktopCredentialPayload() {
    return {
      credencial_dispositivo: getStoredCredential(),
      dispositivo_id: getDeviceId()
    };
  }

  async function reportRemoteSupportStatus(payload: Record<string, unknown>) {
    const credentialPayload = getDesktopCredentialPayload();

    if (!credentialPayload.credencial_dispositivo) {
      return null;
    }

    return apiPost<RemoteSupportApiStatusResponse>("/pdvs/suporte-remoto/status", {
      ...credentialPayload,
      ...payload
    });
  }

  async function configureRemoteSupport() {
    const credentialPayload = getDesktopCredentialPayload();

    if (!credentialPayload.credencial_dispositivo) {
      setSupportMessage("Ative o PDV antes de configurar o suporte remoto.");
      return;
    }

    const store = getLocalPdvStore();

    if (!store?.installRustDeskSupport) {
      setSupportStatus({ status: "erro", error: "Este ambiente não permite instalação automática do RustDesk." });
      setSupportMessage("Instalação automática disponível apenas no app desktop do Windows.");
      await reportRemoteSupportStatus({
        status: "erro",
        erro: "Instalação automática indisponível neste ambiente."
      }).catch(() => null);
      return;
    }

    setIsSupportConfiguring(true);
    setSupportMessage("");
    setSupportStatus({ status: "configurando", error: null });

    try {
      await reportRemoteSupportStatus({ status: "configurando" }).catch(() => null);
      const config = await apiPost<RemoteSupportConfigResponse>("/pdvs/suporte-remoto/config", credentialPayload);
      const result = await store.installRustDeskSupport({
        installerUrl: config.instalador.url,
        installerSha256: config.instalador.sha256,
        configString: config.config_string
      });

      setSupportStatus(result);

      if (result.status === "configurado" && result.rustdeskId && result.password) {
        const response = await reportRemoteSupportStatus({
          status: "configurado",
          rustdesk_id: result.rustdeskId,
          senha: result.password,
          versao: result.version,
          servidor: config.servidor
        });

        setSupportMessage(`RustDesk configurado. ID ${response?.suporte_remoto.rustdesk_id ?? result.rustdeskId}.`);
        return;
      }

      const errorMessage = result.error || "Não foi possível configurar o RustDesk.";
      setSupportMessage(errorMessage);
      await reportRemoteSupportStatus({
        status: "erro",
        erro: errorMessage
      }).catch(() => null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Não foi possível configurar o suporte remoto.";
      setSupportStatus({ status: "erro", error: errorMessage });
      setSupportMessage(errorMessage);
      await reportRemoteSupportStatus({
        status: "erro",
        erro: errorMessage
      }).catch(() => null);
    } finally {
      setIsSupportConfiguring(false);
    }
  }

  async function activatePdv() {
    if (!canActivate) {
      setStatusMessage("Informe o código de ativação com 6 caracteres.");
      return;
    }

    setIsActivating(true);
    setStatusMessage("");

    try {
      const response = await apiPost<PairResponse>("/pdvs/parear", {
        codigo: activationCode,
        dispositivo_id: getDeviceId()
      });

      saveDesktopSession(response.credencial_dispositivo, response.pdv);
      saveBillingStatus(response.billing_status ?? null);
      setActivatedPdv(response.pdv);
      setInitialPdvSettings(response.configuracoes ?? null);
      setInitialEmployees(response.funcionarios ?? []);
      setInitialBillingStatus(response.billing_status ?? null);
      setConnectivity("online");
      goToStep("success");
      setIsSupportModalOpen(true);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível ativar este PDV.");
    } finally {
      setIsActivating(false);
    }
  }

  function getPanelClass(renderedStep: PdvStep) {
    return [
      "pdv-onboarding-panel",
      `pdv-onboarding-panel-${renderedStep}`,
      renderedStep === step ? "pdv-onboarding-panel-active" : "pdv-onboarding-panel-inactive"
    ].join(" ");
  }

  function renderStep(renderedStep: PdvStep) {
    if (renderedStep === "intro") {
      return (
        <>
          <span className="pdv-onboarding-mark">
            <PlugZap aria-hidden="true" size={24} />
          </span>
          <h1>Caixa Ágil Desktop</h1>
          <p>Este app será usado no computador do caixa para vender, receber e manter o PDV vinculado à sua conta.</p>

          <div className="pdv-onboarding-action-row pdv-onboarding-action-row-single">
            <button className="pdv-onboarding-primary" type="button" onClick={() => goToStep("activation")}>
              Começar ativação
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        </>
      );
    }

    if (renderedStep === "activation") {
      return (
        <>
          <h1>Ative este caixa</h1>
          <p>Digite o código gerado na plataforma web para vincular este computador ao PDV.</p>

          <label className="pdv-code-field">
            <span>Código de ativação</span>
            <input
              autoFocus={step === "activation"}
              inputMode="text"
              maxLength={7}
              onChange={(event) => setActivationCode(normalizeActivationCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void activatePdv();
                }
              }}
              placeholder="ABC-123"
              value={activationCode}
            />
          </label>

          <div className={statusMessage ? "pdv-status pdv-status-error" : "pdv-status"}>
            <span className="pdv-status-icon">
              {statusMessage ? (
                <ShieldCheck aria-hidden="true" size={19} />
              ) : (
                <LoaderCircle aria-hidden="true" className="pdv-spin" size={19} />
              )}
            </span>
            <p>{statusMessage || "Aguardando o código de ativação criado no painel web."}</p>
          </div>

          <div className="pdv-onboarding-action-row">
            <button className="pdv-onboarding-secondary" type="button" onClick={() => goToStep("intro")}>
              <ArrowLeft aria-hidden="true" size={17} />
              Voltar
            </button>
            <button className="pdv-onboarding-primary" disabled={!canActivate} type="button" onClick={activatePdv}>
              {isActivating ? "Ativando" : "Ativar PDV"}
              {isActivating ? (
                <LoaderCircle aria-hidden="true" className="pdv-spin" size={18} />
              ) : (
                <ArrowRight aria-hidden="true" size={18} />
              )}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <span className="pdv-onboarding-mark pdv-onboarding-mark-success">
          <Check aria-hidden="true" size={25} />
        </span>
        <h1>PDV ativado</h1>
        <p>
          {activatedPdv
            ? `${activatedPdv.identificacao ?? "PDV"} · ${activatedPdv.nome} já está vinculado a este computador.`
            : "Este computador já pode iniciar a operação do caixa."}
        </p>

        <div className="pdv-onboarding-action-row">
          <button className="pdv-onboarding-secondary" type="button" onClick={() => setIsSupportModalOpen(true)}>
            Suporte remoto
            <ShieldCheck aria-hidden="true" size={17} />
          </button>
          <button className="pdv-onboarding-primary" type="button" onClick={enterSystem}>
            Abrir sistema
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      </>
    );
  }

  if (appState === "checking") {
    const loadingTitle = hasCompletedStartupUpdateCheck ? "Validando PDV" : "Buscando atualizações";

    return (
      <>
        <main className="pdv-onboarding-page">
          <PdvScaleSurface centered>
            <section className="pdv-onboarding-card pdv-onboarding-card-compact" aria-live="polite">
              <span className="pdv-onboarding-mark">
                <LoaderCircle aria-hidden="true" className="pdv-spin" size={24} />
              </span>
              <h1>{loadingTitle}</h1>
            </section>
          </PdvScaleSurface>
        </main>

        {shouldShowStartupUpdateModal ? (
          <PdvUpdateModal
            hasOpenSession={false}
            isBusy={isStartupUpdateActionRunning}
            status={startupUpdateStatus}
            onPostpone={continueAfterStartupUpdateCheck}
            onUpdate={runStartupPdvUpdateAction}
          />
        ) : null}
      </>
    );
  }

  if (appState === "system") {
    const pdvIdentity = activatedPdv
      ? `${activatedPdv.identificacao ?? "PDV"} · ${activatedPdv.nome}`
      : "PDV autenticado";

    return (
      <main className="pdv-system-page">
        <DesktopCashierFlow
          connectivity={connectivity}
          deviceCredential={getStoredCredential()}
          deviceId={getDeviceId()}
          initialSettings={initialPdvSettings}
          initialEmployees={initialEmployees}
          initialBillingStatus={initialBillingStatus}
          lastAccessLabel={formatDateTime(activatedPdv?.ultimo_acesso_em)}
          onBillingStatusChange={handleBillingStatusChange}
          onConnectivityChange={setConnectivity}
          onSystemMessage={setSystemMessage}
          pdvIdentity={pdvIdentity}
          shiftSequenceScope={getShiftSequenceScope(activatedPdv)}
          systemMessage={systemMessage}
        />
      </main>
    );
  }

  return (
    <>
    <main className="pdv-onboarding-page">
      <PdvScaleSurface centered>
        <section className="pdv-onboarding-card" aria-label="Ativação do Caixa Ágil PDV">
          <div className="pdv-onboarding-stage" ref={stageRef} style={stageHeight ? { height: stageHeight } : undefined}>
            <div
              className="pdv-onboarding-track"
              style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
            >
              {progressSteps.map((item) => (
                <div
                  aria-hidden={item.id !== step}
                  className={getPanelClass(item.id)}
                  inert={item.id !== step}
                  key={item.id}
                >
                  {renderStep(item.id)}
                </div>
              ))}
            </div>
          </div>

          <div className="pdv-onboarding-progress" aria-label={`Etapa ${activeIndex + 1} de ${progressSteps.length}`}>
            {progressSteps.map((item, index) => (
              <span
                className={
                  index === activeIndex
                    ? "pdv-progress-dot pdv-progress-dot-active"
                    : index < activeIndex
                      ? "pdv-progress-dot pdv-progress-dot-done"
                      : "pdv-progress-dot"
                }
                key={item.id}
                title={item.label}
              />
            ))}
          </div>
        </section>
      </PdvScaleSurface>
    </main>

      {isSupportModalOpen ? (
        <CashierModal
          description="Instale e configure o RustDesk deste computador para atendimento remoto."
          dismissible={!isSupportConfiguring}
          headingIcon={<ShieldCheck aria-hidden="true" size={22} />}
          onClose={() => setIsSupportModalOpen(false)}
          title="Suporte remoto"
        >
          <div className="pdv-support-modal-content">
            <div className={`pdv-support-status-card pdv-support-status-${supportStatus?.status ?? "nao_configurado"}`}>
              <span className="pdv-support-status-icon" aria-hidden="true">
                {isSupportConfiguring || supportStatus?.status === "configurando" ? (
                  <LoaderCircle className="pdv-spin" size={20} />
                ) : supportStatus?.status === "configurado" ? (
                  <Check size={20} />
                ) : (
                  <ShieldCheck size={20} />
                )}
              </span>
              <span>
                <strong>
                  {supportStatus?.status === "configurado"
                    ? "RustDesk configurado"
                    : supportStatus?.status === "erro"
                      ? "Configuração incompleta"
                      : isSupportConfiguring
                        ? "Configurando RustDesk"
                        : "Aguardando configuração"}
                </strong>
                <small>
                  {supportMessage ||
                    (supportStatus?.rustdeskId
                      ? `ID ${supportStatus.rustdeskId}`
                      : "A instalação pode solicitar permissão de administrador do Windows.")}
                </small>
              </span>
            </div>

            {supportStatus?.error ? <p className="pdv-support-error">{supportStatus.error}</p> : null}
          </div>

          <div className="pdv-modal-footer-actions">
            <button
              className="pdv-onboarding-secondary"
              disabled={isSupportConfiguring}
              type="button"
              onClick={() => setIsSupportModalOpen(false)}
            >
              Pular por enquanto
            </button>
            <button
              className="pdv-onboarding-primary"
              disabled={isSupportConfiguring}
              type="button"
              onClick={() => void configureRemoteSupport()}
            >
              {isSupportConfiguring ? "Configurando" : supportStatus?.status === "configurado" ? "Reconfigurar" : "Configurar"}
              {isSupportConfiguring ? (
                <LoaderCircle aria-hidden="true" className="pdv-spin" size={18} />
              ) : (
                <ShieldCheck aria-hidden="true" size={18} />
              )}
            </button>
          </div>
        </CashierModal>
      ) : null}
    </>
  );
}
