"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  PlugZap,
  ShieldCheck
} from "lucide-react";

import { ApiError, apiPost } from "@/lib/api-client";
import { DesktopCashierFlow } from "./cashier-flow";

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

type PairResponse = {
  credencial_dispositivo: string;
  pdv: PdvSession;
};

type SessionResponse = {
  autenticado: boolean;
  pdv: PdvSession;
};

const progressSteps: Array<{ id: PdvStep; label: string }> = [
  { id: "intro", label: "Introdução" },
  { id: "activation", label: "Ativação" },
  { id: "success", label: "Pronto" }
];

const deviceIdKey = "caixaagil:pdv:device-id";
const deviceCredentialKey = "caixaagil:pdv:credential";
const activatedPdvKey = "caixaagil:pdv:activated-pdv";

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

function saveDesktopSession(credencial: string, pdv: PdvSession) {
  window.localStorage.setItem(deviceCredentialKey, credencial);
  window.localStorage.setItem(activatedPdvKey, JSON.stringify(pdv));
}

function clearDesktopSession() {
  window.localStorage.removeItem(deviceCredentialKey);
  window.localStorage.removeItem(activatedPdvKey);
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
  const [isActivating, setIsActivating] = useState(false);
  const [isUnpairing, setIsUnpairing] = useState(false);
  const [activatedPdv, setActivatedPdv] = useState<PdvSession | null>(null);
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, progressSteps.findIndex((item) => item.id === step));
  const canActivate = getRawCode(activationCode).length === 6 && !isActivating;

  useEffect(() => {
    const storedCredential = getStoredCredential();
    const storedPdv = getStoredPdv();

    if (!storedCredential || !storedPdv) {
      clearDesktopSession();
      setAppState("activation");
      return;
    }

    setActivatedPdv(storedPdv);

    apiPost<SessionResponse>("/pdvs/sessao", {
      credencial_dispositivo: storedCredential,
      dispositivo_id: getDeviceId()
    })
      .then((response) => {
        saveDesktopSession(storedCredential, response.pdv);
        setActivatedPdv(response.pdv);
        setConnectivity("online");
        setSystemMessage("");
        setAppState("system");
      })
      .catch((error) => {
        if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
          clearDesktopSession();
          setActivatedPdv(null);
          setStep("intro");
          setAppState("activation");
          return;
        }

        setConnectivity("offline");
        setSystemMessage("Sem conexão com a API. Mantivemos este PDV aberto com a credencial local salva.");
        setAppState("system");
      });
  }, []);

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
      setActivatedPdv(response.pdv);
      setConnectivity("online");
      goToStep("success");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível ativar este PDV.");
    } finally {
      setIsActivating(false);
    }
  }

  async function unpairPdv() {
    const storedCredential = getStoredCredential();

    if (!storedCredential || isUnpairing) {
      clearDesktopSession();
      setActivatedPdv(null);
      setStep("intro");
      setAppState("activation");
      return;
    }

    setIsUnpairing(true);
    setSystemMessage("");

    try {
      await apiPost<{ message?: string }>("/pdvs/desparear", {
        credencial_dispositivo: storedCredential,
        dispositivo_id: getDeviceId()
      });

      clearDesktopSession();
      setActivatedPdv(null);
      setActivationCode("");
      setStep("intro");
      setAppState("activation");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 400 || error.status === 401 || error.status === 403)) {
        clearDesktopSession();
        setActivatedPdv(null);
        setActivationCode("");
        setStep("intro");
        setAppState("activation");
        return;
      }

      setSystemMessage(error instanceof Error ? error.message : "Não foi possível desvincular este PDV.");
    } finally {
      setIsUnpairing(false);
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

        <div className="pdv-onboarding-action-row pdv-onboarding-action-row-single">
          <button className="pdv-onboarding-primary" type="button" onClick={enterSystem}>
            Abrir sistema
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      </>
    );
  }

  if (appState === "checking") {
    return (
      <main className="pdv-onboarding-page">
        <section className="pdv-onboarding-card pdv-onboarding-card-compact" aria-live="polite">
          <span className="pdv-onboarding-mark">
            <LoaderCircle aria-hidden="true" className="pdv-spin" size={24} />
          </span>
          <h1>Validando caixa</h1>
          <p>Estamos conferindo a credencial local deste PDV.</p>
        </section>
      </main>
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
          isUnpairing={isUnpairing}
          lastAccessLabel={formatDateTime(activatedPdv?.ultimo_acesso_em)}
          onUnpair={unpairPdv}
          onSystemMessage={setSystemMessage}
          pdvIdentity={pdvIdentity}
          shiftSequenceScope={getShiftSequenceScope(activatedPdv)}
          systemMessage={systemMessage}
        />
      </main>
    );
  }

  return (
    <main className="pdv-onboarding-page">
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
    </main>
  );
}
