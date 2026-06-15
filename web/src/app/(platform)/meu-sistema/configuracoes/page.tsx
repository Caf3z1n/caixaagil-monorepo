"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CreditCard,
  FileCog,
  HandCoins,
  LoaderCircle,
  PlugZap,
  QrCode,
  ReceiptText,
  Settings2,
  WalletCards
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PlatformFrame } from "@/components/platform-frame";
import { ApiError, apiGet, apiPut } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

type PaymentMethodKey = "dinheiro" | "pix" | "cartao" | "convenio";
type PaymentSettings = Record<PaymentMethodKey, boolean>;
type ConfigurationFlowStep = "menu" | "payments";
type ConfigurationFlowMotion = "forward" | "backward";

type ConfiguracaoSistema = {
  formas_pagamento: Partial<PaymentSettings>;
  updated_at?: string | null;
};

type ConfigurationArea = {
  title: string;
  icon: LucideIcon;
};

type ConfigurationSection = {
  title: string;
  areas: ConfigurationArea[];
};

type Feedback = {
  tone: "success" | "error" | "warning";
  message: string;
};

const defaultPaymentSettings: PaymentSettings = {
  dinheiro: true,
  pix: true,
  cartao: true,
  convenio: false
};

const paymentMethodOptions: Array<{
  id: PaymentMethodKey;
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    id: "dinheiro",
    title: "Dinheiro",
    description: "Troco no fechamento.",
    icon: Banknote
  },
  {
    id: "pix",
    title: "Pix",
    description: "Recebimento instantâneo.",
    icon: QrCode
  },
  {
    id: "cartao",
    title: "Cartão",
    description: "Maquininha do caixa.",
    icon: CreditCard
  },
  {
    id: "convenio",
    title: "Convênio",
    description: "Cliente para receber depois.",
    icon: HandCoins
  }
];

const plannedConfigurationSections: ConfigurationSection[] = [
  {
    title: "Operação",
    areas: [
      {
        title: "Lançar despesas",
        icon: ReceiptText
      },
      {
        title: "Funcionários",
        icon: BadgeCheck
      }
    ]
  },
  {
    title: "Fiscal",
    areas: [
      {
        title: "Cadastro fiscal",
        icon: FileCog
      },
      {
        title: "APIs externas",
        icon: PlugZap
      },
      {
        title: "Preferências do PDV",
        icon: WalletCards
      }
    ]
  }
];

function normalizePaymentSettings(value?: Partial<PaymentSettings> | null): PaymentSettings {
  const nextSettings = {
    ...defaultPaymentSettings,
    ...value
  };

  if (!Object.values(nextSettings).some(Boolean)) {
    return defaultPaymentSettings;
  }

  return nextSettings;
}

function countActivePaymentMethods(settings: PaymentSettings) {
  return Object.values(settings).filter(Boolean).length;
}

function getFlowStepIndex(step: ConfigurationFlowStep) {
  return step === "menu" ? 1 : 2;
}

export default function MeuSistemaConfiguracoesPage() {
  const [flowStep, setFlowStep] = useState<ConfigurationFlowStep>("menu");
  const [flowMotion, setFlowMotion] = useState<ConfigurationFlowMotion>("forward");
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [savingMethod, setSavingMethod] = useState<PaymentMethodKey | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activePaymentCount = useMemo(() => countActivePaymentMethods(paymentSettings), [paymentSettings]);
  const activeProgressIndex = getFlowStepIndex(flowStep);
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setIsLoading(false);
      setFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para alterar configurações."
      });
      return;
    }

    async function loadSettings() {
      try {
        const configuracao = await apiGet<ConfiguracaoSistema>("/configuracoes", { token });

        if (cancelled) {
          return;
        }

        setPaymentSettings(normalizePaymentSettings(configuracao.formas_pagamento));
        setFeedback(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Não foi possível carregar as configurações."
        });
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function moveToFlowStep(nextStep: ConfigurationFlowStep) {
    if (nextStep === flowStep) {
      return;
    }

    const motion: ConfigurationFlowMotion =
      getFlowStepIndex(nextStep) >= getFlowStepIndex(flowStep) ? "forward" : "backward";
    const root = document.documentElement;
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    root.dataset.platformFlowMotion = motion;

    if (typeof viewTransitionDocument.startViewTransition === "function") {
      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(() => {
          setFlowMotion(motion);
          setFlowStep(nextStep);
        });
      });

      void transition.finished.finally(() => {
        delete root.dataset.platformFlowMotion;
      });
      return;
    }

    root.dataset.platformFlowFallback = "true";
    setFlowMotion(motion);
    setFlowStep(nextStep);
    window.setTimeout(() => {
      delete root.dataset.platformFlowMotion;
      delete root.dataset.platformFlowFallback;
    }, 430);
  }

  async function updatePaymentMethod(method: PaymentMethodKey, active: boolean) {
    if (savingMethod) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para salvar."
      });
      return;
    }

    const nextSettings = {
      ...paymentSettings,
      [method]: active
    };

    if (countActivePaymentMethods(nextSettings) === 0) {
      setFeedback({
        tone: "warning",
        message: "Mantenha pelo menos uma forma de pagamento ativa."
      });
      return;
    }

    const previousSettings = paymentSettings;

    setPaymentSettings(nextSettings);
    setSavingMethod(method);
    setFeedback(null);

    try {
      const configuracao = await apiPut<ConfiguracaoSistema>(
        "/configuracoes/formas-pagamento",
        {
          formas_pagamento: nextSettings
        },
        { token }
      );

      setPaymentSettings(normalizePaymentSettings(configuracao.formas_pagamento));
      setFeedback({
        tone: "success",
        message: "Formas de pagamento salvas."
      });
    } catch (error) {
      setPaymentSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível salvar as formas de pagamento."
      });
    } finally {
      setSavingMethod(null);
    }
  }

  return (
    <PlatformFrame>
      <main className="platform-flow-page configuration-flow-page">
        <div className="platform-flow-shell platform-flow-shell-compact configuration-flow-shell">
          <section className="platform-flow-section-title" aria-label="Configurações">
            <span className="platform-flow-section-main">
              <Settings2 aria-hidden="true" />
              <strong>Configurações</strong>
            </span>
          </section>

          <section className="platform-flow-card configuration-flow-card" aria-label="Fluxo de configurações do PDV">
            {flowStep === "menu" ? (
              <div className={`${flowPanelClassName} configuration-menu-panel`} key="menu">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>Configurações do PDV</h1>
                  <p>Preferências que mudam o caixa.</p>
                </header>

                <div className="configuration-setting-groups" aria-label="Áreas planejadas">
                  {plannedConfigurationSections.map((section) => (
                    <section className="configuration-setting-group" key={section.title}>
                      <h2>{section.title}</h2>

                      <div className="configuration-setting-list">
                        {section.title === "Operação" ? (
                          <button
                            className="configuration-setting-row configuration-setting-action-row"
                            type="button"
                            onClick={() => moveToFlowStep("payments")}
                          >
                            <span className="configuration-setting-icon" aria-hidden="true">
                              <CreditCard size={19} />
                            </span>

                            <span className="configuration-setting-copy">
                              <strong>Formas de pagamento</strong>
                            </span>

                            <span className="configuration-setting-badge configuration-setting-badge-active">
                              {isLoading
                                ? "Carregando"
                                : `${activePaymentCount} ${activePaymentCount === 1 ? "ativa" : "ativas"}`}
                            </span>

                            <ArrowRight className="configuration-setting-action-arrow" size={18} aria-hidden="true" />
                          </button>
                        ) : null}

                        {section.areas.map((area) => {
                          const Icon = area.icon;

                          return (
                            <article className="configuration-setting-row" key={area.title}>
                              <span className="configuration-setting-icon" aria-hidden="true">
                                <Icon size={19} />
                              </span>

                              <span className="configuration-setting-copy">
                                <strong>{area.title}</strong>
                              </span>

                              <span className="configuration-setting-badge">Planejado</span>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {flowStep === "payments" ? (
              <div className={`${flowPanelClassName} configuration-payment-panel`} key="payments">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>Formas de pagamento</h1>
                  <p>Escolha o que aparece no PDV.</p>
                </header>

                <div className="configuration-payment-toolbar" aria-label="Resumo das formas de pagamento">
                  <span className="configuration-payment-toolbar-title">Recebimentos</span>
                  <span className="configuration-setting-badge configuration-setting-badge-active">
                    {activePaymentCount} {activePaymentCount === 1 ? "ativa" : "ativas"}
                  </span>
                </div>

                {feedback ? (
                  <div className={`auth-feedback auth-feedback-${feedback.tone} configuration-feedback`} role="status">
                    <span className="auth-feedback-marker">
                      {feedback.tone === "success" ? (
                        <Check aria-hidden="true" size={17} />
                      ) : (
                        <AlertTriangle aria-hidden="true" size={17} />
                      )}
                    </span>
                    <span className="auth-feedback-copy">
                      <strong>{feedback.message}</strong>
                    </span>
                  </div>
                ) : null}

                {isLoading ? (
                  <div className="configuration-payment-skeleton" aria-live="polite">
                    {paymentMethodOptions.map((option) => (
                      <span key={option.id} />
                    ))}
                  </div>
                ) : (
                  <div className="configuration-payment-methods">
                    {paymentMethodOptions.map((option) => {
                      const Icon = option.icon;
                      const isActive = paymentSettings[option.id];
                      const isLastActive = isActive && activePaymentCount === 1;
                      const isSaving = savingMethod === option.id;

                      return (
                        <button
                          aria-checked={isActive}
                          className={
                            isActive
                              ? "configuration-payment-method configuration-payment-method-active"
                              : "configuration-payment-method"
                          }
                          disabled={Boolean(savingMethod) || isLastActive}
                          key={option.id}
                          onClick={() => updatePaymentMethod(option.id, !isActive)}
                          role="switch"
                          type="button"
                        >
                          <span className="configuration-payment-method-icon" aria-hidden="true">
                            <Icon size={18} />
                          </span>
                          <span className="configuration-payment-method-copy">
                            <strong>{option.title}</strong>
                            <small>{isLastActive ? "Última ativa." : option.description}</small>
                          </span>
                          <span className="configuration-switch" aria-hidden="true">
                            {isSaving ? <LoaderCircle className="configuration-switch-loader" size={15} /> : <span />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="platform-flow-actions configuration-flow-actions" aria-label="Ações do fluxo">
              {flowStep === "menu" ? (
                <Link className="platform-secondary-button" href="/meu-sistema">
                  <ArrowLeft aria-hidden="true" size={17} />
                  Voltar
                </Link>
              ) : (
                <button
                  className="platform-secondary-button"
                  type="button"
                  onClick={() => moveToFlowStep("menu")}
                >
                  <ArrowLeft aria-hidden="true" size={17} />
                  Voltar
                </button>
              )}
            </div>

            <div className="platform-flow-progress" aria-label={`Etapa ${activeProgressIndex + 1} de 3`}>
              {Array.from({ length: 3 }, (_, index) => (
                <span
                  className={
                    index === activeProgressIndex
                      ? "platform-flow-progress-bar platform-flow-progress-bar-active"
                      : index < activeProgressIndex
                        ? "platform-flow-progress-bar platform-flow-progress-bar-done"
                        : "platform-flow-progress-bar"
                  }
                  key={index}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </PlatformFrame>
  );
}
