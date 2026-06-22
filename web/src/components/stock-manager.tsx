"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import {
  Apple,
  Armchair,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Beef,
  Beer,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ClipboardCheck,
  Coffee,
  CupSoda,
  Dumbbell,
  Eye,
  Gift,
  History,
  LoaderCircle,
  Package,
  PackageCheck,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Search,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Utensils,
  Warehouse,
  Wrench,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type { CSSProperties } from "react";

import { ApiError, apiDelete, apiGet, apiPost, apiPut, getApiUrl } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { capitalizeFirstTextLetter } from "@/lib/text-format";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type CategoryIconId =
  | "package"
  | "shopping_basket"
  | "store"
  | "utensils"
  | "coffee"
  | "beer"
  | "apple"
  | "beef"
  | "soda"
  | "shirt"
  | "beauty"
  | "smartphone"
  | "warehouse"
  | "wrench"
  | "sports"
  | "sofa"
  | "briefcase"
  | "gift"
  | "book"
  | "pill";

type CategoryColorId =
  | "laranja"
  | "ambar"
  | "limao"
  | "menta"
  | "azul"
  | "ciano"
  | "indigo"
  | "verde"
  | "vermelho"
  | "rosa"
  | "vinho"
  | "violeta"
  | "marrom"
  | "areia"
  | "cinza"
  | "grafite";

type CategoriaProduto = {
  id: number;
  nome: string;
  icone: CategoryIconId;
  cor: CategoryColorId;
  ordem: number;
};

type ArquivoResumo = {
  id: number;
  nome_original: string;
  mime_type: string;
  tipo: string;
  tamanho_bytes: number;
  url: string | null;
};

type Estoque = {
  id: number;
  nome: string;
  ativo: boolean;
  principal_venda: boolean;
  permite_venda: boolean;
  tipo: "principal" | "reposicao";
  bloqueado: boolean;
  ordem: number;
  produtos_count: number;
  total_quantidade: number;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
};

type DeleteStockResponse =
  | {
      action: "deleted";
      id: number;
      message?: string;
    }
  | {
      action: "deactivated";
      estoque: Estoque;
      message?: string;
    };

type ActivateStockResponse = {
  action: "activated";
  estoque: Estoque;
  message?: string;
};

type ProdutoEstoque = {
  id: number;
  nome: string;
  codigo_barras: string | null;
  categoria_id: number;
  preco_custo_centavos: number;
  preco_venda_centavos: number;
  controla_estoque: boolean;
  categoria: CategoriaProduto | null;
  imagem: ArquivoResumo | null;
  saldos: Array<{
    estoque_id: number;
    quantidade: number;
  }>;
  quantidade_total: number;
  quantidade_venda: number;
};

type MovimentoTipo = "compra" | "acerto" | "transferencia";

type MovimentacaoEstoque = {
  id: number;
  lancamento_id: string | null;
  produto_id: number | null;
  produto_nome: string;
  estoque_origem_id: number | null;
  estoque_origem_nome: string | null;
  estoque_destino_id: number | null;
  estoque_destino_nome: string | null;
  tipo: MovimentoTipo;
  quantidade: number;
  saldo_origem_antes: number | null;
  saldo_origem_depois: number | null;
  saldo_destino_antes: number | null;
  saldo_destino_depois: number | null;
  created_at: string;
};

type EstoqueSnapshot = {
  estoques: Estoque[];
  produtos: ProdutoEstoque[];
  movimentacoes: MovimentacaoEstoque[];
};

type StockFlowStep = "choice" | "stock" | "purchase" | "adjustment" | "transfer";
type StockFlowMotion = "forward" | "backward";
type PurchaseStage = "history" | "stock" | "items" | "summary";
type AdjustmentStage = "history" | "stock" | "items" | "summary";
type TransferStage = "history" | "origin" | "items" | "destination" | "summary";
type OperationKind = "purchase" | "adjustment" | "transfer";
type OperationItemMotion = "enter" | "increase" | "decrease" | "remove";
type StockHistoryFilterValue = "all" | number;

type StockMovementLaunch = {
  id: string;
  lancamentoId: string | null;
  tipo: MovimentoTipo;
  estoque_origem_id: number | null;
  estoque_origem_nome: string | null;
  estoque_destino_id: number | null;
  estoque_destino_nome: string | null;
  created_at: string;
  movements: MovimentacaoEstoque[];
  itemCount: number;
  totalQuantity: number;
};

type StockDraft = {
  nome: string;
};

type OperationItem = {
  produto_id: number;
  quantidade: string;
};

const categoryIconOptions = [
  { value: "package", icon: Package },
  { value: "shopping_basket", icon: ShoppingBasket },
  { value: "store", icon: Store },
  { value: "utensils", icon: Utensils },
  { value: "coffee", icon: Coffee },
  { value: "beer", icon: Beer },
  { value: "apple", icon: Apple },
  { value: "beef", icon: Beef },
  { value: "soda", icon: CupSoda },
  { value: "shirt", icon: Shirt },
  { value: "beauty", icon: Sparkles },
  { value: "smartphone", icon: Smartphone },
  { value: "warehouse", icon: Warehouse },
  { value: "wrench", icon: Wrench },
  { value: "sports", icon: Dumbbell },
  { value: "sofa", icon: Armchair },
  { value: "briefcase", icon: BriefcaseBusiness },
  { value: "book", icon: BookOpen },
  { value: "pill", icon: Pill },
  { value: "gift", icon: Gift }
] satisfies Array<{ value: CategoryIconId; icon: LucideIcon }>;

const iconById = categoryIconOptions.reduce<Record<CategoryIconId, LucideIcon>>(
  (accumulator, option) => {
    accumulator[option.value] = option.icon;
    return accumulator;
  },
  {} as Record<CategoryIconId, LucideIcon>
);

const categoryColorOptions = [
  { value: "laranja", solid: "oklch(0.68 0.19 45)", soft: "oklch(0.96 0.035 55)", text: "oklch(0.48 0.16 42)" },
  { value: "ambar", solid: "oklch(0.78 0.16 76)", soft: "oklch(0.96 0.04 82)", text: "oklch(0.45 0.12 70)" },
  { value: "limao", solid: "oklch(0.76 0.17 115)", soft: "oklch(0.96 0.04 115)", text: "oklch(0.42 0.12 115)" },
  { value: "menta", solid: "oklch(0.68 0.14 166)", soft: "oklch(0.95 0.032 166)", text: "oklch(0.36 0.1 166)" },
  { value: "azul", solid: "oklch(0.58 0.14 240)", soft: "oklch(0.95 0.025 240)", text: "oklch(0.42 0.12 245)" },
  { value: "ciano", solid: "oklch(0.67 0.13 205)", soft: "oklch(0.95 0.028 205)", text: "oklch(0.38 0.1 205)" },
  { value: "indigo", solid: "oklch(0.5 0.16 266)", soft: "oklch(0.95 0.024 266)", text: "oklch(0.36 0.12 266)" },
  { value: "verde", solid: "oklch(0.62 0.15 150)", soft: "oklch(0.95 0.03 150)", text: "oklch(0.38 0.11 150)" },
  { value: "vermelho", solid: "oklch(0.58 0.19 28)", soft: "oklch(0.96 0.025 28)", text: "oklch(0.45 0.14 28)" },
  { value: "rosa", solid: "oklch(0.64 0.18 350)", soft: "oklch(0.96 0.026 350)", text: "oklch(0.43 0.13 350)" },
  { value: "vinho", solid: "oklch(0.45 0.15 18)", soft: "oklch(0.95 0.022 18)", text: "oklch(0.36 0.12 18)" },
  { value: "violeta", solid: "oklch(0.56 0.15 300)", soft: "oklch(0.96 0.025 300)", text: "oklch(0.42 0.12 300)" },
  { value: "marrom", solid: "oklch(0.48 0.1 58)", soft: "oklch(0.95 0.022 58)", text: "oklch(0.35 0.08 58)" },
  { value: "areia", solid: "oklch(0.72 0.08 84)", soft: "oklch(0.96 0.025 84)", text: "oklch(0.42 0.08 84)" },
  { value: "cinza", solid: "oklch(0.56 0.02 250)", soft: "oklch(0.95 0.006 250)", text: "oklch(0.38 0.02 250)" },
  { value: "grafite", solid: "oklch(0.32 0.02 250)", soft: "oklch(0.92 0.006 250)", text: "oklch(0.24 0.02 250)" }
] satisfies Array<{
  value: CategoryColorId;
  solid: string;
  soft: string;
  text: string;
}>;

const colorById = categoryColorOptions.reduce<Record<CategoryColorId, (typeof categoryColorOptions)[number]>>(
  (accumulator, option) => {
    accumulator[option.value] = option;
    return accumulator;
  },
  {} as Record<CategoryColorId, (typeof categoryColorOptions)[number]>
);

const stockFlowOrder: StockFlowStep[] = ["choice", "stock", "purchase", "adjustment", "transfer"];

const movementLabels: Record<MovimentoTipo, string> = {
  compra: "Compra",
  acerto: "Acerto",
  transferencia: "Transferência"
};

function getStockFlowIndex(step: StockFlowStep) {
  const index = stockFlowOrder.indexOf(step);

  return index >= 0 ? index : 0;
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function decimalInput(value: string) {
  return value.replace(/[^\d,.]/g, "");
}

function parseDraftQuantity(value: string) {
  const parsed = Number(value.replace(",", "."));

  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function formatQuantity(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 3,
    minimumFractionDigits: 0
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatCurrencyFromCents(value: number | null | undefined) {
  const cents = Number(value ?? 0);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format((Number.isFinite(cents) ? cents : 0) / 100);
}

function getMovementTime(value: string) {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getMovementLaunchKey(movement: MovimentacaoEstoque) {
  if (movement.lancamento_id) {
    return `id:${movement.lancamento_id}`;
  }

  const minuteBucket = Math.floor(getMovementTime(movement.created_at) / 60000);

  return [
    "legacy",
    movement.tipo,
    movement.estoque_origem_id ?? "sem-origem",
    movement.estoque_destino_id ?? "sem-destino",
    minuteBucket
  ].join(":");
}

function buildMovementLaunches(movements: MovimentacaoEstoque[]) {
  const launchesByKey = new Map<string, MovimentacaoEstoque[]>();

  movements.forEach(movement => {
    const key = getMovementLaunchKey(movement);
    const current = launchesByKey.get(key) ?? [];

    current.push(movement);
    launchesByKey.set(key, current);
  });

  return Array.from(launchesByKey.entries())
    .map(([key, launchMovements]) => {
      const orderedMovements = [...launchMovements].sort((left, right) => {
        if (left.produto_nome !== right.produto_nome) {
          return left.produto_nome.localeCompare(right.produto_nome, "pt-BR");
        }

        return left.id - right.id;
      });
      const movementDates = orderedMovements
        .map(movement => movement.created_at)
        .filter(Boolean)
        .sort((left, right) => getMovementTime(right) - getMovementTime(left));
      const firstMovement = orderedMovements[0];

      return {
        id: key,
        lancamentoId: firstMovement?.lancamento_id ?? null,
        tipo: firstMovement?.tipo ?? "compra",
        estoque_origem_id: firstMovement?.estoque_origem_id ?? null,
        estoque_origem_nome: firstMovement?.estoque_origem_nome ?? null,
        estoque_destino_id: firstMovement?.estoque_destino_id ?? null,
        estoque_destino_nome: firstMovement?.estoque_destino_nome ?? null,
        created_at: movementDates[0] ?? firstMovement?.created_at ?? "",
        movements: orderedMovements,
        itemCount: orderedMovements.length,
        totalQuantity: orderedMovements.reduce((total, movement) => total + Number(movement.quantidade ?? 0), 0)
      } satisfies StockMovementLaunch;
    })
    .sort((left, right) => getMovementTime(right.created_at) - getMovementTime(left.created_at));
}

function resolveArquivoUrl(arquivo: ArquivoResumo | null) {
  if (!arquivo?.url) {
    return null;
  }

  if (/^https?:\/\//i.test(arquivo.url)) {
    return arquivo.url;
  }

  return getApiUrl(arquivo.url);
}

function buildEmptyStockDraft(): StockDraft {
  return { nome: "" };
}

function buildStockDraft(stock: Estoque): StockDraft {
  return { nome: capitalizeFirstTextLetter(stock.nome) };
}

function canSaveStockDraft(draft: StockDraft) {
  return draft.nome.trim().length >= 2;
}

function ProductCategoryIcon({ category }: { category: CategoriaProduto }) {
  const Icon = iconById[category.icone] ?? Package;
  const color = colorById[category.cor] ?? colorById.laranja;

  return (
    <span
      className="product-category-icon"
      style={{
        backgroundColor: color.soft,
        color: color.text
      }}
      aria-hidden="true"
    >
      <Icon size={18} />
    </span>
  );
}

function ProductVisual({
  category,
  imageUrl
}: {
  category: CategoriaProduto | null;
  imageUrl?: string | null;
}) {
  const fallbackCategory =
    category ??
    ({
      id: 0,
      nome: "Produto",
      icone: "package",
      cor: "laranja",
      ordem: 0
    } satisfies CategoriaProduto);
  const Icon = iconById[fallbackCategory.icone] ?? Package;
  const color = colorById[fallbackCategory.cor] ?? colorById.laranja;

  return (
    <span
      className="product-image-preview"
      style={
        imageUrl
          ? undefined
          : ({
              backgroundColor: color.soft,
              color: color.text
            } as CSSProperties)
      }
      aria-hidden="true"
    >
      {imageUrl ? <img src={imageUrl} alt="" /> : <Icon size={18} />}
    </span>
  );
}

function groupProductsByCategory(products: ProdutoEstoque[]) {
  const groupByCategory = new Map<number, { category: CategoriaProduto; products: ProdutoEstoque[] }>();
  const fallbackCategory: CategoriaProduto = {
    id: 0,
    nome: "Sem categoria",
    icone: "package",
    cor: "laranja",
    ordem: 9999
  };

  products.forEach(product => {
    const category = product.categoria ?? fallbackCategory;
    const current = groupByCategory.get(category.id) ?? { category, products: [] };

    current.products.push(product);
    groupByCategory.set(category.id, current);
  });

  return Array.from(groupByCategory.values())
    .sort((left, right) => left.category.ordem - right.category.ordem || left.category.nome.localeCompare(right.category.nome, "pt-BR"))
    .map(group => ({
      ...group,
      products: group.products.sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"))
    }));
}

export function StockManager() {
  const [snapshot, setSnapshot] = useState<EstoqueSnapshot>({
    estoques: [],
    produtos: [],
    movimentacoes: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<StockFlowStep>("choice");
  const [flowMotion, setFlowMotion] = useState<StockFlowMotion>("forward");
  const [searchValue, setSearchValue] = useState("");
  const [operationSearchValue, setOperationSearchValue] = useState("");
  const [operationPickerCategoryId, setOperationPickerCategoryId] = useState<"all" | number>("all");
  const deferredSearchValue = useDeferredValue(searchValue);
  const deferredOperationSearchValue = useDeferredValue(operationSearchValue);
  const [selectedStockId, setSelectedStockId] = useState<"all" | number>("all");
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [operationPickerKind, setOperationPickerKind] = useState<OperationKind | null>(null);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [stockDraft, setStockDraft] = useState<StockDraft>(buildEmptyStockDraft);
  const [pendingDeleteStock, setPendingDeleteStock] = useState<Estoque | null>(null);
  const [movementDetails, setMovementDetails] = useState<StockMovementLaunch | null>(null);
  const [pendingRevertMovement, setPendingRevertMovement] = useState<StockMovementLaunch | null>(null);
  const [purchaseStage, setPurchaseStage] = useState<PurchaseStage>("history");
  const [purchaseHistoryStockFilter, setPurchaseHistoryStockFilter] = useState<StockHistoryFilterValue>("all");
  const [purchaseStockId, setPurchaseStockId] = useState("");
  const [purchaseItems, setPurchaseItems] = useState<OperationItem[]>([]);
  const [adjustmentStage, setAdjustmentStage] = useState<AdjustmentStage>("history");
  const [adjustmentStockId, setAdjustmentStockId] = useState("");
  const [adjustmentItems, setAdjustmentItems] = useState<OperationItem[]>([]);
  const [transferStage, setTransferStage] = useState<TransferStage>("history");
  const [transferHistoryStockFilter, setTransferHistoryStockFilter] = useState<StockHistoryFilterValue>("all");
  const [transferOriginId, setTransferOriginId] = useState("");
  const [transferDestinationId, setTransferDestinationId] = useState("");
  const [transferItems, setTransferItems] = useState<OperationItem[]>([]);
  const [operationItemMotions, setOperationItemMotions] = useState<Record<number, { kind: OperationItemMotion; cycle: number }>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationMotionCyclesRef = useRef<Record<number, number>>({});
  const operationMotionTimeoutsRef = useRef<Record<number, number>>({});
  const operationRemovalTimeoutsRef = useRef<Record<number, number>>({});

  const stocks = snapshot.estoques;
  const products = snapshot.produtos;
  const movements = snapshot.movimentacoes;
  const activeStocks = stocks.filter(stock => stock.ativo);
  const defaultStock = activeStocks.find(stock => stock.principal_venda) ?? activeStocks[0] ?? null;
  const replenishmentStocks = activeStocks.filter(stock => !stock.principal_venda);
  const editingStock = editingStockId
    ? stocks.find(stock => stock.id === editingStockId) ?? null
    : null;
  const selectedStock = selectedStockId === "all"
    ? null
    : stocks.find(stock => stock.id === selectedStockId) ?? null;
  const hasOpenModal =
    isStockModalOpen ||
    Boolean(operationPickerKind) ||
    Boolean(pendingDeleteStock) ||
    Boolean(movementDetails) ||
    Boolean(pendingRevertMovement);
  const stockModalPresence = useModalPresence(isStockModalOpen);
  const operationPickerPresence = useModalPresence(operationPickerKind);
  const visibleOperationPickerKind = operationPickerPresence.presentValue;
  const movementDetailsPresence = useModalPresence(movementDetails);
  const visibleMovementDetails = movementDetailsPresence.presentValue;
  const pendingDeleteStockPresence = useModalPresence(pendingDeleteStock);
  const visiblePendingDeleteStock = pendingDeleteStockPresence.presentValue;
  const pendingRevertMovementPresence = useModalPresence(pendingRevertMovement);
  const visiblePendingRevertMovement = pendingRevertMovementPresence.presentValue;
  const movementDetailsForModal = movementDetails ?? visibleMovementDetails;
  const hasVisibleModal =
    stockModalPresence.isPresent ||
    operationPickerPresence.isPresent ||
    movementDetailsPresence.isPresent ||
    pendingDeleteStockPresence.isPresent ||
    pendingRevertMovementPresence.isPresent;
  const normalizedSearch = normalizeSearchValue(deferredSearchValue);
  const normalizedOperationSearch = normalizeSearchValue(deferredOperationSearchValue);
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const canUseStockProducts = products.length > 0;
  const canTransfer = canUseStockProducts && stocks.length > 1;
  const stockFlowShellClassName =
    flowStep === "choice"
      ? "platform-flow-shell platform-flow-shell-compact product-flow-shell stock-flow-shell stock-flow-shell-menu"
      : "platform-flow-shell product-flow-shell stock-flow-shell";
  const stockCardClassName =
    flowStep === "choice"
      ? "platform-flow-card product-catalog-card product-catalog-card-compact stock-flow-card-menu"
      : "platform-flow-card product-catalog-card product-catalog-card-wide";

  const purchaseMovements = useMemo(
    () => movements.filter(movement => movement.tipo === "compra"),
    [movements]
  );
  const purchaseLaunches = useMemo(() => buildMovementLaunches(purchaseMovements), [purchaseMovements]);
  const filteredPurchaseLaunches = useMemo(() => {
    if (purchaseHistoryStockFilter === "all") {
      return purchaseLaunches;
    }

    return purchaseLaunches.filter(launch => launch.estoque_destino_id === purchaseHistoryStockFilter);
  }, [purchaseHistoryStockFilter, purchaseLaunches]);
  const adjustmentMovements = useMemo(
    () => movements.filter(movement => movement.tipo === "acerto"),
    [movements]
  );
  const adjustmentLaunches = useMemo(() => buildMovementLaunches(adjustmentMovements), [adjustmentMovements]);
  const transferMovements = useMemo(
    () => movements.filter(movement => movement.tipo === "transferencia"),
    [movements]
  );
  const transferLaunches = useMemo(() => buildMovementLaunches(transferMovements), [transferMovements]);
  const filteredTransferLaunches = useMemo(() => {
    if (transferHistoryStockFilter === "all") {
      return transferLaunches;
    }

    return transferLaunches.filter(
      launch => launch.estoque_origem_id === transferHistoryStockFilter
    );
  }, [transferHistoryStockFilter, transferLaunches]);

  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      if (selectedStockId !== "all" && getProductBalance(product, selectedStockId) <= 0) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const haystack = [
        product.nome,
        product.codigo_barras ?? "",
        product.categoria?.nome ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [normalizedSearch, products, selectedStockId]);

  const groupedProducts = useMemo(() => groupProductsByCategory(filteredProducts), [filteredProducts]);

  const filteredOperationProducts = useMemo(() => {
    return products.filter(product => {
      if (!normalizedOperationSearch) {
        return true;
      }

      const haystack = [
        product.nome,
        product.codigo_barras ?? "",
        product.categoria?.nome ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedOperationSearch);
    });
  }, [normalizedOperationSearch, products]);

  const operationPickerCategories = useMemo(() => {
    const categoryMap = new Map<number, CategoriaProduto>();

    products.forEach(product => {
      if (product.categoria) {
        categoryMap.set(product.categoria.id, product.categoria);
      }
    });

    return Array.from(categoryMap.values()).sort(
      (left, right) => left.ordem - right.ordem || left.nome.localeCompare(right.nome, "pt-BR")
    );
  }, [products]);

  const resolvedPurchaseItems = resolveOperationItems(purchaseItems);
  const resolvedAdjustmentItems = resolveOperationItems(adjustmentItems);
  const resolvedTransferItems = resolveOperationItems(transferItems);
  const purchaseTotalQuantity = sumOperationItems(resolvedPurchaseItems);
  const adjustmentTotalQuantity = sumOperationItems(resolvedAdjustmentItems);
  const transferTotalQuantity = sumOperationItems(resolvedTransferItems);

  usePlatformModalScrollLock(hasVisibleModal);
  const stockModalDismiss = useModalDismiss(hasOpenModal, closeTopStockModal);

  const loadStock = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLoadError("Sessão expirada. Entre novamente para continuar.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await apiGet<EstoqueSnapshot>("/estoques", { token });

      setSnapshot(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, "Não foi possível carregar o estoque."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useEffect(() => {
    return () => {
      Object.values(operationMotionTimeoutsRef.current).forEach(clearTimeout);
      Object.values(operationRemovalTimeoutsRef.current).forEach(clearTimeout);
      operationMotionTimeoutsRef.current = {};
      operationRemovalTimeoutsRef.current = {};
      operationMotionCyclesRef.current = {};
    };
  }, []);

  function resolveOperationItems(items: OperationItem[]) {
    return items
      .map(item => {
        const product = products.find(productItem => productItem.id === item.produto_id) ?? null;

        return product
          ? {
              product,
              quantidade: parseDraftQuantity(item.quantidade)
            }
          : null;
      })
      .filter((item): item is { product: ProdutoEstoque; quantidade: number } => Boolean(item));
  }

  function sumOperationItems(items: Array<{ quantidade: number }>) {
    return items.reduce((total, item) => Number((total + item.quantidade).toFixed(3)), 0);
  }

  function getProductBalance(product: ProdutoEstoque, stockId: number) {
    return product.saldos.find(saldo => saldo.estoque_id === stockId)?.quantidade ?? 0;
  }

  function getDisplayedProductBalance(product: ProdutoEstoque) {
    if (selectedStockId === "all") {
      return product.quantidade_total;
    }

    return getProductBalance(product, selectedStockId);
  }

  function firstStockId() {
    return defaultStock ? String(defaultStock.id) : activeStocks[0] ? String(activeStocks[0].id) : "";
  }

  function firstReplenishmentOrDefaultStockId() {
    return replenishmentStocks[0] ? String(replenishmentStocks[0].id) : firstStockId();
  }

  function resolveActiveStockId(stockId: number | null | undefined, fallbackId: string) {
    if (stockId && activeStocks.some(stock => stock.id === stockId)) {
      return String(stockId);
    }

    return fallbackId;
  }

  function runFlowTransition(motion: StockFlowMotion, update: () => void) {
    const root = document.documentElement;
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    root.dataset.platformFlowMotion = motion;

    if (typeof viewTransitionDocument.startViewTransition === "function") {
      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(() => {
          setFlowMotion(motion);
          update();
        });
      });

      void transition.finished.finally(() => {
        delete root.dataset.platformFlowMotion;
      });
      return;
    }

    root.dataset.platformFlowFallback = "true";
    setFlowMotion(motion);
    update();
    window.setTimeout(() => {
      delete root.dataset.platformFlowMotion;
      delete root.dataset.platformFlowFallback;
    }, 430);
  }

  function moveToFlowStep(nextStep: StockFlowStep) {
    if (nextStep === flowStep) {
      return;
    }

    const motion: StockFlowMotion =
      getStockFlowIndex(nextStep) >= getStockFlowIndex(flowStep) ? "forward" : "backward";

    runFlowTransition(motion, () => setFlowStep(nextStep));
  }

  function movePurchaseStage(nextStage: PurchaseStage) {
    if (nextStage === purchaseStage) {
      return;
    }

    const order: PurchaseStage[] = ["history", "stock", "items", "summary"];
    const motion: StockFlowMotion = order.indexOf(nextStage) >= order.indexOf(purchaseStage) ? "forward" : "backward";

    runFlowTransition(motion, () => setPurchaseStage(nextStage));
  }

  function moveAdjustmentStage(nextStage: AdjustmentStage) {
    if (nextStage === adjustmentStage) {
      return;
    }

    const order: AdjustmentStage[] = ["history", "stock", "items", "summary"];
    const motion: StockFlowMotion = order.indexOf(nextStage) >= order.indexOf(adjustmentStage) ? "forward" : "backward";

    runFlowTransition(motion, () => setAdjustmentStage(nextStage));
  }

  function moveTransferStage(nextStage: TransferStage) {
    if (nextStage === transferStage) {
      return;
    }

    const order: TransferStage[] = ["history", "origin", "items", "destination", "summary"];
    const motion: StockFlowMotion = order.indexOf(nextStage) >= order.indexOf(transferStage) ? "forward" : "backward";

    runFlowTransition(motion, () => setTransferStage(nextStage));
  }

  function openFlow(nextStep: StockFlowStep) {
    setSubmitError(null);
    setOperationSearchValue("");
    moveToFlowStep(nextStep);
  }

  function openNewStockModal() {
    setEditingStockId(null);
    setStockDraft(buildEmptyStockDraft());
    setSubmitError(null);
    setIsStockModalOpen(true);
  }

  function openEditStockModal(stockId: number) {
    const stock = stocks.find(item => item.id === stockId);

    if (!stock || stock.bloqueado) {
      return;
    }

    setEditingStockId(stockId);
    setStockDraft(buildStockDraft(stock));
    setSubmitError(null);
    setIsStockModalOpen(true);
  }

  function closeStockModal() {
    setIsStockModalOpen(false);
    setEditingStockId(null);
    setStockDraft(buildEmptyStockDraft());
    setSubmitError(null);
    setIsSubmitting(false);
  }

  function closeTopStockModal() {
    if (operationPickerKind) {
      setOperationPickerKind(null);
      return;
    }

    if (pendingRevertMovement) {
      setPendingRevertMovement(null);
      return;
    }

    if (movementDetails) {
      setMovementDetails(null);
      return;
    }

    if (pendingDeleteStock) {
      setPendingDeleteStock(null);
      return;
    }

    if (isStockModalOpen) {
      closeStockModal();
    }
  }

  function getSourceMovements(source?: MovimentacaoEstoque | StockMovementLaunch) {
    if (!source) {
      return [];
    }

    return "movements" in source ? source.movements : [source];
  }

  function startPurchaseFlow(source?: MovimentacaoEstoque | StockMovementLaunch) {
    const sourceMovements = getSourceMovements(source);
    const firstMovement = sourceMovements[0] ?? null;

    setPurchaseStockId(
      resolveActiveStockId(firstMovement?.estoque_destino_id, firstReplenishmentOrDefaultStockId())
    );
    setPurchaseItems(
      sourceMovements
        .filter((movement): movement is MovimentacaoEstoque & { produto_id: number } => Boolean(movement.produto_id))
        .map(movement => ({
          produto_id: movement.produto_id,
          quantidade: String(movement.quantidade).replace(".", ",")
        }))
    );
    setOperationSearchValue("");
    setSubmitError(null);
    setPurchaseStage(source ? "items" : "stock");
    openFlow("purchase");
  }

  function startAdjustmentFlow(source?: MovimentacaoEstoque | StockMovementLaunch) {
    const sourceMovements = getSourceMovements(source);
    const firstMovement = sourceMovements[0] ?? null;

    setAdjustmentStockId(
      resolveActiveStockId(firstMovement?.estoque_destino_id, firstStockId())
    );
    setAdjustmentItems(
      sourceMovements
        .filter((movement): movement is MovimentacaoEstoque & { produto_id: number } => Boolean(movement.produto_id))
        .map(movement => ({
          produto_id: movement.produto_id,
          quantidade: String(movement.saldo_destino_depois ?? movement.quantidade).replace(".", ",")
        }))
    );
    setOperationSearchValue("");
    setSubmitError(null);
    setAdjustmentStage(source ? "items" : "stock");
    openFlow("adjustment");
  }

  function startTransferFlow(source?: MovimentacaoEstoque | StockMovementLaunch) {
    const sourceMovements = getSourceMovements(source);
    const firstMovement = sourceMovements[0] ?? null;
    const originId = firstMovement?.estoque_origem_id
      ? resolveActiveStockId(firstMovement.estoque_origem_id, firstReplenishmentOrDefaultStockId())
      : firstReplenishmentOrDefaultStockId();
    const fallbackDestination = defaultStock && String(defaultStock.id) !== originId
      ? String(defaultStock.id)
      : activeStocks.find(stock => String(stock.id) !== originId)?.id;

    setTransferOriginId(originId);
    setTransferDestinationId(
      firstMovement?.estoque_destino_id
        ? resolveActiveStockId(firstMovement.estoque_destino_id, fallbackDestination ? String(fallbackDestination) : "")
        : fallbackDestination
          ? String(fallbackDestination)
          : ""
    );
    setTransferItems(
      sourceMovements
        .filter((movement): movement is MovimentacaoEstoque & { produto_id: number } => Boolean(movement.produto_id))
        .map(movement => ({
          produto_id: movement.produto_id,
          quantidade: String(movement.quantidade).replace(".", ",")
        }))
    );
    setOperationSearchValue("");
    setSubmitError(null);
    setTransferStage(source ? "items" : "origin");
    openFlow("transfer");
  }

  async function refreshSnapshotFromMutation(result: EstoqueSnapshot) {
    setSnapshot(result);
    setSubmitError(null);
  }

  async function handleStockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    if (!canSaveStockDraft(stockDraft)) {
      setSubmitError("Informe um nome para o estoque.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = { nome: capitalizeFirstTextLetter(stockDraft.nome).trim() };

      if (editingStockId) {
        await apiPut(`/estoques/${editingStockId}`, payload, { token });
      } else {
        await apiPost("/estoques", payload, { token });
      }

      closeStockModal();
      await loadStock();
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Não foi possível salvar o estoque."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePurchaseSubmit() {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    if (!purchaseStockId || resolvedPurchaseItems.length === 0) {
      setSubmitError("Escolha um estoque e adicione produtos à compra.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await apiPost<EstoqueSnapshot>(
        "/estoques/compras",
        {
          estoque_id: Number(purchaseStockId),
          itens: resolvedPurchaseItems.map(item => ({
            produto_id: item.product.id,
            quantidade: String(item.quantidade)
          }))
        },
        { token }
      );

      await refreshSnapshotFromMutation(result);
      movePurchaseStage("history");
      setPurchaseItems([]);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Não foi possível registrar a compra."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAdjustmentSubmit() {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    if (!adjustmentStockId || resolvedAdjustmentItems.length === 0) {
      setSubmitError("Escolha um estoque e adicione produtos ao acerto.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await apiPost<EstoqueSnapshot>(
        "/estoques/acertos",
        {
          estoque_id: Number(adjustmentStockId),
          itens: resolvedAdjustmentItems.map(item => ({
            produto_id: item.product.id,
            quantidade: String(item.quantidade)
          }))
        },
        { token }
      );

      await refreshSnapshotFromMutation(result);
      moveAdjustmentStage("history");
      setAdjustmentItems([]);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Não foi possível registrar o acerto."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleTransferSubmit() {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    if (!transferOriginId || !transferDestinationId || resolvedTransferItems.length === 0) {
      setSubmitError("Escolha origem, destino e produtos da transferência.");
      return;
    }

    if (transferOriginId === transferDestinationId) {
      setSubmitError("Origem e destino devem ser diferentes.");
      return;
    }

    const invalidTransferItem = resolvedTransferItems.find(item => {
      const originStock = stocks.find(stock => String(stock.id) === transferOriginId);
      const availableQuantity = originStock ? getProductBalance(item.product, originStock.id) : 0;

      return item.quantidade > availableQuantity;
    });

    if (invalidTransferItem) {
      setSubmitError(`${invalidTransferItem.product.nome} tem saldo menor que a quantidade informada na origem.`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await apiPost<EstoqueSnapshot>(
        "/estoques/transferencias",
        {
          estoque_origem_id: Number(transferOriginId),
          estoque_destino_id: Number(transferDestinationId),
          itens: resolvedTransferItems.map(item => ({
            produto_id: item.product.id,
            quantidade: String(item.quantidade)
          }))
        },
        { token }
      );

      await refreshSnapshotFromMutation(result);
      moveTransferStage("history");
      setTransferItems([]);
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Não foi possível registrar a transferência."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeDeleteStock() {
    if (!pendingDeleteStock) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiDelete<DeleteStockResponse>(`/estoques/${pendingDeleteStock.id}`, { token });
      setPendingDeleteStock(null);
      closeStockModal();
      setSelectedStockId("all");
      await loadStock();
    } catch (error) {
      setPendingDeleteStock(null);
      setSubmitError(getErrorMessage(error, "Não foi possível excluir o estoque."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeActivateStock() {
    if (!editingStock || editingStock.ativo || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await apiPost<ActivateStockResponse>(`/estoques/${editingStock.id}/ativar`, {}, { token });
      await loadStock();
    } catch (error) {
      setSubmitError(getErrorMessage(error, "Não foi possível ativar o estoque."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executeRevertMovement() {
    if (!pendingRevertMovement) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setSubmitError("Sessão expirada. Entre novamente para continuar.");
      return;
    }

    setIsSubmitting(true);

    try {
      let result: EstoqueSnapshot | null = null;

      if (pendingRevertMovement.lancamentoId) {
        result = await apiPost<EstoqueSnapshot>(
          `/estoques/movimentacoes/lancamentos/${encodeURIComponent(pendingRevertMovement.lancamentoId)}/reverter`,
          {},
          { token }
        );
      } else {
        for (const movement of pendingRevertMovement.movements) {
          result = await apiPost<EstoqueSnapshot>(
            `/estoques/movimentacoes/${movement.id}/reverter`,
            {},
            { token }
          );
        }
      }

      if (result) {
        await refreshSnapshotFromMutation(result);
      }
      setPendingRevertMovement(null);
      setMovementDetails(null);
    } catch (error) {
      setPendingRevertMovement(null);
      setSubmitError(getErrorMessage(error, "Não foi possível reverter o lançamento."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function getOperationStock(kind: OperationKind) {
    if (kind === "purchase") {
      return stocks.find(stock => String(stock.id) === purchaseStockId) ?? null;
    }

    if (kind === "adjustment") {
      return stocks.find(stock => String(stock.id) === adjustmentStockId) ?? null;
    }

    return stocks.find(stock => String(stock.id) === transferOriginId) ?? null;
  }

  function getOperationItems(kind: OperationKind) {
    if (kind === "purchase") {
      return purchaseItems;
    }

    if (kind === "adjustment") {
      return adjustmentItems;
    }

    return transferItems;
  }

  function updateOperationItems(kind: OperationKind, updater: (items: OperationItem[]) => OperationItem[]) {
    if (kind === "purchase") {
      setPurchaseItems(updater);
      return;
    }

    if (kind === "adjustment") {
      setAdjustmentItems(updater);
      return;
    }

    setTransferItems(updater);
  }

  function setOperationItems(kind: OperationKind, items: OperationItem[]) {
    updateOperationItems(kind, () => items);
  }

  function clearOperationItemMotion(productId: number) {
    const timeoutId = operationMotionTimeoutsRef.current[productId];

    if (timeoutId) {
      clearTimeout(timeoutId);
      delete operationMotionTimeoutsRef.current[productId];
    }

    setOperationItemMotions(current => {
      if (!current[productId]) {
        return current;
      }

      const next = { ...current };
      delete next[productId];
      return next;
    });
  }

  function clearOperationItemRemoval(productId: number) {
    const timeoutId = operationRemovalTimeoutsRef.current[productId];

    if (timeoutId) {
      clearTimeout(timeoutId);
      delete operationRemovalTimeoutsRef.current[productId];
    }
  }

  function scheduleOperationItemMotion(productId: number, kind: OperationItemMotion, duration = 420) {
    clearOperationItemMotion(productId);

    const nextCycle = (operationMotionCyclesRef.current[productId] ?? 0) + 1;
    operationMotionCyclesRef.current[productId] = nextCycle;

    setOperationItemMotions(current => ({
      ...current,
      [productId]: { kind, cycle: nextCycle }
    }));

    operationMotionTimeoutsRef.current[productId] = window.setTimeout(() => {
      setOperationItemMotions(current => {
        if (current[productId]?.cycle !== nextCycle) {
          return current;
        }

        const next = { ...current };
        delete next[productId];
        return next;
      });
      delete operationMotionTimeoutsRef.current[productId];
    }, duration);
  }

  function getDefaultOperationQuantity(kind: OperationKind, product: ProdutoEstoque) {
    const stock = getOperationStock(kind);

    if (kind === "adjustment") {
      return String(stock ? getProductBalance(product, stock.id) : 0).replace(".", ",");
    }

    if (kind === "transfer") {
      return "0";
    }

    return kind === "purchase" ? "0" : "1";
  }

  function addProductsToOperationCart(kind: OperationKind, nextProducts: ProdutoEstoque[]) {
    const currentItems = getOperationItems(kind);
    const existingIds = new Set(currentItems.map(item => item.produto_id));
    const newItems = nextProducts
      .filter(product => !existingIds.has(product.id))
      .map(product => ({
        produto_id: product.id,
        quantidade: getDefaultOperationQuantity(kind, product)
      }));

    if (newItems.length > 0) {
      setOperationItems(kind, [...currentItems, ...newItems]);
      newItems.forEach(item => scheduleOperationItemMotion(item.produto_id, "enter", 360));
    }

    setSubmitError(null);
  }

  function removeProductsFromOperationCart(kind: OperationKind, productsToRemove: ProdutoEstoque[]) {
    const productIdsToRemove = new Set(productsToRemove.map(product => product.id));

    setOperationItems(
      kind,
      getOperationItems(kind).filter(item => !productIdsToRemove.has(item.produto_id))
    );
    setSubmitError(null);
  }

  function addProductToOperationCart(kind: OperationKind, product: ProdutoEstoque) {
    addProductsToOperationCart(kind, [product]);
  }

  function toggleOperationProductSelection(kind: OperationKind, product: ProdutoEstoque) {
    const currentItems = getOperationItems(kind);
    const isSelected = currentItems.some(item => item.produto_id === product.id);

    if (isSelected) {
      removeOperationItem(kind, product.id);
      return;
    }

    addProductToOperationCart(kind, product);
  }

  function updateOperationItemQuantity(kind: OperationKind, productId: number, quantidade: string) {
    const sanitizedQuantity = decimalInput(quantidade);
    let nextQuantity = sanitizedQuantity;

    if (kind === "transfer" && sanitizedQuantity) {
      const product = products.find(currentProduct => currentProduct.id === productId);
      const stock = getOperationStock("transfer");
      const maxQuantity = product && stock ? getProductBalance(product, stock.id) : 0;
      const parsedQuantity = parseDraftQuantity(sanitizedQuantity);

      if (parsedQuantity > maxQuantity) {
        nextQuantity = String(maxQuantity).replace(".", ",");
      }
    }

    setOperationItems(
      kind,
      getOperationItems(kind).map(item =>
        item.produto_id === productId
          ? { ...item, quantidade: nextQuantity }
          : item
      )
    );
  }

  function stepOperationItemQuantity(kind: OperationKind, productId: number, delta: number) {
    const item = getOperationItems(kind).find(currentItem => currentItem.produto_id === productId);

    if (!item) {
      return;
    }

    clearOperationItemRemoval(productId);

    let nextQuantity = Math.max(0, Number((parseDraftQuantity(item.quantidade) + delta).toFixed(3)));

    if (kind === "transfer") {
      const product = products.find(currentProduct => currentProduct.id === productId);
      const stock = getOperationStock("transfer");
      const maxQuantity = product && stock ? getProductBalance(product, stock.id) : 0;

      nextQuantity = Math.min(nextQuantity, maxQuantity);
    }

    updateOperationItemQuantity(kind, productId, String(nextQuantity).replace(".", ","));
    scheduleOperationItemMotion(productId, delta > 0 ? "increase" : "decrease", 220);
  }

  function removeOperationItem(kind: OperationKind, productId: number) {
    if (operationRemovalTimeoutsRef.current[productId]) {
      return;
    }

    scheduleOperationItemMotion(productId, "remove", 240);
    operationRemovalTimeoutsRef.current[productId] = window.setTimeout(() => {
      updateOperationItems(kind, items => items.filter(item => item.produto_id !== productId));
      clearOperationItemMotion(productId);
      delete operationRemovalTimeoutsRef.current[productId];
    }, 240);
  }

  function getPurchaseItemTotalCents(item: { product: ProdutoEstoque; quantidade: number }) {
    return Math.round((item.product.preco_custo_centavos ?? 0) * item.quantidade);
  }

  function getPurchaseTotalCents(items: Array<{ product: ProdutoEstoque; quantidade: number }>) {
    return items.reduce((total, item) => total + getPurchaseItemTotalCents(item), 0);
  }

  function getAdjustmentDeltaQuantity(item: { product: ProdutoEstoque; quantidade: number }, stock: Estoque | null) {
    const currentBalance = stock ? getProductBalance(item.product, stock.id) : 0;

    return Number((item.quantidade - currentBalance).toFixed(3));
  }

  function getAdjustmentDeltaCents(item: { product: ProdutoEstoque; quantidade: number }, stock: Estoque | null) {
    return Math.round((item.product.preco_custo_centavos ?? 0) * getAdjustmentDeltaQuantity(item, stock));
  }

  function getAdjustmentTotalCents(items: Array<{ product: ProdutoEstoque; quantidade: number }>, stock: Estoque | null) {
    return items.reduce((total, item) => total + getAdjustmentDeltaCents(item, stock), 0);
  }

  function getAdjustmentDeltaTone(value: number) {
    if (value > 0) {
      return "positive";
    }

    if (value < 0) {
      return "negative";
    }

    return "neutral";
  }

  function formatSignedQuantity(value: number) {
    const signal = value > 0 ? "+" : value < 0 ? "-" : "";

    return `${signal}${formatQuantity(Math.abs(value))} un.`;
  }

  function formatSignedCurrencyFromCents(value: number) {
    const signal = value > 0 ? "+" : value < 0 ? "-" : "";

    return `${signal}${formatCurrencyFromCents(Math.abs(value))}`;
  }

  function hasValidOperationItems(kind: OperationKind) {
    const items =
      kind === "purchase"
        ? resolvedPurchaseItems
        : kind === "adjustment"
          ? resolvedAdjustmentItems
          : resolvedTransferItems;
    const stock = getOperationStock(kind);

    if (items.length === 0) {
      return false;
    }

    if (kind === "adjustment") {
      return items.every(item => item.quantidade >= 0);
    }

    if (kind === "transfer" && stock) {
      return items.every(item => item.quantidade > 0 && item.quantidade <= getProductBalance(item.product, stock.id));
    }

    return items.every(item => item.quantidade > 0);
  }

  function groupResolvedOperationItems(items: Array<{ product: ProdutoEstoque; quantidade: number }>) {
    const fallbackCategory: CategoriaProduto = {
      id: 0,
      nome: "Sem categoria",
      icone: "package",
      cor: "laranja",
      ordem: 9999
    };
    const groupByCategory = new Map<number, { category: CategoriaProduto; items: Array<{ product: ProdutoEstoque; quantidade: number }> }>();

    items.forEach(item => {
      const category = item.product.categoria ?? fallbackCategory;
      const current = groupByCategory.get(category.id) ?? { category, items: [] };

      current.items.push(item);
      groupByCategory.set(category.id, current);
    });

    return Array.from(groupByCategory.values())
      .sort((left, right) => left.category.ordem - right.category.ordem || left.category.nome.localeCompare(right.category.nome, "pt-BR"))
      .map(group => ({
        ...group,
        items: group.items.sort((left, right) => left.product.nome.localeCompare(right.product.nome, "pt-BR"))
      }));
  }

  function movementIcon(type: MovimentoTipo) {
    if (type === "compra") {
      return <ShoppingCart size={16} />;
    }

    if (type === "acerto") {
      return <SlidersHorizontal size={16} />;
    }

    return <ArrowLeftRight size={16} />;
  }

  function getMovementDescription(movement: MovimentacaoEstoque) {
    if (movement.tipo === "transferencia") {
      return `${movement.estoque_origem_nome ?? "Origem"} -> ${movement.estoque_destino_nome ?? "Destino"}`;
    }

    if (movement.tipo === "compra") {
      return `Compra em ${movement.estoque_destino_nome ?? "estoque"}`;
    }

    const before = movement.saldo_destino_antes === null ? null : formatQuantity(movement.saldo_destino_antes);
    const after = movement.saldo_destino_depois === null ? null : formatQuantity(movement.saldo_destino_depois);

    return before && after
      ? `${movement.estoque_destino_nome ?? "Estoque"} - ${before} -> ${after} un.`
      : `Acerto em ${movement.estoque_destino_nome ?? "estoque"}`;
  }

  function movementDetailsTitle(movement: Pick<MovimentacaoEstoque, "tipo"> | Pick<StockMovementLaunch, "tipo">) {
    if (movement.tipo === "compra") {
      return "Detalhes da compra";
    }

    if (movement.tipo === "acerto") {
      return "Detalhes do acerto";
    }

    return "Detalhes da transferência";
  }

  function getMovementStockLabel(movement: MovimentacaoEstoque | StockMovementLaunch) {
    if (movement.tipo === "transferencia") {
      return `${movement.estoque_origem_nome ?? "Origem"} para ${movement.estoque_destino_nome ?? "Destino"}`;
    }

    return movement.estoque_destino_nome ?? "Estoque";
  }

  function getMovementBalanceLabel(movement: MovimentacaoEstoque) {
    if (movement.tipo === "transferencia") {
      if (movement.saldo_origem_depois === null || movement.saldo_destino_depois === null) {
        return null;
      }

      return `${formatQuantity(movement.saldo_origem_depois)} un. na origem, ${formatQuantity(movement.saldo_destino_depois)} un. no destino`;
    }

    if (movement.saldo_destino_depois === null) {
      return null;
    }

    return `${formatQuantity(movement.saldo_destino_depois)} un. no estoque`;
  }

  function getLaunchTitle(launch: StockMovementLaunch) {
    if (launch.tipo === "compra") {
      return `Compra em ${launch.estoque_destino_nome ?? "estoque"}`;
    }

    if (launch.tipo === "acerto") {
      return `Acerto em ${launch.estoque_destino_nome ?? "estoque"}`;
    }

    return `Transferência entre estoques`;
  }

  function getLaunchHistoryTitle(launch: StockMovementLaunch) {
    if (launch.tipo === "compra" || launch.tipo === "acerto") {
      return launch.estoque_destino_nome ?? "Estoque";
    }

    return getMovementStockLabel(launch);
  }

  function getMovementProduct(movement: MovimentacaoEstoque) {
    return movement.produto_id
      ? products.find(product => product.id === movement.produto_id) ?? null
      : null;
  }

  function getLaunchPurchaseTotalCents(launch: StockMovementLaunch) {
    if (launch.tipo !== "compra") {
      return 0;
    }

    return launch.movements.reduce((total, movement) => {
      const product = getMovementProduct(movement);
      const quantity = Number(movement.quantidade ?? 0);

      return total + Math.round((product?.preco_custo_centavos ?? 0) * quantity);
    }, 0);
  }

  function getMovementAdjustmentDeltaQuantity(movement: MovimentacaoEstoque) {
    if (movement.tipo !== "acerto" || movement.saldo_destino_antes === null || movement.saldo_destino_depois === null) {
      return 0;
    }

    return Number((movement.saldo_destino_depois - movement.saldo_destino_antes).toFixed(3));
  }

  function getMovementAdjustmentDeltaCents(movement: MovimentacaoEstoque) {
    const product = getMovementProduct(movement);

    return Math.round((product?.preco_custo_centavos ?? 0) * getMovementAdjustmentDeltaQuantity(movement));
  }

  function getLaunchAdjustmentDeltaQuantity(launch: StockMovementLaunch) {
    if (launch.tipo !== "acerto") {
      return 0;
    }

    return Number(launch.movements.reduce((total, movement) => total + getMovementAdjustmentDeltaQuantity(movement), 0).toFixed(3));
  }

  function getLaunchAdjustmentDeltaCents(launch: StockMovementLaunch) {
    if (launch.tipo !== "acerto") {
      return 0;
    }

    return launch.movements.reduce((total, movement) => total + getMovementAdjustmentDeltaCents(movement), 0);
  }

  function getAdjustmentKindLabel(value: number) {
    if (value > 0) {
      return "Sobra";
    }

    if (value < 0) {
      return "Furo";
    }

    return "Sem diferença";
  }

  function getLaunchValueSummary(launch: StockMovementLaunch) {
    if (launch.tipo === "compra") {
      return `Compra: ${formatCurrencyFromCents(getLaunchPurchaseTotalCents(launch))}`;
    }

    if (launch.tipo === "acerto") {
      const adjustmentDeltaQuantity = getLaunchAdjustmentDeltaQuantity(launch);
      const adjustmentDeltaCents = getLaunchAdjustmentDeltaCents(launch);

      return `${getAdjustmentKindLabel(adjustmentDeltaQuantity)}: ${formatSignedCurrencyFromCents(adjustmentDeltaCents)}`;
    }

    return `Transferidos: ${formatQuantity(launch.totalQuantity)} un.`;
  }

  function getLaunchContextLabel(launch: StockMovementLaunch) {
    if (launch.tipo === "transferencia") {
      return getMovementStockLabel(launch);
    }

    return launch.estoque_destino_nome ?? "Estoque";
  }

  function renderChoiceAction({
    title,
    detail,
    icon: Icon,
    disabled,
    onClick
  }: {
    title: string;
    detail: string;
    icon: LucideIcon;
    disabled?: boolean;
    onClick: () => void;
  }) {
    return (
      <button
        className={disabled ? "platform-flow-action product-flow-action-disabled" : "platform-flow-action"}
        disabled={disabled}
        key={title}
        type="button"
        onClick={onClick}
      >
        <span className="platform-flow-action-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        <span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </span>
        <ArrowRight aria-hidden="true" size={18} />
      </button>
    );
  }

  function renderChoiceStep() {
    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head">
          <h1 id="stock-title">Escolha uma opção</h1>
          <p>Organize estoques, entradas, acertos e transferências.</p>
        </header>

        <div className="platform-flow-action-list stock-action-list">
          {renderChoiceAction({
            title: "Estoques",
            detail: `${stocks.length} estoque${stocks.length === 1 ? "" : "s"} cadastrado${stocks.length === 1 ? "" : "s"}.`,
            icon: Warehouse,
            onClick: () => openFlow("stock")
          })}
          {renderChoiceAction({
            title: "Compras",
            detail: "Entradas de produtos em estoque.",
            icon: ShoppingCart,
            disabled: !canUseStockProducts,
            onClick: () => {
              setPurchaseStage("history");
              openFlow("purchase");
            }
          })}
          {renderChoiceAction({
            title: "Acertos",
            detail: "Correção de furos ou sobras.",
            icon: SlidersHorizontal,
            disabled: !canUseStockProducts,
            onClick: () => {
              setAdjustmentStage("history");
              openFlow("adjustment");
            }
          })}
          {renderChoiceAction({
            title: "Transferências",
            detail: "Mover saldo entre estoques.",
            icon: ArrowLeftRight,
            disabled: !canTransfer,
            onClick: () => {
              setTransferStage("history");
              openFlow("transfer");
            }
          })}
        </div>

        {!canUseStockProducts ? (
          <div className="fiscal-groups-notice product-flow-notice">
            <span>Ative o controle de estoque em um produto para movimentar saldos.</span>
          </div>
        ) : null}

        {canUseStockProducts && !canTransfer ? (
          <div className="fiscal-groups-notice product-flow-notice">
            <span>Cadastre um estoque de reposição para liberar transferências.</span>
          </div>
        ) : null}
      </div>
    );
  }

  function renderStockStep() {
    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head product-flow-head-row">
          <span>
            <h2 id="stock-title">Estoques</h2>
            <p>Locais e saldos ficam juntos para leitura rápida.</p>
          </span>
        </header>

        <div className="product-catalog-toolbar">
          <label className="product-search-field">
            <Search aria-hidden="true" size={18} />
            <input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              placeholder="Buscar por produto, código de barras ou categoria"
            />
          </label>

          <div className="product-category-filter stock-filter-list" aria-label="Filtro por estoque">
            <button
              type="button"
              className={
                selectedStockId === "all"
                  ? "product-category-filter-chip product-category-filter-chip-active"
                  : "product-category-filter-chip"
              }
              onClick={() => setSelectedStockId("all")}
            >
              Todos
            </button>
            {stocks.map(stock => {
              const isSelected = selectedStockId === stock.id;

              return (
                <span className="stock-filter-chip-group" key={stock.id}>
                  <button
                    type="button"
                    className={
                      isSelected
                        ? `product-category-filter-chip product-category-filter-chip-active${stock.ativo ? "" : " platform-record-inactive"}`
                        : `product-category-filter-chip${stock.ativo ? "" : " platform-record-inactive"}`
                    }
                    onClick={() => setSelectedStockId(stock.id)}
                  >
                    {stock.nome}{stock.ativo ? "" : " · Desativado"}
                  </button>
                  {isSelected && !stock.bloqueado ? (
                    <button
                      className="stock-filter-edit-button"
                      type="button"
                      aria-label={`Editar ${stock.nome}`}
                      onClick={() => openEditStockModal(stock.id)}
                    >
                      <Pencil size={15} />
                    </button>
                  ) : null}
                </span>
              );
            })}
            <button className="stock-create-chip" type="button" onClick={openNewStockModal}>
              <Plus size={14} />
              Novo estoque
            </button>
          </div>
        </div>

        <div className="product-catalog-list">
          {groupedProducts.length > 0 ? (
            groupedProducts.map(group => (
              <section
                className="product-category-group"
                key={group.category.id}
                style={
                  {
                    "--product-category-accent": (colorById[group.category.cor] ?? colorById.laranja).solid
                  } as CSSProperties
                }
              >
                <header className="product-category-group-head">
                  <span>
                    <ProductCategoryIcon category={group.category} />
                    <strong>{group.category.nome}</strong>
                    <em>{group.products.length} produto{group.products.length === 1 ? "" : "s"}</em>
                  </span>
                </header>

                {group.products.map(product => {
                  const displayedBalance = getDisplayedProductBalance(product);
                  const adjustmentStock = selectedStock?.ativo ? selectedStock : defaultStock;

                  return (
                    <button
                      className="product-catalog-row stock-product-row"
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setSelectedStockId(selectedStockId);
                        startAdjustmentFlow({
                          id: 0,
                          lancamento_id: null,
                          produto_id: product.id,
                          produto_nome: product.nome,
                          estoque_origem_id: null,
                          estoque_origem_nome: null,
                          estoque_destino_id: adjustmentStock?.id ?? null,
                          estoque_destino_nome: adjustmentStock?.nome ?? null,
                          tipo: "acerto",
                          quantidade: getProductBalance(product, adjustmentStock?.id ?? 0),
                          saldo_origem_antes: null,
                          saldo_origem_depois: null,
                          saldo_destino_antes: null,
                          saldo_destino_depois: getProductBalance(product, adjustmentStock?.id ?? 0),
                          created_at: new Date().toISOString()
                        });
                      }}
                    >
                      <ProductVisual
                        category={product.categoria}
                        imageUrl={resolveArquivoUrl(product.imagem)}
                      />

                      <span className="product-row-main">
                        <strong>{product.nome}</strong>
                        <small className="stock-balance-line">
                          {stocks.map((stock, index) => (
                            <span key={stock.id}>
                              {index > 0 ? " - " : ""}
                              {stock.principal_venda ? "Caixa" : stock.nome} {formatQuantity(getProductBalance(product, stock.id))} un.
                            </span>
                          ))}
                        </small>
                      </span>

                      <span className="product-row-price">
                        <strong>{formatQuantity(displayedBalance)} un.</strong>
                        <small>{selectedStockId === "all" ? "Saldo total" : selectedStock?.nome ?? "Estoque selecionado"}</small>
                      </span>

                      <span className="product-row-edit">
                        <SlidersHorizontal size={14} />
                        Acertar
                      </span>
                    </button>
                  );
                })}
              </section>
            ))
          ) : (
            <div className="product-catalog-empty product-catalog-empty-compact">
              <strong>Nenhum saldo encontrado.</strong>
              <p>Revise a busca ou ative controle de estoque em um produto.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderMovementHistory({
    title,
    description,
    launches: historyItems,
    emptyTitle,
    emptyDescription,
    stockFilter
  }: {
    title: string;
    description: string;
    launches: StockMovementLaunch[];
    emptyTitle: string;
    emptyDescription: string;
    stockFilter?: {
      value: StockHistoryFilterValue;
      onChange: (value: StockHistoryFilterValue) => void;
      sourceLaunches: StockMovementLaunch[];
      stockField?: "origem" | "destino";
    };
  }) {
    const stockFilterCounts = new Map<number, number>();

    stockFilter?.sourceLaunches.forEach(launch => {
      const launchStockIds = new Set<number>();
      const shouldUseOrigin = stockFilter.stockField === "origem";
      const shouldUseDestination = stockFilter.stockField !== "origem";

      if (shouldUseDestination && launch.estoque_destino_id !== null) {
        launchStockIds.add(launch.estoque_destino_id);
      }

      if (shouldUseOrigin && launch.estoque_origem_id !== null) {
        launchStockIds.add(launch.estoque_origem_id);
      }

      launchStockIds.forEach(stockId => {
        stockFilterCounts.set(stockId, (stockFilterCounts.get(stockId) ?? 0) + 1);
      });
    });

    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head product-flow-head-row stock-history-head">
          <span>
            <h2 id="stock-title">{title}</h2>
            <p>{description}</p>
          </span>
          <em>{historyItems.length} lançamento{historyItems.length === 1 ? "" : "s"}</em>
        </header>

        {stockFilter ? (
          <div className="product-category-filter stock-history-filter" aria-label="Filtrar por estoque">
            <button
              type="button"
              className={
                stockFilter.value === "all"
                  ? "product-category-filter-chip product-category-filter-chip-active"
                  : "product-category-filter-chip"
              }
              onClick={() => stockFilter.onChange("all")}
            >
              Todos
            </button>
            {stocks.map(stock => {
              const stockPurchaseCount = stockFilterCounts.get(stock.id) ?? 0;

              return (
                <button
                  className={
                    stockFilter.value === stock.id
                      ? `product-category-filter-chip product-category-filter-chip-active${stock.ativo ? "" : " platform-record-inactive"}`
                      : `product-category-filter-chip${stock.ativo ? "" : " platform-record-inactive"}`
                  }
                  key={stock.id}
                  title={`${stockPurchaseCount} lançamento${stockPurchaseCount === 1 ? "" : "s"}`}
                  type="button"
                  onClick={() => stockFilter.onChange(stock.id)}
                >
                  {stock.nome}{stock.ativo ? "" : " · Desativado"}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="stock-history-list">
          {historyItems.length > 0 ? (
            historyItems.map(launch => {
              const movementDate = formatDateTime(launch.created_at);
              const adjustmentDeltaQuantity = getLaunchAdjustmentDeltaQuantity(launch);
              const adjustmentTone = getAdjustmentDeltaTone(adjustmentDeltaQuantity);
              const isAdjustment = launch.tipo === "acerto";
              const summaryValue = getLaunchValueSummary(launch);

              return (
                <button
                  className="stock-history-row stock-history-row-action"
                  key={launch.id}
                  type="button"
                  onClick={() => setMovementDetails(launch)}
                >
                  <span className={`stock-history-type stock-history-type-${launch.tipo}`}>
                    {movementIcon(launch.tipo)}
                  </span>
                  <span className="product-row-main stock-history-main">
                    <strong>{getLaunchHistoryTitle(launch)}</strong>
                    <small>{movementDate}</small>
                  </span>
                  <span className="stock-history-meta">
                    <strong className={isAdjustment ? `stock-adjustment-delta stock-adjustment-delta-${adjustmentTone}` : undefined}>
                      {isAdjustment ? formatSignedQuantity(adjustmentDeltaQuantity) : `${formatQuantity(launch.totalQuantity)} un.`}
                    </strong>
                    <small>
                      <span>{launch.itemCount} {launch.itemCount === 1 ? "item" : "itens"}</span>
                      <span> - </span>
                      <em
                        className={
                          launch.tipo === "compra"
                            ? "stock-history-money"
                            : launch.tipo === "acerto"
                              ? `stock-history-adjustment-value stock-adjustment-delta stock-adjustment-delta-${adjustmentTone}`
                              : "stock-history-transfer-value"
                        }
                      >
                        {summaryValue}
                      </em>
                    </small>
                  </span>
                  <span className="stock-history-detail-cell">
                    <span className="stock-history-details-button">
                      <Eye size={14} />
                      Detalhes
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="product-catalog-empty product-catalog-empty-compact">
              <strong>{emptyTitle}</strong>
              <p>{emptyDescription}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderStockChoiceStage({
    title,
    description,
    onSelect,
    options = activeStocks
  }: {
    title: string;
    description: string;
    onSelect: (id: string) => void;
    options?: Estoque[];
  }) {
    return (
      <div className="stock-operation-stage">
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="stock-transfer-option-list">
          {options.map(stock => (
            <button
              className="stock-transfer-option"
              key={stock.id}
              type="button"
              onClick={() => onSelect(String(stock.id))}
            >
              <span className={stock.principal_venda ? "stock-location-icon stock-location-icon-main" : "stock-location-icon"} aria-hidden="true">
                <Warehouse size={18} />
              </span>
              <span className="product-row-main">
                <strong>{stock.nome}</strong>
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderOperationItemsStage(kind: OperationKind) {
    const stock = getOperationStock(kind);
    const items = getOperationItems(kind);
    const resolvedItems = resolveOperationItems(items);
    const title =
      kind === "purchase"
        ? "Itens da compra"
        : kind === "adjustment"
          ? "Produtos do acerto"
          : "Itens da transferência";
    const helper =
      kind === "purchase"
        ? stock
          ? `${stock.nome} receberá os produtos selecionados.`
          : "Escolha um estoque para iniciar."
        : kind === "adjustment"
          ? stock
            ? `Contagem em ${stock.nome}.`
            : "Escolha um estoque para iniciar."
          : stock
            ? `Saída de ${stock.nome}.`
            : "Escolha a origem para iniciar.";
    const purchaseTotalCents = getPurchaseTotalCents(resolvedItems);
    const adjustmentTotalCents = getAdjustmentTotalCents(resolvedItems, stock);
    const adjustmentTotalTone = getAdjustmentDeltaTone(adjustmentTotalCents);
    const transferTotal = sumOperationItems(resolvedItems);
    const groupedCartItems = groupResolvedOperationItems(resolvedItems);
    const emptyTitle =
      kind === "purchase"
        ? "Compra vazia"
        : kind === "adjustment"
          ? "Acerto vazio"
          : "Transferência vazia";
    const emptyDescription =
      kind === "purchase"
        ? "Busque produtos e selecione os itens desta compra."
        : kind === "adjustment"
          ? "Busque produtos para informar a contagem."
          : "Busque produtos para montar a transferência.";
    const EmptyIcon =
      kind === "purchase"
        ? ShoppingCart
        : kind === "adjustment"
          ? ClipboardCheck
          : ArrowLeftRight;

    return (
      <div className="stock-operation-stage">
        <div className="stock-transfer-panel-head">
          <span>
            <h3>{title}</h3>
            <p>{helper}</p>
          </span>
        </div>

        <button
          className="product-search-field stock-operation-search stock-cart-search-trigger"
          type="button"
          onClick={() => {
            setOperationSearchValue("");
            setOperationPickerCategoryId("all");
            setOperationPickerKind(kind);
          }}
        >
          <Search aria-hidden="true" size={18} />
          <span>Buscar produto para adicionar</span>
        </button>

        <div className={resolvedItems.length > 0 ? "stock-operation-cart" : "stock-operation-cart stock-operation-cart-empty"}>
          {resolvedItems.length > 0 ? (
            groupedCartItems.map(group => (
              <section
                className="stock-cart-category-group"
                key={group.category.id}
                style={
                  {
                    "--product-category-accent": (colorById[group.category.cor] ?? colorById.laranja).solid
                  } as CSSProperties
                }
              >
                <header className="stock-cart-category-head">
                  <ProductCategoryIcon category={group.category} />
                  <strong>{group.category.nome}</strong>
                  <em>{group.items.length} item{group.items.length === 1 ? "" : "s"}</em>
                </header>

                <div className="stock-cart-category-items">
                  {group.items.map(item => {
                    const currentItem = items.find(operationItem => operationItem.produto_id === item.product.id);
                    const stockBalance = stock ? getProductBalance(item.product, stock.id) : 0;
                    const quantity = parseDraftQuantity(currentItem?.quantidade ?? "0");
                    const isTransferAtMaxQuantity = kind === "transfer" && quantity >= stockBalance;
                    const shouldRemoveOnLeftAction = kind === "adjustment" ? quantity <= 0 : quantity <= 1;
                    const motion = operationItemMotions[item.product.id]?.kind;
                    const adjustmentDeltaQuantity = getAdjustmentDeltaQuantity(item, stock);
                    const adjustmentDeltaCents = getAdjustmentDeltaCents(item, stock);
                    const adjustmentDeltaTone = getAdjustmentDeltaTone(adjustmentDeltaQuantity);
                    const rowClassName = [
                      kind === "purchase" ? "stock-cart-item-row stock-cart-item-row-purchase" : "stock-cart-item-row",
                      motion ? `stock-cart-item-row-${motion}` : ""
                    ].filter(Boolean).join(" ");

                    return (
                      <article className={rowClassName} key={item.product.id}>
                        <ProductVisual
                          category={item.product.categoria}
                          imageUrl={resolveArquivoUrl(item.product.imagem)}
                        />
                        <span className="product-row-main">
                          <strong>{item.product.nome}</strong>
                          <small>
                            {kind === "purchase"
                              ? `Custo ${formatCurrencyFromCents(item.product.preco_custo_centavos)}`
                              : kind === "transfer"
                                ? `Saldo na origem: ${formatQuantity(stockBalance)} un.`
                                : `Custo ${formatCurrencyFromCents(item.product.preco_custo_centavos)} - Saldo atual: ${formatQuantity(stockBalance)} un.`}
                          </small>
                        </span>
                        <div className="stock-cart-quantity-stepper" aria-label={`Quantidade de ${item.product.nome}`}>
                          <button
                            className={shouldRemoveOnLeftAction ? "stock-cart-stepper-danger" : undefined}
                            type="button"
                            tabIndex={-1}
                            aria-label={shouldRemoveOnLeftAction ? `Remover ${item.product.nome}` : `Diminuir ${item.product.nome}`}
                            onClick={() =>
                              shouldRemoveOnLeftAction
                                ? removeOperationItem(kind, item.product.id)
                                : stepOperationItemQuantity(kind, item.product.id, -1)
                            }
                          >
                            {shouldRemoveOnLeftAction ? <Trash2 size={14} /> : <span aria-hidden="true">-</span>}
                          </button>
                          <input
                            value={currentItem?.quantidade ?? ""}
                            onChange={event => updateOperationItemQuantity(kind, item.product.id, event.target.value)}
                            inputMode="decimal"
                            aria-label={`Quantidade de ${item.product.nome}`}
                            placeholder="0"
                          />
                          <button
                            type="button"
                            tabIndex={-1}
                            disabled={isTransferAtMaxQuantity}
                            aria-label={`Aumentar ${item.product.nome}`}
                            onClick={() => stepOperationItemQuantity(kind, item.product.id, 1)}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                        {kind === "purchase" ? (
                          <span className="stock-cart-money stock-cart-line-total">
                            <small>Total</small>
                            <strong>{formatCurrencyFromCents(getPurchaseItemTotalCents(item))}</strong>
                          </span>
                        ) : (
                          <span
                            className={
                              kind === "adjustment"
                                ? `product-row-price stock-adjustment-delta stock-adjustment-delta-${adjustmentDeltaTone}`
                                : "product-row-price"
                            }
                          >
                            <strong>
                              {kind === "adjustment" ? formatSignedQuantity(adjustmentDeltaQuantity) : `${formatQuantity(item.quantidade)} un.`}
                            </strong>
                            <small>
                              {kind === "adjustment" ? formatSignedCurrencyFromCents(adjustmentDeltaCents) : kind === "transfer" ? "Transferir" : "Quantidade"}
                            </small>
                          </span>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <div className="stock-cart-empty-state">
              <span aria-hidden="true">
                <EmptyIcon size={24} />
              </span>
              <strong>{emptyTitle}</strong>
              <small>{emptyDescription}</small>
            </div>
          )}
        </div>

        {kind === "purchase" && resolvedItems.length > 0 ? (
          <div className="fiscal-groups-notice stock-purchase-total-notice">
            <span>Total da compra</span>
            <strong>{formatCurrencyFromCents(purchaseTotalCents)}</strong>
          </div>
        ) : null}
        {kind === "adjustment" && resolvedItems.length > 0 ? (
          <div className={`fiscal-groups-notice stock-purchase-total-notice stock-adjustment-total-notice stock-adjustment-total-notice-${adjustmentTotalTone}`}>
            <span>
              {adjustmentTotalCents > 0
                ? "Sobra no acerto"
                : adjustmentTotalCents < 0
                  ? "Furo no acerto"
                  : "Acerto sem diferença"}
            </span>
            <strong>{formatSignedCurrencyFromCents(adjustmentTotalCents)}</strong>
          </div>
        ) : null}
        {kind === "transfer" && resolvedItems.length > 0 ? (
          <div className="fiscal-groups-notice stock-purchase-total-notice stock-transfer-total-notice">
            <span>Total da transferência</span>
            <strong>{formatQuantity(transferTotal)} un.</strong>
          </div>
        ) : null}
      </div>
    );
  }

  function renderOperationSummary(kind: OperationKind) {
    const items =
      kind === "purchase"
        ? resolvedPurchaseItems
        : kind === "adjustment"
          ? resolvedAdjustmentItems
          : resolvedTransferItems;
    const total =
      kind === "purchase"
        ? purchaseTotalQuantity
        : kind === "adjustment"
          ? adjustmentTotalQuantity
          : transferTotalQuantity;
    const originLabel =
      kind === "purchase"
        ? "Compra"
        : kind === "adjustment"
          ? "Contagem"
          : stocks.find(stock => String(stock.id) === transferOriginId)?.nome ?? "Origem";
    const destinationLabel =
      kind === "purchase"
        ? stocks.find(stock => String(stock.id) === purchaseStockId)?.nome ?? "Estoque"
        : kind === "adjustment"
          ? stocks.find(stock => String(stock.id) === adjustmentStockId)?.nome ?? "Estoque"
          : stocks.find(stock => String(stock.id) === transferDestinationId)?.nome ?? "Destino";
    const summaryTitle =
      kind === "purchase"
        ? "Conferência da compra"
        : kind === "adjustment"
          ? "Resumo do acerto"
          : "Conferência da transferência";
    const adjustmentStock = kind === "adjustment" ? getOperationStock("adjustment") : null;
    const transferStock = kind === "transfer" ? getOperationStock("transfer") : null;
    const purchaseTotalCents = kind === "purchase" ? getPurchaseTotalCents(items) : 0;
    const adjustmentTotalCents = kind === "adjustment" ? getAdjustmentTotalCents(items, adjustmentStock) : 0;
    const adjustmentTotalTone = getAdjustmentDeltaTone(adjustmentTotalCents);
    const usesCompactSummary = true;
    const SummaryContextIcon =
      kind === "purchase"
        ? PackageCheck
        : kind === "adjustment"
          ? ClipboardCheck
          : ArrowLeftRight;

    return (
      <div className="stock-operation-stage">
        <div className={usesCompactSummary ? "stock-summary-head stock-summary-head-purchase" : "stock-summary-head"}>
          <span>
            <h3>{summaryTitle}</h3>
            <p>
              {kind === "purchase"
                ? `${items.length} item${items.length === 1 ? "" : "s"} para lançar no estoque.`
                : kind === "adjustment"
                  ? `${items.length} produto${items.length === 1 ? "" : "s"} selecionado${items.length === 1 ? "" : "s"}.`
                  : `${items.length} item${items.length === 1 ? "" : "s"} para mover entre estoques.`}
            </p>
          </span>
          {kind === "purchase" ? (
            <div className="stock-summary-total">
              <span>Total da compra</span>
              <strong>{formatCurrencyFromCents(purchaseTotalCents)}</strong>
            </div>
          ) : kind === "adjustment" ? (
            <div className={`stock-summary-total stock-adjustment-summary-total stock-adjustment-delta-${adjustmentTotalTone}`}>
              <span>
                {adjustmentTotalCents > 0
                  ? "Sobra no acerto"
                  : adjustmentTotalCents < 0
                    ? "Furo no acerto"
                    : "Sem diferença"}
              </span>
              <strong>{formatSignedCurrencyFromCents(adjustmentTotalCents)}</strong>
            </div>
          ) : (
            <div className="stock-summary-total stock-transfer-summary-total">
              <span>Total transferido</span>
              <strong>{formatQuantity(total)} un.</strong>
            </div>
          )}
        </div>

        {usesCompactSummary ? (
          <div className="stock-summary-context">
            <span>
              <SummaryContextIcon size={17} />
              {originLabel}
            </span>
            <ArrowRight size={15} />
            <strong>
              <Warehouse size={17} />
              {destinationLabel}
            </strong>
          </div>
        ) : (
          <div className="stock-transfer-route" aria-hidden="true">
            <span>
              <Warehouse size={18} />
              {originLabel}
            </span>
            <span className="stock-transfer-route-line">
              <Package className="stock-transfer-route-package" size={22} />
            </span>
            <span>
              <Warehouse size={18} />
              {destinationLabel}
            </span>
          </div>
        )}

        <div className={usesCompactSummary ? "stock-summary-list stock-summary-list-purchase" : "stock-summary-list"}>
          {usesCompactSummary ? (
            kind === "adjustment" ? (
              <div className="stock-summary-list-head" aria-hidden="true">
                <span>Produto</span>
                <span>{"Diferen\u00e7a"}</span>
                <span>Impacto</span>
              </div>
            ) : kind === "transfer" ? (
              <div className="stock-summary-list-head" aria-hidden="true">
                <span>Produto</span>
                <span>Origem</span>
                <span>Transferir</span>
              </div>
            ) : (
            <div className="stock-summary-list-head" aria-hidden="true">
              <span>Produto</span>
              <span>Custo unitário</span>
              <span>Total</span>
            </div>
            )
          ) : null}
          {items.map(item => {
            const itemTotalCents = getPurchaseItemTotalCents(item);
            const adjustmentStockBalance = adjustmentStock ? getProductBalance(item.product, adjustmentStock.id) : 0;
            const adjustmentDeltaQuantity = getAdjustmentDeltaQuantity(item, adjustmentStock);
            const adjustmentDeltaCents = getAdjustmentDeltaCents(item, adjustmentStock);
            const adjustmentDeltaTone = getAdjustmentDeltaTone(adjustmentDeltaQuantity);
            const transferStockBalance = transferStock ? getProductBalance(item.product, transferStock.id) : 0;

            return (
              <div className={usesCompactSummary ? "stock-summary-item stock-summary-item-purchase" : "stock-summary-item"} key={item.product.id}>
                <ProductVisual
                  category={item.product.categoria}
                  imageUrl={resolveArquivoUrl(item.product.imagem)}
                />
                <span className="product-row-main">
                  <strong>{item.product.nome}</strong>
                  <small>
                    {kind === "adjustment"
                      ? `Custo ${formatCurrencyFromCents(item.product.preco_custo_centavos)} - Saldo atual: ${formatQuantity(adjustmentStockBalance)} un.`
                      : kind === "transfer"
                        ? `${formatQuantity(item.quantidade)} un. para transferir`
                      : `${formatQuantity(item.quantidade)} un.`}
                  </small>
                </span>
                {kind === "purchase" ? (
                  <>
                    <span className="stock-cart-money">
                      <small>Custo unitário</small>
                      <strong>{formatCurrencyFromCents(item.product.preco_custo_centavos)}</strong>
                    </span>
                    <span className="stock-cart-money stock-cart-line-total">
                      <small>Total</small>
                      <strong>{formatCurrencyFromCents(itemTotalCents)}</strong>
                    </span>
                  </>
                ) : kind === "adjustment" ? (
                  <>
                    <span className={`stock-cart-money stock-adjustment-delta stock-adjustment-delta-${adjustmentDeltaTone}`}>
                      <small>{"Diferen\u00e7a"}</small>
                      <strong>{formatSignedQuantity(adjustmentDeltaQuantity)}</strong>
                    </span>
                    <span className={`stock-cart-money stock-cart-line-total stock-adjustment-delta stock-adjustment-delta-${adjustmentDeltaTone}`}>
                      <small>Impacto</small>
                      <strong>{formatSignedCurrencyFromCents(adjustmentDeltaCents)}</strong>
                    </span>
                  </>
                ) : kind === "transfer" ? (
                  <>
                    <span className="stock-cart-money">
                      <small>Origem</small>
                      <strong>{formatQuantity(transferStockBalance)} un.</strong>
                    </span>
                    <span className="stock-cart-money stock-cart-line-total">
                      <small>Transferir</small>
                      <strong>{formatQuantity(item.quantidade)} un.</strong>
                    </span>
                  </>
                ) : (
                  <span
                    className="product-row-price"
                  >
                    <strong>{formatQuantity(item.quantidade)} un.</strong>
                    <small>Quantidade</small>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderPurchaseStep() {
    if (purchaseStage === "history") {
      return renderMovementHistory({
        title: "Compras",
        description: "Histórico das compras lançadas por estoque.",
        launches: filteredPurchaseLaunches,
        emptyTitle: "Nenhuma compra registrada.",
        emptyDescription: "Use Nova compra para lançar a entrada de produtos.",
        stockFilter: {
          value: purchaseHistoryStockFilter,
          onChange: setPurchaseHistoryStockFilter,
          sourceLaunches: purchaseLaunches
        }
      });
    }

    return (
      <div className={flowPanelClassName}>
        {submitError ? (
          <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
            <span className="auth-feedback-marker" aria-hidden="true" />
            <span className="auth-feedback-copy">{submitError}</span>
          </div>
        ) : null}

        {purchaseStage === "stock"
          ? renderStockChoiceStage({
              title: "Destino da compra",
              description: "Selecione o estoque que receberá os itens.",
              onSelect: id => {
                setPurchaseStockId(id);
                movePurchaseStage("items");
              }
            })
          : null}
        {purchaseStage === "items" ? renderOperationItemsStage("purchase") : null}
        {purchaseStage === "summary" ? renderOperationSummary("purchase") : null}
      </div>
    );
  }

  function renderAdjustmentStep() {
    if (adjustmentStage === "history") {
      return renderMovementHistory({
        title: "Acertos",
        description: "Histórico das correções feitas por contagem.",
        launches: adjustmentLaunches,
        emptyTitle: "Nenhum acerto registrado.",
        emptyDescription: "Use Novo acerto quando a contagem física divergir do sistema."
      });
    }

    return (
      <div className={flowPanelClassName}>
        {submitError ? (
          <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
            <span className="auth-feedback-marker" aria-hidden="true" />
            <span className="auth-feedback-copy">{submitError}</span>
          </div>
        ) : null}

        {adjustmentStage === "stock"
          ? renderStockChoiceStage({
              title: "Estoque do acerto",
              description: "Escolha onde a contagem será aplicada.",
              onSelect: id => {
                setAdjustmentStockId(id);
                moveAdjustmentStage("items");
              }
            })
          : null}
        {adjustmentStage === "items" ? renderOperationItemsStage("adjustment") : null}
        {adjustmentStage === "summary" ? renderOperationSummary("adjustment") : null}
      </div>
    );
  }

  function renderTransferStep() {
    if (transferStage === "history") {
      return renderMovementHistory({
        title: "Transferências",
        description: "Histórico dos saldos movidos entre estoques.",
        launches: filteredTransferLaunches,
        emptyTitle: "Nenhuma transferência registrada.",
        emptyDescription: "Use Nova transferência para mover produtos entre estoques.",
        stockFilter: {
          value: transferHistoryStockFilter,
          onChange: setTransferHistoryStockFilter,
          sourceLaunches: transferLaunches,
          stockField: "origem"
        }
      });
    }

    const availableDestinationStocks = activeStocks.filter(stock => String(stock.id) !== transferOriginId);

    return (
      <div className={flowPanelClassName}>
        {submitError ? (
          <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
            <span className="auth-feedback-marker" aria-hidden="true" />
            <span className="auth-feedback-copy">{submitError}</span>
          </div>
        ) : null}

        {transferStage === "origin"
          ? renderStockChoiceStage({
              title: "Estoque de origem",
              description: "Local de onde os produtos serão retirados.",
              onSelect: id => {
                setTransferOriginId(id);
                setTransferDestinationId(current => current === id ? "" : current);
                setTransferItems([]);
                moveTransferStage("items");
              }
            })
          : null}
        {transferStage === "items" ? renderOperationItemsStage("transfer") : null}
        {transferStage === "destination" ? (
          renderStockChoiceStage({
            title: "Destino da transferência",
            description: "Escolha onde os produtos serão adicionados.",
            options: availableDestinationStocks,
            onSelect: id => {
              setTransferDestinationId(id);
              moveTransferStage("summary");
            }
          })
        ) : null}
        {transferStage === "summary" ? renderOperationSummary("transfer") : null}
      </div>
    );
  }

  function renderOperationProductPicker() {
    if (!operationPickerPresence.isPresent || !visibleOperationPickerKind) {
      return null;
    }

    const pickerKind = visibleOperationPickerKind;
    const stock = getOperationStock(pickerKind);
    const currentOperationProductIds = new Set(getOperationItems(pickerKind).map(item => item.produto_id));
    const visibleProducts = filteredOperationProducts.filter(product => {
      if (operationPickerCategoryId !== "all" && product.categoria?.id !== operationPickerCategoryId) {
        return false;
      }

      if (pickerKind === "transfer" && stock) {
        return getProductBalance(product, stock.id) > 0;
      }

      return true;
    });
    const addableVisibleProducts = visibleProducts.filter(product => !currentOperationProductIds.has(product.id));
    const areAllVisibleProductsSelected = visibleProducts.length > 0 && addableVisibleProducts.length === 0;
    const pickerGroups = groupProductsByCategory(visibleProducts);

    return (
      <div
        className="platform-modal-backdrop stock-product-picker-backdrop"
        data-modal-state={operationPickerPresence.state}
        role="presentation"
        {...stockModalDismiss.backdropProps}
      >
        <section
          aria-labelledby="stock-product-picker-title"
          aria-modal="true"
          className="platform-modal stock-product-picker-modal"
          role="dialog"
        >
          <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={() => setOperationPickerKind(null)}>
            <X aria-hidden="true" size={18} />
          </button>

          <header className="platform-modal-head stock-product-picker-head">
            <h2 id="stock-product-picker-title">Selecionar produtos</h2>
            <p>{stock ? `Operação em ${stock.nome}.` : "Escolha os produtos desta movimentação."}</p>
          </header>

          <label className="product-search-field stock-product-picker-search">
            <Search aria-hidden="true" size={20} />
            <input
              autoFocus
              value={operationSearchValue}
              onChange={event => setOperationSearchValue(event.target.value)}
              placeholder="Buscar por produto, código de barras ou categoria"
            />
          </label>

          <div className="stock-product-picker-filter-row">
            <div className="product-category-filter stock-product-picker-filters" aria-label="Filtro de categoria">
              <button
                type="button"
                className={
                  operationPickerCategoryId === "all"
                    ? "product-category-filter-chip product-category-filter-chip-active"
                    : "product-category-filter-chip"
                }
                onClick={() => setOperationPickerCategoryId("all")}
              >
                Todos
              </button>
              {operationPickerCategories.map(category => (
                <button
                  key={category.id}
                  type="button"
                  className={
                    operationPickerCategoryId === category.id
                      ? "product-category-filter-chip product-category-filter-chip-active"
                      : "product-category-filter-chip"
                  }
                  onClick={() => setOperationPickerCategoryId(category.id)}
                >
                  {category.nome}
                </button>
              ))}
            </div>

            <button
              className={areAllVisibleProductsSelected ? "stock-product-picker-add-all stock-product-picker-add-all-clear" : "stock-product-picker-add-all"}
              type="button"
              disabled={visibleProducts.length === 0}
              onClick={() =>
                areAllVisibleProductsSelected
                  ? removeProductsFromOperationCart(pickerKind, visibleProducts)
                  : addProductsToOperationCart(pickerKind, addableVisibleProducts)
              }
            >
              {areAllVisibleProductsSelected ? <X size={14} /> : <Plus size={14} />}
              {areAllVisibleProductsSelected ? "Desmarcar todos" : "Adicionar todos"}
            </button>
          </div>

          <div className="stock-product-picker-list">
            {visibleProducts.length > 0 ? (
              pickerGroups.map(group => (
                <section
                  className="stock-product-picker-category"
                  key={group.category.id}
                  style={
                    {
                      "--product-category-accent": (colorById[group.category.cor] ?? colorById.laranja).solid
                    } as CSSProperties
                  }
                >
                  <header className="stock-product-picker-category-head">
                    <ProductCategoryIcon category={group.category} />
                    <strong>{group.category.nome}</strong>
                    <em>{group.products.length} produto{group.products.length === 1 ? "" : "s"}</em>
                  </header>

                  <div className="stock-product-picker-category-items">
                    {group.products.map(product => {
                      const isAlreadyInCart = currentOperationProductIds.has(product.id);
                      const productStockBalance = stock ? getProductBalance(product, stock.id) : 0;

                      return (
                        <button
                          aria-pressed={isAlreadyInCart}
                          className={isAlreadyInCart ? "stock-product-picker-row stock-product-picker-row-selected" : "stock-product-picker-row"}
                          key={product.id}
                          type="button"
                          onClick={() => toggleOperationProductSelection(pickerKind, product)}
                        >
                          <ProductVisual
                            category={product.categoria}
                            imageUrl={resolveArquivoUrl(product.imagem)}
                          />
                          <span className="product-row-main">
                            <strong>{product.nome}</strong>
                            <small>{product.codigo_barras ? `Código ${product.codigo_barras}` : "Sem código de barras"}</small>
                          </span>
                          <span className="stock-cart-money stock-product-picker-cost">
                            {pickerKind === "adjustment" || pickerKind === "transfer" ? (
                              <>
                                <small>{pickerKind === "transfer" ? "Disponível" : "Saldo atual"}</small>
                                <strong>{formatQuantity(productStockBalance)} un.</strong>
                              </>
                            ) : (
                              <>
                                <small>Custo</small>
                                <strong>{formatCurrencyFromCents(product.preco_custo_centavos)}</strong>
                              </>
                            )}
                          </span>
                          <span className="stock-product-picker-row-action" aria-hidden="true">
                            {isAlreadyInCart ? <Check size={17} /> : <Plus size={17} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <div className="product-catalog-empty product-catalog-empty-compact">
                <strong>Nenhum produto encontrado.</strong>
                <p>Revise a busca ou cadastre o produto antes de movimentar estoque.</p>
              </div>
            )}
          </div>

          <footer className="stock-product-picker-footer">
            <span>{currentOperationProductIds.size} produto{currentOperationProductIds.size === 1 ? "" : "s"} selecionado{currentOperationProductIds.size === 1 ? "" : "s"}</span>
            <button
              className="platform-primary-button stock-product-picker-finish"
              type="button"
              disabled={currentOperationProductIds.size === 0}
              onClick={() => {
                setOperationPickerKind(null);
                setOperationSearchValue("");
                setOperationPickerCategoryId("all");
              }}
            >
              <ArrowRight size={16} />
              Concluir seleção
            </button>
          </footer>
        </section>
      </div>
    );
  }

  function renderActiveStep() {
    if (flowStep === "choice") {
      return renderChoiceStep();
    }

    if (flowStep === "stock") {
      return renderStockStep();
    }

    if (flowStep === "purchase") {
      return renderPurchaseStep();
    }

    if (flowStep === "adjustment") {
      return renderAdjustmentStep();
    }

    return renderTransferStep();
  }

  function handleFlowBack() {
    if (flowStep === "purchase") {
      if (purchaseStage === "summary") {
        movePurchaseStage("items");
        return;
      }

      if (purchaseStage === "items") {
        movePurchaseStage("stock");
        return;
      }

      if (purchaseStage === "stock") {
        movePurchaseStage("history");
        return;
      }
    }

    if (flowStep === "adjustment") {
      if (adjustmentStage === "summary") {
        moveAdjustmentStage("items");
        return;
      }

      if (adjustmentStage === "items") {
        moveAdjustmentStage("stock");
        return;
      }

      if (adjustmentStage === "stock") {
        moveAdjustmentStage("history");
        return;
      }
    }

    if (flowStep === "transfer") {
      if (transferStage === "summary") {
        moveTransferStage("destination");
        return;
      }

      if (transferStage === "destination") {
        moveTransferStage("items");
        return;
      }

      if (transferStage === "items") {
        moveTransferStage("origin");
        return;
      }

      if (transferStage === "origin") {
        moveTransferStage("history");
        return;
      }
    }

    moveToFlowStep("choice");
  }

  function renderPrimaryFlowAction() {
    if (flowStep === "purchase") {
      if (purchaseStage === "history") {
        return (
          <button className="platform-primary-button" type="button" onClick={() => startPurchaseFlow()}>
            <ShoppingCart size={16} />
            Nova compra
          </button>
        );
      }

      if (purchaseStage === "stock") {
        return null;
      }

      if (purchaseStage === "items") {
        return (
          <button className="platform-primary-button" type="button" disabled={!hasValidOperationItems("purchase")} onClick={() => movePurchaseStage("summary")}>
            <ArrowRight size={16} />
            Revisar
          </button>
        );
      }

      return (
        <button className="platform-primary-button platform-save-button" type="button" disabled={isSubmitting} onClick={() => void handlePurchaseSubmit()}>
          {isSubmitting ? <LoaderCircle className="platform-spin" size={16} /> : <ShoppingCart size={16} />}
          Confirmar lançamento
        </button>
      );
    }

    if (flowStep === "adjustment") {
      if (adjustmentStage === "history") {
        return (
          <button className="platform-primary-button" type="button" onClick={() => startAdjustmentFlow()}>
            <ClipboardCheck size={16} />
            Novo acerto
          </button>
        );
      }

      if (adjustmentStage === "stock") {
        return null;
      }

      if (adjustmentStage === "items") {
        return (
          <button className="platform-primary-button" type="button" disabled={!hasValidOperationItems("adjustment")} onClick={() => moveAdjustmentStage("summary")}>
            <ArrowRight size={16} />
            Revisar
          </button>
        );
      }

      return (
        <button className="platform-primary-button platform-save-button" type="button" disabled={isSubmitting} onClick={() => void handleAdjustmentSubmit()}>
          {isSubmitting ? <LoaderCircle className="platform-spin" size={16} /> : <ClipboardCheck size={16} />}
          Confirmar acerto
        </button>
      );
    }

    if (flowStep === "transfer") {
      if (transferStage === "history") {
        return (
          <button className="platform-primary-button" type="button" onClick={() => startTransferFlow()}>
            <ArrowLeftRight size={16} />
            Nova transferência
          </button>
        );
      }

      if (transferStage === "origin" || transferStage === "destination") {
        return null;
      }

      if (transferStage === "items") {
        return (
          <button className="platform-primary-button" type="button" disabled={!hasValidOperationItems("transfer")} onClick={() => moveTransferStage("destination")}>
            <ArrowRight size={16} />
            Escolher destino
          </button>
        );
      }

      return (
        <button className="platform-primary-button platform-save-button" type="button" disabled={isSubmitting} onClick={() => void handleTransferSubmit()}>
          {isSubmitting ? <LoaderCircle className="platform-spin" size={16} /> : <ArrowLeftRight size={16} />}
          Confirmar transferência
        </button>
      );
    }

    return null;
  }

  function progressConfig() {
    if (flowStep === "purchase" && purchaseStage !== "history") {
      return {
        total: 3,
        active: purchaseStage === "stock" ? 0 : purchaseStage === "items" ? 1 : 2
      };
    }

    if (flowStep === "adjustment" && adjustmentStage !== "history") {
      return {
        total: 3,
        active: adjustmentStage === "stock" ? 0 : adjustmentStage === "items" ? 1 : 2
      };
    }

    if (flowStep === "transfer" && transferStage !== "history") {
      return {
        total: 4,
        active: transferStage === "origin" ? 0 : transferStage === "items" ? 1 : transferStage === "destination" ? 2 : 3
      };
    }

    return {
      total: 3,
      active: flowStep === "choice" ? 1 : 2
    };
  }

  const progress = progressConfig();
  const sectionTitle =
    flowStep === "purchase"
      ? purchaseStage === "history"
        ? "Compras"
        : "Nova compra"
      : flowStep === "adjustment"
        ? adjustmentStage === "history"
          ? "Acertos"
          : "Novo acerto"
        : flowStep === "transfer"
          ? transferStage === "history"
            ? "Transferências"
            : "Nova transferência"
          : "Estoque";
  const SectionTitleIcon =
    flowStep === "purchase"
      ? ShoppingCart
      : flowStep === "adjustment"
        ? ClipboardCheck
        : flowStep === "transfer"
          ? ArrowLeftRight
          : Warehouse;

  return (
    <main className="platform-flow-page product-flow-page stock-flow-page">
      <div className={stockFlowShellClassName}>
        <div className="platform-flow-section-title" aria-label={sectionTitle}>
          <span className="platform-flow-section-main">
            <SectionTitleIcon size={24} aria-hidden="true" />
            <strong id="stock-flow-heading">{sectionTitle}</strong>
          </span>
        </div>

        <section className={stockCardClassName} aria-labelledby="stock-flow-heading">
          {isLoading ? (
            <div className="product-catalog-skeleton" aria-live="polite">
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : loadError ? (
            <div className="product-catalog-empty" role="alert">
              <strong>Não foi possível abrir estoque.</strong>
              <p>{loadError}</p>
              <button className="platform-primary-button" type="button" onClick={() => void loadStock()}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {renderActiveStep()}

              <div className="platform-flow-actions" aria-label="Ações do fluxo">
                {flowStep === "choice" ? (
                  <Link className="platform-secondary-button" href="/meu-sistema">
                    <ArrowLeft size={16} />
                    Voltar
                  </Link>
                ) : (
                  <button type="button" className="platform-secondary-button" onClick={handleFlowBack}>
                    <ArrowLeft size={16} />
                    Voltar
                  </button>
                )}

                {renderPrimaryFlowAction()}
              </div>

              <div className="platform-flow-progress" aria-label="Fluxo de estoque">
                {Array.from({ length: progress.total }, (_, index) => (
                  <span
                    className={
                      index === progress.active
                        ? "platform-flow-progress-bar platform-flow-progress-bar-active"
                        : index < progress.active
                          ? "platform-flow-progress-bar platform-flow-progress-bar-done"
                          : "platform-flow-progress-bar"
                    }
                    key={index}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {renderOperationProductPicker()}

      {stockModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={stockModalPresence.state}
          role="presentation"
          {...stockModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="stock-modal-title"
            aria-modal="true"
            className="platform-modal stock-edit-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeStockModal}>
              <X aria-hidden="true" size={18} />
            </button>

            <header className="platform-modal-head">
              <h2 id="stock-modal-title">{editingStockId ? "Renomear estoque" : "Novo estoque de reposição"}</h2>
              <p>Estoques extras não vendem direto no caixa. Use transferência para abastecer o principal.</p>
            </header>

            {submitError ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{submitError}</span>
              </div>
            ) : null}

            <form className="product-modal-form stock-modal-form" id="stock-form" onSubmit={handleStockSubmit}>
              <label>
                <span>Nome</span>
                <input
                  value={stockDraft.nome}
                  onChange={event =>
                    setStockDraft(current => ({
                      ...current,
                      nome: capitalizeFirstTextLetter(event.target.value)
                    }))
                  }
                  placeholder="Ex.: Reposição"
                />
              </label>

              <div className="fiscal-groups-notice stock-modal-notice">
                <span>Somente o estoque principal aparece no caixa. Este novo estoque será usado apenas para reposição e transferências.</span>
              </div>
            </form>

            <div
              className={
                editingStockId && editingStock?.ativo !== false
                  ? "platform-modal-actions product-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete"
                  : "platform-modal-actions product-modal-actions platform-item-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeStockModal}>
                Cancelar
              </button>
              {editingStockId && editingStock?.ativo === false ? (
                <button
                  className="platform-primary-button platform-save-button"
                  type="button"
                  onClick={() => void executeActivateStock()}
                  disabled={isSubmitting}
                >
                  <RotateCcw size={16} />
                  Ativar
                </button>
              ) : editingStockId ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  title={
                    editingStock?.acao_remocao === "desativar"
                      ? "Desativar estoque"
                      : "Excluir estoque"
                  }
                  type="button"
                  onClick={() => editingStock && setPendingDeleteStock(editingStock)}
                >
                  {editingStock?.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                  {editingStock?.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              ) : null}
              {editingStockId && editingStock?.ativo === false ? null : (
                <button className="platform-primary-button platform-save-button" type="submit" form="stock-form" disabled={!canSaveStockDraft(stockDraft) || isSubmitting}>
                  {isSubmitting ? <LoaderCircle className="platform-spin" size={16} /> : <Warehouse size={16} />}
                  {editingStockId ? "Salvar estoque" : "Criar estoque"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {movementDetailsPresence.isPresent && movementDetailsForModal ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={movementDetailsPresence.state}
          role="presentation"
          {...stockModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="stock-movement-details-title"
            aria-modal="true"
            className="platform-modal stock-movement-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={() => setMovementDetails(null)}>
              <X aria-hidden="true" size={18} />
            </button>

            <header className="platform-modal-head stock-movement-modal-head">
              <h2 id="stock-movement-details-title">{movementDetailsTitle(movementDetailsForModal)}</h2>
              <p>{formatDateTime(movementDetailsForModal.created_at)}</p>
            </header>

            <div className="stock-movement-summary">
              <span className={`stock-history-type stock-history-type-${movementDetailsForModal.tipo}`}>
                {movementIcon(movementDetailsForModal.tipo)}
              </span>
              <span className="stock-movement-summary-main">
                <small>{getLaunchContextLabel(movementDetailsForModal)}</small>
                <strong>{getLaunchTitle(movementDetailsForModal)}</strong>
                <em
                  className={
                    movementDetailsForModal.tipo === "compra"
                      ? "stock-movement-summary-value"
                      : movementDetailsForModal.tipo === "acerto"
                        ? `stock-movement-adjustment-summary-value stock-adjustment-delta stock-adjustment-delta-${getAdjustmentDeltaTone(getLaunchAdjustmentDeltaQuantity(movementDetailsForModal))}`
                        : "stock-movement-transfer-summary-value"
                  }
                >
                  {getLaunchValueSummary(movementDetailsForModal)}
                </em>
              </span>
              <span className="stock-movement-summary-quantity">
                <small>{movementDetailsForModal.tipo === "acerto" ? "Diferença" : "Total"}</small>
                <strong
                  className={
                    movementDetailsForModal.tipo === "acerto"
                      ? `stock-adjustment-delta stock-adjustment-delta-${getAdjustmentDeltaTone(getLaunchAdjustmentDeltaQuantity(movementDetailsForModal))}`
                      : undefined
                  }
                >
                  {movementDetailsForModal.tipo === "acerto"
                    ? formatSignedQuantity(getLaunchAdjustmentDeltaQuantity(movementDetailsForModal))
                    : `${formatQuantity(movementDetailsForModal.totalQuantity)} un.`}
                </strong>
              </span>
            </div>

            <div
              className={
                movementDetailsForModal.tipo === "acerto"
                  ? "stock-movement-item-list stock-movement-adjustment-item-list"
                  : movementDetailsForModal.tipo === "transferencia"
                    ? "stock-movement-item-list stock-movement-transfer-item-list"
                    : "stock-movement-item-list"
              }
            >
              <header>
                <span>{movementDetailsForModal.tipo === "acerto" ? "Itens ajustados" : movementDetailsForModal.tipo === "transferencia" ? "Itens transferidos" : "Itens do lançamento"}</span>
                <em>{movementDetailsForModal.itemCount} {movementDetailsForModal.itemCount === 1 ? "item" : "itens"}</em>
              </header>
              {movementDetailsForModal.tipo === "acerto" ? (
                <div className="stock-movement-adjustment-list-head" aria-hidden="true">
                  <span>Produto</span>
                  <span>Saldo no estoque</span>
                  <span>Diferença</span>
                </div>
              ) : null}
              {movementDetailsForModal.tipo === "transferencia" ? (
                <div className="stock-movement-transfer-list-head" aria-hidden="true">
                  <span>Produto</span>
                  <span>Origem</span>
                  <span>Destino</span>
                  <span>Transferido</span>
                </div>
              ) : null}
              {movementDetailsForModal.movements.map(movement => {
                const product = getMovementProduct(movement);
                const adjustmentDeltaQuantity = getMovementAdjustmentDeltaQuantity(movement);
                const adjustmentDeltaCents = getMovementAdjustmentDeltaCents(movement);
                const adjustmentTone = getAdjustmentDeltaTone(adjustmentDeltaQuantity);
                const purchaseItemTotalCents = Math.round((product?.preco_custo_centavos ?? 0) * Number(movement.quantidade ?? 0));

                return (
                  <div
                    className={
                      movement.tipo === "acerto"
                        ? "stock-movement-item-row stock-movement-adjustment-item-row"
                        : movement.tipo === "transferencia"
                          ? "stock-movement-item-row stock-movement-transfer-item-row"
                          : "stock-movement-item-row"
                    }
                    key={movement.id}
                  >
                    <ProductVisual
                      category={product?.categoria ?? null}
                      imageUrl={resolveArquivoUrl(product?.imagem ?? null)}
                    />
                    <span className="product-row-main">
                      <strong>{movement.produto_nome}</strong>
                      <small>
                        {movement.tipo === "acerto"
                          ? movement.estoque_destino_nome ?? "Estoque"
                          : movement.tipo === "transferencia"
                            ? getMovementStockLabel(movement)
                            : "Quantidade movimentada"}
                      </small>
                    </span>
                    {movement.tipo === "acerto" ? (
                      <>
                        <span className="stock-movement-balance-cell stock-movement-balance-cell-combined">
                          <strong>{movement.saldo_destino_depois === null ? "-" : `${formatQuantity(movement.saldo_destino_depois)} un.`}</strong>
                          <em>{movement.saldo_destino_antes === null ? "Antes: -" : `Antes: ${formatQuantity(movement.saldo_destino_antes)} un.`}</em>
                        </span>
                        <span className={`stock-movement-adjustment-cell stock-adjustment-delta stock-adjustment-delta-${adjustmentTone}`}>
                          <strong>{formatSignedQuantity(adjustmentDeltaQuantity)}</strong>
                          <em>{formatSignedCurrencyFromCents(adjustmentDeltaCents)}</em>
                        </span>
                      </>
                    ) : movement.tipo === "transferencia" ? (
                      <>
                        <span className="stock-movement-balance-cell stock-movement-balance-cell-combined">
                          <strong>{movement.saldo_origem_depois === null ? "-" : `${formatQuantity(movement.saldo_origem_depois)} un.`}</strong>
                          <em>{movement.saldo_origem_antes === null ? "Antes: -" : `Antes: ${formatQuantity(movement.saldo_origem_antes)} un.`}</em>
                        </span>
                        <span className="stock-movement-balance-cell stock-movement-balance-cell-combined">
                          <strong>{movement.saldo_destino_depois === null ? "-" : `${formatQuantity(movement.saldo_destino_depois)} un.`}</strong>
                          <em>{movement.saldo_destino_antes === null ? "Antes: -" : `Antes: ${formatQuantity(movement.saldo_destino_antes)} un.`}</em>
                        </span>
                        <span className="stock-movement-transfer-cell">
                          <strong>{formatQuantity(movement.quantidade)} un.</strong>
                        </span>
                      </>
                    ) : (
                      <span className="stock-movement-item-quantity">
                        <strong>{formatQuantity(movement.quantidade)} un.</strong>
                        {movement.tipo === "compra" ? (
                          <em className="stock-movement-item-money-positive">{formatCurrencyFromCents(purchaseItemTotalCents)}</em>
                        ) : null}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="platform-modal-actions product-modal-actions platform-item-modal-actions stock-movement-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setMovementDetails(null)}>
                Fechar
              </button>
              <button className="fiscal-danger-button fiscal-edit-delete-button" type="button" onClick={() => setPendingRevertMovement(movementDetailsForModal)}>
                <RotateCcw size={16} />
                Reverter
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingDeleteStockPresence.isPresent && visiblePendingDeleteStock ? (
        <div
          className="platform-modal-backdrop fiscal-confirm-backdrop"
          data-modal-state={pendingDeleteStockPresence.state}
          role="presentation"
          {...stockModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="stock-delete-confirm-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact fiscal-delete-confirm-modal"
            role="dialog"
          >
            <div className="platform-modal-head">
              <h2 id="stock-delete-confirm-title">
                {visiblePendingDeleteStock.acao_remocao === "desativar" ? "Desativar estoque?" : "Excluir estoque?"}
              </h2>
              <p>
                {visiblePendingDeleteStock.acao_remocao === "desativar"
                  ? `"${visiblePendingDeleteStock.nome}" ficará fora de novas operações, mas saldos e movimentações antigas continuam preservados.`
                  : `Confirme para excluir "${visiblePendingDeleteStock.nome}". Essa ação não poderá ser desfeita.`}
              </p>
            </div>

            <div className="platform-modal-actions fiscal-delete-confirm-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setPendingDeleteStock(null)}>
                Cancelar
              </button>
              <button className="fiscal-danger-button fiscal-edit-delete-button" type="button" onClick={executeDeleteStock}>
                {visiblePendingDeleteStock.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                {visiblePendingDeleteStock.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingRevertMovementPresence.isPresent && visiblePendingRevertMovement ? (
        <div
          className="platform-modal-backdrop fiscal-confirm-backdrop"
          data-modal-state={pendingRevertMovementPresence.state}
          role="presentation"
          {...stockModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="stock-revert-confirm-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact fiscal-delete-confirm-modal"
            role="dialog"
          >
            <div className="platform-modal-head">
              <h2 id="stock-revert-confirm-title">Reverter lançamento?</h2>
              <p>Todos os itens deste lançamento serão desfeitos no estoque.</p>
            </div>

            <div className="platform-modal-actions fiscal-delete-confirm-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setPendingRevertMovement(null)}>
                Cancelar
              </button>
              <button className="fiscal-danger-button fiscal-edit-delete-button" type="button" disabled={isSubmitting} onClick={() => void executeRevertMovement()}>
                {isSubmitting ? <LoaderCircle className="platform-spin" size={16} /> : <RotateCcw size={16} />}
                Reverter
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );

}
