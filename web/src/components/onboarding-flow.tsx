"use client";

import type { FormEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Clipboard, Download, LoaderCircle, RotateCcw, X } from "lucide-react";

import { AuthFeedback } from "@/components/auth-feedback";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { clearPlatformSession, getStoredPlatformAuthToken } from "@/lib/platform-session";

type OnboardingStep = "intro" | "create-pdv" | "download-desktop" | "activate-pdv" | "done";

type Pdv = {
  id: number;
  nome: string;
  identificacao: string | null;
  status_operacional: string;
  codigo_pareamento?: string;
  codigo_pareamento_expira_em: string | null;
};

type OnboardingStatus = {
  precisa_onboarding: boolean;
  etapa_atual: "criar_pdv" | "ativar_pdv" | "concluido";
  pdvs_total: number;
  pdvs_ativos: number;
  primeiro_pdv: Pdv | null;
};

type PairingCode = {
  codigo: string;
  expiraEm: string | null;
  pdvId: number;
};

type StepDirection = "forward" | "backward";

function getApiMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function getInitialStep(status: OnboardingStatus): OnboardingStep {
  if (!status.precisa_onboarding || status.etapa_atual === "concluido") {
    return "done";
  }

  if (status.etapa_atual === "ativar_pdv") {
    return "download-desktop";
  }

  return "intro";
}

function formatExpiration(value: string | null) {
  if (!value) {
    return "Expira em 30 minutos";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Expira em 30 minutos";
  }

  return `Expira às ${new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date)}`;
}

const progressSteps: Array<{ id: OnboardingStep; label: string }> = [
  { id: "intro", label: "Boas-vindas" },
  { id: "create-pdv", label: "PDV" },
  { id: "download-desktop", label: "Desktop" },
  { id: "activate-pdv", label: "Ativação" },
  { id: "done", label: "Pronto" }
];

const desktopDownloadUrl = "https://api.caixaagil.eticasistemas.com.br/updates/desktop/caixa-agil-setup-1.3.2.exe";

export function OnboardingFlow() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [step, setStep] = useState<OnboardingStep>("intro");
  const [pdvName, setPdvName] = useState("Balcão principal");
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isCodeCopied, setIsCodeCopied] = useState(false);
  const [stageHeight, setStageHeight] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const copiedTimeoutRef = useRef<number | null>(null);

  const activeIndex = Math.max(0, progressSteps.findIndex((item) => item.id === step));
  const currentPdv = status?.primeiro_pdv ?? null;
  function goToStep(nextStep: OnboardingStep, _direction: StepDirection = "forward") {
    if (nextStep === step) {
      return;
    }

    setStep(nextStep);
  }

  async function loadStatus(authToken: string, nextStepFromStatus = false) {
    const result = await apiGet<OnboardingStatus>("/onboarding/status", { token: authToken });

    setStatus(result);
    if (result.primeiro_pdv) {
      setPdvName(result.primeiro_pdv.nome);
    }

    if (nextStepFromStatus) {
      setStep(getInitialStep(result));
    }

    return result;
  }

  useEffect(() => {
    const storedToken = getStoredPlatformAuthToken();

    if (!storedToken) {
      clearPlatformSession();
      router.replace("/");
      return;
    }

    setToken(storedToken);

    loadStatus(storedToken, true)
      .then((result) => {
        if (!result.precisa_onboarding || result.etapa_atual === "concluido") {
          router.replace("/meu-sistema");
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearPlatformSession();
          router.replace("/");
          return;
        }

        setFeedback({
          tone: "error",
          text: getApiMessage(error, "Não foi possível carregar a configuração inicial.")
        });
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  useEffect(() => {
    if (!token || step !== "activate-pdv") {
      return;
    }

    let cancelled = false;
    const authToken = token;

    async function checkActivation() {
      setIsChecking(true);

      try {
        const result = await loadStatus(authToken);

        if (!cancelled && result.pdvs_ativos > 0) {
          goToStep("done");
          setFeedback(null);
        }
      } catch {
        if (!cancelled) {
          setFeedback(null);
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    }

    void checkActivation();
    const timer = window.setInterval(checkActivation, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [step, token]);

  useEffect(() => {
    setIsCodeCopied(false);

    return () => {
      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, [pairing?.codigo]);

  useLayoutEffect(() => {
    if (isLoading) {
      return;
    }

    const activePanel = stageRef.current?.querySelector<HTMLElement>(".onboarding-step-panel-active");

    if (!activePanel) {
      return;
    }

    const updateHeight = () => {
      const contentHeight = Array.from(activePanel.children).reduce((height, child) => {
        const element = child as HTMLElement;
        return Math.max(height, element.offsetTop + element.offsetHeight);
      }, 0);

      setStageHeight(Math.ceil(contentHeight || activePanel.scrollHeight));
    };

    updateHeight();
    const frame = window.requestAnimationFrame(updateHeight);

    const observer = new ResizeObserver(updateHeight);
    observer.observe(activePanel);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isLoading, step, pairing?.codigo, pairing?.expiraEm, isChecking, isSaving, pdvName]);

  async function createFirstPdv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || isSaving) {
      return;
    }

    if (pdvName.trim().length < 2) {
      setFeedback({ tone: "warning", text: "Informe um nome para o PDV." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const existingPdvId = currentPdv?.id ?? pairing?.pdvId ?? null;
      const saved = existingPdvId
        ? await apiPut<Pdv>(`/pdvs/${existingPdvId}`, { nome: pdvName.trim() }, { token })
        : await apiPost<Pdv>("/pdvs", { nome: pdvName.trim() }, { token });
      const nextPairing = saved.codigo_pareamento
        ? saved
        : await apiPost<Pdv>(`/pdvs/${saved.id}/codigo-pareamento`, {}, { token });

      if (nextPairing.codigo_pareamento) {
        setPairing({
          codigo: nextPairing.codigo_pareamento,
          expiraEm: nextPairing.codigo_pareamento_expira_em,
          pdvId: nextPairing.id
        });
      }

      await loadStatus(token);
      goToStep("download-desktop");
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível criar o PDV.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function generatePairingCode() {
    const pdvId = currentPdv?.id ?? pairing?.pdvId;

    if (!token || !pdvId) {
      setFeedback({ tone: "warning", text: "Crie um PDV antes de gerar o código." });
      return false;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const updated = await apiPost<Pdv>(`/pdvs/${pdvId}/codigo-pareamento`, {}, { token });

      if (updated.codigo_pareamento) {
        setPairing({
          codigo: updated.codigo_pareamento,
          expiraEm: updated.codigo_pareamento_expira_em,
          pdvId: updated.id
        });
      }

      await loadStatus(token);
      setFeedback(null);
      return true;
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível gerar o código.")
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function copyCode() {
    if (!pairing?.codigo) {
      setFeedback({ tone: "warning", text: "Gere um código para copiar." });
      return;
    }

    try {
      await navigator.clipboard.writeText(pairing.codigo);
      setIsCodeCopied(true);
      setFeedback(null);

      if (copiedTimeoutRef.current) {
        window.clearTimeout(copiedTimeoutRef.current);
      }

      copiedTimeoutRef.current = window.setTimeout(() => {
        setIsCodeCopied(false);
        copiedTimeoutRef.current = null;
      }, 1800);
    } catch {
      setFeedback({ tone: "warning", text: `Copie manualmente: ${pairing.codigo}` });
    }
  }

  function goToPlatform() {
    router.replace("/meu-sistema");
  }

  async function continueToActivationCode() {
    if (isSaving) {
      return;
    }

    const hasCode = Boolean(pairing?.codigo);
    const canContinue = hasCode || await generatePairingCode();

    if (canContinue) {
      goToStep("activate-pdv");
    }
  }

  function getPanelClass(renderedStep: OnboardingStep) {
    return [
      "onboarding-step-panel",
      `onboarding-step-panel-${renderedStep}`,
      renderedStep === step ? "onboarding-step-panel-active" : "onboarding-step-panel-inactive"
    ].join(" ");
  }

  function renderStepContent(renderedStep: OnboardingStep, titleId: string) {
    if (renderedStep === "intro") {
      return (
        <>
          <h1 id={titleId}>Vamos preparar seu primeiro caixa.</h1>
          <p>Crie o primeiro PDV e ative o computador do caixa.</p>

          <div className="onboarding-action-row onboarding-action-row-single">
            <button className="onboarding-primary" type="button" onClick={() => goToStep("create-pdv")}>
              Começar
              <ArrowRight aria-hidden="true" size={18} />
            </button>
          </div>
        </>
      );
    }

    if (renderedStep === "create-pdv") {
      return (
        <>
          <h1 id={titleId}>Nomeie o caixa</h1>
          <p>Esse cadastro identifica o computador usado no balcão.</p>

          <form className="onboarding-form" onSubmit={createFirstPdv}>
            <label>
              <span>Nome do PDV</span>
              <input
                maxLength={80}
                onChange={(event) => setPdvName(event.target.value)}
                placeholder="Balcão principal"
                type="text"
                value={pdvName}
              />
            </label>
            <div className="onboarding-action-row">
              <button className="onboarding-secondary" type="button" onClick={() => goToStep("intro", "backward")}>
                <ArrowLeft aria-hidden="true" size={17} />
                Voltar
              </button>
              <button className="onboarding-primary" disabled={isSaving} type="submit">
                {isSaving ? "Criando" : "Criar PDV"}
                {isSaving ? (
                  <LoaderCircle aria-hidden="true" className="onboarding-spin" size={18} />
                ) : (
                  <ArrowRight aria-hidden="true" size={18} />
                )}
              </button>
            </div>
          </form>
        </>
      );
    }

    if (renderedStep === "download-desktop") {
      return (
        <>
          <h1 id={titleId}>Baixe o app do caixa</h1>
          <p>No computador do caixa, baixe e instale o Caixa Ágil Desktop antes de ativar este PDV.</p>

          <div className="onboarding-download-box">
            <span className="onboarding-download-icon">
              <Download aria-hidden="true" size={22} />
            </span>
            <strong>Instalador para Windows</strong>
            <p>Use este instalador no PC onde as vendas serão feitas.</p>
            <a className="onboarding-download-link" href={desktopDownloadUrl}>
              Baixar instalador
              <Download aria-hidden="true" size={16} />
            </a>
          </div>

          <div className="onboarding-action-row">
            <button className="onboarding-secondary" type="button" onClick={() => goToStep("create-pdv", "backward")}>
              <ArrowLeft aria-hidden="true" size={17} />
              Voltar
            </button>
            <button className="onboarding-primary" disabled={isSaving} type="button" onClick={continueToActivationCode}>
              {isSaving ? "Preparando" : "Já instalei"}
              {isSaving ? (
                <LoaderCircle aria-hidden="true" className="onboarding-spin" size={18} />
              ) : (
                <ArrowRight aria-hidden="true" size={18} />
              )}
            </button>
          </div>
        </>
      );
    }

    if (renderedStep === "activate-pdv") {
      return (
        <>
          <h1 id={titleId}>Ative o PDV</h1>
          <p>Abra o Caixa Ágil Desktop no computador do caixa e informe este código para vincular o PDV.</p>

          <div className="onboarding-code-box" aria-label="Código de ativação do PDV">
            <small>{currentPdv?.identificacao ?? "PDV-001"} · {currentPdv?.nome ?? pdvName}</small>
            {pairing?.codigo ? <strong>{pairing.codigo}</strong> : <em>Gere um código</em>}
            <div className="onboarding-code-actions">
              <button
                className={isCodeCopied ? "onboarding-code-copy onboarding-code-copy-done" : "onboarding-code-copy"}
                disabled={!pairing?.codigo}
                type="button"
                onClick={copyCode}
              >
                {isCodeCopied ? (
                  <Check aria-hidden="true" size={15} />
                ) : (
                  <Clipboard aria-hidden="true" size={15} />
                )}
                {isCodeCopied ? "Código copiado" : "Copiar código"}
              </button>
              <span>{formatExpiration(pairing?.expiraEm ?? null)}</span>
            </div>
          </div>

          <div className="onboarding-activation-pending">
            <span className="onboarding-activation-spinner">
              <LoaderCircle aria-hidden="true" className="onboarding-spin" size={22} />
            </span>
            <p>{isChecking ? "Verificando ativação no desktop..." : "Aguardando ativação no Caixa Ágil Desktop."}</p>
          </div>

          <div className="onboarding-action-row">
            <button className="onboarding-secondary" type="button" onClick={() => goToStep("download-desktop", "backward")}>
              <ArrowLeft aria-hidden="true" size={17} />
              Voltar
            </button>
            <button
              className="onboarding-primary"
              disabled={isSaving}
              type="button"
              onClick={() => void generatePairingCode()}
            >
              {isSaving ? "Gerando" : "Gerar novo código"}
              {isSaving ? (
                <LoaderCircle aria-hidden="true" className="onboarding-spin" size={18} />
              ) : (
                <RotateCcw aria-hidden="true" size={17} />
              )}
            </button>
          </div>
        </>
      );
    }

    return (
      <>
        <h1 id={titleId}>PDV ativado</h1>
        <p>O primeiro caixa já está vinculado à sua conta.</p>

        <div className="onboarding-action-row">
          <button className="onboarding-secondary" type="button" onClick={() => goToStep("activate-pdv", "backward")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="onboarding-primary" type="button" onClick={goToPlatform}>
            Entrar na plataforma
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <main className="onboarding-page">
        <section className="onboarding-card onboarding-card-compact">
          <span className="onboarding-status-icon">
            <LoaderCircle aria-hidden="true" className="onboarding-spin" size={24} />
          </span>
          <h1>Preparando</h1>
          <p>Estamos conferindo a configuração inicial da sua conta.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="onboarding-page">
      <section className="onboarding-card" aria-labelledby={`onboarding-title-${step}`}>
        {feedback?.tone === "error" ? (
          <div className="onboarding-feedback">
            <AuthFeedback tone={feedback.tone}>{feedback.text}</AuthFeedback>
          </div>
        ) : null}

        <div className="onboarding-step-stage" ref={stageRef} style={stageHeight ? { height: stageHeight } : undefined}>
          <div
            className="onboarding-step-track"
            style={{ transform: `translate3d(-${activeIndex * 100}%, 0, 0)` }}
          >
            {progressSteps.map((item) => (
              <div
                aria-hidden={item.id !== step}
                className={getPanelClass(item.id)}
                inert={item.id !== step}
                key={item.id}
              >
                {renderStepContent(item.id, `onboarding-title-${item.id}`)}
              </div>
            ))}
          </div>

          {feedback?.tone === "error" ? (
            <button className="onboarding-error-reset" type="button" onClick={() => setFeedback(null)}>
              <X aria-hidden="true" size={15} />
              Fechar aviso
            </button>
          ) : null}
        </div>

        <div className="onboarding-progress" aria-label={`Etapa ${activeIndex + 1} de ${progressSteps.length}`}>
          {progressSteps.map((item, index) => (
            <span
              className={
                index === activeIndex
                  ? "onboarding-progress-dot onboarding-progress-dot-active"
                  : index < activeIndex
                    ? "onboarding-progress-dot onboarding-progress-dot-done"
                    : "onboarding-progress-dot"
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
