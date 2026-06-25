"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Pencil,
  WalletCards,
  X
} from "lucide-react";

import { PlatformFrame } from "@/components/platform-frame";
import { apiGet, ApiError, apiPost, apiPut } from "@/lib/api-client";
import {
  DEFAULT_PLATFORM_ACCOUNT_EMAIL,
  getStoredPlatformAuthToken,
  PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY
} from "@/lib/platform-session";
import { AuthFeedback } from "@/components/auth-feedback";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type ContaTipo = "usuario" | "subconta";
type ModalFeedback = { message: string; tone?: "success" | "danger" | "neutral" } | null;
type AccountStep = "menu" | "email" | "email-sent" | "password";
type SubscriptionStep = "menu" | "plan" | "payment";

type Plano = {
  id: string;
  nome: string;
  valor_centavos: number;
};

type Conta = {
  id: number;
  email: string;
  nome?: string | null;
  ativo?: boolean;
  email_verificado_em?: string | null;
  novo_email_pendente?: string | null;
  ultimo_acesso_em?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
};

type PagamentoAssinatura = {
  id: number;
  status: string;
  status_detalhe?: string | null;
  valor_centavos?: number | null;
  moeda?: string | null;
  forma_pagamento?: string | null;
  pago_em?: string | null;
  vencimento_em?: string | null;
  processado_em?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

type AlteracaoAssinatura = {
  id: number;
  tipo: string;
  status: string;
  plano_atual: string;
  plano_novo: string;
  plano_snapshot?: {
    nome?: string | null;
    valor_centavos?: number | null;
    moeda?: string | null;
  } | null;
  valor_novo_centavos: number;
  moeda?: string | null;
  aplicar_em: string;
};

type Assinatura = {
  id: number;
  plano: string;
  status: string;
  valor_centavos: number;
  moeda?: string | null;
  proximo_pagamento_em?: string | null;
  iniciada_em?: string | null;
  ativada_em?: string | null;
  cancelada_em?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  pagamentos?: PagamentoAssinatura[];
  alteracao_agendada?: AlteracaoAssinatura | null;
};

type ContaResponse = {
  tipo_conta: ContaTipo;
  conta: Conta;
  assinatura?: Assinatura | null;
  assinaturas?: Assinatura[];
  planos?: Plano[];
};

type CheckoutResponse = {
  alteracaoAgendada?: boolean;
  alteracao?: AlteracaoAssinatura | null;
  aplicarEm?: string | null;
  assinaturaAtualizada?: boolean;
  checkoutUrl?: string;
  creditoRateioCentavos?: number;
  message?: string;
  proximo_pagamento_em?: string | null;
  valorPrimeiroPagamentoCentavos?: number;
  valorRecorrenteCentavos?: number;
};

type EmailChangeResponse = {
  conta?: Conta;
  email_pendente?: string;
  message?: string;
  requer_verificacao?: boolean;
};

type ModalProgressProps = {
  activeIndex: number;
  total: number;
};

const subscriptionStatusLabel: Record<string, string> = {
  abandonada: "Abandonada",
  ativa: "Ativa",
  cancelada: "Cancelada",
  falha: "Falha",
  pagamento_falhou: "Pagamento falhou",
  pendente: "Pendente",
  substituida: "Substituída"
};

const paymentStatusLabel: Record<string, string> = {
  accredited: "Pago",
  approved: "Pago",
  authorized: "Pago",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  charged_back: "Estornado",
  in_process: "Pendente",
  paid: "Pago",
  pending: "Pendente",
  rejected: "Falhou",
  refunded: "Reembolsado"
};

const MIN_MERCADO_PAGO_CHARGE_CENTS = 100;

function normalizeStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

function getStatusTone(status?: string | null) {
  const normalized = normalizeStatus(status);

  if (["ativa", "approved", "paid", "authorized", "accredited"].includes(normalized)) {
    return "success";
  }

  if (["pendente", "pending", "in_process"].includes(normalized)) {
    return "warning";
  }

  if (
    ["abandonada", "cancelada", "cancelled", "canceled", "falha", "pagamento_falhou", "rejected"].includes(
      normalized
    )
  ) {
    return "danger";
  }

  return "neutral";
}

function getSubscriptionStatusLabel(status?: string | null) {
  const normalized = normalizeStatus(status);
  return subscriptionStatusLabel[normalized] ?? "Em análise";
}

function getPaymentStatusLabel(status?: string | null) {
  const normalized = normalizeStatus(status);
  return paymentStatusLabel[normalized] ?? "Em análise";
}

function formatCurrency(cents?: number | null, currency = "BRL") {
  if (typeof cents !== "number") {
    return "Não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    currency,
    style: "currency"
  }).format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const originalDay = next.getDate();

  next.setMonth(next.getMonth() + months);

  if (next.getDate() !== originalDay) {
    next.setDate(0);
  }

  return next;
}

function getEstimatedNextPaymentDate(assinatura?: Assinatura | null) {
  if (!assinatura || normalizeStatus(assinatura.status) !== "ativa") {
    return null;
  }

  const baseValue = assinatura.ativada_em || assinatura.iniciada_em || assinatura.createdAt || assinatura.created_at;

  if (!baseValue) {
    return null;
  }

  const baseDate = new Date(baseValue);

  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }

  let nextDate = addMonths(baseDate, 1);
  const now = new Date();

  while (nextDate <= now) {
    nextDate = addMonths(nextDate, 1);
  }

  return nextDate.toISOString();
}

function getLocalProrationPreview(assinatura: Assinatura | null, plano: Plano | null) {
  if (!assinatura || !plano || plano.id === assinatura.plano || normalizeStatus(assinatura.status) !== "ativa") {
    return null;
  }

  if (plano.valor_centavos <= assinatura.valor_centavos) {
    return {
      credit: 0,
      firstPayment: plano.valor_centavos,
      kind: "downgrade" as const,
      nextPaymentDate: assinatura.proximo_pagamento_em || getEstimatedNextPaymentDate(assinatura),
    };
  }

  const nextPaymentValue = assinatura.proximo_pagamento_em || getEstimatedNextPaymentDate(assinatura);

  if (!nextPaymentValue) {
    return null;
  }

  const nextPaymentDate = new Date(nextPaymentValue);
  const now = new Date();

  if (Number.isNaN(nextPaymentDate.getTime()) || nextPaymentDate <= now) {
    return null;
  }

  const cycleStartDate = addMonths(nextPaymentDate, -1);
  const cycleMs = nextPaymentDate.getTime() - cycleStartDate.getTime();
  const remainingMs = Math.max(nextPaymentDate.getTime() - now.getTime(), 0);

  if (cycleMs <= 0) {
    return null;
  }

  const rawCredit = Math.round(assinatura.valor_centavos * (remainingMs / cycleMs));
  const maxCredit = Math.max(plano.valor_centavos - MIN_MERCADO_PAGO_CHARGE_CENTS, 0);
  const credit = Math.min(Math.max(rawCredit, 0), maxCredit);

  return {
    credit,
    firstPayment: Math.max(plano.valor_centavos - credit, MIN_MERCADO_PAGO_CHARGE_CENTS),
    kind: "upgrade" as const,
    nextPaymentDate: nextPaymentDate.toISOString(),
  };
}

function getPaymentDate(payment: PagamentoAssinatura) {
  return payment.pago_em || payment.processado_em || payment.vencimento_em || payment.createdAt || payment.created_at;
}

function ModalProgress({ activeIndex, total }: ModalProgressProps) {
  return (
    <div className="auth-modal-progress platform-account-modal-progress" aria-label={`Etapa ${activeIndex + 1} de ${total}`}>
      {Array.from({ length: total }).map((_, index) => (
        <span
          className={
            index === activeIndex
              ? "auth-progress-dot auth-progress-dot-active"
              : index < activeIndex
                ? "auth-progress-dot auth-progress-dot-done"
                : "auth-progress-dot"
          }
          key={index}
        />
      ))}
    </div>
  );
}

function getAccountProgress(step: AccountStep, isSubconta: boolean) {
  if (step === "menu") {
    return { activeIndex: 0, total: 2 };
  }

  if (step === "email-sent") {
    return { activeIndex: 2, total: 3 };
  }

  if (step === "email" && !isSubconta) {
    return { activeIndex: 1, total: 3 };
  }

  return { activeIndex: 1, total: 2 };
}

function getSubscriptionProgress(step: SubscriptionStep) {
  return { activeIndex: step === "menu" ? 0 : 1, total: 2 };
}

function sortPayments(payments: PagamentoAssinatura[]) {
  return [...payments].sort((a, b) => {
    const first = new Date(getPaymentDate(a) || 0).getTime();
    const second = new Date(getPaymentDate(b) || 0).getTime();
    return second - first;
  });
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

export default function PlatformAccountPage() {
  const [accountData, setAccountData] = useState<ContaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [accountStep, setAccountStep] = useState<AccountStep | null>(null);
  const [subscriptionStep, setSubscriptionStep] = useState<SubscriptionStep | null>(null);
  const [feedback, setFeedback] = useState<ModalFeedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [pendingEmail, setPendingEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("inicial");
  const hasOpenModal = Boolean(accountStep || subscriptionStep);
  const accountModalPresence = useModalPresence(accountStep);
  const visibleAccountStep = accountModalPresence.presentValue;
  const subscriptionModalPresence = useModalPresence(subscriptionStep);
  const visibleSubscriptionStep = subscriptionModalPresence.presentValue;
  const hasVisibleModal = accountModalPresence.isPresent || subscriptionModalPresence.isPresent;

  const token = typeof window === "undefined" ? null : getStoredPlatformAuthToken();

  async function loadAccount() {
    const storedToken = getStoredPlatformAuthToken();

    if (!storedToken) {
      setLoading(false);
      setPageError("Entre novamente para consultar a conta.");
      return;
    }

    try {
      setLoading(true);
      const result = await apiGet<ContaResponse>("/conta", { cacheTtlMs: 60_000, token: storedToken });
      setAccountData(result);
      setPageError(null);

      if (result.conta?.email) {
        window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, result.conta.email);
      }
    } catch (error) {
      setPageError(getErrorMessage(error, "Não foi possível carregar os dados da conta."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  const conta = accountData?.conta;
  const isSubconta = accountData?.tipo_conta === "subconta";
  const accountLabel = isSubconta ? conta?.nome || "Subconta" : "Conta principal";
  const accountEmail = conta?.email || DEFAULT_PLATFORM_ACCOUNT_EMAIL;
  const assinatura = accountData?.assinatura ?? null;
  const planos = accountData?.planos ?? [];
  const planoAtual = planos.find((plano) => plano.id === assinatura?.plano);
  const alteracaoAgendada = assinatura?.alteracao_agendada ?? null;
  const planoAgendadoCatalogo = planos.find((plano) => plano.id === alteracaoAgendada?.plano_novo);
  const planoAgendadoNome =
    alteracaoAgendada?.plano_snapshot?.nome || planoAgendadoCatalogo?.nome || alteracaoAgendada?.plano_novo || "";
  const planoAgendadoTitulo = planoAgendadoNome ? `Plano ${planoAgendadoNome}` : "Plano agendado";
  const planoAgendadoValor =
    typeof alteracaoAgendada?.plano_snapshot?.valor_centavos === "number"
      ? alteracaoAgendada.plano_snapshot.valor_centavos
      : alteracaoAgendada?.valor_novo_centavos;
  const planoAgendadoMoeda =
    alteracaoAgendada?.plano_snapshot?.moeda || alteracaoAgendada?.moeda || assinatura?.moeda || "BRL";
  const selectedPlanData = planos.find((plano) => plano.id === selectedPlan) || null;
  const prorationPreview = getLocalProrationPreview(assinatura, selectedPlanData);
  const pagamentos = useMemo(() => sortPayments(assinatura?.pagamentos ?? []), [assinatura]);
  const subscriptionTone = getStatusTone(assinatura?.status);
  const passwordRequirements = [
    { label: "8 caracteres", passed: newPassword.trim().length >= 8 },
    { label: "Maiúscula", passed: /[A-Z]/.test(newPassword) },
    { label: "Minúscula", passed: /[a-z]/.test(newPassword) },
    { label: "Número", passed: /\d/.test(newPassword) }
  ];
  const isPasswordSecure = passwordRequirements.every((requirement) => requirement.passed);
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const verificationTone = isSubconta || conta?.email_verificado_em ? "success" : "warning";
  const verificationLabel = isSubconta
    ? "Acesso interno"
    : conta?.email_verificado_em
      ? "E-mail confirmado"
      : "Confirmação pendente";
  const currentPlanTitle = planoAtual?.nome
    ? `Plano ${planoAtual.nome}`
    : assinatura?.plano
      ? `Plano ${assinatura.plano}`
      : "Sem plano ativo";
  const nextPaymentDate = assinatura?.proximo_pagamento_em || getEstimatedNextPaymentDate(assinatura);
  const nextPaymentCopy = assinatura?.proximo_pagamento_em
    ? "Cobrança recorrente da assinatura."
    : nextPaymentDate
      ? "Estimativa pelo ciclo mensal do plano."
      : "Aguardando confirmação do Mercado Pago.";

  function resetModalState() {
    setFeedback(null);
    setIsSaving(false);
    setPendingEmail("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }

  function openAccountModal(nextStep: AccountStep = "menu") {
    resetModalState();
    setEmailValue(accountEmail);
    setAccountStep(nextStep);
  }

  function closeAccountModal() {
    setAccountStep(null);
    resetModalState();
  }

  function openSubscriptionModal(nextStep: SubscriptionStep = "menu") {
    resetModalState();
    setSelectedPlan(assinatura?.plano || planos[0]?.id || "inicial");
    setSubscriptionStep(nextStep);
  }

  function closeSubscriptionModal() {
    setSubscriptionStep(null);
    resetModalState();
  }

  function closeTopAccountPageModal() {
    if (subscriptionStep) {
      closeSubscriptionModal();
      return;
    }

    if (accountStep) {
      closeAccountModal();
    }
  }

  usePlatformModalScrollLock(hasVisibleModal);
  const accountPageModalDismiss = useModalDismiss(hasOpenModal, closeTopAccountPageModal);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !isValidEmail(emailValue)) {
      setFeedback({ message: "Informe um e-mail válido.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPut<EmailChangeResponse>("/conta/email", { email: emailValue }, { token });

      if (result.requer_verificacao) {
        setPendingEmail(result.email_pendente || emailValue);
        setAccountStep("email-sent");
        return;
      }

      if (result.conta?.email) {
        window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, result.conta.email);
      }

      await loadAccount();
      setFeedback({ message: result.message || "E-mail atualizado.", tone: "success" });
      setAccountStep("menu");
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível atualizar o e-mail."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function resendEmailChangeLink() {
    const emailToConfirm = pendingEmail || emailValue;

    if (!token || !isValidEmail(emailToConfirm)) {
      setFeedback({ message: "Informe um e-mail válido.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPut<EmailChangeResponse>("/conta/email", { email: emailToConfirm }, { token });
      setPendingEmail(result.email_pendente || emailToConfirm);
      setFeedback({ message: result.message || "Link de confirmação reenviado.", tone: "success" });
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível reenviar o link."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !currentPassword || !isPasswordSecure || !doPasswordsMatch) {
      setFeedback({ message: "Preencha a senha atual e a nova senha corretamente.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      await apiPut("/conta/senha", { senha_atual: currentPassword, senha: newPassword }, { token });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback({ message: "Senha atualizada.", tone: "success" });
      setAccountStep("menu");
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível atualizar a senha."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function startSubscriptionCheckout(acao: "mudar_plano" | "trocar_pagamento") {
    if (!token) {
      setFeedback({ message: "Entre novamente para alterar a assinatura.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<CheckoutResponse>(
        "/assinaturas/gerenciar-checkout",
        acao === "mudar_plano" ? { acao, plano: selectedPlan } : { acao },
        { token }
      );

      if (result.alteracaoAgendada || result.assinaturaAtualizada) {
        setFeedback({ message: result.message || "Assinatura atualizada.", tone: "success" });
        await loadAccount();
        setSubscriptionStep("menu");
        return;
      }

      if (!result.checkoutUrl) {
        setFeedback({ message: "O Mercado Pago não retornou o link de checkout.", tone: "danger" });
        return;
      }

      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível abrir o checkout."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  const feedbackTone: "neutral" | "success" | "error" | "warning" =
    feedback?.tone === "danger" ? "error" : feedback?.tone || "neutral";
  const modalFeedback = feedback ? <AuthFeedback tone={feedbackTone}>{feedback.message}</AuthFeedback> : null;
  const accountProgress = visibleAccountStep ? getAccountProgress(visibleAccountStep, isSubconta) : null;
  const subscriptionProgress = visibleSubscriptionStep ? getSubscriptionProgress(visibleSubscriptionStep) : null;

  return (
    <PlatformFrame>
      <main className="platform-main platform-account-page">
        <section className="platform-account-hero">
          <span className="platform-page-kicker">Minha conta</span>
          <h1>Conta, acesso e assinatura.</h1>
          <p>Gerencie o acesso usado para entrar e acompanhe a assinatura da plataforma.</p>
        </section>

        {loading ? (
          <section className="platform-account-cards platform-account-skeleton-cards" aria-label="Carregando conta">
            {[0, 1].map((index) => (
              <article className="platform-account-main-card platform-account-skeleton-card" key={index}>
                <div className="platform-account-card-head">
                  <span>
                    <i className="platform-skeleton-line platform-account-skeleton-kicker" />
                    <i className="platform-skeleton-line platform-account-skeleton-title" />
                  </span>
                  <i className="platform-skeleton-block platform-account-skeleton-button" />
                </div>

                <div className="platform-account-status-row">
                  <i className="platform-skeleton-line platform-account-skeleton-pill" />
                </div>

                <div className="platform-account-detail-list platform-account-skeleton-list">
                  {[0, 1, 2].map((lineIndex) => (
                    <div key={lineIndex}>
                      <i className="platform-skeleton-line platform-account-skeleton-label" />
                      <i className="platform-skeleton-line platform-account-skeleton-value" />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : pageError ? (
          <div className="platform-account-loading platform-account-loading-danger">
            <AlertCircle aria-hidden="true" size={18} />
            {pageError}
          </div>
        ) : accountData && conta ? (
          <section className={isSubconta ? "platform-account-cards platform-account-cards-single" : "platform-account-cards"}>
            <article className="platform-account-main-card platform-account-profile-card">
              <div className="platform-account-card-head">
                <span>
                  <small>{isSubconta ? "Acesso da equipe" : "Conta principal"}</small>
                  <strong>{accountEmail}</strong>
                </span>
                <button className="platform-secondary-button platform-compact-button" type="button" onClick={() => openAccountModal()}>
                  Editar
                  <Pencil aria-hidden="true" size={16} />
                </button>
              </div>

              <div className="platform-account-status-row">
                <span className={`platform-account-mini-status platform-account-mini-status-${verificationTone}`}>
                  {verificationLabel}
                </span>
                {conta.novo_email_pendente ? (
                  <span className="platform-account-mini-status platform-account-mini-status-warning">Troca de e-mail pendente</span>
                ) : null}
              </div>

              <dl className="platform-account-detail-list">
                <div>
                  <dt>Identificação</dt>
                  <dd>{accountLabel}</dd>
                </div>
                <div>
                  <dt>Criada em</dt>
                  <dd>{formatDate(conta.createdAt || conta.created_at)}</dd>
                </div>
                <div>
                  <dt>{isSubconta ? "Último acesso" : "Tipo"}</dt>
                  <dd>{isSubconta ? formatDate(conta.ultimo_acesso_em) : "Administrador"}</dd>
                </div>
              </dl>

              {conta.novo_email_pendente ? (
                <p className="platform-account-pending-copy">
                  Confirme <strong>{conta.novo_email_pendente}</strong> para concluir a troca do e-mail.
                </p>
              ) : null}
            </article>

            {!isSubconta ? (
              <article className="platform-account-main-card platform-account-subscription-card">
                <div className="platform-account-card-head">
                  <span>
                    <small>Assinatura</small>
                    <strong>{currentPlanTitle}</strong>
                    <em className="platform-account-plan-price">
                      {formatCurrency(assinatura?.valor_centavos, assinatura?.moeda || "BRL")} por mês
                    </em>
                  </span>
                  <button
                    className="platform-secondary-button platform-compact-button"
                    disabled={!assinatura}
                    type="button"
                    onClick={() => openSubscriptionModal()}
                  >
                    Editar
                    <Pencil aria-hidden="true" size={16} />
                  </button>
                </div>

                <div className="platform-account-renewal-summary">
                  <span>
                    <small>Próximo pagamento</small>
                    <strong>{nextPaymentDate ? formatDate(nextPaymentDate) : "Não informado"}</strong>
                    <em>{nextPaymentCopy}</em>
                  </span>
                  <span className={`platform-account-mini-status platform-account-mini-status-${subscriptionTone}`}>
                    {getSubscriptionStatusLabel(assinatura?.status)}
                  </span>
                </div>

                {alteracaoAgendada ? (
                  <div className="platform-subscription-scheduled-change" aria-label="Alteração de plano agendada">
                    <span>
                      <small>Troca agendada</small>
                      <strong>{planoAgendadoTitulo}</strong>
                      <em>Aplica em {formatDate(alteracaoAgendada.aplicar_em)}.</em>
                    </span>
                    <span>
                      <small>Nova mensalidade</small>
                      <strong>{formatCurrency(planoAgendadoValor, planoAgendadoMoeda)}</strong>
                    </span>
                  </div>
                ) : null}

                <div className="platform-payment-history-list platform-payment-history-list-compact" aria-label="Histórico de pagamentos">
                  <div className="platform-account-history-title">
                    <span>Histórico de pagamentos</span>
                    <small>{pagamentos.length ? `${pagamentos.length} registro${pagamentos.length > 1 ? "s" : ""}` : "Sem registros"}</small>
                  </div>
                  {pagamentos.length === 0 ? (
                    <div className="platform-account-empty-line">Nenhum pagamento registrado.</div>
                  ) : (
                    pagamentos.map((payment) => {
                      const paymentTone = getStatusTone(payment.status);

                      return (
                        <div className="platform-payment-history-row" key={payment.id}>
                          <span>
                            <strong>{formatCurrency(payment.valor_centavos, payment.moeda || "BRL")}</strong>
                            <small>{formatDate(getPaymentDate(payment))}</small>
                          </span>

                          <span>
                            <small>{payment.forma_pagamento || "Pagamento"}</small>
                            <em className={`platform-payment-status platform-payment-status-${paymentTone}`}>
                              {getPaymentStatusLabel(payment.status)}
                            </em>
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </article>
            ) : null}
          </section>
        ) : null}
      </main>

      {accountModalPresence.isPresent && visibleAccountStep ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={accountModalPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-account-modal-title"
            aria-modal="true"
            className="platform-modal platform-subaccount-modal platform-account-edit-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeAccountModal}>
              <X aria-hidden="true" size={16} />
            </button>

            {visibleAccountStep === "menu" ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-account-modal-title">Escolha uma ação</h2>
                <p>Edite {isSubconta ? "a subconta" : "a conta principal"} <strong>{accountLabel}</strong>.</p>
                {modalFeedback}

                <div className="platform-subaccount-action-list" aria-label="Ações da conta">
                  <button className="platform-subaccount-action-card" type="button" onClick={() => setAccountStep("email")}>
                    <span className="platform-subaccount-action-icon">
                      <AtSign aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>E-mail</strong>
                      <small>{isSubconta ? "Atualize o e-mail de acesso." : "Envie a confirmação para o novo e-mail."}</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>

                  <button className="platform-subaccount-action-card" type="button" onClick={() => setAccountStep("password")}>
                    <span className="platform-subaccount-action-icon">
                      <LockKeyhole aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Senha</strong>
                      <small>Informe a senha atual antes de salvar a nova.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </div>
              </div>
            ) : null}

            {visibleAccountStep === "email" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleEmailSubmit}>
                <h2 id="platform-account-modal-title">Trocar e-mail</h2>
                <p>{isSubconta ? "A alteração será aplicada ao salvar." : "O novo endereço precisa ser confirmado antes da troca."}</p>
                {modalFeedback}

                <label className="auth-field" htmlFor="conta-email">
                  <span>Novo e-mail</span>
                  <input
                    autoFocus
                    id="conta-email"
                    inputMode="email"
                    onChange={(event) => setEmailValue(event.target.value)}
                    placeholder="novo@email.com.br"
                    required
                    type="email"
                    value={emailValue}
                  />
                </label>

                <div className="auth-action-row">
                  <button className="platform-secondary-button" type="button" onClick={() => setAccountStep("menu")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="platform-primary-button" disabled={isSaving || !isValidEmail(emailValue)} type="submit">
                    {isSaving ? "Salvando" : isSubconta ? "Salvar" : "Enviar link"}
                    {isSaving ? <LoaderCircle className="platform-spin" aria-hidden="true" size={17} /> : <ArrowRight aria-hidden="true" size={17} />}
                  </button>
                </div>
              </form>
            ) : null}

            {visibleAccountStep === "email-sent" ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-account-modal-title">Verifique seu e-mail</h2>
                <p>Enviamos um link de confirmação para <strong>{pendingEmail}</strong>.</p>

                <div className="auth-payment-wait" aria-live="polite">
                  <span className="auth-payment-wait-icon">
                    <LoaderCircle aria-hidden="true" className="auth-spin" size={24} />
                  </span>
                  <span>
                    <strong>Aguardando confirmação</strong>
                    <small>A troca será aplicada assim que o novo e-mail for confirmado.</small>
                  </span>
                </div>

                {modalFeedback}

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={() => setAccountStep("email")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="auth-primary-action auth-action-orange" disabled={isSaving} type="button" onClick={resendEmailChangeLink}>
                    {isSaving ? "Enviando..." : "Reenviar link"}
                    <ArrowRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </div>
            ) : null}

            {visibleAccountStep === "password" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handlePasswordSubmit}>
                <h2 id="platform-account-modal-title">Trocar senha</h2>
                <p>Confirme a senha atual e defina uma nova senha de acesso.</p>
                {modalFeedback}

                <label className="auth-field" htmlFor="conta-senha-atual">
                  <span>Senha atual</span>
                  <div className="auth-password-input">
                    <input
                      autoFocus
                      autoComplete="current-password"
                      id="conta-senha-atual"
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      placeholder="Sua senha atual"
                      required
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                    />
                    <button
                      aria-label={showCurrentPassword ? "Ocultar senha atual" : "Mostrar senha atual"}
                      className="auth-password-toggle"
                      onClick={() => setShowCurrentPassword((current) => !current)}
                      type="button"
                    >
                      {showCurrentPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                    </button>
                  </div>
                </label>

                <label className="auth-field" htmlFor="conta-nova-senha">
                  <span>Nova senha</span>
                  <div className="auth-password-input">
                    <input
                      autoComplete="new-password"
                      id="conta-nova-senha"
                      onChange={(event) => setNewPassword(event.target.value)}
                      placeholder="Nova senha"
                      required
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                    />
                    <button
                      aria-label={showNewPassword ? "Ocultar nova senha" : "Mostrar nova senha"}
                      className="auth-password-toggle"
                      onClick={() => setShowNewPassword((current) => !current)}
                      type="button"
                    >
                      {showNewPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules" aria-label="Requisitos da senha">
                  {passwordRequirements.map((requirement) => (
                    <span className={requirement.passed ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"} key={requirement.label}>
                      <i aria-hidden="true">
                        <Check size={12} />
                      </i>
                      {requirement.label}
                    </span>
                  ))}
                </div>

                <label className="auth-field auth-confirm-field" htmlFor="conta-confirmar-senha">
                  <span>Confirmar senha</span>
                  <div className="auth-password-input">
                    <input
                      autoComplete="new-password"
                      id="conta-confirmar-senha"
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Repita a nova senha"
                      required
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                    />
                    <button
                      aria-label={showConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                      className="auth-password-toggle"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      type="button"
                    >
                      {showConfirmPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules auth-confirm-rules" aria-label="Confirmação da senha">
                  <span className={doPasswordsMatch ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}>
                    <i aria-hidden="true">
                      <Check size={12} />
                    </i>
                    Senhas iguais
                  </span>
                </div>

                <div className="auth-action-row">
                  <button className="platform-secondary-button" type="button" onClick={() => setAccountStep("menu")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="platform-primary-button"
                    disabled={!currentPassword || !isPasswordSecure || !doPasswordsMatch || isSaving}
                    type="submit"
                  >
                    {isSaving ? "Salvando" : "Salvar senha"}
                    {isSaving ? <LoaderCircle className="platform-spin" aria-hidden="true" size={17} /> : <Check aria-hidden="true" size={17} />}
                  </button>
                </div>
              </form>
            ) : null}

            {accountProgress ? <ModalProgress activeIndex={accountProgress.activeIndex} total={accountProgress.total} /> : null}
          </section>
        </div>
      ) : null}

      {subscriptionModalPresence.isPresent && visibleSubscriptionStep && !isSubconta ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={subscriptionModalPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-subscription-modal-title"
            aria-modal="true"
            className="platform-modal platform-subaccount-modal platform-account-edit-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeSubscriptionModal}>
              <X aria-hidden="true" size={16} />
            </button>

            {visibleSubscriptionStep === "menu" ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-subscription-modal-title">Editar assinatura</h2>
                <p>Escolha o que deseja alterar no plano da plataforma.</p>
                {modalFeedback}

                <div className="platform-subaccount-action-list" aria-label="Ações da assinatura">
                  <button className="platform-subaccount-action-card" type="button" onClick={() => setSubscriptionStep("plan")}>
                    <span className="platform-subaccount-action-icon">
                      <WalletCards aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Mudar plano</strong>
                      <small>Escolha outro plano e conclua no Mercado Pago.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>

                  <button className="platform-subaccount-action-card" type="button" onClick={() => setSubscriptionStep("payment")}>
                    <span className="platform-subaccount-action-icon">
                      <CreditCard aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Forma de pagamento</strong>
                      <small>Atualize o cartão usado na próxima cobrança.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </div>
              </div>
            ) : null}

            {visibleSubscriptionStep === "plan" ? (
              <form
                className="auth-step-panel platform-subaccount-flow"
                onSubmit={(event) => {
                  event.preventDefault();
                  void startSubscriptionCheckout("mudar_plano");
                }}
              >
                <h2 id="platform-subscription-modal-title">Mudar plano</h2>
                <p>Upgrades abrem checkout. Downgrades entram na próxima cobrança e mantêm o ciclo atual.</p>
                {modalFeedback}

                <div className="auth-plan-options" role="radiogroup" aria-label="Planos">
                  {planos.map((plano) => {
                    const selected = selectedPlan === plano.id;
                    const price = new Intl.NumberFormat("pt-BR", {
                      maximumFractionDigits: 2,
                      minimumFractionDigits: 2
                    }).format(plano.valor_centavos / 100);

                    return (
                      <button
                        aria-checked={selected}
                        className={selected ? "auth-plan-option auth-plan-option-selected" : "auth-plan-option"}
                        key={plano.id}
                        onClick={() => setSelectedPlan(plano.id)}
                        role="radio"
                        type="button"
                      >
                        <span className="auth-plan-option-head">
                          <strong className="auth-plan-option-name">Plano {plano.nome}</strong>
                          <span className="auth-plan-price" aria-label={`R$ ${price} por mês`}>
                            <span>R$</span>
                            <strong>{price}</strong>
                            <em>/mês</em>
                          </span>
                        </span>
                        <span className="auth-plan-note">Sem fidelidade. Cancele quando quiser.</span>
                      </button>
                    );
                  })}
                </div>

                {prorationPreview && selectedPlanData?.id !== assinatura?.plano ? (
                  <div className="platform-subscription-proration" aria-label="Resumo do primeiro pagamento">
                    <span>
                      <small>{prorationPreview.kind === "downgrade" ? "Crédito no período atual" : "Crédito estimado"}</small>
                      <strong>{formatCurrency(prorationPreview.credit)}</strong>
                    </span>
                    <span>
                      <small>{prorationPreview.kind === "downgrade" ? "Próxima cobrança" : "Primeiro pagamento"}</small>
                      <strong>{formatCurrency(prorationPreview.firstPayment)}</strong>
                    </span>
                    <em>
                      {prorationPreview.kind === "downgrade"
                        ? "O valor menor entra na próxima cobrança; o período atual não recebe desconto."
                        : `Depois disso, a recorrência volta para ${formatCurrency(selectedPlanData?.valor_centavos)} por mês.`}
                    </em>
                  </div>
                ) : null}

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={() => setSubscriptionStep("menu")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="auth-primary-action auth-action-orange" disabled={isSaving || selectedPlan === assinatura?.plano} type="submit">
                    {isSaving ? "Abrindo" : "Continuar"}
                    {isSaving ? <LoaderCircle className="platform-spin" aria-hidden="true" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
                  </button>
                </div>
              </form>
            ) : null}

            {visibleSubscriptionStep === "payment" ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-subscription-modal-title">Trocar pagamento</h2>
                <p>Abra o Mercado Pago para escolher a forma de pagamento da próxima cobrança.</p>
                {modalFeedback}

                <div className="auth-payment-wait auth-payment-wait-static" aria-live="polite">
                  <span className="auth-payment-wait-icon">
                    <CreditCard aria-hidden="true" size={23} />
                  </span>
                  <span>
                    <strong>Ambiente Mercado Pago</strong>
                    <small>A assinatura atual continua ativa até a troca ser aprovada.</small>
                  </span>
                </div>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={() => setSubscriptionStep("menu")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="auth-primary-action auth-action-orange"
                    disabled={isSaving}
                    type="button"
                    onClick={() => void startSubscriptionCheckout("trocar_pagamento")}
                  >
                    {isSaving ? "Abrindo" : "Abrir Mercado Pago"}
                    {isSaving ? <LoaderCircle className="platform-spin" aria-hidden="true" size={17} /> : <ArrowRight aria-hidden="true" size={17} />}
                  </button>
                </div>
              </div>
            ) : null}

            {subscriptionProgress ? (
              <ModalProgress activeIndex={subscriptionProgress.activeIndex} total={subscriptionProgress.total} />
            ) : null}
          </section>
        </div>
      ) : null}
    </PlatformFrame>
  );
}
