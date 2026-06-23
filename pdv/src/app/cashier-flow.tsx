"use client";

import {
  useEffect,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Apple,
  Armchair,
  Banknote,
  Beef,
  Beer,
  BookOpen,
  Building2,
  BriefcaseBusiness,
  Ban,
  Check,
  ChevronDown,
  Cloud,
  Coffee,
  Copy,
  CreditCard,
  CupSoda,
  Download,
  Dumbbell,
  Gift,
  HandCoins,
  History,
  KeyRound,
  LoaderCircle,
  LogOut,
  Minus,
  Package,
  Pill,
  Plus,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  Shirt,
  ShoppingCart,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Utensils,
  UserRound,
  Warehouse,
  WalletCards,
  Wrench,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { apiPost, getApiBaseUrl } from "@/lib/api-client";
import {
  getLocalPdvStore,
  type FiscalDocumentRecord,
  type FiscalWorkerResponse,
  type LocalPdvStoreEventPayload,
  type LocalPdvStorePendingEvent,
  type LocalPdvStoreSummary,
  type PdvUpdateStatus
} from "@/lib/local-pdv-store";

type ConnectivityState = "online" | "offline";
type CashierView = "menu" | "sale" | "commands" | "command-editor" | "agreement" | "expenses" | "history";
type PaymentMethod = "dinheiro" | "pix" | "cartao" | "convenio";
type ReceiptPaymentMethod = Exclude<PaymentMethod, "convenio">;

type Product = {
  id: string;
  name: string;
  categoryId?: string | null;
  category: string;
  barcode: string;
  ncm: string;
  priceCents: number;
  stockQuantity: number | null;
  active?: boolean;
  categoryIcon: string;
  categoryColor: string;
  categoryAccent?: string;
  imageUrl?: string | null;
  fiscal?: ProductFiscal | null;
};

type ProductFiscal = Record<string, string | number | boolean | null>;

type ProductCategory = {
  id: string;
  name: string;
  icon: string;
  color: string;
  accent: string;
  productsCount: number;
};

type ApiCatalogCategory = {
  id: number;
  nome: string;
  icone?: string | null;
  cor?: string | null;
  produtos_count?: number;
};

type ApiCatalogProduct = {
  id: number;
  nome: string;
  categoria_id?: number | null;
  codigo_barras?: string | null;
  ncm?: string | null;
  grupo_fiscal_id?: number | null;
  preco_custo_centavos?: number;
  preco_venda_centavos?: number;
  quantidade_estoque?: number | null;
  ativo?: boolean;
  categoria?: ApiCatalogCategory | null;
  grupo_fiscal?: Record<string, unknown> | null;
  grupoFiscal?: Record<string, unknown> | null;
  imagem?: {
    url?: string | null;
  } | null;
};

type ApiCatalogResponse = {
  categorias: ApiCatalogCategory[];
  produtos: ApiCatalogProduct[];
  configuracoes?: ApiPdvSettings | null;
  clientes_convenio?: ApiAgreementClient[];
  recebimentos_convenio?: ApiAgreementReceipt[];
  funcionarios?: ApiEmployee[];
};

type ApiPdvSettings = {
  comandas?: Partial<CommandSettings> | null;
  lancar_despesas?: Partial<ExpenseSettings> | null;
  controle_funcionarios?: Partial<EmployeeControlSettings> | null;
  formas_pagamento?: Partial<Record<PaymentMethod, boolean>> | null;
  fiscal?: Record<string, unknown> | null;
};

type ApiEmployee = {
  id: number;
  nome: string;
  codigo_hash: string;
  ativo?: boolean;
  updated_at?: string | null;
};

type ApiFiscalCertificateDownload = {
  id: number;
  nome_original: string;
  extensao: string;
  tamanho_bytes: number;
  conteudo_base64: string;
};

type ApiAgreementClient = {
  id: number;
  nome: string;
  tipo_pessoa?: "fisica" | "juridica" | string | null;
  dados_fiscais?: Record<string, unknown> | null;
  ativo?: boolean;
  permite_pagamento_frente_caixa?: boolean;
  updated_at?: string | null;
};

type ApiAgreementReceipt = {
  id: string;
  codigo?: string | null;
  titulo?: string | null;
  cliente_convenio_id?: number | null;
  cliente_nome?: string | null;
  cliente_tipo_pessoa?: "fisica" | "juridica" | string | null;
  itens_count?: number;
  itens?: unknown[];
  total_centavos?: number;
  status_convenio?: "pendente" | "pago" | string | null;
  metodo_pagamento_recebimento?: string | null;
  caixa_recebimento_id?: string | null;
  registrado_em?: string | null;
  recebido_em?: string | null;
};

type SyncPushResponse = {
  sincronizado_em: string;
  processados: number;
  erros: number;
  eventos: Array<{
    id: string;
    status: "processado" | "duplicado" | "erro" | string;
    message?: string;
  }>;
};

type SyncFiscalResponse = {
  sincronizado_em: string;
  processados: number;
  erros: number;
  documentos: Array<{
    id: string;
    api_nf_id?: string | null;
    status: "processado" | "atualizado" | "duplicado" | "erro" | string;
    message?: string;
  }>;
};

type ShiftPreviewResponse = {
  data_operacao_chave: string;
  data_operacao_rotulo: string;
  ultimo_turno: number;
  proximo_turno: number;
};

type CartItem = Product & {
  quantity: number;
};

type CashierSession = {
  id: string;
  shiftNumber: number;
  openedAt: string;
  openedByEmployeeId?: number | null;
  openedByEmployeeName?: string | null;
  closedByEmployeeId?: number | null;
  closedByEmployeeName?: string | null;
};

type SaleRecord = {
  id: string;
  createdAt: string;
  sessionId?: string | null;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  totalCents: number;
  originCommandTitle?: string | null;
  clienteConvenioId?: number | null;
  clienteConvenioTipoPessoa?: "fisica" | "juridica" | null;
  clienteConvenioDadosFiscais?: Record<string, unknown> | null;
  clientName?: string | null;
  status?: "completed" | "canceled";
  canceledAt?: string | null;
};

type FiscalModel = "55" | "65";
type FiscalEmissionModalTone = "pending" | "queued" | "success" | "error";
type FiscalPrintMode = "initial" | "reprint";

type FiscalEmissionModalState = {
  tone: FiscalEmissionModalTone;
  title: string;
  message: string;
  detail?: string | null;
  sale: SaleRecord;
  documentId?: string | null;
  fiscalNumber?: number | null;
  fiscalStatus?: string | null;
  fiscalProtocol?: string | null;
  fiscalKey?: string | null;
  fiscalModel?: FiscalModel | null;
  xmlPath?: string | null;
  logPath?: string | null;
};

type AgreementClient = {
  id: number;
  name: string;
  personType: "fisica" | "juridica";
  fiscalData?: Record<string, unknown> | null;
  active: boolean;
  allowFrontPayment: boolean;
};

type AgreementReceiptRecord = {
  id: string;
  code: string;
  title: string;
  clientId: number | null;
  clientName: string;
  clientPersonType: "fisica" | "juridica";
  itemsCount: number;
  items: CartItem[];
  totalCents: number;
  status: "pendente" | "pago";
  paymentMethod?: ReceiptPaymentMethod | null;
  receivedSessionId?: string | null;
  createdAt: string;
  receivedAt?: string | null;
};

type AgreementReceiptPaymentRequest = {
  client: AgreementClient;
  receipts: AgreementReceiptRecord[];
};

type AgreementReceiptCompletionRecord = {
  id: string;
  clientName: string;
  receiptCount: number;
  itemsCount: number;
  totalCents: number;
  paymentMethod?: ReceiptPaymentMethod | null;
  receivedAt?: string | null;
};

type AgreementClientReceivableSummary = {
  client: AgreementClient;
  pendingReceipts: AgreementReceiptRecord[];
  paidReceipts: AgreementReceiptRecord[];
  totalOpenCents: number;
  pendingItemsCount: number;
  lastActivityAt: string;
};

type AgreementReceiptStatusFilter = "pendente" | "pago";

type CommandRecord = {
  id: string;
  title: string;
  createdAt: string;
  items: CartItem[];
};

type CommandEditorState = {
  mode: "create" | "edit";
  commandId?: string;
  title: string;
  items: CartItem[];
};

type CommandNameRequest = {
  source: "sale" | "command-editor";
};

type CommandDeleteRequest = {
  id: string;
  title: string;
  itemsCount: number;
  totalCents: number;
};

type CashExpenseRecord = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string | null;
  amountCents: number;
  sessionId?: string | null;
};

type PaymentBreakdownItem = {
  method: PaymentMethod;
  label: string;
  totalCents: number;
  count: number;
};

type HistoryMovement =
  | {
      type: "sale";
      id: string;
      occurredAt: string;
      sale: SaleRecord;
    }
  | {
      type: "agreement-receipt";
      id: string;
      occurredAt: string;
      clientName: string;
      clientPersonType: "fisica" | "juridica";
      receiptCount: number;
      itemsCount: number;
      totalCents: number;
      paymentMethod?: ReceiptPaymentMethod | null;
      receipts: AgreementReceiptRecord[];
    };

type LocalCashierState = {
  version: 1;
  savedAt: string;
  session: CashierSession | null;
  cartItems: CartItem[];
  sales: SaleRecord[];
  commands: CommandRecord[];
  expenses: CashExpenseRecord[];
  employees?: EmployeeRecord[];
  agreementClients?: AgreementClient[];
  agreementReceipts?: AgreementReceiptRecord[];
  catalogProducts: Product[];
  catalogCategories: ProductCategory[];
  commandSettings?: CommandSettings;
  expenseSettings?: ExpenseSettings;
  employeeControlSettings?: EmployeeControlSettings;
  paymentSettings?: PaymentSettings;
};

type DesktopCashierFlowProps = {
  connectivity: ConnectivityState;
  deviceCredential: string | null;
  deviceId: string;
  pdvIdentity: string;
  shiftSequenceScope: string;
  initialSettings?: ApiPdvSettings | null;
  initialEmployees?: ApiEmployee[];
  lastAccessLabel: string;
  systemMessage?: string;
  onConnectivityChange: (state: ConnectivityState) => void;
  onSystemMessage: (message: string) => void;
};

const categoryToneMap: Record<string, { color: string; accent: string }> = {
  laranja: { color: "#fff0e6", accent: "#ff5a00" },
  ambar: { color: "#fff4d7", accent: "#f2a900" },
  amarelo: { color: "#fff4d7", accent: "#f2a900" },
  limao: { color: "#eef7c8", accent: "#a6bf00" },
  verde: { color: "#dcfce7", accent: "#159947" },
  menta: { color: "#ddf8ed", accent: "#10a979" },
  ciano: { color: "#d8f5f8", accent: "#0ea6b2" },
  azul: { color: "#d9efff", accent: "#1388cf" },
  indigo: { color: "#e2e8ff", accent: "#3b5dbf" },
  vermelho: { color: "#ffe3e1", accent: "#e62a22" },
  rosa: { color: "#fce7f3", accent: "#ce4f95" },
  vinho: { color: "#f7d9e2", accent: "#9f2540" },
  violeta: { color: "#ede4ff", accent: "#7b5abe" },
  marrom: { color: "#f4e3d0", accent: "#965b20" },
  areia: { color: "#f3ead2", accent: "#b59655" },
  cinza: { color: "#eceff3", accent: "#6f7a83" },
  grafite: { color: "#e5e7eb", accent: "#303943" }
};

const categoryIconMap: Record<string, LucideIcon> = {
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

const paymentOptions: Array<{
  id: PaymentMethod;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "dinheiro", label: "Dinheiro", description: "Calcula troco antes de concluir.", icon: Banknote },
  { id: "pix", label: "Pix", description: "Recebimento por QR Code.", icon: QrCode },
  { id: "cartao", label: "Cartão", description: "Recebimento na maquininha.", icon: CreditCard },
  { id: "convenio", label: "Convênio", description: "Cliente para receber depois.", icon: HandCoins }
];

type PaymentSettings = Record<PaymentMethod, boolean>;

type CommandSettings = {
  ativo: boolean;
};

type ExpenseSettings = {
  ativo: boolean;
};

type EmployeeControlSettings = {
  ativo: boolean;
};

type EmployeeRecord = {
  id: number;
  name: string;
  codeHash: string;
  active: boolean;
  updatedAt?: string | null;
};

type EmployeeAuthMode = "open" | "close-confirm";

type EmployeeAuthRequest = {
  mode: EmployeeAuthMode;
};

const defaultPaymentSettings: PaymentSettings = {
  dinheiro: true,
  pix: true,
  cartao: true,
  convenio: false
};

const defaultCommandSettings: CommandSettings = {
  ativo: true
};

const defaultExpenseSettings: ExpenseSettings = {
  ativo: true
};

const defaultEmployeeControlSettings: EmployeeControlSettings = {
  ativo: false
};

type PdvFiscalPrintSettings = {
  useDefaultPrinter: boolean;
  printerName: string;
  bobinaMm: number;
};

const defaultPdvFiscalPrintSettings: PdvFiscalPrintSettings = {
  useDefaultPrinter: true,
  printerName: "",
  bobinaMm: 80
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short"
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR");

const dailyShiftSequenceKeyPrefix = "caixaagil:pdv:daily-shift-sequence";
const ignoredSyncFailuresKeyPrefix = "caixaagil:pdv:ignored-sync-failures";

type IgnoredSyncFailures = {
  eventIds: Set<string>;
  fiscalDocumentIds: Set<string>;
};

type StoredIgnoredSyncFailures = {
  eventIds?: string[];
  fiscalDocumentIds?: string[];
};

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDailyShiftSequenceKey(scope: string) {
  return `${dailyShiftSequenceKeyPrefix}:${scope || "local"}`;
}

function getIgnoredSyncFailuresKey(scope: string) {
  return `${ignoredSyncFailuresKeyPrefix}:${scope || "local"}`;
}

function readIgnoredSyncFailures(scope: string): IgnoredSyncFailures {
  if (typeof window === "undefined") {
    return { eventIds: new Set(), fiscalDocumentIds: new Set() };
  }

  try {
    const rawValue = window.localStorage.getItem(getIgnoredSyncFailuresKey(scope));
    const parsed = rawValue ? JSON.parse(rawValue) as StoredIgnoredSyncFailures : {};

    return {
      eventIds: new Set((parsed.eventIds ?? []).filter(Boolean)),
      fiscalDocumentIds: new Set((parsed.fiscalDocumentIds ?? []).filter(Boolean))
    };
  } catch {
    return { eventIds: new Set(), fiscalDocumentIds: new Set() };
  }
}

function rememberIgnoredSyncFailure(scope: string, type: "event" | "fiscalDocument", id: string) {
  if (typeof window === "undefined" || !id) {
    return;
  }

  try {
    const ignored = readIgnoredSyncFailures(scope);

    if (type === "event") {
      ignored.eventIds.add(id);
    } else {
      ignored.fiscalDocumentIds.add(id);
    }

    window.localStorage.setItem(
      getIgnoredSyncFailuresKey(scope),
      JSON.stringify({
        eventIds: Array.from(ignored.eventIds),
        fiscalDocumentIds: Array.from(ignored.fiscalDocumentIds)
      })
    );
  } catch {
    // O ignore no SQLite ainda cobre o app desktop; localStorage é fallback visual.
  }
}

function filterVisibleFailedEvents(events: LocalPdvStorePendingEvent[], ignored: IgnoredSyncFailures) {
  return events.filter((event) => !ignored.eventIds.has(event.id));
}

function filterVisibleFailedFiscalDocuments(documents: FiscalDocumentRecord[], ignored: IgnoredSyncFailures) {
  return documents.filter((document) => !ignored.fiscalDocumentIds.has(document.id));
}

function getVisibleSyncFailureSummary(
  summary: LocalPdvStoreSummary,
  events: LocalPdvStorePendingEvent[],
  documents: FiscalDocumentRecord[]
): LocalPdvStoreSummary {
  const failedCandidates = [
    ...events.map((event) => ({
      updatedAt: event.updated_at,
      error: event.last_error
    })),
    ...documents.map((document) => ({
      updatedAt: document.updated_at,
      error: document.sync_error || document.mensagem_operador
    }))
  ].sort((first, second) => String(second.updatedAt || "").localeCompare(String(first.updatedAt || "")));
  const latestFailure = failedCandidates[0] ?? null;

  return {
    ...summary,
    failed: events.length + documents.length,
    lastFailedAt: latestFailure?.updatedAt ?? null,
    lastError: latestFailure?.error ?? null
  };
}

function getLastDailyShiftNumber(date: Date, scope: string) {
  if (typeof window === "undefined") {
    return 0;
  }

  const dateKey = getLocalDateKey(date);
  const rawSequence = window.localStorage.getItem(getDailyShiftSequenceKey(scope));

  if (rawSequence) {
    try {
      const parsed = JSON.parse(rawSequence) as {
        dateKey?: string;
        lastShiftNumber?: number;
      };

      if (parsed.dateKey === dateKey && Number.isFinite(parsed.lastShiftNumber)) {
        return Math.max(0, parsed.lastShiftNumber ?? 0);
      }
    } catch {
      return 0;
    }
  }

  return 0;
}

function getPreviewDailyShiftNumber(date = new Date(), scope = "local") {
  return getLastDailyShiftNumber(date, scope) + 1;
}

function normalizeMinimumShiftNumber(value?: number | null) {
  const parsed = Number(value || 0);

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(1, Math.floor(parsed));
}

function getNextDailyShiftNumber(openedAt: Date, scope: string, minimumShiftNumber?: number | null) {
  const dateKey = getLocalDateKey(openedAt);
  const nextShiftNumber = getPreviewDailyShiftNumber(openedAt, scope);
  const shiftNumber = Math.max(nextShiftNumber, normalizeMinimumShiftNumber(minimumShiftNumber));

  window.localStorage.setItem(
    getDailyShiftSequenceKey(scope),
    JSON.stringify({
      dateKey,
      lastShiftNumber: shiftNumber
    })
  );

  return shiftNumber;
}

async function getPreviewShiftNumber(date: Date, scope: string, minimumShiftNumber?: number | null) {
  const store = getLocalPdvStore();

  if (!store) {
    return Math.max(getPreviewDailyShiftNumber(date, scope), normalizeMinimumShiftNumber(minimumShiftNumber));
  }

  try {
    const result = await store.getShiftPreview({
      scope,
      dateKey: getLocalDateKey(date),
      minimumShiftNumber: normalizeMinimumShiftNumber(minimumShiftNumber)
    });

    return result.shiftNumber;
  } catch {
    return Math.max(getPreviewDailyShiftNumber(date, scope), normalizeMinimumShiftNumber(minimumShiftNumber));
  }
}

async function reserveShiftNumber(openedAt: Date, scope: string, minimumShiftNumber?: number | null) {
  const store = getLocalPdvStore();

  if (!store) {
    return getNextDailyShiftNumber(openedAt, scope, minimumShiftNumber);
  }

  try {
    const result = await store.reserveShiftNumber({
      scope,
      dateKey: getLocalDateKey(openedAt),
      minimumShiftNumber: normalizeMinimumShiftNumber(minimumShiftNumber)
    });

    return result.shiftNumber;
  } catch {
    return getNextDailyShiftNumber(openedAt, scope, minimumShiftNumber);
  }
}

async function fetchRemoteShiftNumber({
  date,
  deviceCredential,
  deviceId
}: {
  date: Date;
  deviceCredential: string;
  deviceId: string;
}) {
  const response = await apiPost<ShiftPreviewResponse>("/pdvs/turno/previa", {
    aberto_em: date.toISOString(),
    credencial_dispositivo: deviceCredential,
    dispositivo_id: deviceId
  });
  const shiftNumber = Number(response.proximo_turno);

  return Number.isFinite(shiftNumber) ? Math.max(1, Math.floor(shiftNumber)) : null;
}

function formatOpenCashDate(date: Date, shiftNumber: number) {
  return `${shortDateFormatter.format(date)} · Turno ${shiftNumber}`;
}

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function formatSyncDateTime(value?: string | null) {
  if (!value) {
    return "Ainda não sincronizado";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Ainda não sincronizado";
  }

  return dateTimeFormatter.format(date);
}

function parseCurrencyCents(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number.parseInt(digits, 10) : 0;
}

function formatCurrencyInput(value: string) {
  return formatCurrency(parseCurrencyCents(value));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeEmployeeCode(value: string) {
  return value.replace(/\D/g, "");
}

async function hashEmployeeCode(value: string) {
  const normalizedCode = normalizeEmployeeCode(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizedCode));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function formatCommandTitle(value: string) {
  const normalizedValue = value.replace(/^\s+/, "");

  if (!normalizedValue) {
    return "";
  }

  return `${normalizedValue.charAt(0).toLocaleUpperCase("pt-BR")}${normalizedValue.slice(1)}`;
}

function getCategoryTone(cor?: string | null) {
  return categoryToneMap[normalizeSearch(cor ?? "")] ?? categoryToneMap.azul;
}

function resolveFileUrl(url?: string | null) {
  if (!url) {
    return null;
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `${getApiBaseUrl()}${url.startsWith("/") ? url : `/${url}`}`;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatStockQuantity(value: number | null) {
  if (value === null) {
    return "Sem controle";
  }

  const formatted = value.toLocaleString("pt-BR", {
    maximumFractionDigits: 3
  });

  return `${formatted} un.`;
}

function normalizeProductNcm(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 8);
}

function getControlledStockLimit(product: Pick<Product, "stockQuantity">) {
  if (product.stockQuantity === null) {
    return null;
  }

  return Math.max(0, Math.floor(product.stockQuantity));
}

function clampCartQuantity(quantity: number, product: Pick<Product, "stockQuantity">) {
  const nextQuantity = Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
  const stockLimit = getControlledStockLimit(product);

  return stockLimit === null ? nextQuantity : Math.min(nextQuantity, stockLimit);
}

function getStockLimitMessage(product: Pick<Product, "name" | "stockQuantity">) {
  return `Estoque disponível para ${product.name}: ${formatStockQuantity(getControlledStockLimit(product))}.`;
}

function mapCatalogCategory(category: ApiCatalogCategory): ProductCategory {
  const tone = getCategoryTone(category.cor);
  const name = category.nome || "Produtos";

  return {
    id: String(category.id),
    name,
    icon: category.icone || "package",
    color: tone.color,
    accent: tone.accent,
    productsCount: Number(category.produtos_count ?? 0)
  };
}

function getFiscalString(source: Record<string, unknown> | null, key: string) {
  const value = source?.[key];
  return value === null || value === undefined ? "" : String(value);
}

function getFiscalNumber(source: Record<string, unknown> | null, key: string) {
  const value = Number(source?.[key]);
  return Number.isFinite(value) ? value : 0;
}

function mapProductFiscal(product: ApiCatalogProduct): ProductFiscal | null {
  const group = asRecord(product.grupo_fiscal) ?? asRecord(product.grupoFiscal);
  const groupId = Number(product.grupo_fiscal_id ?? group?.id);
  const ncm = normalizeProductNcm(product.ncm) || normalizeProductNcm(getFiscalString(group, "ncm"));

  if (!group && !ncm) {
    return null;
  }

  return {
    grupo_fiscal_id: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
    ncm,
    cfop: getFiscalString(group, "cfop"),
    regime_tributario: getFiscalString(group, "regime_tributario"),
    cst_icms: getFiscalString(group, "cst_icms"),
    csosn: getFiscalString(group, "csosn"),
    aliquota_icms: getFiscalNumber(group, "aliquota_icms"),
    reducao_icms: getFiscalNumber(group, "reducao_icms"),
    base_icms_st: getFiscalNumber(group, "base_icms_st"),
    cst_pis: getFiscalString(group, "cst_pis"),
    aliquota_pis: getFiscalNumber(group, "aliquota_pis"),
    cst_cofins: getFiscalString(group, "cst_cofins"),
    aliquota_cofins: getFiscalNumber(group, "aliquota_cofins")
  };
}

function mapCatalogProduct(product: ApiCatalogProduct): Product {
  const categoryName = product.categoria?.nome || "Sem categoria";
  const categoryTone = getCategoryTone(product.categoria?.cor);

  return {
    id: String(product.id),
    name: product.nome || "Produto sem nome",
    categoryId: product.categoria?.id ? String(product.categoria.id) : product.categoria_id ? String(product.categoria_id) : null,
    category: categoryName,
    barcode: product.codigo_barras ?? "",
    ncm: normalizeProductNcm(product.ncm),
    priceCents: normalizeNumber(product.preco_venda_centavos),
    stockQuantity: product.quantidade_estoque ?? null,
    active: product.ativo !== false,
    categoryIcon: product.categoria?.icone || "package",
    categoryColor: categoryTone.color,
    categoryAccent: categoryTone.accent,
    imageUrl: resolveFileUrl(product.imagem?.url),
    fiscal: mapProductFiscal(product)
  };
}

function mapAgreementClient(client: ApiAgreementClient): AgreementClient {
  return {
    id: Number(client.id),
    name: client.nome || "Cliente",
    personType: client.tipo_pessoa === "juridica" ? "juridica" : "fisica",
    fiscalData: client.tipo_pessoa === "juridica" ? asRecord(client.dados_fiscais) : null,
    active: client.ativo !== false,
    allowFrontPayment: Boolean(client.permite_pagamento_frente_caixa)
  };
}

function getProductFiscalIssues(product: Pick<Product, "fiscal" | "ncm">) {
  const fiscal = product.fiscal;
  const fiscalGroupId = Number(fiscal?.grupo_fiscal_id);
  const ncm = normalizeProductNcm(product.ncm);
  const issues: string[] = [];

  if (!Number.isFinite(fiscalGroupId) || fiscalGroupId <= 0) {
    issues.push("Sem grupo fiscal");
  }

  if (!ncm) {
    issues.push("Sem NCM");
  }

  return issues;
}

function formatProductFiscalIssues(issues: string[]) {
  if (issues.length === 0) {
    return "";
  }

  if (issues.length === 1) {
    return issues[0];
  }

  const lastIssue = issues[issues.length - 1].replace(/^Sem /, "sem ");

  return `${issues.slice(0, -1).join(", ")} e ${lastIssue}`;
}

function getProductFiscalBlockMessage(product: Pick<Product, "fiscal" | "name" | "ncm">) {
  const issues = getProductFiscalIssues(product);

  if (issues.length === 0) {
    return "";
  }

  return `${product.name} ${formatProductFiscalIssues(issues).toLocaleLowerCase("pt-BR")}.`;
}

function normalizeAgreementClients(clients: AgreementClient[]) {
  return clients
    .filter((client) => Number.isFinite(client.id) && client.id > 0 && client.active === true)
    .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function mapEmployee(employee: ApiEmployee): EmployeeRecord {
  return {
    id: Number(employee.id),
    name: employee.nome || "Funcionário",
    codeHash: employee.codigo_hash || "",
    active: employee.ativo !== false,
    updatedAt: employee.updated_at ?? null
  };
}

function mergeEmployees(employees: EmployeeRecord[]) {
  const uniqueEmployees = new Map<number, EmployeeRecord>();

  employees
    .filter((employee) => Number.isFinite(employee.id) && employee.id > 0 && employee.codeHash)
    .forEach((employee) => uniqueEmployees.set(employee.id, employee));

  return Array.from(uniqueEmployees.values()).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

function getAgreementClientTypeLabel(client: Pick<AgreementClient, "personType">) {
  return client.personType === "juridica" ? "Pessoa jurídica" : "Pessoa física";
}

function AgreementClientIcon({ client, size = 18 }: { client: Pick<AgreementClient, "personType">; size?: number }) {
  const Icon = client.personType === "juridica" ? Building2 : UserRound;

  return <Icon aria-hidden="true" size={size} />;
}

function getFiscalModelLabel(model: FiscalModel | string | null | undefined) {
  return model === "55" ? "NF-e" : "NFC-e";
}

function getSaleStoredFiscalModel(sale: SaleRecord): FiscalModel {
  return sale.paymentMethod === "convenio" && sale.clienteConvenioTipoPessoa === "juridica" ? "55" : "65";
}

function getFiscalModelKey(model: FiscalModel) {
  return model === "55" ? "nfe" : "nfce";
}

function getFiscalModelConfig(config: Record<string, unknown>, model: FiscalModel) {
  const key = getFiscalModelKey(model);
  const ambiente = config.ambiente === "producao" ? "producao" : "homologacao";
  const ambientes = asRecord(config.ambientes);
  const environment = asRecord(ambientes?.[ambiente]);

  return {
    ...(asRecord(config[key]) ?? {}),
    ...(asRecord(environment?.[key]) ?? {})
  };
}

function mapReceiptItem(item: unknown, fallbackIndex: number): CartItem {
  const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const categoryVisual = data.categoria_visual && typeof data.categoria_visual === "object"
    ? data.categoria_visual as Record<string, unknown>
    : {};
  const categoryTone = getCategoryTone(
    typeof categoryVisual.cor === "string" ? categoryVisual.cor : typeof data.categoria_cor === "string" ? data.categoria_cor : null
  );
  const quantity = normalizeNumber(data.quantidade ?? data.quantity ?? 1);
  const priceCents = normalizeNumber(
    data.preco_unitario_centavos ?? data.priceCents ?? data.preco_venda_centavos ?? 0
  );

  return {
    id: String(data.produto_id ?? data.id ?? `item-${fallbackIndex}`),
    name: String(data.nome ?? data.name ?? "Produto"),
    categoryId: null,
    category: String(categoryVisual.nome ?? data.categoria ?? data.category ?? "Produtos"),
    barcode: String(data.codigo_barras ?? data.barcode ?? ""),
    ncm: normalizeProductNcm(data.ncm),
    priceCents,
    stockQuantity: null,
    categoryIcon: String(categoryVisual.icone ?? data.categoria_icone ?? data.categoryIcon ?? "package"),
    categoryColor: categoryTone.color,
    categoryAccent: categoryTone.accent,
    imageUrl: resolveFileUrl(
      typeof data.imagem_url === "string" ? data.imagem_url : typeof data.imageUrl === "string" ? data.imageUrl : null
    ),
    fiscal: asRecord(data.fiscal) as ProductFiscal | null,
    quantity: Math.max(1, Math.floor(quantity || 1))
  };
}

function mapAgreementReceipt(receipt: ApiAgreementReceipt): AgreementReceiptRecord {
  const items = Array.isArray(receipt.itens) ? receipt.itens.map(mapReceiptItem) : [];
  const itemsCount = Number(receipt.itens_count ?? items.reduce((total, item) => total + item.quantity, 0) ?? 0);
  const paymentMethod = receipt.metodo_pagamento_recebimento;
  const receiptPaymentMethod =
    paymentMethod === "dinheiro" || paymentMethod === "pix" || paymentMethod === "cartao" ? paymentMethod : null;

  return {
    id: receipt.id,
    code: receipt.codigo || receipt.id,
    title: receipt.titulo || "Venda em convênio",
    clientId: receipt.cliente_convenio_id ?? null,
    clientName: receipt.cliente_nome || "Cliente",
    clientPersonType: receipt.cliente_tipo_pessoa === "juridica" ? "juridica" : "fisica",
    itemsCount,
    items,
    totalCents: normalizeNumber(receipt.total_centavos),
    status: receipt.status_convenio === "pago" ? "pago" : "pendente",
    paymentMethod: receiptPaymentMethod,
    receivedSessionId: receipt.caixa_recebimento_id || null,
    createdAt: receipt.registrado_em || new Date().toISOString(),
    receivedAt: receipt.recebido_em || null
  };
}

function mergeCartItemsWithCatalog(items: CartItem[], products: Product[]) {
  if (items.length === 0 || products.length === 0) {
    return items;
  }

  const productById = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const latestProduct = productById.get(item.id);

    if (!latestProduct) {
      return item;
    }

    return {
      ...latestProduct,
      quantity: item.quantity
    };
  });
}

function mergeAgreementReceipts(currentReceipts: AgreementReceiptRecord[], remoteReceipts: AgreementReceiptRecord[]) {
  const receiptById = new Map<string, AgreementReceiptRecord>();

  for (const receipt of remoteReceipts) {
    receiptById.set(receipt.id, receipt);
  }

  for (const receipt of currentReceipts) {
    if (receipt.status === "pago") {
      const remoteReceipt = receiptById.get(receipt.id);

      receiptById.set(receipt.id, {
        ...remoteReceipt,
        ...receipt,
        paymentMethod: receipt.paymentMethod ?? remoteReceipt?.paymentMethod ?? null,
        receivedAt: receipt.receivedAt ?? remoteReceipt?.receivedAt ?? null,
        receivedSessionId: receipt.receivedSessionId ?? remoteReceipt?.receivedSessionId ?? null
      });
      continue;
    }

    if (!receiptById.has(receipt.id)) {
      receiptById.set(receipt.id, receipt);
    }
  }

  return Array.from(receiptById.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function ProductThumbnail({
  imageUrl,
  label,
  icon,
  backgroundColor,
  color,
  size = "md"
}: {
  imageUrl?: string | null;
  label: string;
  icon: string;
  backgroundColor: string;
  color?: string;
  size?: "sm" | "md";
}) {
  const Icon = categoryIconMap[icon] ?? Package;

  if (imageUrl) {
    return (
      <span className={`pdv-product-avatar pdv-product-avatar-image pdv-product-avatar-${size}`}>
        <img alt="" src={imageUrl} />
      </span>
    );
  }

  return (
    <span className={`pdv-product-avatar pdv-product-avatar-${size}`} style={{ backgroundColor, color }}>
      <Icon aria-hidden="true" size={size === "sm" ? 18 : 22} strokeWidth={2.1} />
      <span className="pdv-sr-only">{label}</span>
    </span>
  );
}

function CategoryBadge({ category }: { category: Pick<ProductCategory, "icon" | "color" | "accent"> }) {
  const Icon = categoryIconMap[category.icon] ?? Package;

  return (
    <span className="pdv-list-icon" style={{ backgroundColor: category.color, color: category.accent }}>
      <Icon aria-hidden="true" size={19} strokeWidth={2.1} />
    </span>
  );
}

function setWaveVariables(target: HTMLElement, x: number, y: number, baseSize = 36) {
  const rect = target.getBoundingClientRect();
  const farthestX = Math.max(x, rect.width - x);
  const farthestY = Math.max(y, rect.height - y);
  const farthestRadius = Math.hypot(farthestX, farthestY);
  const scale = Math.ceil((farthestRadius * 2) / baseSize + 2);

  target.style.setProperty("--pdv-wave-x", `${x}px`);
  target.style.setProperty("--pdv-wave-y", `${y}px`);
  target.style.setProperty("--open-turn-hover-x", `${x}px`);
  target.style.setProperty("--open-turn-hover-y", `${y}px`);
  target.style.setProperty("--pdv-wave-scale", String(scale));
}

function setPointerWaveOrigin(event: ReactPointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();

  setWaveVariables(target, event.clientX - rect.left, event.clientY - rect.top);
}

function getCartTotal(items: CartItem[]) {
  return items.reduce((total, item) => total + item.priceCents * item.quantity, 0);
}

function getCartQuantity(items: CartItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function buildAgreementReceiptFromSale(sale: SaleRecord, client: AgreementClient): AgreementReceiptRecord {
  return {
    id: sale.id,
    code: sale.id.replace(/^venda-/, ""),
    title: sale.originCommandTitle ? `Venda - ${sale.originCommandTitle}` : "Venda em convênio",
    clientId: client.id,
    clientName: client.name,
    clientPersonType: client.personType,
    itemsCount: getCartQuantity(sale.items),
    items: sale.items,
    totalCents: sale.totalCents,
    status: "pendente",
    receivedSessionId: null,
    createdAt: sale.createdAt,
    receivedAt: null
  };
}

function getPaymentLabel(method: PaymentMethod) {
  return getPaymentOption(method).label;
}

function getPaymentOption(method: PaymentMethod) {
  return paymentOptions.find((option) => option.id === method) ?? paymentOptions[0];
}

function normalizePaymentSettings(value?: Partial<Record<PaymentMethod, boolean>> | null): PaymentSettings {
  const settings = {
    ...defaultPaymentSettings,
    ...value
  };

  if (!Object.values(settings).some(Boolean)) {
    return defaultPaymentSettings;
  }

  return settings;
}

function normalizeCommandSettings(value?: Partial<CommandSettings> | null): CommandSettings {
  return {
    ativo: value?.ativo !== false
  };
}

function normalizeExpenseSettings(value?: Partial<ExpenseSettings> | null): ExpenseSettings {
  return {
    ativo: value?.ativo !== false
  };
}

function normalizeEmployeeControlSettings(value?: Partial<EmployeeControlSettings> | null): EmployeeControlSettings {
  return {
    ativo: value?.ativo === true
  };
}

function normalizePdvBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "sim", "s", "yes", "y"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "nao", "n", "no"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizePdvFiscalPrintSettings(value?: Record<string, unknown> | null): PdvFiscalPrintSettings {
  const bobinaMm = Number(value?.bobinaMm ?? value?.larguraBobinaMm ?? value?.largura_bobina_mm);
  const printerName = String(value?.printerName ?? value?.impressora ?? value?.nomeImpressora ?? value?.nome_impressora ?? "").trim();
  const defaultUseDefaultPrinter = printerName.length === 0
    ? defaultPdvFiscalPrintSettings.useDefaultPrinter
    : false;

  return {
    useDefaultPrinter: normalizePdvBoolean(
      value?.useDefaultPrinter ??
        value?.usarImpressoraPadrao ??
        value?.usar_impressora_padrao ??
        defaultUseDefaultPrinter,
      defaultUseDefaultPrinter
    ),
    printerName,
    bobinaMm: Number.isFinite(bobinaMm)
      ? Math.min(Math.max(Math.floor(bobinaMm), 58), 210)
      : defaultPdvFiscalPrintSettings.bobinaMm
  };
}

function buildPdvFiscalPrintConfig(settings: PdvFiscalPrintSettings) {
  return {
    printing: {
      useDefaultPrinter: settings.useDefaultPrinter,
      printerName: settings.printerName,
      bobinaMm: settings.bobinaMm
    },
    impressao: {
      useDefaultPrinter: settings.useDefaultPrinter,
      usarImpressoraPadrao: settings.useDefaultPrinter,
      usar_impressora_padrao: settings.useDefaultPrinter,
      printerName: settings.printerName,
      impressora: settings.printerName,
      nomeImpressora: settings.printerName,
      nome_impressora: settings.printerName,
      bobinaMm: settings.bobinaMm,
      larguraBobinaMm: settings.bobinaMm,
      largura_bobina_mm: settings.bobinaMm
    },
    danfe: {
      useNativeFallback: false
    }
  };
}

function getPdvFiscalPrintSettingsFromConfig(config?: Record<string, unknown> | null) {
  const printing = asRecord(config?.printing);
  const impressao = asRecord(config?.impressao);

  return normalizePdvFiscalPrintSettings({
    ...(impressao ?? {}),
    ...(printing ?? {})
  });
}

function normalizePdvFiscalSeries(value: unknown, fallback = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(number), 1), 999);
}

function getPdvFiscalSeriesValue(config?: Record<string, unknown> | null) {
  const ambientes = asRecord(config?.ambientes);
  const ambiente = config?.ambiente === "producao" ? "producao" : "homologacao";
  const environment = asRecord(ambientes?.[ambiente]);
  const series = asRecord(config?.series);
  const environmentSeries = asRecord(environment?.series);
  const nfce = asRecord(config?.nfce);
  const nfe = asRecord(config?.nfe);
  const environmentNfce = asRecord(environment?.nfce);
  const environmentNfe = asRecord(environment?.nfe);
  const value =
    config?.serie_fiscal ??
    config?.serieFiscal ??
    config?.serie ??
    series?.fiscal ??
    environment?.serie_fiscal ??
    environment?.serieFiscal ??
    environment?.serie ??
    environmentSeries?.fiscal ??
    environmentNfce?.serie ??
    environmentNfe?.serie ??
    nfce?.serie ??
    nfe?.serie;
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? normalizePdvFiscalSeries(number) : null;
}

function applyPdvFiscalSeriesConfig(config: Record<string, unknown>, seriesValue: number) {
  const serie = normalizePdvFiscalSeries(seriesValue);
  const ambiente = config.ambiente === "producao" ? "producao" : "homologacao";
  const ambientes = asRecord(config.ambientes) ?? {};
  const environment = asRecord(ambientes[ambiente]) ?? {};
  const nextConfig: Record<string, unknown> = {
    ...config,
    serie_fiscal: serie,
    serie: serie,
    series: {
      ...(asRecord(config.series) ?? {}),
      fiscal: serie
    }
  };
  const nextEnvironment: Record<string, unknown> = {
    ...environment,
    serie_fiscal: serie,
    serie: serie,
    series: {
      ...(asRecord(environment.series) ?? {}),
      fiscal: serie
    }
  };

  (["nfce", "nfe"] as const).forEach((modelKey) => {
    const rootModel = asRecord(config[modelKey]) ?? {};
    const environmentModel = asRecord(environment[modelKey]) ?? rootModel;

    nextConfig[modelKey] = {
      ...rootModel,
      serie
    };
    nextEnvironment[modelKey] = {
      ...environmentModel,
      serie
    };
  });

  return {
    ...nextConfig,
    ambientes: {
      ...ambientes,
      [ambiente]: nextEnvironment
    }
  };
}

function mergePdvFiscalLocalSettings(
  config: Record<string, unknown> | null | undefined,
  printingSettings: PdvFiscalPrintSettings,
  seriesValue: number
) {
  return {
    ...applyPdvFiscalSeriesConfig(asRecord(config) ?? {}, seriesValue),
    ...buildPdvFiscalPrintConfig(printingSettings)
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getActiveRemoteFiscalEnvironment(fiscal: Record<string, unknown>) {
  const ambiente = fiscal.ambiente === "producao" ? "producao" : "homologacao";
  const ambientes = asRecord(fiscal.ambientes);
  const activeEnvironment = asRecord(ambientes?.[ambiente]) ?? fiscal;

  return {
    ambiente,
    activeEnvironment
  };
}

function isFiscalEmissionActiveConfig(config?: Record<string, unknown> | null) {
  const fiscal = asRecord(config);

  if (!fiscal) {
    return false;
  }

  const { activeEnvironment } = getActiveRemoteFiscalEnvironment(fiscal);

  if (typeof activeEnvironment.ativo === "boolean") {
    return activeEnvironment.ativo;
  }

  return fiscal.ativo === true;
}

function buildLocalFiscalConfigFromRemote(
  fiscal: Record<string, unknown>,
  printingConfig: PdvFiscalPrintSettings,
  pfxPath?: string
) {
  const { ambiente, activeEnvironment } = getActiveRemoteFiscalEnvironment(fiscal);
  const certificado = asRecord(activeEnvironment.certificado) ?? asRecord(fiscal.certificado) ?? {};
  const nfce = asRecord(activeEnvironment.nfce) ?? asRecord(fiscal.nfce) ?? {};
  const nfe = asRecord(activeEnvironment.nfe) ?? asRecord(fiscal.nfe) ?? {};
  const emitente = asRecord(fiscal.emitente) ?? {};
  const endereco = asRecord(emitente.endereco) ?? {};
  const senhaPfx = String(certificado.senha_pfx ?? certificado.senha ?? "");
  const cscToken = String(nfce.csc_token ?? nfce.cscToken ?? "");
  const serieFiscal = getPdvFiscalSeriesValue({
    ...fiscal,
    ...activeEnvironment,
    nfce,
    nfe
  }) ?? 1;

  return applyPdvFiscalSeriesConfig({
    ...fiscal,
    ...activeEnvironment,
    ambiente,
    serie_fiscal: serieFiscal,
    uf: String(fiscal.uf ?? endereco.uf ?? ""),
    emitente,
    certificado: {
      ...certificado,
      senha: senhaPfx,
      pfxPassword: senhaPfx,
      ...(pfxPath ? { pfxPath } : {})
    },
    nfce: {
      ...nfce,
      serie: serieFiscal,
      csc_token: cscToken,
      cscToken
    },
    nfe: {
      ...nfe,
      serie: serieFiscal
    },
    ...buildPdvFiscalPrintConfig(printingConfig)
  }, serieFiscal);
}

function getPositiveFiscalNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function getFiscalNumberSnapshot(
  config: Record<string, unknown> | null | undefined,
  ambiente: string,
  modelKey: "nfce" | "nfe"
) {
  const top = asRecord(config?.[modelKey]);
  const ambientes = asRecord(config?.ambientes);
  const environment = asRecord(ambientes?.[ambiente]);
  const environmentModel = asRecord(environment?.[modelKey]);

  return {
    ultimoNumero: Math.max(
      getPositiveFiscalNumber(top?.ultimo_numero ?? top?.ultimoNumero),
      getPositiveFiscalNumber(environmentModel?.ultimo_numero ?? environmentModel?.ultimoNumero)
    ),
    proximoNumero: Math.max(
      getPositiveFiscalNumber(top?.proximo_numero ?? top?.proximoNumero),
      getPositiveFiscalNumber(environmentModel?.proximo_numero ?? environmentModel?.proximoNumero)
    )
  };
}

function preserveLocalFiscalNumbering(
  nextConfig: Record<string, unknown>,
  currentConfig: Record<string, unknown> | null | undefined
) {
  const ambiente = nextConfig.ambiente === "producao" ? "producao" : "homologacao";
  const nextAmbientes = asRecord(nextConfig.ambientes) ?? {};
  const nextEnvironment = asRecord(nextAmbientes[ambiente]) ?? {};
  const localSeries = getPdvFiscalSeriesValue(currentConfig);
  const nextSeries = localSeries ?? getPdvFiscalSeriesValue(nextConfig) ?? 1;
  const mergedConfig: Record<string, unknown> = { ...nextConfig };
  const mergedEnvironment: Record<string, unknown> = { ...nextEnvironment };

  (["nfce", "nfe"] as const).forEach((modelKey) => {
    const nextSnapshot = getFiscalNumberSnapshot(nextConfig, ambiente, modelKey);
    const currentSnapshot = getFiscalNumberSnapshot(currentConfig, ambiente, modelKey);
    const proximoNumero = Math.max(nextSnapshot.proximoNumero, currentSnapshot.proximoNumero);
    const ultimoNumero = Math.max(nextSnapshot.ultimoNumero, currentSnapshot.ultimoNumero);
    const nextModel = asRecord(nextConfig[modelKey]) ?? {};
    const nextEnvironmentModel = asRecord(nextEnvironment[modelKey]) ?? nextModel;
    const numberPatch = {
      ...(ultimoNumero > 0 ? { ultimo_numero: ultimoNumero } : {}),
      ...(proximoNumero > 0 ? { proximo_numero: proximoNumero } : {})
    };

    mergedConfig[modelKey] = {
      ...nextModel,
      ...numberPatch
    };
    mergedEnvironment[modelKey] = {
      ...nextEnvironmentModel,
      ...numberPatch
    };
  });

  return applyPdvFiscalSeriesConfig({
    ...mergedConfig,
    ambientes: {
      ...nextAmbientes,
      [ambiente]: mergedEnvironment
    }
  }, nextSeries);
}

function isMissingFiscalIpcHandlerError(error: unknown) {
  return /No handler registered/i.test(error instanceof Error ? error.message : String(error || ""));
}

function getFiscalDocumentSyncState(document: FiscalDocumentRecord) {
  return String(document.sync_status ?? "pending");
}

function isPendingContingencyTransmissionDocument(document: FiscalDocumentRecord) {
  const status = String(document.status || "").toLowerCase();
  const model = String(document.modelo || "");

  if (model && model !== "65" && model !== "55") {
    return false;
  }

  if (document.protocolo) {
    return false;
  }

  return status === "contingencia_emitida" ||
    status === "contingencia_transmissao_pendente" ||
    status === "erro_transmissao_contingencia";
}

function dedupeFiscalDocuments(documents: FiscalDocumentRecord[]) {
  const uniqueDocuments = new Map<string, FiscalDocumentRecord>();

  for (const document of documents) {
    const key = [
      document.modelo || "",
      document.serie || "",
      document.numero || "",
      document.chave || "",
      document.status || "",
      document.codigo_retorno_sefaz || "",
      document.mensagem_operador || document.mensagem_sefaz || ""
    ].join("|");

    if (!uniqueDocuments.has(key)) {
      uniqueDocuments.set(key, document);
    }
  }

  return [...uniqueDocuments.values()];
}

function getEnabledPaymentOptions(settings: PaymentSettings) {
  const enabledOptions = paymentOptions.filter((option) => settings[option.id]);

  return enabledOptions.length > 0 ? enabledOptions : paymentOptions;
}

function isSaleCanceled(sale: Pick<SaleRecord, "status">) {
  return sale.status === "canceled";
}

function isAtOrAfter(value: string | null | undefined, threshold: string) {
  if (!value || !threshold) {
    return false;
  }

  const valueTime = new Date(value).getTime();
  const thresholdTime = new Date(threshold).getTime();

  return Number.isFinite(valueTime) && Number.isFinite(thresholdTime) && valueTime >= thresholdTime;
}

function saleBelongsToSession(sale: SaleRecord, session: CashierSession | null) {
  if (!session) {
    return false;
  }

  if (sale.sessionId) {
    return sale.sessionId === session.id;
  }

  return isAtOrAfter(sale.createdAt, session.openedAt);
}

function expenseBelongsToSession(expense: CashExpenseRecord, session: CashierSession | null) {
  if (!session) {
    return false;
  }

  if (expense.sessionId) {
    return expense.sessionId === session.id;
  }

  return isAtOrAfter(expense.createdAt, session.openedAt);
}

function agreementReceiptBelongsToSession(receipt: AgreementReceiptRecord, session: CashierSession | null) {
  if (!session || receipt.status !== "pago" || !receipt.paymentMethod) {
    return false;
  }

  if (receipt.receivedSessionId) {
    return receipt.receivedSessionId === session.id;
  }

  return false;
}

function CashierModal({
  title,
  description,
  children,
  footer,
  onClose,
  dismissible = true,
  size = "md"
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dismissible && event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissible, onClose]);

  return (
    <div className="pdv-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && dismissible && onClose()}>
      <section className={`pdv-modal-card pdv-modal-card-${size}`} aria-modal="true" role="dialog">
        {dismissible ? (
          <button className="pdv-modal-close" type="button" onClick={onClose} aria-label="Fechar modal">
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}
        <header className="pdv-modal-head">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
        <div className="pdv-modal-body">{children}</div>
        {footer ? <footer className="pdv-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

function EmployeeAuthModal({
  mode,
  code,
  error,
  isSubmitting,
  onChangeCode,
  onClose,
  onConfirm
}: {
  mode: EmployeeAuthMode;
  code: string;
  error: string;
  isSubmitting: boolean;
  onChangeCode: (value: string) => void;
  onClose: () => void;
  onConfirm: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const title = mode === "open" ? "Abrir caixa" : "Fechar caixa";
  const description = mode === "open"
    ? "Informe a senha do funcionário responsável pelo turno."
    : "Informe a senha do funcionário responsável pelo fechamento.";

  return (
    <CashierModal
      title={title}
      description={description}
      onClose={onClose}
      size="sm"
      dismissible={!isSubmitting}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </button>
          <button className="pdv-primary-action" type="submit" form="employee-auth-form" disabled={isSubmitting || code.length === 0}>
            {isSubmitting ? <LoaderCircle className="pdv-spin" aria-hidden="true" size={17} /> : <Check aria-hidden="true" size={17} />}
            Confirmar
          </button>
        </>
      }
    >
      <form className="pdv-employee-auth" id="employee-auth-form" onSubmit={onConfirm}>
        <label>
          <span>
            <KeyRound aria-hidden="true" size={17} />
            Senha
          </span>
          <input
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]*"
            type="password"
            value={code}
            placeholder="Apenas números"
            onChange={(event) => onChangeCode(normalizeEmployeeCode(event.currentTarget.value))}
          />
        </label>
        {error ? (
          <p className="pdv-employee-auth-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </CashierModal>
  );
}

function shouldShowPdvUpdateModal(status: PdvUpdateStatus | null) {
  return status?.status === "available" ||
    status?.status === "downloading" ||
    status?.status === "downloaded";
}

function formatPdvReleaseVersion(version: string | null | undefined) {
  const normalized = String(version || "").trim();
  const match = /^(\d+)\.(\d+)\.0$/.exec(normalized);

  if (match) {
    return `v${match[1]}.${match[2]}`;
  }

  return normalized ? `v${normalized}` : "nova versão";
}

function formatUpdateSize(bytes: number | null | undefined) {
  const size = Number(bytes);

  if (!Number.isFinite(size) || size <= 0) {
    return "Tamanho indisponível";
  }

  const megabytes = size / 1024 / 1024;

  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: megabytes >= 100 ? 0 : 1,
    minimumFractionDigits: megabytes >= 100 ? 0 : 1
  }).format(megabytes)} MB`;
}

function PdvUpdateModal({
  hasOpenSession,
  isBusy,
  onPostpone,
  onUpdate,
  status
}: {
  hasOpenSession: boolean;
  isBusy: boolean;
  onPostpone: () => void;
  onUpdate: () => void | Promise<void>;
  status: PdvUpdateStatus | null;
}) {
  if (!shouldShowPdvUpdateModal(status)) {
    return null;
  }

  const availableVersion = formatPdvReleaseVersion(status?.availableVersion);
  const updateSize = formatUpdateSize(status?.sizeBytes);
  const progress = Math.max(0, Math.min(100, Math.round(Number(status?.progress ?? 0))));
  const isDownloaded = status?.status === "downloaded";
  const isDownloading = status?.status === "downloading";
  const isAvailable = status?.status === "available";
  const primaryLabel = isDownloaded
    ? hasOpenSession
      ? "Feche o caixa"
      : "Reiniciar e instalar"
    : isDownloading
      ? "Baixando"
      : "Atualizar PDV";
  const primaryDisabled = isBusy || isDownloading || (isDownloaded && hasOpenSession);

  return (
    <CashierModal
      title="Atualização disponível"
      description={`Versão ${availableVersion} pronta para este PDV.`}
      onClose={onPostpone}
      dismissible={false}
      size="sm"
      footer={
        <>
          <button className="pdv-secondary-action" type="button" disabled={isDownloading || isBusy} onClick={onPostpone}>
            Deixar para depois
          </button>
          <button className="pdv-primary-action" type="button" disabled={primaryDisabled} onClick={onUpdate}>
            {isBusy || isDownloading ? (
              <LoaderCircle className="pdv-spin" aria-hidden="true" size={17} />
            ) : isDownloaded ? (
              <RefreshCw aria-hidden="true" size={17} />
            ) : (
              <Download aria-hidden="true" size={17} />
            )}
            {primaryLabel}
          </button>
        </>
      }
    >
      <div className="pdv-update-modal-body">
        <span className="pdv-update-modal-icon" aria-hidden="true">
          {isDownloaded ? <Check size={22} /> : <Download size={22} />}
        </span>

        <div className="pdv-update-modal-summary">
          <div>
            <small>Nova versão</small>
            <strong>{availableVersion}</strong>
          </div>
          <div>
            <small>Tamanho</small>
            <strong>{updateSize}</strong>
          </div>
        </div>

        <div className="pdv-update-modal-progress" aria-label={`Progresso do download: ${progress}%`}>
          <span style={{ width: `${isAvailable ? 0 : progress}%` }} />
        </div>

        <p>
          {isDownloaded
            ? hasOpenSession
              ? "O download terminou. Feche o caixa para instalar a atualização."
              : "O download terminou. Reinicie o PDV para concluir a instalação."
            : isDownloading
              ? `Baixando atualização: ${progress}%`
              : "Baixe agora ou continue usando esta versão por enquanto."}
        </p>
      </div>
    </CashierModal>
  );
}

export function DesktopCashierFlow({
  connectivity,
  deviceCredential,
  deviceId,
  pdvIdentity,
  shiftSequenceScope,
  initialSettings,
  initialEmployees,
  lastAccessLabel,
  onConnectivityChange,
  systemMessage,
  onSystemMessage
}: DesktopCashierFlowProps) {
  const [view, setView] = useState<CashierView>("menu");
  const [session, setSession] = useState<CashierSession | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [commandEditor, setCommandEditor] = useState<CommandEditorState | null>(null);
  const [commandNameRequest, setCommandNameRequest] = useState<CommandNameRequest | null>(null);
  const [commandDeleteRequest, setCommandDeleteRequest] = useState<CommandDeleteRequest | null>(null);
  const [commandPaymentRequest, setCommandPaymentRequest] = useState<CommandRecord | null>(null);
  const [expenses, setExpenses] = useState<CashExpenseRecord[]>([]);
  const [agreementClients, setAgreementClients] = useState<AgreementClient[]>([]);
  const [agreementReceipts, setAgreementReceipts] = useState<AgreementReceiptRecord[]>([]);
  const [agreementSearchQuery, setAgreementSearchQuery] = useState("");
  const [agreementReceiptDetailsClient, setAgreementReceiptDetailsClient] = useState<AgreementClient | null>(null);
  const [agreementReceiptPaymentRequest, setAgreementReceiptPaymentRequest] =
    useState<AgreementReceiptPaymentRequest | null>(null);
  const [completedAgreementReceipt, setCompletedAgreementReceipt] = useState<AgreementReceiptCompletionRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPickerCategoryId, setSelectedPickerCategoryId] = useState("all");
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<ProductCategory[]>([]);
  const [commandSettings, setCommandSettings] = useState<CommandSettings>(() =>
    normalizeCommandSettings(initialSettings?.comandas)
  );
  const [expenseSettings, setExpenseSettings] = useState<ExpenseSettings>(() =>
    normalizeExpenseSettings(initialSettings?.lancar_despesas)
  );
  const [employeeControlSettings, setEmployeeControlSettings] = useState<EmployeeControlSettings>(() =>
    normalizeEmployeeControlSettings(initialSettings?.controle_funcionarios)
  );
  const [employees, setEmployees] = useState<EmployeeRecord[]>(() => mergeEmployees((initialEmployees ?? []).map(mapEmployee)));
  const [employeeAuthRequest, setEmployeeAuthRequest] = useState<EmployeeAuthRequest | null>(null);
  const [employeeAuthCode, setEmployeeAuthCode] = useState("");
  const [employeeAuthError, setEmployeeAuthError] = useState("");
  const [isEmployeeAuthSubmitting, setIsEmployeeAuthSubmitting] = useState(false);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [isFiscalEmissionEnabled, setIsFiscalEmissionEnabled] = useState(() =>
    isFiscalEmissionActiveConfig(initialSettings?.fiscal ?? null)
  );
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [fiscalDocumentsBySaleId, setFiscalDocumentsBySaleId] = useState<Record<string, FiscalDocumentRecord[]>>({});
  const [selectedSaleFiscalDocuments, setSelectedSaleFiscalDocuments] = useState<FiscalDocumentRecord[]>([]);
  const [isSelectedSaleFiscalLoading, setIsSelectedSaleFiscalLoading] = useState(false);
  const [reprintingFiscalDocumentId, setReprintingFiscalDocumentId] = useState<string | null>(null);
  const [fiscalDocumentsRefreshToken, setFiscalDocumentsRefreshToken] = useState(0);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [fiscalEmissionModal, setFiscalEmissionModal] = useState<FiscalEmissionModalState | null>(null);
  const [isFiscalPrinting, setIsFiscalPrinting] = useState(false);
  const [fiscalPrintMode, setFiscalPrintMode] = useState<FiscalPrintMode | null>(null);
  const fiscalPrintingLockRef = useRef(false);
  const [saleCancelRequest, setSaleCancelRequest] = useState<SaleRecord | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCashPaymentOpen, setIsCashPaymentOpen] = useState(false);
  const [cashPaymentTarget, setCashPaymentTarget] = useState<"sale" | "agreement-receipt">("sale");
  const [isAgreementPaymentOpen, setIsAgreementPaymentOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [expenseEditRequest, setExpenseEditRequest] = useState<CashExpenseRecord | null>(null);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isLocalStateReady, setIsLocalStateReady] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncSummary, setSyncSummary] = useState<LocalPdvStoreSummary>({
    total: 0,
    pending: 0,
    failed: 0
  });
  const [failedSyncEvents, setFailedSyncEvents] = useState<LocalPdvStorePendingEvent[]>([]);
  const [failedFiscalDocuments, setFailedFiscalDocuments] = useState<FiscalDocumentRecord[]>([]);
  const [eventSyncError, setEventSyncError] = useState("");
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null);
  const [catalogSyncError, setCatalogSyncError] = useState("");
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isSyncDetailsOpen, setIsSyncDetailsOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<PdvUpdateStatus | null>(null);
  const [isUpdateActionRunning, setIsUpdateActionRunning] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [previewShiftNumber, setPreviewShiftNumber] = useState(() =>
    getPreviewDailyShiftNumber(new Date(), shiftSequenceScope)
  );
  const isSyncingRef = useRef(false);
  const isFiscalSyncingRef = useRef(false);
  const isContingencyTransmittingRef = useRef(false);
  const hasLoadedRemoteDataRef = useRef(false);

  const localStoreScope = useMemo(
    () => `${shiftSequenceScope || "local"}:${deviceId || "device"}`,
    [deviceId, shiftSequenceScope]
  );

  useEffect(() => {
    const store = getLocalPdvStore();
    let isMounted = true;

    if (!store?.getUpdateStatus) {
      return undefined;
    }

    store.getUpdateStatus()
      .then((status) => {
        if (isMounted) {
          setUpdateStatus(status);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUpdateStatus(null);
        }
      });

    const unsubscribe = store.onUpdateStatus?.((status) => {
      setUpdateStatus(status);
    });

    store.checkForUpdates?.()
      .then((status) => {
        if (isMounted) {
          setUpdateStatus(status);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  const totalCents = getCartTotal(cartItems);
  const totalQuantity = getCartQuantity(cartItems);
  const commandEditorTotalCents = getCartTotal(commandEditor?.items ?? []);
  const commandEditorQuantity = getCartQuantity(commandEditor?.items ?? []);
  const paymentItems = commandPaymentRequest?.items ?? cartItems;
  const paymentTotalCents = getCartTotal(paymentItems);
  const activeAgreementClients = useMemo(
    () => normalizeAgreementClients(agreementClients),
    [agreementClients]
  );
  const enabledPaymentOptions = useMemo(
    () => getEnabledPaymentOptions(paymentSettings).filter((option) => option.id !== "convenio" || activeAgreementClients.length > 0),
    [activeAgreementClients.length, paymentSettings]
  );
  const receiptPaymentOptions = useMemo(
    () => enabledPaymentOptions.filter((option) => option.id !== "convenio"),
    [enabledPaymentOptions]
  );
  const isCommandsEnabled = commandSettings.ativo;
  const isExpensesEnabled = expenseSettings.ativo;
  const isEmployeeControlEnabled = employeeControlSettings.ativo;
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active && employee.codeHash),
    [employees]
  );
  const isAgreementPaymentEnabled = paymentSettings.convenio;
  const frontCashAgreementClients = useMemo(
    () => activeAgreementClients.filter((client) => client.allowFrontPayment),
    [activeAgreementClients]
  );
  const pendingAgreementReceipts = useMemo(() => {
    const allowedClientIds = new Set(frontCashAgreementClients.map((client) => client.id));

    return agreementReceipts.filter((receipt) => {
      if (receipt.status !== "pendente") {
        return false;
      }

      return receipt.clientId === null || allowedClientIds.has(receipt.clientId);
    });
  }, [agreementReceipts, frontCashAgreementClients]);
  const paidAgreementReceipts = useMemo(
    () => agreementReceipts.filter((receipt) => receipt.status === "pago" && receipt.paymentMethod),
    [agreementReceipts]
  );
  const sessionAgreementReceipts = useMemo(
    () => paidAgreementReceipts.filter((receipt) => agreementReceiptBelongsToSession(receipt, session)),
    [paidAgreementReceipts, session]
  );
  const agreementClientReceivableSummaries = useMemo<AgreementClientReceivableSummary[]>(() => {
    return frontCashAgreementClients
      .map((client) => {
        const clientReceipts = agreementReceipts.filter((receipt) => receipt.clientId === client.id);
        const pendingReceipts = clientReceipts
          .filter((receipt) => receipt.status === "pendente")
          .sort((firstReceipt, secondReceipt) => new Date(secondReceipt.createdAt).getTime() - new Date(firstReceipt.createdAt).getTime());
        const paidReceipts = clientReceipts
          .filter((receipt) => receipt.status === "pago")
          .sort((firstReceipt, secondReceipt) => {
            const firstDate = firstReceipt.receivedAt ?? firstReceipt.createdAt;
            const secondDate = secondReceipt.receivedAt ?? secondReceipt.createdAt;

            return new Date(secondDate).getTime() - new Date(firstDate).getTime();
          });
        const allReceipts = [...pendingReceipts, ...paidReceipts];
        const lastActivityAt = allReceipts.reduce((latestDate, receipt) => {
          const currentDate = receipt.receivedAt ?? receipt.createdAt;

          return new Date(currentDate).getTime() > new Date(latestDate).getTime() ? currentDate : latestDate;
        }, clientReceipts[0]?.createdAt ?? new Date().toISOString());

        return {
          client,
          pendingReceipts,
          paidReceipts,
          totalOpenCents: pendingReceipts.reduce((total, receipt) => total + receipt.totalCents, 0),
          pendingItemsCount: pendingReceipts.reduce((total, receipt) => total + receipt.itemsCount, 0),
          lastActivityAt
        };
      })
      .filter((summary) => summary.pendingReceipts.length > 0)
      .sort((firstSummary, secondSummary) => {
        const totalDifference = secondSummary.totalOpenCents - firstSummary.totalOpenCents;

        if (totalDifference !== 0) {
          return totalDifference;
        }

        return firstSummary.client.name.localeCompare(secondSummary.client.name, "pt-BR");
      });
  }, [agreementReceipts, frontCashAgreementClients]);
  const filteredAgreementClientReceivableSummaries = useMemo(() => {
    const query = normalizeSearch(agreementSearchQuery);

    if (!query) {
      return agreementClientReceivableSummaries;
    }

    return agreementClientReceivableSummaries.filter((summary) =>
      normalizeSearch(summary.client.name).includes(query)
    );
  }, [agreementClientReceivableSummaries, agreementSearchQuery]);
  const selectedAgreementClientReceipts = useMemo(() => {
    if (!agreementReceiptDetailsClient) {
      return [];
    }

    return agreementReceipts
      .filter((receipt) => receipt.clientId === agreementReceiptDetailsClient.id)
      .sort((firstReceipt, secondReceipt) => {
        const firstDate = firstReceipt.receivedAt ?? firstReceipt.createdAt;
        const secondDate = secondReceipt.receivedAt ?? secondReceipt.createdAt;

        return new Date(secondDate).getTime() - new Date(firstDate).getTime();
      });
  }, [agreementReceiptDetailsClient, agreementReceipts]);
  const agreementReceiptPaymentTotalCents =
    agreementReceiptPaymentRequest?.receipts.reduce((total, receipt) => total + receipt.totalCents, 0) ?? 0;
  const sessionRecordedSales = useMemo(
    () => sales.filter((sale) => saleBelongsToSession(sale, session)),
    [sales, session]
  );
  const sessionActiveSales = useMemo(
    () => sessionRecordedSales.filter((sale) => !isSaleCanceled(sale)),
    [sessionRecordedSales]
  );
  const sessionPaidSales = sessionActiveSales.filter((sale) => sale.paymentMethod !== "convenio");
  const sessionSales = sessionPaidSales.reduce((total, sale) => total + sale.totalCents, 0) +
    sessionAgreementReceipts.reduce((total, receipt) => total + receipt.totalCents, 0);
  const sessionSalesByPayment = paymentOptions
    .filter((option) => option.id !== "convenio")
    .map<PaymentBreakdownItem>((option) => {
      const optionSales = sessionPaidSales.filter((sale) => sale.paymentMethod === option.id);
      const optionReceipts = sessionAgreementReceipts.filter((receipt) => receipt.paymentMethod === option.id);

      return {
        method: option.id,
        label: option.label,
        totalCents:
          optionSales.reduce((total, sale) => total + sale.totalCents, 0) +
          optionReceipts.reduce((total, receipt) => total + receipt.totalCents, 0),
        count: optionSales.length + optionReceipts.length
      };
    })
    .filter((item) => item.count > 0);
  const sessionExpenseRecords = useMemo(
    () => expenses.filter((expense) => expenseBelongsToSession(expense, session)),
    [expenses, session]
  );
  const sessionExpenses = sessionExpenseRecords.reduce((total, expense) => total + expense.amountCents, 0);
  const sessionHistoryMovements = useMemo<HistoryMovement[]>(() => {
    const agreementClientById = new Map(activeAgreementClients.map((client) => [client.id, client]));
    const saleMovements: HistoryMovement[] = sessionRecordedSales.map((sale) => ({
      type: "sale",
      id: sale.id,
      occurredAt: sale.createdAt,
      sale
    }));
    const agreementReceiptGroups = new Map<string, Extract<HistoryMovement, { type: "agreement-receipt" }>>();

    for (const receipt of sessionAgreementReceipts) {
      const occurredAt = receipt.receivedAt ?? receipt.createdAt;
      const groupKey = [
        receipt.clientId ?? "sem-cliente",
        receipt.clientName,
        receipt.paymentMethod ?? "sem-pagamento",
        occurredAt
      ].join(":");
      const currentGroup = agreementReceiptGroups.get(groupKey);

      if (currentGroup) {
        currentGroup.receiptCount += 1;
        currentGroup.itemsCount += receipt.itemsCount;
        currentGroup.totalCents += receipt.totalCents;
        currentGroup.receipts.push(receipt);
        continue;
      }

      agreementReceiptGroups.set(groupKey, {
        type: "agreement-receipt",
        id: `convenio-recebido-${receipt.id}`,
        occurredAt,
        clientName: receipt.clientName,
        clientPersonType: receipt.clientPersonType ?? agreementClientById.get(Number(receipt.clientId))?.personType ?? "fisica",
        receiptCount: 1,
        itemsCount: receipt.itemsCount,
        totalCents: receipt.totalCents,
        paymentMethod: receipt.paymentMethod,
        receipts: [receipt]
      });
    }
    const agreementReceiptMovements = Array.from(agreementReceiptGroups.values());

    return [...saleMovements, ...agreementReceiptMovements].sort((firstMovement, secondMovement) => {
      const firstTime = new Date(firstMovement.occurredAt).getTime();
      const secondTime = new Date(secondMovement.occurredAt).getTime();

      if (Number.isFinite(firstTime) && Number.isFinite(secondTime) && secondTime !== firstTime) {
        return secondTime - firstTime;
      }

      return secondMovement.id.localeCompare(firstMovement.id);
    });
  }, [activeAgreementClients, sessionAgreementReceipts, sessionRecordedSales]);
  const sessionCashSales = sessionSalesByPayment.find((item) => item.method === "dinheiro")?.totalCents ?? 0;
  const expectedCashCents = session ? Math.max(sessionCashSales - sessionExpenses, 0) : 0;

  useEffect(() => {
    if (!initialSettings) {
      return;
    }

    setCommandSettings(normalizeCommandSettings(initialSettings.comandas));
    setExpenseSettings(normalizeExpenseSettings(initialSettings.lancar_despesas));
    setEmployeeControlSettings(normalizeEmployeeControlSettings(initialSettings.controle_funcionarios));
    setPaymentSettings(normalizePaymentSettings(initialSettings.formas_pagamento));
    setIsFiscalEmissionEnabled(isFiscalEmissionActiveConfig(initialSettings.fiscal ?? null));
  }, [initialSettings]);

  useEffect(() => {
    if (!initialSettings || !initialEmployees) {
      return;
    }

    setEmployees(mergeEmployees(initialEmployees.map(mapEmployee)));
  }, [initialEmployees, initialSettings]);

  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    const activeCatalogProducts = catalogProducts.filter((product) => product.active !== false);
    const baseProducts = selectedPickerCategoryId === "all"
      ? activeCatalogProducts
      : activeCatalogProducts.filter((product) => product.categoryId === selectedPickerCategoryId);

    if (!query) {
      return baseProducts;
    }

    return baseProducts.filter((product) => {
      const searchable = normalizeSearch(`${product.name} ${product.category} ${product.barcode}`);
      return searchable.includes(query);
    });
  }, [catalogProducts, searchQuery, selectedPickerCategoryId]);

  function buildLocalStateSnapshot(): LocalCashierState {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      session,
      cartItems,
      sales,
      commands,
      expenses,
      employees,
      agreementClients,
      agreementReceipts,
      catalogProducts,
      catalogCategories,
      commandSettings,
      expenseSettings,
      employeeControlSettings,
      paymentSettings
    };
  }

  const refreshSyncSummary = useCallback(async () => {
    const store = getLocalPdvStore();

    if (!store) {
      setPendingSyncCount(0);
      setSyncSummary({ total: 0, pending: 0, failed: 0 });
      setFailedSyncEvents([]);
      return;
    }

    try {
      const summary = await store.getSyncSummary({ scope: localStoreScope });
      const ignoredFailures = readIgnoredSyncFailures(localStoreScope);
      let visibleFailedEvents: LocalPdvStorePendingEvent[] = [];
      let visibleFailedFiscalDocuments: FiscalDocumentRecord[] = [];

      if (summary.failed > 0 && typeof store.getFailedEvents === "function") {
        const events = await store.getFailedEvents({ scope: localStoreScope, limit: 50 });
        visibleFailedEvents = filterVisibleFailedEvents(events, ignoredFailures);
      }

      if (summary.failed > 0 && typeof store.getFailedFiscalDocuments === "function") {
        try {
          const documents = await store.getFailedFiscalDocuments({ scope: localStoreScope, limit: 50 });
          visibleFailedFiscalDocuments = filterVisibleFailedFiscalDocuments(
            dedupeFiscalDocuments(documents),
            ignoredFailures
          );
        } catch (error) {
          if (!isMissingFiscalIpcHandlerError(error)) {
            throw error;
          }
        }
      }

      const visibleSummary = getVisibleSyncFailureSummary(summary, visibleFailedEvents, visibleFailedFiscalDocuments);
      setSyncSummary(visibleSummary);
      setPendingSyncCount(visibleSummary.pending);
      setFailedSyncEvents(visibleFailedEvents.slice(0, 8));
      setFailedFiscalDocuments(visibleFailedFiscalDocuments.slice(0, 8));
    } catch {
      setPendingSyncCount(0);
      setSyncSummary({ total: 0, pending: 0, failed: 0 });
      setFailedSyncEvents([]);
      setFailedFiscalDocuments([]);
    }
  }, [localStoreScope]);

  const syncPendingEvents = useCallback(async (options: { showMessage?: boolean; forceOnline?: boolean } = {}) => {
    const store = getLocalPdvStore();

    if (!store || (connectivity !== "online" && !options.forceOnline) || !deviceCredential || !deviceId || isSyncingRef.current) {
      return false;
    }

    isSyncingRef.current = true;

    try {
      const pendingEvents = await store.getPendingEvents({ scope: localStoreScope, limit: 100 });

      if (pendingEvents.length === 0) {
        setEventSyncError("");
        await refreshSyncSummary();
        return true;
      }

      const response = await apiPost<SyncPushResponse>("/pdvs/sync/push", {
        credencial_dispositivo: deviceCredential,
        dispositivo_id: deviceId,
        eventos: pendingEvents.map((event: LocalPdvStorePendingEvent) => ({
          id: event.id,
          event_type: event.event_type,
          aggregate_type: event.aggregate_type,
          aggregate_id: event.aggregate_id,
          idempotency_key: event.idempotency_key,
          payload: event.payload,
          created_at: event.created_at
        }))
      });
      onConnectivityChange("online");
      const pendingEventIds = new Set(pendingEvents.map((event) => event.id));
      const pendingEventsByLegacyApiId = new Map(
        pendingEvents.map((event) => [event.id.length > 64 ? event.id.slice(0, 64) : event.id, event.id])
      );
      const resolveLocalEventId = (eventId: string) => (
        pendingEventIds.has(eventId)
          ? eventId
          : pendingEventsByLegacyApiId.get(eventId) ?? eventId
      );
      const syncedIds = response.eventos
        .filter((event) => event.status === "processado" || event.status === "duplicado")
        .map((event) => resolveLocalEventId(event.id));
      const failedEvents = response.eventos.filter((event) => event.status === "erro");

      if (syncedIds.length > 0) {
        await store.markEventsSynced({ scope: localStoreScope, eventIds: syncedIds });
      }

      if (failedEvents.length > 0) {
        const message = failedEvents[0]?.message ?? "Evento recusado pela sincronização.";
        await store.markEventsFailed({
          scope: localStoreScope,
          eventIds: failedEvents.map((event) => resolveLocalEventId(event.id)),
          error: message
        });
        setEventSyncError(message);

        if (options.showMessage) {
          onSystemMessage(`Sincronização pendente: ${message}`);
        }
      }

      await refreshSyncSummary();
      if (failedEvents.length === 0) {
        setEventSyncError("");

        if (options.showMessage && syncedIds.length > 0) {
          onSystemMessage("Sincronização enviada para a API.");
        }
      }

      return failedEvents.length === 0;
    } catch (error) {
      onConnectivityChange("offline");
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar com a API.";
      setEventSyncError(message);
      if (options.showMessage) {
        onSystemMessage(`Não foi possível sincronizar agora: ${message}`);
      }
      await refreshSyncSummary();
      return false;
    } finally {
      isSyncingRef.current = false;
    }
  }, [connectivity, deviceCredential, deviceId, localStoreScope, onConnectivityChange, onSystemMessage, refreshSyncSummary]);

  const getUnsyncedSaleEventIds = useCallback(async () => {
    const store = getLocalPdvStore();

    if (!store?.getPendingEvents) {
      return new Set<string>();
    }

    try {
      const [pendingEvents, failedEvents] = await Promise.all([
        store.getPendingEvents({ scope: localStoreScope, limit: 250 }),
        typeof store.getFailedEvents === "function"
          ? store.getFailedEvents({ scope: localStoreScope, limit: 250 })
          : Promise.resolve([] as LocalPdvStorePendingEvent[])
      ]);

      return new Set(
        [...pendingEvents, ...failedEvents]
          .filter((event) => event.event_type === "venda_concluida" && event.aggregate_id)
          .map((event) => event.aggregate_id)
      );
    } catch {
      return new Set<string>();
    }
  }, [localStoreScope]);

  const enqueueRecoverableSaleEventsForFiscalDocuments = useCallback(async () => {
    const store = getLocalPdvStore();

    if (!store?.getPendingFiscalDocuments || !session) {
      return 0;
    }

    const pendingDocuments = dedupeFiscalDocuments(await store.getPendingFiscalDocuments({ scope: localStoreScope, limit: 100 }))
      .filter((document) => getFiscalDocumentSyncState(document) === "pending" && Boolean(document.venda_id));
    const salesById = new Map(sales.map((sale) => [sale.id, sale]));
    const eventPayloadBase = {
      pdv: {
        deviceId,
        identity: pdvIdentity,
        sequenceScope: shiftSequenceScope
      }
    };
    let recovered = 0;

    for (const document of pendingDocuments) {
      const saleId = document.venda_id;
      const sale = saleId ? salesById.get(saleId) : null;

      if (!sale) {
        continue;
      }

      await store.enqueueEvent({
        scope: localStoreScope,
        eventType: "venda_concluida",
        aggregateType: "venda",
        aggregateId: sale.id,
        payload: {
          ...eventPayloadBase,
          eventId: `venda_concluida-${sale.id}`,
          session,
          sale,
          origem: sale.originCommandTitle ? "comanda" : "caixa",
          origemComandaNome: sale.originCommandTitle ?? null
        }
      });
      recovered += 1;
    }

    if (recovered > 0) {
      await refreshSyncSummary();
    }

    return recovered;
  }, [deviceId, localStoreScope, pdvIdentity, refreshSyncSummary, sales, session, shiftSequenceScope]);

  const syncPendingFiscalDocuments = useCallback(async (options: { showMessage?: boolean; forceOnline?: boolean } = {}) => {
    const store = getLocalPdvStore();

    if (
      !store?.getPendingFiscalDocuments ||
      !store.markFiscalDocumentsSynced ||
      !store.markFiscalDocumentsFailed ||
      !isFiscalEmissionEnabled ||
      (connectivity !== "online" && !options.forceOnline) ||
      !deviceCredential ||
      !deviceId ||
      isFiscalSyncingRef.current
    ) {
      return false;
    }

    isFiscalSyncingRef.current = true;

    try {
      const pendingDocuments = dedupeFiscalDocuments(await store.getPendingFiscalDocuments({ scope: localStoreScope, limit: 100 }))
        .filter((document) => getFiscalDocumentSyncState(document) === "pending");
      const blockedSaleIds = await getUnsyncedSaleEventIds();
      const readyDocuments = pendingDocuments.filter((document) => !document.venda_id || !blockedSaleIds.has(document.venda_id));

      if (readyDocuments.length === 0) {
        await refreshSyncSummary();
        return pendingDocuments.length === 0;
      }

      const response = await apiPost<SyncFiscalResponse>("/pdvs/sync/fiscal", {
        credencial_dispositivo: deviceCredential,
        dispositivo_id: deviceId,
        documentos: readyDocuments
      });
      onConnectivityChange("online");
      const syncedDocuments = response.documentos
        .filter((document) => ["processado", "atualizado", "duplicado"].includes(document.status))
        .map((document) => ({
          id: document.id,
          api_nf_id: document.api_nf_id ?? null
        }));
      const failedDocuments = response.documentos.filter((document) => document.status === "erro");

      if (syncedDocuments.length > 0) {
        await store.markFiscalDocumentsSynced({
          scope: localStoreScope,
          documents: syncedDocuments
        });
      }

      if (failedDocuments.length > 0) {
        const message = failedDocuments[0]?.message ?? "Documento fiscal recusado pela sincronização.";
        await store.markFiscalDocumentsFailed({
          scope: localStoreScope,
          documentIds: failedDocuments.map((document) => document.id).filter((id): id is string => Boolean(id)),
          error: message
        });
        setEventSyncError(message);

        if (options.showMessage) {
          onSystemMessage(`Sincronização fiscal pendente: ${message}`);
        }
      }

      await refreshSyncSummary();

      if (failedDocuments.length === 0) {
        setEventSyncError("");

        if (syncedDocuments.length > 0 && options.showMessage) {
          onSystemMessage("Notas fiscais sincronizadas com a API.");
        }
      }

      return failedDocuments.length === 0;
    } catch (error) {
      if (isMissingFiscalIpcHandlerError(error)) {
        await refreshSyncSummary();
        return true;
      }

      onConnectivityChange("offline");
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar notas fiscais com a API.";
      setEventSyncError(message);
      if (options.showMessage) {
        onSystemMessage(`Não foi possível sincronizar as notas fiscais: ${message}`);
      }
      await refreshSyncSummary();
      return false;
    } finally {
      isFiscalSyncingRef.current = false;
    }
  }, [connectivity, deviceCredential, deviceId, getUnsyncedSaleEventIds, isFiscalEmissionEnabled, localStoreScope, onConnectivityChange, onSystemMessage, refreshSyncSummary]);

  const transmitPendingContingencyFiscalDocuments = useCallback(async (options: { showMessage?: boolean; forceOnline?: boolean } = {}) => {
    const store = getLocalPdvStore();

    if (
      !store?.listFiscalDocuments ||
      !store.callFiscalWorker ||
      !isFiscalEmissionEnabled ||
      (connectivity !== "online" && !options.forceOnline) ||
      isContingencyTransmittingRef.current
    ) {
      return false;
    }

    isContingencyTransmittingRef.current = true;

    try {
      const documents = dedupeFiscalDocuments(await store.listFiscalDocuments({ scope: localStoreScope, limit: 250 }))
        .filter(isPendingContingencyTransmissionDocument)
        .slice(0, 8);

      if (documents.length === 0) {
        await refreshSyncSummary();
        return true;
      }

      let transmittedCount = 0;
      let pendingCount = 0;
      let failedCount = 0;
      let firstError = "";

      for (const document of documents) {
        const xmlPath = getFiscalDocumentXmlPath(document);

        if (!xmlPath) {
          failedCount += 1;
          firstError ||= "XML de contingência não encontrado.";
          continue;
        }

        const fiscalModel: FiscalModel = document.modelo === "55" ? "55" : "65";
        const response = await store.callFiscalWorker({
          scope: localStoreScope,
          command: fiscalModel === "55" ? "transmitir-nfe-contingencia" : "transmitir-nfce-contingencia",
          documentId: document.id,
          payload: {
            documentId: document.id,
            vendaId: document.venda_id,
            xmlPath,
            modelo: fiscalModel,
            serie: document.serie,
            numero: document.numero,
            chave: document.chave
          }
        });

        if (response.success && response.status === "autorizada") {
          transmittedCount += 1;
          continue;
        }

        if (response.status === "contingencia_transmissao_pendente") {
          pendingCount += 1;
        } else {
          failedCount += 1;
        }

        firstError ||= response.friendlyMessage || response.mensagemSefaz || "Não foi possível transmitir a contingência.";
      }

      if (transmittedCount > 0 || pendingCount > 0 || failedCount > 0) {
        setFiscalDocumentsRefreshToken((token) => token + 1);
      }

      await refreshSyncSummary();

      if (transmittedCount > 0 && options.showMessage) {
        onSystemMessage(`${transmittedCount} documento fiscal em contingência ${transmittedCount === 1 ? "foi transmitido" : "foram transmitidos"}.`);
      } else if (firstError && options.showMessage) {
        onSystemMessage(firstError);
      }

      return failedCount === 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível transmitir os documentos fiscais em contingência.";

      if (options.showMessage) {
        onSystemMessage(message);
      }

      await refreshSyncSummary();
      return false;
    } finally {
      isContingencyTransmittingRef.current = false;
    }
  }, [connectivity, isFiscalEmissionEnabled, localStoreScope, onSystemMessage, refreshSyncSummary]);

  const syncPendingOutboundQueues = useCallback(async (options: { showMessage?: boolean; forceOnline?: boolean } = {}) => {
    let eventsSynced = false;
    let fiscalSynced = false;

    try {
      await enqueueRecoverableSaleEventsForFiscalDocuments();
      eventsSynced = await syncPendingEvents(options);
    } catch (error) {
      console.warn("Não foi possível sincronizar eventos locais.", error);
    }

    try {
      fiscalSynced = await syncPendingFiscalDocuments(options);
    } catch (error) {
      console.warn("Não foi possível sincronizar documentos fiscais locais.", error);
    }

    return { eventsSynced, fiscalSynced };
  }, [enqueueRecoverableSaleEventsForFiscalDocuments, syncPendingEvents, syncPendingFiscalDocuments]);

  function enqueueLocalEvent(
    eventType: string,
    aggregateType: string,
    aggregateId: string,
    payload: LocalPdvStoreEventPayload
  ) {
    const store = getLocalPdvStore();

    if (!store) {
      return;
    }

    const eventId = typeof payload.eventId === "string" && payload.eventId.trim()
      ? payload.eventId
      : `${eventType}-${aggregateId}`;

    void store
      .enqueueEvent({
        scope: localStoreScope,
        eventType,
        aggregateType,
        aggregateId,
        payload: {
          ...payload,
          eventId,
          pdv: {
            deviceId,
            identity: pdvIdentity,
            sequenceScope: shiftSequenceScope
          }
        }
      })
      .then((result) => {
        setPendingSyncCount(result.pending);
        void syncPendingOutboundQueues();
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Não foi possível registrar o evento local.";
        onSystemMessage(`Operação salva na tela, mas o evento local falhou: ${message}`);
      });
  }

  useEffect(() => {
    if (!isLocalStateReady || !session) {
      return;
    }

    const store = getLocalPdvStore();

    if (!store) {
      return;
    }

    const activeStore = store;
    const activeSession = session;
    let shouldIgnore = false;

    async function recoverMissingLocalEvents() {
      try {
        if (shouldIgnore) {
          return;
        }

        const eventPayloadBase = {
          pdv: {
            deviceId,
            identity: pdvIdentity,
            sequenceScope: shiftSequenceScope
          }
        };
        const operations: Array<Promise<{ ok: true; eventId: string; idempotencyKey: string; pending: number }>> = [
          activeStore.enqueueEvent({
            scope: localStoreScope,
            eventType: "turno_aberto",
            aggregateType: "turno",
            aggregateId: activeSession.id,
            payload: {
              ...eventPayloadBase,
              eventId: `turno_aberto-${activeSession.id}`,
              session: activeSession
            }
          })
        ];

        for (const sale of sessionRecordedSales) {
          const saleEventPayload = {
            ...eventPayloadBase,
            eventId: `venda_concluida-${sale.id}`,
            session: activeSession,
            sale,
            origem: sale.originCommandTitle ? "comanda" : "caixa",
            origemComandaNome: sale.originCommandTitle ?? null
          };

          operations.push(
            activeStore.enqueueEvent({
              scope: localStoreScope,
              eventType: "venda_concluida",
              aggregateType: "venda",
              aggregateId: sale.id,
              payload: saleEventPayload
            })
          );

          if (isSaleCanceled(sale)) {
            operations.push(
              activeStore.enqueueEvent({
                scope: localStoreScope,
                eventType: "venda_cancelada",
                aggregateType: "venda",
                aggregateId: sale.id,
                payload: {
                  ...eventPayloadBase,
                  eventId: `venda_cancelada-${sale.id}`,
                  session: activeSession,
                  sale,
                  canceledAt: sale.canceledAt ?? sale.createdAt,
                  origem: sale.originCommandTitle ? "comanda" : "caixa",
                  origemComandaNome: sale.originCommandTitle ?? null
                }
              })
            );
          }
        }

        for (const expense of sessionExpenseRecords) {
          operations.push(
            activeStore.enqueueEvent({
              scope: localStoreScope,
              eventType: "despesa_lancada",
              aggregateType: "despesa",
              aggregateId: expense.id,
              payload: {
                ...eventPayloadBase,
                eventId: `despesa_lancada-${expense.id}`,
                session: activeSession,
                expense
              }
            })
          );
        }

        for (const receipt of sessionAgreementReceipts) {
          operations.push(
            activeStore.enqueueEvent({
              scope: localStoreScope,
              eventType: "convenio_recebido",
              aggregateType: "venda",
              aggregateId: receipt.id,
              payload: {
                ...eventPayloadBase,
                eventId: `convenio_recebido-${receipt.id}`,
                session: activeSession,
                receipt
              }
            })
          );
        }

        await Promise.all(operations);

        if (!shouldIgnore) {
          await refreshSyncSummary();
          void syncPendingOutboundQueues();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível recuperar eventos locais.";
        setEventSyncError(message);
      }
    }

    void recoverMissingLocalEvents();

    return () => {
      shouldIgnore = true;
    };
  }, [
    deviceId,
    isLocalStateReady,
    localStoreScope,
    pdvIdentity,
    refreshSyncSummary,
    session,
    sessionAgreementReceipts,
    sessionExpenseRecords,
    sessionRecordedSales,
    shiftSequenceScope,
    syncPendingOutboundQueues
  ]);

  const synchronizeRemoteFiscalConfig = useCallback(async (remoteFiscal?: Record<string, unknown> | null) => {
    const fiscal = asRecord(remoteFiscal);
    const store = getLocalPdvStore();

    if (!fiscal || !store?.saveFiscalConfig) {
      return;
    }

    const savedConfig = await store.getFiscalConfig?.({ scope: localStoreScope });
    const printingConfig = getPdvFiscalPrintSettingsFromConfig(asRecord(savedConfig));
    const { activeEnvironment } = getActiveRemoteFiscalEnvironment(fiscal);
    const remoteFiscalEmissionEnabled = isFiscalEmissionActiveConfig(fiscal);
    const certificado = asRecord(activeEnvironment.certificado) ?? asRecord(fiscal.certificado) ?? {};
    const arquivoId = Number(certificado.arquivo_id ?? certificado.arquivoId);
    let pfxPath = typeof certificado.pfxPath === "string" ? certificado.pfxPath : "";

    setIsFiscalEmissionEnabled(remoteFiscalEmissionEnabled);

    if (remoteFiscalEmissionEnabled && arquivoId > 0 && deviceCredential && deviceId && store.saveFiscalCertificate) {
      const certificateFile = await apiPost<ApiFiscalCertificateDownload>("/pdvs/certificado-fiscal", {
        credencial_dispositivo: deviceCredential,
        dispositivo_id: deviceId,
        arquivo_id: arquivoId
      });
      const savedCertificate = await store.saveFiscalCertificate({
        scope: localStoreScope,
        fileName: `${certificateFile.id}-${certificateFile.nome_original || "certificado-a1.pfx"}`,
        base64: certificateFile.conteudo_base64
      });

      pfxPath = savedCertificate.path;
    }

    const nextLocalFiscalConfig = buildLocalFiscalConfigFromRemote(fiscal, printingConfig, pfxPath || undefined);

    await store.saveFiscalConfig({
      scope: localStoreScope,
      config: preserveLocalFiscalNumbering(nextLocalFiscalConfig, asRecord(savedConfig))
    });
    setIsFiscalEmissionEnabled(isFiscalEmissionActiveConfig(nextLocalFiscalConfig));
  }, [deviceCredential, deviceId, localStoreScope]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadFiscalDocumentsForSalesList() {
      const store = getLocalPdvStore();

      if (!isFiscalEmissionEnabled || sales.length === 0 || !store?.listFiscalDocuments) {
        setFiscalDocumentsBySaleId({});
        return;
      }

      try {
        const documents = dedupeFiscalDocuments(await store.listFiscalDocuments({
          scope: localStoreScope,
          limit: 250
        }));
        const saleIds = new Set(sales.map((sale) => sale.id));
        const grouped = documents.reduce<Record<string, FiscalDocumentRecord[]>>((accumulator, document) => {
          const saleId = document.venda_id;

          if (!saleId || !saleIds.has(saleId)) {
            return accumulator;
          }

          accumulator[saleId] = [...(accumulator[saleId] ?? []), document];
          return accumulator;
        }, {});

        if (!shouldIgnore) {
          setFiscalDocumentsBySaleId(grouped);
        }
      } catch {
        if (!shouldIgnore) {
          setFiscalDocumentsBySaleId({});
        }
      }
    }

    void loadFiscalDocumentsForSalesList();

    return () => {
      shouldIgnore = true;
    };
  }, [fiscalDocumentsRefreshToken, isFiscalEmissionEnabled, localStoreScope, sales]);

  useEffect(() => {
    let shouldIgnore = false;

    async function loadSelectedSaleFiscalDocuments() {
      if (!isFiscalEmissionEnabled || !selectedSale) {
        setSelectedSaleFiscalDocuments([]);
        setIsSelectedSaleFiscalLoading(false);
        return;
      }

      const store = getLocalPdvStore();

      if (!store?.listFiscalDocuments) {
        setSelectedSaleFiscalDocuments([]);
        setIsSelectedSaleFiscalLoading(false);
        return;
      }

      setIsSelectedSaleFiscalLoading(true);

      try {
        const documents = await store.listFiscalDocuments({
          scope: localStoreScope,
          vendaId: selectedSale.id,
          limit: 12
        });

        if (!shouldIgnore) {
          setSelectedSaleFiscalDocuments(dedupeFiscalDocuments(documents));
        }
      } catch {
        if (!shouldIgnore) {
          setSelectedSaleFiscalDocuments([]);
        }
      } finally {
        if (!shouldIgnore) {
          setIsSelectedSaleFiscalLoading(false);
        }
      }
    }

    void loadSelectedSaleFiscalDocuments();

    return () => {
      shouldIgnore = true;
    };
  }, [fiscalDocumentsRefreshToken, isFiscalEmissionEnabled, localStoreScope, selectedSale]);

  const refreshRemoteData = useCallback(async (options: { silent?: boolean; showMessage?: boolean; forceOnline?: boolean } = {}) => {
    if (!deviceCredential || !deviceId) {
      const message = "PDV sem credencial ativa para carregar produtos.";
      setCatalogError(message);
      setCatalogSyncError(message);
      return false;
    }

    if (connectivity !== "online" && !options.forceOnline) {
      const message = "Modo local: usando o último catálogo salvo.";
      setCatalogSyncError(message);
      return false;
    }

    if (!options.silent) {
      setIsCatalogLoading(true);
    }

    setIsCatalogSyncing(true);

    try {
      const response = await apiPost<ApiCatalogResponse>("/pdvs/catalogo", {
        credencial_dispositivo: deviceCredential,
        dispositivo_id: deviceId
      });
      const nextCategories = (response.categorias ?? []).map(mapCatalogCategory);
      const nextProducts = (response.produtos ?? []).map(mapCatalogProduct);
      const nextAgreementClients = (response.clientes_convenio ?? []).map(mapAgreementClient);
      const nextAgreementReceipts = (response.recebimentos_convenio ?? []).map(mapAgreementReceipt);
      const nextEmployees = mergeEmployees((response.funcionarios ?? []).map(mapEmployee));
      const nextCommandSettings = normalizeCommandSettings(response.configuracoes?.comandas);
      const nextExpenseSettings = normalizeExpenseSettings(response.configuracoes?.lancar_despesas);
      const nextEmployeeControlSettings = normalizeEmployeeControlSettings(response.configuracoes?.controle_funcionarios);
      const nextPaymentSettings = normalizePaymentSettings(response.configuracoes?.formas_pagamento);
      const syncedAt = new Date().toISOString();
      let fiscalSyncMessage = "";

      try {
        await synchronizeRemoteFiscalConfig(response.configuracoes?.fiscal);
      } catch (error) {
        fiscalSyncMessage = error instanceof Error ? error.message : "Não foi possível sincronizar o certificado fiscal.";
      }

      setCatalogCategories(nextCategories);
      setCatalogProducts(nextProducts);
      setAgreementClients(normalizeAgreementClients(nextAgreementClients));
      setAgreementReceipts((currentReceipts) => mergeAgreementReceipts(currentReceipts, nextAgreementReceipts));
      setEmployees(nextEmployees);
      setCommandSettings(nextCommandSettings);
      setExpenseSettings(nextExpenseSettings);
      setEmployeeControlSettings(nextEmployeeControlSettings);
      setPaymentSettings(nextPaymentSettings);
      setCartItems((currentItems) => mergeCartItemsWithCatalog(currentItems, nextProducts));
      setCommandEditor((currentEditor) =>
        currentEditor
          ? {
              ...currentEditor,
              items: mergeCartItemsWithCatalog(currentEditor.items, nextProducts)
            }
          : currentEditor
      );
      setCommands((currentCommands) =>
        currentCommands.map((command) => ({
          ...command,
          items: mergeCartItemsWithCatalog(command.items, nextProducts)
        }))
      );
      setCatalogSyncedAt(syncedAt);
      setCatalogError("");
      setCatalogSyncError(fiscalSyncMessage);
      onConnectivityChange("online");
      hasLoadedRemoteDataRef.current = true;

      if (options.showMessage) {
        onSystemMessage(fiscalSyncMessage || "Dados do PDV atualizados pela API.");
      }

      return true;
    } catch (error) {
      onConnectivityChange("offline");
      const message = error instanceof Error ? error.message : "Não foi possível carregar os produtos deste PDV.";
      setCatalogSyncError(message);

      if (!options.silent) {
        setCatalogError(message);
        onSystemMessage(message);
      }

      return false;
    } finally {
      setIsCatalogSyncing(false);

      if (!options.silent) {
        setIsCatalogLoading(false);
      }
    }
  }, [connectivity, deviceCredential, deviceId, onConnectivityChange, onSystemMessage, synchronizeRemoteFiscalConfig]);

  const openProductPicker = useCallback((nextSearchQuery = "") => {
    setSearchQuery(nextSearchQuery);
    setSelectedPickerCategoryId("all");
    setIsProductPickerOpen(true);

    if (connectivity === "online") {
      void refreshRemoteData({ silent: true });
    }
  }, [connectivity, refreshRemoteData]);

  const getRemoteShiftNumber = useCallback(async (date: Date) => {
    if (connectivity !== "online" || !deviceCredential || !deviceId) {
      return null;
    }

    try {
      return await fetchRemoteShiftNumber({
        date,
        deviceCredential,
        deviceId
      });
    } catch {
      return null;
    }
  }, [connectivity, deviceCredential, deviceId]);

  const resolvePreviewShiftNumber = useCallback(async () => {
    const now = new Date();
    const remoteShiftNumber = await getRemoteShiftNumber(now);

    return getPreviewShiftNumber(now, shiftSequenceScope, remoteShiftNumber);
  }, [getRemoteShiftNumber, shiftSequenceScope]);

  const runPdvSyncCycle = useCallback(async (options: { forceOnline?: boolean; retryFailed?: boolean } = {}) => {
    const store = getLocalPdvStore();
    const forceOnline = options.forceOnline ?? connectivity !== "online";
    const retryFailed = options.retryFailed ?? true;

    if (store?.retryFailedEvents && retryFailed) {
      try {
        const summary = await store.getSyncSummary({ scope: localStoreScope });

        if (summary.failed > 0) {
          const result = await store.retryFailedEvents({ scope: localStoreScope });
          setPendingSyncCount(result.pending);
          await refreshSyncSummary();
        }
      } catch (error) {
        console.warn("Não foi possível preparar falhas locais para reenvio.", error);
      }
    }

    const contingencySynced = await transmitPendingContingencyFiscalDocuments({ showMessage: false, forceOnline });
    const { eventsSynced, fiscalSynced } = await syncPendingOutboundQueues({ showMessage: false, forceOnline });
    const dataSynced = await refreshRemoteData({ silent: true, showMessage: false, forceOnline });

    let finalSummary: LocalPdvStoreSummary | null = null;

    try {
      finalSummary = store ? await store.getSyncSummary({ scope: localStoreScope }) : null;
    } catch {
      finalSummary = null;
    }

    await refreshSyncSummary();

    return {
      contingencySynced,
      dataSynced,
      eventsSynced,
      finalSummary,
      fiscalSynced
    };
  }, [
    connectivity,
    localStoreScope,
    refreshRemoteData,
    refreshSyncSummary,
    syncPendingOutboundQueues,
    transmitPendingContingencyFiscalDocuments
  ]);

  async function syncNow() {
    const forceOnline = connectivity !== "online";

    setIsManualSyncing(true);

    try {
      const result = await runPdvSyncCycle({ forceOnline, retryFailed: true });
      const hasQueueAfterSync = Boolean((result.finalSummary?.pending ?? 0) > 0 || (result.finalSummary?.failed ?? 0) > 0);
      const hasOutboundSync = result.eventsSynced || result.fiscalSynced || result.contingencySynced;

      if (result.dataSynced && !hasQueueAfterSync) {
        onSystemMessage("Sincronização concluída.");
      } else if (result.dataSynced && hasQueueAfterSync) {
        onSystemMessage("Dados recebidos. Ainda há itens locais pendentes de envio.");
      } else if (hasOutboundSync && !hasQueueAfterSync) {
        onSystemMessage("Envio concluído. Não foi possível atualizar os dados da API.");
      } else if (hasQueueAfterSync) {
        onSystemMessage("Sincronização parcial. A fila local continua salva neste computador.");
      } else {
        onSystemMessage("Não foi possível concluir a sincronização agora.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível sincronizar agora.";
      setEventSyncError(message);
      onSystemMessage(`Não foi possível sincronizar agora: ${message}`);
    } finally {
      setIsManualSyncing(false);
    }
  }

  async function ignoreFailedSyncEvent(eventId: string) {
    const store = getLocalPdvStore();
    const remainingEvents = failedSyncEvents.filter(event => event.id !== eventId);

    rememberIgnoredSyncFailure(localStoreScope, "event", eventId);
    setFailedSyncEvents(remainingEvents);
    setEventSyncError("");

    try {
      if (store?.ignoreEvents) {
        await store.ignoreEvents({ scope: localStoreScope, eventIds: [eventId] });
      }
    } catch (error) {
      if (!isMissingFiscalIpcHandlerError(error)) {
        console.warn("Não foi possível persistir o ignore do evento local.", error);
      }
    }

    await refreshSyncSummary();

    if (remainingEvents.length === 0 && failedFiscalDocuments.length === 0) {
      setIsSyncDetailsOpen(false);
    }

    onSystemMessage("Erro de sincronização ignorado.");
  }

  async function ignoreFailedFiscalDocument(documentId: string) {
    const store = getLocalPdvStore();
    const remainingDocuments = failedFiscalDocuments.filter(document => document.id !== documentId);

    rememberIgnoredSyncFailure(localStoreScope, "fiscalDocument", documentId);
    setFailedFiscalDocuments(remainingDocuments);
    setEventSyncError("");

    try {
      if (store?.ignoreFiscalDocuments) {
        await store.ignoreFiscalDocuments({ scope: localStoreScope, documentIds: [documentId] });
      }
    } catch (error) {
      if (!isMissingFiscalIpcHandlerError(error)) {
        console.warn("Não foi possível persistir o ignore do documento fiscal local.", error);
      }
    }

    await refreshSyncSummary();

    if (remainingDocuments.length === 0 && failedSyncEvents.length === 0) {
      setIsSyncDetailsOpen(false);
    }

    onSystemMessage("Erro fiscal ignorado.");
  }

  function startWaveHover(event: ReactPointerEvent<HTMLElement>, activeClassName: string) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();

    target.classList.remove(activeClassName);
    setWaveVariables(target, event.clientX - rect.left, event.clientY - rect.top, 34);

    window.requestAnimationFrame(() => {
      target.classList.add(activeClassName);
    });
  }

  function startWaveFocus(event: ReactFocusEvent<HTMLElement>, activeClassName: string) {
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();

    setWaveVariables(target, rect.width / 2, rect.height / 2, 34);
    target.classList.add(activeClassName);
  }

  function openSale() {
    if (!session) {
      return;
    }

    setCommandEditor(null);
    setCommandNameRequest(null);
    setCommandDeleteRequest(null);
    setCommandPaymentRequest(null);
    setView("sale");
    onSystemMessage("");
  }

  function addProduct(product: Product) {
    const fiscalBlockMessage = isFiscalEmissionEnabled ? getProductFiscalBlockMessage(product) : "";

    if (fiscalBlockMessage) {
      onSystemMessage(`${fiscalBlockMessage} Complete o fiscal antes de vender.`);
      return;
    }

    const stockLimit = getControlledStockLimit(product);
    const existingItem = cartItems.find((item) => item.id === product.id);

    if (stockLimit !== null && stockLimit <= 0) {
      onSystemMessage(`Sem estoque disponível para ${product.name}.`);
      return;
    }

    if (existingItem && stockLimit !== null && existingItem.quantity >= stockLimit) {
      onSystemMessage(getStockLimitMessage(product));
      return;
    }

    setCartItems((currentItems) => {
      const currentItem = currentItems.find((item) => item.id === product.id);

      if (currentItem) {
        return currentItems.map((item) =>
          item.id === product.id ? { ...item, quantity: clampCartQuantity(item.quantity + 1, item) } : item
        );
      }

      return [...currentItems, { ...product, quantity: 1 }];
    });
    setSearchQuery("");
    setIsProductPickerOpen(false);
    onSystemMessage("");
  }

  function decreaseItem(productId: string) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) => (item.id === productId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item))
        .filter((item) => item.quantity > 0)
    );
    onSystemMessage("");
  }

  function increaseItem(productId: string) {
    const itemToIncrease = cartItems.find((item) => item.id === productId);

    if (!itemToIncrease) {
      return;
    }

    const stockLimit = getControlledStockLimit(itemToIncrease);

    if (stockLimit !== null && itemToIncrease.quantity >= stockLimit) {
      onSystemMessage(getStockLimitMessage(itemToIncrease));
      return;
    }

    setCartItems((currentItems) =>
      currentItems.map((item) =>
        item.id === productId ? { ...item, quantity: clampCartQuantity(item.quantity + 1, item) } : item
      )
    );
    onSystemMessage("");
  }

  function removeItem(productId: string) {
    setCartItems((currentItems) => currentItems.filter((item) => item.id !== productId));
    onSystemMessage("");
  }

  function clearSale() {
    setCartItems([]);
    setSearchQuery("");
  }

  function requestCommandFromSale() {
    if (!isCommandsEnabled) {
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (cartItems.length === 0) {
      onSystemMessage("Adicione produtos antes de criar uma comanda.");
      return;
    }

    setCommandNameRequest({ source: "sale" });
  }

  function requestNewCommand() {
    if (!isCommandsEnabled) {
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    setCommandEditor({
      mode: "create",
      title: "",
      items: []
    });
    setSearchQuery("");
    setSelectedPickerCategoryId("all");
    setView("command-editor");
    onSystemMessage("");
  }

  function confirmCommandName(title: string) {
    if (!commandNameRequest) {
      return;
    }

    if (!isCommandsEnabled) {
      setCommandNameRequest(null);
      setCommandEditor(null);
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (commandNameRequest.source === "sale") {
      if (cartItems.length === 0) {
        onSystemMessage("Adicione produtos antes de criar uma comanda.");
        setCommandNameRequest(null);
        return;
      }

      const nextCommand: CommandRecord = {
        id: createId("comanda"),
        title,
        createdAt: new Date().toISOString(),
        items: cartItems
      };

      setCommands((currentCommands) => [nextCommand, ...currentCommands]);
      clearSale();
      setView("commands");
      onSystemMessage(`${title} criada para receber depois.`);
      setCommandNameRequest(null);
      return;
    }

    if (!commandEditor || commandEditor.items.length === 0) {
      onSystemMessage("Adicione produtos antes de salvar a comanda.");
      setCommandNameRequest(null);
      return;
    }

    const nextCommand: CommandRecord = {
      id: createId("comanda"),
      title,
      createdAt: new Date().toISOString(),
      items: commandEditor.items
    };

    setCommands((currentCommands) => [nextCommand, ...currentCommands]);
    setCommandEditor(null);
    setSearchQuery("");
    setSelectedPickerCategoryId("all");
    setView("commands");
    onSystemMessage(`${title} criada para receber depois.`);
    setCommandNameRequest(null);
  }

  function editCommand(command: CommandRecord) {
    if (!isCommandsEnabled) {
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    setCommandEditor({
      mode: "edit",
      commandId: command.id,
      title: command.title,
      items: command.items
    });
    setSearchQuery("");
    setSelectedPickerCategoryId("all");
    setView("command-editor");
    onSystemMessage("");
  }

  function finalizeCommand(command: CommandRecord) {
    if (!isCommandsEnabled) {
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (command.items.length === 0) {
      onSystemMessage("Adicione produtos antes de finalizar a comanda.");
      return;
    }

    setCommandPaymentRequest(command);
    setIsPaymentOpen(true);
    onSystemMessage("");
  }

  function closeCommandEditor() {
    setCommandEditor(null);
    setSearchQuery("");
    setSelectedPickerCategoryId("all");
    setView(isCommandsEnabled ? "commands" : session ? "sale" : "menu");
    onSystemMessage("");
  }

  function persistEditedCommand(commandId: string, title: string, items: CartItem[]) {
    setCommands((currentCommands) =>
      currentCommands.map((command) =>
        command.id === commandId ? { ...command, title: title.trim() ? title : command.title, items } : command
      )
    );
  }

  function applyCommandEditorDraft(nextEditor: CommandEditorState) {
    setCommandEditor(nextEditor);

    if (nextEditor.mode === "edit" && nextEditor.commandId) {
      persistEditedCommand(nextEditor.commandId, nextEditor.title, nextEditor.items);
    }
  }

  function saveCommandEditor() {
    if (!isCommandsEnabled) {
      setCommandEditor(null);
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (!commandEditor) {
      return;
    }

    const commandTitle = commandEditor.title.trim();

    if (commandEditor.mode === "edit" && !commandTitle) {
      onSystemMessage("Informe o nome da comanda antes de salvar.");
      return;
    }

    if (commandEditor.items.length === 0) {
      onSystemMessage("Adicione produtos antes de salvar a comanda.");
      return;
    }

    if (commandEditor.mode === "edit" && commandEditor.commandId) {
      setCommands((currentCommands) =>
        currentCommands.map((command) =>
          command.id === commandEditor.commandId
            ? { ...command, title: commandTitle, items: commandEditor.items }
            : command
        )
      );
      onSystemMessage(`${commandTitle} atualizada.`);
      setCommandEditor(null);
      setSearchQuery("");
      setSelectedPickerCategoryId("all");
      setView("commands");
      return;
    }

    setCommandNameRequest({ source: "command-editor" });
  }

  function requestDeleteCommand() {
    if (!isCommandsEnabled) {
      setCommandEditor(null);
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (!commandEditor || commandEditor.mode !== "edit" || !commandEditor.commandId) {
      return;
    }

    setCommandDeleteRequest({
      id: commandEditor.commandId,
      title: commandEditor.title.trim() || "Comanda",
      itemsCount: commandEditor.items.length,
      totalCents: getCartTotal(commandEditor.items)
    });
  }

  function finalizeEditedCommand() {
    if (!isCommandsEnabled) {
      setCommandEditor(null);
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (!commandEditor || commandEditor.mode !== "edit" || !commandEditor.commandId) {
      return;
    }

    const commandTitle = commandEditor.title.trim();

    if (!commandTitle) {
      onSystemMessage("Informe o nome da comanda antes de finalizar.");
      return;
    }

    if (commandEditor.items.length === 0) {
      onSystemMessage("Adicione produtos antes de finalizar a comanda.");
      return;
    }

    const updatedCommand: CommandRecord = {
      id: commandEditor.commandId,
      title: commandTitle,
      createdAt: commands.find((command) => command.id === commandEditor.commandId)?.createdAt ?? new Date().toISOString(),
      items: commandEditor.items
    };

    setCommands((currentCommands) =>
      currentCommands.map((command) => (command.id === updatedCommand.id ? updatedCommand : command))
    );
    setCommandEditor((currentEditor) =>
      currentEditor ? { ...currentEditor, title: commandTitle, items: commandEditor.items } : currentEditor
    );
    finalizeCommand(updatedCommand);
  }

  async function getActiveLocalFiscalConfig() {
    const store = getLocalPdvStore();

    if (!store?.getFiscalConfig) {
      setIsFiscalEmissionEnabled(false);
      return null;
    }

    const fiscalConfig = await store.getFiscalConfig({ scope: localStoreScope });
    const config = asRecord(fiscalConfig);
    const isActive = isFiscalEmissionActiveConfig(config);

    setIsFiscalEmissionEnabled(isActive);

    return isActive ? config : null;
  }

  async function openFiscalDispatchForSale(sale: SaleRecord, activeSession: CashierSession) {
    const config = await getActiveLocalFiscalConfig();

    if (!config) {
      return;
    }

    const blockedItem = sale.items.find((item) => getProductFiscalIssues(item).length > 0);

    if (blockedItem) {
      const message = `${getProductFiscalBlockMessage(blockedItem)} Complete o fiscal antes de emitir.`;

      setCompletedSale(null);
      setFiscalEmissionModal({
        tone: "error",
        title: "Falha na emissão fiscal",
        message: "Venda concluída.",
        detail: message,
        sale,
        fiscalModel: getSaleStoredFiscalModel(sale)
      });
      onSystemMessage(message);
      return;
    }

    setCompletedSale(null);
    await emitFiscalDocumentForSale(sale, activeSession, { config, silentWhenDisabled: true });
  }

  function buildFiscalDocumentPayload(sale: SaleRecord, activeSession: CashierSession, config: Record<string, unknown>) {
    const agreementClient = sale.clienteConvenioId
      ? activeAgreementClients.find((client) => client.id === sale.clienteConvenioId) ?? null
      : null;
    const clientPersonType = sale.clienteConvenioTipoPessoa ?? agreementClient?.personType ?? "fisica";
    const clientFiscalData = asRecord(sale.clienteConvenioDadosFiscais) ?? asRecord(agreementClient?.fiscalData) ?? null;
    const fiscalModel: FiscalModel = sale.paymentMethod === "convenio" && clientPersonType === "juridica" ? "55" : "65";
    const modelConfig = getFiscalModelConfig(config, fiscalModel);
    const serieFiscal = Number(modelConfig.serie) || getPdvFiscalSeriesValue(config) || null;
    const fiscalIssuedAt = new Date().toISOString();
    const itens = sale.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      priceCents: item.priceCents,
      totalPriceCents: item.priceCents * item.quantity,
      barcode: item.barcode,
      ncm: normalizeProductNcm(item.ncm),
      fiscal: item.fiscal ?? null
    }));

    return {
      vendaId: sale.id,
      modelo: fiscalModel,
      serie: serieFiscal,
      numero: Number(modelConfig.proximo_numero ?? modelConfig.proximoNumero ?? modelConfig.ultimoNumero ?? modelConfig.ultimo_numero) || null,
      paymentMethod: sale.paymentMethod,
      totalCents: sale.totalCents,
      createdAt: fiscalIssuedAt,
      issuedAt: fiscalIssuedAt,
      emittedAt: fiscalIssuedAt,
      dhEmi: fiscalIssuedAt,
      itens,
      ...(fiscalModel === "55" ? { destinatario: clientFiscalData } : {}),
      session: activeSession,
      sale: {
        ...sale,
        clienteConvenioTipoPessoa: clientPersonType,
        clienteConvenioDadosFiscais: clientFiscalData,
        items: itens
      }
    };
  }

  function showFiscalEmissionResult(
    sale: SaleRecord,
    response: {
      success?: boolean;
      status?: string;
      friendlyMessage?: string;
      technicalMessage?: string | null;
      data?: unknown;
      logPath?: string;
    }
  ) {
    const status = String(response.status || "");
    const data = asRecord(response.data) ?? {};
    const fiscalModel: FiscalModel = data.modelo === "55" ? "55" : getSaleStoredFiscalModel(sale);
    const fiscalLabel = getFiscalModelLabel(fiscalModel);
    const documentId = typeof data.documentId === "string" ? data.documentId : null;
    const operatorMessage = typeof data.mensagemOperador === "string" && data.mensagemOperador.trim()
      ? data.mensagemOperador
      : response.friendlyMessage;
    const fiscalNumber = Number(data.numero);
    const fiscalStatus = typeof data.xMotivo === "string" ? data.xMotivo : typeof data.cStat === "number" ? String(data.cStat) : status;
    const fiscalCode = Number(data.cStat);
    const fiscalProtocol = typeof data.protocolo === "string" ? data.protocolo : null;
    const fiscalKey = typeof data.chave === "string" ? data.chave : null;
    const xmlPath = typeof data.xmlAutorizadoPath === "string"
      ? data.xmlAutorizadoPath
      : typeof data.xmlPath === "string"
        ? data.xmlPath
        : null;
    const approvedXmlPath = response.success ? xmlPath : null;
    const isContingencyEmission = status === "contingencia_emitida" ||
      data.contingencia === true ||
      data.tpEmis === "9";
    const isDuplicateFiscalNumber = fiscalCode === 204 ||
      fiscalCode === 539 ||
      status.includes("duplicidade") ||
      /duplicidade\s+de\s+nf-e/i.test(`${operatorMessage || ""} ${fiscalStatus || ""}`);

    if (status === "pendente") {
      setFiscalEmissionModal({
        tone: "queued",
        title: `${fiscalLabel} pendente`,
        message: "Emissão pendente",
        detail: operatorMessage || "Abra os detalhes da venda para tentar novamente.",
        sale,
        documentId,
        fiscalNumber: Number.isFinite(fiscalNumber) ? fiscalNumber : null,
        fiscalStatus,
        fiscalProtocol,
        fiscalKey,
        fiscalModel,
        xmlPath: null,
        logPath: response.logPath ?? null
      });
      return;
    }

    if (response.success) {
      if (isContingencyEmission) {
        setFiscalEmissionModal({
          tone: "queued",
          title: `${fiscalLabel} em contingência`,
          message: "Salva em contingência",
          detail: "Transmita quando a conexão voltar.",
          sale,
          documentId,
          fiscalNumber: Number.isFinite(fiscalNumber) ? fiscalNumber : null,
          fiscalStatus: "contingencia_emitida",
          fiscalProtocol: null,
          fiscalKey,
          fiscalModel,
          xmlPath: approvedXmlPath,
          logPath: response.logPath ?? null
        });
        return;
      }

      setFiscalEmissionModal({
        tone: "success",
        title: `${fiscalLabel} autorizada`,
        message: approvedXmlPath ? "Autorizada pela SEFAZ" : "Autorizada sem DANFE disponível",
        detail: null,
        sale,
        documentId,
        fiscalNumber: Number.isFinite(fiscalNumber) ? fiscalNumber : null,
        fiscalStatus,
        fiscalProtocol,
        fiscalKey,
        fiscalModel,
        xmlPath: approvedXmlPath,
        logPath: response.logPath ?? null
      });
      return;
    }

    if (status.includes("pendente") || status.includes("adapter")) {
      setFiscalEmissionModal({
        tone: "queued",
        title: "Emissão fiscal pendente",
        message: response.friendlyMessage || "A venda foi concluída, mas a transmissão fiscal ainda não foi autorizada.",
        detail: operatorMessage || "Abra os detalhes da venda para tentar novamente.",
        sale,
        documentId,
        fiscalNumber: Number.isFinite(fiscalNumber) ? fiscalNumber : null,
        fiscalStatus,
        fiscalProtocol,
        fiscalKey,
        fiscalModel,
        xmlPath: null,
        logPath: response.logPath ?? null
      });
      return;
    }

    setFiscalEmissionModal({
      tone: "error",
      title: "Falha na emissão fiscal",
      message: isDuplicateFiscalNumber
        ? "Numeração já utilizada na SEFAZ."
        : operatorMessage || `Não foi possível emitir a ${fiscalLabel}.`,
      detail: isDuplicateFiscalNumber
        ? "A próxima numeração foi ajustada automaticamente. Tente novamente pelos detalhes da venda."
        : fiscalStatus && fiscalStatus !== status && fiscalStatus !== operatorMessage
          ? fiscalStatus
          : "Abra os detalhes da venda para tentar novamente.",
      sale,
      documentId,
      fiscalNumber: Number.isFinite(fiscalNumber) ? fiscalNumber : null,
      fiscalStatus,
      fiscalProtocol,
      fiscalKey,
      fiscalModel,
      xmlPath: null,
      logPath: response.logPath ?? null
    });
  }

  function getFiscalResponseXmlPath(response: { success?: boolean; data?: unknown }) {
    const data = asRecord(response.data) ?? {};
    const xmlPath = typeof data.xmlAutorizadoPath === "string"
      ? data.xmlAutorizadoPath
      : typeof data.xmlPath === "string"
        ? data.xmlPath
        : null;

    return response.success && xmlPath ? xmlPath : null;
  }

  async function callFiscalDanfePrint({
    sale,
    documentId,
    xmlPath,
    command,
    config,
    payload
  }: {
    sale: SaleRecord;
    documentId?: string | null;
    xmlPath: string;
    command: "imprimir-danfe" | "reimprimir-danfe";
    config?: Record<string, unknown> | null;
    payload?: Record<string, unknown>;
  }): Promise<FiscalWorkerResponse | null> {
    const store = getLocalPdvStore();

    if (!isFiscalEmissionEnabled || !store?.getFiscalConfig || !store.callFiscalWorker) {
      return null;
    }

    const fiscalConfig = config ?? asRecord(await store.getFiscalConfig({ scope: localStoreScope })) ?? {};
    const fiscalModel: FiscalModel = payload?.modelo === "55" ? "55" : getSaleStoredFiscalModel(sale);
    const printPayload = {
      vendaId: sale.id,
      xmlPath,
      modelo: fiscalModel,
      ...(payload ?? {}),
      contingencia: isFiscalDocumentContingencyPrint({
        status: String(payload?.fiscalStatus ?? payload?.status ?? ""),
        xmlPath,
        raw_result: {
          data: payload ?? {}
        }
      })
    };

    return store.callFiscalWorker({
      scope: localStoreScope,
      command,
      documentId: documentId || createId("documento-fiscal"),
      config: fiscalConfig,
      payload: printPayload
    });
  }

  async function printFiscalDocumentAfterEmission(
    sale: SaleRecord,
    response: {
      success?: boolean;
      status?: string;
      friendlyMessage?: string;
      data?: unknown;
    },
    config: Record<string, unknown>
  ) {
    const data = asRecord(response.data) ?? {};
    const xmlPath = getFiscalResponseXmlPath(response);

    if (!xmlPath || fiscalPrintingLockRef.current) {
      return;
    }

    const documentId = typeof data.documentId === "string" ? data.documentId : null;

    fiscalPrintingLockRef.current = true;
    setFiscalPrintMode("initial");
    setIsFiscalPrinting(true);

    try {
      const printResponse = await callFiscalDanfePrint({
        sale,
        documentId,
        xmlPath,
        command: "imprimir-danfe",
        config,
        payload: {
          fiscalStatus: response.status,
          modelo: data.modelo || "65",
          serie: data.serie,
          numero: data.numero,
          chave: data.chave,
          tpEmis: data.tpEmis,
          contingencia: data.contingencia === true
        }
      });

      if (!printResponse?.success) {
        setFiscalEmissionModal(current => current?.sale.id === sale.id
          ? {
              ...current,
              detail: printResponse?.friendlyMessage || "Documento fiscal emitido, mas a impressão automática não foi concluída."
            }
          : current);
      }
    } catch (error) {
      setFiscalEmissionModal(current => current?.sale.id === sale.id
        ? {
            ...current,
            detail: "Documento fiscal emitido, mas a impressão automática não foi concluída."
          }
        : current);
    } finally {
      fiscalPrintingLockRef.current = false;
      setFiscalPrintMode(null);
      setIsFiscalPrinting(false);
    }
  }

  async function emitFiscalDocumentForSale(
    sale: SaleRecord,
    activeSession: CashierSession,
    options: { config?: Record<string, unknown>; silentWhenDisabled?: boolean } = {}
  ) {
    const store = getLocalPdvStore();

    if (!store?.getFiscalConfig || !store.callFiscalWorker) {
      return;
    }

    try {
      const config = options.config ?? await getActiveLocalFiscalConfig();

      if (!config) {
        setFiscalEmissionModal(null);

        if (!options.silentWhenDisabled) {
          onSystemMessage("Emissão fiscal desativada neste PDV.");
        }

        return;
      }

      const payload = buildFiscalDocumentPayload(sale, activeSession, config);
      const fiscalModel: FiscalModel = payload.modelo === "55" ? "55" : "65";
      const fiscalLabel = getFiscalModelLabel(fiscalModel);

      setFiscalEmissionModal({
        tone: "pending",
        title: connectivity === "online" ? `Emitindo ${fiscalLabel}` : `Emitindo ${fiscalLabel} em contingência`,
        message: connectivity === "online" ? "Aguardando SEFAZ" : "Preparando contingência",
        detail: null,
        sale,
        documentId: null,
        fiscalNumber: null,
        fiscalStatus: null,
        fiscalProtocol: null,
        fiscalKey: null,
        fiscalModel,
        xmlPath: null,
        logPath: null
      });

      const documentId = createId("documento-fiscal");
      const command = connectivity === "online"
        ? fiscalModel === "55" ? "emitir-nfe" : "emitir-nfce"
        : fiscalModel === "55" ? "emitir-nfe-contingencia" : "emitir-nfce-contingencia";
      const response = await store.callFiscalWorker({
        scope: localStoreScope,
        command,
        documentId,
        config,
        payload: command.endsWith("-contingencia")
          ? {
              ...payload,
              motivoContingencia: "PDV operando sem comunicação com a SEFAZ"
            }
          : payload
      });
      const responseData = asRecord(response.data) ?? {};
      const emissionResponse = {
        ...response,
        data: {
          ...responseData,
          documentId
        }
      };

      showFiscalEmissionResult(sale, emissionResponse);
      void printFiscalDocumentAfterEmission(sale, emissionResponse, config);
      setFiscalDocumentsRefreshToken((current) => current + 1);
      void syncPendingOutboundQueues({ showMessage: false });
    } catch (error) {
      setFiscalEmissionModal({
        tone: "error",
        title: "Falha na emissão fiscal",
        message: "A venda foi concluída, mas o PDV não conseguiu chamar o fluxo fiscal.",
        detail: "Verifique a configuração fiscal local e tente emitir novamente pelos detalhes da venda.",
        sale,
        fiscalModel: getSaleStoredFiscalModel(sale)
      });
      setFiscalDocumentsRefreshToken((current) => current + 1);
    }
  }

  async function cancelFiscalDocumentsForSale(sale: SaleRecord, canceledAt: string) {
    const store = getLocalPdvStore();

    if (!isFiscalEmissionEnabled || !store?.callFiscalWorker || !store.listFiscalDocuments) {
      return;
    }

    try {
      const config = await getActiveLocalFiscalConfig();

      if (!config) {
        return;
      }

      const documents = dedupeFiscalDocuments(await store.listFiscalDocuments({
        scope: localStoreScope,
        vendaId: sale.id,
        limit: 50
      }));
      const cancelableDocuments = getCancelableFiscalDocuments(documents);

      if (cancelableDocuments.length === 0) {
        return;
      }

      let canceledCount = 0;
      let failedCount = 0;

      for (const document of cancelableDocuments) {
        const documentId = createId("documento-fiscal");
        const fiscalModel: FiscalModel = document.modelo === "55" ? "55" : "65";
        const response = await store.callFiscalWorker({
          scope: localStoreScope,
          command: "cancelar",
          documentId,
          config,
          payload: {
            documentId,
            vendaId: sale.id,
            modelo: fiscalModel,
            serie: document.serie,
            numero: document.numero,
            chave: document.chave,
            protocolo: document.protocolo,
            xmlPath: getFiscalDocumentXmlPath(document),
            justificativa: "Cancelamento da venda no PDV Caixa Agil.",
            canceledAt,
            sale
          }
        });

        if (response.success) {
          canceledCount += 1;
        } else {
          failedCount += 1;
        }
      }

      setFiscalDocumentsRefreshToken((current) => current + 1);
      void syncPendingOutboundQueues({ showMessage: false });

      if (failedCount > 0) {
        onSystemMessage("Venda cancelada, mas o cancelamento fiscal precisa de atenção nos detalhes da venda.");
        return;
      }

      if (canceledCount > 0) {
        onSystemMessage(canceledCount === 1 ? "Venda cancelada e NF cancelada." : "Venda cancelada e notas fiscais canceladas.");
      }
    } catch (error) {
      console.warn("Não foi possível cancelar a NF da venda.", error);
      onSystemMessage("Venda cancelada, mas não foi possível cancelar a NF automaticamente.");
      setFiscalDocumentsRefreshToken((current) => current + 1);
    }
  }

  async function printFiscalDocumentFromModal() {
    if (fiscalPrintingLockRef.current) {
      return;
    }

    const state = fiscalEmissionModal;

    if (!state?.xmlPath) {
      return;
    }

    fiscalPrintingLockRef.current = true;
    setFiscalPrintMode("reprint");
    setIsFiscalPrinting(true);

    try {
      const response = await callFiscalDanfePrint({
        sale: state.sale,
        documentId: state.documentId,
        xmlPath: state.xmlPath,
        command: "reimprimir-danfe",
        payload: {
          fiscalStatus: state.fiscalStatus,
          modelo: state.fiscalModel ?? getSaleStoredFiscalModel(state.sale)
        }
      });

      setFiscalEmissionModal(current => current
        ? {
            ...current,
            detail: response?.success
              ? "DANFE reenviado para impressão."
              : response?.friendlyMessage || current.detail || "Não foi possível reimprimir o DANFE."
          }
        : current);
    } catch (error) {
      setFiscalEmissionModal(current => current
        ? {
            ...current,
            detail: "Não foi possível reimprimir o DANFE."
          }
        : current);
    } finally {
      fiscalPrintingLockRef.current = false;
      setFiscalPrintMode(null);
      setIsFiscalPrinting(false);
    }
  }

  async function reprintFiscalDocumentFromDetails(sale: SaleRecord, document: FiscalDocumentRecord) {
    const store = getLocalPdvStore();
    const xmlPath = getFiscalDocumentXmlPath(document);

    if (!isFiscalEmissionEnabled) {
      onSystemMessage("Emissão fiscal desativada neste PDV.");
      return;
    }

    if (!xmlPath || !store?.getFiscalConfig || !store.callFiscalWorker) {
      onSystemMessage("XML autorizado indisponível para reimpressão.");
      return;
    }

    setReprintingFiscalDocumentId(document.id);

    try {
      const fiscalConfig = await store.getFiscalConfig({ scope: localStoreScope });
      const config = asRecord(fiscalConfig) ?? {};
      const response = await store.callFiscalWorker({
        scope: localStoreScope,
        command: "reimprimir-danfe",
        documentId: document.id,
        config,
        payload: {
          vendaId: sale.id,
          xmlPath,
          modelo: document.modelo || "65",
          serie: document.serie,
          numero: document.numero,
          chave: document.chave,
          contingencia: isFiscalDocumentContingencyPrint(document)
        }
      });

      if (response.success) {
        onSystemMessage("DANFE enviado para reimpressão.");
      } else {
        onSystemMessage(response.friendlyMessage || "Não foi possível reimprimir o DANFE.");
      }

      setFiscalDocumentsRefreshToken((current) => current + 1);
    } catch (error) {
      onSystemMessage(error instanceof Error ? error.message : "Não foi possível reimprimir o DANFE.");
    } finally {
      setReprintingFiscalDocumentId(null);
    }
  }

  function confirmDeleteCommand() {
    if (!commandDeleteRequest) {
      return;
    }

    if (!isCommandsEnabled) {
      setCommandDeleteRequest(null);
      setCommandEditor(null);
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    setCommands((currentCommands) => currentCommands.filter((command) => command.id !== commandDeleteRequest.id));
    setCommandEditor(null);
    setCommandDeleteRequest(null);
    setSearchQuery("");
    setSelectedPickerCategoryId("all");
    setView("commands");
    onSystemMessage(`${commandDeleteRequest.title} excluída.`);
  }

  function addProductToCommandEditor(product: Product) {
    if (!isCommandsEnabled || !commandEditor) {
      return;
    }

    const fiscalBlockMessage = isFiscalEmissionEnabled ? getProductFiscalBlockMessage(product) : "";

    if (fiscalBlockMessage) {
      onSystemMessage(`${fiscalBlockMessage} Complete o fiscal antes de vender.`);
      return;
    }

    const stockLimit = getControlledStockLimit(product);
    const existingItem = commandEditor.items.find((item) => item.id === product.id);

    if (stockLimit !== null && stockLimit <= 0) {
      onSystemMessage(`Sem estoque disponível para ${product.name}.`);
      return;
    }

    if (existingItem && stockLimit !== null && existingItem.quantity >= stockLimit) {
      onSystemMessage(getStockLimitMessage(product));
      return;
    }

    const items = existingItem
      ? commandEditor.items.map((item) =>
          item.id === product.id ? { ...item, quantity: clampCartQuantity(item.quantity + 1, item) } : item
        )
      : [...commandEditor.items, { ...product, quantity: 1 }];

    applyCommandEditorDraft({ ...commandEditor, items });
    setSearchQuery("");
    setIsProductPickerOpen(false);
    onSystemMessage("");
  }

  function decreaseCommandItem(productId: string) {
    if (!isCommandsEnabled || !commandEditor) {
      return;
    }

    const items = commandEditor.items
      .map((item) => (item.id === productId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item))
      .filter((item) => item.quantity > 0);

    applyCommandEditorDraft({ ...commandEditor, items });
    onSystemMessage("");
  }

  function increaseCommandItem(productId: string) {
    if (!isCommandsEnabled || !commandEditor) {
      return;
    }

    const currentEditor = commandEditor;
    const itemToIncrease = currentEditor.items.find((item) => item.id === productId);

    if (!itemToIncrease) {
      return;
    }

    const stockLimit = getControlledStockLimit(itemToIncrease);

    if (stockLimit !== null && itemToIncrease.quantity >= stockLimit) {
      onSystemMessage(getStockLimitMessage(itemToIncrease));
      return;
    }

    const items = currentEditor.items.map((item) =>
      item.id === productId ? { ...item, quantity: clampCartQuantity(item.quantity + 1, item) } : item
    );

    applyCommandEditorDraft({ ...currentEditor, items });
    onSystemMessage("");
  }

  function confirmPayment(method: PaymentMethod, agreementClient: AgreementClient | null = null) {
    const sourceCommand = commandPaymentRequest;
    const sourceItems = sourceCommand?.items ?? cartItems;
    const sourceTotalCents = getCartTotal(sourceItems);
    const convenioClient = method === "convenio" &&
      agreementClient?.active === true &&
      activeAgreementClients.some((client) => client.id === agreementClient.id)
      ? agreementClient
      : null;

    if (!session || sourceItems.length === 0) {
      return;
    }

    if (sourceCommand && !isCommandsEnabled) {
      setCommandPaymentRequest(null);
      setIsPaymentOpen(false);
      setIsCashPaymentOpen(false);
      setIsAgreementPaymentOpen(false);
      setView("sale");
      onSystemMessage("Comandas desativadas neste PDV.");
      return;
    }

    if (method === "convenio" && !convenioClient) {
      onSystemMessage("Selecione o cliente do convênio antes de concluir a venda.");
      setIsAgreementPaymentOpen(true);
      return;
    }

    if (isFiscalEmissionEnabled) {
      const blockedItem = sourceItems.find((item) => getProductFiscalIssues(item).length > 0);

      if (blockedItem) {
        onSystemMessage(`${getProductFiscalBlockMessage(blockedItem)} Complete o fiscal antes de concluir a venda.`);
        return;
      }
    }

    const nextSale: SaleRecord = {
      id: createId("venda"),
      createdAt: new Date().toISOString(),
      sessionId: session.id,
      items: sourceItems,
      paymentMethod: method,
      totalCents: sourceTotalCents,
      originCommandTitle: sourceCommand?.title ?? null,
      clienteConvenioId: convenioClient?.id ?? null,
      clienteConvenioTipoPessoa: convenioClient?.personType ?? null,
      clienteConvenioDadosFiscais: convenioClient?.fiscalData ?? null,
      clientName: convenioClient?.name ?? null
    };

    setSales((currentSales) => [nextSale, ...currentSales]);
    if (convenioClient?.allowFrontPayment) {
      setAgreementReceipts((currentReceipts) =>
        mergeAgreementReceipts(currentReceipts, [buildAgreementReceiptFromSale(nextSale, convenioClient)])
      );
    }
    setCatalogProducts((currentProducts) =>
      currentProducts.map((product) => {
        const soldItem = sourceItems.find((item) => item.id === product.id);

        if (!soldItem || product.stockQuantity === null) {
          return product;
        }

        return {
          ...product,
          stockQuantity: product.stockQuantity - soldItem.quantity
        };
      })
    );
    if (sourceCommand) {
      setCommands((currentCommands) => currentCommands.filter((command) => command.id !== sourceCommand.id));
      setCommandEditor((currentEditor) => (currentEditor?.commandId === sourceCommand.id ? null : currentEditor));
      setCommandPaymentRequest(null);
    } else {
      clearSale();
    }
    setIsPaymentOpen(false);
    setIsAgreementPaymentOpen(false);
    setCompletedSale(nextSale);
    setView("sale");
    onSystemMessage("");
    enqueueLocalEvent("venda_concluida", "venda", nextSale.id, {
      session,
      sale: nextSale,
      origem: sourceCommand ? "comanda" : "caixa",
      origemComandaNome: sourceCommand?.title ?? null,
      clienteConvenioId: convenioClient?.id ?? null,
      clienteConvenioNome: convenioClient?.name ?? null,
      clienteConvenioTipoPessoa: convenioClient?.personType ?? null,
      clienteConvenioDadosFiscais: convenioClient?.fiscalData ?? null
    });
    void openFiscalDispatchForSale(nextSale, session);
  }

  function requestCancelSale(sale: SaleRecord) {
    if (isSaleCanceled(sale)) {
      return;
    }

    setSelectedSale(null);
    setSaleCancelRequest(sale);
  }

  function confirmCancelSale() {
    if (!saleCancelRequest) {
      return;
    }

    const canceledSale = saleCancelRequest;

    if (isSaleCanceled(canceledSale)) {
      setSaleCancelRequest(null);
      return;
    }

    const canceledAt = new Date().toISOString();
    const nextCanceledSale: SaleRecord = {
      ...canceledSale,
      status: "canceled",
      canceledAt
    };

    setSales((currentSales) => currentSales.map((sale) => (sale.id === canceledSale.id ? nextCanceledSale : sale)));
    setCatalogProducts((currentProducts) =>
      currentProducts.map((product) => {
        const soldItem = canceledSale.items.find((item) => item.id === product.id);

        if (!soldItem || product.stockQuantity === null) {
          return product;
        }

        return {
          ...product,
          stockQuantity: product.stockQuantity + soldItem.quantity
        };
      })
    );
    setSaleCancelRequest(null);
    onSystemMessage("Venda cancelada.");
    enqueueLocalEvent("venda_cancelada", "venda", canceledSale.id, {
      session,
      sale: nextCanceledSale,
      canceledAt,
      origem: canceledSale.originCommandTitle ? "comanda" : "caixa",
      origemComandaNome: canceledSale.originCommandTitle ?? null
    });
    void cancelFiscalDocumentsForSale(nextCanceledSale, canceledAt);
  }

  function closePaymentFlow() {
    setIsPaymentOpen(false);
    setIsCashPaymentOpen(false);
    setCashPaymentTarget("sale");
    setIsAgreementPaymentOpen(false);
    setAgreementReceiptDetailsClient(null);
    setAgreementReceiptPaymentRequest(null);
    setCommandPaymentRequest(null);
  }

  function requestPaymentConfirmation(method: PaymentMethod) {
    if (!paymentSettings[method]) {
      onSystemMessage("Essa forma de pagamento está desativada nas configurações do PDV.");
      closePaymentFlow();
      return;
    }

    if (method === "dinheiro") {
      setCashPaymentTarget("sale");
      setIsPaymentOpen(false);
      setIsCashPaymentOpen(true);
      return;
    }

    if (method === "convenio") {
      if (activeAgreementClients.length === 0) {
        onSystemMessage("Cadastre um cliente de convênio antes de usar essa forma de pagamento.");
        closePaymentFlow();
        return;
      }

      setIsPaymentOpen(false);
      setIsAgreementPaymentOpen(true);
      return;
    }

    confirmPayment(method);
  }

  function confirmAgreementReceiptPayment(
    method: ReceiptPaymentMethod,
    paymentRequest: AgreementReceiptPaymentRequest | null = agreementReceiptPaymentRequest
  ) {
    if (!session || !paymentRequest || paymentRequest.receipts.length === 0) {
      return;
    }

    const receivedAt = new Date().toISOString();
    const selectedIds = new Set(paymentRequest.receipts.map((receipt) => receipt.id));
    const nextReceipts = paymentRequest.receipts.map<AgreementReceiptRecord>((receipt) => ({
      ...receipt,
      status: "pago",
      paymentMethod: method,
      receivedSessionId: session.id,
      receivedAt
    }));
    const nextReceiptById = new Map(nextReceipts.map((receipt) => [receipt.id, receipt]));
    const totalCents = nextReceipts.reduce((total, receipt) => total + receipt.totalCents, 0);
    const itemsCount = nextReceipts.reduce((total, receipt) => total + receipt.itemsCount, 0);

    setAgreementReceipts((currentReceipts) =>
      currentReceipts.map((receipt) => (selectedIds.has(receipt.id) ? nextReceiptById.get(receipt.id) ?? receipt : receipt))
    );
    setAgreementReceiptDetailsClient(null);
    setAgreementReceiptPaymentRequest(null);
    setIsCashPaymentOpen(false);
    setCashPaymentTarget("sale");
    setView("sale");
    setCompletedAgreementReceipt({
      id: nextReceipts.length === 1 ? nextReceipts[0].id : createId("convenio-recebido"),
      clientName: paymentRequest.client.name,
      receiptCount: nextReceipts.length,
      itemsCount,
      totalCents,
      paymentMethod: method,
      receivedAt
    });
    onSystemMessage("");

    nextReceipts.forEach((receipt) => {
      enqueueLocalEvent("convenio_recebido", "venda", receipt.id, {
        session,
        receipt
      });
    });
  }

  function requestAgreementReceiptPayment(
    method: ReceiptPaymentMethod,
    receipts: AgreementReceiptRecord[],
    client: AgreementClient
  ) {
    const paymentRequest: AgreementReceiptPaymentRequest = {
      client,
      receipts
    };

    if (method === "dinheiro") {
      setAgreementReceiptPaymentRequest(paymentRequest);
      setCashPaymentTarget("agreement-receipt");
      setIsCashPaymentOpen(true);
      return;
    }

    confirmAgreementReceiptPayment(method, paymentRequest);
  }

  function requestEmployeeAuth(mode: EmployeeAuthMode) {
    if (activeEmployees.length === 0) {
      onSystemMessage("Funcionários ativados, mas nenhum funcionário foi sincronizado para este PDV.");
      return false;
    }

    setEmployeeAuthCode("");
    setEmployeeAuthError("");
    setEmployeeAuthRequest({ mode });
    return true;
  }

  function closeEmployeeAuthModal() {
    if (isEmployeeAuthSubmitting) {
      return;
    }

    setEmployeeAuthRequest(null);
    setEmployeeAuthCode("");
    setEmployeeAuthError("");
  }

  async function confirmEmployeeAuth(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!employeeAuthRequest || isEmployeeAuthSubmitting) {
      return;
    }

    const normalizedCode = normalizeEmployeeCode(employeeAuthCode);

    if (!normalizedCode) {
      setEmployeeAuthError("Informe a senha do funcionário.");
      return;
    }

    setIsEmployeeAuthSubmitting(true);
    setEmployeeAuthError("");

    try {
      const codeHash = await hashEmployeeCode(normalizedCode);
      const employee = activeEmployees.find((item) => item.codeHash === codeHash);

      if (!employee) {
        setEmployeeAuthError("Senha inválida.");
        return;
      }

      const mode = employeeAuthRequest.mode;

      setEmployeeAuthRequest(null);
      setEmployeeAuthCode("");

      if (mode === "open") {
        await completeOpenSession(employee);
        return;
      }

      if (mode === "close-confirm") {
        completeCloseSession(employee);
        return;
      }
    } finally {
      setIsEmployeeAuthSubmitting(false);
    }
  }

  async function completeOpenSession(employee: EmployeeRecord | null) {
    if (isOpeningSession) {
      return;
    }

    setIsOpeningSession(true);
    const openedAt = new Date();

    try {
      const remoteShiftNumber = await getRemoteShiftNumber(openedAt);
      const shiftNumber = await reserveShiftNumber(openedAt, shiftSequenceScope, remoteShiftNumber);
      const nextSession = {
        id: createId("turno"),
        shiftNumber,
        openedAt: openedAt.toISOString(),
        openedByEmployeeId: employee?.id ?? null,
        openedByEmployeeName: employee?.name ?? null
      };

      setSession(nextSession);
      setCartItems([]);
      setSales([]);
      setExpenses([]);
      setCommands([]);
      setCommandEditor(null);
      setCommandNameRequest(null);
      setCommandDeleteRequest(null);
      setCommandPaymentRequest(null);
      setView("sale");
      onSystemMessage(employee ? `Turno aberto por ${employee.name}.` : "Turno aberto. O caixa já pode iniciar vendas.");
      enqueueLocalEvent("turno_aberto", "turno", nextSession.id, {
        session: nextSession
      });
    } finally {
      setIsOpeningSession(false);
    }
  }

  async function openSession() {
    if (isOpeningSession) {
      return;
    }

    if (isEmployeeControlEnabled) {
      requestEmployeeAuth("open");
      return;
    }

    await completeOpenSession(null);
  }

  useEffect(() => {
    let shouldIgnore = false;
    const store = getLocalPdvStore();

    setIsLocalStateReady(false);

    if (!store) {
      setIsLocalStateReady(true);
      return;
    }

    store
      .loadState<LocalCashierState>({ scope: localStoreScope })
      .then((savedState) => {
        if (shouldIgnore || !savedState) {
          return;
        }

        setSession(savedState.session ?? null);
        setCartItems(savedState.cartItems ?? []);
        setSales(savedState.sales ?? []);
        const nextCommandSettings = initialSettings
          ? normalizeCommandSettings(initialSettings.comandas)
          : normalizeCommandSettings(savedState.commandSettings);
        const nextExpenseSettings = initialSettings
          ? normalizeExpenseSettings(initialSettings.lancar_despesas)
          : normalizeExpenseSettings(savedState.expenseSettings);
        const nextEmployeeControlSettings = initialSettings
          ? normalizeEmployeeControlSettings(initialSettings.controle_funcionarios)
          : normalizeEmployeeControlSettings(savedState.employeeControlSettings);
        setCommandSettings(nextCommandSettings);
        setExpenseSettings(nextExpenseSettings);
        setEmployeeControlSettings(nextEmployeeControlSettings);
        setEmployees(initialSettings ? mergeEmployees((initialEmployees ?? []).map(mapEmployee)) : mergeEmployees(savedState.employees ?? []));
        setCommands(nextCommandSettings.ativo ? savedState.commands ?? [] : []);
        setExpenses(savedState.expenses ?? []);
        setAgreementClients(normalizeAgreementClients(savedState.agreementClients ?? []));
        setAgreementReceipts(savedState.agreementReceipts ?? []);
        setCatalogProducts(savedState.catalogProducts ?? []);
        setCatalogCategories(savedState.catalogCategories ?? []);
        setPaymentSettings(normalizePaymentSettings(savedState.paymentSettings));

        if (savedState.session) {
          setView("sale");
        }
      })
      .catch((error) => {
        if (!shouldIgnore) {
          const message = error instanceof Error ? error.message : "Não foi possível carregar o estado local do PDV.";
          onSystemMessage(message);
        }
      })
      .finally(() => {
        if (!shouldIgnore) {
          setIsLocalStateReady(true);
          void refreshSyncSummary();
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, [initialEmployees, initialSettings, localStoreScope]);

  useEffect(() => {
    let shouldIgnore = false;
    const store = getLocalPdvStore();

    if (!store?.getFiscalConfig) {
      setIsFiscalEmissionEnabled(false);
      return;
    }

    store
      .getFiscalConfig({ scope: localStoreScope })
      .then((config) => {
        if (!shouldIgnore) {
          setIsFiscalEmissionEnabled(isFiscalEmissionActiveConfig(asRecord(config)));
        }
      })
      .catch(() => {
        if (!shouldIgnore && !initialSettings?.fiscal) {
          setIsFiscalEmissionEnabled(false);
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, [initialSettings, localStoreScope]);

  useEffect(() => {
    if (!isLocalStateReady || connectivity !== "online") {
      return;
    }

    const runLocalSyncCycle = () => {
      void transmitPendingContingencyFiscalDocuments().then(() => {
        if (!deviceCredential) {
          return;
        }

        void syncPendingOutboundQueues();
      });
    };

    runLocalSyncCycle();

    const intervalId = window.setInterval(() => {
      runLocalSyncCycle();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [connectivity, deviceCredential, isLocalStateReady, syncPendingOutboundQueues, transmitPendingContingencyFiscalDocuments]);

  useEffect(() => {
    if (!isLocalStateReady) {
      return;
    }

    const store = getLocalPdvStore();

    if (!store) {
      return;
    }

    const snapshot = buildLocalStateSnapshot();

    void store.saveState({ scope: localStoreScope, state: snapshot }).catch((error) => {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o estado local do PDV.";
      onSystemMessage(message);
    });
  }, [
    isLocalStateReady,
    localStoreScope,
    session,
    cartItems,
    sales,
    commands,
    expenses,
    employees,
    agreementClients,
    agreementReceipts,
    catalogProducts,
    catalogCategories,
    commandSettings,
    expenseSettings,
    employeeControlSettings,
    paymentSettings
  ]);

  useEffect(() => {
    if (session) {
      return;
    }

    let shouldIgnore = false;

    resolvePreviewShiftNumber()
      .then((shiftNumber) => {
        if (!shouldIgnore) {
          setPreviewShiftNumber(shiftNumber);
        }
      })
      .catch(() => {
        if (!shouldIgnore) {
          setPreviewShiftNumber(getPreviewDailyShiftNumber(new Date(), shiftSequenceScope));
        }
      });

    return () => {
      shouldIgnore = true;
    };
  }, [resolvePreviewShiftNumber, session, shiftSequenceScope]);

  useEffect(() => {
    if (session && view === "menu") {
      setView("sale");
    }
  }, [isOpeningSession, session, view]);

  useEffect(() => {
    if (view !== "agreement" || (isAgreementPaymentEnabled && frontCashAgreementClients.length > 0)) {
      return;
    }

    setView(session ? "sale" : "menu");
  }, [frontCashAgreementClients.length, isAgreementPaymentEnabled, session, view]);

  useEffect(() => {
    if (isExpensesEnabled) {
      return;
    }

    setIsExpenseOpen(false);

    if (view === "expenses") {
      setView(session ? "sale" : "menu");
      onSystemMessage("Despesas desativadas neste PDV.");
    }
  }, [isExpensesEnabled, onSystemMessage, session, view]);

  useEffect(() => {
    if (session || view !== "menu") {
      return;
    }

    const handleOpenTurnShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInteractiveField =
        target?.tagName === "BUTTON" ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable === true;

      if (event.key !== "Enter" || event.repeat || event.defaultPrevented || isInteractiveField) {
        return;
      }

      event.preventDefault();
      openSession();
    };

    window.addEventListener("keydown", handleOpenTurnShortcut);

    return () => {
      window.removeEventListener("keydown", handleOpenTurnShortcut);
    };
  }, [session, view]);

  useEffect(() => {
    if (
      !session ||
      isPaymentOpen ||
      isCashPaymentOpen ||
      isAgreementPaymentOpen ||
      isExpenseOpen ||
      isClosingSession ||
      isSettingsOpen ||
      isProductPickerOpen ||
      agreementReceiptDetailsClient ||
      agreementReceiptPaymentRequest ||
      commandNameRequest ||
      commandDeleteRequest ||
      commandPaymentRequest ||
      selectedSale ||
      completedSale ||
      completedAgreementReceipt ||
      saleCancelRequest
    ) {
      return;
    }

    const shortcutMap: Partial<Record<string, CashierView>> = {
      Escape: "sale",
      F1: "history",
      ...(isCommandsEnabled ? { F2: "commands" as const } : {}),
      ...(isAgreementPaymentEnabled && frontCashAgreementClients.length > 0 ? { F3: "agreement" as const } : {}),
      ...(isExpensesEnabled ? { F4: "expenses" as const } : {})
    };

    const handleFunctionShortcut = (event: KeyboardEvent) => {
      const nextView = shortcutMap[event.key];

      if (event.key === "F2" && !isCommandsEnabled) {
        event.preventDefault();
        return;
      }

      if (event.key === "F3" && (!isAgreementPaymentEnabled || frontCashAgreementClients.length === 0)) {
        event.preventDefault();
        return;
      }

      if (event.key === "F4" && !isExpensesEnabled) {
        event.preventDefault();
        return;
      }

      if (!nextView || event.repeat || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      setCommandEditor(null);
      setCommandNameRequest(null);
      setCommandDeleteRequest(null);
      setCommandPaymentRequest(null);
      setView(nextView);
      onSystemMessage("");
    };

    window.addEventListener("keydown", handleFunctionShortcut);

    return () => {
      window.removeEventListener("keydown", handleFunctionShortcut);
    };
  }, [
    session,
    isPaymentOpen,
    isCashPaymentOpen,
    isAgreementPaymentOpen,
    isExpenseOpen,
    isClosingSession,
    isSettingsOpen,
    isProductPickerOpen,
    agreementReceiptDetailsClient,
    agreementReceiptPaymentRequest,
    commandNameRequest,
    commandDeleteRequest,
    commandPaymentRequest,
    selectedSale,
    completedSale,
    completedAgreementReceipt,
    saleCancelRequest,
    frontCashAgreementClients.length,
    isCommandsEnabled,
    isExpensesEnabled,
    isAgreementPaymentEnabled,
    onSystemMessage
  ]);

  useEffect(() => {
    if (
      !session ||
      (view !== "sale" && view !== "command-editor") ||
      isPaymentOpen ||
      isCashPaymentOpen ||
      isAgreementPaymentOpen ||
      isExpenseOpen ||
      isClosingSession ||
      isSettingsOpen ||
      isProductPickerOpen ||
      agreementReceiptDetailsClient ||
      agreementReceiptPaymentRequest ||
      commandNameRequest ||
      commandDeleteRequest ||
      commandPaymentRequest ||
      selectedSale ||
      completedSale ||
      completedAgreementReceipt ||
      saleCancelRequest
    ) {
      return;
    }

    const handleSaleSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInteractiveField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable === true;
      const isSearchKey =
        event.key.length === 1 &&
        event.key.trim().length > 0 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey;

      if (!isSearchKey || event.repeat || event.defaultPrevented || isInteractiveField) {
        return;
      }

      event.preventDefault();
      openProductPicker(event.key);
    };

    window.addEventListener("keydown", handleSaleSearchShortcut);

    return () => {
      window.removeEventListener("keydown", handleSaleSearchShortcut);
    };
  }, [
    session,
    view,
    isPaymentOpen,
    isCashPaymentOpen,
    isAgreementPaymentOpen,
    isExpenseOpen,
    isClosingSession,
    isSettingsOpen,
    isProductPickerOpen,
    agreementReceiptDetailsClient,
    agreementReceiptPaymentRequest,
    commandNameRequest,
    commandDeleteRequest,
    commandPaymentRequest,
    selectedSale,
    completedSale,
    completedAgreementReceipt,
    saleCancelRequest,
    openProductPicker
  ]);

  useEffect(() => {
    if (!isLocalStateReady || connectivity !== "online") {
      return;
    }

    void refreshRemoteData({ silent: hasLoadedRemoteDataRef.current });
  }, [connectivity, isLocalStateReady, refreshRemoteData]);

  useEffect(() => {
    if (!isLocalStateReady || connectivity !== "online") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshRemoteData({ silent: true });
    }, 60000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [connectivity, isLocalStateReady, refreshRemoteData]);

  useEffect(() => {
    if (isCommandsEnabled) {
      return;
    }

    setCommands([]);
    setCommandEditor(null);
    setCommandNameRequest(null);
    setCommandDeleteRequest(null);
    setIsProductPickerOpen(false);

    if (commandPaymentRequest) {
      setCommandPaymentRequest(null);
      setIsPaymentOpen(false);
      setIsCashPaymentOpen(false);
      setIsAgreementPaymentOpen(false);
    }

    if (view === "commands" || view === "command-editor") {
      setSearchQuery("");
      setSelectedPickerCategoryId("all");
      setView(session ? "sale" : "menu");
      onSystemMessage("Comandas desativadas neste PDV.");
    }
  }, [commandPaymentRequest, isCommandsEnabled, onSystemMessage, session, view]);

  useEffect(() => {
    if (isFiscalEmissionEnabled) {
      return;
    }

    setFiscalEmissionModal(null);
    setFiscalDocumentsBySaleId({});
    setSelectedSaleFiscalDocuments([]);
    setIsSelectedSaleFiscalLoading(false);
    setReprintingFiscalDocumentId(null);
    fiscalPrintingLockRef.current = false;
    setFiscalPrintMode(null);
    setIsFiscalPrinting(false);
  }, [isFiscalEmissionEnabled]);

  function closeSession() {
    if (!session) {
      return;
    }

    if (isCommandsEnabled && commands.length > 0) {
      onSystemMessage("Conclua ou remova as comandas abertas antes de fechar o turno.");
      return;
    }

    if (cartItems.length > 0) {
      onSystemMessage("Finalize ou limpe a venda atual antes de fechar o turno.");
      return;
    }

    if (isEmployeeControlEnabled) {
      requestEmployeeAuth("close-confirm");
      return;
    }

    completeCloseSession(null);
  }

  function completeCloseSession(employee: EmployeeRecord | null) {
    if (!session) {
      return;
    }

    const closedAt = new Date().toISOString();
    const closedSession = {
      ...session,
      closedAt,
      closedByEmployeeId: employee?.id ?? null,
      closedByEmployeeName: employee?.name ?? null
    };

    setSession(null);
    setCartItems([]);
    setCommands([]);
    setCommandEditor(null);
    setCommandNameRequest(null);
    setCommandDeleteRequest(null);
    setCommandPaymentRequest(null);
    setExpenseEditRequest(null);
    setSales([]);
    setExpenses([]);
    setIsClosingSession(false);
    setView("menu");
    onSystemMessage(employee ? `Turno fechado por ${employee.name}.` : "Turno fechado neste computador.");
    enqueueLocalEvent("turno_fechado", "turno", closedSession.id, {
      session: closedSession,
      sales: sessionActiveSales,
      expenses: sessionExpenseRecords,
      agreementReceipts: sessionAgreementReceipts,
      totals: {
        salesCents: sessionSales,
        expensesCents: sessionExpenses,
        expectedCashCents
      }
    });
    void resolvePreviewShiftNumber().then(setPreviewShiftNumber);
  }

  function openNewExpense() {
    setExpenseEditRequest(null);
    setIsExpenseOpen(true);
  }

  function openExpenseEditor(expense: CashExpenseRecord) {
    setExpenseEditRequest(expense);
    setIsExpenseOpen(true);
  }

  function closeExpenseModal() {
    setIsExpenseOpen(false);
    setExpenseEditRequest(null);
  }

  function saveExpense(title: string, amountCents: number) {
    if (!isExpensesEnabled) {
      closeExpenseModal();
      onSystemMessage("Despesas desativadas neste PDV.");
      return;
    }

    if (expenseEditRequest) {
      const updatedAt = new Date().toISOString();
      const nextExpense = {
        ...expenseEditRequest,
        title,
        amountCents,
        sessionId: expenseEditRequest.sessionId ?? session?.id ?? null,
        updatedAt
      };

      setExpenses((currentExpenses) =>
        currentExpenses.map((expense) => (expense.id === nextExpense.id ? nextExpense : expense))
      );
      closeExpenseModal();
      onSystemMessage(`Despesa atualizada: ${formatCurrency(amountCents)}.`);
      enqueueLocalEvent("despesa_atualizada", "despesa", nextExpense.id, {
        eventId: `despesa_atualizada-${nextExpense.id}-${Date.now()}`,
        session,
        expense: nextExpense,
        updatedAt
      });
      return;
    }

    const nextExpense = {
      id: createId("despesa"),
      title,
      amountCents,
      sessionId: session?.id ?? null,
      createdAt: new Date().toISOString()
    };

    setExpenses((currentExpenses) => [nextExpense, ...currentExpenses]);
    closeExpenseModal();
    onSystemMessage(`Despesa lançada: ${formatCurrency(amountCents)}.`);
    enqueueLocalEvent("despesa_lancada", "despesa", nextExpense.id, {
      session,
      expense: nextExpense
    });
  }

  function deleteExpense(expense: CashExpenseRecord) {
    const deletedAt = new Date().toISOString();

    setExpenses((currentExpenses) => currentExpenses.filter((currentExpense) => currentExpense.id !== expense.id));
    closeExpenseModal();
    onSystemMessage(`Despesa excluída: ${formatCurrency(expense.amountCents)}.`);
    enqueueLocalEvent("despesa_excluida", "despesa", expense.id, {
      eventId: `despesa_excluida-${expense.id}-${Date.now()}`,
      session,
      expense,
      deletedAt
    });
  }

  function renderMenu() {
    const now = new Date();
    const nextShiftNumber = previewShiftNumber;

    if (!session) {
      return (
        <section className="pdv-cashier-card pdv-open-turn-card" aria-label={`Abrir caixa, turno ${nextShiftNumber}`}>
          <p className="pdv-open-turn-date">{formatOpenCashDate(now, nextShiftNumber)}</p>

          <button
            className="pdv-open-turn-action"
            type="button"
            onPointerEnter={(event) => startWaveHover(event, "pdv-open-turn-action--hovering")}
            onPointerLeave={(event) => {
              event.currentTarget.classList.remove("pdv-open-turn-action--hovering");
            }}
            onFocus={(event) => startWaveFocus(event, "pdv-open-turn-action--hovering")}
            onBlur={(event) => {
              event.currentTarget.classList.remove("pdv-open-turn-action--hovering");
            }}
            onClick={openSession}
            disabled={isOpeningSession}
          >
            <span className="pdv-open-turn-action-icon" aria-hidden="true">
              {isOpeningSession ? <LoaderCircle className="pdv-spin" size={22} /> : <Store size={22} />}
            </span>
            <strong>{isOpeningSession ? "Abrindo turno" : `Abrir Turno ${nextShiftNumber}`}</strong>
            <span className="pdv-open-turn-shortcut">[ENTER]</span>
            <ArrowRight aria-hidden="true" size={19} />
          </button>
        </section>
      );
    }

    return null;
  }

  function renderSale() {
    return (
      <section className="pdv-work-card pdv-sale-work-card" aria-label="Venda atual">
        <button
          className="pdv-search-field pdv-sale-search-trigger"
          type="button"
          onPointerEnter={(event) => startWaveHover(event, "pdv-sale-search-trigger--hovering")}
          onPointerLeave={(event) => {
            event.currentTarget.classList.remove("pdv-sale-search-trigger--hovering");
          }}
          onClick={() => {
            openProductPicker("");
          }}
        >
          <Search aria-hidden="true" size={22} />
          <span>Buscar produto para adicionar</span>
        </button>

        <section className={cartItems.length > 0 ? "pdv-sale-board pdv-sale-board-filled" : "pdv-sale-board"} aria-label="Itens da venda">
          {cartItems.length > 0 ? (
            <div className="pdv-sale-board-list">
              {cartItems.map((item) => {
                const stockLimit = getControlledStockLimit(item);
                const canIncrease = stockLimit === null || item.quantity < stockLimit;

                return (
                  <div className="pdv-cart-line pdv-sale-item-line" key={item.id}>
                    <ProductThumbnail
                      backgroundColor={item.categoryColor}
                      color={item.categoryAccent}
                      icon={item.categoryIcon}
                      imageUrl={item.imageUrl}
                      label={item.category}
                      size="sm"
                    />
                    <span className="pdv-cart-copy">
                      <strong>{item.name}</strong>
                      <em className="pdv-sale-item-meta">
                        <span>{formatCurrency(item.priceCents)} un.</span>
                        <span>Estoque {formatStockQuantity(item.stockQuantity)}</span>
                      </em>
                    </span>
                    <span className="pdv-quantity-control">
                      <button type="button" onClick={() => decreaseItem(item.id)} aria-label={`Diminuir ${item.name}`}>
                        {item.quantity === 1 ? <Trash2 aria-hidden="true" size={14} /> : <Minus aria-hidden="true" size={14} />}
                      </button>
                      <input
                        value={item.quantity}
                        onChange={(event) => {
                          const rawQuantity = event.target.value.replace(/\D/g, "");
                          const nextQuantity = rawQuantity ? Number.parseInt(rawQuantity, 10) : 0;
                          const clampedQuantity = clampCartQuantity(nextQuantity, item);

                          if (stockLimit !== null && nextQuantity > stockLimit) {
                            onSystemMessage(getStockLimitMessage(item));
                          } else {
                            onSystemMessage("");
                          }

                          setCartItems((currentItems) =>
                            currentItems
                              .map((currentItem) =>
                                currentItem.id === item.id
                                  ? { ...currentItem, quantity: clampedQuantity }
                                  : currentItem
                              )
                              .filter((currentItem) => currentItem.quantity > 0)
                          );
                        }}
                        inputMode="numeric"
                        min={0}
                        max={stockLimit ?? undefined}
                        aria-label={`Quantidade de ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => increaseItem(item.id)}
                        aria-label={`Aumentar ${item.name}`}
                        disabled={!canIncrease}
                      >
                        <Plus aria-hidden="true" size={14} />
                      </button>
                    </span>
                    <span className="pdv-sale-line-total">
                      <em>Total</em>
                      <strong>{formatCurrency(item.priceCents * item.quantity)}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <ShoppingCart size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Venda vazia</strong>
              <span>Busque um produto para começar.</span>
            </div>
          )}
        </section>

        <div className="pdv-sale-total-inline" aria-live="polite">
          <span>Total da venda</span>
          <strong>{formatCurrency(totalCents)}</strong>
        </div>

        <div className="pdv-work-actions pdv-sale-actions">
          {isCommandsEnabled ? (
            <button className="pdv-secondary-action" type="button" onClick={requestCommandFromSale} disabled={cartItems.length === 0}>
              <ReceiptText aria-hidden="true" size={17} />
              Criar comanda
            </button>
          ) : null}
          <button className="pdv-primary-action" type="button" onClick={() => setIsPaymentOpen(true)} disabled={cartItems.length === 0}>
            <CreditCard aria-hidden="true" size={17} />
            Finalizar venda
          </button>
        </div>
      </section>
    );
  }

  function renderCommands() {
    if (!isCommandsEnabled) {
      return null;
    }

    return (
      <section className="pdv-work-card pdv-sale-work-card pdv-command-list-card" aria-labelledby="pdv-commands-title">
        <header className="pdv-work-head">
          <div>
            <h1 id="pdv-commands-title">Comandas</h1>
            <p>Mesas, clientes e atendimentos abertos para continuar depois.</p>
          </div>
          <span className="pdv-work-chip">{commands.length} abertas</span>
        </header>

        {commands.length > 0 ? (
          <div className="pdv-command-board" aria-label="Comandas abertas">
            {commands.map((command) => (
              <div
                className="pdv-command-line"
                key={command.id}
                role="button"
                tabIndex={0}
                onClick={() => editCommand(command)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    editCommand(command);
                  }
                }}
              >
                <span className="pdv-record-icon">
                  <ReceiptText aria-hidden="true" size={18} />
                </span>
                <span className="pdv-record-copy">
                  <strong>{command.title}</strong>
                  <em>{formatDateTime(command.createdAt)}</em>
                </span>
                <span className="pdv-command-line-total">
                  <em>{getCartQuantity(command.items)} itens</em>
                  <strong>{formatCurrency(getCartTotal(command.items))}</strong>
                </span>
                <span className="pdv-command-line-actions">
                  <span>Editar</span>
                  <button
                    className="pdv-command-finish-button"
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      finalizeCommand(command);
                    }}
                  >
                    <CreditCard aria-hidden="true" size={16} />
                    Finalizar
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <section className="pdv-sale-board pdv-command-empty-board" aria-label="Nenhuma comanda aberta">
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <ReceiptText size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Nenhuma comanda aberta</strong>
              <span>Crie uma comanda pelo caixa ou comece uma nova por aqui.</span>
            </div>
          </section>
        )}

        <div className="pdv-work-actions">
          <button className="pdv-secondary-action" type="button" onClick={() => setView("sale")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="pdv-primary-action" type="button" onClick={requestNewCommand}>
            <ReceiptText aria-hidden="true" size={17} />
            Criar comanda
          </button>
        </div>
      </section>
    );
  }

  function renderCommandEditor() {
    if (!isCommandsEnabled) {
      return null;
    }

    if (!commandEditor) {
      return renderCommands();
    }

    const canSaveCommandEditor =
      commandEditorQuantity > 0 && (commandEditor.mode === "create" || commandEditor.title.trim().length > 0);

    return (
      <section
        className="pdv-work-card pdv-sale-work-card"
        aria-label={commandEditor.mode === "edit" ? commandEditor.title.trim() || "Editar comanda" : "Criar comanda"}
      >
        {commandEditor.mode === "edit" ? (
          <label className="pdv-command-name-field">
            <span>Nome da comanda</span>
            <input
              value={commandEditor.title}
              onChange={(event) => {
                const nextTitle = event.target.value;
                applyCommandEditorDraft({ ...commandEditor, title: nextTitle });
              }}
              placeholder="Ex.: Mesa 4"
            />
          </label>
        ) : null}

        <button
          className="pdv-search-field pdv-sale-search-trigger"
          type="button"
          onPointerEnter={(event) => startWaveHover(event, "pdv-sale-search-trigger--hovering")}
          onPointerLeave={(event) => {
            event.currentTarget.classList.remove("pdv-sale-search-trigger--hovering");
          }}
          onClick={() => {
            openProductPicker("");
          }}
        >
          <Search aria-hidden="true" size={22} />
          <span>Buscar produto para adicionar</span>
        </button>

        <section
          className={commandEditor.items.length > 0 ? "pdv-sale-board pdv-sale-board-filled" : "pdv-sale-board"}
          aria-label="Itens da comanda"
        >
          {commandEditor.items.length > 0 ? (
            <div className="pdv-sale-board-list">
              {commandEditor.items.map((item) => {
                const stockLimit = getControlledStockLimit(item);
                const canIncrease = stockLimit === null || item.quantity < stockLimit;

                return (
                  <div className="pdv-cart-line pdv-sale-item-line" key={item.id}>
                    <ProductThumbnail
                      backgroundColor={item.categoryColor}
                      color={item.categoryAccent}
                      icon={item.categoryIcon}
                      imageUrl={item.imageUrl}
                      label={item.category}
                      size="sm"
                    />
                    <span className="pdv-cart-copy">
                      <strong>{item.name}</strong>
                      <em className="pdv-sale-item-meta">
                        <span>{formatCurrency(item.priceCents)} un.</span>
                        <span>Estoque {formatStockQuantity(item.stockQuantity)}</span>
                      </em>
                    </span>
                    <span className="pdv-quantity-control">
                      <button type="button" onClick={() => decreaseCommandItem(item.id)} aria-label={`Diminuir ${item.name}`}>
                        {item.quantity === 1 ? <Trash2 aria-hidden="true" size={14} /> : <Minus aria-hidden="true" size={14} />}
                      </button>
                      <input
                        value={item.quantity}
                        onChange={(event) => {
                          const rawQuantity = event.target.value.replace(/\D/g, "");
                          const nextQuantity = rawQuantity ? Number.parseInt(rawQuantity, 10) : 0;
                          const clampedQuantity = clampCartQuantity(nextQuantity, item);

                          if (stockLimit !== null && nextQuantity > stockLimit) {
                            onSystemMessage(getStockLimitMessage(item));
                          } else {
                            onSystemMessage("");
                          }

                          const items = commandEditor.items
                            .map((currentItem) =>
                              currentItem.id === item.id ? { ...currentItem, quantity: clampedQuantity } : currentItem
                            )
                            .filter((currentItem) => currentItem.quantity > 0);

                          applyCommandEditorDraft({ ...commandEditor, items });
                        }}
                        inputMode="numeric"
                        min={0}
                        max={stockLimit ?? undefined}
                        aria-label={`Quantidade de ${item.name}`}
                      />
                      <button
                        type="button"
                        onClick={() => increaseCommandItem(item.id)}
                        aria-label={`Aumentar ${item.name}`}
                        disabled={!canIncrease}
                      >
                        <Plus aria-hidden="true" size={14} />
                      </button>
                    </span>
                    <span className="pdv-sale-line-total">
                      <em>Total</em>
                      <strong>{formatCurrency(item.priceCents * item.quantity)}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <ReceiptText size={40} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Comanda vazia</strong>
              <span>Busque um produto para começar.</span>
            </div>
          )}
        </section>

        <div className="pdv-sale-total-inline" aria-live="polite">
          <span>Total da comanda</span>
          <strong>{formatCurrency(commandEditorTotalCents)}</strong>
        </div>

        {commandEditor.mode === "edit" ? (
          <div className="pdv-work-actions pdv-command-editor-actions">
            <span className="pdv-command-action-group pdv-command-action-group-left">
              <button className="pdv-secondary-action pdv-command-compact-action" type="button" onClick={closeCommandEditor}>
                <ArrowLeft aria-hidden="true" size={17} />
                Voltar
              </button>
              <button className="pdv-danger-action pdv-command-compact-action" type="button" onClick={requestDeleteCommand}>
                <Trash2 aria-hidden="true" size={17} />
                Excluir
              </button>
            </span>
            <span className="pdv-command-action-group pdv-command-action-group-right">
              <button
                className="pdv-confirm-action pdv-command-save-action"
                type="button"
                onClick={finalizeEditedCommand}
                disabled={!canSaveCommandEditor}
              >
                <CreditCard aria-hidden="true" size={17} />
                Finalizar venda
              </button>
            </span>
          </div>
        ) : (
          <div className="pdv-work-actions pdv-sale-actions">
            <button className="pdv-secondary-action" type="button" onClick={closeCommandEditor}>
              <ArrowLeft aria-hidden="true" size={17} />
              Cancelar
            </button>
            <button className="pdv-primary-action" type="button" onClick={saveCommandEditor} disabled={!canSaveCommandEditor}>
              <ReceiptText aria-hidden="true" size={17} />
              Salvar comanda
            </button>
          </div>
        )}
      </section>
    );
  }

  function renderHistory() {
    return (
      <section className="pdv-work-card pdv-sale-work-card pdv-history-card" aria-labelledby="pdv-history-title">
        <header className="pdv-work-head">
          <div>
            <h1 id="pdv-history-title">Vendas</h1>
            <p>Vendas e recebimentos do turno atual.</p>
          </div>
          <span className="pdv-work-chip">
            {sessionHistoryMovements.length} {sessionHistoryMovements.length === 1 ? "movimento" : "movimentos"}
          </span>
        </header>

        {sessionHistoryMovements.length > 0 ? (
          <div className="pdv-history-board" aria-label="Vendas e recebimentos do turno">
            {sessionHistoryMovements.map((movement) => {
              if (movement.type === "agreement-receipt") {
                const paymentLabel = movement.paymentMethod ? getPaymentLabel(movement.paymentMethod) : "Recebido";

                return (
                  <button
                    className="pdv-history-line pdv-history-line-agreement"
                    key={movement.id}
                    type="button"
                    onClick={() =>
                      setCompletedAgreementReceipt({
                        id: movement.id,
                        clientName: movement.clientName,
                        receiptCount: movement.receiptCount,
                        itemsCount: movement.itemsCount,
                        totalCents: movement.totalCents,
                        paymentMethod: movement.paymentMethod,
                        receivedAt: movement.occurredAt
                      })
                    }
                  >
                    <span className="pdv-record-icon">
                      <AgreementClientIcon client={{ personType: movement.clientPersonType }} />
                    </span>
                    <span className="pdv-record-copy">
                      <strong className="pdv-history-title pdv-history-title-agreement">
                        <span>Recebimento de convênio</span>
                        <span className="pdv-history-title-separator" aria-hidden="true">|</span>
                        <em>{movement.clientName}</em>
                      </strong>
                      <em className="pdv-sale-item-meta">
                        <span>{formatDateTime(movement.occurredAt)}</span>
                        <span>{paymentLabel}</span>
                        <span>
                          {movement.receiptCount} {movement.receiptCount === 1 ? "título" : "títulos"}
                        </span>
                        <span>
                          {movement.itemsCount} {movement.itemsCount === 1 ? "item" : "itens"}
                        </span>
                      </em>
                    </span>
                    <span className="pdv-history-line-total">
                      <strong>{formatCurrency(movement.totalCents)}</strong>
                      <em>Recebido</em>
                    </span>
                    <span className="pdv-history-line-action">
                      <span>Resumo</span>
                      <ArrowRight aria-hidden="true" size={18} />
                    </span>
                  </button>
                );
              }

              const { sale } = movement;
              const canceled = isSaleCanceled(sale);
              const commandSaleTitle = sale.originCommandTitle?.trim();
              const SaleIcon = canceled ? X : commandSaleTitle ? ReceiptText : ShoppingCart;
              const fiscalSummary = getSaleFiscalSummary(fiscalDocumentsBySaleId[sale.id] ?? [], false, sale);
              const saleItemsCount = getCartQuantity(sale.items);
              const saleFiscalTitle = isFiscalEmissionEnabled
                ? getHistoryFiscalTitle(fiscalSummary.title)
                : getSaleOrdinalTitle(sale, sessionRecordedSales);
              const saleFiscalLabel = isFiscalEmissionEnabled
                ? fiscalSummary.label
                : canceled
                  ? "Cancelada"
                  : "Concluída";
              const saleTone = isFiscalEmissionEnabled ? fiscalSummary.tone : canceled ? "neutral" : "success";

              return (
                <button
                  className={canceled ? "pdv-history-line pdv-history-line-canceled" : "pdv-history-line"}
                  key={sale.id}
                  type="button"
                  onClick={() => setSelectedSale(sale)}
                >
                  <span className="pdv-record-icon">
                    <SaleIcon aria-hidden="true" size={18} />
                  </span>
                  <span className="pdv-record-copy">
                    <strong className={`pdv-history-title pdv-history-title-${saleTone}`}>
                      <span>{saleFiscalTitle}</span>
                      <span className="pdv-history-title-separator" aria-hidden="true">|</span>
                      <em>{saleFiscalLabel}</em>
                    </strong>
                    <em className="pdv-sale-item-meta">
                      <span>{formatDateTime(sale.createdAt)}</span>
                      <span>{getPaymentLabel(sale.paymentMethod)}</span>
                      {commandSaleTitle ? <span>{commandSaleTitle}</span> : null}
                    </em>
                  </span>
                  <span className="pdv-history-line-total">
                    <strong>{formatCurrency(sale.totalCents)}</strong>
                    <em>
                      {saleItemsCount} {saleItemsCount === 1 ? "item" : "itens"}
                    </em>
                  </span>
                  <span className="pdv-history-line-action">
                    <span>Detalhes</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <section className="pdv-sale-board pdv-history-empty-board" aria-label="Nenhum movimento no turno">
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <History size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Nenhum movimento no turno</strong>
              <span>Vendas e recebimentos aparecerão aqui.</span>
            </div>
          </section>
        )}

        <div className="pdv-work-actions">
          <button className="pdv-secondary-action" type="button" onClick={() => setView("sale")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="pdv-primary-action" type="button" onClick={openSale}>
            <ShoppingCart aria-hidden="true" size={17} />
            Nova venda
          </button>
        </div>
      </section>
    );
  }

  function renderAgreement() {
    const hasAgreementReceivables = agreementClientReceivableSummaries.length > 0;
    const hasAgreementSearchResults = filteredAgreementClientReceivableSummaries.length > 0;

    return (
      <section className="pdv-work-card pdv-sale-work-card pdv-command-list-card" aria-labelledby="pdv-agreement-title">
        <header className="pdv-work-head">
          <div>
            <h1 id="pdv-agreement-title">Receber convênios</h1>
            <p>Clientes com títulos em aberto no caixa.</p>
          </div>
          <span className="pdv-work-chip">{pendingAgreementReceipts.length} pendentes</span>
        </header>

        {hasAgreementReceivables ? (
          <label className="pdv-agreement-search pdv-agreement-page-search">
            <Search aria-hidden="true" size={20} />
            <input
              value={agreementSearchQuery}
              onChange={(event) => setAgreementSearchQuery(event.target.value)}
              placeholder="Buscar cliente"
            />
          </label>
        ) : null}

        {hasAgreementSearchResults ? (
          <div className="pdv-command-board pdv-agreement-client-board" aria-label="Clientes com convênio em aberto">
            {filteredAgreementClientReceivableSummaries.map((summary) => (
              <button
                className="pdv-command-line pdv-agreement-line"
                key={summary.client.id}
                type="button"
                onClick={() => setAgreementReceiptDetailsClient(summary.client)}
              >
                <span className="pdv-record-icon">
                  <AgreementClientIcon client={summary.client} />
                </span>
                <span className="pdv-record-copy">
                  <strong>{summary.client.name}</strong>
                  <em className="pdv-sale-item-meta">
                    <span>
                      {summary.pendingReceipts.length} {summary.pendingReceipts.length === 1 ? "nota em aberto" : "notas em aberto"}
                    </span>
                    <span>{getAgreementClientTypeLabel(summary.client)}</span>
                  </em>
                </span>
                <span className="pdv-command-line-total">
                  <em>{summary.pendingItemsCount} {summary.pendingItemsCount === 1 ? "item" : "itens"}</em>
                  <strong>{formatCurrency(summary.totalOpenCents)}</strong>
                </span>
                <span className="pdv-command-line-actions pdv-agreement-line-action">
                  <span>Ver detalhes</span>
                  <ArrowRight aria-hidden="true" size={18} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <section className="pdv-sale-board pdv-command-empty-board" aria-label="Nenhum convênio pendente">
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <HandCoins size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>{hasAgreementReceivables ? "Nenhum cliente encontrado" : "Nenhum convênio pendente"}</strong>
              <span>
                {hasAgreementReceivables
                  ? "Ajuste a busca para localizar o cliente."
                  : "Clientes com valores em aberto aparecerão aqui."}
              </span>
            </div>
          </section>
        )}

        <div className="pdv-work-actions">
          <button className="pdv-secondary-action" type="button" onClick={() => setView("sale")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
        </div>
      </section>
    );
  }

  function renderExpenses() {
    return (
      <section className="pdv-work-card pdv-sale-work-card pdv-command-list-card pdv-expense-list-card" aria-labelledby="pdv-expenses-title">
        <header className="pdv-work-head">
          <div>
            <h1 id="pdv-expenses-title">Despesas</h1>
            <p>Saídas de dinheiro registradas neste turno.</p>
          </div>
          <span className="pdv-work-chip">{formatCurrency(sessionExpenses)}</span>
        </header>

        {expenses.length > 0 ? (
          <div className="pdv-command-board pdv-expense-board" aria-label="Despesas lançadas">
            {expenses.map((expense) => (
              <button className="pdv-command-line pdv-expense-line" key={expense.id} type="button" onClick={() => openExpenseEditor(expense)}>
                <span className="pdv-record-icon">
                  <WalletCards aria-hidden="true" size={18} />
                </span>
                <span className="pdv-record-copy">
                  <strong>{expense.title}</strong>
                  <em>{formatDateTime(expense.createdAt)}</em>
                </span>
                <span className="pdv-command-line-total pdv-expense-line-total">
                  <em>Saída</em>
                  <strong>{formatCurrency(expense.amountCents)}</strong>
                </span>
                <span className="pdv-expense-line-status">
                  <span>Editar</span>
                  <ArrowRight aria-hidden="true" size={18} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <section className="pdv-sale-board pdv-command-empty-board" aria-label="Nenhuma despesa lançada">
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <WalletCards size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Nenhuma despesa lançada</strong>
              <span>Registre saídas de dinheiro usadas durante o turno.</span>
            </div>
          </section>
        )}

        <div className="pdv-work-actions">
          <button className="pdv-secondary-action" type="button" onClick={() => setView("sale")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="pdv-primary-action" type="button" onClick={openNewExpense}>
            <WalletCards aria-hidden="true" size={17} />
            Nova despesa
          </button>
        </div>
      </section>
    );
  }

  const headerDate = session ? new Date(session.openedAt) : new Date();
  const headerShiftNumber = session?.shiftNumber ?? getPreviewDailyShiftNumber(headerDate, shiftSequenceScope);
  const headerTurnLabel = formatOpenCashDate(headerDate, headerShiftNumber);
  const headerEmployeeLabel = session?.openedByEmployeeName?.trim() || "";
  const navItems: Array<{
    view: CashierView;
    label: string;
    shortcut: string;
  }> = [
    { view: "sale", label: "Caixa", shortcut: "ESC" },
    { view: "history", label: "Vendas", shortcut: "F1" }
  ];

  if (isCommandsEnabled) {
    navItems.push({ view: "commands", label: "Comandas", shortcut: "F2" });
  }

  if (isAgreementPaymentEnabled && frontCashAgreementClients.length > 0) {
    navItems.push({ view: "agreement", label: "Receber Convênios", shortcut: "F3" });
  }

  if (isExpensesEnabled) {
    navItems.push({ view: "expenses", label: "Despesas", shortcut: "F4" });
  }

  const activeView =
    !isCommandsEnabled && (view === "commands" || view === "command-editor")
      ? session
        ? "sale"
        : "menu"
      : !isExpensesEnabled && view === "expenses"
        ? session
          ? "sale"
          : "menu"
      : session && view === "menu"
        ? "sale"
        : view;
  const openCommandsCount = isCommandsEnabled ? commands.length : 0;
  const openCommandsLabel = `${openCommandsCount} ${openCommandsCount === 1 ? "comanda aberta" : "comandas abertas"}`;
  const sectionTitle =
    !session && activeView === "menu"
      ? "Abrir caixa"
      : activeView === "sale"
        ? "Caixa"
        : activeView === "commands"
          ? "Comandas"
          : activeView === "command-editor"
            ? commandEditor?.mode === "edit"
              ? `Editar ${commandEditor.title.trim() || "comanda"}`
              : "Criar comanda"
            : activeView === "agreement"
            ? "Receber convênios"
            : activeView === "expenses"
              ? "Despesas"
              : activeView === "history"
                ? "Vendas"
                : "Caixa";
  const SectionIcon =
    activeView === "sale"
      ? ShoppingCart
      : activeView === "commands" || activeView === "command-editor"
        ? ReceiptText
        : activeView === "agreement"
          ? HandCoins
          : activeView === "expenses"
            ? WalletCards
            : activeView === "history"
              ? History
              : Store;
  const isWideShell = session && activeView !== "menu";
  const isScrollableShell =
    session &&
    ["sale", "commands", "command-editor", "agreement", "expenses", "history"].includes(activeView);
  const shellClassName = [
    "pdv-cashier-shell",
    isWideShell ? "pdv-cashier-shell-wide" : "",
    isScrollableShell ? "pdv-cashier-shell-scroll" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const updateVersionKey = updateStatus?.availableVersion || "unknown";
  const shouldShowUpdateModal = shouldShowPdvUpdateModal(updateStatus) && dismissedUpdateVersion !== updateVersionKey;

  function postponePdvUpdate() {
    setDismissedUpdateVersion(updateVersionKey);
  }

  async function downloadPdvUpdate() {
    const store = getLocalPdvStore();

    if (!store?.downloadUpdate) {
      return;
    }

    setIsUpdateActionRunning(true);

    try {
      const status = await store.downloadUpdate();
      setUpdateStatus(status);
    } finally {
      setIsUpdateActionRunning(false);
    }
  }

  async function installPdvUpdate() {
    const store = getLocalPdvStore();

    if (!store?.installUpdate || session) {
      return;
    }

    setIsUpdateActionRunning(true);

    try {
      await store.installUpdate();
    } finally {
      setIsUpdateActionRunning(false);
    }
  }

  async function runPdvUpdateAction() {
    if (updateStatus?.status === "downloaded") {
      await installPdvUpdate();
      return;
    }

    if (updateStatus?.status === "available") {
      await downloadPdvUpdate();
    }
  }

  return (
    <>
      <header className="pdv-system-header">
        <div className="pdv-system-brand">
          <img className="pdv-system-brand-mark" src="./app-icon.png" alt="" />
          <span>
            <strong>CAIXA ÁGIL PDV</strong>
          </span>
        </div>

        <nav className="pdv-primary-nav" aria-label="Funções do caixa">
          {session ? (
            navItems.map((item) => {
              const isActive = activeView === item.view || (item.view === "commands" && activeView === "command-editor");
              const showCommandCount = item.view === "commands" && openCommandsCount > 0;

              return (
                <button
                  className={isActive ? "pdv-primary-nav-link pdv-primary-nav-link-active" : "pdv-primary-nav-link"}
                  key={item.view}
                  type="button"
                  onClick={() => {
                    setCommandEditor(null);
                    setCommandNameRequest(null);
                    setCommandDeleteRequest(null);
                    setCommandPaymentRequest(null);
                    setView(item.view);
                    onSystemMessage("");
                  }}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={showCommandCount ? `${item.label}, ${openCommandsLabel}, atalho ${item.shortcut}` : undefined}
                >
                  <span>{item.label}</span>
                  {showCommandCount ? (
                    <span className="pdv-primary-nav-count" title={openCommandsLabel} aria-hidden="true">
                      <span className="pdv-primary-nav-count-dot" />
                      {openCommandsCount}
                    </span>
                  ) : null}
                  <kbd>{item.shortcut}</kbd>
                </button>
              );
            })
          ) : (
            <span className="pdv-primary-nav-placeholder">Turno fechado</span>
          )}
        </nav>

        <div className="pdv-system-header-actions">
          {session ? (
            <button
              className="pdv-header-close-button"
              type="button"
              onPointerEnter={(event) => startWaveHover(event, "pdv-header-close-button--hovering")}
              onPointerLeave={(event) => {
                event.currentTarget.classList.remove("pdv-header-close-button--hovering");
              }}
              onFocus={(event) => startWaveFocus(event, "pdv-header-close-button--hovering")}
              onBlur={(event) => {
                event.currentTarget.classList.remove("pdv-header-close-button--hovering");
              }}
              onClick={() => setIsClosingSession(true)}
            >
              <span>Fechar caixa</span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : null}
          <button
            className="pdv-header-settings-button"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Configurações do PDV"
          >
            <Settings aria-hidden="true" size={21} />
          </button>
        </div>
      </header>

      {shouldShowUpdateModal ? (
        <PdvUpdateModal
          hasOpenSession={Boolean(session)}
          isBusy={isUpdateActionRunning}
          status={updateStatus}
          onPostpone={postponePdvUpdate}
          onUpdate={runPdvUpdateAction}
        />
      ) : null}

      <section className={shellClassName} aria-label="Sistema do caixa">
        <div className="pdv-cashier-section-title" aria-label={sectionTitle}>
          <span className="pdv-cashier-section-main">
            <SectionIcon aria-hidden="true" />
            <strong>{sectionTitle}</strong>
          </span>
        </div>

        {activeView === "menu" ? renderMenu() : null}
        {activeView === "sale" ? renderSale() : null}
        {isCommandsEnabled && activeView === "commands" ? renderCommands() : null}
        {isCommandsEnabled && activeView === "command-editor" ? renderCommandEditor() : null}
        {activeView === "agreement" ? renderAgreement() : null}
        {isExpensesEnabled && activeView === "expenses" ? renderExpenses() : null}
        {activeView === "history" ? renderHistory() : null}

        {isProductPickerOpen && (isCommandsEnabled || view !== "command-editor") ? (
          <ProductPickerModal
            categories={catalogCategories}
            isLoading={isCatalogLoading}
            loadError={catalogError}
            products={filteredProducts}
            isFiscalEmissionEnabled={isFiscalEmissionEnabled}
            searchQuery={searchQuery}
            selectedCategoryId={selectedPickerCategoryId}
            onCategoryChange={setSelectedPickerCategoryId}
            onSearchChange={setSearchQuery}
            onSelect={isCommandsEnabled && view === "command-editor" ? addProductToCommandEditor : addProduct}
            onClose={() => setIsProductPickerOpen(false)}
          />
        ) : null}
        {isCommandsEnabled && commandNameRequest ? (
          <CommandNameModal onClose={() => setCommandNameRequest(null)} onConfirm={confirmCommandName} />
        ) : null}
        {isCommandsEnabled && commandDeleteRequest ? (
          <DeleteCommandModal
            command={commandDeleteRequest}
            onClose={() => setCommandDeleteRequest(null)}
            onConfirm={confirmDeleteCommand}
          />
        ) : null}
        {isPaymentOpen && (!commandPaymentRequest || isCommandsEnabled) ? (
          <PaymentModal
            items={paymentItems}
            options={enabledPaymentOptions}
            totalCents={paymentTotalCents}
            onClose={closePaymentFlow}
            onConfirm={requestPaymentConfirmation}
          />
        ) : null}
        {isCashPaymentOpen && (!commandPaymentRequest || isCommandsEnabled) ? (
          <CashPaymentModal
            confirmLabel={cashPaymentTarget === "agreement-receipt" ? "Confirmar recebimento" : "Confirmar venda"}
            title={cashPaymentTarget === "agreement-receipt" ? "Receber convênio" : "Receber em dinheiro"}
            totalCents={cashPaymentTarget === "agreement-receipt" ? agreementReceiptPaymentTotalCents : paymentTotalCents}
            totalLabel={cashPaymentTarget === "agreement-receipt" ? "Total do convênio" : "Total da venda"}
            onClose={() => {
              setIsCashPaymentOpen(false);
              if (cashPaymentTarget === "sale") {
                setIsPaymentOpen(true);
              } else {
                setCashPaymentTarget("sale");
                setAgreementReceiptPaymentRequest(null);
              }
            }}
            onConfirm={() => {
              if (cashPaymentTarget === "agreement-receipt") {
                confirmAgreementReceiptPayment("dinheiro");
                return;
              }

              setIsCashPaymentOpen(false);
              setCashPaymentTarget("sale");
              confirmPayment("dinheiro");
            }}
          />
        ) : null}
        {isAgreementPaymentOpen && (!commandPaymentRequest || isCommandsEnabled) ? (
          <AgreementPaymentModal
            clients={activeAgreementClients}
            totalCents={paymentTotalCents}
            onBack={() => {
              setIsAgreementPaymentOpen(false);
              setIsPaymentOpen(true);
            }}
            onClose={closePaymentFlow}
            onConfirm={(client) => confirmPayment("convenio", client)}
          />
        ) : null}
        {agreementReceiptDetailsClient && !isCashPaymentOpen ? (
          <AgreementReceiptPaymentModal
            client={agreementReceiptDetailsClient}
            options={receiptPaymentOptions}
            receipts={selectedAgreementClientReceipts}
            onClose={() => {
              setAgreementReceiptDetailsClient(null);
              setAgreementReceiptPaymentRequest(null);
            }}
            onConfirm={requestAgreementReceiptPayment}
          />
        ) : null}
        {isExpensesEnabled && isExpenseOpen ? (
          <ExpenseModal
            expense={expenseEditRequest}
            onClose={closeExpenseModal}
            onConfirm={saveExpense}
            onDelete={expenseEditRequest ? () => deleteExpense(expenseEditRequest) : undefined}
          />
        ) : null}
        {isClosingSession && session ? (
          <CloseSessionModal
            session={session}
            salesTotalCents={sessionSales}
            salesByPayment={sessionSalesByPayment}
            expensesTotalCents={sessionExpenses}
            salesCount={sessionActiveSales.length}
            commandsCount={openCommandsCount}
            pendingSaleItemsCount={cartItems.length}
            onClose={() => {
              setIsClosingSession(false);
            }}
            onConfirm={closeSession}
          />
        ) : null}
        {employeeAuthRequest ? (
          <EmployeeAuthModal
            code={employeeAuthCode}
            error={employeeAuthError}
            isSubmitting={isEmployeeAuthSubmitting}
            mode={employeeAuthRequest.mode}
            onChangeCode={setEmployeeAuthCode}
            onClose={closeEmployeeAuthModal}
            onConfirm={confirmEmployeeAuth}
          />
        ) : null}
        {isSettingsOpen ? (
          <PdvSettingsModal
            catalogSyncedAt={catalogSyncedAt}
            catalogSyncError={catalogSyncError}
            connectivity={connectivity}
            eventSyncError={eventSyncError}
            isCatalogSyncing={isCatalogSyncing}
            isManualSyncing={isManualSyncing}
            lastAccessLabel={lastAccessLabel}
            localStoreScope={localStoreScope}
            onClose={() => setIsSettingsOpen(false)}
            onShowSyncDetails={() => setIsSyncDetailsOpen(true)}
            onSyncNow={syncNow}
            pdvIdentity={pdvIdentity}
            syncSummary={syncSummary}
          />
        ) : null}
        {isSyncDetailsOpen ? (
          <SyncFailureDetailsModal
            events={failedSyncEvents}
            fallbackMessage={eventSyncError || syncSummary.lastError || catalogSyncError}
            fiscalDocuments={failedFiscalDocuments}
            onClose={() => setIsSyncDetailsOpen(false)}
            onIgnoreEvent={ignoreFailedSyncEvent}
            onIgnoreFiscalDocument={ignoreFailedFiscalDocument}
          />
        ) : null}
        {selectedSale ? (
          <SaleDetailsModal
            fiscalDocuments={selectedSaleFiscalDocuments}
            isFiscalEmissionEnabled={isFiscalEmissionEnabled}
            isFiscalLoading={isSelectedSaleFiscalLoading}
            reprintingFiscalDocumentId={reprintingFiscalDocumentId}
            sale={selectedSale}
            saleDisplayTitle={getSaleOrdinalTitle(selectedSale, sessionRecordedSales)}
            onCancelRequest={requestCancelSale}
            onClose={() => setSelectedSale(null)}
            onReprintFiscal={reprintFiscalDocumentFromDetails}
            onRetryFiscal={(sale) => {
              if (!session) {
                onSystemMessage("Abra o caixa antes de tentar emitir o documento fiscal.");
                return;
              }

              if (!isFiscalEmissionEnabled) {
                onSystemMessage("Emissão fiscal desativada neste PDV.");
                return;
              }

              void emitFiscalDocumentForSale(sale, session);
            }}
          />
        ) : null}
        {saleCancelRequest ? (
          <CancelSaleModal
            onClose={() => setSaleCancelRequest(null)}
            onConfirm={confirmCancelSale}
          />
        ) : null}
        {completedSale ? <SaleSuccessModal sale={completedSale} onClose={() => setCompletedSale(null)} /> : null}
        {fiscalEmissionModal ? (
          <FiscalEmissionModal
            isPrinting={isFiscalPrinting}
            printMode={fiscalPrintMode}
            state={fiscalEmissionModal}
            onClose={() => setFiscalEmissionModal(null)}
            onPrint={printFiscalDocumentFromModal}
          />
        ) : null}
        {completedAgreementReceipt ? (
          <AgreementReceiptSuccessModal
            receipt={completedAgreementReceipt}
            onClose={() => setCompletedAgreementReceipt(null)}
          />
        ) : null}

        {session || view !== "menu" ? (
          <div className="pdv-cashier-runtime" aria-live="polite">
            <span className={connectivity === "online" ? "pdv-runtime-dot pdv-runtime-dot-online" : "pdv-runtime-dot"} />
            <span>{connectivity === "online" ? "Sessão online" : "Modo local"}</span>
            <em>{headerTurnLabel}</em>
            {headerEmployeeLabel ? <em>{headerEmployeeLabel}</em> : null}
            {syncSummary.failed > 0 ? <em>{syncSummary.failed} falhas</em> : null}
            {pendingSyncCount > 0 ? <em>{pendingSyncCount} pendentes</em> : null}
          </div>
        ) : null}
      </section>
    </>
  );
}

function PdvSettingsModal({
  catalogSyncedAt,
  catalogSyncError,
  connectivity,
  eventSyncError,
  isCatalogSyncing,
  isManualSyncing,
  localStoreScope,
  onClose,
  onShowSyncDetails,
  onSyncNow,
  pdvIdentity,
  syncSummary
}: {
  catalogSyncedAt: string | null;
  catalogSyncError: string;
  connectivity: ConnectivityState;
  eventSyncError: string;
  isCatalogSyncing: boolean;
  isManualSyncing: boolean;
  lastAccessLabel: string;
  localStoreScope: string;
  onClose: () => void;
  onShowSyncDetails: () => void;
  onSyncNow: () => void | Promise<void>;
  pdvIdentity: string;
  syncSummary: LocalPdvStoreSummary;
}) {
  const hasQueueProblem = syncSummary.failed > 0 || Boolean(eventSyncError);
  const queueLabel = syncSummary.failed > 0
    ? `${syncSummary.failed} ${syncSummary.failed === 1 ? "falha" : "falhas"}`
    : eventSyncError
      ? "Falha no envio"
    : syncSummary.pending > 0
      ? `${syncSummary.pending} ${syncSummary.pending === 1 ? "pendente" : "pendentes"}`
      : "Sem pendências";
  const syncStatusLabel = isManualSyncing ? "Sincronizando" : queueLabel;
  const lastSyncLabel = isCatalogSyncing
    ? "Atualizando dados"
    : `Última sincronização: ${formatSyncDateTime(syncSummary.lastSyncedAt ?? catalogSyncedAt)}`;
  const canSyncNow = !isManualSyncing;
  const [printSettings, setPrintSettings] = useState<PdvFiscalPrintSettings>(defaultPdvFiscalPrintSettings);
  const [fiscalSeries, setFiscalSeries] = useState(1);
  const [printerOptions, setPrinterOptions] = useState<string[]>([]);
  const [defaultPrinterName, setDefaultPrinterName] = useState("");
  const [isPrintConfigLoading, setIsPrintConfigLoading] = useState(false);
  const [isPrintConfigSaving, setIsPrintConfigSaving] = useState(false);
  const [printConfigFeedback, setPrintConfigFeedback] = useState("");
  const [printConfigFeedbackTone, setPrintConfigFeedbackTone] = useState<"neutral" | "success" | "error">("neutral");
  const printerChoices = useMemo(
    () => Array.from(new Set(
      [printSettings.printerName, defaultPrinterName, ...printerOptions]
        .map(printer => printer.trim())
        .filter(Boolean)
    )),
    [defaultPrinterName, printSettings.printerName, printerOptions]
  );
  const printerSelectOptions = useMemo(
    () => printerChoices.map(printer => ({ value: printer, label: printer })),
    [printerChoices]
  );
  const selectedPrinterName = printSettings.printerName || defaultPrinterName || "";
  const printerStatusMessage = isPrintConfigLoading
    ? "Buscando impressoras"
    : isPrintConfigSaving
      ? "Salvando"
      : printConfigFeedback || (printerChoices.length === 0 ? "Nenhuma impressora encontrada." : "");
  const printerStatusTone = printerChoices.length === 0 && !printConfigFeedback
    ? "neutral"
    : printConfigFeedbackTone;

  useEffect(() => {
    let isMounted = true;

    async function loadPrintSettings() {
      const store = getLocalPdvStore();

      if (!store) {
        return;
      }

      setIsPrintConfigLoading(true);
      setPrintConfigFeedback("");
      setPrintConfigFeedbackTone("neutral");

      try {
        const savedConfig = await store.getFiscalConfig?.({ scope: localStoreScope });
        const savedPrinting = getPdvFiscalPrintSettingsFromConfig(asRecord(savedConfig));
        const savedSeries = getPdvFiscalSeriesValue(asRecord(savedConfig)) ?? 1;

        if (isMounted) {
          setPrintSettings(savedPrinting);
          setFiscalSeries(savedSeries);
        }

        const response = await store.callFiscalWorker?.({
          scope: localStoreScope,
          command: "listar-impressoras-disponiveis",
          config: buildPdvFiscalPrintConfig(savedPrinting)
        });
        const responseData = response?.data as { printers?: unknown; defaultPrinter?: unknown } | null | undefined;
        const printers = Array.isArray(responseData?.printers)
          ? responseData.printers.filter((printer): printer is string => typeof printer === "string" && printer.trim().length > 0)
          : [];

        if (isMounted) {
          setPrinterOptions(printers);
          setDefaultPrinterName(typeof responseData?.defaultPrinter === "string" ? responseData.defaultPrinter : "");
        }
      } catch (error) {
        if (isMounted) {
          setPrintConfigFeedback(error instanceof Error ? error.message : "Não foi possível carregar a impressão local.");
          setPrintConfigFeedbackTone("error");
        }
      } finally {
        if (isMounted) {
          setIsPrintConfigLoading(false);
        }
      }
    }

    void loadPrintSettings();

    return () => {
      isMounted = false;
    };
  }, [localStoreScope]);

  async function savePrintSettings(nextSettings = printSettings) {
    const store = getLocalPdvStore();

    if (!store?.saveFiscalConfig) {
      setPrintConfigFeedback("Configuração local indisponível neste ambiente.");
      setPrintConfigFeedbackTone("error");
      return;
    }

    setIsPrintConfigSaving(true);
    setPrintConfigFeedback("");
    setPrintConfigFeedbackTone("neutral");

    try {
      const normalizedSettings = normalizePdvFiscalPrintSettings(nextSettings);
      const normalizedSeries = normalizePdvFiscalSeries(fiscalSeries);
      const currentConfig = await store.getFiscalConfig?.({ scope: localStoreScope });

      await store.saveFiscalConfig({
        scope: localStoreScope,
        config: mergePdvFiscalLocalSettings(asRecord(currentConfig), normalizedSettings, normalizedSeries)
      });
      setPrintSettings(normalizedSettings);
      setFiscalSeries(normalizedSeries);
      setPrintConfigFeedback("Salvo");
      setPrintConfigFeedbackTone("success");
    } catch (error) {
      setPrintConfigFeedback(error instanceof Error ? error.message : "Não foi possível salvar a impressão local.");
      setPrintConfigFeedbackTone("error");
    } finally {
      setIsPrintConfigSaving(false);
    }
  }

  function handlePrinterChange(printerName: string) {
    const nextSettings = normalizePdvFiscalPrintSettings({
      ...printSettings,
      useDefaultPrinter: false,
      printerName
    });

    setPrintSettings(nextSettings);
    void savePrintSettings(nextSettings);
  }

  return (
    <CashierModal
      title="Configurações do PDV"
      description={pdvIdentity}
      size="sm"
      onClose={onClose}
    >
      <div className="pdv-settings-panel">
        <section className="pdv-settings-section" aria-label="Sincronização do PDV">
          <div className="pdv-settings-section-head">
            <Cloud aria-hidden="true" size={20} />
            <div>
              <strong>Sincronização</strong>
              <span className={hasQueueProblem ? "pdv-settings-section-status-danger" : undefined}>{syncStatusLabel}</span>
              <em className="pdv-settings-sync-meta">{lastSyncLabel}</em>
            </div>
          </div>

          {hasQueueProblem ? (
            <button className="pdv-settings-inline-alert" type="button" onClick={onShowSyncDetails}>
              <span>Fila local</span>
              <strong>{queueLabel}</strong>
              <em>Ver detalhes</em>
            </button>
          ) : null}

          {eventSyncError || catalogSyncError ? (
            <p className="pdv-sync-message">{eventSyncError || catalogSyncError}</p>
          ) : null}

          <button className="pdv-sync-action" type="button" disabled={!canSyncNow} onClick={onSyncNow}>
            {isManualSyncing ? (
              <LoaderCircle aria-hidden="true" className="pdv-spin" size={17} />
            ) : (
              <RefreshCw aria-hidden="true" size={17} />
            )}
            {isManualSyncing
              ? "Sincronizando"
              : "Sincronizar agora"}
          </button>
        </section>

        <section className="pdv-settings-section pdv-settings-printing" aria-label="Impressão fiscal do PDV">
          <div className="pdv-settings-section-head">
            <Printer aria-hidden="true" size={20} />
            <div>
              <strong>Impressão fiscal</strong>
              {printerStatusMessage ? (
                <span className={`pdv-printing-feedback pdv-printing-feedback-${printerStatusTone}`}>
                  {printerStatusMessage}
                </span>
              ) : null}
            </div>
          </div>

          <div className="pdv-printing-field">
            <span>Impressora</span>
            <PdvPrinterSelect
              ariaLabel="Selecionar impressora fiscal"
              disabled={isPrintConfigLoading || isPrintConfigSaving || printerChoices.length === 0}
              options={printerSelectOptions}
              placeholder={printerChoices.length === 0 ? "Nenhuma impressora encontrada" : "Selecione uma impressora"}
              value={selectedPrinterName}
              onChange={handlePrinterChange}
            />
          </div>
        </section>
      </div>
    </CashierModal>
  );
}

type PdvPrinterSelectOption = {
  value: string;
  label: string;
};

function PdvPrinterSelect({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder,
  value
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: PdvPrinterSelectOption[];
  placeholder: string;
  value: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonId = useId();
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedValue, setHighlightedValue] = useState(value || options[0]?.value || "");
  const selectedOption = options.find(option => option.value === value) ?? null;
  const canOpen = !disabled && options.length > 0;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setHighlightedValue(value || options[0]?.value || "");
  }, [isOpen, options, value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function getOptionId(optionValue: string) {
    const optionIndex = options.findIndex(option => option.value === optionValue);

    return `${listboxId}-option-${optionIndex >= 0 ? optionIndex : "none"}`;
  }

  function moveHighlight(direction: 1 | -1) {
    if (!options.length) {
      return;
    }

    setHighlightedValue(currentValue => {
      const currentIndex = options.findIndex(option => option.value === (currentValue || value));
      const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + direction + options.length) % options.length;

      return options[nextIndex]?.value || "";
    });
  }

  function selectOption(nextValue: string) {
    if (!options.some(option => option.value === nextValue)) {
      return;
    }

    onChange(nextValue);
    setIsOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!canOpen) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      moveHighlight(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      moveHighlight(-1);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();

      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      if (highlightedValue) {
        selectOption(highlightedValue);
      }

      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div className="pdv-platform-select" data-open={isOpen ? "true" : undefined} ref={rootRef}>
      <button
        aria-activedescendant={isOpen && highlightedValue ? getOptionId(highlightedValue) : undefined}
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        className="pdv-platform-select-control"
        disabled={!canOpen}
        id={buttonId}
        onClick={() => setIsOpen(current => canOpen ? !current : false)}
        onKeyDown={handleKeyDown}
        role="combobox"
        type="button"
      >
        <span className="pdv-platform-select-value">
          <span className="pdv-platform-select-value-copy">{selectedOption?.label ?? placeholder}</span>
        </span>
        <ChevronDown aria-hidden="true" className="pdv-platform-select-chevron" size={17} />
      </button>

      {isOpen ? (
        <div aria-label={ariaLabel} className="pdv-platform-select-menu" id={listboxId} role="listbox">
          {options.map(option => {
            const isSelected = option.value === value;
            const isHighlighted = option.value === highlightedValue;

            return (
              <button
                aria-selected={isSelected}
                className="pdv-platform-select-option"
                data-highlighted={isHighlighted ? "true" : undefined}
                data-selected={isSelected ? "true" : undefined}
                id={getOptionId(option.value)}
                key={option.value}
                onClick={() => selectOption(option.value)}
                onMouseEnter={() => setHighlightedValue(option.value)}
                role="option"
                tabIndex={-1}
                type="button"
              >
                <span className="pdv-platform-select-option-copy">
                  <span>{option.label}</span>
                </span>

                {isSelected ? <Check aria-hidden="true" className="pdv-platform-select-check-icon" size={16} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getSyncEventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
    despesa_atualizada: "Despesa atualizada",
    despesa_excluida: "Despesa excluída",
    despesa_lancada: "Despesa",
    convenio_recebido: "Recebimento de convênio",
    turno_aberto: "Abertura de turno",
    turno_fechado: "Fechamento de turno",
    venda_cancelada: "Cancelamento de venda",
    venda_concluida: "Venda"
  };

  return labels[eventType] ?? (eventType || "Evento local");
}

function formatSyncFailureDate(value?: string | null) {
  return value ? formatSyncDateTime(value) : "Sem registro";
}

function SyncFailureDetailsModal({
  events,
  fallbackMessage,
  fiscalDocuments,
  onClose,
  onIgnoreEvent,
  onIgnoreFiscalDocument
}: {
  events: LocalPdvStorePendingEvent[];
  fallbackMessage?: string | null;
  fiscalDocuments: FiscalDocumentRecord[];
  onClose: () => void;
  onIgnoreEvent: (eventId: string) => void | Promise<void>;
  onIgnoreFiscalDocument: (documentId: string) => void | Promise<void>;
}) {
  const hasFailures = events.length > 0 || fiscalDocuments.length > 0;
  const [copiedFailureId, setCopiedFailureId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);
  const [ignoringFailureId, setIgnoringFailureId] = useState<string | null>(null);

  async function copyFailureExample(failureId: string, example: unknown) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(example, null, 2));
      setCopiedFailureId(failureId);
      setCopyErrorId(null);
    } catch {
      setCopiedFailureId(null);
      setCopyErrorId(failureId);
    }
  }

  async function ignoreFailure(failureId: string, action: () => void | Promise<void>) {
    setIgnoringFailureId(failureId);

    try {
      await action();
    } finally {
      setIgnoringFailureId(null);
    }
  }

  return (
    <CashierModal
      title="Detalhes da sincronização"
      description="Falhas gravadas na fila local."
      size="lg"
      onClose={onClose}
      footer={
        <button className="pdv-secondary-action" type="button" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {hasFailures ? (
        <div className="pdv-sync-failure-list">
          {events.map((event) => (
            <article className="pdv-sync-failure-row" key={event.id}>
              <span className="pdv-sync-failure-icon" aria-hidden="true">
                <AlertTriangle size={19} />
              </span>
              <div className="pdv-sync-failure-content">
                <div className="pdv-sync-failure-head">
                  <strong>{getSyncEventTypeLabel(event.event_type)}</strong>
                  <em>{event.attempts} {event.attempts === 1 ? "tentativa" : "tentativas"}</em>
                </div>
                <p>{event.last_error || fallbackMessage || "Evento recusado pela sincronização."}</p>
                <dl className="pdv-sync-failure-meta">
                  <div>
                    <dt>ID local</dt>
                    <dd>{event.id}</dd>
                  </div>
                  <div>
                    <dt>Agregado</dt>
                    <dd>{event.aggregate_type} · {event.aggregate_id}</dd>
                  </div>
                  <div>
                    <dt>Criado</dt>
                    <dd>{formatSyncFailureDate(event.created_at)}</dd>
                  </div>
                  <div>
                    <dt>Falhou em</dt>
                    <dd>{formatSyncFailureDate(event.updated_at)}</dd>
                  </div>
                </dl>
                <details className="pdv-sync-failure-technical">
                  <summary>Dados técnicos</summary>
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                </details>
                <div className="pdv-sync-failure-actions">
                  <button
                    className="pdv-sync-failure-copy"
                    type="button"
                    onClick={() => copyFailureExample(`event:${event.id}`, {
                      tipo: "evento",
                      id: event.id,
                      event_type: event.event_type,
                      aggregate_type: event.aggregate_type,
                      aggregate_id: event.aggregate_id,
                      idempotency_key: event.idempotency_key,
                      attempts: event.attempts,
                      last_error: event.last_error,
                      payload: event.payload
                    })}
                  >
                    <Copy aria-hidden="true" size={15} />
                    {copiedFailureId === `event:${event.id}`
                      ? "Copiado"
                      : copyErrorId === `event:${event.id}`
                        ? "Falhou"
                        : "Copiar exemplo"}
                  </button>
                  <button
                    className="pdv-sync-failure-ignore"
                    disabled={ignoringFailureId === `event:${event.id}`}
                    type="button"
                    onClick={() => ignoreFailure(`event:${event.id}`, () => onIgnoreEvent(event.id))}
                  >
                    {ignoringFailureId === `event:${event.id}` ? (
                      <LoaderCircle aria-hidden="true" className="pdv-spin" size={15} />
                    ) : (
                      <Ban aria-hidden="true" size={15} />
                    )}
                    {ignoringFailureId === `event:${event.id}` ? "Ignorando" : "Ignorar erro"}
                  </button>
                </div>
              </div>
            </article>
          ))}
          {fiscalDocuments.map((document) => (
            <article className="pdv-sync-failure-row" key={document.id}>
              <span className="pdv-sync-failure-icon" aria-hidden="true">
                <AlertTriangle size={19} />
              </span>
              <div className="pdv-sync-failure-content">
                <div className="pdv-sync-failure-head">
                  <strong>{document.modelo === "55" ? "NF-e" : "NFC-e"}</strong>
                  <em>{Number(document.sync_attempts || 0)} {Number(document.sync_attempts || 0) === 1 ? "tentativa" : "tentativas"}</em>
                </div>
                <p>{document.sync_error || document.mensagem_operador || fallbackMessage || "Documento fiscal recusado pela sincronização."}</p>
                <dl className="pdv-sync-failure-meta">
                  <div>
                    <dt>ID local</dt>
                    <dd>{document.id}</dd>
                  </div>
                  <div>
                    <dt>Nota</dt>
                    <dd>Série {document.serie || "-"} · Nº {document.numero || "-"}</dd>
                  </div>
                  <div>
                    <dt>Venda</dt>
                    <dd>{document.venda_id || "Não vinculada"}</dd>
                  </div>
                  <div>
                    <dt>Falhou em</dt>
                    <dd>{formatSyncFailureDate(document.updated_at)}</dd>
                  </div>
                </dl>
                <details className="pdv-sync-failure-technical">
                  <summary>Dados técnicos</summary>
                  <pre>{JSON.stringify(document.raw_result, null, 2)}</pre>
                </details>
                <div className="pdv-sync-failure-actions">
                  <button
                    className="pdv-sync-failure-copy"
                    type="button"
                    onClick={() => copyFailureExample(`document:${document.id}`, {
                      tipo: "documento_fiscal",
                      id: document.id,
                      venda_id: document.venda_id,
                      modelo: document.modelo,
                      serie: document.serie,
                      numero: document.numero,
                      chave: document.chave,
                      status: document.status,
                      sync_status: document.sync_status,
                      sync_attempts: document.sync_attempts,
                      sync_error: document.sync_error,
                      raw_result: document.raw_result
                    })}
                  >
                    <Copy aria-hidden="true" size={15} />
                    {copiedFailureId === `document:${document.id}`
                      ? "Copiado"
                      : copyErrorId === `document:${document.id}`
                        ? "Falhou"
                        : "Copiar exemplo"}
                  </button>
                  <button
                    className="pdv-sync-failure-ignore"
                    disabled={ignoringFailureId === `document:${document.id}`}
                    type="button"
                    onClick={() => ignoreFailure(`document:${document.id}`, () => onIgnoreFiscalDocument(document.id))}
                  >
                    {ignoringFailureId === `document:${document.id}` ? (
                      <LoaderCircle aria-hidden="true" className="pdv-spin" size={15} />
                    ) : (
                      <Ban aria-hidden="true" size={15} />
                    )}
                    {ignoringFailureId === `document:${document.id}` ? "Ignorando" : "Ignorar erro"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="pdv-sync-failure-empty">
          <AlertTriangle aria-hidden="true" size={22} />
          <strong>{fallbackMessage || "A API recusou a sincronização."}</strong>
        </div>
      )}
    </CashierModal>
  );
}

function CommandNameModal({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const trimmedTitle = formatCommandTitle(title).trim();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!trimmedTitle) {
      return;
    }

    onConfirm(trimmedTitle);
  }

  return (
    <CashierModal
      title="Nome da comanda"
      description="Identifique mesa, cliente ou atendimento."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="pdv-confirm-action" type="submit" form="pdv-command-name-form" disabled={!trimmedTitle}>
            <ReceiptText aria-hidden="true" size={17} />
            Criar
          </button>
        </>
      }
    >
      <form className="pdv-modal-form" id="pdv-command-name-form" onSubmit={handleSubmit}>
        <label>
          <span>Nome</span>
          <input
            ref={inputRef}
            value={title}
            onChange={(event) => setTitle(formatCommandTitle(event.target.value))}
            placeholder="Ex.: Mesa 4"
          />
        </label>
      </form>
    </CashierModal>
  );
}

function DeleteCommandModal({
  command,
  onClose,
  onConfirm
}: {
  command: CommandDeleteRequest;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <CashierModal
      title="Excluir comanda"
      description="Essa comanda será removida da lista de atendimentos abertos."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="pdv-danger-action" type="button" onClick={onConfirm}>
            <Trash2 aria-hidden="true" size={17} />
            Excluir comanda
          </button>
        </>
      }
    >
      <div className="pdv-delete-command-summary">
        <span>
          <strong>{command.title}</strong>
          <em>
            {command.itemsCount} {command.itemsCount === 1 ? "item" : "itens"}
          </em>
        </span>
        <strong>{formatCurrency(command.totalCents)}</strong>
      </div>
    </CashierModal>
  );
}

function ProductPickerModal({
  categories,
  isLoading,
  loadError,
  products,
  isFiscalEmissionEnabled,
  searchQuery,
  selectedCategoryId,
  onCategoryChange,
  onSearchChange,
  onSelect,
  onClose
}: {
  categories: ProductCategory[];
  isLoading: boolean;
  loadError: string;
  products: Product[];
  isFiscalEmissionEnabled: boolean;
  searchQuery: string;
  selectedCategoryId: string;
  onCategoryChange: (categoryId: string) => void;
  onSearchChange: (value: string) => void;
  onSelect: (product: Product) => void;
  onClose: () => void;
}) {
  const pickerSearchRef = useRef<HTMLInputElement | null>(null);
  const [activeProductId, setActiveProductId] = useState("");
  const visibleCategories = useMemo(
    () => categories.filter((category) => category.productsCount > 0 || products.some((product) => product.categoryId === category.id)),
    [categories, products]
  );
  const groupedProducts = useMemo(() => {
    const byCategory = new Map<string, { category: ProductCategory; products: Product[] }>();

    products.forEach((product) => {
      const fallbackCategory: ProductCategory = {
        id: product.categoryId ?? "sem-categoria",
        name: product.category,
        icon: product.categoryIcon,
        color: product.categoryColor,
        accent: product.categoryAccent ?? getCategoryTone(null).accent,
        productsCount: 0
      };
      const category = categories.find((item) => item.id === product.categoryId) ?? fallbackCategory;
      const currentGroup = byCategory.get(category.id);

      if (currentGroup) {
        currentGroup.products.push(product);
        return;
      }

      byCategory.set(category.id, { category, products: [product] });
    });

    return Array.from(byCategory.values());
  }, [categories, products]);
  const selectableProducts = useMemo(
    () => isFiscalEmissionEnabled
      ? products.filter((product) => getProductFiscalIssues(product).length === 0)
      : products,
    [isFiscalEmissionEnabled, products]
  );

  useEffect(() => {
    pickerSearchRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveProductId(selectableProducts[0]?.id ?? "");
  }, [selectableProducts]);

  const activeProduct = selectableProducts.find((product) => product.id === activeProductId) ?? selectableProducts[0] ?? null;

  return (
    <CashierModal
      title="Adicionar produto"
      description="Localize o item e selecione para incluir na venda."
      size="lg"
      onClose={onClose}
    >
      <label className="pdv-search-field pdv-product-picker-search">
        <Search aria-hidden="true" size={22} />
        <input
          ref={pickerSearchRef}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && activeProduct) {
              event.preventDefault();
              onSelect(activeProduct);
              return;
            }

            if (event.key === "ArrowDown" && selectableProducts.length > 0) {
              event.preventDefault();
              const currentIndex = Math.max(0, selectableProducts.findIndex((product) => product.id === activeProductId));
              const nextProduct = selectableProducts[Math.min(selectableProducts.length - 1, currentIndex + 1)];
              setActiveProductId(nextProduct.id);
              return;
            }

            if (event.key === "ArrowUp" && selectableProducts.length > 0) {
              event.preventDefault();
              const currentIndex = Math.max(0, selectableProducts.findIndex((product) => product.id === activeProductId));
              const nextProduct = selectableProducts[Math.max(0, currentIndex - 1)];
              setActiveProductId(nextProduct.id);
            }
          }}
          placeholder="Buscar por produto, código ou categoria"
        />
      </label>

      <div className="pdv-product-picker-filters" aria-label="Filtrar produtos por categoria">
        <button
          className={selectedCategoryId === "all" ? "pdv-filter-chip pdv-filter-chip-active" : "pdv-filter-chip"}
          type="button"
          onClick={() => onCategoryChange("all")}
        >
          Todos
        </button>
        {visibleCategories.map((category) => (
          <button
            className={selectedCategoryId === category.id ? "pdv-filter-chip pdv-filter-chip-active" : "pdv-filter-chip"}
            key={category.id}
            type="button"
            onClick={() => onCategoryChange(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="pdv-product-picker-list">
        {isLoading ? (
          <>
            <span className="pdv-product-picker-skeleton" />
            <span className="pdv-product-picker-skeleton" />
            <span className="pdv-product-picker-skeleton" />
          </>
        ) : null}

        {!isLoading && groupedProducts.map(({ category, products: categoryProducts }) => (
          <section
            className="pdv-product-picker-category"
            key={category.id}
            style={{ "--pdv-category-accent": category.accent } as CSSProperties}
          >
            <div className="pdv-list-title">
              <CategoryBadge category={category} />
              <strong>{category.name}</strong>
              <em>{categoryProducts.length} {categoryProducts.length === 1 ? "produto" : "produtos"}</em>
            </div>

            <div className="pdv-product-picker-category-items">
              {categoryProducts.map((product) => {
                const fiscalIssues = isFiscalEmissionEnabled ? getProductFiscalIssues(product) : [];
                const fiscalWarning = formatProductFiscalIssues(fiscalIssues);
                const isFiscalBlocked = fiscalIssues.length > 0;
                const isActive = !isFiscalBlocked && product.id === activeProductId;
                const rowClassName = [
                  "pdv-product-row",
                  "pdv-product-picker-row",
                  isActive ? "pdv-product-picker-row-active" : "",
                  isFiscalBlocked ? "pdv-product-picker-row-disabled" : ""
                ].filter(Boolean).join(" ");

                return (
                  <button
                    className={rowClassName}
                    key={product.id}
                    type="button"
                    aria-disabled={isFiscalBlocked}
                    aria-selected={isActive}
                    disabled={isFiscalBlocked}
                    onPointerEnter={(event) => {
                      if (isFiscalBlocked) {
                        return;
                      }

                      setPointerWaveOrigin(event);
                      setActiveProductId(product.id);
                    }}
                    onClick={() => onSelect(product)}
                  >
                    <ProductThumbnail
                      backgroundColor={product.categoryColor}
                      color={product.categoryAccent}
                      icon={product.categoryIcon}
                      imageUrl={product.imageUrl}
                      label={product.category}
                    />
                    <span className="pdv-product-copy">
                      <strong>{product.name}</strong>
                      <em className="pdv-product-detail-line">
                        <span>{product.barcode ? `Código ${product.barcode}` : "Sem código de barras"}</span>
                        <span>Estoque {formatStockQuantity(product.stockQuantity)}</span>
                      </em>
                      {fiscalWarning ? <span className="pdv-product-fiscal-warning">{fiscalWarning}</span> : null}
                    </span>
                    <span className="pdv-product-picker-meta">
                      <span>
                        <em>Preço</em>
                        <strong>{formatCurrency(product.priceCents)}</strong>
                      </span>
                    </span>
                    {isFiscalBlocked ? <AlertTriangle aria-hidden="true" size={18} /> : <Plus aria-hidden="true" size={18} />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {!isLoading && products.length === 0 ? (
          <div className="pdv-empty-state">
            <Search aria-hidden="true" size={22} />
            <strong>{loadError ? "Catálogo indisponível" : "Nenhum produto encontrado"}</strong>
            {loadError ? <span>{loadError}</span> : null}
          </div>
        ) : null}

      </div>
    </CashierModal>
  );
}

function ExpenseModal({
  expense,
  onClose,
  onConfirm,
  onDelete
}: {
  expense?: CashExpenseRecord | null;
  onClose: () => void;
  onConfirm: (title: string, amountCents: number) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(expense ? formatCurrencyInput(String(expense.amountCents)) : "");
  const amountCents = parseCurrencyCents(amount);
  const isEditing = Boolean(expense);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || amountCents <= 0) {
      return;
    }

    onConfirm(title.trim(), amountCents);
  }

  return (
    <CashierModal
      title={isEditing ? "Editar despesa" : "Lançar despesa"}
      description="Saída de dinheiro do caixa."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          {onDelete ? (
            <button className="pdv-danger-action" type="button" onClick={onDelete}>
              <Trash2 aria-hidden="true" size={17} />
              Excluir
            </button>
          ) : null}
          <button className="pdv-confirm-action" type="submit" form="pdv-expense-form" disabled={!title.trim() || amountCents <= 0}>
            <Check aria-hidden="true" size={17} />
            {isEditing ? "Salvar" : "Salvar despesa"}
          </button>
        </>
      }
    >
      <form className="pdv-modal-form" id="pdv-expense-form" onSubmit={handleSubmit}>
        <label>
          <span>Descrição</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Compra de gelo" />
        </label>
        <label>
          <span>Valor</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(formatCurrencyInput(event.target.value))}
            placeholder="R$ 0,00"
          />
        </label>
      </form>
    </CashierModal>
  );
}

function PaymentModal({
  items,
  options,
  totalCents,
  onClose,
  onConfirm
}: {
  items: CartItem[];
  options: typeof paymentOptions;
  totalCents: number;
  onClose: () => void;
  onConfirm: (method: PaymentMethod) => void;
}) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const selectedOption = selectedMethod ? getPaymentOption(selectedMethod) : null;
  const SelectedIcon = selectedOption?.icon ?? CreditCard;

  useEffect(() => {
    if (selectedMethod && !options.some((option) => option.id === selectedMethod)) {
      setSelectedMethod(null);
    }
  }, [options, selectedMethod]);

  return (
    <CashierModal
      title="Finalizar venda"
      description="Revise os itens e escolha como receber."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="pdv-confirm-action"
            type="button"
            onClick={() => selectedMethod && onConfirm(selectedMethod)}
            disabled={!selectedMethod}
          >
            {selectedMethod === "dinheiro" ? (
              <Banknote aria-hidden="true" size={17} />
            ) : selectedMethod === "convenio" ? (
              <SelectedIcon aria-hidden="true" size={17} />
            ) : selectedMethod ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <CreditCard aria-hidden="true" size={17} />
            )}
            {selectedMethod === "dinheiro"
              ? "Informar valor"
              : selectedMethod === "convenio"
                ? "Buscar cliente"
                : selectedMethod
                  ? "Confirmar venda"
                  : "Escolha o pagamento"}
          </button>
        </>
      }
    >
      <div className="pdv-payment-flow">
        <section className="pdv-checkout-list" aria-label="Itens da venda">
          <div className="pdv-checkout-list-head" aria-hidden="true">
            <span>Produto</span>
            <span>Quantidade</span>
            <span>Total</span>
          </div>
          <div className="pdv-checkout-list-body">
            {items.map((item) => (
              <div className="pdv-checkout-item" key={item.id}>
                <ProductThumbnail
                  backgroundColor={item.categoryColor}
                  color={item.categoryAccent}
                  icon={item.categoryIcon}
                  imageUrl={item.imageUrl}
                  label={item.category}
                  size="sm"
                />
                <span className="pdv-checkout-product">
                  <strong>{item.name}</strong>
                  <em>
                    <span>{formatCurrency(item.priceCents)}</span>
                  </em>
                </span>
                <span className="pdv-checkout-quantity">
                  <strong>{item.quantity}</strong>
                </span>
                <span className="pdv-checkout-total">
                  <strong>{formatCurrency(item.quantity * item.priceCents)}</strong>
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="pdv-sale-total-inline pdv-payment-total-inline" aria-live="polite">
          <span>Total da venda</span>
          <strong>{formatCurrency(totalCents)}</strong>
        </div>

        <section className="pdv-payment-method-section" aria-label="Formas de pagamento">
          <span className="pdv-payment-section-title">Informe a forma de pagamento</span>
          <div className="pdv-payment-methods">
            {options.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  className={selectedMethod === option.id ? "pdv-payment-method pdv-payment-method-active" : "pdv-payment-method"}
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedMethod(option.id)}
                >
                  <Icon aria-hidden="true" size={20} />
                  <span>
                    <strong>{option.label}</strong>
                    <em>{option.description}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </CashierModal>
  );
}

function CashPaymentModal({
  confirmLabel = "Confirmar venda",
  title = "Receber em dinheiro",
  totalCents,
  totalLabel = "Total da venda",
  onClose,
  onConfirm
}: {
  confirmLabel?: string;
  title?: string;
  totalCents: number;
  totalLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [receivedAmount, setReceivedAmount] = useState(() => formatCurrency(totalCents));
  const inputRef = useRef<HTMLInputElement | null>(null);
  const receivedCents = parseCurrencyCents(receivedAmount);
  const missingCents = Math.max(0, totalCents - receivedCents);
  const changeCents = Math.max(0, receivedCents - totalCents);
  const canConfirm = receivedCents >= totalCents;
  const balanceLabel = receivedCents === 0 ? "Troco" : missingCents > 0 ? "Falta receber" : "Troco";
  const balanceValue = receivedCents > 0 && missingCents > 0 ? missingCents : changeCents;
  const balanceDisplay = canConfirm && changeCents === 0 ? "Sem troco" : formatCurrency(balanceValue);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canConfirm) {
      return;
    }

    onConfirm();
  }

  return (
    <CashierModal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="pdv-confirm-action" type="submit" form="pdv-cash-payment-form" disabled={!canConfirm}>
            <Check aria-hidden="true" size={17} />
            {confirmLabel}
          </button>
        </>
      }
    >
      <form className="pdv-cash-payment" id="pdv-cash-payment-form" onSubmit={handleSubmit}>
        <div className="pdv-cash-payment-total">
          <span>
            <Banknote aria-hidden="true" size={18} />
            {totalLabel}
          </span>
          <strong>{formatCurrency(totalCents)}</strong>
        </div>

        <label className="pdv-cash-payment-received">
          <span>Valor recebido</span>
          <input
            ref={inputRef}
            inputMode="numeric"
            value={receivedAmount}
            onChange={(event) => setReceivedAmount(formatCurrencyInput(event.target.value))}
            placeholder="R$ 0,00"
          />
        </label>

        <div
          className={
            receivedCents > 0 && missingCents > 0
              ? "pdv-cash-payment-balance pdv-cash-payment-balance-danger"
              : "pdv-cash-payment-balance"
          }
          aria-live="polite"
        >
          <span>{balanceLabel}</span>
          <strong>{balanceDisplay}</strong>
        </div>
      </form>
    </CashierModal>
  );
}

function AgreementPaymentModal({
  clients,
  totalCents,
  onBack,
  onClose,
  onConfirm
}: {
  clients: AgreementClient[];
  totalCents: number;
  onBack: () => void;
  onClose: () => void;
  onConfirm: (client: AgreementClient) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<AgreementClient | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const filteredClients = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    if (!normalizedQuery) {
      return clients;
    }

    return clients.filter((client) => normalizeSearch(client.name).includes(normalizedQuery));
  }, [clients, query]);
  const [activeClientId, setActiveClientId] = useState<number | null>(filteredClients[0]?.id ?? null);
  const activeClient = filteredClients.find((client) => client.id === activeClientId) ?? filteredClients[0] ?? null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveClientId(filteredClients[0]?.id ?? null);
  }, [filteredClients]);

  return (
    <CashierModal
      title={selectedClient ? "Confirmar convênio" : "Receber em convênio"}
      description={selectedClient ? "Revise o cliente e finalize a venda." : "Selecione o cliente que ficará responsável pela pendência."}
      onClose={onClose}
      footer={
        selectedClient ? (
          <>
            <button className="pdv-secondary-action" type="button" onClick={() => setSelectedClient(null)}>
              <ArrowLeft aria-hidden="true" size={17} />
              Trocar cliente
            </button>
            <button className="pdv-confirm-action" type="button" onClick={() => onConfirm(selectedClient)}>
              <Check aria-hidden="true" size={17} />
              Finalizar venda
            </button>
          </>
        ) : (
          <button className="pdv-secondary-action" type="button" onClick={onBack}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
        )
      }
    >
      <div className="pdv-agreement-payment">
        {selectedClient ? (
          <section className="pdv-agreement-summary" aria-label="Resumo do convênio">
            <span className="pdv-agreement-summary-label">Cliente selecionado</span>
            <div className="pdv-agreement-summary-client">
              <span className="pdv-record-icon">
                <AgreementClientIcon client={selectedClient} />
              </span>
              <span className="pdv-record-copy">
                <strong>{selectedClient.name}</strong>
                <em>{getAgreementClientTypeLabel(selectedClient)}</em>
              </span>
            </div>
            <div className="pdv-agreement-summary-total">
              <span>Total da venda</span>
              <strong>{formatCurrency(totalCents)}</strong>
            </div>
          </section>
        ) : (
          <>
            <label className="pdv-agreement-search">
              <Search aria-hidden="true" size={19} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && activeClient) {
                    event.preventDefault();
                    setSelectedClient(activeClient);
                    return;
                  }

                  if (event.key === "ArrowDown" && filteredClients.length > 0) {
                    event.preventDefault();
                    const currentIndex = Math.max(0, filteredClients.findIndex((client) => client.id === activeClientId));
                    const nextClient = filteredClients[Math.min(filteredClients.length - 1, currentIndex + 1)];
                    setActiveClientId(nextClient.id);
                    return;
                  }

                  if (event.key === "ArrowUp" && filteredClients.length > 0) {
                    event.preventDefault();
                    const currentIndex = Math.max(0, filteredClients.findIndex((client) => client.id === activeClientId));
                    const nextClient = filteredClients[Math.max(0, currentIndex - 1)];
                    setActiveClientId(nextClient.id);
                  }
                }}
                placeholder="Buscar cliente"
                type="search"
              />
            </label>

            <div className="pdv-agreement-client-list" aria-label="Clientes de convênio">
              {filteredClients.map((client) => (
                <button
                  className={
                    client.id === activeClient?.id
                      ? "pdv-agreement-client-row pdv-agreement-client-row-active"
                      : "pdv-agreement-client-row"
                  }
                  key={client.id}
                  type="button"
                  onPointerEnter={() => setActiveClientId(client.id)}
                  onClick={() => setSelectedClient(client)}
                >
                  <span className="pdv-record-icon">
                    <AgreementClientIcon client={client} />
                  </span>
                  <span className="pdv-record-copy">
                    <strong>{client.name}</strong>
                    <em>{getAgreementClientTypeLabel(client)}</em>
                  </span>
                  <ArrowRight aria-hidden="true" size={18} />
                </button>
              ))}

              {filteredClients.length === 0 ? (
                <div className="pdv-empty-state">
                  <Search aria-hidden="true" size={22} />
                  <strong>Nenhum cliente encontrado</strong>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </CashierModal>
  );
}

function AgreementReceiptPaymentModal({
  client,
  receipts,
  options,
  onClose,
  onConfirm
}: {
  client: AgreementClient;
  receipts: AgreementReceiptRecord[];
  options: typeof paymentOptions;
  onClose: () => void;
  onConfirm: (method: ReceiptPaymentMethod, receipts: AgreementReceiptRecord[], client: AgreementClient) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgreementReceiptStatusFilter>("pendente");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [selectedMethod, setSelectedMethod] = useState<ReceiptPaymentMethod | null>(null);
  const pendingReceipts = useMemo(
    () => receipts.filter((receipt) => receipt.status === "pendente"),
    [receipts]
  );
  const paidReceipts = useMemo(
    () => receipts.filter((receipt) => receipt.status === "pago"),
    [receipts]
  );
  const filteredReceipts = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return receipts.filter((receipt) => {
      if (receipt.status !== statusFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        receipt.title,
        receipt.code,
        formatDateTime(receipt.createdAt),
        receipt.paymentMethod ? getPaymentLabel(receipt.paymentMethod) : ""
      ].join(" ");

      return normalizeSearch(searchableText).includes(normalizedQuery);
    });
  }, [query, receipts, statusFilter]);
  const selectedReceipts = pendingReceipts.filter((receipt) => selectedIds.has(receipt.id));
  const selectedTotalCents = selectedReceipts.reduce((total, receipt) => total + receipt.totalCents, 0);
  const selectedItemsCount = selectedReceipts.reduce((total, receipt) => total + receipt.itemsCount, 0);
  const pendingTotalCents = pendingReceipts.reduce((total, receipt) => total + receipt.totalCents, 0);
  const visiblePendingReceipts = filteredReceipts.filter((receipt) => receipt.status === "pendente");
  const allVisiblePendingSelected =
    visiblePendingReceipts.length > 0 && visiblePendingReceipts.every((receipt) => selectedIds.has(receipt.id));
  const canConfirmReceipt = selectedReceipts.length > 0 && selectedMethod !== null;

  useEffect(() => {
    const pendingIds = new Set(pendingReceipts.map((receipt) => receipt.id));

    setSelectedIds((currentIds) => {
      const nextIds = new Set([...currentIds].filter((receiptId) => pendingIds.has(receiptId)));

      return nextIds.size === currentIds.size ? currentIds : nextIds;
    });
  }, [pendingReceipts]);

  function toggleReceiptSelection(receipt: AgreementReceiptRecord) {
    if (receipt.status !== "pendente") {
      return;
    }

    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (nextIds.has(receipt.id)) {
        nextIds.delete(receipt.id);
      } else {
        nextIds.add(receipt.id);
      }

      return nextIds;
    });
  }

  function toggleVisiblePendingReceipts() {
    if (visiblePendingReceipts.length === 0) {
      return;
    }

    setSelectedIds((currentIds) => {
      const nextIds = new Set(currentIds);

      if (allVisiblePendingSelected) {
        visiblePendingReceipts.forEach((receipt) => nextIds.delete(receipt.id));
      } else {
        visiblePendingReceipts.forEach((receipt) => nextIds.add(receipt.id));
      }

      return nextIds;
    });
  }

  return (
    <CashierModal
      title="Detalhes do convênio"
      description={client.name}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="pdv-confirm-action"
            type="button"
            onClick={() => selectedMethod && onConfirm(selectedMethod, selectedReceipts, client)}
            disabled={!canConfirmReceipt}
          >
            <CreditCard aria-hidden="true" size={17} />
            {selectedMethod === "dinheiro"
              ? "Receber em dinheiro"
              : selectedMethod
                ? "Finalizar recebimento"
                : "Escolha o pagamento"}
          </button>
        </>
      }
    >
      <div className="pdv-agreement-detail">
        <section className="pdv-agreement-detail-summary" aria-label="Resumo do cliente">
          <span className="pdv-record-icon">
            <AgreementClientIcon client={client} />
          </span>
          <span className="pdv-record-copy">
            <strong>{client.name}</strong>
            <em>{getAgreementClientTypeLabel(client)}</em>
          </span>
          <span
            className="pdv-command-line-total pdv-agreement-detail-total"
            aria-label={`${pendingReceipts.length} ${pendingReceipts.length === 1 ? "nota aberta" : "notas abertas"}, total ${formatCurrency(pendingTotalCents)}`}
          >
            <strong>{formatCurrency(pendingTotalCents)}</strong>
          </span>
        </section>

        <div className="pdv-agreement-detail-toolbar">
          <label className="pdv-agreement-search">
            <Search aria-hidden="true" size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nota"
              type="search"
            />
          </label>
          <div className="pdv-agreement-status-filter" aria-label="Filtro de notas">
            <button
              className={
                statusFilter === "pendente"
                  ? "pdv-status-filter-chip pdv-status-filter-chip-active"
                  : "pdv-status-filter-chip"
              }
              type="button"
              aria-pressed={statusFilter === "pendente"}
              onClick={() => setStatusFilter("pendente")}
            >
              Pendentes
              <span>{pendingReceipts.length}</span>
            </button>
            <button
              className={
                statusFilter === "pago"
                  ? "pdv-status-filter-chip pdv-status-filter-chip-active"
                  : "pdv-status-filter-chip"
              }
              type="button"
              aria-pressed={statusFilter === "pago"}
              onClick={() => setStatusFilter("pago")}
            >
              Pagas
              <span>{paidReceipts.length}</span>
            </button>
          </div>
        </div>

        <div className="pdv-agreement-note-list-head">
          <span>{statusFilter === "pendente" ? "Notas em aberto" : "Notas pagas"}</span>
          {statusFilter === "pendente" && visiblePendingReceipts.length > 0 ? (
            <button type="button" onClick={toggleVisiblePendingReceipts}>
              {allVisiblePendingSelected ? "Limpar seleção" : "Selecionar visíveis"}
            </button>
          ) : null}
        </div>

        {filteredReceipts.length > 0 ? (
          <div className="pdv-agreement-note-list" aria-label="Notas do cliente">
            {filteredReceipts.map((receipt) => {
              const selected = selectedIds.has(receipt.id);
              const paid = receipt.status === "pago";

              return (
                <button
                  className={selected ? "pdv-agreement-note-row pdv-agreement-note-row-selected" : "pdv-agreement-note-row"}
                  key={receipt.id}
                  type="button"
                  onClick={() => toggleReceiptSelection(receipt)}
                >
                  <span className="pdv-agreement-note-check" aria-hidden="true">
                    {paid ? <CreditCard size={16} /> : selected ? <Check size={17} /> : null}
                  </span>
                  <span className="pdv-record-copy">
                    <strong>{receipt.title}</strong>
                    <em className="pdv-sale-item-meta">
                      <span>{formatDateTime(receipt.createdAt)}</span>
                      <span>{receipt.itemsCount} {receipt.itemsCount === 1 ? "item" : "itens"}</span>
                    </em>
                  </span>
                  <span className="pdv-command-line-total">
                    <em>
                      {paid
                        ? `Pago${receipt.receivedAt ? ` em ${formatDateTime(receipt.receivedAt)}` : ""}`
                        : "Pendente"}
                    </em>
                    <strong>{formatCurrency(receipt.totalCents)}</strong>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <section className="pdv-agreement-note-empty" aria-label="Nenhuma nota encontrada">
            <ReceiptText aria-hidden="true" size={24} />
            <strong>Nenhuma nota encontrada</strong>
          </section>
        )}

        <section className="pdv-agreement-receive-footer" aria-label="Resumo do recebimento">
          <span>
            <em>Selecionado</em>
            <strong>
              {selectedReceipts.length} {selectedReceipts.length === 1 ? "nota" : "notas"} · {selectedItemsCount}{" "}
              {selectedItemsCount === 1 ? "item" : "itens"}
            </strong>
          </span>
          <strong>{formatCurrency(selectedTotalCents)}</strong>
        </section>

        <section className="pdv-payment-method-section pdv-agreement-method-section" aria-label="Formas de pagamento">
          <span className="pdv-payment-section-title">Forma de pagamento</span>
          <div className="pdv-payment-methods">
            {options.map((option) => {
              if (option.id === "convenio") {
                return null;
              }

              const Icon = option.icon;
              const method = option.id as ReceiptPaymentMethod;
              const isActive = selectedMethod === method;

              return (
                <button
                  className={isActive ? "pdv-payment-method pdv-payment-method-active" : "pdv-payment-method"}
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedMethod(method)}
                >
                  <Icon aria-hidden="true" size={20} />
                  <span>
                    <strong>{option.label}</strong>
                    <em>{option.description}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </CashierModal>
  );
}

function CloseSessionModal({
  session,
  salesTotalCents,
  salesByPayment,
  expensesTotalCents,
  salesCount,
  commandsCount,
  pendingSaleItemsCount,
  onClose,
  onConfirm
}: {
  session: CashierSession;
  salesTotalCents: number;
  salesByPayment: PaymentBreakdownItem[];
  expensesTotalCents: number;
  salesCount: number;
  commandsCount: number;
  pendingSaleItemsCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const cashSalesCents = salesByPayment.find((item) => item.method === "dinheiro")?.totalCents ?? 0;
  const expectedCashCents = Math.max(cashSalesCents - expensesTotalCents, 0);
  const hasBlockingWork = commandsCount > 0 || pendingSaleItemsCount > 0;
  const salesLabel = `${salesCount} ${salesCount === 1 ? "venda" : "vendas"}`;

  return (
    <CashierModal
      title="Fechar caixa"
      description="Confira os valores do turno antes de encerrar a operação."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="pdv-danger-action" type="button" onClick={onConfirm} disabled={hasBlockingWork}>
            <LogOut aria-hidden="true" size={17} />
            Fechar caixa
          </button>
        </>
      }
    >
      <div className="pdv-close-panel">
        <section className="pdv-close-total" aria-label="Valor previsto no caixa">
          <span>Previsto no caixa</span>
          <strong>{formatCurrency(expectedCashCents)}</strong>
          <em>{salesLabel} no turno</em>
        </section>

        <div className="pdv-close-ledger" aria-label="Resumo do fechamento">
          <div className="pdv-close-ledger-row">
            <span>
              <Store aria-hidden="true" size={17} />
              Abertura
            </span>
            <strong>{formatDateTime(session.openedAt)}</strong>
          </div>
          <div className="pdv-close-ledger-row">
            <span>
              <ShoppingCart aria-hidden="true" size={17} />
              Vendas
            </span>
            <strong>{formatCurrency(salesTotalCents)}</strong>
            {salesByPayment.length > 0 ? (
              <div className="pdv-close-payment-breakdown" aria-label="Vendas por forma de pagamento">
                {salesByPayment.map((item) => (
                  <span key={item.method}>
                    <em>{item.label}</em>
                    <strong>{formatCurrency(item.totalCents)}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="pdv-close-ledger-row">
            <span>
              <WalletCards aria-hidden="true" size={17} />
              Despesas
            </span>
            <strong>{formatCurrency(expensesTotalCents)}</strong>
          </div>
        </div>

            {hasBlockingWork ? (
              <div className="pdv-close-blockers" role="status">
                <strong>Pendências antes de fechar</strong>
                {commandsCount > 0 ? (
                  <p>
                    <AlertTriangle aria-hidden="true" size={16} />
                {commandsCount} {commandsCount === 1 ? "comanda aberta precisa" : "comandas abertas precisam"} ser concluída
                {commandsCount === 1 ? "" : "s"} ou removida{commandsCount === 1 ? "" : "s"}.
              </p>
            ) : null}
            {pendingSaleItemsCount > 0 ? (
              <p>
                <AlertTriangle aria-hidden="true" size={16} />
                    Finalize ou limpe a venda atual antes de encerrar o turno.
                  </p>
                ) : null}
              </div>
            ) : null}
      </div>
    </CashierModal>
  );
}

function SaleSuccessModal({ sale, onClose }: { sale: SaleRecord; onClose: () => void }) {
  const itemsCount = getCartQuantity(sale.items);
  const paymentOption = getPaymentOption(sale.paymentMethod);
  const PaymentIcon = paymentOption.icon;
  const isCommandSale = Boolean(sale.originCommandTitle);
  const OriginIcon = isCommandSale ? ReceiptText : ShoppingCart;

  return (
    <CashierModal
      title="Venda concluída"
      onClose={onClose}
      footer={
        <button className="pdv-confirm-action" type="button" onClick={onClose}>
          <Check aria-hidden="true" size={17} />
          Voltar ao caixa
        </button>
      }
    >
      <div className="pdv-sale-success">
        <section className="pdv-sale-success-main" aria-label="Resumo da venda concluída">
          <span className="pdv-sale-success-icon" aria-hidden="true">
            <Check size={24} strokeWidth={2.6} />
          </span>
          <div>
            <span>Total da venda</span>
            <strong>{formatCurrency(sale.totalCents)}</strong>
          </div>
        </section>

        <dl className="pdv-sale-success-details">
          <div>
            <dt>
              <PaymentIcon aria-hidden="true" size={18} />
              Pagamento
            </dt>
            <dd>{paymentOption.label}</dd>
          </div>
          <div>
            <dt>
              <OriginIcon aria-hidden="true" size={18} />
              {isCommandSale ? "Comanda" : "Origem"}
            </dt>
            <dd>{isCommandSale ? sale.originCommandTitle : "Venda direta"}</dd>
          </div>
          <div>
            <dt>
              <Package aria-hidden="true" size={18} />
              Itens
            </dt>
            <dd>
              {itemsCount} {itemsCount === 1 ? "item" : "itens"}
            </dd>
          </div>
        </dl>
      </div>
    </CashierModal>
  );
}

function FiscalEmissionModal({
  state,
  isPrinting,
  printMode,
  onClose,
  onPrint
}: {
  state: FiscalEmissionModalState;
  isPrinting: boolean;
  printMode: FiscalPrintMode | null;
  onClose: () => void;
  onPrint: () => void;
}) {
  const toneClassName = `pdv-fiscal-emission-${state.tone}`;
  const canClose = state.tone !== "pending";
  const canPrint = Boolean(state.xmlPath) && (state.tone === "success" || state.tone === "queued");
  const Icon = state.tone === "success"
    ? Check
    : state.tone === "pending"
      ? LoaderCircle
      : state.tone === "queued"
        ? History
        : AlertTriangle;
  const detail = state.detail && state.detail !== state.message ? state.detail : null;
  const fiscalLabel = getFiscalModelLabel(state.fiscalModel ?? getSaleStoredFiscalModel(state.sale));
  const fiscalNumberLabel = typeof state.fiscalNumber === "number" && Number.isFinite(state.fiscalNumber)
    ? `${fiscalLabel} nº ${state.fiscalNumber}`
    : "Aguardando número";

  return (
    <CashierModal
      title={state.title}
      description="Venda concluída."
      dismissible={canClose}
      size="sm"
      onClose={onClose}
      footer={
        canClose ? (
          canPrint ? (
            <button className="pdv-confirm-action" disabled={isPrinting} type="button" onClick={onPrint}>
              {isPrinting ? <LoaderCircle aria-hidden="true" className="pdv-spin" size={17} /> : <Printer aria-hidden="true" size={17} />}
              {isPrinting
                ? printMode === "reprint"
                  ? "Reimprimindo"
                  : "Imprimindo"
                : "Reimprimir DANFE"}
            </button>
          ) : (
            <button className="pdv-secondary-action pdv-fiscal-close-action" type="button" onClick={onClose}>
              Fechar
            </button>
          )
        ) : null
      }
    >
      <div className={`pdv-fiscal-emission ${toneClassName}`}>
        <section className="pdv-fiscal-emission-status" aria-live="polite">
          <span className="pdv-fiscal-emission-icon" aria-hidden="true">
            <Icon className={state.tone === "pending" ? "pdv-spin" : undefined} size={22} strokeWidth={2.6} />
          </span>
          <div>
            <strong>{state.message}</strong>
            <span>{fiscalNumberLabel}</span>
          </div>
        </section>

        {detail ? (
          <p className="pdv-fiscal-emission-detail">{detail}</p>
        ) : null}
      </div>
    </CashierModal>
  );
}

function AgreementReceiptSuccessModal({
  receipt,
  onClose
}: {
  receipt: AgreementReceiptCompletionRecord;
  onClose: () => void;
}) {
  const paymentOption = receipt.paymentMethod ? getPaymentOption(receipt.paymentMethod) : getPaymentOption("dinheiro");
  const PaymentIcon = paymentOption.icon;

  return (
    <CashierModal
      title="Convênio recebido"
      onClose={onClose}
      footer={
        <button className="pdv-confirm-action" type="button" onClick={onClose}>
          <Check aria-hidden="true" size={17} />
          Voltar ao caixa
        </button>
      }
    >
      <div className="pdv-sale-success">
        <section className="pdv-sale-success-main" aria-label="Resumo do convênio recebido">
          <span className="pdv-sale-success-icon" aria-hidden="true">
            <Check size={24} strokeWidth={2.6} />
          </span>
          <div>
            <span>Total recebido</span>
            <strong>{formatCurrency(receipt.totalCents)}</strong>
          </div>
        </section>

        <dl className="pdv-sale-success-details">
          <div>
            <dt>
              <PaymentIcon aria-hidden="true" size={18} />
              Pagamento
            </dt>
            <dd>{paymentOption.label}</dd>
          </div>
          <div>
            <dt>
              <HandCoins aria-hidden="true" size={18} />
              Cliente
            </dt>
            <dd>{receipt.clientName}</dd>
          </div>
          <div>
            <dt>
              <Package aria-hidden="true" size={18} />
              Notas
            </dt>
            <dd>
              {receipt.receiptCount} {receipt.receiptCount === 1 ? "nota" : "notas"} · {receipt.itemsCount}{" "}
              {receipt.itemsCount === 1 ? "item" : "itens"}
            </dd>
          </div>
        </dl>
      </div>
    </CashierModal>
  );
}

function getFiscalDocumentNumberLabel(document?: FiscalDocumentRecord | null, options: { includeSerie?: boolean } = {}) {
  const modelLabel = document?.modelo === "55" ? "NF-e" : "NFC-e";

  if (!document?.numero) {
    return modelLabel;
  }

  if (options.includeSerie && document.serie) {
    return `${modelLabel} ${document.serie}/${document.numero}`;
  }

  return `${modelLabel} ${document.numero}`;
}

function getHistoryFiscalTitle(title: string) {
  return title
    .replace(/^NFC-e\b/i, "NFC-E")
    .replace(/^NF-e\b/i, "NF-E");
}

function getSaleOrdinalTitle(sale: SaleRecord, sales: SaleRecord[]) {
  const index = sales.findIndex((currentSale) => currentSale.id === sale.id);

  if (index < 0) {
    return "Venda";
  }

  return `Venda ${sales.length - index}`;
}

function getFiscalDocumentStatus(document: FiscalDocumentRecord) {
  const status = String(document.status || "").toLowerCase();

  if (status === "autorizada") {
    return {
      label: isFiscalDocumentContingencyPrint(document) ? "Autorizada" : "Emitida",
      tone: "success" as const
    };
  }

  if (status === "emitida" || status === "sucesso") {
    return { label: "Emitida", tone: "success" as const };
  }

  if (
    status === "contingencia" ||
    status === "contingencia_emitida" ||
    status === "contingencia_transmissao_pendente" ||
    status === "erro_transmissao_contingencia"
  ) {
    return { label: "Contingência", tone: "warning" as const };
  }

  if (status === "pendente" || status.includes("pendente") || status === "transmitindo") {
    return { label: "Pendente", tone: "pending" as const };
  }

  if (status === "cancelada" || status === "inutilizada") {
    return { label: status === "cancelada" ? "Cancelada" : "Inutilizada", tone: "neutral" as const };
  }

  return { label: "Com erro", tone: "error" as const };
}

function getMainFiscalDocument(documents: FiscalDocumentRecord[]) {
  if (documents.length === 0) {
    return null;
  }

  const sortedDocuments = [...documents].sort((first, second) =>
    String(second.updated_at || second.created_at || "").localeCompare(String(first.updated_at || first.created_at || ""))
  );
  const latestStatus = String(sortedDocuments[0]?.status || "").toLowerCase();

  if (latestStatus === "cancelada" || latestStatus === "inutilizada") {
    return sortedDocuments[0];
  }

  const successDocument = sortedDocuments.find((document) => getFiscalDocumentStatus(document).tone === "success");

  if (successDocument) {
    return successDocument;
  }

  const contingencyDocument = sortedDocuments.find((document) => getFiscalDocumentStatus(document).tone === "warning");

  return contingencyDocument ?? sortedDocuments[0];
}

function getSaleFiscalSummary(documents: FiscalDocumentRecord[], isLoading = false, sale?: SaleRecord | null) {
  if (isLoading) {
    return {
      title: "Fiscal",
      label: "Carregando",
      tone: "neutral" as const,
      document: null as FiscalDocumentRecord | null
    };
  }

  const document = getMainFiscalDocument(documents);

  if (!document) {
    const modelLabel = getFiscalModelLabel(sale ? getSaleStoredFiscalModel(sale) : "65");

    return {
      title: modelLabel,
      label: "Não emitida",
      tone: "error" as const,
      document
    };
  }

  const status = getFiscalDocumentStatus(document);

  if (status.tone === "success") {
    return {
      title: getFiscalDocumentNumberLabel(document),
      label: status.label,
      tone: "success" as const,
      document
    };
  }

  if (status.tone === "warning") {
    return {
      title: getFiscalDocumentNumberLabel(document),
      label: "Em contingência",
      tone: "warning" as const,
      document
    };
  }

  if (status.tone === "neutral") {
    return {
      title: getFiscalDocumentNumberLabel(document),
      label: status.label,
      tone: "neutral" as const,
      document
    };
  }

  return {
    title: getFiscalDocumentNumberLabel(document),
    label: "Não emitida",
    tone: "error" as const,
    document
  };
}

function getFiscalDocumentMessage(document: FiscalDocumentRecord) {
  return document.mensagem_operador || document.mensagem_sefaz || "Sem retorno fiscal informado.";
}

function getFiscalDocumentSyncStatusLabel(status?: string | null) {
  if (status === "synced") {
    return "Sincronizada";
  }

  if (status === "failed") {
    return "Falha na sincronização";
  }

  if (status === "ignored") {
    return "Sincronização ignorada";
  }

  if (status === "pending") {
    return "Sincronização pendente";
  }

  return null;
}

function getFiscalDocumentXmlPath(document: FiscalDocumentRecord) {
  if (document.xml_autorizado_path) {
    return document.xml_autorizado_path;
  }

  const rawResult = asRecord(document.raw_result);
  const data = asRecord(rawResult?.data);
  const payload = asRecord(rawResult?.payload);

  return String(
    data?.xmlAutorizadoPath ??
      data?.xmlPath ??
      payload?.xmlPath ??
      ""
  ).trim() || null;
}

function isFiscalDocumentContingencyPrint(document: {
  command?: string | null;
  status?: string | null;
  xmlPath?: string | null;
  raw_result?: unknown;
}) {
  const rawResult = asRecord(document.raw_result);
  const data = asRecord(rawResult?.data);
  const payload = asRecord(rawResult?.payload);
  const status = String(document.status || "").toLowerCase();
  const command = String(document.command || "").toLowerCase();
  const xmlPath = String(
    document.xmlPath ??
      data?.xmlContingenciaPath ??
      data?.xmlAutorizadoPath ??
      data?.xmlPath ??
      payload?.xmlPath ??
      ""
  ).toLowerCase();
  const tpEmis = String(data?.tpEmis ?? payload?.tpEmis ?? "").trim();

  return command.includes("contingencia") ||
    status.includes("contingencia") ||
    data?.contingencia === true ||
    payload?.contingencia === true ||
    ["4", "5", "6", "7", "8", "9"].includes(tpEmis) ||
    xmlPath.includes("contingencia");
}

function canReprintFiscalDocument(document: FiscalDocumentRecord) {
  const status = getFiscalDocumentStatus(document);

  return (status.tone === "success" || status.tone === "warning") && Boolean(getFiscalDocumentXmlPath(document));
}

function canCancelFiscalDocument(document: FiscalDocumentRecord) {
  const rawStatus = String(document.status || "").toLowerCase();
  const status = getFiscalDocumentStatus(document);

  return status.tone === "success" &&
    !rawStatus.includes("cancel") &&
    !rawStatus.includes("inutil") &&
    Boolean(document.chave) &&
    Boolean(document.protocolo);
}

function getCancelableFiscalDocuments(documents: FiscalDocumentRecord[]) {
  const unique = new Map<string, FiscalDocumentRecord>();
  const sortedDocuments = [...documents].sort((first, second) =>
    String(second.updated_at || second.created_at || "").localeCompare(String(first.updated_at || first.created_at || ""))
  );

  for (const document of sortedDocuments) {
    if (!canCancelFiscalDocument(document)) {
      continue;
    }

    const key = document.chave || `${document.modelo || ""}:${document.serie || ""}:${document.numero || ""}`;

    if (!unique.has(key)) {
      unique.set(key, document);
    }
  }

  return Array.from(unique.values());
}

function canRetryFiscalDocuments(documents: FiscalDocumentRecord[]) {
  if (documents.length === 0) {
    return true;
  }

  return !documents.some((document) => {
    const status = getFiscalDocumentStatus(document);
    return status.tone === "success" || status.tone === "warning";
  });
}

function SaleFiscalDetailsModal({
  sale,
  fiscalDocuments,
  isFiscalLoading,
  reprintingFiscalDocumentId,
  onClose,
  onReprintFiscal,
  onRetryFiscal
}: {
  sale: SaleRecord;
  fiscalDocuments: FiscalDocumentRecord[];
  isFiscalLoading: boolean;
  reprintingFiscalDocumentId: string | null;
  onClose: () => void;
  onReprintFiscal: (sale: SaleRecord, document: FiscalDocumentRecord) => void;
  onRetryFiscal: (sale: SaleRecord) => void;
}) {
  const summary = getSaleFiscalSummary(fiscalDocuments, isFiscalLoading, sale);
  const canRetryFiscal = !isSaleCanceled(sale) && !isFiscalLoading && canRetryFiscalDocuments(fiscalDocuments);

  return (
    <CashierModal
      title="Fiscal da venda"
      description={`${summary.title} · ${summary.label}`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Fechar
          </button>
          {canRetryFiscal ? (
            <button className="pdv-confirm-action" type="button" onClick={() => onRetryFiscal(sale)}>
              <RefreshCw aria-hidden="true" size={17} />
              Tentar emitir fiscal
            </button>
          ) : null}
        </>
      }
    >
      <div className="pdv-fiscal-details-flow">
        <div className={`pdv-fiscal-details-summary pdv-fiscal-details-summary-${summary.tone}`}>
          <ReceiptText aria-hidden="true" size={20} />
          <div>
            <strong>{summary.title}</strong>
            <span>{summary.label}</span>
          </div>
        </div>

        <section className="pdv-fiscal-events" aria-label="Eventos fiscais da venda">
          <div className="pdv-fiscal-events-head">
            <strong>Eventos fiscais</strong>
            {isFiscalLoading ? <span>Carregando</span> : <span>{fiscalDocuments.length || 0} registro(s)</span>}
          </div>

          {isFiscalLoading ? (
            <div className="pdv-fiscal-history-skeleton" aria-hidden="true">
              <span />
              <span />
            </div>
          ) : fiscalDocuments.length > 0 ? (
            <div className="pdv-fiscal-history-list">
              {fiscalDocuments.map((document) => {
                const status = getFiscalDocumentStatus(document);
                const numberLabel = getFiscalDocumentNumberLabel(document, { includeSerie: true });
                const message = getFiscalDocumentMessage(document);
                const syncStatusLabel = getFiscalDocumentSyncStatusLabel(document.sync_status);

                return (
                  <article className="pdv-fiscal-history-item" key={document.id}>
                    <div className="pdv-fiscal-history-main">
                      <span className={`pdv-fiscal-history-badge pdv-fiscal-history-${status.tone}`}>
                        {status.label}
                      </span>
                      <strong>{numberLabel}</strong>
                      <em>{formatDateTime(document.updated_at || document.created_at)}</em>
                    </div>
                    <div className="pdv-fiscal-history-meta">
                      {document.codigo_retorno_sefaz ? <span>Retorno {document.codigo_retorno_sefaz}</span> : null}
                      {document.protocolo ? <span>Protocolo {document.protocolo}</span> : null}
                      {document.chave ? <span>Chave {document.chave}</span> : null}
                      {syncStatusLabel ? <span>{syncStatusLabel}</span> : null}
                    </div>
                    {status.tone !== "success" || document.sync_error ? (
                      <p>{document.sync_error || message}</p>
                    ) : null}
                    {canReprintFiscalDocument(document) ? (
                      <div className="pdv-fiscal-history-actions">
                        <button
                          className="pdv-secondary-action pdv-fiscal-reprint-action"
                          disabled={reprintingFiscalDocumentId === document.id}
                          type="button"
                          onClick={() => onReprintFiscal(sale, document)}
                        >
                          {reprintingFiscalDocumentId === document.id ? (
                            <LoaderCircle aria-hidden="true" className="pdv-spin" size={16} />
                          ) : (
                            <Printer aria-hidden="true" size={16} />
                          )}
                          {reprintingFiscalDocumentId === document.id ? "Reimprimindo" : "Reimprimir DANFE"}
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pdv-fiscal-history-empty">
              <ReceiptText aria-hidden="true" size={18} />
              <span>Nenhum documento fiscal registrado para esta venda.</span>
            </div>
          )}
        </section>
      </div>
    </CashierModal>
  );
}

function SaleDetailsModal({
  sale,
  saleDisplayTitle,
  fiscalDocuments,
  isFiscalEmissionEnabled,
  isFiscalLoading,
  reprintingFiscalDocumentId,
  onClose,
  onCancelRequest,
  onReprintFiscal,
  onRetryFiscal
}: {
  sale: SaleRecord;
  saleDisplayTitle: string;
  fiscalDocuments: FiscalDocumentRecord[];
  isFiscalEmissionEnabled: boolean;
  isFiscalLoading: boolean;
  reprintingFiscalDocumentId: string | null;
  onClose: () => void;
  onCancelRequest: (sale: SaleRecord) => void;
  onReprintFiscal: (sale: SaleRecord, document: FiscalDocumentRecord) => void;
  onRetryFiscal: (sale: SaleRecord) => void;
}) {
  const [isFiscalDetailsOpen, setIsFiscalDetailsOpen] = useState(false);
  const paymentOption = getPaymentOption(sale.paymentMethod);
  const PaymentIcon = paymentOption.icon;
  const isCommandSale = Boolean(sale.originCommandTitle);
  const OriginIcon = isCommandSale ? ReceiptText : ShoppingCart;
  const canceled = isSaleCanceled(sale);
  const fiscalSummary = getSaleFiscalSummary(fiscalDocuments, isFiscalLoading, sale);
  const fiscalTitle = isFiscalEmissionEnabled ? getHistoryFiscalTitle(fiscalSummary.title) : saleDisplayTitle;

  return (
    <>
      <CashierModal
        title="Detalhes da venda"
        description={`${formatDateTime(sale.createdAt)} · ${getPaymentLabel(sale.paymentMethod)}${canceled ? " · Cancelada" : ""}`}
        size="lg"
        onClose={onClose}
        footer={
          <>
            <button className="pdv-secondary-action" type="button" onClick={onClose}>
              Fechar
            </button>
            {!canceled ? (
              <button className="pdv-danger-action" type="button" onClick={() => onCancelRequest(sale)}>
                <Trash2 aria-hidden="true" size={17} />
                Cancelar venda
              </button>
            ) : null}
          </>
        }
      >
        <div className="pdv-sale-details-flow">
          {canceled ? (
            <div className="pdv-sale-details-status" role="status">
              <X aria-hidden="true" size={17} />
              <span>Venda cancelada. Este recebimento não compõe a conferência do caixa.</span>
            </div>
          ) : null}

          <div className="pdv-sale-details-strip" aria-label="Resumo da venda">
            <span className="pdv-sale-detail-token">
              <span className="pdv-sale-detail-token-icon">
                <PaymentIcon aria-hidden="true" size={18} />
              </span>
              <span>
                <em>Pagamento</em>
                <strong>{paymentOption.label}</strong>
              </span>
            </span>
            <span className="pdv-sale-detail-token">
              <span className="pdv-sale-detail-token-icon">
                <OriginIcon aria-hidden="true" size={18} />
              </span>
              <span>
                <em>{isCommandSale ? "Comanda" : "Origem"}</em>
                <strong>{isCommandSale ? sale.originCommandTitle : "Venda direta"}</strong>
              </span>
            </span>
            {isFiscalEmissionEnabled ? (
              <button
                className={`pdv-sale-detail-token pdv-sale-detail-token-fiscal pdv-sale-detail-token-fiscal-${fiscalSummary.tone}`}
                disabled={isFiscalLoading}
                type="button"
                onClick={() => setIsFiscalDetailsOpen(true)}
              >
                <span className="pdv-sale-detail-token-icon">
                  <ReceiptText aria-hidden="true" size={18} />
                </span>
                <span className="pdv-sale-detail-token-content">
                  <em>Documento fiscal</em>
                  <strong className="pdv-sale-detail-fiscal-title">
                    <span className="pdv-sale-detail-fiscal-number">{fiscalTitle}</span>
                    <span className="pdv-sale-detail-fiscal-separator" aria-hidden="true">|</span>
                    <span className="pdv-sale-detail-fiscal-status">{fiscalSummary.label}</span>
                  </strong>
                </span>
                <span className="pdv-sale-detail-fiscal-action">Ver detalhes</span>
              </button>
            ) : null}
          </div>

          <section className="pdv-checkout-list pdv-sale-details-list" aria-label="Itens da venda">
            <div className="pdv-checkout-list-head" aria-hidden="true">
              <span>Produto</span>
              <span>Quantidade</span>
              <span>Total</span>
            </div>
            <div className="pdv-checkout-list-body">
              {sale.items.map((item) => (
                <div className="pdv-checkout-item" key={item.id}>
                  <ProductThumbnail
                    backgroundColor={item.categoryColor}
                    color={item.categoryAccent}
                    icon={item.categoryIcon}
                    imageUrl={item.imageUrl}
                    label={item.category}
                    size="sm"
                  />
                  <span className="pdv-checkout-product">
                    <strong>{item.name}</strong>
                    <em>
                      <span>{formatCurrency(item.priceCents)} un.</span>
                      <span>{item.category}</span>
                    </em>
                  </span>
                  <span className="pdv-checkout-quantity">
                    <strong>{item.quantity}</strong>
                  </span>
                  <span className="pdv-checkout-total">
                    <strong>{formatCurrency(item.quantity * item.priceCents)}</strong>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <div className="pdv-sale-total-inline pdv-payment-total-inline pdv-sale-details-total" aria-live="polite">
            <span>Total da venda</span>
            <strong>{formatCurrency(sale.totalCents)}</strong>
          </div>
        </div>
      </CashierModal>
      {isFiscalEmissionEnabled && isFiscalDetailsOpen ? (
        <SaleFiscalDetailsModal
          fiscalDocuments={fiscalDocuments}
          isFiscalLoading={isFiscalLoading}
          reprintingFiscalDocumentId={reprintingFiscalDocumentId}
          sale={sale}
          onClose={() => setIsFiscalDetailsOpen(false)}
          onReprintFiscal={onReprintFiscal}
          onRetryFiscal={onRetryFiscal}
        />
      ) : null}
    </>
  );
}

function CancelSaleModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <CashierModal
      title="Cancelar venda"
      description="Tem certeza que deseja cancelar essa venda?"
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Manter venda
          </button>
          <button className="pdv-danger-action" type="button" onClick={onConfirm}>
            <Trash2 aria-hidden="true" size={17} />
            Cancelar venda
          </button>
        </>
      }
    >
      <div className="pdv-cancel-sale-warning">
        <span className="pdv-cancel-sale-warning-icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </span>
        <p>
          Essa ação não pode ser desfeita. A venda continuará registrada como cancelada, o valor não entrará na
          conferência do caixa e o estoque dos itens será estornado.
        </p>
      </div>
    </CashierModal>
  );
}
