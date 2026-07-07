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
  Eye,
  EyeOff,
  FileCog,
  HandCoins,
  LoaderCircle,
  PlugZap,
  Printer,
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
import { buildPlatformReturnHref } from "@/lib/platform-return";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import {
  hasFiscalEntitlement,
  loadSubscriptionEntitlements,
  type SubscriptionEntitlements
} from "@/lib/subscription-entitlements";

type PaymentMethodKey = "dinheiro" | "pix" | "cartao" | "parcelamento" | "convenio";
type OperationalPaymentMethodKey = "dinheiro" | "pix" | "cartao" | "parcelamento";
type ConfigurablePaymentMethodKey = Exclude<PaymentMethodKey, "convenio">;
type PaymentSettings = Record<PaymentMethodKey, boolean>;
type CommandSettings = {
  ativo: boolean;
};
type ShiftSummarySettings = {
  ativo: boolean;
};
type ExpenseSettings = {
  ativo: boolean;
};
type EmployeeSettings = {
  ativo: boolean;
};
type ConfigurationFlowStep =
  | "menu"
  | "preferences"
  | "payments"
  | "integrations"
  | "cnpjaIntegration"
  | "fiscalCompany"
  | "fiscalIssuance";
type ConfigurationFlowMotion = "forward" | "backward";

type IntegrationSettings = {
  cnpja: {
    ativo: boolean;
    token_configurado?: boolean;
  };
};

type ConfiguracaoSistema = {
  formas_pagamento: Partial<PaymentSettings>;
  comandas?: Partial<CommandSettings> | null;
  resumo_turno?: Partial<ShiftSummarySettings> | null;
  lancar_despesas?: Partial<ExpenseSettings> | null;
  controle_funcionarios?: Partial<EmployeeSettings> | null;
  fiscal?: Partial<FiscalSettings> | null;
  integracoes?: Partial<IntegrationSettings> | null;
  updated_at?: string | null;
};

type CnpjaTokenResponse = {
  token: string;
  token_configurado?: boolean;
};

type ConfigurationArea = {
  title: string;
  description: string;
  icon: LucideIcon;
  feature?: "convenios" | "employees" | "expenses";
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
  parcelamento: false,
  convenio: false
};

const defaultCommandSettings: CommandSettings = {
  ativo: false
};

const defaultShiftSummarySettings: ShiftSummarySettings = {
  ativo: false
};

const defaultExpenseSettings: ExpenseSettings = {
  ativo: false
};

const defaultEmployeeSettings: EmployeeSettings = {
  ativo: false
};

const defaultIntegrationSettings: IntegrationSettings = {
  cnpja: {
    ativo: false,
    token_configurado: false
  }
};

const operationalPaymentMethodKeys: OperationalPaymentMethodKey[] = ["dinheiro", "pix", "cartao", "parcelamento"];

const paymentMethodOptions: Array<{
  id: ConfigurablePaymentMethodKey;
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
    id: "parcelamento",
    title: "Parcelamento",
    description: "Venda em parcelas no PDV.",
    icon: ReceiptText
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

function normalizeCommandSettings(value?: Partial<CommandSettings> | null): CommandSettings {
  return {
    ativo: value?.ativo === true
  };
}

function normalizeShiftSummarySettings(value?: Partial<ShiftSummarySettings> | null): ShiftSummarySettings {
  return {
    ativo: value?.ativo === true
  };
}

function normalizeExpenseSettings(value?: Partial<ExpenseSettings> | null): ExpenseSettings {
  return {
    ativo: value?.ativo === true
  };
}

function normalizeEmployeeSettings(value?: Partial<EmployeeSettings> | null): EmployeeSettings {
  return {
    ativo: value?.ativo === true
  };
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
  return paymentMethodOptions.filter(option => settings[option.id]).length;
}

function countActiveOperationalPaymentMethods(settings: PaymentSettings) {
  return operationalPaymentMethodKeys.filter(method => settings[method]).length;
}

function withFiscalEmissionStatus(settings: FiscalSettings, active: boolean) {
  const normalizedSettings = normalizeFiscalSettings(settings);
  const activeEnvironment = {
    ...normalizedSettings.ambientes[normalizedSettings.ambiente],
    ativo: active
  };

  return normalizeFiscalSettings({
    ...normalizedSettings,
    ambientes: {
      ...normalizedSettings.ambientes,
      [normalizedSettings.ambiente]: activeEnvironment
    },
    ...activeEnvironment
  });
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
  onRevealCnpjaToken,
  onSave
}: {
  settings: IntegrationSettings;
  isLoading: boolean;
  onCancel: () => void;
  onRevealCnpjaToken: () => Promise<string>;
  onSave: (settings: IntegrationSettings, cnpjaToken: string) => Promise<IntegrationSettings>;
}) {
  const [draft, setDraft] = useState<IntegrationSettings>(() => normalizeIntegrationSettings(settings));
  const [cnpjaToken, setCnpjaToken] = useState("");
  const [showCnpjaToken, setShowCnpjaToken] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCnpjaToken, setIsLoadingCnpjaToken] = useState(false);

  useEffect(() => {
    setDraft(normalizeIntegrationSettings(settings));
    setCnpjaToken("");
    setShowCnpjaToken(false);
    setIsLoadingCnpjaToken(false);
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
        setShowCnpjaToken(false);
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

  function handleToggleCnpjaTokenVisibility() {
    void (async () => {
      if (showCnpjaToken) {
        setShowCnpjaToken(false);
        return;
      }

      if (!cnpjaToken && draft.cnpja.token_configurado) {
        setIsLoadingCnpjaToken(true);
        setFeedback(null);

        try {
          const currentToken = await onRevealCnpjaToken();

          setCnpjaToken(currentToken);
          setShowCnpjaToken(true);
        } catch (error) {
          setFeedback({
            tone: "error",
            message:
              error instanceof ApiError || error instanceof Error
                ? error.message
                : "Não foi possível carregar o token da CNPJá."
          });
        } finally {
          setIsLoadingCnpjaToken(false);
        }

        return;
      }

      setShowCnpjaToken(true);
    })();
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
            <div className="fiscal-secret-input fiscal-secret-input-inline">
              <input
                autoComplete="new-password"
                disabled={isSaving || isLoadingCnpjaToken}
                placeholder={draft.cnpja.token_configurado ? "Token já configurado" : ""}
                type={showCnpjaToken ? "text" : "password"}
                value={cnpjaToken}
                onChange={event => handleCnpjaTokenChange(event.currentTarget.value)}
              />
              <button
                aria-label={isLoadingCnpjaToken ? "Carregando token" : showCnpjaToken ? "Ocultar token" : "Mostrar token"}
                disabled={isSaving || isLoadingCnpjaToken}
                type="button"
                onClick={handleToggleCnpjaTokenVisibility}
              >
                {isLoadingCnpjaToken ? (
                  <LoaderCircle aria-hidden="true" className="platform-spin" size={17} />
                ) : showCnpjaToken ? (
                  <EyeOff aria-hidden="true" size={17} />
                ) : (
                  <Eye aria-hidden="true" size={17} />
                )}
              </button>
            </div>
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
  const [commandSettings, setCommandSettings] = useState<CommandSettings>(defaultCommandSettings);
  const [shiftSummarySettings, setShiftSummarySettings] = useState<ShiftSummarySettings>(defaultShiftSummarySettings);
  const [expenseSettings, setExpenseSettings] = useState<ExpenseSettings>(defaultExpenseSettings);
  const [employeeSettings, setEmployeeSettings] = useState<EmployeeSettings>(defaultEmployeeSettings);
  const [fiscalSettings, setFiscalSettings] = useState<FiscalSettings>(defaultFiscalSettings);
  const [integrationSettings, setIntegrationSettings] = useState<IntegrationSettings>(defaultIntegrationSettings);
  const [entitlements, setEntitlements] = useState<SubscriptionEntitlements | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingMethod, setSavingMethod] = useState<PaymentMethodKey | null>(null);
  const [isSavingCommands, setIsSavingCommands] = useState(false);
  const [isSavingShiftSummary, setIsSavingShiftSummary] = useState(false);
  const [isSavingExpenses, setIsSavingExpenses] = useState(false);
  const [isSavingEmployees, setIsSavingEmployees] = useState(false);
  const [isSavingFiscalEmission, setIsSavingFiscalEmission] = useState(false);
  const [pendingFiscalDeactivation, setPendingFiscalDeactivation] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activePaymentCount = useMemo(() => countActivePaymentMethods(paymentSettings), [paymentSettings]);
  const activeOperationalPaymentCount = useMemo(
    () => countActiveOperationalPaymentMethods(paymentSettings),
    [paymentSettings]
  );
  const activeProgressIndex = getFlowStepIndex(flowStep);
  const progressStepCount = getFlowStepCount(flowStep);
  const fiscalDeactivationPresence = useModalPresence(pendingFiscalDeactivation);
  const hasVisibleModal = fiscalDeactivationPresence.isPresent;
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const isFiscalStep = isFiscalFlowStep(flowStep);
  const isFiscalFeatureBlocked = entitlements !== null && !hasFiscalEntitlement(entitlements);
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
          title: "Preferências do PDV",
          description: "Comandas e impressões do caixa.",
          icon: Settings2,
          step: "preferences"
        },
        {
          title: "Formas de pagamento",
          description: "Recebimentos habilitados no PDV.",
          icon: CreditCard,
          step: "payments"
        },
        {
          title: "Funcionários",
          description: "Permissões e identificação no caixa.",
          icon: BadgeCheck,
          feature: "employees"
        },
        {
          title: "Despesas",
          description: "Saídas de dinheiro no PDV.",
          icon: WalletCards,
          feature: "expenses"
        },
        {
          title: "Convênios",
          description: "Clientes para receber depois.",
          icon: HandCoins,
          feature: "convenios"
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
  usePlatformModalScrollLock(hasVisibleModal);
  const fiscalDeactivationDismiss = useModalDismiss(pendingFiscalDeactivation, closeFiscalDeactivationModal);

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

    const authToken = token;

    async function loadSettings() {
      try {
        const [configuracao, subscriptionEntitlements] = await Promise.all([
          apiGet<ConfiguracaoSistema>("/configuracoes", { cacheTtlMs: 60_000, token: authToken }),
          loadSubscriptionEntitlements(authToken)
        ]);

        if (cancelled) {
          return;
        }

        setPaymentSettings(normalizePaymentSettings(configuracao.formas_pagamento));
        setCommandSettings(normalizeCommandSettings(configuracao.comandas));
        setShiftSummarySettings(normalizeShiftSummarySettings(configuracao.resumo_turno));
        setExpenseSettings(normalizeExpenseSettings(configuracao.lancar_despesas));
        setEmployeeSettings(normalizeEmployeeSettings(configuracao.controle_funcionarios));
        setFiscalSettings(normalizeFiscalSettings(configuracao.fiscal));
        setIntegrationSettings(normalizeIntegrationSettings(configuracao.integracoes));
        setEntitlements(subscriptionEntitlements);
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

  useEffect(() => {
    if (!isFiscalFeatureBlocked || !isFiscalStep) {
      return;
    }

    setFlowMotion("backward");
    setFlowStep("menu");
    setFeedback({
      tone: "warning",
      message: "Seu plano atual não permite recursos fiscais."
    });
  }, [isFiscalFeatureBlocked, isFiscalStep]);

  function moveToFlowStep(nextStep: ConfigurationFlowStep) {
    if (isFiscalFeatureBlocked && isFiscalFlowStep(nextStep)) {
      setFeedback({
        tone: "warning",
        message: "Seu plano atual não permite recursos fiscais."
      });
      return;
    }

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

    if (countActiveOperationalPaymentMethods(nextSettings) === 0) {
      setFeedback({
        tone: "warning",
        message: "Mantenha pelo menos uma forma operacional ativa para o PDV."
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
        message:
          method === "convenio"
            ? active
              ? "Convênios ativados."
              : "Convênios desativados."
            : method === "parcelamento"
              ? active
                ? "Parcelamento ativado."
                : "Parcelamento desativado."
            : "Formas de pagamento salvas."
      });
    } catch (error) {
      setPaymentSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : method === "convenio"
              ? "Não foi possível alterar convênios."
              : method === "parcelamento"
                ? "Não foi possível alterar parcelamento."
                : "Não foi possível salvar as formas de pagamento."
      });
    } finally {
      setSavingMethod(null);
    }
  }

  async function updateFiscalSettings(nextSettings: FiscalSettings) {
    if (isFiscalFeatureBlocked) {
      throw new ApiError("Seu plano atual não permite recursos fiscais.", 403, "PLAN_FEATURE_REQUIRED");
    }

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

  async function updateCommandSettings(active: boolean) {
    if (isSavingCommands) {
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

    const previousSettings = commandSettings;
    const nextSettings = { ativo: active };

    setCommandSettings(nextSettings);
    setIsSavingCommands(true);
    setFeedback(null);

    try {
      const configuracao = await apiPut<ConfiguracaoSistema>(
        "/configuracoes/comandas",
        {
          comandas: nextSettings
        },
        { token }
      );

      setCommandSettings(normalizeCommandSettings(configuracao.comandas));
      setFeedback({
        tone: "success",
        message: active ? "Comandas ativadas." : "Comandas desativadas."
      });
    } catch (error) {
      setCommandSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível alterar comandas."
      });
    } finally {
      setIsSavingCommands(false);
    }
  }

  async function updateShiftSummarySettings(active: boolean) {
    if (isSavingShiftSummary) {
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

    const previousSettings = shiftSummarySettings;
    const nextSettings = { ativo: active };

    setShiftSummarySettings(nextSettings);
    setIsSavingShiftSummary(true);
    setFeedback(null);

    try {
      const configuracao = await apiPut<ConfiguracaoSistema>(
        "/configuracoes/resumo-turno",
        {
          resumo_turno: nextSettings
        },
        { token }
      );

      setShiftSummarySettings(normalizeShiftSummarySettings(configuracao.resumo_turno));
      setFeedback({
        tone: "success",
        message: active ? "Resumo do turno ativado." : "Resumo do turno desativado."
      });
    } catch (error) {
      setShiftSummarySettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível alterar o resumo do turno."
      });
    } finally {
      setIsSavingShiftSummary(false);
    }
  }

  async function updateExpenseSettings(active: boolean) {
    if (isSavingExpenses) {
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

    const previousSettings = expenseSettings;
    const nextSettings = { ativo: active };

    setExpenseSettings(nextSettings);
    setIsSavingExpenses(true);
    setFeedback(null);

    try {
      const configuracao = await apiPut<ConfiguracaoSistema>(
        "/configuracoes/despesas",
        {
          lancar_despesas: nextSettings
        },
        { token }
      );

      setExpenseSettings(normalizeExpenseSettings(configuracao.lancar_despesas));
      setFeedback({
        tone: "success",
        message: active ? "Despesas ativadas." : "Despesas desativadas."
      });
    } catch (error) {
      setExpenseSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível alterar despesas."
      });
    } finally {
      setIsSavingExpenses(false);
    }
  }

  async function updateEmployeeSettings(active: boolean) {
    if (isSavingEmployees) {
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

    const previousSettings = employeeSettings;
    const nextSettings = { ativo: active };

    setEmployeeSettings(nextSettings);
    setIsSavingEmployees(true);
    setFeedback(null);

    try {
      const configuracao = await apiPut<ConfiguracaoSistema>(
        "/configuracoes/funcionarios",
        {
          controle_funcionarios: nextSettings
        },
        { token }
      );

      setEmployeeSettings(normalizeEmployeeSettings(configuracao.controle_funcionarios));
      setFeedback({
        tone: "success",
        message: active ? "Funcionários ativados." : "Funcionários desativados."
      });
    } catch (error) {
      setEmployeeSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível alterar funcionários."
      });
    } finally {
      setIsSavingEmployees(false);
    }
  }

  function closeFiscalDeactivationModal() {
    if (!isSavingFiscalEmission) {
      setPendingFiscalDeactivation(false);
    }
  }

  async function confirmFiscalDeactivation() {
    const updated = await updateFiscalEmissionStatus(false);

    if (updated) {
      setPendingFiscalDeactivation(false);
    }
  }

  async function updateFiscalEmissionStatus(active: boolean) {
    if (isSavingFiscalEmission) {
      return false;
    }

    const previousSettings = fiscalSettings;
    const nextSettings = withFiscalEmissionStatus(fiscalSettings, active);

    setFiscalSettings(nextSettings);
    setIsSavingFiscalEmission(true);
    setFeedback(null);

    try {
      await updateFiscalSettings(nextSettings);
      setFeedback({
        tone: "success",
        message: active ? "Emissão fiscal ativada." : "Emissão fiscal desativada."
      });

      if (!active && flowStep === "fiscalIssuance") {
        moveToFlowStep("menu");
      }

      return true;
    } catch (error) {
      setFiscalSettings(previousSettings);
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível alterar a emissão fiscal."
      });

      return false;
    } finally {
      setIsSavingFiscalEmission(false);
    }
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

  async function revealCnpjaToken() {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      throw new ApiError("Sessão expirada. Entre novamente para ver o token.", 401);
    }

    const result = await apiGet<CnpjaTokenResponse>("/configuracoes/integracoes/cnpja/token", { token });

    return result.token;
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
                          const isEmployeesArea = area.feature === "employees";
                          const isExpensesArea = area.feature === "expenses";
                          const isConveniosArea = area.feature === "convenios";
                          const isFiscalIssuanceArea = targetStep === "fiscalIssuance";
                          const isFiscalArea = targetStep === "fiscalCompany" || targetStep === "fiscalIssuance";

                          if (isFiscalArea && isFiscalFeatureBlocked) {
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

                                <span className="configuration-setting-status">Bloqueado</span>
                              </article>
                            );
                          }

                          if (isEmployeesArea) {
                            const isEmployeesActive = employeeSettings.ativo;
                            const employeeEntryClassName = isEmployeesActive
                              ? "configuration-setting-fiscal-entry"
                              : "configuration-setting-fiscal-entry configuration-setting-fiscal-entry-disabled";
                            const employeeEntryContent = (
                              <>
                                <span className="configuration-setting-icon" aria-hidden="true">
                                  <Icon size={19} />
                                </span>

                                <span className="configuration-setting-copy">
                                  <strong>{area.title}</strong>
                                  <small>{area.description}</small>
                                </span>
                              </>
                            );

                            return (
                              <article
                                className={
                                  isEmployeesActive
                                    ? "configuration-setting-row configuration-setting-fiscal-option"
                                    : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                                }
                                key={area.title}
                                onBlur={stopConfigurationWave}
                                onPointerEnter={startConfigurationPointerWave}
                                onPointerLeave={stopConfigurationWave}
                              >
                                {isEmployeesActive ? (
                                  <Link
                                    className={employeeEntryClassName}
                                    href={buildPlatformReturnHref("/meu-sistema/funcionarios", "/meu-sistema/configuracoes")}
                                  >
                                    {employeeEntryContent}
                                  </Link>
                                ) : (
                                  <span className={`${employeeEntryClassName} configuration-setting-fiscal-entry-static`}>
                                    {employeeEntryContent}
                                  </span>
                                )}

                                <button
                                  aria-checked={isEmployeesActive}
                                  aria-label={isEmployeesActive ? "Desativar funcionários" : "Ativar funcionários"}
                                  className={
                                    isEmployeesActive
                                      ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                                      : "configuration-setting-fiscal-toggle"
                                  }
                                  disabled={isLoading || isSavingEmployees}
                                  role="switch"
                                  type="button"
                                  onClick={() => void updateEmployeeSettings(!isEmployeesActive)}
                                >
                                  <span className="configuration-switch" aria-hidden="true">
                                    {isSavingEmployees ? (
                                      <LoaderCircle className="configuration-switch-loader" size={15} />
                                    ) : (
                                      <span />
                                    )}
                                  </span>
                                </button>
                              </article>
                            );
                          }

                          if (isExpensesArea) {
                            const isExpensesActive = expenseSettings.ativo;
                            const expenseEntryClassName = isExpensesActive
                              ? "configuration-setting-fiscal-entry"
                              : "configuration-setting-fiscal-entry configuration-setting-fiscal-entry-disabled";
                            const expenseEntryContent = (
                              <>
                                <span className="configuration-setting-icon" aria-hidden="true">
                                  <Icon size={19} />
                                </span>

                                <span className="configuration-setting-copy">
                                  <strong>{area.title}</strong>
                                  <small>{area.description}</small>
                                </span>
                              </>
                            );

                            return (
                              <article
                                className={
                                  isExpensesActive
                                    ? "configuration-setting-row configuration-setting-fiscal-option"
                                    : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                                }
                                key={area.title}
                                onBlur={stopConfigurationWave}
                                onPointerEnter={startConfigurationPointerWave}
                                onPointerLeave={stopConfigurationWave}
                              >
                                {isExpensesActive ? (
                                  <Link
                                    className={expenseEntryClassName}
                                    href={buildPlatformReturnHref("/meu-sistema/despesas", "/meu-sistema/configuracoes")}
                                  >
                                    {expenseEntryContent}
                                  </Link>
                                ) : (
                                  <span className={`${expenseEntryClassName} configuration-setting-fiscal-entry-static`}>
                                    {expenseEntryContent}
                                  </span>
                                )}

                                <button
                                  aria-checked={isExpensesActive}
                                  aria-label={isExpensesActive ? "Desativar despesas" : "Ativar despesas"}
                                  className={
                                    isExpensesActive
                                      ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                                      : "configuration-setting-fiscal-toggle"
                                  }
                                  disabled={isLoading || isSavingExpenses}
                                  role="switch"
                                  type="button"
                                  onClick={() => void updateExpenseSettings(!isExpensesActive)}
                                >
                                  <span className="configuration-switch" aria-hidden="true">
                                    {isSavingExpenses ? (
                                      <LoaderCircle className="configuration-switch-loader" size={15} />
                                    ) : (
                                      <span />
                                    )}
                                  </span>
                                </button>
                              </article>
                            );
                          }

                          if (isConveniosArea) {
                            const isConvenioActive = paymentSettings.convenio;
                            const isSavingConvenio = savingMethod === "convenio";

                            return (
                              <article
                                className={
                                  isConvenioActive
                                    ? "configuration-setting-row configuration-setting-fiscal-option"
                                    : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                                }
                                key={area.title}
                                onBlur={stopConfigurationWave}
                                onPointerEnter={startConfigurationPointerWave}
                                onPointerLeave={stopConfigurationWave}
                              >
                                <Link
                                  className="configuration-setting-fiscal-entry"
                                  href={buildPlatformReturnHref("/meu-sistema/convenios", "/meu-sistema/configuracoes")}
                                >
                                  <span className="configuration-setting-icon" aria-hidden="true">
                                    <Icon size={19} />
                                  </span>

                                  <span className="configuration-setting-copy">
                                    <strong>{area.title}</strong>
                                    <small>{area.description}</small>
                                  </span>
                                </Link>

                                <button
                                  aria-checked={isConvenioActive}
                                  aria-label={isConvenioActive ? "Desativar convênios" : "Ativar convênios"}
                                  className={
                                    isConvenioActive
                                      ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                                      : "configuration-setting-fiscal-toggle"
                                  }
                                  disabled={isLoading || Boolean(savingMethod)}
                                  role="switch"
                                  type="button"
                                  onClick={() => void updatePaymentMethod("convenio", !isConvenioActive)}
                                >
                                  <span className="configuration-switch" aria-hidden="true">
                                    {isSavingConvenio ? (
                                      <LoaderCircle className="configuration-switch-loader" size={15} />
                                    ) : (
                                      <span />
                                    )}
                                  </span>
                                </button>
                              </article>
                            );
                          }

                          if (isFiscalIssuanceArea) {
                            const isFiscalEmissionActive = fiscalSettings.ativo;
                            const canOpenFiscalIssuance = isFiscalEmissionActive && !isLoading && !isSavingFiscalEmission;

                            return (
                              <article
                                className={
                                  isFiscalEmissionActive
                                    ? "configuration-setting-row configuration-setting-fiscal-option"
                                    : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                                }
                                key={area.title}
                                onBlur={stopConfigurationWave}
                                onPointerEnter={startConfigurationPointerWave}
                                onPointerLeave={stopConfigurationWave}
                              >
                                <button
                                  aria-disabled={!canOpenFiscalIssuance}
                                  className={
                                    isFiscalEmissionActive
                                      ? "configuration-setting-fiscal-entry"
                                      : "configuration-setting-fiscal-entry configuration-setting-fiscal-entry-disabled"
                                  }
                                  disabled={!canOpenFiscalIssuance}
                                  type="button"
                                  onClick={() => canOpenFiscalIssuance && moveToFlowStep("fiscalIssuance")}
                                >
                                  <span className="configuration-setting-icon" aria-hidden="true">
                                    <Icon size={19} />
                                  </span>

                                  <span className="configuration-setting-copy">
                                    <strong>{area.title}</strong>
                                    <small>{area.description}</small>
                                  </span>
                                </button>

                                <button
                                  aria-checked={isFiscalEmissionActive}
                                  aria-label={isFiscalEmissionActive ? "Desativar emissão fiscal" : "Ativar emissão fiscal"}
                                  className={
                                    isFiscalEmissionActive
                                      ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                                      : "configuration-setting-fiscal-toggle"
                                  }
                                  disabled={isLoading || isSavingFiscalEmission}
                                  role="switch"
                                  type="button"
                                  onClick={() => {
                                    if (isFiscalEmissionActive) {
                                      setPendingFiscalDeactivation(true);
                                      return;
                                    }

                                    void updateFiscalEmissionStatus(true);
                                  }}
                                >
                                  <span className="configuration-switch" aria-hidden="true">
                                    {isSavingFiscalEmission ? (
                                      <LoaderCircle className="configuration-switch-loader" size={15} />
                                    ) : (
                                      <span />
                                    )}
                                  </span>
                                </button>
                              </article>
                            );
                          }

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

            {flowStep === "preferences" ? (
              <div className={`${flowPanelClassName} configuration-payment-panel`} key="preferences">
                <header className="platform-flow-head configuration-flow-head">
                  <h1>Preferências do PDV</h1>
                  <p>Comportamento do caixa durante a operação.</p>
                </header>

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
                    <span />
                    <span />
                  </div>
                ) : (
                  <div className="configuration-setting-list">
                    <article
                      className={
                        commandSettings.ativo
                          ? "configuration-setting-row configuration-setting-fiscal-option"
                          : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                      }
                      onBlur={stopConfigurationWave}
                      onPointerEnter={startConfigurationPointerWave}
                      onPointerLeave={stopConfigurationWave}
                    >
                      <span className="configuration-setting-fiscal-entry configuration-setting-fiscal-entry-static">
                        <span className="configuration-setting-icon" aria-hidden="true">
                          <ReceiptText size={19} />
                        </span>

                        <span className="configuration-setting-copy">
                          <strong>Comandas</strong>
                          <small>Criação de comandas no PDV.</small>
                        </span>
                      </span>

                      <button
                        aria-checked={commandSettings.ativo}
                        aria-label={commandSettings.ativo ? "Desativar comandas" : "Ativar comandas"}
                        className={
                          commandSettings.ativo
                            ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                            : "configuration-setting-fiscal-toggle"
                        }
                        disabled={isLoading || isSavingCommands}
                        role="switch"
                        type="button"
                        onClick={() => void updateCommandSettings(!commandSettings.ativo)}
                      >
                        <span className="configuration-switch" aria-hidden="true">
                          {isSavingCommands ? (
                            <LoaderCircle className="configuration-switch-loader" size={15} />
                          ) : (
                            <span />
                          )}
                        </span>
                      </button>
                    </article>

                    <article
                      className={
                        shiftSummarySettings.ativo
                          ? "configuration-setting-row configuration-setting-fiscal-option"
                          : "configuration-setting-row configuration-setting-fiscal-option configuration-setting-fiscal-option-disabled"
                      }
                      onBlur={stopConfigurationWave}
                      onPointerEnter={startConfigurationPointerWave}
                      onPointerLeave={stopConfigurationWave}
                    >
                      <span className="configuration-setting-fiscal-entry configuration-setting-fiscal-entry-static">
                        <span className="configuration-setting-icon" aria-hidden="true">
                          <Printer size={19} />
                        </span>

                        <span className="configuration-setting-copy">
                          <strong>Resumo do turno</strong>
                          <small>Imprimir no fechamento do caixa</small>
                        </span>
                      </span>

                      <button
                        aria-checked={shiftSummarySettings.ativo}
                        aria-label={shiftSummarySettings.ativo ? "Desativar resumo do turno" : "Ativar resumo do turno"}
                        className={
                          shiftSummarySettings.ativo
                            ? "configuration-setting-fiscal-toggle configuration-setting-fiscal-toggle-active"
                            : "configuration-setting-fiscal-toggle"
                        }
                        disabled={isLoading || isSavingShiftSummary}
                        role="switch"
                        type="button"
                        onClick={() => void updateShiftSummarySettings(!shiftSummarySettings.ativo)}
                      >
                        <span className="configuration-switch" aria-hidden="true">
                          {isSavingShiftSummary ? (
                            <LoaderCircle className="configuration-switch-loader" size={15} />
                          ) : (
                            <span />
                          )}
                        </span>
                      </button>
                    </article>
                  </div>
                )}
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
                      const isOperationalMethod = operationalPaymentMethodKeys.includes(option.id as OperationalPaymentMethodKey);
                      const isLastActive = isOperationalMethod && isActive && activeOperationalPaymentCount === 1;
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
                            <small>{isLastActive ? "Última operacional." : option.description}</small>
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
                  onRevealCnpjaToken={revealCnpjaToken}
                  settings={integrationSettings}
                  onSave={updateIntegrationSettings}
                />
              </div>
            ) : null}

            {isFiscalStep && !isFiscalFeatureBlocked ? (
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

      {fiscalDeactivationPresence.isPresent ? (
        <div
          className="platform-modal-backdrop fiscal-confirm-backdrop"
          data-modal-state={fiscalDeactivationPresence.state}
          role="presentation"
          {...fiscalDeactivationDismiss.backdropProps}
        >
          <section
            aria-labelledby="fiscal-deactivation-confirm-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact fiscal-delete-confirm-modal"
            role="dialog"
          >
            <div className="platform-modal-head">
              <span className="platform-modal-kicker">Emissão fiscal</span>
              <h2 id="fiscal-deactivation-confirm-title">Desativar emissão fiscal?</h2>
              <p>
                Ao confirmar, o sistema deixa de emitir notas e o módulo fiscal fica inativo até ser ativado novamente.
              </p>
            </div>

            <div className="platform-modal-actions fiscal-delete-confirm-actions">
              <button
                className="platform-secondary-button"
                disabled={isSavingFiscalEmission}
                type="button"
                onClick={closeFiscalDeactivationModal}
              >
                Cancelar
              </button>

              <button
                className="fiscal-danger-button fiscal-edit-delete-button"
                disabled={isSavingFiscalEmission}
                type="button"
                onClick={() => void confirmFiscalDeactivation()}
              >
                {isSavingFiscalEmission ? (
                  <LoaderCircle aria-hidden="true" className="configuration-switch-loader" size={16} />
                ) : (
                  <AlertTriangle aria-hidden="true" size={16} />
                )}
                Desativar fiscal
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </PlatformFrame>
  );
}
