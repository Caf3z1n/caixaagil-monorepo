"use client";

import { flushSync } from "react-dom";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Ban,
  Building2,
  Check,
  CreditCard,
  HandCoins,
  LoaderCircle,
  MapPin,
  MonitorCheck,
  Pencil,
  Plus,
  QrCode,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X
} from "lucide-react";

import { PlatformSelect, type PlatformSelectOption } from "@/components/platform-select";
import { PlatformReturnLink } from "@/components/platform-return-link";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { capitalizeFirstTextLetter } from "@/lib/text-format";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type ConvenioFlowStep = "menu" | "clientes" | "recebimentos";
type ConvenioFlowMotion = "forward" | "backward";
type RecebimentoStatusFilter = "todos" | "pendente" | "pago";
type ConvenioChargeStep = "notas" | "pagamento";
type RecebimentoPaymentMethod = "dinheiro" | "pix" | "cartao";
type ClienteTipoPessoa = "fisica" | "juridica";
type ClientLookupTarget = "cnpj" | "cep" | null;

type ClienteConvenio = {
  id: number;
  tipo_pessoa: ClienteTipoPessoa;
  nome: string;
  ativo: boolean;
  permite_pagamento_frente_caixa: boolean;
  dados_fiscais: FiscalClientData | null;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
  created_at: string | null;
  updated_at: string | null;
};

type FiscalAddressData = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  codigo_municipio: string;
  municipio: string;
  uf: string;
  cep: string;
};

type FiscalClientData = {
  cnpj_cpf: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  crt: string;
  cnae: string;
  email: string;
  telefone: string;
  endereco: FiscalAddressData;
};

type FiscalCompanyPrefill = {
  uf?: string;
  emitente?: Partial<FiscalClientData>;
};

type FiscalZipPrefill = {
  endereco?: Partial<FiscalAddressData>;
};

type CaixaReferencia = {
  id: string | null;
  data_operacao_rotulo: string | null;
  numero_turno: number | null;
};

type RecebimentoConvenio = {
  id: string;
  codigo: string;
  titulo: string;
  cliente_convenio_id: number | null;
  cliente_nome: string;
  cliente: ClienteConvenio | null;
  itens_count: number;
  total_centavos: number;
  status_convenio: "pendente" | "pago";
  metodo_pagamento: string | null;
  metodo_pagamento_recebimento: string | null;
  situacao: string | null;
  situacao_recebimento: string | null;
  caixa: CaixaReferencia | null;
  caixa_recebimento: CaixaReferencia | null;
  registrado_em: string | null;
  recebido_em: string | null;
};

type ClientesResponse = {
  clientes: ClienteConvenio[];
};

type RecebimentosResponse = {
  recebimentos: RecebimentoConvenio[];
  resumo: {
    pendentes: number;
    pagos: number;
    total_pendente_centavos: number;
  };
};

type ClientModalState =
  | {
      mode: "create";
      cliente?: never;
    }
  | {
      mode: "edit";
      cliente: ClienteConvenio;
    };

type DeleteClientState = {
  id: number;
  nome: string;
  action: "excluir" | "desativar";
};

type DeleteClientResponse =
  | {
      action: "deleted";
      id: number;
      message?: string;
    }
  | {
      action: "deactivated";
      cliente: ClienteConvenio;
      message?: string;
    };

type ActivateClientResponse = {
  action: "activated";
  cliente: ClienteConvenio;
  message?: string;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
};

type ClientLookupFeedback = {
  tone: "warning" | "error";
  message: string;
};

type RecebimentoConvenioGroup = {
  key: string;
  clienteNome: string;
  recebimentos: RecebimentoConvenio[];
  pendentes: number;
  pagos: number;
  totalCentavos: number;
  totalPendenteCentavos: number;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

const clientTypeOptions: ReadonlyArray<PlatformSelectOption<ClienteTipoPessoa>> = [
  { value: "fisica", label: "Pessoa física", leading: <UserRound size={16} /> },
  { value: "juridica", label: "Pessoa jurídica", leading: <Building2 size={16} /> }
];

const ufOptions: ReadonlyArray<PlatformSelectOption<string>> = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
].map(uf => ({ value: uf, label: uf }));

const defaultFiscalAddressData: FiscalAddressData = {
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  codigo_municipio: "",
  municipio: "",
  uf: "",
  cep: ""
};

const defaultFiscalClientData: FiscalClientData = {
  cnpj_cpf: "",
  razao_social: "",
  nome_fantasia: "",
  inscricao_estadual: "",
  inscricao_municipal: "",
  crt: "",
  cnae: "",
  email: "",
  telefone: "",
  endereco: defaultFiscalAddressData
};

const fiscalClientTextKeys: Array<Exclude<keyof FiscalClientData, "endereco">> = [
  "cnpj_cpf",
  "razao_social",
  "nome_fantasia",
  "inscricao_estadual",
  "inscricao_municipal",
  "crt",
  "cnae",
  "email",
  "telefone"
];

const fiscalAddressKeys: Array<keyof FiscalAddressData> = [
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "codigo_municipio",
  "municipio",
  "uf",
  "cep"
];

function createDefaultFiscalClientData(): FiscalClientData {
  return {
    ...defaultFiscalClientData,
    endereco: { ...defaultFiscalAddressData }
  };
}

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function formatCnpj(value: string) {
  const digits = digitsOnly(value, 14);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 5);
  const part3 = digits.slice(5, 8);
  const part4 = digits.slice(8, 12);
  const part5 = digits.slice(12, 14);

  if (digits.length <= 2) {
    return part1;
  }

  if (digits.length <= 5) {
    return `${part1}.${part2}`;
  }

  if (digits.length <= 8) {
    return `${part1}.${part2}.${part3}`;
  }

  if (digits.length <= 12) {
    return `${part1}.${part2}.${part3}/${part4}`;
  }

  return `${part1}.${part2}.${part3}/${part4}-${part5}`;
}

function formatCep(value: string) {
  const digits = digitsOnly(value, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

function normalizeFiscalClientData(value?: Partial<FiscalClientData> | null): FiscalClientData {
  const endereco = value?.endereco ?? defaultFiscalAddressData;

  return {
    cnpj_cpf: digitsOnly(String(value?.cnpj_cpf ?? ""), 14),
    razao_social: String(value?.razao_social ?? ""),
    nome_fantasia: String(value?.nome_fantasia ?? ""),
    inscricao_estadual: digitsOnly(String(value?.inscricao_estadual ?? ""), 20),
    inscricao_municipal: digitsOnly(String(value?.inscricao_municipal ?? ""), 20),
    crt: digitsOnly(String(value?.crt ?? ""), 1),
    cnae: digitsOnly(String(value?.cnae ?? ""), 7),
    email: String(value?.email ?? ""),
    telefone: digitsOnly(String(value?.telefone ?? ""), 14),
    endereco: {
      logradouro: String(endereco.logradouro ?? ""),
      numero: String(endereco.numero ?? ""),
      complemento: String(endereco.complemento ?? ""),
      bairro: String(endereco.bairro ?? ""),
      codigo_municipio: digitsOnly(String(endereco.codigo_municipio ?? ""), 7),
      municipio: String(endereco.municipio ?? ""),
      uf: String(endereco.uf ?? "").toUpperCase().slice(0, 2),
      cep: digitsOnly(String(endereco.cep ?? ""), 8)
    }
  };
}

function compactTextPatch<TKey extends string>(value: Partial<Record<TKey, unknown>> | undefined, keys: TKey[]) {
  const patch: Partial<Record<TKey, string>> = {};

  keys.forEach(key => {
    const nextValue = value?.[key];

    if (typeof nextValue === "string" && nextValue.trim()) {
      patch[key] = nextValue.trim();
    }
  });

  return patch;
}

function getLegalClientMissingFields(fiscalData: FiscalClientData) {
  const missing: string[] = [];
  const endereco = fiscalData.endereco;

  if (fiscalData.cnpj_cpf.length !== 14) {
    missing.push("CNPJ");
  }

  if (fiscalData.razao_social.trim().length < 2) {
    missing.push("razão social");
  }

  if (fiscalData.nome_fantasia.trim().length < 2) {
    missing.push("nome fantasia");
  }

  if (endereco.cep.length !== 8) {
    missing.push("CEP");
  }

  if (!endereco.municipio.trim()) {
    missing.push("município");
  }

  if (endereco.uf.length !== 2) {
    missing.push("UF");
  }

  if (endereco.codigo_municipio.length !== 7) {
    missing.push("código IBGE");
  }

  if (!endereco.logradouro.trim()) {
    missing.push("logradouro");
  }

  if (!endereco.numero.trim()) {
    missing.push("número");
  }

  if (!endereco.bairro.trim()) {
    missing.push("bairro");
  }

  return missing;
}

function getClientDraftName(tipoPessoa: ClienteTipoPessoa, name: string, fiscalData: FiscalClientData) {
  if (tipoPessoa === "juridica") {
    return fiscalData.nome_fantasia.trim();
  }

  return name.trim();
}

function getClientDisplayName(cliente: ClienteConvenio) {
  if (cliente.tipo_pessoa === "juridica") {
    return cliente.dados_fiscais?.nome_fantasia || cliente.nome;
  }

  return cliente.nome;
}

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return dateTimeFormatter.format(date).replace(",", "");
}

function formatReceiptDate(value: string | null) {
  const formatted = formatDateTime(value);

  if (formatted === "Sem data") {
    return formatted;
  }

  return formatted;
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeClientNameKey(value: string) {
  return normalizeSearch(value).replace(/\s+/g, " ");
}

function getClienteTipoPessoaLabel(tipoPessoa: ClienteConvenio["tipo_pessoa"]) {
  return tipoPessoa === "juridica" ? "Pessoa jurídica" : "Pessoa física";
}

function sortClientes(clientes: ClienteConvenio[]) {
  return [...clientes].sort((left, right) => {
    if (left.ativo !== right.ativo) {
      return left.ativo ? -1 : 1;
    }

    return getClientDisplayName(left).localeCompare(getClientDisplayName(right), "pt-BR");
  });
}

function getFlowStepIndex(step: ConvenioFlowStep) {
  return step === "menu" ? 1 : 2;
}

function getRecebimentoItemLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

function getRecebimentoNotaLabel(count: number) {
  return `${count} ${count === 1 ? "nota" : "notas"}`;
}

function getPaymentMethodLabel(method: string | null) {
  const key = normalizeSearch(method || "");

  if (key === "dinheiro") {
    return "Dinheiro";
  }

  if (key === "pix") {
    return "Pix";
  }

  if (key === "cartao" || key === "cartao_credito" || key === "cartao_debito") {
    return "Cartão";
  }

  if (key === "convenio") {
    return "Convênio";
  }

  return "Pagamento";
}

function getCashierReferenceLabel(caixa: CaixaReferencia | null, fallbackDate: string | null) {
  if (caixa?.data_operacao_rotulo && caixa.numero_turno) {
    return `${caixa.data_operacao_rotulo} · Turno ${caixa.numero_turno}`;
  }

  return formatReceiptDate(fallbackDate);
}

function getReceiptSaleTitle(recebimento: RecebimentoConvenio) {
  return getCashierReferenceLabel(recebimento.caixa, recebimento.registrado_em);
}

function getReceiptSaleSubtitle(recebimento: RecebimentoConvenio) {
  const parts = [getRecebimentoItemLabel(recebimento.itens_count)];

  if (recebimento.status_convenio === "pago") {
    parts.push(getReceiptStatusDetail(recebimento));
  } else {
    parts.push("Nota em aberto");
  }

  return parts.filter(Boolean).join(" · ");
}

function getReceiptStatusDetail(recebimento: RecebimentoConvenio) {
  if (recebimento.status_convenio !== "pago") {
    return "Aguardando pagamento";
  }

  if (recebimento.situacao_recebimento === "recebido_caixa" || recebimento.caixa_recebimento) {
    const method = getPaymentMethodLabel(recebimento.metodo_pagamento_recebimento);
    const caixaLabel = getCashierReferenceLabel(recebimento.caixa_recebimento, recebimento.recebido_em);
    return `Pagamento no caixa · ${method} · ${caixaLabel}`;
  }

  return `Recebido no painel · ${formatReceiptDate(recebimento.recebido_em)}`;
}

function getRecebimentoGroupSummary(group: RecebimentoConvenioGroup) {
  const parts: string[] = [];

  if (group.pendentes > 0) {
    parts.push(`${getRecebimentoNotaLabel(group.pendentes)} ${group.pendentes === 1 ? "aberta" : "abertas"}`);
  }

  if (group.totalPendenteCentavos > 0) {
    parts.push(`${formatCurrencyFromCents(group.totalPendenteCentavos)} em aberto`);
  }

  if (group.pagos > 0) {
    parts.push(`${getRecebimentoNotaLabel(group.pagos)} ${group.pagos === 1 ? "recebida" : "recebidas"}`);
  }

  return parts.join(" · ") || `${formatCurrencyFromCents(group.totalCentavos)} recebido`;
}

export function ConvenioManager() {
  const [flowStep, setFlowStep] = useState<ConvenioFlowStep>("menu");
  const [flowMotion, setFlowMotion] = useState<ConvenioFlowMotion>("forward");
  const [clientes, setClientes] = useState<ClienteConvenio[]>([]);
  const [recebimentos, setRecebimentos] = useState<RecebimentoConvenio[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [receiptSearch, setReceiptSearch] = useState("");
  const [receiptStatusFilter, setReceiptStatusFilter] = useState<RecebimentoStatusFilter>("todos");
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isLoadingReceipts, setIsLoadingReceipts] = useState(false);
  const [clientModal, setClientModal] = useState<ClientModalState | null>(null);
  const [clientDraftType, setClientDraftType] = useState<ClienteTipoPessoa>("fisica");
  const [clientDraftName, setClientDraftName] = useState("");
  const [clientDraftFiscal, setClientDraftFiscal] = useState<FiscalClientData>(() => createDefaultFiscalClientData());
  const [clientDraftFrontPayment, setClientDraftFrontPayment] = useState(false);
  const [clientLookupFeedback, setClientLookupFeedback] = useState<ClientLookupFeedback | null>(null);
  const [clientLookupTarget, setClientLookupTarget] = useState<ClientLookupTarget>(null);
  const [deleteClientRequest, setDeleteClientRequest] = useState<DeleteClientState | null>(null);
  const [cancelReceiptRequest, setCancelReceiptRequest] = useState<RecebimentoConvenio | null>(null);
  const [chargeGroupKey, setChargeGroupKey] = useState<string | null>(null);
  const [chargeStep, setChargeStep] = useState<ConvenioChargeStep>("notas");
  const [selectedChargeReceiptIds, setSelectedChargeReceiptIds] = useState<string[]>([]);
  const [expandedChargeReceiptId, setExpandedChargeReceiptId] = useState<string | null>(null);
  const [chargePaymentMethod, setChargePaymentMethod] = useState<RecebimentoPaymentMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const lastClientCnpjLookupRef = useRef("");
  const lastClientCepLookupRef = useRef("");
  const clientCnpjChangedByUserRef = useRef(false);
  const clientCepChangedByUserRef = useRef(false);
  const activeProgressIndex = getFlowStepIndex(flowStep);
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const SectionIcon = flowStep === "clientes" ? UsersRound : flowStep === "recebimentos" ? ReceiptText : HandCoins;
  const sectionTitle = flowStep === "clientes" ? "Clientes" : flowStep === "recebimentos" ? "Recebimentos" : "Convênios";
  const filteredClients = useMemo(() => {
    const query = normalizeSearch(clientSearch);

    if (!query) {
      return clientes;
    }

    return clientes.filter((cliente) => {
      const searchable = [
        cliente.nome,
        getClientDisplayName(cliente),
        cliente.dados_fiscais?.razao_social,
        cliente.dados_fiscais?.cnpj_cpf
      ]
        .filter(Boolean)
        .join(" ");

      return normalizeSearch(searchable).includes(query);
    });
  }, [clientSearch, clientes]);
  const filteredReceipts = useMemo(() => {
    const query = normalizeSearch(receiptSearch);

    return recebimentos.filter((recebimento) => {
      if (receiptStatusFilter !== "todos" && recebimento.status_convenio !== receiptStatusFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return normalizeSearch(
        [
          recebimento.cliente_nome,
          recebimento.titulo,
          getReceiptSaleTitle(recebimento),
          getReceiptSaleSubtitle(recebimento),
          getReceiptStatusDetail(recebimento),
          formatCurrencyFromCents(recebimento.total_centavos),
          formatDateTime(recebimento.registrado_em),
          formatDateTime(recebimento.recebido_em)
        ].join(" ")
      ).includes(query);
    });
  }, [receiptSearch, receiptStatusFilter, recebimentos]);
  const groupedReceipts = useMemo(() => {
    const groups = new Map<string, RecebimentoConvenioGroup>();

    filteredReceipts.forEach((recebimento) => {
      const fallbackKey = normalizeClientNameKey(recebimento.cliente_nome) || "sem-cliente";
      const key = recebimento.cliente_convenio_id ? `cliente-${recebimento.cliente_convenio_id}` : `nome-${fallbackKey}`;
      const currentGroup =
        groups.get(key) ??
        {
          key,
          clienteNome: recebimento.cliente_nome || "Cliente não informado",
          recebimentos: [],
          pendentes: 0,
          pagos: 0,
          totalCentavos: 0,
          totalPendenteCentavos: 0
        };

      currentGroup.recebimentos.push(recebimento);
      currentGroup.totalCentavos += recebimento.total_centavos;

      if (recebimento.status_convenio === "pendente") {
        currentGroup.pendentes += 1;
        currentGroup.totalPendenteCentavos += recebimento.total_centavos;
      } else {
        currentGroup.pagos += 1;
      }

      groups.set(key, currentGroup);
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        recebimentos: [...group.recebimentos].sort((left, right) => {
          if (left.status_convenio !== right.status_convenio) {
            return left.status_convenio === "pendente" ? -1 : 1;
          }

          const leftDate = left.registrado_em ? new Date(left.registrado_em).getTime() : 0;
          const rightDate = right.registrado_em ? new Date(right.registrado_em).getTime() : 0;
          return rightDate - leftDate;
        })
      }))
      .sort((left, right) => {
        if (left.pendentes !== right.pendentes) {
          return right.pendentes - left.pendentes;
        }

        return left.clienteNome.localeCompare(right.clienteNome, "pt-BR");
      });
  }, [filteredReceipts]);
  const chargeReceiptGroup = useMemo(
    () => groupedReceipts.find((group) => group.key === chargeGroupKey) ?? null,
    [chargeGroupKey, groupedReceipts]
  );
  const pendingChargeReceipts = useMemo(
    () => chargeReceiptGroup?.recebimentos.filter((recebimento) => recebimento.status_convenio === "pendente") ?? [],
    [chargeReceiptGroup]
  );
  const paidChargeReceipts = useMemo(
    () => chargeReceiptGroup?.recebimentos.filter((recebimento) => recebimento.status_convenio === "pago") ?? [],
    [chargeReceiptGroup]
  );
  const selectedChargeReceipts = useMemo(() => {
    const selectedIds = new Set(selectedChargeReceiptIds);
    return pendingChargeReceipts.filter((recebimento) => selectedIds.has(recebimento.id));
  }, [pendingChargeReceipts, selectedChargeReceiptIds]);
  const selectedChargeTotalCentavos = useMemo(
    () => selectedChargeReceipts.reduce((total, recebimento) => total + recebimento.total_centavos, 0),
    [selectedChargeReceipts]
  );
  const allPendingChargeReceiptsSelected =
    pendingChargeReceipts.length > 0 &&
    pendingChargeReceipts.every((recebimento) => selectedChargeReceiptIds.includes(recebimento.id));
  const clientDraftResolvedName = useMemo(
    () => getClientDraftName(clientDraftType, clientDraftName, clientDraftFiscal),
    [clientDraftFiscal, clientDraftName, clientDraftType]
  );
  const legalClientMissingFields = useMemo(
    () => clientDraftType === "juridica" ? getLegalClientMissingFields(clientDraftFiscal) : [],
    [clientDraftFiscal, clientDraftType]
  );
  const clientNameConflict = useMemo(() => {
    if (!clientModal) {
      return null;
    }

    const nameKey = normalizeClientNameKey(clientDraftResolvedName);

    if (nameKey.length < 2) {
      return null;
    }

    const currentClientId = clientModal.mode === "edit" ? clientModal.cliente.id : null;

    return clientes.find((cliente) => {
      if (cliente.id === currentClientId) {
        return false;
      }

      if (!cliente.ativo) {
        return false;
      }

      return normalizeClientNameKey(getClientDisplayName(cliente)) === nameKey;
    }) ?? null;
  }, [clientes, clientDraftResolvedName, clientModal]);
  const canSubmitClient = clientDraftResolvedName.length >= 2 && legalClientMissingFields.length === 0 && !clientNameConflict;
  const clientModalPresence = useModalPresence(clientModal);
  const deleteClientPresence = useModalPresence(deleteClientRequest);
  const chargePresence = useModalPresence(chargeReceiptGroup);
  const cancelReceiptPresence = useModalPresence(cancelReceiptRequest);
  const closeClientModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setClientModal(null);
  }, [isSubmitting]);
  const closeDeleteClientModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setDeleteClientRequest(null);
  }, [isSubmitting]);
  function resetChargeModal() {
    setChargeGroupKey(null);
    setChargeStep("notas");
    setSelectedChargeReceiptIds([]);
    setExpandedChargeReceiptId(null);
    setChargePaymentMethod(null);
  }

  const closeChargeModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    resetChargeModal();
  }, [isSubmitting]);
  const closeCancelReceiptModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setCancelReceiptRequest(null);
  }, [isSubmitting]);
  const clientModalDismiss = useModalDismiss(Boolean(clientModal), closeClientModal);
  const deleteClientDismiss = useModalDismiss(Boolean(deleteClientRequest), closeDeleteClientModal);
  const chargeDismiss = useModalDismiss(Boolean(chargeReceiptGroup), closeChargeModal);
  const cancelReceiptDismiss = useModalDismiss(Boolean(cancelReceiptRequest), closeCancelReceiptModal);

  usePlatformModalScrollLock(
    clientModalPresence.isPresent ||
      deleteClientPresence.isPresent ||
      chargePresence.isPresent ||
      cancelReceiptPresence.isPresent
  );

  const loadClientes = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsLoadingClients(true);
    setFeedback(null);

    try {
      const result = await apiGet<ClientesResponse>("/convenios/clientes", { cacheTtlMs: 60_000, token });
      setClientes(sortClientes(result.clientes));
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível carregar os clientes."
      });
    } finally {
      setIsLoadingClients(false);
    }
  }, []);

  const loadRecebimentos = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsLoadingReceipts(true);
    setFeedback(null);

    try {
      const result = await apiGet<RecebimentosResponse>("/convenios/recebimentos", { cacheTtlMs: 60_000, token });
      setRecebimentos(result.recebimentos);
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Não foi possível carregar os recebimentos."
      });
    } finally {
      setIsLoadingReceipts(false);
    }
  }, []);

  useEffect(() => {
    if (flowStep === "clientes") {
      void loadClientes();
    }

    if (flowStep === "recebimentos") {
      void loadRecebimentos();
    }
  }, [flowStep, loadClientes, loadRecebimentos]);

  useEffect(() => {
    if (flowStep !== "recebimentos") {
      setChargeGroupKey(null);
      return;
    }

    if (chargeGroupKey && !chargeReceiptGroup) {
      setChargeGroupKey(null);
    }
  }, [chargeGroupKey, chargeReceiptGroup, flowStep]);

  useEffect(() => {
    if (!clientModal || clientDraftType !== "juridica") {
      return undefined;
    }

    const cnpj = clientDraftFiscal.cnpj_cpf;

    if (!clientCnpjChangedByUserRef.current || cnpj.length !== 14 || cnpj === lastClientCnpjLookupRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      lastClientCnpjLookupRef.current = cnpj;
      clientCnpjChangedByUserRef.current = false;
      void lookupClientCnpj(cnpj);
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [clientDraftFiscal.cnpj_cpf, clientDraftType, clientModal]);

  useEffect(() => {
    if (!clientModal || clientDraftType !== "juridica") {
      return undefined;
    }

    const cep = clientDraftFiscal.endereco.cep;

    if (!clientCepChangedByUserRef.current || cep.length !== 8 || cep === lastClientCepLookupRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      lastClientCepLookupRef.current = cep;
      clientCepChangedByUserRef.current = false;
      void lookupClientCep(cep);
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [clientDraftFiscal.endereco.cep, clientDraftType, clientModal]);

  function moveToFlowStep(nextStep: ConvenioFlowStep) {
    if (nextStep === flowStep) {
      return;
    }

    const motion: ConvenioFlowMotion =
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
          setFeedback(null);
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
    setFeedback(null);
    window.setTimeout(() => {
      delete root.dataset.platformFlowMotion;
      delete root.dataset.platformFlowFallback;
    }, 430);
  }

  function resetClientLookupRefs(fiscalData: FiscalClientData) {
    lastClientCnpjLookupRef.current = fiscalData.cnpj_cpf;
    lastClientCepLookupRef.current = fiscalData.endereco.cep;
    clientCnpjChangedByUserRef.current = false;
    clientCepChangedByUserRef.current = false;
    setClientLookupFeedback(null);
    setClientLookupTarget(null);
  }

  function updateClientFiscal(patch: Partial<FiscalClientData>) {
    setClientDraftFiscal(current => normalizeFiscalClientData({
      ...current,
      ...patch
    }));
  }

  function updateClientFiscalAddress(patch: Partial<FiscalAddressData>) {
    setClientDraftFiscal(current => normalizeFiscalClientData({
      ...current,
      endereco: {
        ...current.endereco,
        ...patch
      }
    }));
  }

  function changeClientType(tipoPessoa: ClienteTipoPessoa) {
    setClientDraftType(tipoPessoa);
    setClientLookupFeedback(null);
    setFeedback(null);

    if (tipoPessoa === "juridica") {
      setClientDraftFiscal(current => normalizeFiscalClientData({
        ...current,
        nome_fantasia: current.nome_fantasia || clientDraftName
      }));
    }
  }

  function applyClientCompanyPrefill(prefill: FiscalCompanyPrefill) {
    const emitentePatch = compactTextPatch(prefill.emitente, fiscalClientTextKeys);
    const enderecoPatch = compactTextPatch(prefill.emitente?.endereco, fiscalAddressKeys);

    setClientDraftFiscal(current => normalizeFiscalClientData({
      ...current,
      ...emitentePatch,
      endereco: {
        ...current.endereco,
        ...enderecoPatch,
        uf: enderecoPatch.uf || prefill.uf || current.endereco.uf
      }
    }));
  }

  function applyClientZipPrefill(prefill: FiscalZipPrefill) {
    const enderecoPatch = compactTextPatch(prefill.endereco, fiscalAddressKeys);

    setClientDraftFiscal(current => normalizeFiscalClientData({
      ...current,
      endereco: {
        ...current.endereco,
        ...enderecoPatch
      }
    }));
  }

  async function lookupClientCnpj(cnpj: string) {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setClientLookupFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para consultar CNPJ."
      });
      return;
    }

    setClientLookupTarget("cnpj");
    setClientLookupFeedback(null);

    try {
      const prefill = await apiGet<FiscalCompanyPrefill>(`/configuracoes/integracoes/cnpja/cnpj/${cnpj}`, { token });
      applyClientCompanyPrefill(prefill);
      setClientLookupFeedback(null);
    } catch (error) {
      setClientLookupFeedback({
        tone: "warning",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível consultar o CNPJ."
      });
    } finally {
      setClientLookupTarget(null);
    }
  }

  async function lookupClientCep(cep: string) {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setClientLookupFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para consultar CEP."
      });
      return;
    }

    setClientLookupTarget("cep");
    setClientLookupFeedback(null);

    try {
      const prefill = await apiGet<FiscalZipPrefill>(`/configuracoes/integracoes/cnpja/cep/${cep}`, { token });
      applyClientZipPrefill(prefill);
      setClientLookupFeedback(null);
    } catch (error) {
      setClientLookupFeedback({
        tone: "warning",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível consultar o CEP."
      });
    } finally {
      setClientLookupTarget(null);
    }
  }

  function openCreateClientModal() {
    const emptyFiscalData = createDefaultFiscalClientData();

    setFeedback(null);
    setClientLookupFeedback(null);
    setClientLookupTarget(null);
    setClientDraftType("fisica");
    setClientDraftName("");
    setClientDraftFiscal(emptyFiscalData);
    setClientDraftFrontPayment(false);
    resetClientLookupRefs(emptyFiscalData);
    setClientModal({ mode: "create" });
  }

  function openEditClientModal(cliente: ClienteConvenio) {
    const tipoPessoa = cliente.tipo_pessoa === "juridica" ? "juridica" : "fisica";
    const fiscalData = normalizeFiscalClientData(
      tipoPessoa === "juridica"
        ? {
            ...(cliente.dados_fiscais ?? {}),
            nome_fantasia: cliente.dados_fiscais?.nome_fantasia || cliente.nome
          }
        : null
    );

    setFeedback(null);
    setClientLookupFeedback(null);
    setClientLookupTarget(null);
    setClientDraftType(tipoPessoa);
    setClientDraftName(cliente.nome);
    setClientDraftFiscal(fiscalData);
    setClientDraftFrontPayment(Boolean(cliente.permite_pagamento_frente_caixa));
    resetClientLookupRefs(fiscalData);
    setClientModal({ mode: "edit", cliente });
  }

  function requestDeleteClientFromModal() {
    if (clientModal?.mode !== "edit") {
      return;
    }

    setFeedback(null);
    setClientModal(null);
    setDeleteClientRequest({
      id: clientModal.cliente.id,
      nome: getClientDisplayName(clientModal.cliente),
      action: clientModal.cliente.acao_remocao ?? "excluir"
    });
  }

  function openChargeModal(group: RecebimentoConvenioGroup) {
    setFeedback(null);
    setChargeGroupKey(group.key);
    setChargeStep("notas");
    setSelectedChargeReceiptIds([]);
    setExpandedChargeReceiptId(null);
    setChargePaymentMethod(null);
  }

  function toggleChargeReceipt(recebimentoId: string) {
    setSelectedChargeReceiptIds((currentIds) =>
      currentIds.includes(recebimentoId)
        ? currentIds.filter((currentId) => currentId !== recebimentoId)
        : [...currentIds, recebimentoId]
    );
  }

  function toggleAllPendingChargeReceipts() {
    if (allPendingChargeReceiptsSelected) {
      setSelectedChargeReceiptIds([]);
      return;
    }

    setSelectedChargeReceiptIds(pendingChargeReceipts.map((recebimento) => recebimento.id));
  }

  function startChargePaymentStep() {
    if (selectedChargeReceipts.length === 0) {
      return;
    }

    setChargeStep("pagamento");
    setExpandedChargeReceiptId(null);
    setChargePaymentMethod(null);
    setFeedback(null);
  }

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clientModal || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    const nome = clientDraftResolvedName;

    if (nome.length < 2) {
      setFeedback({
        tone: "error",
        message: clientDraftType === "juridica" ? "Informe o nome fantasia do cliente." : "Informe o nome do cliente."
      });
      return;
    }

    if (clientDraftType === "juridica" && legalClientMissingFields.length > 0) {
      setFeedback({
        tone: "error",
        message: `Informe ${legalClientMissingFields.join(", ")} do cliente pessoa jurídica.`
      });
      return;
    }

    if (clientNameConflict) {
      setFeedback({ tone: "error", message: "Já existe um cliente com esse nome." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        tipo_pessoa: clientDraftType,
        nome,
        dados_fiscais: clientDraftType === "juridica" ? clientDraftFiscal : null,
        permite_pagamento_frente_caixa: clientDraftFrontPayment
      };
      const saved =
        clientModal.mode === "edit"
          ? await apiPut<ClienteConvenio>(`/convenios/clientes/${clientModal.cliente.id}`, payload, { token })
          : await apiPost<ClienteConvenio>("/convenios/clientes", payload, { token });

      setClientes((currentClientes) => {
        const withoutSaved = currentClientes.filter((cliente) => cliente.id !== saved.id);
        return sortClientes([...withoutSaved, saved]);
      });
      setClientModal(null);
      setFeedback({
        tone: "success",
        message: clientModal.mode === "edit" ? "Cliente atualizado." : "Cliente cadastrado."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível salvar o cliente."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmDeleteClient() {
    if (!deleteClientRequest || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await apiDelete<DeleteClientResponse>(`/convenios/clientes/${deleteClientRequest.id}`, { token });

      if (result?.action === "deactivated") {
        setClientes((currentClientes) => {
          const withoutClient = currentClientes.filter((cliente) => cliente.id !== result.cliente.id);
          return sortClientes([...withoutClient, result.cliente]);
        });
      } else {
        setClientes((currentClientes) => currentClientes.filter((cliente) => cliente.id !== deleteClientRequest.id));
      }

      setClientModal(null);
      setDeleteClientRequest(null);
      setFeedback({
        tone: "success",
        message: result?.action === "deactivated" ? "Cliente desativado." : "Cliente excluído."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível remover o cliente."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function activateClientFromModal() {
    if (!clientModal || clientModal.mode !== "edit" || clientModal.cliente.ativo || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await apiPost<ActivateClientResponse>(
        `/convenios/clientes/${clientModal.cliente.id}/ativar`,
        {},
        { token }
      );

      setClientes((currentClientes) => {
        const withoutClient = currentClientes.filter((cliente) => cliente.id !== result.cliente.id);
        return sortClientes([...withoutClient, result.cliente]);
      });
      setClientModal({ mode: "edit", cliente: result.cliente });
      setFeedback({ tone: "success", message: "Cliente ativado." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível ativar o cliente."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmChargePayment() {
    if (selectedChargeReceipts.length === 0 || !chargePaymentMethod || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const updatedReceipts = await Promise.all(
        selectedChargeReceipts.map((recebimento) =>
          apiPut<RecebimentoConvenio>(
            `/convenios/recebimentos/${recebimento.id}/pagar`,
            { metodo_pagamento_recebimento: chargePaymentMethod },
            { token }
          )
        )
      );
      const updatedById = new Map(updatedReceipts.map((recebimento) => [recebimento.id, recebimento]));

      setRecebimentos((currentReceipts) =>
        currentReceipts.map((recebimento) => updatedById.get(recebimento.id) ?? recebimento)
      );
      resetChargeModal();
      setFeedback({
        tone: "success",
        message:
          updatedReceipts.length === 1
            ? "Recebimento confirmado."
            : `${updatedReceipts.length} recebimentos confirmados.`
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível confirmar os recebimentos."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmCancelReceiptPayment() {
    if (!cancelReceiptRequest || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const updated = await apiPut<RecebimentoConvenio>(
        `/convenios/recebimentos/${cancelReceiptRequest.id}/cancelar`,
        {},
        { token }
      );

      setRecebimentos((currentReceipts) =>
        currentReceipts.map((recebimento) => (recebimento.id === updated.id ? updated : recebimento))
      );
      setCancelReceiptRequest(null);
      setFeedback({ tone: "success", message: "Recebimento cancelado. A nota voltou para pendente." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível cancelar o recebimento."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="platform-flow-page convenio-flow-page">
      <div
        className={
          flowStep === "menu"
            ? "platform-flow-shell platform-flow-shell-compact convenio-flow-shell convenio-flow-shell-menu"
            : "platform-flow-shell platform-flow-shell-compact convenio-flow-shell"
        }
      >
        <section className="platform-flow-section-title" aria-label={sectionTitle}>
          <span className="platform-flow-section-main">
            <SectionIcon aria-hidden="true" />
            <strong>{sectionTitle}</strong>
          </span>
        </section>

        <section
          className={
            flowStep === "menu"
              ? "platform-flow-card convenio-flow-card convenio-flow-card-menu"
              : "platform-flow-card convenio-flow-card"
          }
          aria-label="Fluxo de convênios"
        >
          {flowStep === "menu" ? (
            <div className={`${flowPanelClassName} convenio-menu-panel`} key="menu">
              <header className="platform-flow-head">
                <h1>Escolha uma opção</h1>
                <p>Cadastre clientes ou acompanhe os recebimentos em convênio.</p>
              </header>

              <div className="platform-flow-action-list convenio-menu-list" aria-label="Menu de convênios">
                <button type="button" className="platform-flow-action" onClick={() => moveToFlowStep("clientes")}>
                  <span className="platform-flow-action-icon" aria-hidden="true">
                    <UsersRound size={21} />
                  </span>
                  <span>
                    <strong>Clientes</strong>
                    <small>Cadastre e edite clientes que compram em convênio.</small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>

                <button type="button" className="platform-flow-action" onClick={() => moveToFlowStep("recebimentos")}>
                  <span className="platform-flow-action-icon" aria-hidden="true">
                    <ReceiptText size={21} />
                  </span>
                  <span>
                    <strong>Recebimentos</strong>
                    <small>Revise pendências e confirme pagamentos recebidos.</small>
                  </span>
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}

          {flowStep === "clientes" ? (
            <div className={`${flowPanelClassName} convenio-section-panel`} key="clientes">
              <header className="platform-flow-head convenio-flow-head">
                <h1>Clientes</h1>
                <p>Pessoas físicas e jurídicas.</p>
              </header>

              <div className="convenio-toolbar">
                <label className="convenio-search">
                  <Search aria-hidden="true" size={18} />
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Buscar cliente"
                    type="search"
                  />
                </label>
              </div>

              {feedback ? (
                <div className={`auth-feedback auth-feedback-${feedback.tone} convenio-feedback`} role="status">
                  <span className="auth-feedback-marker" aria-hidden="true" />
                  <span className="auth-feedback-copy">
                    <strong>{feedback.message}</strong>
                  </span>
                </div>
              ) : null}

              <div className="convenio-list" aria-label="Clientes cadastrados">
                {isLoadingClients ? (
                  Array.from({ length: 3 }, (_, index) => (
                    <span className="convenio-row-skeleton" key={index} />
                  ))
                ) : filteredClients.length > 0 ? (
                  filteredClients.map((cliente) => {
                    const ClienteIcon = cliente.tipo_pessoa === "juridica" ? Building2 : UserRound;

                    return (
                      <button
                        className={cliente.ativo ? "convenio-row convenio-client-row" : "convenio-row convenio-client-row platform-record-inactive"}
                        key={cliente.id}
                        type="button"
                        onClick={() => openEditClientModal(cliente)}
                      >
                        <span className="convenio-row-icon" aria-hidden="true">
                          <ClienteIcon size={18} />
                        </span>
                        <span className="convenio-row-main">
                          <strong>{getClientDisplayName(cliente)}</strong>
                          <small>
                            {getClienteTipoPessoaLabel(cliente.tipo_pessoa)}
                            {cliente.permite_pagamento_frente_caixa ? " · Recebe no caixa" : ""}
                            {!cliente.ativo ? " · Desativado" : ""}
                          </small>
                        </span>
                        <span className="convenio-row-action" aria-hidden="true">
                          <Pencil size={15} />
                          Editar
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="convenio-empty">
                    <UsersRound aria-hidden="true" size={26} />
                    <strong>Nenhum cliente</strong>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {flowStep === "recebimentos" ? (
            <div className={`${flowPanelClassName} convenio-section-panel`} key="recebimentos">
              <header className="platform-flow-head convenio-flow-head">
                <h1>Recebimentos</h1>
                <p>Escolha um cliente para revisar e cobrar notas em convênio.</p>
              </header>

              <div className="convenio-toolbar convenio-receipt-toolbar">
                <label className="convenio-search">
                  <Search aria-hidden="true" size={18} />
                  <input
                    value={receiptSearch}
                    onChange={(event) => setReceiptSearch(event.target.value)}
                    placeholder="Buscar por cliente, data ou turno"
                    type="search"
                  />
                </label>
                <div className="product-category-filter convenio-status-filter" aria-label="Filtrar recebimentos">
                  <button
                    className={
                      receiptStatusFilter === "todos"
                        ? "product-category-filter-chip product-category-filter-chip-active"
                        : "product-category-filter-chip"
                    }
                    type="button"
                    aria-pressed={receiptStatusFilter === "todos"}
                    onClick={() => setReceiptStatusFilter("todos")}
                  >
                    Todos
                  </button>
                  <button
                    className={
                      receiptStatusFilter === "pendente"
                        ? "product-category-filter-chip product-category-filter-chip-active"
                        : "product-category-filter-chip"
                    }
                    type="button"
                    aria-pressed={receiptStatusFilter === "pendente"}
                    onClick={() => setReceiptStatusFilter("pendente")}
                  >
                    Pendentes
                  </button>
                  <button
                    className={
                      receiptStatusFilter === "pago"
                        ? "product-category-filter-chip product-category-filter-chip-active"
                        : "product-category-filter-chip"
                    }
                    type="button"
                    aria-pressed={receiptStatusFilter === "pago"}
                    onClick={() => setReceiptStatusFilter("pago")}
                  >
                    Pagos
                  </button>
                </div>
              </div>

              {feedback ? (
                <div className={`auth-feedback auth-feedback-${feedback.tone} convenio-feedback`} role="status">
                  <span className="auth-feedback-marker" aria-hidden="true" />
                  <span className="auth-feedback-copy">
                    <strong>{feedback.message}</strong>
                  </span>
                </div>
              ) : null}

              <div className="convenio-receipt-client-list" aria-label="Clientes com recebimentos">
                {isLoadingReceipts ? (
                  Array.from({ length: 4 }, (_, index) => (
                    <span className="convenio-row-skeleton" key={index} />
                  ))
                ) : groupedReceipts.length > 0 ? (
                  groupedReceipts.map((group) => (
                    <button
                      className="convenio-row convenio-client-row convenio-receipt-client-row"
                      key={group.key}
                      type="button"
                      onClick={() => openChargeModal(group)}
                    >
                      <span className="convenio-row-icon" aria-hidden="true">
                        <UserRound size={18} />
                      </span>
                      <span className="convenio-row-main">
                        <strong>{group.clienteNome}</strong>
                        <small>{getRecebimentoGroupSummary(group)}</small>
                      </span>
                      <span className="convenio-row-amount convenio-receipt-client-amount">
                        <small>{group.totalPendenteCentavos > 0 ? "Em aberto" : "Recebido"}</small>
                        <strong className={group.totalPendenteCentavos > 0 ? "" : "convenio-row-amount-paid"}>
                          {formatCurrencyFromCents(group.totalPendenteCentavos || group.totalCentavos)}
                        </strong>
                      </span>
                      <span className="convenio-row-action" aria-hidden="true">
                        <ReceiptText size={15} />
                        Ver notas
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="convenio-empty">
                    <ReceiptText aria-hidden="true" size={26} />
                    <strong>Nenhum recebimento</strong>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div className="platform-flow-actions convenio-flow-actions" aria-label="Ações do fluxo">
            {flowStep === "menu" ? (
              <PlatformReturnLink className="platform-secondary-button">
                <ArrowLeft aria-hidden="true" size={17} />
                Voltar
              </PlatformReturnLink>
            ) : (
              <button
                className="platform-secondary-button"
                type="button"
                onClick={() => {
                  moveToFlowStep("menu");
                }}
              >
                <ArrowLeft aria-hidden="true" size={17} />
                Voltar
              </button>
            )}

            {flowStep === "clientes" ? (
              <button className="platform-primary-button" type="button" onClick={openCreateClientModal}>
                <Plus aria-hidden="true" size={17} />
                Novo cliente
              </button>
            ) : null}
          </div>

          <div className="platform-flow-progress" aria-label={`Etapa ${activeProgressIndex + 1} de 3`}>
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
        </section>
      </div>

      {clientModalPresence.isPresent && clientModalPresence.presentValue ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={clientModalPresence.state}
          {...clientModalDismiss.backdropProps}
        >
          <section
            className={
              clientDraftType === "juridica"
                ? "platform-modal convenio-client-modal convenio-client-modal-legal"
                : "platform-modal convenio-client-modal"
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby="convenio-client-title"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeClientModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head convenio-client-modal-head">
              <h2 id="convenio-client-title">
                {clientModalPresence.presentValue.mode === "edit" ? "Editar cliente" : "Novo cliente"}
              </h2>
              <p>
                {clientDraftType === "juridica"
                  ? "Cadastro fiscal do cliente pessoa jurídica."
                  : "Cadastro de cliente pessoa física."}
              </p>
            </header>
            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}
            {clientLookupFeedback ? (
              <div className={`auth-feedback auth-feedback-${clientLookupFeedback.tone} platform-modal-feedback`} role="status">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{clientLookupFeedback.message}</span>
              </div>
            ) : null}
            <form className="convenio-client-form fiscal-group-form" data-client-type={clientDraftType} id="convenio-client-form" onSubmit={submitClient}>
              <div className="convenio-client-field convenio-client-type-field">
                <span>Tipo do cliente</span>
                <PlatformSelect
                  ariaLabel="Tipo do cliente"
                  disabled={isSubmitting}
                  options={clientTypeOptions}
                  value={clientDraftType}
                  onChange={changeClientType}
                />
              </div>

              {clientDraftType === "fisica" ? (
                <label className="convenio-client-field">
                  <span>Nome</span>
                  <input
                    autoFocus
                    disabled={isSubmitting}
                    value={clientDraftName}
                    onChange={(event) => {
                      setClientDraftName(capitalizeFirstTextLetter(event.target.value));
                      if (feedback?.tone === "error") {
                        setFeedback(null);
                      }
                    }}
                    placeholder="Nome do cliente"
                  />
                  {clientNameConflict ? (
                    <small className="convenio-client-field-error">Já existe um cliente com esse nome.</small>
                  ) : null}
                </label>
              ) : (
                <>
                  <section className="fiscal-form-section fiscal-settings-section fiscal-settings-section-company convenio-client-fiscal-section">
                    <header className="fiscal-settings-section-head">
                      <span aria-hidden="true">
                        <Building2 size={18} />
                      </span>
                      <strong>Empresa</strong>
                    </header>

                    <div className="fiscal-form-grid fiscal-company-grid">
                      <label className="fiscal-field-span-4 fiscal-autofill-field">
                        <span className="fiscal-field-label-row">
                          <span>CNPJ</span>
                          <em className={clientLookupTarget === "cnpj" ? "fiscal-autofill-badge fiscal-autofill-badge-loading" : "fiscal-autofill-badge"}>
                            {clientLookupTarget === "cnpj" ? "Buscando" : "CNPJá"}
                          </em>
                        </span>
                        <input
                          autoFocus
                          autoComplete="off"
                          disabled={isSubmitting || clientLookupTarget === "cnpj"}
                          inputMode="numeric"
                          maxLength={18}
                          type="text"
                          value={formatCnpj(clientDraftFiscal.cnpj_cpf)}
                          onChange={(event) => {
                            clientCnpjChangedByUserRef.current = true;
                            setClientLookupFeedback(null);
                            setFeedback(null);
                            updateClientFiscal({ cnpj_cpf: digitsOnly(event.currentTarget.value, 14) });
                          }}
                        />
                        {clientLookupTarget === "cnpj" ? (
                          <small className="fiscal-lookup-hint">Consultando CNPJá.</small>
                        ) : (
                          <small className="fiscal-lookup-muted">Preenche dados ao completar.</small>
                        )}
                      </label>

                      <label className="fiscal-field-span-5">
                        <span>Nome fantasia</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={160}
                          value={clientDraftFiscal.nome_fantasia}
                          onChange={(event) => updateClientFiscal({ nome_fantasia: event.currentTarget.value })}
                        />
                        {clientNameConflict ? (
                          <small className="convenio-client-field-error">Já existe um cliente com esse nome.</small>
                        ) : null}
                      </label>

                      <label className="fiscal-field-span-3">
                        <span>IE</span>
                        <input
                          disabled={isSubmitting}
                          inputMode="numeric"
                          maxLength={20}
                          value={clientDraftFiscal.inscricao_estadual}
                          onChange={(event) => updateClientFiscal({ inscricao_estadual: digitsOnly(event.currentTarget.value, 20) })}
                        />
                      </label>

                      <label className="fiscal-field-span-8">
                        <span>Razão social</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={160}
                          value={clientDraftFiscal.razao_social}
                          onChange={(event) => {
                            setFeedback(null);
                            updateClientFiscal({ razao_social: event.currentTarget.value });
                          }}
                        />
                      </label>

                      <label className="fiscal-field-span-4">
                        <span>CNAE</span>
                        <input
                          disabled={isSubmitting}
                          inputMode="numeric"
                          maxLength={7}
                          value={clientDraftFiscal.cnae}
                          onChange={(event) => updateClientFiscal({ cnae: digitsOnly(event.currentTarget.value, 7) })}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="fiscal-form-section fiscal-settings-section fiscal-settings-section-address convenio-client-fiscal-section">
                    <header className="fiscal-settings-section-head">
                      <span aria-hidden="true">
                        <MapPin size={18} />
                      </span>
                      <strong>Endereço</strong>
                    </header>

                    <div className="fiscal-form-grid fiscal-address-grid">
                      <label className="fiscal-field-span-3 fiscal-autofill-field">
                        <span className="fiscal-field-label-row">
                          <span>CEP</span>
                          <em className={clientLookupTarget === "cep" ? "fiscal-autofill-badge fiscal-autofill-badge-loading" : "fiscal-autofill-badge"}>
                            {clientLookupTarget === "cep" ? "Buscando" : "CNPJá"}
                          </em>
                        </span>
                        <input
                          autoComplete="postal-code"
                          disabled={isSubmitting || clientLookupTarget === "cep"}
                          inputMode="numeric"
                          maxLength={9}
                          type="text"
                          value={formatCep(clientDraftFiscal.endereco.cep)}
                          onChange={(event) => {
                            clientCepChangedByUserRef.current = true;
                            setClientLookupFeedback(null);
                            setFeedback(null);
                            updateClientFiscalAddress({ cep: digitsOnly(event.currentTarget.value, 8) });
                          }}
                        />
                        {clientLookupTarget === "cep" ? (
                          <small className="fiscal-lookup-hint">Consultando CNPJá.</small>
                        ) : (
                          <small className="fiscal-lookup-muted">Preenche endereço ao completar.</small>
                        )}
                      </label>

                      <label className="fiscal-field-span-5">
                        <span>Município</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={80}
                          value={clientDraftFiscal.endereco.municipio}
                          onChange={(event) => updateClientFiscalAddress({ municipio: event.currentTarget.value })}
                        />
                      </label>

                      <label className="fiscal-field-span-2">
                        <span>UF</span>
                        <PlatformSelect
                          ariaLabel="UF do endereço"
                          disabled={isSubmitting}
                          options={ufOptions}
                          placeholder="UF"
                          value={clientDraftFiscal.endereco.uf}
                          onChange={uf => updateClientFiscalAddress({ uf })}
                        />
                      </label>

                      <label className="fiscal-field-span-2">
                        <span>Código IBGE</span>
                        <input
                          disabled={isSubmitting}
                          inputMode="numeric"
                          maxLength={7}
                          value={clientDraftFiscal.endereco.codigo_municipio}
                          onChange={(event) => updateClientFiscalAddress({ codigo_municipio: digitsOnly(event.currentTarget.value, 7) })}
                        />
                      </label>

                      <label className="fiscal-field-span-6">
                        <span>Logradouro</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={160}
                          value={clientDraftFiscal.endereco.logradouro}
                          onChange={(event) => updateClientFiscalAddress({ logradouro: event.currentTarget.value })}
                        />
                      </label>

                      <label className="fiscal-field-span-2">
                        <span>Número</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={20}
                          value={clientDraftFiscal.endereco.numero}
                          onChange={(event) => updateClientFiscalAddress({ numero: event.currentTarget.value })}
                        />
                      </label>

                      <label className="fiscal-field-span-4">
                        <span>Bairro</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={80}
                          value={clientDraftFiscal.endereco.bairro}
                          onChange={(event) => updateClientFiscalAddress({ bairro: event.currentTarget.value })}
                        />
                      </label>

                      <label className="fiscal-field-span-12">
                        <span>Complemento</span>
                        <input
                          disabled={isSubmitting}
                          maxLength={80}
                          value={clientDraftFiscal.endereco.complemento}
                          onChange={(event) => updateClientFiscalAddress({ complemento: event.currentTarget.value })}
                        />
                      </label>
                    </div>
                  </section>
                </>
              )}
              <button
                className={
                  clientDraftFrontPayment
                    ? "convenio-front-payment-toggle convenio-front-payment-toggle-active"
                    : "convenio-front-payment-toggle"
                }
                type="button"
                role="switch"
                aria-checked={clientDraftFrontPayment}
                disabled={isSubmitting}
                onClick={() => setClientDraftFrontPayment(currentValue => !currentValue)}
              >
                <span className="convenio-front-payment-icon" aria-hidden="true">
                  <MonitorCheck size={15} />
                </span>
                <span className="convenio-front-payment-copy">
                  <strong>Recebimento no PDV</strong>
                  <small>Liberar recebimento no caixa?</small>
                </span>
                <span className="configuration-switch" aria-hidden="true">
                  <span />
                </span>
              </button>
            </form>
            <div
              className={
                clientModalPresence.presentValue.mode === "edit" && clientModalPresence.presentValue.cliente.ativo
                  ? "platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete convenio-client-modal-actions"
                  : "platform-modal-actions platform-item-modal-actions convenio-client-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeClientModal}>
                Cancelar
              </button>
              {clientModalPresence.presentValue.mode === "edit" && !clientModalPresence.presentValue.cliente.ativo ? (
                <button
                  className="platform-primary-button platform-save-button"
                  type="button"
                  onClick={() => void activateClientFromModal()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
                  Ativar
                </button>
              ) : clientModalPresence.presentValue.mode === "edit" ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  type="button"
                  onClick={requestDeleteClientFromModal}
                  disabled={isSubmitting}
                >
                  {clientModalPresence.presentValue.cliente.acao_remocao === "desativar" ? (
                    <Ban aria-hidden="true" size={16} />
                  ) : (
                    <Trash2 aria-hidden="true" size={16} />
                  )}
                  {clientModalPresence.presentValue.cliente.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              ) : null}
              {clientModalPresence.presentValue.mode === "edit" && !clientModalPresence.presentValue.cliente.ativo ? null : (
                <button className="platform-primary-button platform-save-button" type="submit" form="convenio-client-form" disabled={isSubmitting || Boolean(clientLookupTarget) || !canSubmitClient}>
                  {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
                  {clientModalPresence.presentValue.mode === "edit" ? "Salvar" : "Cadastrar"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {deleteClientPresence.isPresent && deleteClientPresence.presentValue ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={deleteClientPresence.state}
          {...deleteClientDismiss.backdropProps}
        >
          <section className="platform-modal platform-modal-compact" role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeDeleteClientModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head">
              <h2 id="delete-client-title">
                {deleteClientPresence.presentValue.action === "desativar" ? "Desativar cliente?" : "Excluir cliente?"}
              </h2>
              <p>
                {deleteClientPresence.presentValue.action === "desativar"
                  ? "Ele deixa de aparecer nas próximas vendas, mas segue nos registros já lançados."
                  : "Sem registros vinculados, esse cadastro será removido definitivamente."}
              </p>
            </header>
            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}
            <div className="platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete convenio-confirm-actions">
              <button className="platform-secondary-button" type="button" onClick={closeDeleteClientModal}>
                Cancelar
              </button>
              <button className="fiscal-danger-button fiscal-edit-delete-button" type="button" onClick={() => void confirmDeleteClient()} disabled={isSubmitting}>
                {deleteClientPresence.presentValue.action === "desativar" ? (
                  <Ban aria-hidden="true" size={16} />
                ) : (
                  <Trash2 aria-hidden="true" size={16} />
                )}
                {deleteClientPresence.presentValue.action === "desativar" ? "Desativar" : "Excluir"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {chargePresence.isPresent && chargePresence.presentValue ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={chargePresence.state}
          {...chargeDismiss.backdropProps}
        >
          <section className="platform-modal convenio-charge-modal" role="dialog" aria-modal="true" aria-labelledby="convenio-charge-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeChargeModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head convenio-charge-modal-head">
              <h2 id="convenio-charge-title">
                {chargeStep === "notas" ? "Cobrar convênio" : "Forma de pagamento"}
              </h2>
              <p>{chargePresence.presentValue.clienteNome}</p>
            </header>
            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}

            <div className="convenio-charge-stage" data-charge-step={chargeStep}>
              {chargeStep === "notas" ? (
                <>
                  <div className="convenio-charge-stage-head">
                    <h3>Selecione as notas</h3>
                    <p>Marque o que será cobrado agora.</p>
                  </div>

                  {pendingChargeReceipts.length > 0 ? (
                    <div className="convenio-charge-section">
                      <div className="convenio-charge-section-head">
                        <strong>Notas em aberto</strong>
                        <button className="convenio-charge-select-all" type="button" onClick={toggleAllPendingChargeReceipts}>
                          {allPendingChargeReceiptsSelected ? (
                            <>
                              <X aria-hidden="true" size={14} />
                              Limpar seleção
                            </>
                          ) : (
                            <>
                              <Check aria-hidden="true" size={14} />
                              Selecionar todas
                            </>
                          )}
                        </button>
                      </div>

                      <div className="convenio-charge-note-list">
                        {pendingChargeReceipts.map((recebimento) => {
                          const isSelected = selectedChargeReceiptIds.includes(recebimento.id);
                          const isExpanded = expandedChargeReceiptId === recebimento.id;

                          return (
                            <div
                              className={
                                isSelected
                                  ? "convenio-charge-note convenio-charge-note-selected"
                                  : "convenio-charge-note"
                              }
                              key={recebimento.id}
                            >
                              <button
                                className="convenio-charge-note-main"
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => toggleChargeReceipt(recebimento.id)}
                              >
                                <span className="convenio-charge-check" aria-hidden="true">
                                  {isSelected ? <Check size={15} /> : null}
                                </span>
                                <span className="convenio-charge-note-copy">
                                  <strong>{getReceiptSaleTitle(recebimento)}</strong>
                                  <small>{getReceiptSaleSubtitle(recebimento)}</small>
                                </span>
                                <span className="convenio-charge-note-value">
                                  {formatCurrencyFromCents(recebimento.total_centavos)}
                                </span>
                              </button>
                              <button
                                className="convenio-charge-detail-button"
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedChargeReceiptId(isExpanded ? null : recebimento.id)}
                              >
                                Detalhes
                              </button>
                              {isExpanded ? (
                                <div className="convenio-charge-note-detail">
                                  <span>
                                    <small>Nota</small>
                                    <strong>{getReceiptSaleTitle(recebimento)}</strong>
                                  </span>
                                  <span>
                                    <small>Itens</small>
                                    <strong>{getRecebimentoItemLabel(recebimento.itens_count)}</strong>
                                  </span>
                                  <span>
                                    <small>Status</small>
                                    <strong>{getReceiptStatusDetail(recebimento)}</strong>
                                  </span>
                                  <span>
                                    <small>Total</small>
                                    <strong>{formatCurrencyFromCents(recebimento.total_centavos)}</strong>
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="convenio-charge-empty">
                      <ReceiptText aria-hidden="true" size={24} />
                      <strong>Nenhuma nota aberta</strong>
                      <small>Este cliente não tem valores pendentes.</small>
                    </div>
                  )}

                  {paidChargeReceipts.length > 0 ? (
                    <div className="convenio-charge-section convenio-charge-section-paid">
                      <div className="convenio-charge-section-head">
                        <strong>Notas recebidas</strong>
                        <small>{getRecebimentoNotaLabel(paidChargeReceipts.length)}</small>
                      </div>
                      <div className="convenio-charge-paid-list">
                        {paidChargeReceipts.map((recebimento) => (
                          <div className="convenio-charge-paid-row" key={recebimento.id}>
                            <span>
                              <strong>{getReceiptSaleTitle(recebimento)}</strong>
                              <small>{getReceiptStatusDetail(recebimento)}</small>
                            </span>
                            <strong>{formatCurrencyFromCents(recebimento.total_centavos)}</strong>
                            <button type="button" onClick={() => setCancelReceiptRequest(recebimento)}>
                              <RotateCcw aria-hidden="true" size={14} />
                              Cancelar
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="convenio-charge-stage-head">
                    <h3>Receber notas</h3>
                    <p>Escolha como esse valor foi pago.</p>
                  </div>

                  <div className="convenio-charge-payment-summary">
                    <span>
                      <small>Selecionado</small>
                      <strong>{getRecebimentoNotaLabel(selectedChargeReceipts.length)}</strong>
                    </span>
                    <span>
                      <small>Total</small>
                      <strong>{formatCurrencyFromCents(selectedChargeTotalCentavos)}</strong>
                    </span>
                  </div>

                  <div className="convenio-charge-selected-list" aria-label="Notas selecionadas">
                    {selectedChargeReceipts.map((recebimento) => (
                      <div className="convenio-charge-selected-row" key={recebimento.id}>
                        <span>
                          <strong>{getReceiptSaleTitle(recebimento)}</strong>
                          <small>{getRecebimentoItemLabel(recebimento.itens_count)}</small>
                        </span>
                        <strong>{formatCurrencyFromCents(recebimento.total_centavos)}</strong>
                      </div>
                    ))}
                  </div>

                  <div className="convenio-charge-payment-area">
                    <strong>Forma de pagamento</strong>
                    <div className="convenio-charge-payment-methods">
                      <button
                        className={
                          chargePaymentMethod === "dinheiro"
                            ? "convenio-charge-payment-method convenio-charge-payment-method-active"
                            : "convenio-charge-payment-method"
                        }
                        type="button"
                        aria-pressed={chargePaymentMethod === "dinheiro"}
                        onClick={() => setChargePaymentMethod("dinheiro")}
                      >
                        <Banknote aria-hidden="true" size={18} />
                        <span>
                          <strong>Dinheiro</strong>
                          <small>Recebido em espécie.</small>
                        </span>
                        <Check aria-hidden="true" size={16} />
                      </button>
                      <button
                        className={
                          chargePaymentMethod === "pix"
                            ? "convenio-charge-payment-method convenio-charge-payment-method-active"
                            : "convenio-charge-payment-method"
                        }
                        type="button"
                        aria-pressed={chargePaymentMethod === "pix"}
                        onClick={() => setChargePaymentMethod("pix")}
                      >
                        <QrCode aria-hidden="true" size={18} />
                        <span>
                          <strong>Pix</strong>
                          <small>Recebido por QR Code.</small>
                        </span>
                        <Check aria-hidden="true" size={16} />
                      </button>
                      <button
                        className={
                          chargePaymentMethod === "cartao"
                            ? "convenio-charge-payment-method convenio-charge-payment-method-active"
                            : "convenio-charge-payment-method"
                        }
                        type="button"
                        aria-pressed={chargePaymentMethod === "cartao"}
                        onClick={() => setChargePaymentMethod("cartao")}
                      >
                        <CreditCard aria-hidden="true" size={18} />
                        <span>
                          <strong>Cartão</strong>
                          <small>Recebido na maquininha.</small>
                        </span>
                        <Check aria-hidden="true" size={16} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="platform-flow-progress convenio-charge-progress" aria-label={`Etapa ${chargeStep === "notas" ? 1 : 2} de 2`}>
              {Array.from({ length: 2 }, (_, index) => (
                <span
                  className={
                    (chargeStep === "notas" && index === 0) || (chargeStep === "pagamento" && index === 1)
                      ? "platform-flow-progress-bar platform-flow-progress-bar-active"
                      : chargeStep === "pagamento" && index === 0
                        ? "platform-flow-progress-bar platform-flow-progress-bar-done"
                        : "platform-flow-progress-bar"
                  }
                  key={index}
                />
              ))}
            </div>

            <div className="platform-modal-actions platform-item-modal-actions convenio-charge-actions">
              <button
                className="platform-secondary-button"
                type="button"
                onClick={chargeStep === "notas" ? closeChargeModal : () => setChargeStep("notas")}
              >
                {chargeStep === "notas" ? "Cancelar" : "Voltar"}
              </button>
              {chargeStep === "notas" ? (
                <button
                  className="platform-primary-button"
                  type="button"
                  onClick={startChargePaymentStep}
                  disabled={selectedChargeReceipts.length === 0}
                >
                  <ArrowRight aria-hidden="true" size={16} />
                  Iniciar cobrança
                </button>
              ) : (
                <button
                  className="platform-primary-button platform-save-button"
                  type="button"
                  onClick={() => void confirmChargePayment()}
                  disabled={isSubmitting || selectedChargeReceipts.length === 0 || !chargePaymentMethod}
                >
                  {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
                  Confirmar recebimento
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {cancelReceiptPresence.isPresent && cancelReceiptPresence.presentValue ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={cancelReceiptPresence.state}
          {...cancelReceiptDismiss.backdropProps}
        >
          <section className="platform-modal platform-modal-compact" role="dialog" aria-modal="true" aria-labelledby="cancel-receipt-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeCancelReceiptModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head">
              <h2 id="cancel-receipt-title">Cancelar recebimento?</h2>
              <p>
                {cancelReceiptPresence.presentValue.cliente_nome} ·{" "}
                {formatCurrencyFromCents(cancelReceiptPresence.presentValue.total_centavos)}
              </p>
            </header>
            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}
            <div className="platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete">
              <button className="platform-secondary-button" type="button" onClick={closeCancelReceiptModal}>
                Voltar
              </button>
              <button className="fiscal-danger-button" type="button" onClick={() => void confirmCancelReceiptPayment()} disabled={isSubmitting}>
                {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
                Cancelar recebimento
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
