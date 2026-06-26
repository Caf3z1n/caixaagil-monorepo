"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  LoaderCircle,
  LockKeyhole,
  X
} from "lucide-react";
import { ActionButton } from "./action-button";
import { AuthFeedback } from "./auth-feedback";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import {
  PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY,
  PLATFORM_AUTH_TOKEN_STORAGE_KEY
} from "@/lib/platform-session";

type AuthStep = "email" | "password" | "entering" | "create-password" | "verify-email" | "reset-password" | "plan" | "payment";
type PlanId = string;
type AccountMode = "existing" | "new" | null;
type ResetRequestStatus = "idle" | "sending" | "sent" | "error";
type VerificationStatus = "idle" | "sending" | "waiting" | "verified" | "error";
type CheckoutStatus = "idle" | "creating" | "waiting" | "confirmed" | "error";
type EmailLookupStatus = "idle" | "checking" | "error";
type PlansStatus = "idle" | "loading" | "ready" | "error";
type CustomCodeStatus = "idle" | "checking" | "applied" | "error";
type AuthFlowInitialStep = "email" | "password" | "plan";
type AuthPlanResource = {
  habilitado?: boolean;
  included?: boolean;
  label?: string;
  nome?: string;
};
type AuthPlanFromApi = {
  id: string;
  name?: string;
  nome?: string;
  price?: string;
  recursos?: AuthPlanResource[];
  resources?: AuthPlanResource[];
  valor_centavos?: number;
  intervalo?: "mensal" | "dias";
  intervalo_quantidade?: number;
  gratuito?: boolean;
  codigo_assinatura?: string;
  cobranca_inicio_em?: string | null;
};
type DisplayPlan = {
  id: PlanId;
  name: string;
  price: string;
  resources: Array<{ label: string; included: boolean }>;
  billingLabel: string;
  customCode?: string;
  billingStartsAt?: string | null;
  isFree?: boolean;
  isCustom?: boolean;
};
type PlansResponse = {
  planos?: AuthPlanFromApi[];
};
type ValidateCodeResponse = {
  codigo: string;
  plano: AuthPlanFromApi;
};
type AuthStepMotion = "forward" | "backward";
type AuthFlowModalProps = {
  buttonClassName?: string;
  buttonLabel?: string;
  buttonVariant?: "primary" | "secondary";
  initialEmail?: string;
  initialPlan?: PlanId;
  initialStep?: AuthFlowInitialStep;
  triggerIcon?: "lock" | "chevron" | "none";
};

const steps: Array<{ id: AuthStep; label: string }> = [
  { id: "email", label: "E-mail" },
  { id: "password", label: "Acesso" },
  { id: "verify-email", label: "Verificação" },
  { id: "plan", label: "Plano" },
  { id: "payment", label: "Pagamento" }
];

const authMotionOrder: AuthStep[] = [
  "email",
  "password",
  "reset-password",
  "entering",
  "create-password",
  "verify-email",
  "plan",
  "payment"
];

function getAuthMotionIndex(step: AuthStep) {
  const index = authMotionOrder.indexOf(step);

  return index >= 0 ? index : 0;
}

const fallbackPlans: DisplayPlan[] = [
  {
    id: "inicial",
    name: "Inicial",
    price: "299",
    billingLabel: "/mês",
    resources: [
      { label: "PDV desktop local", included: true },
      { label: "Vendas e comanda digital", included: true },
      { label: "Controle de estoque", included: true },
      { label: "Fechamento do turno", included: true },
      { label: "NF-e/NFC-e com contingência", included: false }
    ]
  },
  {
    id: "completo",
    name: "Completo",
    price: "499",
    billingLabel: "/mês",
    resources: [
      { label: "PDV desktop local", included: true },
      { label: "Vendas e comanda digital", included: true },
      { label: "Controle de estoque", included: true },
      { label: "Fechamento do turno", included: true },
      { label: "NF-e/NFC-e com contingência", included: true }
    ]
  }
];

function formatPlanPriceFromCents(cents?: number) {
  if (!Number.isInteger(cents)) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format((cents || 0) / 100);
}

function getBillingLabel(plan: AuthPlanFromApi) {
  if (plan.gratuito) {
    return "grátis";
  }

  if (plan.intervalo === "dias") {
    const quantidade = Number(plan.intervalo_quantidade || 1);

    return quantidade === 1 ? "/dia" : `/ ${quantidade} dias`;
  }

  return "/mês";
}

function normalizePlan(plan: AuthPlanFromApi, customCode?: string): DisplayPlan | null {
  if (!plan?.id) {
    return null;
  }

  const resources = (plan.recursos || plan.resources || []).map((resource) => ({
    included: Boolean(resource.habilitado ?? resource.included),
    label: resource.nome || resource.label || "Recurso"
  }));

  return {
    id: plan.id,
    name: plan.nome || plan.name || plan.id,
    price: plan.gratuito ? "0,00" : plan.price || formatPlanPriceFromCents(plan.valor_centavos),
    resources,
    billingLabel: getBillingLabel(plan),
    customCode: customCode || plan.codigo_assinatura,
    billingStartsAt: plan.cobranca_inicio_em || null,
    isFree: Boolean(plan.gratuito),
    isCustom: Boolean(customCode || plan.codigo_assinatura)
  };
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function AuthFlowModal({
  buttonClassName = "login-action",
  buttonLabel = "Entrar",
  buttonVariant,
  initialEmail = "",
  initialPlan,
  initialStep = "email",
  triggerIcon = "lock"
}: AuthFlowModalProps = {}) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const emailInputId = useId();
  const passwordInputId = useId();
  const createPasswordInputId = useId();
  const confirmPasswordInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [plans, setPlans] = useState<DisplayPlan[]>(fallbackPlans);
  const [plansStatus, setPlansStatus] = useState<PlansStatus>("idle");
  const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);
  const [customPlan, setCustomPlan] = useState<DisplayPlan | null>(null);
  const [subscriptionCode, setSubscriptionCode] = useState("");
  const [customCodeStatus, setCustomCodeStatus] = useState<CustomCodeStatus>("idle");
  const [customCodeMessage, setCustomCodeMessage] = useState("");
  const [accountMode, setAccountMode] = useState<AccountMode>(null);
  const [requiresActivationFlow, setRequiresActivationFlow] = useState(false);
  const [emailLookupStatus, setEmailLookupStatus] = useState<EmailLookupStatus>("idle");
  const [emailLookupMessage, setEmailLookupMessage] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [resetRequestStatus, setResetRequestStatus] = useState<ResetRequestStatus>("idle");
  const [resetRequestMessage, setResetRequestMessage] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus>("idle");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>("idle");
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState(false);
  const [submittedPassword, setSubmittedPassword] = useState(false);
  const [submittedNewPassword, setSubmittedNewPassword] = useState(false);
  const [isEnteringPlatform, setIsEnteringPlatform] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const resetAutoSentEmailRef = useRef<string | null>(null);
  const isPresetLoginFlow = initialStep === "password" && isValidEmail(initialEmail);
  const isVerifiedPlanFlow = initialStep === "plan" && isValidEmail(initialEmail);
  const isPlanSignupFlow = Boolean(initialPlan);
  const isCheckoutFlowStep =
    isPlanSignupFlow ||
    requiresActivationFlow ||
    accountMode === "new" ||
    step === "create-password" ||
    step === "verify-email" ||
    step === "plan" ||
    step === "payment";
  const visibleSteps = isCheckoutFlowStep ? steps : steps.slice(0, 2);

  useEffect(() => {
    router.prefetch("/meu-sistema");
  }, [router]);

  useEffect(() => {
    if (isOpen && plansStatus === "idle") {
      void loadPlans();
    }
  }, [isOpen, plansStatus]);

  useEffect(() => {
    if (!selectedPlan && (step === "plan" || step === "payment") && plans.length > 0) {
      setSelectedPlan(initialPlan ?? plans[0].id);
    }
  }, [initialPlan, plans, selectedPlan, step]);

  const activeStepIndex = useMemo(() => {
    if (step === "email") {
      return 0;
    }

    if (step === "password" || step === "reset-password" || step === "entering" || step === "create-password") {
      return 1;
    }

    if (step === "verify-email") {
      return visibleSteps.findIndex((item) => item.id === "verify-email");
    }

    return visibleSteps.findIndex((item) => item.id === step);
  }, [step, visibleSteps]);

  const displayPlans = useMemo(() => {
    if (!customPlan) {
      return plans;
    }

    return [customPlan, ...plans.filter((plan) => plan.id !== customPlan.id)];
  }, [customPlan, plans]);
  const selectedPlanData = selectedPlan ? displayPlans.find((plan) => plan.id === selectedPlan) ?? null : null;
  const emailError = submittedEmail && !isValidEmail(email);
  const passwordError = submittedPassword && password.trim().length === 0;
  const passwordRequirements = [
    { label: "8 caracteres", passed: newPassword.trim().length >= 8 },
    { label: "Maiúscula", passed: /[A-ZÁÀÂÃÉÈÊÍÏÓÔÕÖÚÇÑ]/.test(newPassword) },
    { label: "Minúscula", passed: /[a-záàâãéèêíïóôõöúçñ]/.test(newPassword) },
    { label: "Número", passed: /\d/.test(newPassword) }
  ];
  const isNewPasswordSecure = passwordRequirements.every((requirement) => requirement.passed);
  const doPasswordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const newPasswordError = submittedNewPassword && !isNewPasswordSecure;
  const confirmPasswordError = submittedNewPassword && !doPasswordsMatch;

  function resetFlow() {
    setStep(isVerifiedPlanFlow ? "verify-email" : isPresetLoginFlow ? "password" : "email");
    setEmail(initialEmail);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setSelectedPlan(initialPlan ?? null);
    setCustomPlan(null);
    setSubscriptionCode("");
    setCustomCodeStatus("idle");
    setCustomCodeMessage("");
    setAccountMode(isPresetLoginFlow || isVerifiedPlanFlow ? "existing" : null);
    setRequiresActivationFlow(Boolean(initialPlan) || isVerifiedPlanFlow);
    setEmailLookupStatus("idle");
    setEmailLookupMessage("");
    setLoginMessage("");
    setResetRequestStatus("idle");
    setResetRequestMessage("");
    setVerificationStatus(isVerifiedPlanFlow ? "verified" : "idle");
    setVerificationMessage("");
    setCheckoutStatus("idle");
    setCheckoutMessage("");
    setCheckoutToken(null);
    setSubmittedEmail(false);
    setSubmittedPassword(false);
    setSubmittedNewPassword(false);
    setIsEnteringPlatform(false);
    resetAutoSentEmailRef.current = null;
  }

  async function loadPlans() {
    if (plansStatus === "loading") {
      return;
    }

    try {
      setPlansStatus("loading");
      const result = await apiGet<PlansResponse | AuthPlanFromApi[]>("/assinaturas/planos", {
        cacheTtlMs: 300_000
      });
      const rawPlans = Array.isArray(result) ? result : result?.planos ?? [];
      const normalizedPlans = rawPlans
        .map((plan) => normalizePlan(plan))
        .filter((plan): plan is DisplayPlan => Boolean(plan));
      const nextPlans = normalizedPlans.length > 0 ? normalizedPlans : fallbackPlans;

      setPlans(nextPlans);
      setPlansStatus("ready");

      if (!selectedPlan) {
        setSelectedPlan(initialPlan ?? nextPlans[0]?.id ?? null);
      }
    } catch {
      setPlans(fallbackPlans);
      setPlansStatus("error");

      if (!selectedPlan) {
        setSelectedPlan(initialPlan ?? fallbackPlans[0]?.id ?? null);
      }
    }
  }

  async function applySubscriptionCode() {
    const code = subscriptionCode.trim();

    if (!code || customCodeStatus === "checking") {
      return;
    }

    try {
      setCustomCodeStatus("checking");
      setCustomCodeMessage("");

      const result = await apiPost<ValidateCodeResponse>("/assinaturas/codigo/validar", {
        codigo_assinatura: code,
        email
      });
      const normalizedPlan = normalizePlan(result.plano, result.codigo);

      if (!normalizedPlan) {
        throw new Error("Código de assinatura inválido.");
      }

      setCustomPlan(normalizedPlan);
      setSelectedPlan(normalizedPlan.id);
      setSubscriptionCode(result.codigo);
      setCustomCodeStatus("applied");
      setCustomCodeMessage("Código aplicado.");
    } catch (error) {
      setCustomPlan(null);
      setCustomCodeStatus("error");
      setCustomCodeMessage(error instanceof Error ? error.message : "Não foi possível validar o código.");
    }
  }

  function closeModal() {
    setIsOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
    window.setTimeout(resetFlow, 180);
  }

  function openModal() {
    resetFlow();
    setIsOpen(true);
  }

  const authModalDismiss = useModalDismiss(isOpen, closeModal);
  const authModalPresence = useModalPresence(isOpen);

  function moveToStep(nextStep: AuthStep) {
    if (nextStep === step) {
      return;
    }

    const motion: AuthStepMotion = getAuthMotionIndex(nextStep) >= getAuthMotionIndex(step) ? "forward" : "backward";
    const root = document.documentElement;
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    root.dataset.authStepMotion = motion;

    if (isOpen && typeof viewTransitionDocument.startViewTransition === "function") {
      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(() => setStep(nextStep));
      });
      void transition.finished.finally(() => {
        delete root.dataset.authStepMotion;
      });
      return;
    }

    root.dataset.authStepFallback = "true";
    setStep(nextStep);
    window.setTimeout(() => {
      delete root.dataset.authStepMotion;
      delete root.dataset.authStepFallback;
    }, 540);
  }

  async function continueFromEmail() {
    setSubmittedEmail(true);
    setEmailLookupMessage("");

    if (!isValidEmail(email) || emailLookupStatus === "checking") {
      return;
    }

    setEmailLookupStatus("checking");

    try {
      const result = await apiPost<{
        assinaturaAtiva?: boolean;
        email: string;
        emailVerificado?: boolean;
        existe: boolean;
      }>(
        "/usuarios/identificar",
        { email }
      );
      const normalizedEmail = result.email || email.trim();
      const nextAccountMode: Exclude<AccountMode, null> = result.existe ? "existing" : "new";
      const needsActivation = result.existe && (!result.emailVerificado || !result.assinaturaAtiva);

      setEmail(normalizedEmail);
      setAccountMode(nextAccountMode);
      setRequiresActivationFlow(needsActivation || nextAccountMode === "new" || isPlanSignupFlow);
      setEmailLookupStatus("idle");
      moveToStep(nextAccountMode === "existing" ? "password" : "create-password");
    } catch (error) {
      setEmailLookupStatus("error");
      setEmailLookupMessage(error instanceof Error ? error.message : "Não foi possível localizar sua conta.");
    }
  }

  async function continueFromPassword() {
    setSubmittedPassword(true);
    setLoginMessage("");

    if (password.trim().length === 0 || isEnteringPlatform) {
      return;
    }

    setIsEnteringPlatform(true);

    try {
      const result = await apiPost<{
        token: string;
        user: {
          email: string;
          permissoes?: string[];
          tipo_conta?: "usuario" | "subconta";
        };
      }>("/sessions", {
        email,
        senha: password
      });
      const accountEmail = result.user?.email || email.trim();

      if (accountEmail) {
        window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, accountEmail);
      }

      window.localStorage.setItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY, result.user?.tipo_conta || "usuario");
      window.localStorage.setItem(
        PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
        JSON.stringify(result.user?.permissoes || ["*"])
      );

      if (result.token) {
        window.localStorage.setItem(PLATFORM_AUTH_TOKEN_STORAGE_KEY, result.token);
      }

      router.push("/meu-sistema");
    } catch (error) {
      setIsEnteringPlatform(false);

      if (error instanceof ApiError && error.code === "EMAIL_NOT_VERIFIED") {
        setRequiresActivationFlow(true);
        setVerificationMessage("");
        moveToStep("verify-email");
        await sendAccountVerificationLink();
        return;
      }

      if (error instanceof ApiError && error.code === "SUBSCRIPTION_REQUIRED") {
        setRequiresActivationFlow(true);
        setLoginMessage("");
        moveToStep("plan");
        return;
      }

      setLoginMessage(error instanceof Error ? error.message : "Não foi possível acessar sua conta.");
    }
  }

  async function continueFromCreatePassword() {
    setSubmittedNewPassword(true);

    if (!isNewPasswordSecure || !doPasswordsMatch) {
      return;
    }

    moveToStep("verify-email");
    setVerificationMessage("");

    try {
      await apiPost<{ id: number }>("/usuarios", {
        email,
        senha: newPassword
      });
      await sendAccountVerificationLink();
    } catch (error) {
      setVerificationStatus("error");
      setVerificationMessage(error instanceof Error ? error.message : "Não foi possível criar sua conta.");
    }
  }

  async function sendAccountVerificationLink() {
    if (!isValidEmail(email) || verificationStatus === "sending") {
      return;
    }

    setVerificationStatus("sending");
    setVerificationMessage("");

    try {
      const result = await apiPost<{ message?: string }>("/usuarios/verificacao-email", { email });

      setVerificationStatus("waiting");
      setVerificationMessage(result?.message ?? "E-mail de verificação enviado com sucesso.");
    } catch (error) {
      setVerificationStatus("error");
      setVerificationMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o e-mail de verificação."
      );
    }
  }

  async function sendPasswordResetLink() {
    if (!isValidEmail(email) || resetRequestStatus === "sending") {
      return;
    }

    setResetRequestStatus("sending");
    setResetRequestMessage("");

    try {
      const result = await apiPost<{ message?: string }>("/usuarios/redefinicao-senha", { email });

      setResetRequestStatus("sent");
      setResetRequestMessage(result?.message ?? "Link de redefinição enviado com sucesso.");
    } catch (error) {
      setResetRequestStatus("error");
      setResetRequestMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o link de redefinição."
      );
    }
  }

  async function startMercadoPagoCheckout() {
    if (!selectedPlan || !selectedPlanData || checkoutStatus === "creating") {
      return;
    }

    setCheckoutStatus("creating");
    setCheckoutMessage("");

    try {
      const result = await apiPost<{
        assinaturaAtiva?: boolean;
        checkoutToken?: string;
        checkoutUrl?: string | null;
        gratuito?: boolean;
        message?: string;
      }>("/assinaturas/checkout", {
        email,
        ...(selectedPlanData.customCode
          ? { codigo_assinatura: selectedPlanData.customCode }
          : { plano: selectedPlan })
      });

      if (result?.assinaturaAtiva && result.checkoutToken) {
        setCheckoutToken(result.checkoutToken);
        setCheckoutStatus("confirmed");
        setCheckoutMessage(result.message || "");
        return;
      }

      if (!result?.checkoutUrl || !result.checkoutToken) {
        throw new Error(result?.message ?? "Não foi possível iniciar o checkout.");
      }

      const checkoutWindow = window.open(result.checkoutUrl, "_blank");
      setCheckoutToken(result.checkoutToken);

      if (!checkoutWindow) {
        setCheckoutStatus("waiting");
        setCheckoutMessage("Caso a nova guia não tenha aberto, permita pop-ups para este site e abra novamente. Esta tela continuará conferindo a assinatura.");
        return;
      }

      checkoutWindow.opener = null;
      setCheckoutStatus("waiting");
      setCheckoutMessage("");
    } catch (error) {
      setCheckoutStatus("error");
      setCheckoutMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o checkout do Mercado Pago."
      );
    }
  }

  function goBack() {
    if (step === "payment") {
      setCheckoutStatus("idle");
      setCheckoutMessage("");
      moveToStep("plan");
    } else if (step === "plan") {
      moveToStep(isVerifiedPlanFlow ? "verify-email" : accountMode === "existing" ? "password" : "verify-email");
    } else if (step === "verify-email") {
      setVerificationStatus("idle");
      setVerificationMessage("");
      moveToStep(accountMode === "existing" ? "password" : "create-password");
    } else if (step === "password" || step === "create-password" || step === "reset-password") {
      setResetRequestStatus("idle");
      setResetRequestMessage("");
      moveToStep("email");
    }
  }

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (step !== "verify-email" || verificationStatus !== "waiting") {
      return;
    }

    let isCancelled = false;

    async function checkVerification() {
      try {
        const result = await apiPost<{ existe: boolean; emailVerificado?: boolean }>(
          "/usuarios/identificar",
          { email }
        );

        if (!isCancelled && result.emailVerificado) {
          setVerificationStatus("verified");
          setVerificationMessage("E-mail verificado com sucesso.");
        }
      } catch {
        // Mantem o estado de espera para nao interromper o cadastro por falha momentanea.
      }
    }

    checkVerification();
    const verificationTimer = window.setInterval(checkVerification, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(verificationTimer);
    };
  }, [email, step, verificationStatus]);

  useEffect(() => {
    if (!isOpen || step !== "reset-password" || resetRequestStatus !== "idle" || !isValidEmail(email)) {
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (resetAutoSentEmailRef.current === normalizedEmail) {
      return;
    }

    resetAutoSentEmailRef.current = normalizedEmail;
    void sendPasswordResetLink();
  }, [email, isOpen, resetRequestStatus, step]);

  useEffect(() => {
    if (
      !isOpen ||
      step !== "payment" ||
      checkoutStatus !== "waiting" ||
      !checkoutToken
    ) {
      return;
    }

    const activeCheckoutToken = checkoutToken;
    let isCancelled = false;

    async function checkSubscriptionStatus() {
      try {
        const result = await apiGet<{
          ativa: boolean;
          mercadoPagoStatus?: string | null;
          status: string;
        }>(`/assinaturas/checkout/${encodeURIComponent(activeCheckoutToken)}/status`);

        if (isCancelled) {
          return;
        }

        if (result.ativa) {
          setCheckoutStatus("confirmed");
          setCheckoutMessage("Assinatura confirmada. Seu acesso já pode ser liberado.");
          setRequiresActivationFlow(false);
          return;
        }

        if (["cancelada", "pagamento_falhou", "abandonada"].includes(result.status)) {
          setCheckoutStatus("error");
          setCheckoutMessage("A assinatura não foi concluída. Você pode tentar novamente com outro meio de pagamento.");
        }
      } catch (error) {
        if (!isCancelled) {
          setCheckoutMessage(
            error instanceof Error
              ? error.message
              : "Não foi possível consultar a confirmação agora. Esta tela tentará novamente."
          );
        }
      }
    }

    checkSubscriptionStatus();
    const statusTimer = window.setInterval(checkSubscriptionStatus, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(statusTimer);
    };
  }, [checkoutStatus, checkoutToken, isOpen, step]);

  useEffect(() => {
    if (!authModalPresence.isPresent) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;

    document.documentElement.classList.add("auth-modal-open");
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (!firstElement || !lastElement) {
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.setTimeout(() => modalRef.current?.querySelector<HTMLElement>("input, .auth-primary-action")?.focus(), 40);

    return () => {
      document.documentElement.classList.remove("auth-modal-open");
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [authModalPresence.isPresent]);

  const modal = isMounted && authModalPresence.isPresent ? createPortal(
    <div
      className="auth-modal-shell"
      data-modal-state={authModalPresence.state}
      role="presentation"
      {...authModalDismiss.backdropProps}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        ref={modalRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button className="auth-modal-close" type="button" aria-label="Fechar" onClick={closeModal}>
          <X aria-hidden="true" size={18} />
        </button>

        <section className="auth-modal-content">
          <div className="auth-step-panel" key={step}>
            {step === "email" ? (
              <>
                <h2 id={titleId}>Entre com seu e-mail</h2>
                <p id={descriptionId}>
                  Vamos localizar sua conta ou iniciar o cadastro para contratar o Caixa Ágil.
                </p>

                <label className="auth-field" htmlFor={emailInputId}>
                  <span>E-mail</span>
                  <input
                    id={emailInputId}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        continueFromEmail();
                      }
                    }}
                    aria-invalid={emailError}
                    aria-describedby={emailError ? `${emailInputId}-error` : undefined}
                    placeholder="voce@empresa.com.br"
                  />
                  {emailError ? (
                    <small id={`${emailInputId}-error`}>Informe um e-mail válido para continuar.</small>
                  ) : null}
                </label>

                {emailLookupStatus === "error" ? (
                  <AuthFeedback tone="error">
                    {emailLookupMessage}
                  </AuthFeedback>
                ) : null}

                <button
                  className="auth-primary-action"
                  type="button"
                  onClick={continueFromEmail}
                  disabled={emailLookupStatus === "checking"}
                >
                  {emailLookupStatus === "checking" ? "Verificando..." : "Continuar"}
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              </>
            ) : null}

            {step === "password" ? (
              <>
                <h2 id={titleId}>Digite sua senha</h2>
                <p id={descriptionId}>
                  Encontramos uma conta para <strong>{email}</strong>. Use sua senha para seguir.
                </p>

                {requiresActivationFlow ? (
                  <AuthFeedback tone="warning">
                    Confirme o e-mail e conclua a contratação de um plano para liberar a plataforma.
                  </AuthFeedback>
                ) : null}

                <label className="auth-field" htmlFor={passwordInputId}>
                  <span>Senha</span>
                  <div className="auth-password-input">
                    <input
                      id={passwordInputId}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          continueFromPassword();
                        }
                      }}
                      aria-invalid={passwordError}
                      aria-describedby={passwordError ? `${passwordInputId}-error` : undefined}
                      placeholder="Sua senha"
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      tabIndex={-1}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowPassword((current) => !current)}
                    >
                      {showPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                  {passwordError ? (
                    <small id={`${passwordInputId}-error`}>Informe sua senha para continuar.</small>
                  ) : null}
                </label>

                {loginMessage ? (
                  <AuthFeedback tone="error">
                    {loginMessage}
                  </AuthFeedback>
                ) : null}

                <button
                  className="auth-inline-action auth-forgot-password"
                  type="button"
                  onClick={() => {
                    setResetRequestStatus("idle");
                    setResetRequestMessage("");
                    resetAutoSentEmailRef.current = null;
                    moveToStep("reset-password");
                  }}
                >
                  Esqueci minha senha
                </button>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="auth-primary-action auth-action-orange"
                    type="button"
                    onClick={continueFromPassword}
                    disabled={isEnteringPlatform}
                  >
                    {isEnteringPlatform ? "Entrando..." : "Acessar"}
                    {isEnteringPlatform ? (
                    <LoaderCircle aria-hidden="true" className="auth-spin" size={18} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={18} />
                    )}
                  </button>
                </div>
              </>
            ) : null}

            {step === "entering" ? (
              <>
                <h2 id={titleId}>Abrindo plataforma</h2>
                <p id={descriptionId}>
                  Acesso confirmado para <strong>{email}</strong>. Estamos preparando sua área inicial.
                </p>

                <div className="auth-platform-entering" aria-live="polite">
                  <span className="auth-platform-entering-icon">
                    <LoaderCircle aria-hidden="true" className="auth-spin" size={24} />
                  </span>
                  <span>
                    <strong>Entrando no sistema</strong>
                    <small>Você será direcionado em instantes.</small>
                  </span>
                </div>
              </>
            ) : null}

            {step === "create-password" ? (
              <>
                <h2 id={titleId}>Crie sua senha</h2>
                <p id={descriptionId}>
                  Vamos preparar o acesso de <strong>{email}</strong> antes da escolha do plano.
                </p>

                <label className="auth-field" htmlFor={createPasswordInputId}>
                  <span>Nova senha</span>
                  <div className="auth-password-input">
                    <input
                      id={createPasswordInputId}
                      type={showNewPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          document.getElementById(confirmPasswordInputId)?.focus();
                        }
                      }}
                      aria-invalid={newPasswordError}
                      aria-describedby={newPasswordError ? `${createPasswordInputId}-error` : undefined}
                      placeholder="Crie uma senha segura"
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      tabIndex={-1}
                      aria-label={showNewPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowNewPassword((current) => !current)}
                    >
                      {showNewPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                  {newPasswordError ? (
                    <small id={`${createPasswordInputId}-error`}>
                      A senha ainda não atende aos requisitos mínimos.
                    </small>
                  ) : null}
                </label>

                <div className="auth-password-rules" aria-label="Requisitos da senha">
                  {passwordRequirements.map((requirement) => (
                    <span
                      className={requirement.passed ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}
                      key={requirement.label}
                    >
                      <i aria-hidden="true">
                        {requirement.passed ? <Check size={11} /> : <X size={11} />}
                      </i>
                      {requirement.label}
                    </span>
                  ))}
                </div>

                <label className="auth-field auth-confirm-field" htmlFor={confirmPasswordInputId}>
                  <span>Confirmar senha</span>
                  <div className="auth-password-input">
                    <input
                      id={confirmPasswordInputId}
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          continueFromCreatePassword();
                        }
                      }}
                      aria-invalid={confirmPasswordError}
                      aria-describedby={confirmPasswordError ? `${confirmPasswordInputId}-error` : undefined}
                      placeholder="Repita a senha"
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      tabIndex={-1}
                      aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowConfirmPassword((current) => !current)}
                    >
                      {showConfirmPassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                  {confirmPasswordError ? (
                    <small id={`${confirmPasswordInputId}-error`}>
                      As senhas precisam ser iguais.
                    </small>
                  ) : null}
                </label>

                <div className="auth-password-rules auth-confirm-rules" aria-label="Confirmação da senha">
                  <span className={doPasswordsMatch ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}>
                    <i aria-hidden="true">
                      {doPasswordsMatch ? <Check size={11} /> : <X size={11} />}
                    </i>
                    Senhas iguais
                  </span>
                </div>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="auth-primary-action auth-action-orange"
                    type="button"
                    onClick={continueFromCreatePassword}
                    disabled={!isNewPasswordSecure || !doPasswordsMatch || verificationStatus === "sending"}
                  >
                    {verificationStatus === "sending" ? "Enviando..." : "Criar senha"}
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </>
            ) : null}

            {step === "verify-email" ? (
              <>
                <h2 id={titleId}>
                  {verificationStatus === "verified" ? "E-mail verificado" : "Verifique seu e-mail"}
                </h2>
                <p id={descriptionId}>
                  {verificationStatus === "verified" ? (
                    <>
                      A conta <strong>{email}</strong> foi confirmada. Continue para escolher o plano.
                    </>
                  ) : (
                    <>
                      Enviamos um link de verificação para <strong>{email}</strong>.
                    </>
                  )}
                </p>

                {verificationStatus === "error" ? (
                  <AuthFeedback tone="error">
                    {verificationMessage}
                  </AuthFeedback>
                ) : (
                  <div className="auth-payment-wait" aria-live="polite">
                    <span
                      className={
                        verificationStatus === "verified"
                          ? "auth-payment-wait-icon auth-payment-wait-icon-ok"
                          : "auth-payment-wait-icon"
                      }
                    >
                      {verificationStatus === "verified" ? (
                        <Check aria-hidden="true" size={24} />
                      ) : (
                        <LoaderCircle aria-hidden="true" className="auth-spin" size={24} />
                      )}
                    </span>
                    <span>
                      <strong>
                        {verificationStatus === "verified"
                          ? "Conta confirmada"
                          : verificationStatus === "sending"
                            ? "Enviando verificação"
                            : "Aguardando confirmação"}
                      </strong>
                      <small>
                        {verificationStatus === "verified"
                          ? "Agora você pode seguir para a escolha do plano."
                          : "Assim que a confirmação chegar, você poderá continuar o cadastro."}
                      </small>
                    </span>
                  </div>
                )}

                {verificationMessage && verificationStatus !== "error" ? (
                  <AuthFeedback tone="success">
                    {verificationMessage}
                  </AuthFeedback>
                ) : null}

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  {verificationStatus === "verified" ? (
                    <button
                      className="auth-primary-action auth-action-orange"
                      type="button"
                      onClick={() => moveToStep("plan")}
                    >
                      Escolher plano
                      <ArrowRight aria-hidden="true" size={18} />
                    </button>
                  ) : (
                    <button
                      className="auth-primary-action auth-action-orange"
                      type="button"
                      onClick={sendAccountVerificationLink}
                      disabled={verificationStatus === "sending"}
                    >
                      {verificationStatus === "sending" ? "Enviando..." : "Reenviar link"}
                      <ArrowRight aria-hidden="true" size={18} />
                    </button>
                  )}
                </div>
              </>
            ) : null}

            {step === "reset-password" ? (
              <>
                <h2 id={titleId}>Redefinir senha</h2>
                <p id={descriptionId}>
                  Vamos enviar um link de redefinição para <strong>{email}</strong>.
                </p>

                <AuthFeedback
                  tone={
                    resetRequestStatus === "sent" ? "success" : resetRequestStatus === "error" ? "error" : "neutral"
                  }
                >
                  {resetRequestMessage || "Enviando link de redefinição para o e-mail informado."}
                </AuthFeedback>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="auth-primary-action auth-action-orange"
                    type="button"
                    onClick={sendPasswordResetLink}
                    disabled={resetRequestStatus === "sending"}
                  >
                    {resetRequestStatus === "sending"
                      ? "Enviando..."
                      : resetRequestStatus === "sent"
                        ? "Reenviar link"
                        : "Enviar link"}
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </>
            ) : null}

            {step === "plan" ? (
              <>
                <h2 id={titleId}>Escolha o plano</h2>
                <p id={descriptionId}>
                  Selecione como sua conta vai começar. Você poderá alterar isso depois.
                </p>

                <div className="auth-subscription-code">
                  <label className="auth-field" htmlFor={`${titleId}-subscription-code`}>
                    <span>Código personalizado</span>
                    <input
                      id={`${titleId}-subscription-code`}
                      value={subscriptionCode}
                      onChange={(event) => {
                        setSubscriptionCode(event.currentTarget.value.toUpperCase());
                        setCustomPlan(null);
                        setSelectedPlan((current) => (current === customPlan?.id ? plans[0]?.id ?? null : current));
                        setCustomCodeStatus("idle");
                        setCustomCodeMessage("");
                      }}
                      placeholder="ABC-123"
                      autoComplete="off"
                    />
                  </label>
                  <button
                    className="auth-secondary-action auth-action-light"
                    type="button"
                    onClick={applySubscriptionCode}
                    disabled={customCodeStatus === "checking" || !subscriptionCode.trim()}
                  >
                    {customCodeStatus === "checking" ? "Validando..." : "Aplicar"}
                  </button>
                </div>

                {customCodeMessage ? (
                  <AuthFeedback tone={customCodeStatus === "error" ? "error" : "success"}>
                    {customCodeMessage}
                  </AuthFeedback>
                ) : null}

                <div className="auth-plan-options" role="radiogroup" aria-label="Planos">
                  {displayPlans.map((plan) => (
                    <button
                      className={
                        selectedPlan === plan.id
                          ? "auth-plan-option auth-plan-option-selected"
                          : "auth-plan-option"
                      }
                      type="button"
                      role="radio"
                      aria-checked={selectedPlan === plan.id}
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                    >
                      <span className="auth-plan-option-head">
                        <strong className="auth-plan-option-name">{plan.name}</strong>
                        <span className="auth-plan-price" aria-label={`R$ ${plan.price} por mês`}>
                          {plan.isFree ? (
                            <strong>Grátis</strong>
                          ) : (
                            <>
                              <span>R$</span>
                              <strong>{plan.price}</strong>
                              <em>{plan.billingLabel}</em>
                            </>
                          )}
                        </span>
                      </span>
                      <span className="auth-plan-note">
                        {plan.isCustom
                          ? "Oferta personalizada vinculada ao código informado."
                          : "Sem fidelidade. Cancele quando quiser."}
                      </span>
                      <span className="auth-plan-info" onClick={(event) => event.stopPropagation()}>
                        <span className="auth-plan-info-trigger" aria-hidden="true">
                          <Info size={15} />
                        </span>
                        <span className="auth-plan-details" aria-hidden="true">
                          {plan.resources.map((resource) => (
                            <span
                              className={
                                resource.included
                                  ? "auth-plan-resource auth-plan-resource-included"
                                  : "auth-plan-resource auth-plan-resource-missing"
                              }
                              key={resource.label}
                            >
                              {resource.included ? (
                                <Check aria-hidden="true" size={14} />
                              ) : (
                                <X aria-hidden="true" size={14} />
                              )}
                              {resource.label}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="auth-primary-action auth-action-orange"
                    type="button"
                    disabled={!selectedPlan}
                    onClick={() => {
                      if (!selectedPlan) {
                        return;
                      }

                      moveToStep("payment");
                    }}
                  >
                    Ir para pagamento
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </>
            ) : null}

            {step === "payment" ? (
              <>
                {checkoutStatus === "confirmed" ? (
                  <>
                    <h2 id={titleId}>Assinatura confirmada</h2>
                    <p id={descriptionId}>
                      O Mercado Pago confirmou a contratação. Sua conta já pode acessar a plataforma.
                    </p>

                    <div className="auth-payment-wait" aria-live="polite">
                      <span className="auth-payment-wait-icon auth-payment-wait-icon-ok">
                        <Check aria-hidden="true" size={24} />
                      </span>
                      <span>
                        <strong>Acesso liberado</strong>
                        <small>
                          Use a senha cadastrada para entrar no Caixa Ágil.
                        </small>
                      </span>
                    </div>

                    <div className="auth-payment-summary auth-payment-summary-compact">
                      <div className="auth-payment-plan">
                        <span>
                          <small>Plano</small>
                          <strong>{selectedPlanData?.name ?? "Plano"}</strong>
                        </span>
                      </div>
                      <div className="auth-payment-total">
                        <span>
                          <em>{email}</em>
                          <small>Total da assinatura</small>
                        </span>
                        <strong>
                          {selectedPlanData?.isFree
                            ? "Grátis"
                            : selectedPlanData
                              ? `R$ ${selectedPlanData.price}${selectedPlanData.billingLabel}`
                              : "Mensal recorrente"}
                        </strong>
                      </div>
                    </div>

                    <div className="auth-action-row">
                      <button
                        className="auth-secondary-action auth-action-light"
                        type="button"
                        onClick={() => {
                          setRequiresActivationFlow(false);
                          moveToStep("password");
                        }}
                      >
                        <ArrowLeft aria-hidden="true" size={17} />
                        Ir para login
                      </button>
                      <button
                        className="auth-primary-action auth-action-orange"
                        type="button"
                        onClick={() => {
                          if (newPassword) {
                            setPassword(newPassword);
                          }

                          setRequiresActivationFlow(false);
                          moveToStep("password");
                        }}
                      >
                        Entrar no sistema
                        <ArrowRight aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </>
                ) : checkoutStatus === "waiting" ? (
                  <>
                    <h2 id={titleId}>Aguardando pagamento</h2>
                    <p id={descriptionId}>
                      Finalize o checkout na guia do Mercado Pago. Assim que o pagamento for aprovado,
                      sua conta será concluída e o acesso será liberado.
                    </p>

                    <div className="auth-payment-wait" aria-live="polite">
                      <span className="auth-payment-wait-icon">
                        <LoaderCircle aria-hidden="true" className="auth-spin" size={24} />
                      </span>
                      <span>
                        <strong>Esperando confirmação</strong>
                        <small>
                          Não feche esta janela. Você pode voltar para cá depois de concluir o pagamento.
                        </small>
                      </span>
                    </div>

                    <div className="auth-payment-summary auth-payment-summary-compact">
                      <div className="auth-payment-plan">
                        <span>
                          <small>Plano</small>
                          <strong>{selectedPlanData?.name ?? "Plano"}</strong>
                        </span>
                      </div>
                      <div className="auth-payment-total">
                        <span>
                          <em>{email}</em>
                          <small>Total da assinatura</small>
                        </span>
                        <strong>
                          {selectedPlanData?.isFree
                            ? "Grátis"
                            : selectedPlanData
                              ? `R$ ${selectedPlanData.price}${selectedPlanData.billingLabel}`
                              : "A definir"}
                        </strong>
                      </div>
                    </div>

                    {checkoutMessage ? (
                      <div className="auth-checkout-note" aria-live="polite">
                        {checkoutMessage}
                      </div>
                    ) : null}

                    <div className="auth-action-row">
                      <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                        <ArrowLeft aria-hidden="true" size={17} />
                        Voltar
                      </button>
                      <button
                        className="auth-primary-action auth-action-orange"
                        type="button"
                        onClick={startMercadoPagoCheckout}
                      >
                        Abrir novamente
                        <ArrowRight aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 id={titleId}>Pagamento</h2>
                    <p id={descriptionId}>
                      Revise a contratação antes de seguir para o checkout.
                    </p>

                    <div className="auth-payment-summary">
                      <div className="auth-payment-plan">
                        <span>
                          <small>Plano escolhido</small>
                          <strong>{selectedPlanData?.name ?? "Plano"}</strong>
                        </span>
                      </div>
                      <div className="auth-payment-account">
                        <small>Conta</small>
                        <strong>{email}</strong>
                      </div>
                      <div className="auth-payment-total">
                        <span>
                          <small>Total da assinatura</small>
                          <em>Sem fidelidade, cancele quando quiser.</em>
                        </span>
                        <strong>
                          {selectedPlanData?.isFree
                            ? "Grátis"
                            : selectedPlanData
                              ? `R$ ${selectedPlanData.price}${selectedPlanData.billingLabel}`
                              : "A definir"}
                        </strong>
                      </div>
                    </div>

                    <div className="auth-payment-method">
                      <CreditCard aria-hidden="true" size={18} />
                      <span>
                        <strong>{selectedPlanData?.isFree ? "Ativação direta" : "Checkout Mercado Pago"}</strong>
                        <small>
                          {selectedPlanData?.isFree
                            ? "Este código libera a assinatura sem cobrança."
                            : "Cartão, Pix ou boleto com confirmação pelo Mercado Pago."}
                        </small>
                      </span>
                    </div>

                    {checkoutMessage && checkoutStatus === "error" ? (
                      <AuthFeedback tone="error">
                        {checkoutMessage}
                      </AuthFeedback>
                    ) : null}

                    <div className="auth-action-row">
                      <button className="auth-secondary-action auth-action-light" type="button" onClick={goBack}>
                        <ArrowLeft aria-hidden="true" size={17} />
                        Voltar
                      </button>
                      <button
                        className="auth-primary-action auth-action-orange"
                        type="button"
                        disabled={checkoutStatus === "creating"}
                        onClick={startMercadoPagoCheckout}
                      >
                        {checkoutStatus === "creating"
                          ? selectedPlanData?.isFree
                            ? "Ativando..."
                            : "Criando checkout..."
                          : selectedPlanData?.isFree
                            ? "Ativar assinatura"
                            : "Abrir checkout"}
                        <ArrowRight aria-hidden="true" size={18} />
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : null}
          </div>
        </section>

        <div className="auth-modal-progress" aria-label={`Etapa ${activeStepIndex + 1} de ${visibleSteps.length}`}>
          {visibleSteps.map((item, index) => (
            <span
              className={
                index === activeStepIndex
                  ? "auth-progress-dot auth-progress-dot-active"
                  : index < activeStepIndex
                    ? "auth-progress-dot auth-progress-dot-done"
                    : "auth-progress-dot"
              }
              key={item.id}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <ActionButton
        className={buttonClassName}
        type="button"
        variant={buttonVariant}
        aria-label={buttonLabel}
        onClick={openModal}
        ref={triggerRef}
      >
        {triggerIcon === "lock" ? <LockKeyhole aria-hidden="true" size={16} /> : null}
        <span>{buttonLabel}</span>
        {triggerIcon === "chevron" ? <ChevronRight aria-hidden="true" size={18} /> : null}
      </ActionButton>
      {modal}
    </>
  );
}
