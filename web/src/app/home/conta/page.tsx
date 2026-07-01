"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, FormEvent, PointerEvent, ReactNode } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Unplug,
  UserCircle,
  UsersRound,
  WalletCards,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PlatformFrame } from "@/components/platform-frame";
import { apiGet, ApiError, apiPost, apiPut, getCachedApiResponse } from "@/lib/api-client";
import {
  PLATFORM_ACCOUNT_CACHE_STORAGE_KEY,
  DEFAULT_PLATFORM_ACCOUNT_EMAIL,
  getStoredPlatformAuthToken,
  PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";
import { AuthFeedback } from "@/components/auth-feedback";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { getMercadoPagoDeviceSessionId } from "@/lib/mercado-pago-device";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type ContaTipo = "usuario" | "subconta";
type ModalFeedback = { message: string; tone?: "success" | "danger" | "neutral" } | null;
type AccountView = "menu" | "plan" | "pdvs" | "subcontas";
type AccountStep = "menu" | "email" | "email-sent" | "password";
type SubscriptionStep = "plan" | "payment";
type SubaccountStep = "email" | "password" | "permissions";
type CustomCodeStatus = "idle" | "checking" | "applied" | "error";

type PdvForm = {
  nome: string;
};

type PairingState = {
  codigo: string;
  expiraEm: string | null;
  pdvId: number;
};

type RemoteSupportSummary = {
  provider?: string | null;
  rustdesk_id?: string | null;
  servidor?: string | null;
  versao?: string | null;
  status?: string | null;
  configurado_em?: string | null;
  ultimo_check_em?: string | null;
  erro?: string | null;
  senha_configurada?: boolean;
};

type Plano = {
  id: string;
  nome: string;
  valor_centavos: number;
  moeda?: string | null;
  intervalo?: "mensal" | "dias" | string | null;
  intervalo_quantidade?: number | null;
  codigo_assinatura?: string | null;
  personalizado?: boolean | null;
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
  tipo_pagamento?: string | null;
  cartao_bandeira?: string | null;
  cartao_ultimos_digitos?: string | null;
  pago_em?: string | null;
  vencimento_em?: string | null;
  processado_em?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
};

type FormaPagamentoResumo = {
  tipo?: string | null;
  forma_pagamento?: string | null;
  bandeira?: string | null;
  ultimos_digitos?: string | null;
  atualizado_em?: string | null;
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
    intervalo?: "mensal" | "dias" | string | null;
    intervalo_quantidade?: number | null;
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
  valor_recorrente_centavos?: number | null;
  moeda?: string | null;
  proximo_pagamento_em?: string | null;
  iniciada_em?: string | null;
  ativada_em?: string | null;
  cancelada_em?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  plano_snapshot?: {
    nome?: string | null;
    valor_centavos?: number | null;
    moeda?: string | null;
    intervalo?: "mensal" | "dias" | string | null;
    intervalo_quantidade?: number | null;
  } | null;
  pagamentos?: PagamentoAssinatura[];
  forma_pagamento_resumo?: FormaPagamentoResumo | null;
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

type ValidateSubscriptionCodeResponse = {
  codigo: string;
  plano: Plano;
};

type EmailChangeResponse = {
  conta?: Conta;
  email_pendente?: string;
  message?: string;
  requer_verificacao?: boolean;
};

type SubaccountForm = {
  nome: string;
  email: string;
  senha: string;
  confirmarSenha: string;
  permissoes: string[];
};

type StoredContaResponse = {
  data: ContaResponse;
  expiresAt: number;
  token: string;
};

type Pdv = {
  id: number;
  usuario_id: number;
  nome: string;
  identificacao: string;
  status: string;
  status_operacional: string;
  codigo_pareamento?: string;
  codigo_pareamento_pendente: boolean;
  codigo_pareamento_expira_em: string | null;
  pareado_em: string | null;
  ultimo_acesso_em: string | null;
  ultima_sincronizacao_em: string | null;
  ultima_fila_offline_em: string | null;
  sincronizacao_pendente: boolean;
  ativo: boolean;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
  suporte_remoto?: RemoteSupportSummary | null;
};

type Subconta = {
  id: number;
  usuario_id: number;
  email: string;
  nome: string;
  permissoes: string[];
  ativo: boolean;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
  ultimo_acesso_em: string | null;
};

type ActivatePdvResponse = {
  action: "activated";
  pdv: Pdv;
  message?: string;
};

type UnpairPdvResponse = {
  action: "unpaired";
  pdv: Pdv;
  message?: string;
};

type RemoteSupportCredentialsResponse = RemoteSupportSummary & {
  senha?: string | null;
};

type RemoteSupportRotationResponse = {
  pdv: Pdv;
  message?: string;
};

type ModalProgressProps = {
  activeIndex: number;
  total: number;
};

const emptyPdvForm: PdvForm = {
  nome: ""
};

const emptySubaccountForm: SubaccountForm = {
  nome: "",
  email: "",
  senha: "",
  confirmarSenha: "",
  permissoes: ["pdvs_subcontas"]
};

const permissionOptions = [
  {
    chave: "pdvs_subcontas",
    titulo: "PDVs e subcontas",
    descricao: "Gerenciar PDVs e acompanhar os acessos da equipe."
  },
  {
    chave: "grupos_fiscais",
    titulo: "Grupos fiscais",
    descricao: "Abrir o cadastro fiscal usado nos produtos."
  },
  {
    chave: "produtos",
    titulo: "Produtos",
    descricao: "Abrir categorias e cadastro de produtos."
  },
  {
    chave: "estoque",
    titulo: "Estoque",
    descricao: "Abrir locais de estoque e ajustar saldos."
  }
];

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
  processed: "Pago",
  rejected: "Falhou",
  refunded: "Reembolsado"
};

const paymentBrandLabel: Record<string, string> = {
  amex: "American Express",
  aura: "Aura",
  cabal: "Cabal",
  diners: "Diners Club",
  discover: "Discover",
  elo: "Elo",
  hipercard: "Hipercard",
  maestro: "Maestro",
  master: "Mastercard",
  mastercard: "Mastercard",
  visa: "Visa"
};

const paymentBrandShortLabel: Record<string, string> = {
  amex: "AMEX",
  aura: "AURA",
  cabal: "CABAL",
  diners: "DC",
  discover: "DISC",
  elo: "ELO",
  hipercard: "HIPER",
  maestro: "MAESTRO",
  master: "MC",
  mastercard: "MC",
  visa: "VISA"
};

const MIN_MERCADO_PAGO_CHARGE_CENTS = 100;
const storedAccountCacheTtlMs = 10 * 60_000;

function normalizeStatus(status?: string | null) {
  return String(status || "").trim().toLowerCase();
}

function normalizePaymentToken(value?: string | null) {
  return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizePaymentBrand(value?: string | null) {
  const normalized = normalizePaymentToken(value);

  if (!normalized) {
    return null;
  }

  if (["master", "mastercard", "mc"].includes(normalized)) {
    return "mastercard";
  }

  if (["amex", "american_express"].includes(normalized)) {
    return "amex";
  }

  if (["visa", "elo", "hipercard", "hiper", "diners", "discover", "cabal", "aura", "maestro"].includes(normalized)) {
    return normalized === "hiper" ? "hipercard" : normalized;
  }

  return normalized;
}

function getStatusTone(status?: string | null) {
  const normalized = normalizeStatus(status);

  if (["ativa", "approved", "paid", "authorized", "accredited", "processed"].includes(normalized)) {
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

function getPaymentStatusLabel(status?: string | null) {
  const normalized = normalizeStatus(status);
  return paymentStatusLabel[normalized] ?? "Em análise";
}

function getPaymentBrandLabel(brand?: string | null) {
  const normalized = normalizePaymentBrand(brand);

  if (!normalized) {
    return "Cartão";
  }

  return paymentBrandLabel[normalized] ?? normalized;
}

function getPaymentBrandShortLabel(brand?: string | null) {
  const normalized = normalizePaymentBrand(brand);

  if (!normalized) {
    return "CARD";
  }

  return paymentBrandShortLabel[normalized] ?? normalized.slice(0, 4).toUpperCase();
}

function getPaymentTypeLabel(summary?: FormaPagamentoResumo | null) {
  const type = normalizePaymentToken(summary?.tipo || summary?.forma_pagamento);

  if (!summary) {
    return "Aguardando";
  }

  if (summary.ultimos_digitos || summary.bandeira || type.includes("card") || type.includes("cartao")) {
    return "Cartão";
  }

  if (type.includes("pix")) {
    return "Pix";
  }

  if (type.includes("ticket") || type.includes("boleto") || type.includes("bolbradesco")) {
    return "Boleto";
  }

  if (type.includes("account_money")) {
    return "Mercado Pago";
  }

  return "Pagamento";
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

function formatPlanTitle(name?: string | null, fallback = "Plano") {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    return fallback;
  }

  return normalizedName.toLowerCase().startsWith("plano ") ? normalizedName : `Plano ${normalizedName}`;
}

function getPlanBillingSuffix(plan?: { intervalo?: string | null; intervalo_quantidade?: number | null } | null) {
  if (plan?.intervalo === "dias") {
    const quantidade = Number(plan.intervalo_quantidade || 1);

    return quantidade === 1 ? "dia" : `${quantidade} dias`;
  }

  return "Mês";
}

function formatPlanMenuPrice(
  cents?: number | null,
  currency = "BRL",
  plan?: { intervalo?: string | null; intervalo_quantidade?: number | null } | null
) {
  if (typeof cents !== "number") {
    return "Valor não informado";
  }

  return `${formatCurrency(cents, currency)}/${getPlanBillingSuffix(plan)}`;
}

function formatSubscriptionCodeInput(value: string) {
  const characters = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  return characters.length > 3 ? `${characters.slice(0, 3)}-${characters.slice(3)}` : characters;
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

function formatDateOnly(value?: string | null) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function getDaysUntilLabel(value?: string | null) {
  if (!value) {
    return "Sem previsão";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem previsão";
  }

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.ceil((targetStart - todayStart) / 86_400_000);

  if (days < 0) {
    return "Vencida";
  }

  if (days === 0) {
    return "Hoje";
  }

  if (days === 1) {
    return "Falta 1 dia";
  }

  return `Faltam ${days} dias`;
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
  if (
    !assinatura ||
    !plano ||
    (plano.id === assinatura.plano && !plano.codigo_assinatura) ||
    normalizeStatus(assinatura.status) !== "ativa"
  ) {
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

function getPaymentSummaryFromPayment(payment?: PagamentoAssinatura | null): FormaPagamentoResumo | null {
  if (!payment?.forma_pagamento && !payment?.cartao_bandeira && !payment?.cartao_ultimos_digitos) {
    return null;
  }

  return {
    tipo: payment.tipo_pagamento || null,
    forma_pagamento: payment.forma_pagamento || null,
    bandeira: payment.cartao_bandeira || null,
    ultimos_digitos: payment.cartao_ultimos_digitos || null,
    atualizado_em: getPaymentDate(payment)
  };
}

function getPaymentMethodSummary(assinatura: Assinatura | null, payments: PagamentoAssinatura[]) {
  if (assinatura?.forma_pagamento_resumo) {
    return assinatura.forma_pagamento_resumo;
  }

  for (const payment of payments) {
    const summary = getPaymentSummaryFromPayment(payment);

    if (summary) {
      return summary;
    }
  }

  return null;
}

function getPaymentDisplay(summary?: FormaPagamentoResumo | null) {
  if (!summary) {
    return "Não informado";
  }

  if (summary.ultimos_digitos) {
    return `**** ${summary.ultimos_digitos}`;
  }

  const type = normalizePaymentToken(summary.tipo || summary.forma_pagamento);

  if (type.includes("pix")) {
    return "Pix";
  }

  if (type.includes("ticket") || type.includes("boleto") || type.includes("bolbradesco")) {
    return "Boleto";
  }

  if (type.includes("account_money")) {
    return "Mercado Pago";
  }

  if (summary.bandeira || summary.forma_pagamento) {
    return getPaymentBrandLabel(summary.bandeira || summary.forma_pagamento);
  }

  return "Não informado";
}

function getPaymentMethodIdentification(summary?: FormaPagamentoResumo | null) {
  if (!summary) {
    return "Não informado";
  }

  if (summary.ultimos_digitos) {
    const brandSource = summary.bandeira || summary.forma_pagamento;
    const brandLabel = brandSource ? getPaymentBrandLabel(brandSource) : getPaymentTypeLabel(summary);
    return `${brandLabel} final ${summary.ultimos_digitos}`;
  }

  return getPaymentDisplay(summary);
}

function getPaymentBrandForMark(summary?: FormaPagamentoResumo | null) {
  const type = normalizePaymentToken(summary?.tipo || summary?.forma_pagamento);

  if (type.includes("pix") || type.includes("ticket") || type.includes("boleto") || type.includes("account_money")) {
    return null;
  }

  return summary?.bandeira || summary?.forma_pagamento || null;
}

function formatDateTimeShort(value?: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatPdvLastSync(pdv: Pdv) {
  return (
    formatDateTimeShort(pdv.ultima_sincronizacao_em) ||
    formatDateTimeShort(pdv.ultimo_acesso_em) ||
    (pdv.pareado_em ? "Sem sincronização recente" : "Não conectado")
  );
}

function getRemoteSupportStatusLabel(support?: RemoteSupportSummary | null) {
  const status = normalizeStatus(support?.status);

  if (status === "configurado") {
    return "Configurado";
  }

  if (status === "configurando") {
    return "Pendente";
  }

  if (status === "erro") {
    return "Erro";
  }

  return "Não configurado";
}

function getRemoteSupportStatusClass(support?: RemoteSupportSummary | null) {
  const status = normalizeStatus(support?.status);

  if (status === "configurado") {
    return "platform-device-state-ok";
  }

  if (status === "erro") {
    return "platform-device-state-danger";
  }

  return "platform-device-state-muted";
}

function getSubaccountStatusTone(subconta: Subconta) {
  return subconta.ativo ? "success" : "neutral";
}

function getSubaccountPermissionSummary(permissoes: string[]) {
  if (!permissoes.length) {
    return "Sem acessos";
  }

  if (permissoes.length === 1 && permissoes[0] === "pdvs_subcontas") {
    return "PDVs e subcontas";
  }

  return `${permissoes.length} acesso${permissoes.length > 1 ? "s" : ""}`;
}

function setAccountMenuWaveOrigin(target: HTMLElement, x: number, y: number) {
  target.style.setProperty("--system-menu-hover-x", `${x}px`);
  target.style.setProperty("--system-menu-hover-y", `${y}px`);
}

function startAccountMenuPointerWave(event: PointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setAccountMenuWaveOrigin(target, event.clientX - rect.left, event.clientY - rect.top);
  target.classList.remove("system-home-menu-item--hovering");
  void target.offsetWidth;
  target.classList.add("system-home-menu-item--hovering");
}

function startAccountMenuFocusWave(event: FocusEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setAccountMenuWaveOrigin(target, rect.width / 2, rect.height / 2);
  target.classList.remove("system-home-menu-item--hovering");
  void target.offsetWidth;
  target.classList.add("system-home-menu-item--hovering");
}

function stopAccountMenuWave(event: FocusEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  event.currentTarget.classList.remove("system-home-menu-item--hovering");
}

function PaymentBrandMark({ brand, compact = false }: { brand?: string | null; compact?: boolean }) {
  const normalized = normalizePaymentBrand(brand);
  const label = getPaymentBrandLabel(normalized);
  const className = `${normalized
    ? `platform-payment-brand platform-payment-brand-${normalized}`
    : "platform-payment-brand platform-payment-brand-generic"}${compact ? " platform-payment-brand-compact" : ""}`;

  if (normalized === "mastercard") {
    return (
      <span className={className} role="img" aria-label={label}>
        <i aria-hidden="true" />
        <i aria-hidden="true" />
      </span>
    );
  }

  if (!normalized) {
    return (
      <span className={className} role="img" aria-label={label}>
        <CreditCard aria-hidden="true" size={16} />
      </span>
    );
  }

  return (
    <span className={className} role="img" aria-label={label}>
      <b>{getPaymentBrandShortLabel(normalized)}</b>
    </span>
  );
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

function sortPayments(payments: PagamentoAssinatura[]) {
  return [...payments].sort((a, b) => {
    const first = new Date(getPaymentDate(a) || 0).getTime();
    const second = new Date(getPaymentDate(b) || 0).getTime();
    return second - first;
  });
}

function getAccountPaymentHistory(assinaturas: Assinatura[] = [], assinaturaAtual?: Assinatura | null) {
  const paymentsById = new Map<number, PagamentoAssinatura>();

  for (const assinatura of [assinaturaAtual, ...assinaturas]) {
    for (const payment of assinatura?.pagamentos ?? []) {
      paymentsById.set(payment.id, payment);
    }
  }

  return sortPayments([...paymentsById.values()]);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isSecurePasswordValue(password: string) {
  return password.trim().length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}

function buildPdvPayload(form: PdvForm) {
  return {
    nome: form.nome.trim()
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  return fallback;
}

function readStoredAccountData(token: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const rawCache = window.localStorage.getItem(PLATFORM_ACCOUNT_CACHE_STORAGE_KEY);

  if (!rawCache) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawCache) as StoredContaResponse;

    if (parsed.token !== token || parsed.expiresAt <= Date.now() || !parsed.data?.conta) {
      window.localStorage.removeItem(PLATFORM_ACCOUNT_CACHE_STORAGE_KEY);
      return null;
    }

    return parsed.data;
  } catch {
    window.localStorage.removeItem(PLATFORM_ACCOUNT_CACHE_STORAGE_KEY);
    return null;
  }
}

function writeStoredAccountData(token: string, data: ContaResponse) {
  if (typeof window === "undefined") {
    return;
  }

  const payload: StoredContaResponse = {
    data,
    expiresAt: Date.now() + storedAccountCacheTtlMs,
    token
  };

  window.localStorage.setItem(PLATFORM_ACCOUNT_CACHE_STORAGE_KEY, JSON.stringify(payload));
}

function buildSessionAccountData() {
  if (typeof window === "undefined") {
    return null;
  }

  const storedToken = getStoredPlatformAuthToken();

  if (!storedToken) {
    return null;
  }

  const storedType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY);
  const storedEmail = window.localStorage.getItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY);
  const tipoConta: ContaTipo = storedType === "subconta" ? "subconta" : "usuario";

  return {
    tipo_conta: tipoConta,
    conta: {
      id: 0,
      email: storedEmail || DEFAULT_PLATFORM_ACCOUNT_EMAIL,
      nome: tipoConta === "subconta" ? "Subconta" : null
    },
    assinatura: null,
    assinaturas: [],
    planos: []
  } satisfies ContaResponse;
}

function getInitialAccountData() {
  const storedToken = getStoredPlatformAuthToken();

  if (!storedToken) {
    return null;
  }

  return (
    getCachedApiResponse<ContaResponse>("/conta", { token: storedToken }) ||
    readStoredAccountData(storedToken) ||
    buildSessionAccountData()
  );
}

export default function PlatformAccountPage() {
  const [accountData, setAccountData] = useState<ContaResponse | null>(() => getInitialAccountData());
  const [loading, setLoading] = useState(() => !accountData);
  const [accountRefreshing, setAccountRefreshing] = useState(
    () => accountData?.tipo_conta === "usuario" && !accountData.assinatura && !(accountData.planos?.length)
  );
  const [pageError, setPageError] = useState<string | null>(null);
  const [accountView, setAccountView] = useState<AccountView>("menu");
  const [pdvs, setPdvs] = useState<Pdv[]>([]);
  const [subcontas, setSubcontas] = useState<Subconta[]>([]);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accountStep, setAccountStep] = useState<AccountStep | null>(null);
  const [subscriptionStep, setSubscriptionStep] = useState<SubscriptionStep | null>(null);
  const [selectedPdvId, setSelectedPdvId] = useState<number | null>(null);
  const [activePairing, setActivePairing] = useState<PairingState | null>(null);
  const [pdvForm, setPdvForm] = useState<PdvForm>(emptyPdvForm);
  const [editingPdvId, setEditingPdvId] = useState<number | null>(null);
  const [isPdvModalOpen, setIsPdvModalOpen] = useState(false);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [pdvToUnpair, setPdvToUnpair] = useState<Pdv | null>(null);
  const [remoteSupportCredentialsPdv, setRemoteSupportCredentialsPdv] = useState<Pdv | null>(null);
  const [remoteSupportCredentials, setRemoteSupportCredentials] = useState<RemoteSupportCredentialsResponse | null>(null);
  const [isRemoteSupportLoading, setIsRemoteSupportLoading] = useState(false);
  const [showRemoteSupportPassword, setShowRemoteSupportPassword] = useState(false);
  const [isSubaccountModalOpen, setIsSubaccountModalOpen] = useState(false);
  const [subaccountStep, setSubaccountStep] = useState<SubaccountStep>("email");
  const [subaccountForm, setSubaccountForm] = useState<SubaccountForm>(emptySubaccountForm);
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
  const [showSubaccountPassword, setShowSubaccountPassword] = useState(false);
  const [showSubaccountConfirmPassword, setShowSubaccountConfirmPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState("inicial");
  const [subscriptionCode, setSubscriptionCode] = useState("");
  const [subscriptionCustomPlan, setSubscriptionCustomPlan] = useState<Plano | null>(null);
  const [subscriptionCodeStatus, setSubscriptionCodeStatus] = useState<CustomCodeStatus>("idle");
  const [isPairingSaving, setIsPairingSaving] = useState(false);
  const [isPairingCopied, setIsPairingCopied] = useState(false);
  const pairingCopyTimeoutRef = useRef<number | null>(null);
  const hasOpenModal = Boolean(
    accountStep ||
      subscriptionStep ||
      isPdvModalOpen ||
      isPairingModalOpen ||
      pdvToUnpair ||
      remoteSupportCredentialsPdv ||
      isSubaccountModalOpen
  );
  const accountModalPresence = useModalPresence(accountStep);
  const visibleAccountStep = accountModalPresence.presentValue;
  const subscriptionModalPresence = useModalPresence(subscriptionStep);
  const visibleSubscriptionStep = subscriptionModalPresence.presentValue;
  const pdvModalPresence = useModalPresence(isPdvModalOpen);
  const pairingModalPresence = useModalPresence(isPairingModalOpen);
  const pdvUnpairPresence = useModalPresence(pdvToUnpair);
  const visiblePdvToUnpair = pdvUnpairPresence.presentValue;
  const remoteSupportCredentialsPresence = useModalPresence(remoteSupportCredentialsPdv);
  const visibleRemoteSupportCredentialsPdv = remoteSupportCredentialsPresence.presentValue;
  const subaccountModalPresence = useModalPresence(isSubaccountModalOpen);
  const hasVisibleModal =
    accountModalPresence.isPresent ||
    subscriptionModalPresence.isPresent ||
    pdvModalPresence.isPresent ||
    pairingModalPresence.isPresent ||
    pdvUnpairPresence.isPresent ||
    remoteSupportCredentialsPresence.isPresent ||
    subaccountModalPresence.isPresent;

  const token = typeof window === "undefined" ? null : getStoredPlatformAuthToken();

  async function loadAccessLists(authToken: string) {
    try {
      setAccessLoading(true);
      setAccessError(null);

      const [pdvResult, subcontaResult] = await Promise.all([
        apiGet<Pdv[]>("/pdvs", { cacheTtlMs: 60_000, token: authToken }),
        apiGet<Subconta[]>("/subcontas", { cacheTtlMs: 60_000, token: authToken })
      ]);

      setPdvs(pdvResult);
      setSelectedPdvId((current) => current ?? pdvResult[0]?.id ?? null);
      setSubcontas(subcontaResult);
    } catch (error) {
      setPdvs([]);
      setSelectedPdvId(null);
      setSubcontas([]);
      setAccessError(getErrorMessage(error, "Não foi possível carregar PDVs e subcontas."));
    } finally {
      setAccessLoading(false);
    }
  }

  async function loadAccount() {
    const storedToken = getStoredPlatformAuthToken();

    if (!storedToken) {
      setLoading(false);
      setPageError("Entre novamente para consultar a conta.");
      setAccessLoading(false);
      return;
    }

    const cachedAccount = getCachedApiResponse<ContaResponse>("/conta", { token: storedToken });
    const hasRenderableAccount = Boolean(cachedAccount || accountData);
    const currentAccountData = cachedAccount || accountData;
    let startedAccessListLoad = false;

    if (cachedAccount) {
      setAccountData(cachedAccount);
      setPageError(null);
      setLoading(false);
    }

    if (currentAccountData?.tipo_conta === "usuario") {
      startedAccessListLoad = true;
      void loadAccessLists(storedToken);
    }

    try {
      if (!hasRenderableAccount) {
        setLoading(true);
      } else {
        setAccountRefreshing(true);
      }

      const result = await apiGet<ContaResponse>("/conta", { cacheTtlMs: 60_000, token: storedToken });
      setAccountData(result);
      setPageError(null);
      writeStoredAccountData(storedToken, result);

      if (result.conta?.email) {
        window.localStorage.setItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY, result.conta.email);
      }

      if (result.tipo_conta === "usuario") {
        if (!startedAccessListLoad) {
          void loadAccessLists(storedToken);
        }
      } else {
        setPdvs([]);
        setSubcontas([]);
        setAccessError(null);
        setAccessLoading(false);
        setAccountView("menu");
      }
    } catch (error) {
      if (!hasRenderableAccount) {
        setPageError(getErrorMessage(error, "Não foi possível carregar os dados da conta."));
      }
      setAccessLoading(false);
    } finally {
      setLoading(false);
      setAccountRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    setIsPairingCopied(false);

    return () => {
      if (pairingCopyTimeoutRef.current) {
        window.clearTimeout(pairingCopyTimeoutRef.current);
      }
    };
  }, [activePairing?.codigo]);

  useEffect(() => {
    if (!subscriptionStep) {
      return;
    }

    void getMercadoPagoDeviceSessionId(1200);
  }, [subscriptionStep]);

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
  const subscriptionPlanOptions = useMemo(
    () =>
      subscriptionCustomPlan
        ? [subscriptionCustomPlan, ...planos.filter((plano) => plano.id !== subscriptionCustomPlan.id)]
        : planos,
    [subscriptionCustomPlan, planos]
  );
  const selectedPlanData = subscriptionPlanOptions.find((plano) => plano.id === selectedPlan) || null;
  const selectedCustomSubscriptionCode =
    subscriptionCustomPlan && selectedPlan === subscriptionCustomPlan.id
      ? subscriptionCustomPlan.codigo_assinatura || null
      : null;
  const selectedPlanIsCurrent = selectedPlan === assinatura?.plano && !selectedCustomSubscriptionCode;
  const prorationPreview = getLocalProrationPreview(assinatura, selectedPlanData);
  const pagamentos = useMemo(
    () => getAccountPaymentHistory(accountData?.assinaturas ?? [], assinatura),
    [accountData?.assinaturas, assinatura]
  );
  const paymentMethodSummary = useMemo(
    () => getPaymentMethodSummary(assinatura, pagamentos),
    [assinatura, pagamentos]
  );
  const passwordRequirements = [
    { label: "8 caracteres", passed: newPassword.trim().length >= 8 },
    { label: "Maiúscula", passed: /[A-Z]/.test(newPassword) },
    { label: "Minúscula", passed: /[a-z]/.test(newPassword) },
    { label: "Número", passed: /\d/.test(newPassword) }
  ];
  const isPasswordSecure = passwordRequirements.every((requirement) => requirement.passed);
  const doPasswordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const subaccountPasswordRequirements = [
    { label: "8 caracteres", passed: subaccountForm.senha.trim().length >= 8 },
    { label: "Maiúscula", passed: /[A-Z]/.test(subaccountForm.senha) },
    { label: "Minúscula", passed: /[a-z]/.test(subaccountForm.senha) },
    { label: "Número", passed: /\d/.test(subaccountForm.senha) }
  ];
  const isSubaccountPasswordSecure = isSecurePasswordValue(subaccountForm.senha);
  const doSubaccountPasswordsMatch =
    subaccountForm.senha.length > 0 && subaccountForm.senha === subaccountForm.confirmarSenha;
  const isAccountDataPending = accountRefreshing && accountData?.tipo_conta === "usuario";
  const currentPlanTitle = planoAtual?.nome
    ? formatPlanTitle(assinatura?.plano_snapshot?.nome || planoAtual.nome)
    : assinatura?.plano_snapshot?.nome
      ? formatPlanTitle(assinatura.plano_snapshot.nome)
      : assinatura?.plano
        ? formatPlanTitle(assinatura.plano)
        : isAccountDataPending
          ? "Carregando plano"
          : "Sem plano ativo";
  const currentPlanBillingSource = assinatura?.plano_snapshot || planoAtual || null;
  const currentPlanMenuPriceLabel = assinatura
    ? formatPlanMenuPrice(
        assinatura.valor_recorrente_centavos ??
          assinatura.valor_centavos ??
          assinatura.plano_snapshot?.valor_centavos ??
          planoAtual?.valor_centavos,
        assinatura.moeda || assinatura.plano_snapshot?.moeda || planoAtual?.moeda || "BRL",
        currentPlanBillingSource
      )
    : isAccountDataPending
      ? "Atualizando valor"
      : "Sem assinatura ativa";
  const nextPaymentDate = assinatura?.proximo_pagamento_em || getEstimatedNextPaymentDate(assinatura);
  const nextPaymentDaysLabel = getDaysUntilLabel(nextPaymentDate);

  const paymentMethodBrand = getPaymentBrandForMark(paymentMethodSummary);
  const paymentTypeLabel = getPaymentTypeLabel(paymentMethodSummary);
  const paymentMethodIdentification = getPaymentMethodIdentification(paymentMethodSummary);
  const paymentMethodUpdatedLabel = paymentMethodSummary?.atualizado_em
    ? `Atualizado em ${formatDateOnly(paymentMethodSummary.atualizado_em)}`
    : "Atualização não informada";
  const recurringValueLabel = assinatura
    ? formatPlanMenuPrice(
        assinatura.valor_recorrente_centavos ??
          assinatura.valor_centavos ??
          assinatura.plano_snapshot?.valor_centavos ??
          planoAtual?.valor_centavos,
        assinatura.moeda || assinatura.plano_snapshot?.moeda || planoAtual?.moeda || "BRL",
        currentPlanBillingSource
      )
    : isAccountDataPending
      ? "Atualizando dados"
      : "Sem cobrança ativa";
  const activePdvs = pdvs.filter((pdv) => pdv.ativo).length;
  const pairedPdvs = pdvs.filter((pdv) => pdv.ativo && Boolean(pdv.pareado_em)).length;
  const activeSubaccounts = subcontas.filter((subconta) => subconta.ativo).length;
  const pdvMenuStatus = accessLoading ? "Carregando" : `${activePdvs} ativo${activePdvs === 1 ? "" : "s"}`;
  const subaccountMenuStatus = accessLoading
    ? "Carregando"
    : `${activeSubaccounts} ativa${activeSubaccounts === 1 ? "" : "s"}`;
  const selectedPdv = useMemo(
    () => pdvs.find((pdv) => pdv.id === selectedPdvId) ?? pdvs[0] ?? null,
    [pdvs, selectedPdvId]
  );
  const editingPdv = useMemo(
    () => (editingPdvId ? pdvs.find((pdv) => pdv.id === editingPdvId) ?? null : null),
    [editingPdvId, pdvs]
  );
  const visiblePairing = selectedPdv && activePairing?.pdvId === selectedPdv.id ? activePairing : null;

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
    setSubscriptionCode("");
    setSubscriptionCustomPlan(null);
    setSubscriptionCodeStatus("idle");
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

  function openSubscriptionModal(nextStep: SubscriptionStep) {
    resetModalState();
    setSelectedPlan(assinatura?.plano || planos[0]?.id || "inicial");
    setSubscriptionStep(nextStep);
  }

  function closeSubscriptionModal() {
    setSubscriptionStep(null);
    resetModalState();
  }

  function closePdvModal() {
    setIsPdvModalOpen(false);
    setEditingPdvId(null);
    setPdvForm(emptyPdvForm);
    setFeedback(null);
  }

  function closeRemoteSupportModal() {
    setRemoteSupportCredentialsPdv(null);
    setRemoteSupportCredentials(null);
    setShowRemoteSupportPassword(false);
    setIsRemoteSupportLoading(false);
  }

  function openCreatePdvModal() {
    setAccountStep(null);
    setSubscriptionStep(null);
    setIsSubaccountModalOpen(false);
    closeRemoteSupportModal();
    setEditingPdvId(null);
    setPdvForm(emptyPdvForm);
    setFeedback(null);
    setIsPdvModalOpen(true);
  }

  function openEditPdvModal(pdv: Pdv) {
    setAccountStep(null);
    setSubscriptionStep(null);
    setIsSubaccountModalOpen(false);
    closeRemoteSupportModal();
    setEditingPdvId(pdv.id);
    setSelectedPdvId(pdv.id);
    setPdvForm({ nome: pdv.nome });
    setFeedback(null);
    setIsPdvModalOpen(true);
  }

  function openPairingModal(pdv: Pdv) {
    setSelectedPdvId(pdv.id);
    setFeedback(null);
    setIsPairingModalOpen(true);
  }

  function openCreateSubaccountModal() {
    setAccountStep(null);
    setSubscriptionStep(null);
    setIsPdvModalOpen(false);
    setIsPairingModalOpen(false);
    setPdvToUnpair(null);
    closeRemoteSupportModal();
    setSubaccountStep("email");
    setSubaccountForm(emptySubaccountForm);
    setShowSubaccountPassword(false);
    setShowSubaccountConfirmPassword(false);
    setFeedback(null);
    setIsSubaccountModalOpen(true);
  }

  function closeSubaccountModal() {
    setIsSubaccountModalOpen(false);
    setSubaccountStep("email");
    setSubaccountForm(emptySubaccountForm);
    setShowSubaccountPassword(false);
    setShowSubaccountConfirmPassword(false);
    setFeedback(null);
  }

  function closeTopAccountPageModal() {
    if (remoteSupportCredentialsPdv) {
      closeRemoteSupportModal();
      return;
    }

    if (pdvToUnpair) {
      setPdvToUnpair(null);
      return;
    }

    if (isPairingModalOpen) {
      setIsPairingModalOpen(false);
      return;
    }

    if (isPdvModalOpen) {
      closePdvModal();
      return;
    }

    if (isSubaccountModalOpen) {
      closeSubaccountModal();
      return;
    }

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

  async function handlePdvSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ message: "Entre novamente para salvar o PDV.", tone: "danger" });
      return;
    }

    if (pdvForm.nome.trim().length < 2) {
      setFeedback({ message: "Informe um nome para o PDV.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);

      if (editingPdvId) {
        const updated = await apiPut<Pdv>(`/pdvs/${editingPdvId}`, buildPdvPayload(pdvForm), { token });
        setPdvs((current) => current.map((pdv) => (pdv.id === updated.id ? updated : pdv)));
      } else {
        const created = await apiPost<Pdv>("/pdvs", buildPdvPayload(pdvForm), { token });
        setPdvs((current) => [...current, created]);
        setSelectedPdvId(created.id);

        if (created.codigo_pareamento) {
          setActivePairing({
            codigo: created.codigo_pareamento,
            expiraEm: created.codigo_pareamento_expira_em,
            pdvId: created.id
          });
          setIsPairingModalOpen(true);
        }
      }

      closePdvModal();
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível salvar o PDV."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleActivatePdv(pdv: Pdv) {
    if (!token || pdv.ativo) {
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<ActivatePdvResponse>(`/pdvs/${pdv.id}/ativar`, {}, { token });

      setPdvs((current) => current.map((item) => (item.id === result.pdv.id ? result.pdv : item)));
      setSelectedPdvId(result.pdv.id);
      setFeedback({ message: result.message || "PDV ativado.", tone: "success" });
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível ativar o PDV."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGeneratePairingCode(pdvId = selectedPdv?.id) {
    if (!token || !pdvId) {
      setFeedback({ message: "Selecione um PDV para gerar o código.", tone: "danger" });
      return;
    }

    try {
      setIsPairingSaving(true);
      setFeedback(null);
      const updated = await apiPost<Pdv>(`/pdvs/${pdvId}/codigo-pareamento`, {}, { token });

      setPdvs((current) => current.map((pdv) => (pdv.id === updated.id ? updated : pdv)));
      setSelectedPdvId(updated.id);

      if (updated.codigo_pareamento) {
        setActivePairing({
          codigo: updated.codigo_pareamento,
          expiraEm: updated.codigo_pareamento_expira_em,
          pdvId: updated.id
        });
      }

      setIsPairingModalOpen(true);
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível gerar o código."), tone: "danger" });
    } finally {
      setIsPairingSaving(false);
    }
  }

  async function handleCopyPairingCode() {
    if (!visiblePairing?.codigo) {
      setFeedback({ message: "Gere um código para copiar.", tone: "danger" });
      return;
    }

    try {
      await navigator.clipboard.writeText(visiblePairing.codigo);
      setIsPairingCopied(true);

      if (pairingCopyTimeoutRef.current) {
        window.clearTimeout(pairingCopyTimeoutRef.current);
      }

      pairingCopyTimeoutRef.current = window.setTimeout(() => {
        setIsPairingCopied(false);
        pairingCopyTimeoutRef.current = null;
      }, 1800);
    } catch {
      setFeedback({ message: `Copie manualmente: ${visiblePairing.codigo}`, tone: "neutral" });
    }
  }

  async function copyRemoteSupportValue(value: string | null | undefined, successMessage: string, fallbackLabel: string) {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
      setFeedback({ message: `${fallbackLabel} indisponível para este PDV.`, tone: "danger" });
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setFeedback({ message: successMessage, tone: "success" });
    } catch {
      setFeedback({ message: `${fallbackLabel}: ${trimmedValue}`, tone: "neutral" });
    }
  }

  async function handleCopyRemoteSupportId(pdv: Pdv) {
    await copyRemoteSupportValue(pdv.suporte_remoto?.rustdesk_id, "ID do RustDesk copiado.", "ID do RustDesk");
  }

  async function handleShowRemoteSupportCredentials(pdv: Pdv) {
    if (!token) {
      setFeedback({ message: "Entre novamente para ver a senha do suporte remoto.", tone: "danger" });
      return;
    }

    setRemoteSupportCredentialsPdv(pdv);
    setRemoteSupportCredentials(null);
    setShowRemoteSupportPassword(false);
    setIsRemoteSupportLoading(true);
    setFeedback(null);

    try {
      const credentials = await apiGet<RemoteSupportCredentialsResponse>(`/pdvs/${pdv.id}/suporte-remoto/credenciais`, { token });
      setRemoteSupportCredentials(credentials);
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível carregar as credenciais."), tone: "danger" });
    } finally {
      setIsRemoteSupportLoading(false);
    }
  }

  async function handleRequestRemoteSupportRotation(pdv: Pdv) {
    if (!token) {
      setFeedback({ message: "Entre novamente para rotacionar a senha do suporte remoto.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<RemoteSupportRotationResponse>(`/pdvs/${pdv.id}/suporte-remoto/rotacionar`, {}, { token });

      setPdvs((current) => current.map((item) => (item.id === result.pdv.id ? result.pdv : item)));
      setSelectedPdvId(result.pdv.id);
      setFeedback({ message: result.message || "Rotação solicitada.", tone: "success" });
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível solicitar a rotação."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmUnpairPdv() {
    if (!token || !pdvToUnpair) {
      setPdvToUnpair(null);
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<UnpairPdvResponse>(`/pdvs/${pdvToUnpair.id}/desvincular`, {}, { token });

      setPdvs((current) => current.map((item) => (item.id === result.pdv.id ? result.pdv : item)));
      setSelectedPdvId(result.pdv.id);

      if (activePairing?.pdvId === result.pdv.id) {
        setActivePairing(null);
        setIsPairingModalOpen(false);
      }

      setPdvToUnpair(null);
      setFeedback({ message: result.message || "PDV desvinculado.", tone: "success" });
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível desvincular o PDV."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSubaccountPermission(permissionKey: string) {
    setSubaccountForm((current) => {
      const exists = current.permissoes.includes(permissionKey);

      return {
        ...current,
        permissoes: exists
          ? current.permissoes.filter((permission) => permission !== permissionKey)
          : [...current.permissoes, permissionKey]
      };
    });
  }

  async function handleSubaccountEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ message: "Entre novamente para criar subcontas.", tone: "danger" });
      return;
    }

    const email = subaccountForm.email.trim().toLowerCase();
    const nome = subaccountForm.nome.trim().replace(/\s+/g, " ");

    if (nome.length < 2) {
      setFeedback({ message: "Informe um nome para este acesso.", tone: "danger" });
      return;
    }

    if (!isValidEmail(email)) {
      setFeedback({ message: "Informe um e-mail válido.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<{ disponivel: boolean; message?: string; email?: string }>(
        "/subcontas/identificar",
        { email },
        { token }
      );

      if (!result.disponivel) {
        setFeedback({ message: result.message || "Este e-mail já está em uso.", tone: "danger" });
        return;
      }

      setSubaccountForm((current) => ({ ...current, nome, email: result.email || email }));
      setSubaccountStep("password");
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível verificar este e-mail."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubaccountPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSubaccountPasswordSecure) {
      setFeedback({ message: "A senha ainda não atende aos requisitos mínimos.", tone: "danger" });
      return;
    }

    if (!doSubaccountPasswordsMatch) {
      setFeedback({ message: "As senhas precisam ser iguais.", tone: "danger" });
      return;
    }

    setFeedback(null);
    setSubaccountStep("permissions");
  }

  async function handleSubaccountPermissionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ message: "Entre novamente para salvar subcontas.", tone: "danger" });
      return;
    }

    if (!subaccountForm.permissoes.length) {
      setFeedback({ message: "Selecione pelo menos um acesso para esta subconta.", tone: "danger" });
      return;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const result = await apiPost<{ subconta: Subconta; message?: string }>(
        "/subcontas",
        {
          nome: subaccountForm.nome.trim().replace(/\s+/g, " "),
          email: subaccountForm.email.trim().toLowerCase(),
          senha: subaccountForm.senha,
          permissoes: subaccountForm.permissoes
        },
        { token }
      );

      setSubcontas((current) => [...current, result.subconta]);
      closeSubaccountModal();
    } catch (error) {
      setFeedback({ message: getErrorMessage(error, "Não foi possível salvar a subconta."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

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

  async function applySubscriptionCode() {
    const code = formatSubscriptionCodeInput(subscriptionCode);

    if (code.length < 7 || subscriptionCodeStatus === "checking") {
      return;
    }

    try {
      setSubscriptionCodeStatus("checking");
      setFeedback(null);

      const result = await apiPost<ValidateSubscriptionCodeResponse>(
        "/assinaturas/codigo/validar",
        {
          codigo_assinatura: code,
          email: accountEmail
        },
        { token }
      );
      const customPlan = {
        ...result.plano,
        codigo_assinatura: formatSubscriptionCodeInput(result.codigo),
        personalizado: true
      };

      setSubscriptionCustomPlan(customPlan);
      setSelectedPlan(customPlan.id);
      setSubscriptionCode(formatSubscriptionCodeInput(result.codigo));
      setSubscriptionCodeStatus("applied");
    } catch (error) {
      setSubscriptionCustomPlan(null);
      setSubscriptionCodeStatus("error");
      setFeedback({ message: getErrorMessage(error, "Não foi possível validar o código."), tone: "danger" });
    }
  }

  async function startSubscriptionCheckout(acao: "mudar_plano" | "trocar_pagamento") {
    if (!token) {
      setFeedback({ message: "Entre novamente para alterar a assinatura.", tone: "danger" });
      return;
    }

    const checkoutWindow = acao === "trocar_pagamento" ? window.open("about:blank", "_blank") : null;

    if (checkoutWindow) {
      checkoutWindow.opener = null;
    }

    try {
      setIsSaving(true);
      setFeedback(null);
      const deviceSessionId = await getMercadoPagoDeviceSessionId();
      const checkoutPayload: Record<string, unknown> =
        acao === "mudar_plano"
          ? selectedCustomSubscriptionCode
            ? { acao, codigo_assinatura: selectedCustomSubscriptionCode }
            : { acao, plano: selectedPlan }
          : { acao };

      if (deviceSessionId) {
        checkoutPayload.mercado_pago_device_id = deviceSessionId;
      }

      const result = await apiPost<CheckoutResponse>(
        "/assinaturas/gerenciar-checkout",
        checkoutPayload,
        { token }
      );

      if (result.alteracaoAgendada || result.assinaturaAtualizada) {
        setFeedback({ message: result.message || "Assinatura atualizada.", tone: "success" });
        await loadAccount();
        return;
      }

      if (!result.checkoutUrl) {
        checkoutWindow?.close();
        setFeedback({ message: "O Mercado Pago não retornou o link de checkout.", tone: "danger" });
        return;
      }

      if (acao === "trocar_pagamento") {
        if (checkoutWindow && !checkoutWindow.closed) {
          checkoutWindow.location.href = result.checkoutUrl;
        } else {
          const openedCheckoutWindow = window.open(result.checkoutUrl, "_blank", "noopener,noreferrer");

          if (!openedCheckoutWindow) {
            window.location.assign(result.checkoutUrl);
          }
        }

        return;
      }

      window.location.assign(result.checkoutUrl);
    } catch (error) {
      checkoutWindow?.close();
      setFeedback({ message: getErrorMessage(error, "Não foi possível abrir o checkout."), tone: "danger" });
    } finally {
      setIsSaving(false);
    }
  }

  function renderAccountFlowProgress(view: AccountView) {
    const activeIndex = view === "menu" ? 0 : 1;

    return (
      <div className="platform-flow-progress" aria-hidden="true">
        {Array.from({ length: 2 }).map((_, index) => (
          <span
            className={
              index === activeIndex
                ? "platform-flow-progress-bar platform-flow-progress-bar-active"
                : "platform-flow-progress-bar"
            }
            key={index}
          />
        ))}
      </div>
    );
  }

  function renderAccountMenuAction({
    detail,
    disabled,
    disabledLabel = "Conta principal",
    featured = false,
    icon: Icon,
    onClick,
    title
  }: {
    detail: ReactNode;
    disabled?: boolean;
    disabledLabel?: string;
    featured?: boolean;
    icon: LucideIcon;
    onClick: () => void;
    title: string;
  }) {
    const itemClassName = featured
      ? "system-home-menu-item system-home-menu-item-featured platform-account-menu-button"
      : "system-home-menu-item platform-account-menu-button";

    if (disabled) {
      return (
        <span className={`${itemClassName} system-home-menu-item-disabled`} aria-disabled="true">
          <span className="system-home-menu-icon">
            <Icon aria-hidden="true" size={20} />
          </span>
          <span className="system-home-menu-copy">
            <strong>{title}</strong>
            <em>{detail}</em>
          </span>
          <span className="system-home-menu-status">{disabledLabel}</span>
        </span>
      );
    }

    return (
      <button
        className={itemClassName}
        type="button"
        onBlur={stopAccountMenuWave}
        onClick={onClick}
        onFocus={startAccountMenuFocusWave}
        onPointerEnter={startAccountMenuPointerWave}
        onPointerLeave={stopAccountMenuWave}
      >
        <span className="system-home-menu-icon">
          <Icon aria-hidden="true" size={20} />
        </span>
        <span className="system-home-menu-copy">
          <strong>{title}</strong>
          <em>{detail}</em>
        </span>
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    );
  }

  function renderBackButton(label = "Voltar") {
    return (
      <button
        className="platform-secondary-button platform-compact-button platform-account-back-button"
        type="button"
        onClick={() => setAccountView("menu")}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {label}
      </button>
    );
  }

  function renderMenuView() {
    const paymentMethodMenuDetail =
      assinatura ? (
        <span className="platform-account-menu-payment-detail">
          <PaymentBrandMark brand={paymentMethodBrand} compact />
          <span>{paymentMethodIdentification}</span>
        </span>
      ) : isAccountDataPending ? (
        "Atualizando forma de pagamento"
      ) : (
        "Sem assinatura ativa"
      );

    return (
      <section className="system-home-card platform-account-menu-card" aria-label="Menu da conta">
        <nav className="system-home-menu" aria-label="Perfil, plano e acessos">
          <div className="system-home-menu-featured">
            {renderAccountMenuAction({
              detail: accountEmail,
              featured: true,
              icon: KeyRound,
              onClick: () => openAccountModal(),
              title: "Alterar email ou senha"
            })}
          </div>

          <div className="system-home-menu-grid">
            {renderAccountMenuAction({
              detail: currentPlanMenuPriceLabel,
              disabled: isSubconta,
              icon: WalletCards,
              onClick: () => setAccountView("plan"),
              title: assinatura || isAccountDataPending ? currentPlanTitle : "Meu plano"
            })}

            {renderAccountMenuAction({
              detail: paymentMethodMenuDetail,
              disabled: isSubconta || !assinatura,
              disabledLabel: isSubconta ? "Conta principal" : "Sem assinatura ativa",
              icon: CreditCard,
              onClick: () => openSubscriptionModal("payment"),
              title: "Forma de pagamento"
            })}

            {renderAccountMenuAction({
              detail: `${pdvMenuStatus}${accessLoading || !pdvs.length ? "" : ` / ${pairedPdvs} pareado${pairedPdvs === 1 ? "" : "s"}`}`,
              disabled: isSubconta,
              icon: Monitor,
              onClick: () => setAccountView("pdvs"),
              title: "PDVs"
            })}

            {renderAccountMenuAction({
              detail: subaccountMenuStatus,
              disabled: isSubconta,
              icon: UsersRound,
              onClick: () => setAccountView("subcontas"),
              title: "Subcontas"
            })}
          </div>
        </nav>

        {renderAccountFlowProgress("menu")}
      </section>
    );
  }

  function renderAccountMenuLoading() {
    return (
      <section className="system-home-card platform-loading-card platform-account-menu-card" aria-label="Carregando conta">
        <div className="platform-loading-featured">
          <i className="platform-skeleton-block" />
          <span>
            <i className="platform-skeleton-line" />
            <i className="platform-skeleton-line" />
          </span>
          <i className="platform-loading-arrow" />
        </div>

        <div className="platform-loading-grid platform-account-loading-menu-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <span className="platform-loading-row" key={index}>
              <i className="platform-skeleton-block" />
              <i>
                <i className="platform-skeleton-line" />
                <i className="platform-skeleton-line" />
              </i>
            </span>
          ))}
        </div>

        <div className="platform-flow-progress" aria-hidden="true">
          <span className="platform-flow-progress-bar platform-flow-progress-bar-active" />
          <span className="platform-flow-progress-bar" />
        </div>
      </section>
    );
  }

  function renderPaymentHistory() {
    return (
      <section className="platform-account-section platform-account-history-section" aria-label="Histórico de pagamentos">
        <div className="platform-account-section-title platform-account-section-title-static">
          <span>
            <ReceiptText aria-hidden="true" size={18} />
            <strong>Histórico de pagamentos</strong>
          </span>
          <small>{pagamentos.length ? `${pagamentos.length} registro${pagamentos.length > 1 ? "s" : ""}` : "Sem registros"}</small>
        </div>

        <div className="platform-payment-history-list platform-payment-history-list-compact">
          {pagamentos.length === 0 ? (
            <div className="platform-account-empty-line">Nenhum pagamento registrado.</div>
          ) : (
            pagamentos.map((payment) => {
              const paymentTone = getStatusTone(payment.status);
              const paymentSummary = getPaymentSummaryFromPayment(payment);
              const paymentBrand = getPaymentBrandForMark(paymentSummary);

              return (
                <div className="platform-payment-history-row" key={payment.id}>
                  <em className={`platform-payment-status platform-payment-status-${paymentTone}`}>
                    {getPaymentStatusLabel(payment.status)}
                  </em>

                  <span>
                    <strong>{formatCurrency(payment.valor_centavos, payment.moeda || "BRL")}</strong>
                    <small>{formatDate(getPaymentDate(payment))}</small>
                  </span>

                  <span className="platform-payment-history-method">
                    <PaymentBrandMark brand={paymentBrand} />
                    <span>
                      <small>{getPaymentDisplay(paymentSummary)}</small>
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    );
  }

  function renderPlanView() {
    return (
      <section className="system-home-card platform-account-flow-card" aria-label="Meu plano">
        <header className="platform-account-flow-head platform-account-flow-head-compact">
          {renderBackButton()}
        </header>

        <div className="platform-account-flow-body">
          <section className="platform-account-section platform-account-subscription-overview" aria-label="Resumo da assinatura">
            <div className="platform-account-plan-summary">
              <span className="platform-account-plan-main">
                <small>Plano atual</small>
                <strong>{currentPlanTitle}</strong>
                <em>{recurringValueLabel}</em>
              </span>

              <span className="platform-account-plan-main platform-account-plan-next-payment">
                <small>Próximo pagamento</small>
                <strong>{nextPaymentDate ? formatDateOnly(nextPaymentDate) : "Não informado"}</strong>
                <em>{assinatura ? nextPaymentDaysLabel : "Sem assinatura ativa"}</em>
              </span>
            </div>

            <div className="platform-account-plan-actions">
              <button className="platform-primary-button platform-compact-button" disabled={!assinatura} type="button" onClick={() => openSubscriptionModal("plan")}>
                Mudar plano
                <ArrowRight aria-hidden="true" size={17} />
              </button>
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

          </section>

          {renderPaymentHistory()}
        </div>

        {renderAccountFlowProgress("plan")}
      </section>
    );
  }

  function renderAccessLoadingRows() {
    return Array.from({ length: 3 }).map((_, index) => (
      <div className="platform-account-record-row platform-account-record-row-skeleton" key={index}>
        <i className="platform-skeleton-block platform-account-record-skeleton-icon" />
        <span className="platform-account-record-primary">
          <span>
            <i className="platform-skeleton-line platform-account-record-skeleton-title" />
            <i className="platform-skeleton-line platform-account-record-skeleton-copy" />
          </span>
        </span>
        <span className="platform-account-record-meta">
          <i className="platform-skeleton-line platform-account-record-skeleton-title" />
          <i className="platform-skeleton-line platform-account-record-skeleton-copy" />
        </span>
        <span className="platform-account-record-meta">
          <i className="platform-skeleton-line platform-account-record-skeleton-copy" />
        </span>
        <span className="platform-account-record-status">
          <i className="platform-skeleton-line platform-account-record-skeleton-pill" />
        </span>
      </div>
    ));
  }

  function renderPdvAccessLoadingRows() {
    return Array.from({ length: 3 }).map((_, index) => (
      <div className="platform-access-row platform-access-row-skeleton" key={index}>
        <i className="platform-skeleton-block platform-access-skeleton-icon" />
        <span className="platform-access-main-copy">
          <i className="platform-skeleton-line platform-access-skeleton-title" />
          <i className="platform-skeleton-line platform-access-skeleton-copy" />
        </span>
        <span className="platform-access-meta">
          <i className="platform-skeleton-line platform-access-skeleton-meta" />
          <i className="platform-skeleton-line platform-access-skeleton-copy" />
        </span>
        <span className="platform-row-actions">
          <i className="platform-skeleton-block platform-access-skeleton-action" />
          <i className="platform-skeleton-block platform-access-skeleton-action" />
        </span>
      </div>
    ));
  }

  function renderPdvsView() {
    return (
      <section className="system-home-card platform-account-flow-card" aria-label="PDVs">
        <header className="platform-account-flow-head platform-account-flow-head-compact">
          {renderBackButton()}
          <button
            className="platform-primary-button platform-compact-button platform-account-create-button"
            type="button"
            onClick={openCreatePdvModal}
          >
            <Plus aria-hidden="true" size={16} />
            Novo PDV
          </button>
        </header>

        <div className="platform-account-flow-body">
          {accessError ? <AuthFeedback tone="error">{accessError}</AuthFeedback> : null}
          {feedback ? (
            <AuthFeedback tone={feedback.tone === "danger" ? "error" : feedback.tone || "neutral"}>{feedback.message}</AuthFeedback>
          ) : null}

          <div className="platform-access-list platform-account-access-list" aria-label="PDVs cadastrados">
            {accessLoading ? (
              renderPdvAccessLoadingRows()
            ) : pdvs.length ? (
              pdvs.map((pdv) => {
                const pdvState = !pdv.ativo ? "Desativado" : pdv.pareado_em ? "Pareado" : "Sem dispositivo";
                const stateClass =
                  pdv.ativo && pdv.pareado_em ? "platform-device-state-ok" : "platform-device-state-danger";
                const supportStatusLabel = getRemoteSupportStatusLabel(pdv.suporte_remoto);
                const supportStateClass = getRemoteSupportStatusClass(pdv.suporte_remoto);
                const supportRustDeskId = pdv.suporte_remoto?.rustdesk_id;

                return (
                  <div
                    className={pdv.ativo ? "platform-access-row" : "platform-access-row platform-record-inactive"}
                    key={pdv.id}
                  >
                    <span className="platform-access-icon" aria-hidden="true">
                      <Monitor size={18} />
                    </span>
                    <span className="platform-access-main-copy">
                      <strong>{pdv.nome}</strong>
                      <small className="platform-device-state">
                        <span>{pdv.identificacao}</span>
                        <span aria-hidden="true">·</span>
                        <span className={stateClass}>{pdvState}</span>
                        <span aria-hidden="true">Â·</span>
                        <span className={supportStateClass}>Suporte: {supportStatusLabel}</span>
                        {supportRustDeskId ? (
                          <>
                            <span aria-hidden="true">Â·</span>
                            <span>ID {supportRustDeskId}</span>
                          </>
                        ) : null}
                      </small>
                    </span>
                    <span className="platform-access-meta">
                      <b>Última sincronização</b>
                      <small>{formatPdvLastSync(pdv)}</small>
                    </span>
                    <span className="platform-row-actions">
                      <button
                        type="button"
                        aria-label={`Editar ${pdv.nome}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditPdvModal(pdv);
                        }}
                      >
                        <Pencil aria-hidden="true" size={15} />
                      </button>
                      {pdv.ativo && !pdv.pareado_em ? (
                        <button
                          type="button"
                          aria-label={`Gerar código de ativação para ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openPairingModal(pdv);
                            void handleGeneratePairingCode(pdv.id);
                          }}
                        >
                          <KeyRound aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                      {pdv.ativo && pdv.pareado_em && supportRustDeskId ? (
                        <button
                          type="button"
                          aria-label={`Copiar ID RustDesk de ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCopyRemoteSupportId(pdv);
                          }}
                        >
                          <Copy aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                      {pdv.ativo && pdv.pareado_em && supportRustDeskId && pdv.suporte_remoto?.senha_configurada && !isSubconta ? (
                        <button
                          type="button"
                          aria-label={`Ver senha RustDesk de ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleShowRemoteSupportCredentials(pdv);
                          }}
                        >
                          <Eye aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                      {pdv.ativo && pdv.pareado_em && supportRustDeskId && !isSubconta ? (
                        <button
                          disabled={isSaving}
                          type="button"
                          aria-label={`Rotacionar senha RustDesk de ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleRequestRemoteSupportRotation(pdv);
                          }}
                        >
                          <RotateCcw aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                      {!pdv.ativo ? (
                        <button
                          type="button"
                          aria-label={`Ativar ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleActivatePdv(pdv);
                          }}
                        >
                          <RotateCcw aria-hidden="true" size={15} />
                        </button>
                      ) : pdv.pareado_em ? (
                        <button
                          type="button"
                          aria-label={`Desvincular dispositivo de ${pdv.nome}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setPdvToUnpair(pdv);
                          }}
                        >
                          <Unplug aria-hidden="true" size={15} />
                        </button>
                      ) : null}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="platform-account-record-empty">
                <span className="platform-account-empty-icon" aria-hidden="true">
                  <Monitor size={42} strokeWidth={1.9} />
                  <span className="platform-account-empty-zero">0</span>
                </span>
                <strong>Nenhum PDV cadastrado</strong>
                <span>Crie um PDV para liberar o acesso do caixa.</span>
              </div>
            )}
          </div>
        </div>

        {renderAccountFlowProgress("pdvs")}
      </section>
    );
  }

  function renderSubaccountsView() {
    return (
      <section className="system-home-card platform-account-flow-card" aria-label="Subcontas">
        <header className="platform-account-flow-head platform-account-flow-head-compact">
          {renderBackButton()}
          <button
            className="platform-primary-button platform-compact-button platform-account-create-button"
            type="button"
            onClick={openCreateSubaccountModal}
          >
            <Plus aria-hidden="true" size={16} />
            Nova subconta
          </button>
        </header>

        <div className="platform-account-flow-body">
          {accessError ? <AuthFeedback tone="error">{accessError}</AuthFeedback> : null}

          <div className="platform-account-record-table" aria-label="Subcontas cadastradas">
            <div className="platform-account-record-head">
              <span>Subconta</span>
              <span>Status</span>
              <span>Acessos</span>
              <span>Último acesso</span>
            </div>

            {accessLoading ? (
              renderAccessLoadingRows()
            ) : subcontas.length ? (
              subcontas.map((subconta) => {
                const subaccountTone = getSubaccountStatusTone(subconta);

                return (
                  <div
                    className={subconta.ativo ? "platform-account-record-row" : "platform-account-record-row platform-account-record-row-muted"}
                    key={subconta.id}
                  >
                    <span className="platform-account-record-icon" aria-hidden="true">
                      <UsersRound size={18} />
                    </span>
                    <span className="platform-account-record-primary" data-label="Subconta">
                      <span>
                        <strong>{subconta.nome}</strong>
                        <small>{subconta.email}</small>
                      </span>
                    </span>
                    <span className="platform-account-record-meta" data-label="Acessos">
                      <strong>{getSubaccountPermissionSummary(subconta.permissoes)}</strong>
                      <small>{subconta.registros_vinculados} vínculo{subconta.registros_vinculados === 1 ? "" : "s"}</small>
                    </span>
                    <span className="platform-account-record-meta" data-label="Último acesso">
                      <strong>{formatDate(subconta.ultimo_acesso_em)}</strong>
                      <small>{subconta.ativo ? "Disponível" : "Sem acesso"}</small>
                    </span>
                    <span className="platform-account-record-status" data-label="Status">
                      <em className={`platform-payment-status platform-payment-status-${subaccountTone}`}>
                        {subconta.ativo ? "Ativa" : "Desativada"}
                      </em>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="platform-account-record-empty">
                <span className="platform-account-empty-icon" aria-hidden="true">
                  <UsersRound size={42} strokeWidth={1.9} />
                  <span className="platform-account-empty-zero">0</span>
                </span>
                <strong>Nenhuma subconta cadastrada</strong>
                <span>Crie um acesso para equipe ou suporte.</span>
              </div>
            )}
          </div>
        </div>

        {renderAccountFlowProgress("subcontas")}
      </section>
    );
  }

  const feedbackTone: "neutral" | "success" | "error" | "warning" =
    feedback?.tone === "danger" ? "error" : feedback?.tone || "neutral";
  const modalFeedback = feedback ? <AuthFeedback tone={feedbackTone}>{feedback.message}</AuthFeedback> : null;
  const accountProgress = visibleAccountStep ? getAccountProgress(visibleAccountStep, isSubconta) : null;
  const accountFlowMeta: { icon: LucideIcon; title: string } =
    accountView === "plan" && !isSubconta
      ? { icon: WalletCards, title: "Meu plano" }
      : accountView === "pdvs" && !isSubconta
        ? { icon: Monitor, title: "PDVs" }
        : accountView === "subcontas" && !isSubconta
          ? { icon: UsersRound, title: "Subcontas" }
          : { icon: UserCircle, title: "Minha conta" };
  const AccountFlowIcon = accountFlowMeta.icon;

  return (
    <PlatformFrame>
      <main className="system-home-page platform-account-flow-page">
        <div className="system-home-shell platform-account-shell">
          <section className="platform-flow-section-title" aria-label={accountFlowMeta.title}>
            <span className="platform-flow-section-main">
              <AccountFlowIcon aria-hidden="true" />
              <strong>{accountFlowMeta.title}</strong>
            </span>
          </section>

          {loading ? (
            renderAccountMenuLoading()
          ) : pageError ? (
            <section className="system-home-card platform-account-dashboard-card platform-account-error-card">
              <div className="platform-account-loading platform-account-loading-danger">
                <AlertCircle aria-hidden="true" size={18} />
                {pageError}
              </div>
            </section>
          ) : accountData && conta ? (
            accountView === "plan" && !isSubconta ? (
              renderPlanView()
            ) : accountView === "pdvs" && !isSubconta ? (
              renderPdvsView()
            ) : accountView === "subcontas" && !isSubconta ? (
              renderSubaccountsView()
            ) : (
              renderMenuView()
            )
          ) : null}
        </div>
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

      {pdvModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pdvModalPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section aria-labelledby="platform-pdv-modal-title" aria-modal="true" className="platform-modal" role="dialog">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closePdvModal}>
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-pdv-modal-title">{editingPdvId ? "Editar PDV" : "Novo PDV"}</h2>
              <p>{editingPdv ? editingPdv.identificacao : "Nomeie o computador que vai operar o caixa."}</p>
            </div>
            {modalFeedback}

            <form className="platform-compact-form" onSubmit={handlePdvSubmit}>
              <label>
                <span>Nome do PDV</span>
                <input
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setPdvForm((current) => ({ ...current, nome: event.target.value }))}
                  placeholder="Balcão principal"
                  required
                  type="text"
                  value={pdvForm.nome}
                />
              </label>

              <div className="platform-modal-actions platform-item-modal-actions">
                <button className="platform-secondary-button" type="button" onClick={closePdvModal}>
                  Cancelar
                </button>
                {editingPdvId && editingPdv?.ativo === false ? (
                  <button
                    className="platform-primary-button platform-save-button"
                    disabled={isSaving}
                    type="button"
                    onClick={() => void handleActivatePdv(editingPdv)}
                  >
                    {isSaving ? "Ativando" : "Ativar"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <RotateCcw aria-hidden="true" size={17} />
                    )}
                  </button>
                ) : (
                  <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
                    {isSaving ? "Salvando" : editingPdvId ? "Salvar" : "Criar PDV"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <Monitor aria-hidden="true" size={17} />
                    )}
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {pairingModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pairingModalPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-pairing-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={() => setIsPairingModalOpen(false)}>
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-pairing-modal-title">Código de ativação</h2>
              <p>Informe este código no Caixa Ágil Desktop do computador do caixa.</p>
            </div>
            {modalFeedback}

            <div className="platform-pairing-modal-code" aria-label="Código de pareamento">
              <small>{selectedPdv ? `${selectedPdv.identificacao} · ${selectedPdv.nome}` : "Selecione um PDV"}</small>
              <strong>{visiblePairing?.codigo ?? "Gere um código"}</strong>
              <span>
                {visiblePairing?.expiraEm
                  ? `Expira em ${formatDateTimeShort(visiblePairing.expiraEm)}`
                  : "O código aparece aqui após ser gerado."}
              </span>
            </div>

            <div className="platform-modal-actions">
              <button className="platform-secondary-button" type="button" onClick={handleCopyPairingCode}>
                {isPairingCopied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                {isPairingCopied ? "Copiado" : "Copiar código"}
              </button>
              <button
                className="platform-primary-button"
                disabled={isPairingSaving || !selectedPdv}
                type="button"
                onClick={() => void handleGeneratePairingCode()}
              >
                {isPairingSaving ? "Gerando" : "Gerar novo"}
                {isPairingSaving ? (
                  <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                ) : (
                  <RotateCcw aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {remoteSupportCredentialsPresence.isPresent && visibleRemoteSupportCredentialsPdv ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={remoteSupportCredentialsPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-remote-support-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact platform-remote-support-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeRemoteSupportModal}>
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-remote-support-modal-title">Suporte remoto</h2>
              <p>{visibleRemoteSupportCredentialsPdv.identificacao} · {visibleRemoteSupportCredentialsPdv.nome}</p>
            </div>
            {modalFeedback}

            {isRemoteSupportLoading ? (
              <div className="platform-remote-support-skeleton" aria-hidden="true">
                <i />
                <i />
              </div>
            ) : (
              <div className="platform-remote-support-credentials">
                <span className="platform-remote-support-field">
                  <small>ID RustDesk</small>
                  <strong>{remoteSupportCredentials?.rustdesk_id ?? visibleRemoteSupportCredentialsPdv.suporte_remoto?.rustdesk_id ?? "Sem ID"}</strong>
                </span>

                {!isSubconta ? (
                  <span className="platform-remote-support-field">
                    <small>Senha</small>
                    <strong>{showRemoteSupportPassword ? remoteSupportCredentials?.senha || "Sem senha" : "••••••••••••"}</strong>
                    <button
                      type="button"
                      aria-label={showRemoteSupportPassword ? "Ocultar senha" : "Mostrar senha"}
                      onClick={() => setShowRemoteSupportPassword((current) => !current)}
                    >
                      {showRemoteSupportPassword ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
                    </button>
                  </span>
                ) : null}
              </div>
            )}

            <div className="platform-modal-actions">
              <button
                className="platform-secondary-button"
                type="button"
                onClick={() =>
                  void copyRemoteSupportValue(
                    remoteSupportCredentials?.rustdesk_id ?? visibleRemoteSupportCredentialsPdv.suporte_remoto?.rustdesk_id,
                    "ID do RustDesk copiado.",
                    "ID do RustDesk"
                  )
                }
              >
                <Copy aria-hidden="true" size={16} />
                Copiar ID
              </button>
              {!isSubconta ? (
                <button
                  className="platform-primary-button"
                  disabled={!remoteSupportCredentials?.senha}
                  type="button"
                  onClick={() => void copyRemoteSupportValue(remoteSupportCredentials?.senha, "Senha copiada.", "Senha")}
                >
                  <Copy aria-hidden="true" size={16} />
                  Copiar senha
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {pdvUnpairPresence.isPresent && visiblePdvToUnpair ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pdvUnpairPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-unpair-pdv-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={() => setPdvToUnpair(null)}>
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-unpair-pdv-modal-title">Desvincular dispositivo?</h2>
              <p>{visiblePdvToUnpair.identificacao} · {visiblePdvToUnpair.nome}</p>
            </div>
            {modalFeedback}
            <p className="platform-modal-note">
              O cadastro e o histórico do PDV serão preservados. O computador pareado perderá acesso quando validar a sessão na API.
            </p>

            <div className="platform-modal-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setPdvToUnpair(null)}>
                Cancelar
              </button>
              <button
                className="platform-primary-button platform-danger-button"
                disabled={isSaving}
                type="button"
                onClick={handleConfirmUnpairPdv}
              >
                {isSaving ? "Desvinculando" : "Desvincular"}
                {isSaving ? (
                  <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                ) : (
                  <Unplug aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {subaccountModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={subaccountModalPresence.state}
          role="presentation"
          {...accountPageModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-create-subaccount-modal-title"
            aria-modal="true"
            className="platform-modal platform-subaccount-modal platform-account-edit-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeSubaccountModal}>
              <X aria-hidden="true" size={16} />
            </button>

            {subaccountStep === "email" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubaccountEmailSubmit}>
                <h2 id="platform-create-subaccount-modal-title">Identifique o acesso</h2>
                <p>Use um nome interno e um e-mail que ainda não exista.</p>
                {modalFeedback}

                <label className="auth-field" htmlFor="conta-subconta-nome">
                  <span>Identificação</span>
                  <input
                    autoFocus
                    id="conta-subconta-nome"
                    maxLength={80}
                    onChange={(event) =>
                      setSubaccountForm((current) => ({ ...current, nome: event.target.value }))
                    }
                    placeholder="Financeiro, Gerente ou Contador"
                    required
                    type="text"
                    value={subaccountForm.nome}
                  />
                </label>

                <label className="auth-field" htmlFor="conta-subconta-email">
                  <span>E-mail</span>
                  <input
                    id="conta-subconta-email"
                    inputMode="email"
                    onChange={(event) =>
                      setSubaccountForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="operador@empresa.com.br"
                    required
                    type="email"
                    value={subaccountForm.email}
                  />
                </label>

                <div className="auth-action-row">
                  <button className="platform-secondary-button" type="button" onClick={closeSubaccountModal}>
                    Cancelar
                  </button>
                  <button className="platform-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? "Verificando" : "Continuar"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {subaccountStep === "password" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubaccountPasswordSubmit}>
                <h2 id="platform-create-subaccount-modal-title">Crie a senha</h2>
                <p>
                  Esta senha será usada pelo acesso <strong>{subaccountForm.nome}</strong>.
                </p>
                {modalFeedback}

                <label className="auth-field" htmlFor="conta-subconta-senha">
                  <span>Senha</span>
                  <div className="auth-password-input">
                    <input
                      autoFocus
                      aria-invalid={subaccountForm.senha.length > 0 && !isSubaccountPasswordSecure}
                      autoComplete="new-password"
                      id="conta-subconta-senha"
                      onChange={(event) =>
                        setSubaccountForm((current) => ({ ...current, senha: event.target.value }))
                      }
                      placeholder="Nova senha"
                      required
                      type={showSubaccountPassword ? "text" : "password"}
                      value={subaccountForm.senha}
                    />
                    <button
                      aria-label={showSubaccountPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="auth-password-toggle"
                      onClick={() => setShowSubaccountPassword((current) => !current)}
                      type="button"
                    >
                      {showSubaccountPassword ? (
                        <EyeOff aria-hidden="true" size={18} />
                      ) : (
                        <Eye aria-hidden="true" size={18} />
                      )}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules" aria-label="Requisitos da senha">
                  {subaccountPasswordRequirements.map((requirement) => (
                    <span
                      className={requirement.passed ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}
                      key={requirement.label}
                    >
                      <i aria-hidden="true">
                        <Check size={12} />
                      </i>
                      {requirement.label}
                    </span>
                  ))}
                </div>

                <label className="auth-field auth-confirm-field" htmlFor="conta-subconta-confirmar-senha">
                  <span>Confirmar senha</span>
                  <div className="auth-password-input">
                    <input
                      aria-invalid={subaccountForm.confirmarSenha.length > 0 && !doSubaccountPasswordsMatch}
                      autoComplete="new-password"
                      id="conta-subconta-confirmar-senha"
                      onChange={(event) =>
                        setSubaccountForm((current) => ({ ...current, confirmarSenha: event.target.value }))
                      }
                      placeholder="Repita a senha"
                      required
                      type={showSubaccountConfirmPassword ? "text" : "password"}
                      value={subaccountForm.confirmarSenha}
                    />
                    <button
                      aria-label={showSubaccountConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                      className="auth-password-toggle"
                      onClick={() => setShowSubaccountConfirmPassword((current) => !current)}
                      type="button"
                    >
                      {showSubaccountConfirmPassword ? (
                        <EyeOff aria-hidden="true" size={18} />
                      ) : (
                        <Eye aria-hidden="true" size={18} />
                      )}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules auth-confirm-rules" aria-label="Confirmação da senha">
                  <span className={doSubaccountPasswordsMatch ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}>
                    <i aria-hidden="true">
                      <Check size={12} />
                    </i>
                    Senhas iguais
                  </span>
                </div>

                <div className="auth-action-row">
                  <button className="platform-secondary-button" type="button" onClick={() => setSubaccountStep("email")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className="platform-primary-button"
                    disabled={!isSubaccountPasswordSecure || !doSubaccountPasswordsMatch || isSaving}
                    type="submit"
                  >
                    Continuar
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </div>
              </form>
            ) : null}

            {subaccountStep === "permissions" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubaccountPermissionsSubmit}>
                <h2 id="platform-create-subaccount-modal-title">Defina os acessos</h2>
                <p>
                  Escolha quais áreas <strong>{subaccountForm.nome}</strong> pode abrir.
                </p>
                {modalFeedback}

                <div className="platform-permission-list" aria-label="Acessos da subconta">
                  {permissionOptions.map((permission) => {
                    const checked = subaccountForm.permissoes.includes(permission.chave);

                    return (
                      <label
                        className={
                          checked
                            ? "platform-permission-option platform-permission-option-selected"
                            : "platform-permission-option"
                        }
                        key={permission.chave}
                      >
                        <input
                          checked={checked}
                          onChange={() => toggleSubaccountPermission(permission.chave)}
                          type="checkbox"
                        />
                        <span className="platform-permission-check" aria-hidden="true">
                          {checked ? <Check size={14} /> : null}
                        </span>
                        <span className="platform-permission-copy">
                          <strong>{permission.titulo}</strong>
                          <small>{permission.descricao}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="auth-action-row platform-item-modal-actions">
                  <button className="platform-secondary-button" type="button" onClick={() => setSubaccountStep("password")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
                    {isSaving ? "Salvando" : "Criar subconta"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <UsersRound aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            <ModalProgress
              activeIndex={subaccountStep === "email" ? 0 : subaccountStep === "password" ? 1 : 2}
              total={3}
            />
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
                  {subscriptionPlanOptions.map((plano) => {
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
                            <em>/{getPlanBillingSuffix(plano).toLowerCase()}</em>
                          </span>
                        </span>
                        <span className="auth-plan-note">
                          {plano.codigo_assinatura
                            ? "Oferta personalizada vinculada ao código informado."
                            : "Sem fidelidade. Cancele quando quiser."}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div
                  className={subscriptionCode ? "auth-subscription-code auth-subscription-code-has-action" : "auth-subscription-code"}
                >
                  <input
                    value={subscriptionCode}
                    onChange={(event) => {
                      setSubscriptionCode(formatSubscriptionCodeInput(event.currentTarget.value));
                      setSubscriptionCustomPlan(null);
                      setSelectedPlan((current) =>
                        current === subscriptionCustomPlan?.id ? assinatura?.plano || planos[0]?.id || current : current
                      );
                      setSubscriptionCodeStatus("idle");
                      setFeedback(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void applySubscriptionCode();
                      }
                    }}
                    placeholder="Código do plano personalizado"
                    autoComplete="off"
                    aria-label="Código do plano personalizado"
                    inputMode="text"
                    maxLength={7}
                  />
                  {subscriptionCode ? (
                    <button
                      className="auth-subscription-code-action"
                      type="button"
                      onClick={() => void applySubscriptionCode()}
                      disabled={subscriptionCodeStatus === "checking" || subscriptionCode.length < 7}
                    >
                      {subscriptionCodeStatus === "checking" ? "Validando" : "Aplicar"}
                    </button>
                  ) : null}
                </div>

                {prorationPreview && !selectedPlanIsCurrent ? (
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
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={closeSubscriptionModal}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="auth-primary-action auth-action-orange" disabled={isSaving || selectedPlanIsCurrent} type="submit">
                    {isSaving ? "Abrindo" : "Continuar"}
                    {isSaving ? <LoaderCircle className="platform-spin" aria-hidden="true" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
                  </button>
                </div>
              </form>
            ) : null}

            {visibleSubscriptionStep === "payment" ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-subscription-modal-title">Forma de pagamento</h2>
                <p>Confira o método atual antes de abrir o checkout.</p>
                {modalFeedback}

                <div className="platform-current-payment-card" aria-label="Forma de pagamento atual">
                  <span className="platform-current-payment-mark">
                    <PaymentBrandMark brand={paymentMethodBrand} />
                  </span>
                  <span className="platform-current-payment-copy">
                    <small>Forma atual</small>
                    <strong>{paymentMethodIdentification}</strong>
                    <em>{paymentMethodUpdatedLabel}</em>
                  </span>
                  <span className="platform-account-status-chip platform-account-status-chip-neutral">{paymentTypeLabel}</span>
                </div>

                <p className="platform-payment-modal-note">A assinatura continua ativa até a troca ser aprovada.</p>

                <div className="auth-action-row">
                  <button className="auth-secondary-action auth-action-light" type="button" onClick={closeSubscriptionModal}>
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

          </section>
        </div>
      ) : null}
    </PlatformFrame>
  );
}
