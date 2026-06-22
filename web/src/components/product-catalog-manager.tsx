"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";
import type { CSSProperties, DragEvent } from "react";
import {
  Apple,
  Armchair,
  ArrowLeft,
  ArrowRight,
  Ban,
  Barcode,
  Beef,
  Beer,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Coffee,
  CupSoda,
  Dumbbell,
  FolderPlus,
  Gift,
  GripVertical,
  ImagePlus,
  Package,
  PackagePlus,
  Palette,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  Shirt,
  ShoppingBasket,
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

import { ApiError, apiDelete, apiGet, apiPost, apiPostForm, apiPut, getApiUrl } from "@/lib/api-client";
import { PlatformSelect } from "@/components/platform-select";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { capitalizeFirstTextLetter, uppercaseTextInput } from "@/lib/text-format";
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
  ativo: boolean;
  produtos_count: number;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
};

type GrupoFiscalResumo = {
  id: number;
  nome: string;
  ativo: boolean;
  regime_tributario: "simples_nacional" | "regime_normal";
  cfop: string | null;
  ncm: string | null;
};

type ArquivoResumo = {
  id: number;
  nome_original: string;
  mime_type: string;
  tipo: string;
  tamanho_bytes: number;
  url: string | null;
};

type Produto = {
  id: number;
  nome: string;
  categoria_id: number;
  grupo_fiscal_id: number | null;
  imagem_arquivo_id: number | null;
  codigo_barras: string | null;
  ncm: string | null;
  preco_custo_centavos: number;
  preco_venda_centavos: number;
  controla_estoque: boolean;
  ativo: boolean;
  quantidade_estoque: number | null;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
  categoria: CategoriaProduto | null;
  grupo_fiscal: GrupoFiscalResumo | null;
  imagem: ArquivoResumo | null;
};

type ProductCatalogSnapshot = {
  categorias: CategoriaProduto[];
  produtos: Produto[];
  grupos_fiscais: GrupoFiscalResumo[];
};

type CategoryDraft = {
  nome: string;
  icone: CategoryIconId;
  cor: CategoryColorId;
};

type ProductFlowStep = "choice" | "categories" | "products";
type ProductFlowMotion = "forward" | "backward";

type ProductDraft = {
  nome: string;
  categoria_id: string;
  imagem_arquivo_id: string;
  imagem_url: string | null;
  imagem_nome: string;
  codigo_barras: string;
  ncm: string;
  grupo_fiscal_id: string;
  preco_custo: string;
  preco_venda: string;
  controla_estoque: boolean;
  quantidade_estoque: string;
};

type PendingDelete =
  | { type: "category"; id: number; label: string; action: "excluir" | "desativar" }
  | { type: "product"; id: number; label: string; action: "excluir" | "desativar" };

type DeleteCategoryResponse =
  | {
      action: "deleted";
      id: number;
      message?: string;
    }
  | {
      action: "deactivated";
      categoria: CategoriaProduto;
      message?: string;
    };

type ActivateCategoryResponse = {
  action: "activated";
  categoria: CategoriaProduto;
  message?: string;
};

type DeleteProductResponse =
  | {
      action: "deleted";
      id: number;
      message?: string;
    }
  | {
      action: "deactivated";
      produto: Produto;
      message?: string;
    };

type ActivateProductResponse = {
  action: "activated";
  produto: Produto;
  message?: string;
};

const categoryIconOptions = [
  { value: "package", label: "Geral", icon: Package },
  { value: "shopping_basket", label: "Mercado", icon: ShoppingBasket },
  { value: "store", label: "Loja", icon: Store },
  { value: "utensils", label: "Alimentos", icon: Utensils },
  { value: "coffee", label: "Café", icon: Coffee },
  { value: "beer", label: "Bebidas", icon: Beer },
  { value: "apple", label: "Hortifruti", icon: Apple },
  { value: "beef", label: "Carnes", icon: Beef },
  { value: "shirt", label: "Roupas", icon: Shirt },
  { value: "beauty", label: "Beleza", icon: Sparkles },
  { value: "smartphone", label: "Eletrônicos", icon: Smartphone },
  { value: "warehouse", label: "Estoque", icon: Warehouse },
  { value: "wrench", label: "Serviços", icon: Wrench },
  { value: "sports", label: "Esportes", icon: Dumbbell },
  { value: "soda", label: "Refrigerantes", icon: CupSoda },
  { value: "sofa", label: "Casa", icon: Armchair },
  { value: "briefcase", label: "Escritório", icon: BriefcaseBusiness },
  { value: "book", label: "Papelaria", icon: BookOpen },
  { value: "pill", label: "Farmácia", icon: Pill },
  { value: "gift", label: "Presentes", icon: Gift }
] satisfies Array<{ value: CategoryIconId; label: string; icon: LucideIcon }>;

const iconById = categoryIconOptions.reduce<Record<CategoryIconId, LucideIcon>>(
  (accumulator, option) => {
    accumulator[option.value] = option.icon;
    return accumulator;
  },
  {} as Record<CategoryIconId, LucideIcon>
);

const categoryColorOptions = [
  { value: "laranja", label: "Laranja", solid: "oklch(0.68 0.19 45)", soft: "oklch(0.96 0.035 55)", text: "oklch(0.48 0.16 42)" },
  { value: "ambar", label: "Âmbar", solid: "oklch(0.78 0.16 76)", soft: "oklch(0.96 0.04 82)", text: "oklch(0.45 0.12 70)" },
  { value: "limao", label: "Limão", solid: "oklch(0.76 0.17 115)", soft: "oklch(0.96 0.04 115)", text: "oklch(0.42 0.12 115)" },
  { value: "menta", label: "Menta", solid: "oklch(0.68 0.14 166)", soft: "oklch(0.95 0.032 166)", text: "oklch(0.36 0.1 166)" },
  { value: "azul", label: "Azul", solid: "oklch(0.58 0.14 240)", soft: "oklch(0.95 0.025 240)", text: "oklch(0.42 0.12 245)" },
  { value: "ciano", label: "Ciano", solid: "oklch(0.67 0.13 205)", soft: "oklch(0.95 0.028 205)", text: "oklch(0.38 0.1 205)" },
  { value: "indigo", label: "Índigo", solid: "oklch(0.5 0.16 266)", soft: "oklch(0.95 0.024 266)", text: "oklch(0.36 0.12 266)" },
  { value: "verde", label: "Verde", solid: "oklch(0.62 0.15 150)", soft: "oklch(0.95 0.03 150)", text: "oklch(0.38 0.11 150)" },
  { value: "vermelho", label: "Vermelho", solid: "oklch(0.58 0.19 28)", soft: "oklch(0.96 0.025 28)", text: "oklch(0.45 0.14 28)" },
  { value: "rosa", label: "Rosa", solid: "oklch(0.64 0.18 350)", soft: "oklch(0.96 0.026 350)", text: "oklch(0.43 0.13 350)" },
  { value: "vinho", label: "Vinho", solid: "oklch(0.45 0.15 18)", soft: "oklch(0.95 0.022 18)", text: "oklch(0.36 0.12 18)" },
  { value: "violeta", label: "Violeta", solid: "oklch(0.56 0.15 300)", soft: "oklch(0.96 0.025 300)", text: "oklch(0.42 0.12 300)" },
  { value: "marrom", label: "Marrom", solid: "oklch(0.48 0.1 58)", soft: "oklch(0.95 0.022 58)", text: "oklch(0.35 0.08 58)" },
  { value: "areia", label: "Areia", solid: "oklch(0.72 0.08 84)", soft: "oklch(0.96 0.025 84)", text: "oklch(0.42 0.08 84)" },
  { value: "cinza", label: "Cinza", solid: "oklch(0.56 0.02 250)", soft: "oklch(0.95 0.006 250)", text: "oklch(0.38 0.02 250)" },
  { value: "grafite", label: "Grafite", solid: "oklch(0.32 0.02 250)", soft: "oklch(0.92 0.006 250)", text: "oklch(0.24 0.02 250)" }
] satisfies Array<{
  value: CategoryColorId;
  label: string;
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

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function digitsOnly(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");

  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function decimalInput(value: string) {
  return value.replace(/[^\d,.]/g, "");
}

function formatMoneyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function parseMoneyInputToCents(value: string) {
  const digits = digitsOnly(value);

  return digits ? Number(digits) : 0;
}

function formatMoneyInput(value: string) {
  return formatMoneyFromCents(parseMoneyInputToCents(value));
}

function formatStock(value: number | null) {
  if (value === null) {
    return "Sem controle";
  }

  return `${String(value).replace(".", ",")} un.`;
}

function getProductFiscalIssueBadges(product: Produto) {
  const badges: string[] = [];

  if (!product.grupo_fiscal_id) {
    badges.push("Sem grupo fiscal");
  }

  if (!product.ncm) {
    badges.push("Informe o NCM");
  }

  return badges;
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

function buildEmptyCategoryDraft(): CategoryDraft {
  return {
    nome: "",
    icone: "package",
    cor: "laranja"
  };
}

function buildCategoryDraft(category: CategoriaProduto): CategoryDraft {
  return {
    nome: capitalizeFirstTextLetter(category.nome),
    icone: category.icone,
    cor: category.cor
  };
}

function buildEmptyProductDraft(defaultCategoryId: number | null): ProductDraft {
  return {
    nome: "",
    categoria_id: defaultCategoryId ? String(defaultCategoryId) : "",
    imagem_arquivo_id: "",
    imagem_url: null,
    imagem_nome: "",
    codigo_barras: "",
    ncm: "",
    grupo_fiscal_id: "",
    preco_custo: "",
    preco_venda: "",
    controla_estoque: false,
    quantidade_estoque: ""
  };
}

function buildProductDraft(product: Produto): ProductDraft {
  const productNcm = digitsOnly(product.ncm ?? "", 8);
  const suggestedNcm = digitsOnly(product.grupo_fiscal?.ncm ?? "", 8);

  return {
    nome: uppercaseTextInput(product.nome),
    categoria_id: String(product.categoria_id),
    imagem_arquivo_id: product.imagem_arquivo_id ? String(product.imagem_arquivo_id) : "",
    imagem_url: resolveArquivoUrl(product.imagem),
    imagem_nome: product.imagem?.nome_original ?? "",
    codigo_barras: product.codigo_barras ?? "",
    ncm: productNcm || suggestedNcm,
    grupo_fiscal_id: product.grupo_fiscal_id ? String(product.grupo_fiscal_id) : "",
    preco_custo: formatMoneyFromCents(product.preco_custo_centavos),
    preco_venda: formatMoneyFromCents(product.preco_venda_centavos),
    controla_estoque: product.controla_estoque,
    quantidade_estoque:
      product.quantidade_estoque === null ? "" : String(product.quantidade_estoque).replace(".", ",")
  };
}

function canSaveCategoryDraft(draft: CategoryDraft) {
  return draft.nome.trim().length >= 2;
}

function canSaveProductDraft(draft: ProductDraft) {
  return (
    draft.nome.trim().length >= 2 &&
    Boolean(draft.categoria_id) &&
    parseMoneyInputToCents(draft.preco_venda) > 0 &&
    parseMoneyInputToCents(draft.preco_custo) <= parseMoneyInputToCents(draft.preco_venda)
  );
}

const productFlowOrder: ProductFlowStep[] = ["choice", "categories", "products"];

function getProductFlowIndex(step: ProductFlowStep) {
  const index = productFlowOrder.indexOf(step);

  return index >= 0 ? index : 0;
}

function reorderCategoriesByDrop(
  categories: CategoriaProduto[],
  draggedCategoryId: number,
  targetCategoryId: number
) {
  const draggedIndex = categories.findIndex(category => category.id === draggedCategoryId);
  const targetIndex = categories.findIndex(category => category.id === targetCategoryId);

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return categories;
  }

  const reorderedCategories = [...categories];
  const [draggedCategory] = reorderedCategories.splice(draggedIndex, 1);
  reorderedCategories.splice(targetIndex, 0, draggedCategory);

  return reorderedCategories.map((category, index) => ({
    ...category,
    ordem: index
  }));
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
  imageUrl,
  size = "default"
}: {
  category: CategoriaProduto | null;
  imageUrl?: string | null;
  size?: "default" | "large";
}) {
  const fallbackCategory =
    category ??
    ({
      id: 0,
      nome: "Produto",
      icone: "package",
      cor: "laranja",
      ordem: 0,
      ativo: true,
      produtos_count: 0,
      registros_vinculados: 0,
      pode_excluir: true,
      acao_remocao: "excluir"
    } satisfies CategoriaProduto);
  const Icon = iconById[fallbackCategory.icone] ?? Package;
  const color = colorById[fallbackCategory.cor] ?? colorById.laranja;

  return (
    <span
      className={size === "large" ? "product-image-preview product-image-preview-large" : "product-image-preview"}
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
      {imageUrl ? <img src={imageUrl} alt="" /> : <Icon size={size === "large" ? 30 : 18} />}
    </span>
  );
}

export function ProductCatalogManager() {
  const [snapshot, setSnapshot] = useState<ProductCatalogSnapshot>({
    categorias: [],
    produtos: [],
    grupos_fiscais: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [flowStep, setFlowStep] = useState<ProductFlowStep>("choice");
  const [flowMotion, setFlowMotion] = useState<ProductFlowMotion>("forward");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "all">("all");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft>(() =>
    buildEmptyCategoryDraft()
  );
  const [productDraft, setProductDraft] = useState<ProductDraft>(() =>
    buildEmptyProductDraft(null)
  );
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState<string | null>(null);
  const [isProductSubmitting, setIsProductSubmitting] = useState(false);
  const [hasProductNcmTouched, setHasProductNcmTouched] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);

  const categories = useMemo(
    () =>
      [...snapshot.categorias].sort(
        (left, right) =>
          Number(right.ativo) - Number(left.ativo) ||
          left.ordem - right.ordem ||
          left.nome.localeCompare(right.nome, "pt-BR")
      ),
    [snapshot.categorias]
  );
  const categoryById = useMemo(
    () => new Map(categories.map(category => [category.id, category])),
    [categories]
  );
  const activeCategories = useMemo(() => categories.filter(category => category.ativo), [categories]);
  const defaultCategoryId = activeCategories[0]?.id ?? categories[0]?.id ?? null;
  const editingCategory = editingCategoryId ? categoryById.get(editingCategoryId) ?? null : null;
  const editingProduct = editingProductId
    ? snapshot.produtos.find(product => product.id === editingProductId) ?? null
    : null;
  const normalizedSearch = normalizeSearchValue(deferredSearchValue);
  const filteredProducts = useMemo(() => {
    return snapshot.produtos.filter(product => {
      if (selectedCategoryId !== "all" && product.categoria_id !== selectedCategoryId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const category = categoryById.get(product.categoria_id);
      const haystack = [
        product.nome,
        product.codigo_barras ?? "",
        product.ncm ?? "",
        product.grupo_fiscal?.nome ?? "",
        category?.nome ?? ""
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [categoryById, normalizedSearch, selectedCategoryId, snapshot.produtos]);
  const productCategoryOptions = useMemo(
    () =>
      categories.filter(
        category => category.ativo || String(category.id) === productDraft.categoria_id
      ),
    [categories, productDraft.categoria_id]
  );

  const groupedProducts = useMemo(() => {
    return categories
      .map(category => ({
        category,
        products: filteredProducts
          .filter(product => product.categoria_id === category.id)
          .sort((left, right) => {
            if (left.ativo !== right.ativo) {
              return left.ativo ? -1 : 1;
            }

            return left.nome.localeCompare(right.nome, "pt-BR");
          })
      }))
      .filter(group => group.products.length > 0 || selectedCategoryId === group.category.id);
  }, [categories, filteredProducts, selectedCategoryId]);

  const loadCatalog = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLoadError("Sessão expirada. Entre novamente para continuar.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await apiGet<ProductCatalogSnapshot>("/produtos", { token });

      setSnapshot(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, "Não foi possível carregar os produtos."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    return () => {
      if (productImagePreviewUrl) {
        URL.revokeObjectURL(productImagePreviewUrl);
      }
    };
  }, [productImagePreviewUrl]);

  function moveToFlowStep(nextStep: ProductFlowStep) {
    if (nextStep === flowStep) {
      return;
    }

    const motion: ProductFlowMotion =
      getProductFlowIndex(nextStep) >= getProductFlowIndex(flowStep) ? "forward" : "backward";
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

  function openCategoryList() {
    setSubmitError(null);
    moveToFlowStep("categories");
  }

  function openProductList() {
    if (!categories.length) {
      return;
    }

    setSubmitError(null);
    moveToFlowStep("products");
  }

  function openNewCategoryModal() {

    setEditingCategoryId(null);
    setCategoryDraft(buildEmptyCategoryDraft());
    setSubmitError(null);
    setIsCategoryModalOpen(true);
  }

  function openEditCategoryModal(categoryId: number) {
    const category = categoryById.get(categoryId);

    if (!category) {
      return;
    }

    setEditingCategoryId(categoryId);
    setCategoryDraft(buildCategoryDraft(category));
    setSubmitError(null);
    setIsCategoryModalOpen(true);
  }

  function closeCategoryModal() {
    setIsCategoryModalOpen(false);
    setEditingCategoryId(null);
    setSubmitError(null);
  }

  function getInitialProductCategoryId() {
    return selectedCategoryId === "all" ? defaultCategoryId : selectedCategoryId;
  }

  function openNewProductModal(categoryId = defaultCategoryId) {
    if (!categoryId) {
      openNewCategoryModal();
      return;
    }

    setEditingProductId(null);
    setProductDraft(buildEmptyProductDraft(categoryId));
    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setHasProductNcmTouched(false);
    setSubmitError(null);
    setIsProductModalOpen(true);
  }

  function openEditProductModal(productId: number) {
    const product = snapshot.produtos.find(item => item.id === productId);

    if (!product) {
      return;
    }

    setEditingProductId(productId);
    setProductDraft(buildProductDraft(product));
    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setHasProductNcmTouched(Boolean(product.ncm));
    setSubmitError(null);
    setIsProductModalOpen(true);
  }

  function closeProductModal() {
    setIsProductModalOpen(false);
    setEditingProductId(null);
    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setIsProductSubmitting(false);
    setHasProductNcmTouched(false);
    setSubmitError(null);
  }

  function closeTopProductModal() {
    if (pendingDelete) {
      setPendingDelete(null);
      return;
    }

    if (isProductModalOpen) {
      closeProductModal();
      return;
    }

    if (isCategoryModalOpen) {
      closeCategoryModal();
    }
  }

  function handleProductFiscalGroupChange(value: string) {
    setProductDraft(current => {
      const nextFiscalGroupId = value === "none" ? "" : value;
      const currentFiscalGroup = snapshot.grupos_fiscais.find(group => String(group.id) === current.grupo_fiscal_id);
      const selectedFiscalGroup = snapshot.grupos_fiscais.find(group => String(group.id) === nextFiscalGroupId);
      const currentSuggestedNcm = digitsOnly(currentFiscalGroup?.ncm ?? "", 8);
      const suggestedNcm = digitsOnly(selectedFiscalGroup?.ncm ?? "", 8);
      const shouldReplaceSuggestedNcm =
        !hasProductNcmTouched &&
        (!current.ncm || Boolean(currentSuggestedNcm && current.ncm === currentSuggestedNcm));
      const shouldApplySuggestedNcm = Boolean(suggestedNcm) && shouldReplaceSuggestedNcm;
      const shouldClearSuggestedNcm = !nextFiscalGroupId && shouldReplaceSuggestedNcm;

      return {
        ...current,
        grupo_fiscal_id: nextFiscalGroupId,
        ncm: shouldApplySuggestedNcm ? suggestedNcm : shouldClearSuggestedNcm ? "" : current.ncm
      };
    });
  }

  function handleProductImageChange(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setSubmitError("Selecione uma imagem para o produto.");
      return;
    }

    setProductImageFile(file);
    setProductImagePreviewUrl(URL.createObjectURL(file));
    setProductDraft(current => ({
      ...current,
      imagem_arquivo_id: "",
      imagem_url: null,
      imagem_nome: file.name
    }));
    setSubmitError(null);
  }

  function removeProductImage() {
    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setProductDraft(current => ({
      ...current,
      imagem_arquivo_id: "",
      imagem_url: null,
      imagem_nome: ""
    }));
  }

  async function uploadProductImageIfNeeded(token: string) {
    if (!productImageFile) {
      return productDraft.imagem_arquivo_id ? Number(productDraft.imagem_arquivo_id) : null;
    }

    const formData = new FormData();

    formData.append("arquivo", productImageFile);
    formData.append("contexto", "produto_imagem");
    formData.append("visibilidade", "publico");

    const arquivo = await apiPostForm<ArquivoResumo>("/arquivos", formData, { token });

    setProductImageFile(null);
    setProductImagePreviewUrl(null);
    setProductDraft(current => ({
      ...current,
      imagem_arquivo_id: String(arquivo.id),
      imagem_url: resolveArquivoUrl(arquivo),
      imagem_nome: arquivo.nome_original
    }));

    return arquivo.id;
  }

  function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token || !canSaveCategoryDraft(categoryDraft)) {
        return;
      }

      const payload = {
        nome: capitalizeFirstTextLetter(categoryDraft.nome).trim(),
        icone: categoryDraft.icone,
        cor: categoryDraft.cor
      };

      try {
        setSubmitError(null);

        if (editingCategoryId) {
          await apiPut(`/produtos/categorias/${editingCategoryId}`, payload, { token });
        } else {
          await apiPost("/produtos/categorias", payload, { token });
        }

        closeCategoryModal();
        await loadCatalog();
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Não foi possível salvar a categoria."));
      }
    })();
  }

  function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token || !canSaveProductDraft(productDraft)) {
        return;
      }

      setIsProductSubmitting(true);

      const payload = {
        nome: uppercaseTextInput(productDraft.nome).trim(),
        categoria_id: Number(productDraft.categoria_id),
        imagem_arquivo_id: productDraft.imagem_arquivo_id ? Number(productDraft.imagem_arquivo_id) : null,
        codigo_barras: productDraft.codigo_barras || null,
        ncm: productDraft.ncm || null,
        grupo_fiscal_id: productDraft.grupo_fiscal_id ? Number(productDraft.grupo_fiscal_id) : null,
        preco_custo_centavos: parseMoneyInputToCents(productDraft.preco_custo),
        preco_venda_centavos: parseMoneyInputToCents(productDraft.preco_venda),
        controla_estoque: productDraft.controla_estoque,
        ...(editingProductId
          ? {}
          : {
              quantidade_estoque: productDraft.controla_estoque
                ? productDraft.quantidade_estoque.replace(",", ".")
                : 0
            })
      };

      try {
        setSubmitError(null);
        payload.imagem_arquivo_id = await uploadProductImageIfNeeded(token);

        if (editingProductId) {
          await apiPut(`/produtos/${editingProductId}`, payload, { token });
        } else {
          await apiPost("/produtos", payload, { token });
        }

        closeProductModal();
        await loadCatalog();
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Não foi possível salvar o produto."));
      } finally {
        setIsProductSubmitting(false);
      }
    })();
  }

  function requestDeleteCategory() {
    if (!editingCategory) {
      return;
    }

    setPendingDelete({
      type: "category",
      id: editingCategory.id,
      label: editingCategory.nome,
      action: editingCategory.acao_remocao ?? "excluir"
    });
  }

  function requestDeleteProduct() {
    if (!editingProduct) {
      return;
    }

    setPendingDelete({
      type: "product",
      id: editingProduct.id,
      label: editingProduct.nome,
      action: editingProduct.acao_remocao ?? "excluir"
    });
  }

  function executeDelete() {
    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token || !pendingDelete) {
        return;
      }

      try {
        if (pendingDelete.type === "category") {
          await apiDelete<DeleteCategoryResponse>(`/produtos/categorias/${pendingDelete.id}`, { token });
          closeCategoryModal();
        } else {
          await apiDelete<DeleteProductResponse>(`/produtos/${pendingDelete.id}`, { token });
          closeProductModal();
        }

        setPendingDelete(null);
        await loadCatalog();
      } catch (error) {
        setPendingDelete(null);
        setSubmitError(getErrorMessage(error, "Não foi possível excluir o cadastro."));
      }
    })();
  }

  function executeActivate(target: "category" | "product") {
    void (async () => {
      const token = getStoredPlatformAuthToken();
      const targetId = target === "category" ? editingCategoryId : editingProductId;

      if (!token || !targetId) {
        return;
      }

      setIsProductSubmitting(true);
      setSubmitError(null);

      try {
        if (target === "category") {
          await apiPost<ActivateCategoryResponse>(`/produtos/categorias/${targetId}/ativar`, {}, { token });
        } else {
          await apiPost<ActivateProductResponse>(`/produtos/${targetId}/ativar`, {}, { token });
        }

        await loadCatalog();
      } catch (error) {
        setSubmitError(getErrorMessage(error, target === "category" ? "Não foi possível ativar a categoria." : "Não foi possível ativar o produto."));
      } finally {
        setIsProductSubmitting(false);
      }
    })();
  }

  function persistCategoryOrder(reorderedCategories: CategoriaProduto[]) {
    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token) {
        return;
      }

      try {
        await apiPut(
          "/produtos/categorias/ordem",
          { ordered_ids: reorderedCategories.map(category => category.id) },
          { token }
        );
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Não foi possível salvar a ordem das categorias."));
        await loadCatalog();
      }
    })();
  }

  function handleCategoryDragStart(event: DragEvent<HTMLButtonElement>, categoryId: number) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(categoryId));
    setDraggedCategoryId(categoryId);
  }

  function handleCategoryDragOver(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleCategoryDrop(event: DragEvent<HTMLButtonElement>, targetCategoryId: number) {
    event.preventDefault();

    const droppedCategoryId = Number(event.dataTransfer.getData("text/plain")) || draggedCategoryId;

    if (!droppedCategoryId || droppedCategoryId === targetCategoryId) {
      setDraggedCategoryId(null);
      return;
    }

    const reorderedCategories = reorderCategoriesByDrop(categories, droppedCategoryId, targetCategoryId);

    setSnapshot(currentSnapshot => ({
      ...currentSnapshot,
      categorias: reorderedCategories
    }));
    setDraggedCategoryId(null);
    persistCategoryOrder(reorderedCategories);
  }

  const canCreateProduct = categories.length > 0;
  const productsTotal = snapshot.produtos.length;
  const hasOpenModal = isCategoryModalOpen || isProductModalOpen || Boolean(pendingDelete);
  const categoryModalPresence = useModalPresence(isCategoryModalOpen);
  const productModalPresence = useModalPresence(isProductModalOpen);
  const pendingDeletePresence = useModalPresence(pendingDelete);
  const visiblePendingDelete = pendingDeletePresence.presentValue;
  const hasVisibleModal = categoryModalPresence.isPresent || productModalPresence.isPresent || pendingDeletePresence.isPresent;
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const activeProgressIndex = flowStep === "choice" ? 1 : 2;
  const selectedCategoryColor = colorById[categoryDraft.cor] ?? colorById.laranja;
  const selectedProductCategory = categoryById.get(Number(productDraft.categoria_id)) ?? null;
  const productImageDisplayUrl = productImagePreviewUrl ?? productDraft.imagem_url;
  const productFlowShellClassName =
    flowStep === "products"
      ? "platform-flow-shell product-flow-shell"
      : "platform-flow-shell platform-flow-shell-compact product-flow-shell";
  const productCatalogCardClassName =
    flowStep === "products"
      ? "platform-flow-card product-catalog-card product-catalog-card-wide"
      : "platform-flow-card product-catalog-card product-catalog-card-compact";

  usePlatformModalScrollLock(hasVisibleModal);
  const productModalDismiss = useModalDismiss(hasOpenModal, closeTopProductModal);

  function renderChoiceStep() {
    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head">
          <h1 id="product-catalog-title">Escolha uma opção</h1>
          <p>Organize categorias ou abra os produtos cadastrados.</p>
        </header>

        <div className="platform-flow-action-list">
          <button className="platform-flow-action" type="button" onClick={openCategoryList}>
            <span className="platform-flow-action-icon" aria-hidden="true">
              <FolderPlus size={20} />
            </span>
            <span>
              <strong>Categorias</strong>
              <small>{categories.length} categoria{categories.length === 1 ? "" : "s"} cadastrada{categories.length === 1 ? "" : "s"}.</small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </button>

          <button
            className={
              canCreateProduct
                ? "platform-flow-action"
                : "platform-flow-action product-flow-action-disabled"
            }
            disabled={!canCreateProduct}
            type="button"
            onClick={openProductList}
          >
            <span className="platform-flow-action-icon" aria-hidden="true">
              <PackagePlus size={20} />
            </span>
            <span>
              <strong>Produtos</strong>
              <small>{productsTotal} produto{productsTotal === 1 ? "" : "s"} cadastrado{productsTotal === 1 ? "" : "s"}.</small>
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </button>
        </div>

        {!canCreateProduct ? (
          <div className="fiscal-groups-notice product-flow-notice">
            <span>Cadastre uma categoria para iniciar o cadastro de um produto.</span>
          </div>
        ) : null}
      </div>
    );
  }

  function renderCategoriesStep() {
    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head product-flow-head-row">
          <span>
            <h2 id="product-catalog-title">Categorias</h2>
            <p>Arraste para definir a ordem em que os produtos aparecem.</p>
          </span>
        </header>

        {categories.length > 0 ? (
          <div className="product-catalog-list product-category-order-list">
            {categories.map(category => (
              <button
                className={
                  [
                    "product-category-order-row",
                    draggedCategoryId === category.id ? "product-category-order-row-dragging" : "",
                    category.ativo ? "" : "platform-record-inactive"
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
                draggable
                key={category.id}
                onClick={() => openEditCategoryModal(category.id)}
                onDragEnd={() => setDraggedCategoryId(null)}
                onDragOver={handleCategoryDragOver}
                onDragStart={event => handleCategoryDragStart(event, category.id)}
                onDrop={event => handleCategoryDrop(event, category.id)}
                type="button"
              >
                <span className="product-category-drag-handle" aria-hidden="true">
                  <GripVertical size={17} />
                </span>
                <ProductCategoryIcon category={category} />
                <span className="product-row-main">
                  <strong>{category.nome}</strong>
                  <small>
                    {category.produtos_count} produto{category.produtos_count === 1 ? "" : "s"} vinculado{category.produtos_count === 1 ? "" : "s"}
                    {category.ativo ? "" : " · Desativada"}
                  </small>
                </span>
                <span className="product-row-edit">
                  <Pencil size={14} />
                  Editar
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="product-catalog-empty product-catalog-empty-compact">
            <strong>Nenhuma categoria cadastrada.</strong>
            <p>Crie a primeira categoria para liberar o cadastro de produtos.</p>
          </div>
        )}
      </div>
    );
  }

  function renderProductsStep() {
    return (
      <div className={flowPanelClassName}>
        <header className="platform-flow-head product-flow-head-row">
          <span>
            <h2 id="product-catalog-title">Produtos por categoria</h2>
            <p>{productsTotal} produto{productsTotal === 1 ? "" : "s"} cadastrado{productsTotal === 1 ? "" : "s"}.</p>
          </span>
        </header>

        <div className="product-catalog-toolbar">
          <label className="product-search-field">
            <Search aria-hidden="true" size={18} />
            <input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              placeholder="Buscar por produto, código de barras, NCM ou categoria"
            />
          </label>

          <div className="product-category-filter" aria-label="Filtro por categoria">
            <button
              type="button"
              className={
                selectedCategoryId === "all"
                  ? "product-category-filter-chip product-category-filter-chip-active"
                  : "product-category-filter-chip"
              }
              onClick={() => setSelectedCategoryId("all")}
            >
              Todas
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                type="button"
                className={
                  selectedCategoryId === category.id
                    ? "product-category-filter-chip product-category-filter-chip-active"
                    : "product-category-filter-chip"
                }
                onClick={() => setSelectedCategoryId(category.id)}
              >
                {category.nome}
              </button>
            ))}
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

                {group.products.length > 0 ? (
                  group.products.map(product => {
                    const fiscalIssueBadges = getProductFiscalIssueBadges(product);

                    return (
                      <button
                        className={product.ativo ? "product-catalog-row" : "product-catalog-row platform-record-inactive"}
                        key={product.id}
                        type="button"
                        onClick={() => openEditProductModal(product.id)}
                      >
                        <ProductVisual
                          category={group.category}
                          imageUrl={resolveArquivoUrl(product.imagem)}
                        />

                        <span className="product-row-main">
                          <strong>{product.nome}</strong>
                          <small>
                            {product.codigo_barras ? `Código ${product.codigo_barras}` : "Sem código de barras"} · Estoque{" "}
                            {formatStock(product.quantidade_estoque)}
                            {!product.ativo ? " · Desativado" : ""}
                          </small>
                          {fiscalIssueBadges.length > 0 ? (
                            <span className="product-row-fiscal-badges">
                              {fiscalIssueBadges.map(badge => (
                                <em key={badge}>{badge}</em>
                              ))}
                            </span>
                          ) : null}
                        </span>

                        <span className="product-row-price">
                          <strong>{formatMoneyFromCents(product.preco_venda_centavos)}</strong>
                          <small>Custo {formatMoneyFromCents(product.preco_custo_centavos)}</small>
                        </span>

                        <span className="product-row-edit">
                          <Pencil size={14} />
                          Editar
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="product-category-empty-line">
                    <span>Nenhum produto nessa categoria.</span>
                    <button
                      className="platform-secondary-button"
                      type="button"
                      onClick={() => openNewProductModal(group.category.id)}
                    >
                      <Plus size={16} />
                      Novo produto
                    </button>
                  </div>
                )}
              </section>
            ))
          ) : (
            <div className="product-catalog-empty product-catalog-empty-compact">
              <strong>Nenhum produto encontrado.</strong>
              <p>Revise a busca ou cadastre um novo item.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="platform-flow-page product-flow-page">
      <div className={productFlowShellClassName}>
        <div className="platform-flow-section-title" aria-label="Produtos">
          <span className="platform-flow-section-main">
            <PackagePlus size={24} aria-hidden="true" />
            <strong>Produtos</strong>
          </span>
        </div>

        <section className={productCatalogCardClassName} aria-labelledby="product-catalog-title">
          {isLoading ? (
            <div className="product-catalog-skeleton" aria-live="polite">
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : loadError ? (
            <div className="product-catalog-empty" role="alert">
              <strong>Não foi possível abrir produtos.</strong>
              <p>{loadError}</p>
              <button className="platform-primary-button" type="button" onClick={() => void loadCatalog()}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {flowStep === "choice" ? renderChoiceStep() : null}
              {flowStep === "categories" ? renderCategoriesStep() : null}
              {flowStep === "products" ? renderProductsStep() : null}

              <div className="platform-flow-actions" aria-label="Ações do fluxo">
                {flowStep === "choice" ? (
                  <Link className="platform-secondary-button" href="/meu-sistema">
                    <ArrowLeft size={16} />
                    Voltar
                  </Link>
                ) : (
                  <button type="button" className="platform-secondary-button" onClick={() => moveToFlowStep("choice")}>
                    <ArrowLeft size={16} />
                    Voltar
                  </button>
                )}

                {flowStep === "categories" ? (
                  <button className="platform-primary-button" type="button" onClick={openNewCategoryModal}>
                    <FolderPlus size={16} />
                    Nova categoria
                  </button>
                ) : null}

                {flowStep === "products" ? (
                  <button
                    className="platform-primary-button"
                    disabled={!canCreateProduct}
                    type="button"
                    onClick={() => openNewProductModal(getInitialProductCategoryId())}
                  >
                    <PackagePlus size={16} />
                    Novo produto
                  </button>
                ) : null}
              </div>

              <div className="platform-flow-progress" aria-label="Fluxo de produtos">
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
            </>
          )}
        </section>
      </div>

      {categoryModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={categoryModalPresence.state}
          role="presentation"
          {...productModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="category-modal-title"
            aria-modal="true"
            className="platform-modal product-category-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeCategoryModal}>
              <X aria-hidden="true" size={18} />
            </button>

            <header className="platform-modal-head">
              <h2 id="category-modal-title">{editingCategoryId ? "Editar categoria" : "Nova categoria"}</h2>
              <p>Nome, ícone e cor definem como a categoria aparece na venda.</p>
            </header>

            {submitError ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{submitError}</span>
              </div>
            ) : null}

            <form className="product-modal-form product-category-form" id="category-form" onSubmit={handleCategorySubmit}>
              <label>
                <span>Nome</span>
                <input
                  value={categoryDraft.nome}
                  onChange={event =>
                    setCategoryDraft(current => ({
                      ...current,
                      nome: capitalizeFirstTextLetter(event.target.value)
                    }))
                  }
                  placeholder="Ex.: Bebidas"
                />
              </label>

              <div className="product-picker-section">
                <span className="product-picker-label">
                  <Shapes size={15} />
                  Ícone
                </span>
                <div className="product-icon-grid">
                  {categoryIconOptions.map(option => {
                    const Icon = option.icon;
                    const isSelectedIcon = categoryDraft.icone === option.value;

                    return (
                      <button
                        aria-label={option.label}
                        aria-pressed={isSelectedIcon}
                        className={isSelectedIcon ? "product-icon-option product-icon-option-active" : "product-icon-option"}
                        key={option.value}
                        style={
                          {
                            "--product-picker-color": selectedCategoryColor.solid,
                            "--product-picker-soft": selectedCategoryColor.soft,
                            "--product-picker-text": selectedCategoryColor.text
                          } as CSSProperties
                        }
                        type="button"
                        onClick={() =>
                          setCategoryDraft(current => ({
                            ...current,
                            icone: option.value
                          }))
                        }
                      >
                        <Icon size={18} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="product-picker-section">
                <span className="product-picker-label">
                  <Palette size={15} />
                  Cor
                </span>
                <div className="product-color-grid">
                  {categoryColorOptions.map(option => {
                    const isSelectedColor = categoryDraft.cor === option.value;

                    return (
                      <button
                        aria-label={option.label}
                        aria-pressed={isSelectedColor}
                        className={isSelectedColor ? "product-color-option product-color-option-active" : "product-color-option"}
                        key={option.value}
                        type="button"
                        style={
                          {
                            "--product-color-solid": option.solid,
                            "--product-color-soft": option.soft,
                            "--product-color-text": option.text,
                            backgroundColor: option.solid
                          } as CSSProperties
                        }
                        onClick={() =>
                          setCategoryDraft(current => ({
                            ...current,
                            cor: option.value
                          }))
                        }
                      >
                        {isSelectedColor ? <Check size={16} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>

            <div
              className={
                editingCategoryId && editingCategory?.ativo !== false
                  ? "platform-modal-actions product-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete"
                  : "platform-modal-actions product-modal-actions platform-item-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeCategoryModal}>
                Cancelar
              </button>
              {editingCategoryId && editingCategory?.ativo === false ? (
                <button
                  className="platform-primary-button platform-save-button"
                  disabled={isProductSubmitting}
                  type="button"
                  onClick={() => executeActivate("category")}
                >
                  <RotateCcw size={16} />
                  Ativar
                </button>
              ) : editingCategoryId ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  title={
                    editingCategory?.acao_remocao === "desativar"
                      ? "Desativar categoria"
                      : "Excluir categoria"
                  }
                  type="button"
                  onClick={requestDeleteCategory}
                >
                  {editingCategory?.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                  {editingCategory?.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              ) : null}
              {editingCategoryId && editingCategory?.ativo === false ? null : (
                <button className="platform-primary-button platform-save-button" type="submit" form="category-form" disabled={!canSaveCategoryDraft(categoryDraft)}>
                  <FolderPlus size={16} />
                  {editingCategoryId ? "Salvar categoria" : "Criar categoria"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {productModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={productModalPresence.state}
          role="presentation"
          {...productModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="product-modal-title"
            aria-modal="true"
            className="platform-modal product-edit-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeProductModal}>
              <X aria-hidden="true" size={18} />
            </button>

            <header className="platform-modal-head">
              <h2 id="product-modal-title">{editingProductId ? "Editar produto" : "Novo produto"}</h2>
              <p>Categoria, preço e fiscal ficam juntos. Estoque só entra quando o item movimenta saldo.</p>
            </header>

            {submitError ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{submitError}</span>
              </div>
            ) : null}

            <form className="product-modal-form" id="product-form" onSubmit={handleProductSubmit}>
              <section className="product-image-uploader">
                <label className="product-image-picker">
                  <span className="product-image-picker-visual">
                    <ProductVisual
                      category={selectedProductCategory}
                      imageUrl={productImageDisplayUrl}
                      size="large"
                    />
                    <span className="product-image-picker-action" aria-hidden="true">
                      <ImagePlus size={15} />
                    </span>
                  </span>
                  <input
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    disabled={isProductSubmitting}
                    type="file"
                    onChange={event => {
                      handleProductImageChange(event.currentTarget.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <span className="product-image-uploader-copy">
                  <strong>Selecionar imagem</strong>
                  <small>
                    {productDraft.imagem_nome
                      ? productDraft.imagem_nome
                      : selectedProductCategory
                        ? selectedProductCategory.nome
                        : "Categoria do produto"}
                  </small>
                </span>
                {productImageDisplayUrl ? (
                  <button
                    className="product-image-remove-button"
                    disabled={isProductSubmitting}
                    type="button"
                    onClick={removeProductImage}
                  >
                    Remover imagem
                  </button>
                ) : null}
              </section>

              <div className="product-form-grid product-form-grid-main">
                <label>
                  <span>Nome</span>
                  <input
                    className="text-uppercase-input"
                    value={productDraft.nome}
                    onChange={event =>
                      setProductDraft(current => ({
                        ...current,
                        nome: uppercaseTextInput(event.target.value)
                      }))
                    }
                    placeholder="Ex.: COCA-COLA 2L"
                  />
                </label>

                <div className="product-form-field">
                  <span>Categoria</span>
                  <PlatformSelect
                    ariaLabel="Selecionar categoria do produto"
                    value={productDraft.categoria_id}
                    options={productCategoryOptions.map(category => ({
                      value: String(category.id),
                      label: category.ativo ? category.nome : `${category.nome} (desativada)`,
                      leading: <ProductCategoryIcon category={category} />
                    }))}
                    onChange={value =>
                      setProductDraft(current => ({
                        ...current,
                        categoria_id: value
                      }))
                    }
                  />
                </div>
              </div>

              <div className="product-form-grid product-form-grid-two">
                <label>
                  <span>Código de barras</span>
                  <span className="product-input-with-icon">
                    <Barcode aria-hidden="true" size={17} />
                    <input
                      value={productDraft.codigo_barras}
                      onChange={event =>
                        setProductDraft(current => ({
                          ...current,
                          codigo_barras: event.target.value.trim()
                        }))
                      }
                      placeholder="Opcional"
                    />
                  </span>
                </label>

                <label>
                  <span>NCM</span>
                  <input
                    value={productDraft.ncm}
                    onChange={event =>
                      setProductDraft(current => ({
                        ...current,
                        ncm: digitsOnly(event.target.value, 8)
                      }))
                    }
                    onInput={() => setHasProductNcmTouched(true)}
                    inputMode="numeric"
                    placeholder="Obrigatório para emitir notas fiscais"
                  />
                </label>
              </div>

              <div className="product-form-field">
                <span>Grupo fiscal</span>
                <PlatformSelect
                  ariaLabel="Selecionar grupo fiscal do produto"
                  value={productDraft.grupo_fiscal_id || "none"}
                  options={[
                    { value: "none", label: "Sem grupo fiscal", description: "Pode operar sem emissão fiscal" },
                    ...snapshot.grupos_fiscais
                      .filter(group => group.ativo || String(group.id) === productDraft.grupo_fiscal_id)
                      .map(group => ({
                        value: String(group.id),
                        label: group.ativo ? group.nome : `${group.nome} (desativado)`,
                        description: `CFOP ${group.cfop ?? "--"}`
                      }))
                  ]}
                  onChange={handleProductFiscalGroupChange}
                />
              </div>

              <div className="product-form-grid product-form-grid-two">
                <label>
                  <span>Preço de custo</span>
                  <input
                    value={productDraft.preco_custo}
                    onChange={event =>
                      setProductDraft(current => ({
                        ...current,
                        preco_custo: formatMoneyInput(event.target.value)
                      }))
                    }
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                  />
                </label>

                <label>
                  <span>Preço de venda</span>
                  <input
                    value={productDraft.preco_venda}
                    onChange={event =>
                      setProductDraft(current => ({
                        ...current,
                        preco_venda: formatMoneyInput(event.target.value)
                      }))
                    }
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                  />
                </label>
              </div>

              <button
                aria-checked={productDraft.controla_estoque}
                className={
                  productDraft.controla_estoque
                    ? "product-stock-control product-stock-control-active"
                    : "product-stock-control"
                }
                role="switch"
                type="button"
                onClick={() =>
                  setProductDraft(current => ({
                    ...current,
                    controla_estoque: !current.controla_estoque
                  }))
                }
              >
                <span className="product-stock-control-icon" aria-hidden="true">
                  <Warehouse size={15} />
                </span>
                <span className="product-stock-control-copy">
                  <strong>Controlar estoque</strong>
                  <small>Use para itens que movimentam saldo físico.</small>
                </span>
                <span
                  className="configuration-switch product-stock-switch"
                  aria-hidden="true"
                >
                  <span />
                </span>
              </button>

              {productDraft.controla_estoque && !editingProductId ? (
                <label>
                  <span>Estoque inicial</span>
                  <input
                    value={productDraft.quantidade_estoque}
                    onChange={event =>
                      setProductDraft(current => ({
                        ...current,
                        quantidade_estoque: decimalInput(event.target.value)
                      }))
                    }
                    inputMode="decimal"
                    placeholder="0"
                  />
                </label>
              ) : null}
            </form>

            <div
              className={
                editingProductId && editingProduct?.ativo !== false
                  ? "platform-modal-actions product-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete"
                  : "platform-modal-actions product-modal-actions platform-item-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeProductModal}>
                Cancelar
              </button>
              {editingProductId && editingProduct?.ativo === false ? (
                <button
                  className="platform-primary-button platform-save-button"
                  type="button"
                  onClick={() => executeActivate("product")}
                  disabled={isProductSubmitting}
                >
                  <RotateCcw size={16} />
                  Ativar
                </button>
              ) : editingProductId ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  type="button"
                  onClick={requestDeleteProduct}
                >
                  {editingProduct?.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                  {editingProduct?.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              ) : null}
              {editingProductId && editingProduct?.ativo === false ? null : (
                <button
                  className="platform-primary-button platform-save-button"
                  type="submit"
                  form="product-form"
                  disabled={isProductSubmitting || !canSaveProductDraft(productDraft)}
                >
                  <PackagePlus size={16} />
                  {isProductSubmitting
                    ? "Salvando..."
                    : editingProductId
                      ? "Salvar produto"
                      : "Cadastrar produto"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {pendingDeletePresence.isPresent && visiblePendingDelete ? (
        <div
          className="platform-modal-backdrop fiscal-confirm-backdrop"
          data-modal-state={pendingDeletePresence.state}
          role="presentation"
          {...productModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="product-delete-confirm-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact fiscal-delete-confirm-modal"
            role="dialog"
          >
            <div className="platform-modal-head">
              <h2 id="product-delete-confirm-title">
                {visiblePendingDelete.action === "desativar"
                  ? visiblePendingDelete.type === "product"
                    ? "Desativar produto?"
                    : "Desativar categoria?"
                  : "Excluir cadastro?"}
              </h2>
              <p>
                {visiblePendingDelete.action === "desativar"
                  ? `“${visiblePendingDelete.label}” ficará indisponível para novos usos, mas segue preservado nos registros antigos.`
                  : `Confirme para excluir “${visiblePendingDelete.label}”. Essa ação não poderá ser desfeita.`}
              </p>
            </div>

            <div className="platform-modal-actions fiscal-delete-confirm-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setPendingDelete(null)}>
                Cancelar
              </button>
              <button className="fiscal-danger-button fiscal-edit-delete-button" type="button" onClick={executeDelete}>
                {visiblePendingDelete.action === "desativar" ? (
                  <Ban size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {visiblePendingDelete.action === "desativar" ? "Desativar" : "Excluir"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
