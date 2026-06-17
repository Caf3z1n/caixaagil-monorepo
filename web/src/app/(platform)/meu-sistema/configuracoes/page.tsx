"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FocusEvent, FormEvent, PointerEvent } from "react";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Building2,
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

import {
  defaultFiscalSettings,
  FiscalSettingsManager,
  normalizeFiscalSettings,
  type FiscalSettings
} from "@/components/fiscal-settings-manager";
import { PlatformFrame } from "@/components/platform-frame";
import { ApiError, apiGet, apiPut } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

type PaymentMethodKey = "dinheiro" | "pix" | "cartao" | "convenio";
type PaymentSettings = Record<PaymentMethodKey, boolean>;
type ConfigurationFlowStep = "menu" | "payments" | "integrations" | "cnpjaIntegration" | "fiscalCompany" | "fiscalIssuance";
type ConfigurationFlowMotion = "forward" | "backward";

type IntegrationSettings = {
  cnpja: {
    ativo: boolean;
    token_configurado?: boolean;
  };
};

type ConfiguracaoSistema = {
  formas_pagamento: Partial<PaymentSettings>;
  fiscal?: Partial<FiscalSettings> | null;
  integracoes?: Partial<IntegrationSettings> | null;
  updated_at?: string | null;
};

type ConfigurationArea = {
  title: string;
  description: string;
  icon: LucideIcon;
  step?: ConfigurationFlowStep;
};

type ConfigurationSection = {
  title: string;
  subtitle?: string;
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

const defaultIntegrationSettings: IntegrationSettings = {
  cnpja: {
    ativo: false,
    token_configurado: false
  }
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

const externalApiOptions: ConfigurationArea[] = [
  {
    title: "CNPJá",
    description: "CNPJ e CEP com token de acesso.",
    icon: PlugZap,
    step: "cnpjaIntegration"
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

function normalizeIntegrationSettings(value?: Partial<IntegrationSettings> | null): IntegrationSettings {
  return {
    cnpja: {
      ativo: value?.cnpja?.ativo === true,
      token_configurado: value?.cnpja?.token_configurado === true
    }
  };
}

function countActivePaymentMethods(settings: PaymentSettings) {
  return Object.values(settings).filter(Boolean).length;
}

function getFlowStepIndex(step: ConfigurationFlowStep) {
  if (step === "menu") {
    return 1;
  }

  if (step === "cnpjaIntegration") {
    return 3;
  }

  return 2;
}

function getFlowStepCount(step: ConfigurationFlowStep) {
  return Math.max(getFlowStepIndex(step) + 1, 3);
}

function isFiscalFlowStep(step: ConfigurationFlowStep) {
  return step === "fiscalCompany" || step === "fiscalIssuance";
}

function setConfigurationWaveOrigin(target: HTMLElement, x: number, y: number) {
  target.style.setProperty("--system-menu-hover-x", `${x}px`);
  target.style.setProperty("--system-menu-hover-y", `${y}px`);
}

function startConfigurationPointerWave(event: PointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setConfigurationWaveOrigin(target, event.clientX - rect.left, event.clientY - rect.top);
  target.classList.remove("configuration-setting-row--hovering");
  void target.offsetWidth;
  target.classList.add("configuration-setting-row--hovering");
}

function startConfigurationFocusWave(event: FocusEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setConfigurationWaveOrigin(target, rect.width / 2, rect.height / 2);
  target.classList.remove("configuration-setting-row--hovering");
  void target.offsetWidth;
  target.classList.add("configuration-setting-row--hovering");
}

function stopConfigurationWave(event: FocusEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  event.currentTarget.classList.remove("configuration-setting-row--hovering");
}

function IntegrationSettingsManager({
  settings,
  isLoading,
  onCancel,
  onSave
}: {
  settings: IntegrationSettings;
  isLoading: boolean;
  onCancel: () => void;
  onSave: (settings: IntegrationSettings, cnpjaToken: string) => Promise<IntegrationSettings>;
}) {
  const [draft, setDraft] = useState<IntegrationSettings>(() => normalizeIntegrationSettings(settings));
  const [cnpjaToken, setCnpjaToken] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeIntegrationSettings(settings));
    setCnpjaToken("");
  }, [settings]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void (async () => {
      const nextCnpjaToken = cnpjaToken.trim();
      const nextDraft = {
        cnpja: {
          ...draft.cnpja,
          ativo: true
        }
      };

      if (!nextDraft.cnpja.token_configurado && !nextCnpjaToken) {
        setFeedback({
          tone: "warning",
          message: "Informe o token da CNPJá para ativar a integração."
        });
        return;
      }

      setIsSaving(true);
      setFeedback(null);

      try {
        const savedSettings = await onSave(nextDraft, nextCnpjaToken);
        setDraft(normalizeIntegrationSettings(savedSettings));
        setCnpjaToken("");
        setFeedback({
          tone: "success",
          message: "CNPJá salvo. As buscas por CNPJ e CEP já usam este token."
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof ApiError || error instanceof Error
              ? error.message
              : "Não foi possível salvar as integrações."
        });
      } finally {
        setIsSaving(false);
      }
    })();
  }

  function handleCnpjaTokenChange(value: string) {
    setCnpjaToken(value);
  }

  if (isLoading) {
    return (
      <div className="fiscal-settings-skeleton" aria-live="polite">
        <span />
        <span />
      </div>
    );
  }

  return (
    <form className="configuration-integrations-form fiscal-group-form" onSubmit={handleSubmit}>
      {feedback ? (
        <div className={`auth-feedback auth-feedback-${feedback.tone} fiscal-settings-feedback`} role="status">
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

      <section className="fiscal-form-section fiscal-settings-section configuration-integration-token-section">
        <div className="fiscal-form-grid">
          <label>
            <span>Token de acesso</span>
            <input
              autoComplete="new-password"
              disabled={isSaving}
              placeholder={draft.cnpja.token_configurado ? "Token já configurado" : ""}
              type="password"
              value={cnpjaToken}
              onChange={event => handleCnpjaTokenChange(event.currentTarget.value)}
            />
          </label>

        </div>
      </section>

      <div className="fiscal-settings-submit-row">
        <button className="platform-secondary-button" disabled={isSaving} type="button" onClick={onCancel}>
          <ArrowLeft aria-hidden="true" size={17} />
          Cancelar
        </button>
        <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
          Salvar
        </button>
      </div>
    </form>
  );
}

export default function MeuSistemaConfiguracoesPage() {
  const [flowStep, setFlowStep] = useState<ConfigurationFlowStep>("menu");
  const [flowMotion, setFlowMotion] = useState<ConfigurationFlowMotion>("forward");
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [fiscalSettings, setFiscalSettings] = useState<FiscalSettings>(defaultFiscalSettings);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [savingMethod, setSavingMethod] = useState<PaymentMethodKey | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activePaymentCount = useMemo(() => countActivePaymentMethods(paymentSettings), [paymentSettings]);
  const activeProgressIndex = getFlowStepIndex(flowStep);
  const progressStepCount = getFlowStepCount(flowStep);
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const isFiscalStep = isFiscalFlowStep(flowStep);
  const hasInlineFlowActions = isFiscalStep || flowStep === "cnpjaIntegration";
  const shellClassName =
    isFiscalStep
      ? "platform-flow-shell platform-flow-shell-compact configuration-flow-shell configuration-flow-shell-fiscal"
      : "platform-flow-shell platform-flow-shell-compact configuration-flow-shell";
  const cardClassName =
    isFiscalStep
      ? "platform-flow-card configuration-flow-card configuration-flow-card-fiscal"
      : "platform-flow-card configuration-flow-card";
  const configurationSections: ConfigurationSection[] = [
    {
      title: "PDV",
      areas: [
        {
          title: "Formas de pagamento",
          description: "Recebimentos habilitados no PDV.",
          icon: CreditCard,
          step: "payments"
        },
        {
          title: "Lançar despesas",
          description: "Saídas rápidas no fechamento.",
          icon: ReceiptText
        },
        {
          title: "Funcionários",
          description: "Permissões e identificação no caixa.",
          icon: BadgeCheck
        },
        {
          title: "Preferências do PDV",
          description: "Impressão e comportamento no caixa.",
          icon: WalletCards
        },
        {
          title: "APIs externas",
          description: "Conectores e tokens externos.",
          icon: PlugZap,
          step: "integrations"
        }
      ]
    },
    {
      title: "FISCAL",
      areas: [
        {
          title: "Cadastro fiscal",
          description: "Dados cadastrais da empresa.",
          icon: Building2,
          step: "fiscalCompany"
        },
        {
          title: "Emissão fiscal",
          description: "Certificado A1, CSC, séries e numeração.",
          icon: FileCog,
          step: "fiscalIssuance"
        }
      ]
    }
  ];

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
        setFiscalSettings(normalizeFiscalSettings(configuracao.fiscal));
        setIntegrationSettings(normalizeIntegrationSettings(configuracao.integracoes));
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

  async function updateFiscalSettings(nextSettings: FiscalSettings) {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      throw new ApiError("Sessão expirada. Entre novamente para salvar.", 401);
    }

    const configuracao = await apiPut<ConfiguracaoSistema>(
      "/configuracoes/fiscal",
      {
        fiscal: nextSettings
      },
      { token }
    );
    const normalizedSettings = normalizeFiscalSettings(configuracao.fiscal);

    setFiscalSettings(normalizedSettings);

    return normalizedSettings;
  }

  async function updateIntegrationSettings(nextSettings: IntegrationSettings, cnpjaToken: string) {
    const token = getStoredPlatformAuthToken();
    const nextCnpjaToken = cnpjaToken.trim();

    if (!token) {
      throw new ApiError("Sessão expirada. Entre novamente para salvar.", 401);
    }

    const configuracao = await apiPut<ConfiguracaoSistema>(
      "/configuracoes/integracoes",
      {
        integracoes: {
          cnpja: {
            ativo: nextSettings.cnpja.ativo || Boolean(nextCnpjaToken),
            ...(nextCnpjaToken ? { token: nextCnpjaToken } : {})
          }
        }
      },
      { token }
    );
    const normalizedSettings = normalizeIntegrationSettings(configuracao.integracoes);

    setIntegrationSettings(normalizedSettings);

    return normalizedSettings;
  }

  return (
    <PlatformFrame>
      <main className="platform-flow-page configuration-flow-page">
        <div className={shellClassName}>
          <section className="platform-flow-section-title" aria-label="Configurações">
            <span className="platform-flow-section-main">
              <Settings2 aria-hidden="true" />
              <strong>Configurações</strong>
            </span>
          </section>

          <section className={cardClassName} aria-label="Fluxo de configurações do PDV">
            {flowStep === "menu" ? (
              <div className={`${flowPanelClassName} configuration-menu-panel`} key="menu">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>Escolha uma opção</h1>
                  <p>Preferências que mudam o caixa.</p>
                </header>

                <div className="configuration-setting-groups" aria-label="Áreas de configuração">
                  {configurationSections.map(section => (
                    <section className="configuration-setting-group" key={section.title}>
                      <header className="configuration-setting-group-head">
                        <h2>{section.title}</h2>
                        {section.subtitle ? <p>{section.subtitle}</p> : null}
                      </header>

                      <div className="configuration-setting-list">
                        {section.areas.map(area => {
                          const Icon = area.icon;
                          const targetStep = area.step;

                          if (targetStep) {
                            return (
                              <button
                                className="configuration-setting-row configuration-setting-action-row"
                                key={area.title}
                                type="button"
                                onBlur={stopConfigurationWave}
                                onFocus={startConfigurationFocusWave}
                                onClick={() => moveToFlowStep(targetStep)}
                                onPointerEnter={startConfigurationPointerWave}
                                onPointerLeave={stopConfigurationWave}
                              >
                                <span className="configuration-setting-icon" aria-hidden="true">
                                  <Icon size={19} />
                                </span>

                                <span className="configuration-setting-copy">
                                  <strong>{area.title}</strong>
                                  <small>{area.description}</small>
                                </span>

                                <ArrowRight className="configuration-setting-action-arrow" size={18} aria-hidden="true" />
                              </button>
                            );
                          }

                          return (
                            <article
                              aria-disabled="true"
                              className="configuration-setting-row configuration-setting-row-disabled"
                              key={area.title}
                            >
                              <span className="configuration-setting-icon" aria-hidden="true">
                                <Icon size={19} />
                              </span>

                              <span className="configuration-setting-copy">
                                <strong>{area.title}</strong>
                                <small>{area.description}</small>
                              </span>

                              <span className="configuration-setting-status">Em breve</span>
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
                    {paymentMethodOptions.map(option => (
                      <span key={option.id} />
                    ))}
                  </div>
                ) : (
                  <div className="configuration-payment-methods">
                    {paymentMethodOptions.map(option => {
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

            {flowStep === "integrations" ? (
              <div className={`${flowPanelClassName} configuration-menu-panel`} key="integrations">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>APIs externas</h1>
                  <p>Escolha uma integração.</p>
                </header>

                <div className="configuration-setting-groups" aria-label="Integrações externas">
                  <section className="configuration-setting-group">
                    <header className="configuration-setting-group-head">
                      <h2>Integrações</h2>
                    </header>

                    <div className="configuration-setting-list">
                      {externalApiOptions.map(area => {
                        const Icon = area.icon;

                        return (
                          <button
                            className="configuration-setting-row configuration-setting-action-row"
                            key={area.title}
                            type="button"
                            onBlur={stopConfigurationWave}
                            onFocus={startConfigurationFocusWave}
                            onClick={() => area.step && moveToFlowStep(area.step)}
                            onPointerEnter={startConfigurationPointerWave}
                            onPointerLeave={stopConfigurationWave}
                          >
                            <span className="configuration-setting-icon" aria-hidden="true">
                              <Icon size={19} />
                            </span>

                            <span className="configuration-setting-copy">
                              <strong>{area.title}</strong>
                              <small>{area.description}</small>
                            </span>

                            <ArrowRight className="configuration-setting-action-arrow" size={18} aria-hidden="true" />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}

            {flowStep === "cnpjaIntegration" ? (
              <div className={`${flowPanelClassName} configuration-integrations-panel`} key="cnpjaIntegration">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>CNPJá</h1>
                  <p>Preenchimento automático por CNPJ e CEP.</p>
                </header>

                <IntegrationSettingsManager
                  isLoading={isLoading}
                  onCancel={() => moveToFlowStep("integrations")}
                  settings={integrationSettings}
                  onSave={updateIntegrationSettings}
                />
              </div>
            ) : null}

            {isFiscalStep ? (
              <div className={`${flowPanelClassName} configuration-fiscal-panel`} key={flowStep}>
                <header className="platform-flow-head configuration-flow-head">
                  <h1>{flowStep === "fiscalCompany" ? "Cadastro fiscal" : "Emissão fiscal"}</h1>
                  <p>
                    {flowStep === "fiscalCompany"
                      ? "Dados cadastrais da empresa."
                      : "Certificado, CSC e numeração."}
                  </p>
                </header>

                <FiscalSettingsManager
                  isLoading={isLoading}
                  mode={flowStep === "fiscalCompany" ? "company" : "issuance"}
                  onCancel={() => moveToFlowStep("menu")}
                  settings={fiscalSettings}
                  onSave={updateFiscalSettings}
                />
              </div>
            ) : null}

            {!hasInlineFlowActions ? (
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
            ) : null}

            <div className="platform-flow-progress" aria-label={`Etapa ${activeProgressIndex + 1} de ${progressStepCount}`}>
              {Array.from({ length: progressStepCount }, (_, index) => (
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
