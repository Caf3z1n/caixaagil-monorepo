"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
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
  BriefcaseBusiness,
  Check,
  Cloud,
  Coffee,
  CreditCard,
  CupSoda,
  Dumbbell,
  Gift,
  HandCoins,
  History,
  LoaderCircle,
  LogOut,
  Minus,
  Package,
  Pill,
  Plus,
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
  type LocalPdvStoreEventPayload,
  type LocalPdvStorePendingEvent,
  type LocalPdvStoreSummary
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
  priceCents: number;
  stockQuantity: number | null;
  categoryIcon: string;
  categoryColor: string;
  categoryAccent?: string;
  imageUrl?: string | null;
};

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
  preco_custo_centavos?: number;
  preco_venda_centavos?: number;
  quantidade_estoque?: number | null;
  categoria?: ApiCatalogCategory | null;
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
};

type ApiPdvSettings = {
  formas_pagamento?: Partial<Record<PaymentMethod, boolean>> | null;
};

type ApiAgreementClient = {
  id: number;
  nome: string;
  tipo_pessoa?: "fisica" | "juridica" | string | null;
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
  itens_count?: number;
  itens?: unknown[];
  total_centavos?: number;
  status_convenio?: "pendente" | "pago" | string | null;
  metodo_pagamento_recebimento?: string | null;
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
};

type SaleRecord = {
  id: string;
  createdAt: string;
  items: CartItem[];
  paymentMethod: PaymentMethod;
  totalCents: number;
  originCommandTitle?: string | null;
  clienteConvenioId?: number | null;
  clientName?: string | null;
  status?: "completed" | "canceled";
  canceledAt?: string | null;
};

type AgreementClient = {
  id: number;
  name: string;
  personType: "fisica" | "juridica";
  allowFrontPayment: boolean;
};

type AgreementReceiptRecord = {
  id: string;
  code: string;
  title: string;
  clientId: number | null;
  clientName: string;
  itemsCount: number;
  items: CartItem[];
  totalCents: number;
  status: "pendente" | "pago";
  paymentMethod?: ReceiptPaymentMethod | null;
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
  amountCents: number;
};

type PaymentBreakdownItem = {
  method: PaymentMethod;
  label: string;
  totalCents: number;
  count: number;
};

type LocalCashierState = {
  version: 1;
  savedAt: string;
  session: CashierSession | null;
  cartItems: CartItem[];
  sales: SaleRecord[];
  commands: CommandRecord[];
  expenses: CashExpenseRecord[];
  agreementClients?: AgreementClient[];
  agreementReceipts?: AgreementReceiptRecord[];
  catalogProducts: Product[];
  catalogCategories: ProductCategory[];
  paymentSettings?: PaymentSettings;
};

type DesktopCashierFlowProps = {
  connectivity: ConnectivityState;
  deviceCredential: string | null;
  deviceId: string;
  pdvIdentity: string;
  shiftSequenceScope: string;
  lastAccessLabel: string;
  systemMessage?: string;
  isUnpairing: boolean;
  onUnpair: () => void | Promise<void>;
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

const defaultPaymentSettings: PaymentSettings = {
  dinheiro: true,
  pix: true,
  cartao: true,
  convenio: false
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

function mapCatalogProduct(product: ApiCatalogProduct): Product {
  const categoryName = product.categoria?.nome || "Sem categoria";
  const categoryTone = getCategoryTone(product.categoria?.cor);

  return {
    id: String(product.id),
    name: product.nome || "Produto sem nome",
    categoryId: product.categoria?.id ? String(product.categoria.id) : product.categoria_id ? String(product.categoria_id) : null,
    category: categoryName,
    barcode: product.codigo_barras ?? "",
    priceCents: normalizeNumber(product.preco_venda_centavos),
    stockQuantity: product.quantidade_estoque ?? null,
    categoryIcon: product.categoria?.icone || "package",
    categoryColor: categoryTone.color,
    categoryAccent: categoryTone.accent,
    imageUrl: resolveFileUrl(product.imagem?.url)
  };
}

function mapAgreementClient(client: ApiAgreementClient): AgreementClient {
  return {
    id: Number(client.id),
    name: client.nome || "Cliente",
    personType: client.tipo_pessoa === "juridica" ? "juridica" : "fisica",
    allowFrontPayment: Boolean(client.permite_pagamento_frente_caixa)
  };
}

function getAgreementClientTypeLabel(client: Pick<AgreementClient, "personType">) {
  return client.personType === "juridica" ? "Pessoa jurídica" : "Pessoa física";
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
    priceCents,
    stockQuantity: null,
    categoryIcon: String(categoryVisual.icone ?? data.categoria_icone ?? data.categoryIcon ?? "package"),
    categoryColor: categoryTone.color,
    categoryAccent: categoryTone.accent,
    imageUrl: resolveFileUrl(
      typeof data.imagem_url === "string" ? data.imagem_url : typeof data.imageUrl === "string" ? data.imageUrl : null
    ),
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
    itemsCount,
    items,
    totalCents: normalizeNumber(receipt.total_centavos),
    status: receipt.status_convenio === "pago" ? "pago" : "pendente",
    paymentMethod: receiptPaymentMethod,
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
      receiptById.set(receipt.id, receipt);
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
    itemsCount: getCartQuantity(sale.items),
    items: sale.items,
    totalCents: sale.totalCents,
    status: "pendente",
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

function getEnabledPaymentOptions(settings: PaymentSettings) {
  const enabledOptions = paymentOptions.filter((option) => settings[option.id]);

  return enabledOptions.length > 0 ? enabledOptions : paymentOptions;
}

function isSaleCanceled(sale: Pick<SaleRecord, "status">) {
  return sale.status === "canceled";
}

function CashierModal({
  title,
  description,
  children,
  footer,
  onClose,
  size = "md"
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="pdv-modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className={`pdv-modal-card pdv-modal-card-${size}`} aria-modal="true" role="dialog">
        <button className="pdv-modal-close" type="button" onClick={onClose} aria-label="Fechar modal">
          <X aria-hidden="true" size={19} />
        </button>
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

export function DesktopCashierFlow({
  connectivity,
  deviceCredential,
  deviceId,
  pdvIdentity,
  shiftSequenceScope,
  lastAccessLabel,
  isUnpairing,
  onUnpair,
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
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [selectedSale, setSelectedSale] = useState<SaleRecord | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [saleCancelRequest, setSaleCancelRequest] = useState<SaleRecord | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isCashPaymentOpen, setIsCashPaymentOpen] = useState(false);
  const [cashPaymentTarget, setCashPaymentTarget] = useState<"sale" | "agreement-receipt">("sale");
  const [isAgreementPaymentOpen, setIsAgreementPaymentOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
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
  const [eventSyncError, setEventSyncError] = useState("");
  const [catalogSyncedAt, setCatalogSyncedAt] = useState<string | null>(null);
  const [catalogSyncError, setCatalogSyncError] = useState("");
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [isSyncDetailsOpen, setIsSyncDetailsOpen] = useState(false);
  const [isOpeningSession, setIsOpeningSession] = useState(false);
  const [previewShiftNumber, setPreviewShiftNumber] = useState(() =>
    getPreviewDailyShiftNumber(new Date(), shiftSequenceScope)
  );
  const isSyncingRef = useRef(false);
  const hasLoadedRemoteDataRef = useRef(false);

  const localStoreScope = useMemo(
    () => `${shiftSequenceScope || "local"}:${deviceId || "device"}`,
    [deviceId, shiftSequenceScope]
  );
  const totalCents = getCartTotal(cartItems);
  const totalQuantity = getCartQuantity(cartItems);
  const commandEditorTotalCents = getCartTotal(commandEditor?.items ?? []);
  const commandEditorQuantity = getCartQuantity(commandEditor?.items ?? []);
  const paymentItems = commandPaymentRequest?.items ?? cartItems;
  const paymentTotalCents = getCartTotal(paymentItems);
  const enabledPaymentOptions = useMemo(
    () => getEnabledPaymentOptions(paymentSettings).filter((option) => option.id !== "convenio" || agreementClients.length > 0),
    [agreementClients.length, paymentSettings]
  );
  const receiptPaymentOptions = useMemo(
    () => enabledPaymentOptions.filter((option) => option.id !== "convenio"),
    [enabledPaymentOptions]
  );
  const isAgreementPaymentEnabled = paymentSettings.convenio;
  const frontCashAgreementClients = useMemo(
    () => agreementClients.filter((client) => client.allowFrontPayment),
    [agreementClients]
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
  const activeSales = sales.filter((sale) => !isSaleCanceled(sale));
  const sessionPaidSales = activeSales.filter((sale) => sale.paymentMethod !== "convenio");
  const sessionSales = sessionPaidSales.reduce((total, sale) => total + sale.totalCents, 0) +
    paidAgreementReceipts.reduce((total, receipt) => total + receipt.totalCents, 0);
  const sessionSalesByPayment = paymentOptions
    .filter((option) => option.id !== "convenio")
    .map<PaymentBreakdownItem>((option) => {
      const optionSales = sessionPaidSales.filter((sale) => sale.paymentMethod === option.id);
      const optionReceipts = paidAgreementReceipts.filter((receipt) => receipt.paymentMethod === option.id);

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
  const sessionExpenses = expenses.reduce((total, expense) => total + expense.amountCents, 0);
  const expectedCashCents = session ? sessionSales - sessionExpenses : 0;

  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    const baseProducts = selectedPickerCategoryId === "all"
      ? catalogProducts
      : catalogProducts.filter((product) => product.categoryId === selectedPickerCategoryId);

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
      agreementClients,
      agreementReceipts,
      catalogProducts,
      catalogCategories,
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
      setSyncSummary(summary);
      setPendingSyncCount(summary.pending);

      if (summary.failed > 0 && typeof store.getFailedEvents === "function") {
        const events = await store.getFailedEvents({ scope: localStoreScope, limit: 8 });
        setFailedSyncEvents(events);
      } else {
        setFailedSyncEvents([]);
      }
    } catch {
      setPendingSyncCount(0);
      setSyncSummary({ total: 0, pending: 0, failed: 0 });
      setFailedSyncEvents([]);
    }
  }, [localStoreScope]);

  const syncPendingEvents = useCallback(async (options: { showMessage?: boolean } = {}) => {
    const store = getLocalPdvStore();

    if (!store || connectivity !== "online" || !deviceCredential || !deviceId || isSyncingRef.current) {
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
      const syncedIds = response.eventos
        .filter((event) => event.status === "processado" || event.status === "duplicado")
        .map((event) => event.id);
      const failedEvents = response.eventos.filter((event) => event.status === "erro");

      if (syncedIds.length > 0) {
        await store.markEventsSynced({ scope: localStoreScope, eventIds: syncedIds });
      }

      if (failedEvents.length > 0) {
        const message = failedEvents[0]?.message ?? "Evento recusado pela sincronização.";
        await store.markEventsFailed({
          scope: localStoreScope,
          eventIds: failedEvents.map((event) => event.id),
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
  }, [connectivity, deviceCredential, deviceId, localStoreScope, onSystemMessage, refreshSyncSummary]);

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
        void syncPendingEvents();
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
        const summary = await activeStore.getSyncSummary({ scope: localStoreScope });

        if (shouldIgnore || summary.total > 0) {
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

        for (const sale of sales) {
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

        for (const expense of expenses) {
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

        for (const receipt of agreementReceipts) {
          if (receipt.status !== "pago" || !receipt.paymentMethod) {
            continue;
          }

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
          void syncPendingEvents();
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
    agreementReceipts,
    expenses,
    isLocalStateReady,
    localStoreScope,
    pdvIdentity,
    refreshSyncSummary,
    sales,
    session,
    shiftSequenceScope,
    syncPendingEvents
  ]);

  const refreshRemoteData = useCallback(async (options: { silent?: boolean; showMessage?: boolean } = {}) => {
    if (!deviceCredential || !deviceId) {
      const message = "PDV sem credencial ativa para carregar produtos.";
      setCatalogError(message);
      setCatalogSyncError(message);
      return false;
    }

    if (connectivity !== "online") {
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
      const nextPaymentSettings = normalizePaymentSettings(response.configuracoes?.formas_pagamento);
      const syncedAt = new Date().toISOString();

      setCatalogCategories(nextCategories);
      setCatalogProducts(nextProducts);
      setAgreementClients(nextAgreementClients);
      setAgreementReceipts((currentReceipts) => mergeAgreementReceipts(currentReceipts, nextAgreementReceipts));
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
      setCatalogSyncError("");
      hasLoadedRemoteDataRef.current = true;

      if (options.showMessage) {
        onSystemMessage("Dados do PDV atualizados pela API.");
      }

      return true;
    } catch (error) {
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
  }, [connectivity, deviceCredential, deviceId, onSystemMessage]);

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

  async function syncNow() {
    const store = getLocalPdvStore();

    setIsManualSyncing(true);

    try {
      if (store && syncSummary.failed > 0) {
        const result = await store.retryFailedEvents({ scope: localStoreScope });
        setPendingSyncCount(result.pending);
        await refreshSyncSummary();
      }

      const [eventsSynced, dataSynced] = await Promise.all([
        syncPendingEvents({ showMessage: false }),
        refreshRemoteData({ silent: true, showMessage: false })
      ]);

      await refreshSyncSummary();

      if (eventsSynced || dataSynced) {
        onSystemMessage("Sincronização concluída.");
      } else if (connectivity !== "online") {
        onSystemMessage("Sem conexão com a API. A fila continua salva neste computador.");
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
    if (cartItems.length === 0) {
      onSystemMessage("Adicione produtos antes de criar uma comanda.");
      return;
    }

    setCommandNameRequest({ source: "sale" });
  }

  function requestNewCommand() {
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
    setView("commands");
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

  function confirmDeleteCommand() {
    if (!commandDeleteRequest) {
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
    if (!commandEditor) {
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
    if (!commandEditor) {
      return;
    }

    const items = commandEditor.items
      .map((item) => (item.id === productId ? { ...item, quantity: Math.max(0, item.quantity - 1) } : item))
      .filter((item) => item.quantity > 0);

    applyCommandEditorDraft({ ...commandEditor, items });
    onSystemMessage("");
  }

  function increaseCommandItem(productId: string) {
    if (!commandEditor) {
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
    const convenioClient = method === "convenio" ? agreementClient : null;

    if (!session || sourceItems.length === 0) {
      return;
    }

    if (method === "convenio" && !convenioClient) {
      onSystemMessage("Selecione o cliente do convênio antes de concluir a venda.");
      setIsAgreementPaymentOpen(true);
      return;
    }

    const nextSale: SaleRecord = {
      id: createId("venda"),
      createdAt: new Date().toISOString(),
      items: sourceItems,
      paymentMethod: method,
      totalCents: sourceTotalCents,
      originCommandTitle: sourceCommand?.title ?? null,
      clienteConvenioId: convenioClient?.id ?? null,
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
      clienteConvenioNome: convenioClient?.name ?? null
    });
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
      if (agreementClients.length === 0) {
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

  async function openSession() {
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
        openedAt: openedAt.toISOString()
      };

      setSession(nextSession);
      setView("sale");
      onSystemMessage("Turno aberto. O caixa já pode iniciar vendas.");
      enqueueLocalEvent("turno_aberto", "turno", nextSession.id, {
        session: nextSession
      });
    } finally {
      setIsOpeningSession(false);
    }
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
        setCommands(savedState.commands ?? []);
        setExpenses(savedState.expenses ?? []);
        setAgreementClients(savedState.agreementClients ?? []);
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
  }, [localStoreScope]);

  useEffect(() => {
    if (!isLocalStateReady || connectivity !== "online" || !deviceCredential) {
      return;
    }

    void syncPendingEvents();

    const intervalId = window.setInterval(() => {
      void syncPendingEvents();
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [connectivity, deviceCredential, isLocalStateReady, syncPendingEvents]);

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
    agreementClients,
    agreementReceipts,
    catalogProducts,
    catalogCategories,
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
      F2: "commands",
      ...(isAgreementPaymentEnabled && frontCashAgreementClients.length > 0 ? { F3: "agreement" as const } : {}),
      F4: "expenses"
    };

    const handleFunctionShortcut = (event: KeyboardEvent) => {
      const nextView = shortcutMap[event.key];

      if (event.key === "F3" && (!isAgreementPaymentEnabled || frontCashAgreementClients.length === 0)) {
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

  function closeSession() {
    if (!session) {
      return;
    }

    if (commands.length > 0) {
      onSystemMessage("Conclua ou remova as comandas abertas antes de fechar o turno.");
      return;
    }

    if (cartItems.length > 0) {
      onSystemMessage("Finalize ou limpe a venda atual antes de fechar o turno.");
      return;
    }

    const closedAt = new Date().toISOString();
    const closedSession = {
      ...session,
      closedAt
    };

    setSession(null);
    setCartItems([]);
    setCommands([]);
    setCommandEditor(null);
    setCommandNameRequest(null);
    setCommandDeleteRequest(null);
    setCommandPaymentRequest(null);
    setSales([]);
    setExpenses([]);
    setIsClosingSession(false);
    setView("menu");
    onSystemMessage("Turno fechado neste computador.");
    enqueueLocalEvent("turno_fechado", "turno", closedSession.id, {
      session: closedSession,
      sales,
      expenses,
      totals: {
        salesCents: sessionSales,
        expensesCents: sessionExpenses,
        expectedCashCents
      }
    });
    void resolvePreviewShiftNumber().then(setPreviewShiftNumber);
  }

  function addExpense(title: string, amountCents: number) {
    const nextExpense = {
      id: createId("despesa"),
      title,
      amountCents,
      createdAt: new Date().toISOString()
    };

    setExpenses((currentExpenses) => [nextExpense, ...currentExpenses]);
    setIsExpenseOpen(false);
    onSystemMessage(`Despesa lançada: ${formatCurrency(amountCents)}.`);
    enqueueLocalEvent("despesa_lancada", "despesa", nextExpense.id, {
      session,
      expense: nextExpense
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
          <button className="pdv-secondary-action" type="button" onClick={requestCommandFromSale} disabled={cartItems.length === 0}>
            <ReceiptText aria-hidden="true" size={17} />
            Criar comanda
          </button>
          <button className="pdv-primary-action" type="button" onClick={() => setIsPaymentOpen(true)} disabled={cartItems.length === 0}>
            <CreditCard aria-hidden="true" size={17} />
            Finalizar venda
          </button>
        </div>
      </section>
    );
  }

  function renderCommands() {
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
            <p>Vendas concluídas no turno atual.</p>
          </div>
          <span className="pdv-work-chip">{sales.length} vendas</span>
        </header>

        {sales.length > 0 ? (
          <div className="pdv-history-board" aria-label="Vendas concluídas">
            {sales.map((sale, index) => {
              const canceled = isSaleCanceled(sale);
              const commandSaleTitle = sale.originCommandTitle?.trim();
              const saleTitle = commandSaleTitle || `Venda ${sales.length - index}`;
              const SaleIcon = canceled ? X : commandSaleTitle ? ReceiptText : ShoppingCart;

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
                    <strong>{saleTitle}</strong>
                    <em className="pdv-sale-item-meta">
                      <span>{formatDateTime(sale.createdAt)}</span>
                      <span>{getPaymentLabel(sale.paymentMethod)}</span>
                      {canceled ? <span className="pdv-sale-status-badge">Cancelada</span> : null}
                    </em>
                  </span>
                  <span className="pdv-history-line-total">
                    <em>{getCartQuantity(sale.items)} itens</em>
                    <strong>{formatCurrency(sale.totalCents)}</strong>
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
          <section className="pdv-sale-board pdv-history-empty-board" aria-label="Nenhuma venda concluída">
            <div className="pdv-empty-sale">
              <span className="pdv-empty-sale-icon" aria-hidden="true">
                <History size={42} strokeWidth={1.9} />
                <span className="pdv-empty-sale-zero">0</span>
              </span>
              <strong>Nenhuma venda no turno</strong>
              <span>As vendas concluídas aparecerão aqui.</span>
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
                  <UserRound aria-hidden="true" size={18} />
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
      <section className="pdv-work-card pdv-work-card-medium" aria-labelledby="pdv-expenses-title">
        <header className="pdv-work-head">
          <div>
            <h1 id="pdv-expenses-title">Despesas</h1>
            <p>Saídas registradas neste turno.</p>
          </div>
          <span className="pdv-work-chip">{formatCurrency(sessionExpenses)}</span>
        </header>

        <div className="pdv-record-list">
          {expenses.map((expense) => (
            <div className="pdv-record-row" key={expense.id}>
              <span className="pdv-record-icon">
                <WalletCards aria-hidden="true" size={18} />
              </span>
              <span className="pdv-record-copy">
                <strong>{expense.title}</strong>
                <em>{formatDateTime(expense.createdAt)}</em>
              </span>
              <span className="pdv-record-value">{formatCurrency(expense.amountCents)}</span>
            </div>
          ))}

          {expenses.length === 0 ? (
            <div className="pdv-empty-state">
              <WalletCards aria-hidden="true" size={24} />
              <strong>Nenhuma despesa no turno</strong>
              <span>Registre saídas de caixa quando necessário.</span>
            </div>
          ) : null}
        </div>

        <div className="pdv-work-actions">
          <button className="pdv-secondary-action" type="button" onClick={() => setView("sale")}>
            <ArrowLeft aria-hidden="true" size={17} />
            Voltar
          </button>
          <button className="pdv-primary-action" type="button" onClick={() => setIsExpenseOpen(true)}>
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
  const navItems: Array<{
    view: CashierView;
    label: string;
    shortcut: string;
  }> = [
    { view: "sale", label: "Caixa", shortcut: "ESC" },
    { view: "history", label: "Vendas", shortcut: "F1" },
    { view: "commands", label: "Comandas", shortcut: "F2" }
  ];

  if (isAgreementPaymentEnabled && frontCashAgreementClients.length > 0) {
    navItems.push({ view: "agreement", label: "Receber Convênios", shortcut: "F3" });
  }

  navItems.push({ view: "expenses", label: "Despesas", shortcut: "F4" });
  const activeView = session && view === "menu" ? "sale" : view;
  const openCommandsCount = commands.length;
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

  return (
    <>
      <header className="pdv-system-header">
        <div className="pdv-system-brand">
          <img className="pdv-system-brand-mark" src="/app-icon.png" alt="" />
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

      <section className={isWideShell ? "pdv-cashier-shell pdv-cashier-shell-wide" : "pdv-cashier-shell"} aria-label="Sistema do caixa">
        <div className="pdv-cashier-section-title" aria-label={sectionTitle}>
          <span className="pdv-cashier-section-main">
            <SectionIcon aria-hidden="true" />
            <strong>{sectionTitle}</strong>
          </span>
        </div>

        {activeView === "menu" ? renderMenu() : null}
        {activeView === "sale" ? renderSale() : null}
        {activeView === "commands" ? renderCommands() : null}
        {activeView === "command-editor" ? renderCommandEditor() : null}
        {activeView === "agreement" ? renderAgreement() : null}
        {activeView === "expenses" ? renderExpenses() : null}
        {activeView === "history" ? renderHistory() : null}

        {isProductPickerOpen ? (
          <ProductPickerModal
            categories={catalogCategories}
            isLoading={isCatalogLoading}
            loadError={catalogError}
            products={filteredProducts}
            searchQuery={searchQuery}
            selectedCategoryId={selectedPickerCategoryId}
            onCategoryChange={setSelectedPickerCategoryId}
            onSearchChange={setSearchQuery}
            onSelect={view === "command-editor" ? addProductToCommandEditor : addProduct}
            onClose={() => setIsProductPickerOpen(false)}
          />
        ) : null}
        {commandNameRequest ? (
          <CommandNameModal onClose={() => setCommandNameRequest(null)} onConfirm={confirmCommandName} />
        ) : null}
        {commandDeleteRequest ? (
          <DeleteCommandModal
            command={commandDeleteRequest}
            onClose={() => setCommandDeleteRequest(null)}
            onConfirm={confirmDeleteCommand}
          />
        ) : null}
        {isPaymentOpen ? (
          <PaymentModal
            items={paymentItems}
            options={enabledPaymentOptions}
            totalCents={paymentTotalCents}
            onClose={closePaymentFlow}
            onConfirm={requestPaymentConfirmation}
          />
        ) : null}
        {isCashPaymentOpen ? (
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
        {isAgreementPaymentOpen ? (
          <AgreementPaymentModal
            clients={agreementClients}
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
        {isExpenseOpen ? <ExpenseModal onClose={() => setIsExpenseOpen(false)} onConfirm={addExpense} /> : null}
        {isClosingSession && session ? (
          <CloseSessionModal
            session={session}
            salesTotalCents={sessionSales}
            salesByPayment={sessionSalesByPayment}
            expensesTotalCents={sessionExpenses}
            salesCount={activeSales.length}
            commandsCount={commands.length}
            pendingSaleItemsCount={cartItems.length}
            onClose={() => setIsClosingSession(false)}
            onConfirm={closeSession}
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
            isUnpairing={isUnpairing}
            lastAccessLabel={lastAccessLabel}
            onClose={() => setIsSettingsOpen(false)}
            onShowSyncDetails={() => setIsSyncDetailsOpen(true)}
            onSyncNow={syncNow}
            onUnpair={onUnpair}
            pdvIdentity={pdvIdentity}
            syncSummary={syncSummary}
          />
        ) : null}
        {isSyncDetailsOpen ? (
          <SyncFailureDetailsModal
            events={failedSyncEvents}
            fallbackMessage={eventSyncError || syncSummary.lastError || catalogSyncError}
            onClose={() => setIsSyncDetailsOpen(false)}
          />
        ) : null}
        {selectedSale ? (
          <SaleDetailsModal
            sale={selectedSale}
            onCancelRequest={requestCancelSale}
            onClose={() => setSelectedSale(null)}
          />
        ) : null}
        {saleCancelRequest ? (
          <CancelSaleModal
            onClose={() => setSaleCancelRequest(null)}
            onConfirm={confirmCancelSale}
          />
        ) : null}
        {completedSale ? <SaleSuccessModal sale={completedSale} onClose={() => setCompletedSale(null)} /> : null}
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
  isUnpairing,
  lastAccessLabel,
  onClose,
  onShowSyncDetails,
  onSyncNow,
  onUnpair,
  pdvIdentity,
  syncSummary
}: {
  catalogSyncedAt: string | null;
  catalogSyncError: string;
  connectivity: ConnectivityState;
  eventSyncError: string;
  isCatalogSyncing: boolean;
  isManualSyncing: boolean;
  isUnpairing: boolean;
  lastAccessLabel: string;
  onClose: () => void;
  onShowSyncDetails: () => void;
  onSyncNow: () => void | Promise<void>;
  onUnpair: () => void | Promise<void>;
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
  const canSyncNow = connectivity === "online" && !isManualSyncing;

  return (
    <CashierModal
      title="Configurações do PDV"
      description="Ajustes locais deste computador."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Fechar
          </button>
          <button className="pdv-danger-action" type="button" onClick={onUnpair} disabled={isUnpairing}>
            {isUnpairing ? (
              <LoaderCircle aria-hidden="true" className="pdv-spin" size={17} />
            ) : (
              <LogOut aria-hidden="true" size={17} />
            )}
            {isUnpairing ? "Desvinculando" : "Desvincular PDV"}
          </button>
        </>
      }
    >
      <div className="pdv-settings-list">
        <div>
          <span>Computador vinculado</span>
          <strong>{pdvIdentity}</strong>
        </div>
        <div>
          <span>Conexão</span>
          <strong>{connectivity === "online" ? "Online" : "Modo local"}</strong>
        </div>
        <div>
          <span>Último acesso</span>
          <strong>{lastAccessLabel}</strong>
        </div>
      </div>
      <section className="pdv-settings-sync" aria-label="Sincronização do PDV">
        <div className="pdv-settings-section-head">
          <Cloud aria-hidden="true" size={20} />
          <div>
            <strong>Sincronização</strong>
            <span>{connectivity === "online" ? "Online com API" : "Operando com dados locais"}</span>
          </div>
        </div>

        <div className="pdv-sync-grid">
          <div className={hasQueueProblem ? "pdv-sync-card pdv-sync-card-danger" : "pdv-sync-card"}>
            <span>Fila local</span>
            <strong className={hasQueueProblem ? "pdv-sync-danger-text" : ""}>{queueLabel}</strong>
            {hasQueueProblem ? (
              <button className="pdv-sync-detail-link" type="button" onClick={onShowSyncDetails}>
                Ver detalhes
              </button>
            ) : null}
          </div>
          <div className="pdv-sync-card">
            <span>Último envio</span>
            <strong>{formatSyncDateTime(syncSummary.lastSyncedAt)}</strong>
          </div>
          <div className="pdv-sync-card">
            <span>Dados da API</span>
            <strong>{isCatalogSyncing ? "Atualizando" : formatSyncDateTime(catalogSyncedAt)}</strong>
          </div>
        </div>

        {eventSyncError || catalogSyncError ? (
          <p className="pdv-sync-message">{eventSyncError || catalogSyncError}</p>
        ) : null}

        <button className="pdv-sync-action" type="button" disabled={!canSyncNow} onClick={onSyncNow}>
          {isManualSyncing ? (
            <LoaderCircle aria-hidden="true" className="pdv-spin" size={17} />
          ) : syncSummary.failed > 0 ? (
            <RefreshCw aria-hidden="true" size={17} />
          ) : (
            <Check aria-hidden="true" size={17} />
          )}
          {isManualSyncing
            ? "Sincronizando"
            : syncSummary.failed > 0
              ? "Reenviar falhas"
              : "Sincronizar agora"}
        </button>
      </section>
    </CashierModal>
  );
}

function getSyncEventTypeLabel(eventType: string) {
  const labels: Record<string, string> = {
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
  onClose
}: {
  events: LocalPdvStorePendingEvent[];
  fallbackMessage?: string | null;
  onClose: () => void;
}) {
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
      {events.length > 0 ? (
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

  useEffect(() => {
    pickerSearchRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveProductId(products[0]?.id ?? "");
  }, [products]);

  const activeProduct = products.find((product) => product.id === activeProductId) ?? products[0];

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

            if (event.key === "ArrowDown" && products.length > 0) {
              event.preventDefault();
              const currentIndex = Math.max(0, products.findIndex((product) => product.id === activeProductId));
              const nextProduct = products[Math.min(products.length - 1, currentIndex + 1)];
              setActiveProductId(nextProduct.id);
              return;
            }

            if (event.key === "ArrowUp" && products.length > 0) {
              event.preventDefault();
              const currentIndex = Math.max(0, products.findIndex((product) => product.id === activeProductId));
              const nextProduct = products[Math.max(0, currentIndex - 1)];
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
              {categoryProducts.map((product) => (
                <button
                  className={
                    product.id === activeProductId
                      ? "pdv-product-row pdv-product-picker-row pdv-product-picker-row-active"
                      : "pdv-product-row pdv-product-picker-row"
                  }
                  key={product.id}
                  type="button"
                  aria-selected={product.id === activeProductId}
                  onPointerEnter={(event) => {
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
                  </span>
                  <span className="pdv-product-picker-meta">
                    <span>
                      <em>Preço</em>
                      <strong>{formatCurrency(product.priceCents)}</strong>
                    </span>
                  </span>
                  <Plus aria-hidden="true" size={18} />
                </button>
              ))}
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
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (title: string, amountCents: number) => void;
}) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const amountCents = parseCurrencyCents(amount);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim() || amountCents <= 0) {
      return;
    }

    onConfirm(title.trim(), amountCents);
  }

  return (
    <CashierModal
      title="Lançar despesa"
      description="Registre uma saída de dinheiro do caixa."
      onClose={onClose}
      footer={
        <>
          <button className="pdv-secondary-action" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="pdv-confirm-action" type="submit" form="pdv-expense-form" disabled={!title.trim() || amountCents <= 0}>
            <Check aria-hidden="true" size={17} />
            Salvar despesa
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
          <strong>{formatCurrency(balanceValue)}</strong>
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
                <UserRound aria-hidden="true" size={18} />
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
                    <UserRound aria-hidden="true" size={18} />
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
            <UserRound aria-hidden="true" size={18} />
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
  const expectedCashCents = salesTotalCents - expensesTotalCents;
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

function SaleDetailsModal({
  sale,
  onClose,
  onCancelRequest
}: {
  sale: SaleRecord;
  onClose: () => void;
  onCancelRequest: (sale: SaleRecord) => void;
}) {
  const paymentOption = getPaymentOption(sale.paymentMethod);
  const PaymentIcon = paymentOption.icon;
  const isCommandSale = Boolean(sale.originCommandTitle);
  const OriginIcon = isCommandSale ? ReceiptText : ShoppingCart;
  const canceled = isSaleCanceled(sale);

  return (
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
          <span className="pdv-sale-detail-token">
            <span className="pdv-sale-detail-token-icon">
              <Package aria-hidden="true" size={18} />
            </span>
            <span>
              <em>Itens</em>
              <strong>{getCartQuantity(sale.items)} itens</strong>
            </span>
          </span>
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
