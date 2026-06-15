"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Apple,
  Armchair,
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  Banknote,
  Beef,
  Beer,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Coffee,
  CreditCard,
  CupSoda,
  Dumbbell,
  Eye,
  Gift,
  LoaderCircle,
  Package,
  Pill,
  QrCode,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingCart,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
  Warehouse,
  Wrench,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useState, type CSSProperties } from "react";

import { ApiError, apiGet, apiPost, getApiUrl } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type PaymentKey = "dinheiro" | "cartao" | "pix" | "convenio";
type ComparablePaymentKey = Exclude<PaymentKey, "convenio">;
type ConferenceStatus = "fechado" | "conferido";
type DifferenceStatus = "batido" | "faltando" | "sobrando" | "misto";

type CaixaSession = {
  id: string;
  data_operacao_chave: string;
  data_operacao_rotulo: string;
  numero_turno: number;
  rotulo: string;
  aberto_em: string | null;
  fechado_em: string | null;
  situacao: string;
  funcionario_abertura_id: string | null;
  funcionario_abertura_nome: string | null;
};

type PaymentSummary = {
  chave: PaymentKey;
  rotulo: string;
  vendas_count: number;
  recebimentos_count: number;
  vendas_esperado_centavos: number;
  recebimentos_esperado_centavos: number;
  descontos_centavos: number;
  despesas_centavos: number;
  esperado_centavos: number;
  confirmado_centavos: number | null;
  diferenca_centavos: number | null;
  status: Exclude<DifferenceStatus, "misto"> | null;
};

type SessionSummary = {
  sessao: CaixaSession;
  status_conferencia: ConferenceStatus;
  revisado_em: string | null;
  vendas_count: number;
  despesas_count: number;
  itens_count: number;
  total_esperado_centavos: number;
  total_descontos_centavos: number;
  total_despesas_centavos: number;
  total_confirmado_centavos: number | null;
  diferenca_total_centavos: number | null;
  status_geral: DifferenceStatus | null;
  formas_pagamento: PaymentSummary[];
};

type CashConferenceSnapshot = {
  gerado_em: string;
  pendentes: SessionSummary[];
  conferidos: SessionSummary[];
};

type PaymentTotals = Record<PaymentKey, number>;

type PaymentSettings = Record<PaymentKey, boolean>;

type ConfiguracaoSistema = {
  formas_pagamento?: Partial<PaymentSettings> | null;
};

type ArquivoResumo = {
  id: number;
  nome_original: string;
  mime_type: string;
  tipo: string;
  tamanho_bytes: number;
  url: string | null;
};

type CashSaleItemCategoryVisual = {
  id: number | null;
  nome: string;
  icone: string | null;
  cor: string | null;
  accent?: string | null;
};

type CashSaleItem = {
  id: string;
  produto_id: number | null;
  nome: string;
  categoria: string;
  categoria_visual?: CashSaleItemCategoryVisual | null;
  categoria_icone?: string | null;
  categoria_cor?: string | null;
  categoria_accent?: string | null;
  categoryIcon?: string | null;
  categoryColor?: string | null;
  categoryAccent?: string | null;
  imagem?: ArquivoResumo | null;
  image?: ArquivoResumo | null;
  imagem_url?: string | null;
  imageUrl?: string | null;
  quantidade: number;
  preco_unitario_centavos: number;
  total_centavos: number;
};

type CashSale = {
  id: string;
  tipo_movimento: "venda" | "recebimento_convenio";
  titulo: string;
  convenio_id: string | null;
  nome_cliente: string | null;
  nome_consumidor: string | null;
  documento_consumidor: string | null;
  rotulo_origem: string;
  canal: string;
  itens: CashSaleItem[];
  itens_count: number;
  total_centavos: number;
  desconto_pagamento_centavos: number;
  registrado_em: string | null;
  observacao: string;
  situacao: "paga" | "convenio" | "recebido_caixa" | "cancelada";
  metodo_pagamento: ComparablePaymentKey | null;
  metodo_pagamento_recebimento: ComparablePaymentKey | null;
  caixa_recebimento_id: string | null;
  recebido_em: string | null;
};

type CashExpense = {
  id: string;
  descricao: string;
  valor_centavos: number;
  registrado_em: string | null;
};

type CashConferenceDetails = {
  resumo: SessionSummary;
  vendas: CashSale[];
  despesas_caixa: CashExpense[];
  totais_esperados: PaymentTotals;
  totais_confirmados: PaymentTotals | null;
};

type DraftTotals = Record<ComparablePaymentKey, string>;

const comparablePaymentKeys = ["dinheiro", "cartao", "pix"] as const satisfies ComparablePaymentKey[];

const paymentVisuals = {
  dinheiro: {
    icon: Banknote,
    className: "cash-payment-orange"
  },
  cartao: {
    icon: CreditCard,
    className: "cash-payment-orange"
  },
  pix: {
    icon: QrCode,
    className: "cash-payment-orange"
  }
} satisfies Record<ComparablePaymentKey, { icon: LucideIcon; className: string }>;

const categoryIconById: Record<string, LucideIcon> = {
  apple: Apple,
  beauty: Sparkles,
  beef: Beef,
  beer: Beer,
  book: BookOpen,
  briefcase: BriefcaseBusiness,
  coffee: Coffee,
  gift: Gift,
  package: Package,
  pill: Pill,
  shirt: Shirt,
  shopping_basket: ShoppingBasket,
  smartphone: Smartphone,
  soda: CupSoda,
  sofa: Armchair,
  sports: Dumbbell,
  store: Store,
  utensils: Utensils,
  warehouse: Warehouse,
  wrench: Wrench
};

const categoryColorById: Record<string, { soft: string; text: string }> = {
  laranja: { soft: "oklch(0.96 0.035 55)", text: "oklch(0.48 0.16 42)" },
  ambar: { soft: "oklch(0.96 0.04 82)", text: "oklch(0.45 0.12 70)" },
  limao: { soft: "oklch(0.96 0.04 115)", text: "oklch(0.42 0.12 115)" },
  menta: { soft: "oklch(0.95 0.032 166)", text: "oklch(0.36 0.1 166)" },
  azul: { soft: "oklch(0.95 0.025 240)", text: "oklch(0.42 0.12 245)" },
  ciano: { soft: "oklch(0.95 0.028 205)", text: "oklch(0.38 0.1 205)" },
  indigo: { soft: "oklch(0.95 0.024 266)", text: "oklch(0.36 0.12 266)" },
  verde: { soft: "oklch(0.95 0.03 150)", text: "oklch(0.38 0.11 150)" },
  vermelho: { soft: "oklch(0.96 0.025 28)", text: "oklch(0.45 0.14 28)" },
  rosa: { soft: "oklch(0.96 0.026 350)", text: "oklch(0.43 0.13 350)" },
  vinho: { soft: "oklch(0.95 0.022 18)", text: "oklch(0.36 0.12 18)" },
  violeta: { soft: "oklch(0.96 0.025 300)", text: "oklch(0.42 0.12 300)" },
  marrom: { soft: "oklch(0.95 0.022 58)", text: "oklch(0.35 0.08 58)" },
  areia: { soft: "oklch(0.96 0.025 84)", text: "oklch(0.42 0.08 84)" },
  cinza: { soft: "oklch(0.95 0.006 250)", text: "oklch(0.38 0.02 250)" },
  grafite: { soft: "oklch(0.92 0.006 250)", text: "oklch(0.24 0.02 250)" }
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

function buildEmptyDraft(): DraftTotals {
  return {
    dinheiro: "",
    cartao: "",
    pix: ""
  };
}

function formatCurrencyFromCents(value: number | null | undefined) {
  const cents = Number(value ?? 0);

  return currencyFormatter.format((Number.isFinite(cents) ? cents : 0) / 100);
}

function parseCurrencyInputToCents(value: string) {
  const digitsOnly = value.replace(/\D/g, "");

  if (!digitsOnly) {
    return 0;
  }

  return Number(digitsOnly);
}

function formatCurrencyInput(value: string) {
  return formatCurrencyFromCents(parseCurrencyInputToCents(value));
}

function formatCurrencyInputFromCents(value: number | null | undefined) {
  return formatCurrencyFromCents(value ?? 0);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Não informado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function resolveOptionalUrl(value: string | null | undefined) {
  const url = value?.trim();

  if (!url) {
    return null;
  }

  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }

  return url.startsWith("/") ? getApiUrl(url) : url;
}

function resolveArquivoUrl(arquivo: ArquivoResumo | null | undefined) {
  return resolveOptionalUrl(arquivo?.url);
}

function resolveSaleItemImageUrl(item: CashSaleItem) {
  return (
    resolveOptionalUrl(item.imagem_url) ??
    resolveOptionalUrl(item.imageUrl) ??
    resolveArquivoUrl(item.imagem) ??
    resolveArquivoUrl(item.image)
  );
}

function resolveSaleItemCategoryVisual(item: CashSaleItem) {
  return {
    nome: item.categoria_visual?.nome || item.categoria || "Produto",
    icone: item.categoria_visual?.icone || item.categoria_icone || item.categoryIcon || "package",
    cor: item.categoria_visual?.cor || item.categoria_cor || item.categoryColor || "laranja",
    accent: item.categoria_visual?.accent || item.categoria_accent || item.categoryAccent || null
  };
}

function isCssColorValue(value: string | null | undefined) {
  return Boolean(value && /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|var\()/i.test(value.trim()));
}

function getSaleItemCategoryStyle(item: CashSaleItem): CSSProperties {
  const category = resolveSaleItemCategoryVisual(item);
  const colorKey = category.cor?.trim() || "laranja";
  const namedColor = categoryColorById[colorKey];

  if (namedColor) {
    return {
      backgroundColor: namedColor.soft,
      color: namedColor.text
    };
  }

  if (isCssColorValue(colorKey)) {
    return {
      backgroundColor: colorKey,
      color: category.accent || "var(--orange)"
    };
  }

  return {
    backgroundColor: categoryColorById.laranja.soft,
    color: categoryColorById.laranja.text
  };
}

function SaleItemVisual({ item }: { item: CashSaleItem }) {
  const imageUrl = resolveSaleItemImageUrl(item);
  const category = resolveSaleItemCategoryVisual(item);
  const Icon = categoryIconById[category.icone] ?? Package;

  return (
    <span
      className={imageUrl ? "cash-sale-detail-product-icon cash-sale-detail-product-image" : "cash-sale-detail-product-icon"}
      style={imageUrl ? undefined : getSaleItemCategoryStyle(item)}
      aria-hidden="true"
    >
      {imageUrl ? <img alt="" src={imageUrl} /> : <Icon size={18} />}
    </span>
  );
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sessionMatchesSearch(summary: SessionSummary, normalizedSearchValue: string) {
  if (!normalizedSearchValue) {
    return true;
  }

  const searchDigits = normalizedSearchValue.replace(/\D/g, "");
  const session = summary.sessao;
  const haystack = normalizeSearchValue([
    session.rotulo,
    session.data_operacao_chave,
    session.data_operacao_rotulo,
    `turno ${session.numero_turno}`,
    `turno${session.numero_turno}`,
    formatDateTime(session.aberto_em),
    formatDateTime(session.fechado_em),
    session.situacao,
    session.funcionario_abertura_nome,
    summary.status_conferencia === "conferido" ? "conferido" : "pendente"
  ].filter(Boolean).join(" "));
  const haystackDigits = haystack.replace(/\D/g, "");

  return (
    haystack.includes(normalizedSearchValue) ||
    haystack.replace(/\s+/g, "").includes(normalizedSearchValue.replace(/\s+/g, "")) ||
    (searchDigits.length >= 4 && haystackDigits.includes(searchDigits))
  );
}

function getPaymentSummary(summary: SessionSummary, paymentKey: PaymentKey) {
  return summary.formas_pagamento.find(payment => payment.chave === paymentKey) ?? null;
}

function getDifferenceClassName(status: DifferenceStatus | null) {
  if (status === "batido" || status === "sobrando") {
    return "cash-difference-ok";
  }

  if (status === "faltando" || status === "misto") {
    return "cash-difference-missing";
  }

  return "cash-difference-neutral";
}

function getDifferenceText(value: number | null) {
  if (value === null) {
    return "A conferir";
  }

  if (value === 0) {
    return "Sem diferença";
  }

  const prefix = value > 0 ? "+" : "-";
  return `${prefix}${formatCurrencyFromCents(Math.abs(value))}`;
}

function getPaymentMethodLabel(paymentMethod: ComparablePaymentKey | null) {
  if (paymentMethod === "dinheiro") {
    return "Dinheiro";
  }

  if (paymentMethod === "cartao") {
    return "Cartão";
  }

  if (paymentMethod === "pix") {
    return "Pix";
  }

  return "Não informado";
}

function getSalePaymentMethod(sale: CashSale) {
  return sale.tipo_movimento === "recebimento_convenio"
    ? sale.metodo_pagamento_recebimento
    : sale.metodo_pagamento;
}

function getSalePaymentLabel(sale: CashSale) {
  if (sale.tipo_movimento === "venda" && sale.situacao === "convenio") {
    return "Convênio";
  }

  return getPaymentMethodLabel(getSalePaymentMethod(sale));
}

function getSaleOriginLabel(sale: CashSale) {
  if (sale.tipo_movimento === "recebimento_convenio") {
    return sale.nome_cliente || "Recebimento de convênio";
  }

  const origin = sale.rotulo_origem?.trim();

  if (origin && origin.toLowerCase() !== "caixa") {
    return origin;
  }

  return "Venda direta";
}

function isCommandSale(sale: CashSale) {
  const channel = sale.canal?.toLowerCase();
  const origin = sale.rotulo_origem?.trim().toLowerCase();

  return channel === "comanda" || Boolean(origin && origin !== "caixa");
}

function buildDraftFromDetails(details: CashConferenceDetails): DraftTotals {
  const totals = details.totais_confirmados ?? details.totais_esperados;

  return {
    dinheiro: formatCurrencyInputFromCents(totals.dinheiro),
    cartao: formatCurrencyInputFromCents(totals.cartao),
    pix: formatCurrencyInputFromCents(totals.pix)
  };
}

function resolveDraftStatus(expectedCents: number, confirmedCents: number) {
  if (confirmedCents === expectedCents) {
    return "batido";
  }

  return confirmedCents < expectedCents ? "faltando" : "sobrando";
}

function getDraftTotals(draft: DraftTotals): PaymentTotals {
  return {
    dinheiro: parseCurrencyInputToCents(draft.dinheiro),
    cartao: parseCurrencyInputToCents(draft.cartao),
    pix: parseCurrencyInputToCents(draft.pix),
    convenio: 0
  };
}

function SessionCard({
  summary,
  onOpen
}: {
  summary: SessionSummary;
  onOpen: (sessionId: string) => void;
}) {
  const isReviewed = summary.status_conferencia === "conferido";
  const differenceClassName = getDifferenceClassName(summary.status_geral);
  const differenceText = getDifferenceText(summary.diferenca_total_centavos);
  const movementCount = summary.vendas_count + summary.despesas_count;

  return (
    <button className="cash-session-card" type="button" onClick={() => onOpen(summary.sessao.id)}>
      <span className={isReviewed ? "cash-session-icon cash-session-icon-reviewed" : "cash-session-icon"}>
        {isReviewed ? <CheckCircle2 size={15} /> : <ShieldCheck size={15} />}
      </span>

      <span className="cash-session-main">
        <strong>{summary.sessao.rotulo}</strong>
        <small>{formatDateTime(summary.sessao.fechado_em)}</small>
        <em>
          {movementCount} movimento{movementCount === 1 ? "" : "s"} · {summary.itens_count} {summary.itens_count === 1 ? "item" : "itens"}
        </em>
      </span>

      <span className="cash-session-total">
        <small>{isReviewed ? "Diferença" : "Esperado"}</small>
        <strong className={isReviewed ? differenceClassName : undefined}>
          {isReviewed ? differenceText : formatCurrencyFromCents(summary.total_esperado_centavos)}
        </strong>
        <em>{isReviewed ? "Caixa conferido" : "Aguardando conferência"}</em>
      </span>

      <span className="cash-session-open">
        <Eye size={15} />
        {isReviewed ? "Detalhes" : "Conferir"}
      </span>
    </button>
  );
}

function SessionCardSkeleton() {
  return (
    <div className="cash-session-card cash-session-card-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  text
}: {
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <div className="cash-conference-empty">
      <Icon size={24} aria-hidden="true" />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function FeedbackMessage({ message, tone = "error" }: { message: string; tone?: "error" | "warning" }) {
  return (
    <div className={`auth-feedback auth-feedback-${tone} cash-conference-feedback`} role="alert">
      <span className="auth-feedback-marker" aria-hidden="true" />
      <span className="auth-feedback-copy">{message}</span>
    </div>
  );
}

export function CashConferenceManager() {
  const [snapshot, setSnapshot] = useState<CashConferenceSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(true);
  const [isRefreshingSnapshot, setIsRefreshingSnapshot] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [details, setDetails] = useState<CashConferenceDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftTotals>(buildEmptyDraft);
  const [isSaving, setIsSaving] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [activeView, setActiveView] = useState<"pending" | "reviewed">("pending");
  const [searchValue, setSearchValue] = useState("");
  const [isConvenioPaymentEnabled, setIsConvenioPaymentEnabled] = useState(false);
  const [selectedSaleDetails, setSelectedSaleDetails] = useState<CashSale | null>(null);
  const [isMovementsExpanded, setIsMovementsExpanded] = useState(false);
  const deferredSearchValue = useDeferredValue(searchValue);
  const modalPresence = useModalPresence(selectedSessionId);

  usePlatformModalScrollLock(modalPresence.isPresent);

  const closeModal = useCallback(() => {
    setSelectedSaleDetails(null);
    setSelectedSessionId(null);
  }, []);
  const modalDismiss = useModalDismiss(modalPresence.isPresent, closeModal);

  useEffect(() => {
    if (!modalPresence.isPresent && !selectedSessionId) {
      setDetails(null);
      setDetailsError(null);
      setDraft(buildEmptyDraft());
      setIsLoadingDetails(false);
      setIsSaving(false);
      setIsReopening(false);
      setSelectedSaleDetails(null);
      setIsMovementsExpanded(false);
    }
  }, [modalPresence.isPresent, selectedSessionId]);

  const loadSnapshot = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLoadError("Sessão expirada. Entre novamente para abrir a conferência.");
      setIsLoadingSnapshot(false);
      setIsRefreshingSnapshot(false);
      return;
    }

    if (mode === "initial") {
      setIsLoadingSnapshot(true);
    } else {
      setIsRefreshingSnapshot(true);
    }

    try {
      const [nextSnapshot, configuracao] = await Promise.all([
        apiGet<CashConferenceSnapshot>("/caixa/conferencia", { token }),
        apiGet<ConfiguracaoSistema>("/configuracoes", { token }).catch(() => null)
      ]);

      setSnapshot(nextSnapshot);
      setIsConvenioPaymentEnabled(Boolean(configuracao?.formas_pagamento?.convenio));
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, "Não foi possível carregar a conferência de caixa."));
    } finally {
      setIsLoadingSnapshot(false);
      setIsRefreshingSnapshot(false);
    }
  }, []);

  useEffect(() => {
    void loadSnapshot("initial");
  }, [loadSnapshot]);

  const pendingSessions = snapshot?.pendentes ?? [];
  const reviewedSessions = snapshot?.conferidos ?? [];
  const normalizedSearchValue = normalizeSearchValue(deferredSearchValue);
  const hasSearch = normalizedSearchValue.length > 0;
  const filteredPendingSessions = pendingSessions.filter(summary =>
    sessionMatchesSearch(summary, normalizedSearchValue)
  );
  const filteredReviewedSessions = reviewedSessions.filter(summary =>
    sessionMatchesSearch(summary, normalizedSearchValue)
  );

  async function openDetails(sessionId: string) {
    const token = getStoredPlatformAuthToken();

    setSelectedSessionId(sessionId);
    setDetails(null);
    setDetailsError(null);
    setDraft(buildEmptyDraft());
    setIsMovementsExpanded(false);

    if (!token) {
      setDetailsError("Sessão expirada. Entre novamente para abrir este caixa.");
      return;
    }

    setIsLoadingDetails(true);

    try {
      const nextDetails = await apiGet<CashConferenceDetails>(
        `/caixa/conferencia/${encodeURIComponent(sessionId)}`,
        { token }
      );

      setDetails(nextDetails);
      setDraft(buildDraftFromDetails(nextDetails));
    } catch (error) {
      setDetailsError(getErrorMessage(error, "Não foi possível abrir os detalhes deste caixa."));
    } finally {
      setIsLoadingDetails(false);
    }
  }

  async function saveConference() {
    if (!selectedSessionId) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setDetailsError("Sessão expirada. Entre novamente para salvar a conferência.");
      return;
    }

    setIsSaving(true);

    try {
      const nextDetails = await apiPost<CashConferenceDetails>(
        `/caixa/conferencia/${encodeURIComponent(selectedSessionId)}`,
        { totais_confirmados: getDraftTotals(draft) },
        { token }
      );

      setDetails(nextDetails);
      setDraft(buildDraftFromDetails(nextDetails));
      setDetailsError(null);
      await loadSnapshot("refresh");
      closeModal();
    } catch (error) {
      setDetailsError(getErrorMessage(error, "Não foi possível salvar a conferência."));
    } finally {
      setIsSaving(false);
    }
  }

  async function reopenConference() {
    if (!selectedSessionId) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setDetailsError("Sessão expirada. Entre novamente para reabrir a conferência.");
      return;
    }

    setIsReopening(true);

    try {
      const nextDetails = await apiPost<CashConferenceDetails>(
        `/caixa/conferencia/${encodeURIComponent(selectedSessionId)}/reabrir`,
        {},
        { token }
      );

      setDetails(nextDetails);
      setDraft(buildDraftFromDetails(nextDetails));
      setDetailsError(null);
      await loadSnapshot("refresh");
    } catch (error) {
      setDetailsError(getErrorMessage(error, "Não foi possível reabrir a conferência."));
    } finally {
      setIsReopening(false);
    }
  }

  function renderSessionList(kind: "pending" | "reviewed") {
    const sessions = kind === "pending" ? filteredPendingSessions : filteredReviewedSessions;

    if (isLoadingSnapshot) {
      return (
        <div className="cash-session-list">
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          {kind === "pending" ? <SessionCardSkeleton /> : null}
        </div>
      );
    }

    if (sessions.length === 0) {
      if (hasSearch) {
        return (
          <EmptyState
            icon={Search}
            title="Nenhum caixa encontrado"
            text="Revise a data, turno ou termo pesquisado."
          />
        );
      }

      return kind === "pending" ? (
        <EmptyState
          icon={ShieldCheck}
          title="Nenhum caixa pendente"
          text="Turnos fechados no PDV aparecem aqui."
        />
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="Sem histórico conferido"
          text="Conferências salvas aparecem aqui."
        />
      );
    }

    return (
      <div className="cash-session-list">
        {sessions.map(session => (
          <SessionCard key={session.sessao.id} summary={session} onOpen={openDetails} />
        ))}
      </div>
    );
  }

  const modalSummary = details?.resumo ?? null;
  const isReadOnly = modalSummary?.status_conferencia === "conferido";
  const convenioSummary = modalSummary ? getPaymentSummary(modalSummary, "convenio") : null;
  const activeListTitle = activeView === "pending" ? "Caixas pendentes" : "Histórico conferido";
  const activeSessionsCount = activeView === "pending" ? filteredPendingSessions.length : filteredReviewedSessions.length;
  const lastUpdatedLabel = snapshot?.gerado_em ? `Atualizado ${formatDateTime(snapshot.gerado_em)}` : "Aguardando dados";

  return (
    <main className="platform-flow-page cash-conference-flow-page">
      <div className="platform-flow-shell cash-conference-flow-shell">
        <div className="platform-flow-section-title" aria-label="Conferência de caixa">
          <span className="platform-flow-section-main">
            <ClipboardCheck size={24} aria-hidden="true" />
            <strong>Conferência de caixa</strong>
          </span>
        </div>

        <section className="platform-flow-card cash-conference-flow-card" aria-labelledby="cash-conference-title">
          <div className="platform-flow-panel cash-conference-flow-panel">
            <header className="platform-flow-head cash-conference-flow-head">
              <h1 id="cash-conference-title">Conferência de caixa</h1>
              <p>Caixas fechados do PDV.</p>
            </header>

            <div className="cash-conference-summary" aria-label="Resumo da conferência">
              <span><strong>{pendingSessions.length}</strong> pendentes</span>
              <span><strong>{reviewedSessions.length}</strong> conferidos</span>
              <span>{lastUpdatedLabel}</span>
            </div>

            {loadError ? <FeedbackMessage message={loadError} /> : null}

            <label className="cash-conference-search">
              <Search aria-hidden="true" size={18} />
              <input
                aria-label="Buscar caixa por dia, turno ou termo"
                autoComplete="off"
                value={searchValue}
                onChange={event => setSearchValue(event.target.value)}
                placeholder="Buscar por dia, turno ou caixa"
              />
              {searchValue ? (
                <button type="button" aria-label="Limpar busca" onClick={() => setSearchValue("")}>
                  <X aria-hidden="true" size={16} />
                </button>
              ) : null}
            </label>

            <div className="cash-conference-tabs" aria-label="Visualização da conferência">
              <button
                className={activeView === "pending" ? "cash-conference-tab cash-conference-tab-active" : "cash-conference-tab"}
                type="button"
                onClick={() => setActiveView("pending")}
              >
                Pendentes
                <span>{filteredPendingSessions.length}</span>
              </button>
              <button
                className={activeView === "reviewed" ? "cash-conference-tab cash-conference-tab-active" : "cash-conference-tab"}
                type="button"
                onClick={() => setActiveView("reviewed")}
              >
                Histórico
                <span>{filteredReviewedSessions.length}</span>
              </button>
            </div>

            <section className="cash-conference-panel">
              <header className="cash-conference-list-head">
                <strong>{activeListTitle}</strong>
                <span>{activeSessionsCount} caixa{activeSessionsCount === 1 ? "" : "s"}</span>
              </header>
              {renderSessionList(activeView)}
            </section>
          </div>

          <div className="platform-flow-actions" aria-label="Ações do fluxo">
            <Link className="platform-secondary-button" href="/meu-sistema">
              <ArrowLeft size={16} />
              Voltar
            </Link>

            <button
              className="platform-primary-button cash-refresh-button"
              disabled={isRefreshingSnapshot}
              type="button"
              onClick={() => void loadSnapshot("refresh")}
            >
              <RefreshCcw className={isRefreshingSnapshot ? "platform-spin" : undefined} size={16} />
              Atualizar
            </button>
          </div>
        </section>
      </div>

      {modalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={modalPresence.state}
          role="presentation"
          {...modalDismiss.backdropProps}
        >
          <section
            aria-labelledby="cash-conference-modal-title"
            aria-modal="true"
            className="platform-modal cash-conference-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeModal}>
              <X size={18} aria-hidden="true" />
            </button>

            <header className="platform-modal-head cash-conference-modal-head">
              <h2 id="cash-conference-modal-title">
                {modalSummary?.sessao.rotulo ?? "Abrindo caixa"}
              </h2>
              <p>
                {modalSummary
                  ? `Aberto em ${formatDateTime(modalSummary.sessao.aberto_em)}. Fechado em ${formatDateTime(modalSummary.sessao.fechado_em)}.`
                  : "Carregando os valores deste turno."}
              </p>
            </header>

            {detailsError ? <FeedbackMessage message={detailsError} /> : null}

            {isLoadingDetails && !details ? (
              <div className="cash-conference-modal-skeleton" aria-live="polite">
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : details && modalSummary ? (
              <div className="cash-conference-modal-body">
                <section className="cash-payment-confirm-panel" aria-label="Valores por forma de pagamento">
                  <header className="cash-payment-confirm-head">
                    <div>
                      <strong>Valores do caixa</strong>
                      <span>{isReadOnly ? "Conferência salva" : "Informe o valor contado em cada forma."}</span>
                    </div>
                    <strong>{formatCurrencyFromCents(modalSummary.total_esperado_centavos)}</strong>
                  </header>

                  <div className="cash-payment-confirm-list">
                    {comparablePaymentKeys.map(paymentKey => {
                      const payment = getPaymentSummary(modalSummary, paymentKey);
                      const expectedCents = payment?.esperado_centavos ?? 0;
                      const confirmedCents = parseCurrencyInputToCents(draft[paymentKey] ?? "");
                      const differenceCents = confirmedCents - expectedCents;
                      const status = resolveDraftStatus(expectedCents, confirmedCents);
                      const visual = paymentVisuals[paymentKey];
                      const Icon = visual.icon;
                      const movementLabel = `${payment?.vendas_count ?? 0} venda${payment?.vendas_count === 1 ? "" : "s"}${
                        payment?.recebimentos_count
                          ? `, ${payment.recebimentos_count} recebimento${payment.recebimentos_count === 1 ? "" : "s"}`
                          : ""
                      }`;
                      const adjustmentLabel = [
                        payment?.descontos_centavos ? `descontos ${formatCurrencyFromCents(payment.descontos_centavos)}` : "",
                        payment?.despesas_centavos ? `despesas ${formatCurrencyFromCents(payment.despesas_centavos)}` : ""
                      ].filter(Boolean).join(" · ");

                      return (
                        <label className={`cash-payment-confirm-row ${visual.className}`} key={paymentKey}>
                          <span className="cash-payment-confirm-label">
                            <span className="cash-payment-confirm-icon">
                              <Icon size={17} />
                            </span>
                            <div>
                              <strong>{payment?.rotulo ?? paymentKey}</strong>
                              <small>{adjustmentLabel ? `${movementLabel} · ${adjustmentLabel}` : movementLabel}</small>
                            </div>
                          </span>

                          <span className="cash-payment-confirm-expected">
                            <small>Esperado</small>
                            <strong>{formatCurrencyFromCents(expectedCents)}</strong>
                          </span>

                          <span className="cash-payment-confirm-input">
                            <small>Informado</small>
                            <input
                              inputMode="numeric"
                              readOnly={isReadOnly}
                              value={draft[paymentKey]}
                              onChange={event =>
                                setDraft(current => ({
                                  ...current,
                                  [paymentKey]: formatCurrencyInput(event.target.value)
                                }))
                              }
                              placeholder="R$ 0,00"
                            />
                          </span>

                          <span className="cash-payment-confirm-difference">
                            <small>Diferença</small>
                            <strong className={getDifferenceClassName(status)}>{getDifferenceText(differenceCents)}</strong>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <div className="cash-conference-adjustments">
                  {details.despesas_caixa.length > 0 ? (
                    <span className="cash-conference-adjustment cash-conference-adjustment-danger">
                      <ArrowDownToLine size={18} />
                      <strong>Despesas no dinheiro</strong>
                      <em>{details.despesas_caixa.length} lançamento{details.despesas_caixa.length === 1 ? "" : "s"} · {formatCurrencyFromCents(modalSummary.total_despesas_centavos)}</em>
                    </span>
                  ) : null}

                  {isConvenioPaymentEnabled ? (
                    <span className="cash-conference-adjustment">
                      <ReceiptText size={18} />
                      <strong>Convênio</strong>
                      <em>
                        {convenioSummary && convenioSummary.esperado_centavos > 0
                          ? `${convenioSummary.vendas_count} venda${convenioSummary.vendas_count === 1 ? "" : "s"} · ${formatCurrencyFromCents(convenioSummary.esperado_centavos)}`
                          : "Sem lançamentos"}
                      </em>
                    </span>
                  ) : null}
                </div>

                <section className={isMovementsExpanded ? "cash-movement-panel cash-movement-panel-open" : "cash-movement-panel"}>
                  <button
                    className="cash-movement-toggle"
                    type="button"
                    aria-expanded={isMovementsExpanded}
                    aria-controls="cash-movement-list"
                    onClick={() => setIsMovementsExpanded(current => !current)}
                  >
                    <span>
                      <strong>Movimentos do turno</strong>
                      <p>{details.vendas.length} registro{details.vendas.length === 1 ? "" : "s"}</p>
                    </span>
                    <span className="cash-movement-toggle-meta">
                      <strong>{formatCurrencyFromCents(modalSummary.total_esperado_centavos)}</strong>
                      <span>
                        {isMovementsExpanded ? "Recolher" : "Ver movimentos"}
                        <ChevronDown aria-hidden="true" size={17} />
                      </span>
                    </span>
                  </button>

                  {isMovementsExpanded && details.vendas.length > 0 ? (
                    <div className="cash-movement-list" id="cash-movement-list">
                      {details.vendas.map((sale, index) => {
                        const SaleIcon = sale.tipo_movimento === "recebimento_convenio"
                          ? ReceiptText
                          : isCommandSale(sale)
                            ? ReceiptText
                            : ShoppingCart;
                        const saleTitle = sale.tipo_movimento === "recebimento_convenio"
                          ? sale.titulo
                          : getSaleOriginLabel(sale) === "Venda direta"
                            ? `Venda ${details.vendas.length - index}`
                            : getSaleOriginLabel(sale);

                        return (
                          <button
                            className="cash-movement-row"
                            key={`${sale.tipo_movimento}-${sale.id}`}
                            type="button"
                            onClick={() => setSelectedSaleDetails(sale)}
                          >
                            <span className="cash-movement-icon">
                              <SaleIcon size={18} />
                            </span>
                            <span className="cash-movement-copy">
                              <strong>{saleTitle}</strong>
                              <em>
                                <span>{formatDateTime(sale.registrado_em)}</span>
                                <span>{getSalePaymentLabel(sale)}</span>
                              </em>
                            </span>
                            <span className="cash-movement-total">
                              <em>{sale.itens_count} {sale.itens_count === 1 ? "item" : "itens"}</em>
                              <strong>{formatCurrencyFromCents(sale.total_centavos)}</strong>
                            </span>
                            <span className="cash-movement-action">
                              <span>Detalhes</span>
                              <ArrowRight size={18} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : isMovementsExpanded ? (
                    <EmptyState
                      icon={AlertTriangle}
                      title="Sem movimentos"
                      text="Este caixa fechado não possui vendas sincronizadas para conferência."
                    />
                  ) : null}
                </section>
              </div>
            ) : (
              <EmptyState
                icon={AlertTriangle}
                title="Caixa não carregado"
                text="Selecione um caixa fechado para abrir os valores da conferência."
              />
            )}

            <div className="platform-modal-actions platform-item-modal-actions cash-conference-modal-actions">
              <button className="platform-secondary-button" disabled={isSaving || isReopening} type="button" onClick={closeModal}>
                Cancelar
              </button>

              {isReadOnly ? (
                <button className="platform-secondary-button" disabled={isReopening || isSaving} type="button" onClick={() => void reopenConference()}>
                  {isReopening ? <LoaderCircle className="platform-spin" size={16} /> : <RotateCcw size={16} />}
                  Reabrir
                </button>
              ) : null}

              {!isReadOnly ? (
                <button className="platform-primary-button platform-save-button" disabled={!details || isSaving || isReopening} type="button" onClick={() => void saveConference()}>
                  {isSaving ? <LoaderCircle className="platform-spin" size={16} /> : <Save size={16} />}
                  Salvar
                </button>
              ) : null}
            </div>
          </section>

        </div>
      ) : null}

      {selectedSaleDetails ? (
        <div
          className="platform-modal-backdrop cash-sale-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setSelectedSaleDetails(null);
            }
          }}
        >
          <section
            aria-labelledby="cash-sale-detail-title"
            aria-modal="true"
            className="platform-modal cash-sale-detail-modal"
            role="dialog"
          >
            <button
              className="platform-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setSelectedSaleDetails(null)}
            >
              <X size={18} aria-hidden="true" />
            </button>

            <header className="platform-modal-head cash-sale-detail-head">
              <h2 id="cash-sale-detail-title">Detalhes da venda</h2>
              <p>
                {formatDateTime(selectedSaleDetails.registrado_em)} · {getSalePaymentLabel(selectedSaleDetails)}
                {selectedSaleDetails.situacao === "cancelada" ? " · Cancelada" : ""}
              </p>
            </header>

            <div className="cash-sale-detail-flow">
              {selectedSaleDetails.situacao === "cancelada" ? (
                <div className="cash-sale-detail-status" role="status">
                  <X aria-hidden="true" size={17} />
                  <span>Venda cancelada. Este recebimento não compõe a conferência do caixa.</span>
                </div>
              ) : null}

              <div className="cash-sale-detail-strip" aria-label="Resumo da venda">
                <span className="cash-sale-detail-token">
                  <span className="cash-sale-detail-token-icon">
                    <CreditCard aria-hidden="true" size={18} />
                  </span>
                  <span>
                    <em>Pagamento</em>
                    <strong>{getSalePaymentLabel(selectedSaleDetails)}</strong>
                  </span>
                </span>
                <span className="cash-sale-detail-token">
                  <span className="cash-sale-detail-token-icon">
                    {isCommandSale(selectedSaleDetails) ? (
                      <ReceiptText aria-hidden="true" size={18} />
                    ) : (
                      <ShoppingCart aria-hidden="true" size={18} />
                    )}
                  </span>
                  <span>
                    <em>{isCommandSale(selectedSaleDetails) ? "Comanda" : "Origem"}</em>
                    <strong>{getSaleOriginLabel(selectedSaleDetails)}</strong>
                  </span>
                </span>
                <span className="cash-sale-detail-token">
                  <span className="cash-sale-detail-token-icon">
                    <Package aria-hidden="true" size={18} />
                  </span>
                  <span>
                    <em>Itens</em>
                    <strong>
                      {selectedSaleDetails.itens_count} {selectedSaleDetails.itens_count === 1 ? "item" : "itens"}
                    </strong>
                  </span>
                </span>
              </div>

              <section className="cash-sale-detail-items" aria-label="Itens da venda">
                <div className="cash-sale-detail-items-head" aria-hidden="true">
                  <span>Produto</span>
                  <span>Quantidade</span>
                  <span>Total</span>
                </div>
                <div className="cash-sale-detail-items-body">
                  {selectedSaleDetails.itens.length > 0 ? (
                    selectedSaleDetails.itens.map(item => (
                      <div className="cash-sale-detail-item" key={item.id}>
                        <SaleItemVisual item={item} />
                        <span className="cash-sale-detail-product">
                          <strong>{item.nome}</strong>
                          <em>
                            <span>{formatCurrencyFromCents(item.preco_unitario_centavos)} un.</span>
                            <span>{item.categoria}</span>
                          </em>
                        </span>
                        <span className="cash-sale-detail-quantity">
                          <strong>{item.quantidade}</strong>
                        </span>
                        <span className="cash-sale-detail-total">
                          <strong>{formatCurrencyFromCents(item.total_centavos)}</strong>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="cash-sale-detail-empty">
                      <AlertTriangle size={19} />
                      <span>Itens não sincronizados para esta venda.</span>
                    </div>
                  )}
                </div>
              </section>

              <div className="cash-sale-detail-total-inline" aria-live="polite">
                <span>Total da venda</span>
                <strong>{formatCurrencyFromCents(selectedSaleDetails.total_centavos)}</strong>
              </div>
            </div>

            <div className="platform-modal-actions platform-item-modal-actions cash-sale-detail-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setSelectedSaleDetails(null)}>
                Fechar
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
