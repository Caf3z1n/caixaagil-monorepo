"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CreditCard,
  HandCoins,
  LoaderCircle,
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

type ClienteConvenio = {
  id: number;
  tipo_pessoa: "fisica" | "juridica";
  nome: string;
  ativo: boolean;
  permite_pagamento_frente_caixa: boolean;
  created_at: string | null;
  updated_at: string | null;
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
};

type Feedback = {
  tone: "success" | "error";
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
  return tipoPessoa === "juridica" ? "Cliente pessoa jurídica" : "Cliente pessoa física";
}

function sortClientes(clientes: ClienteConvenio[]) {
  return [...clientes].sort((left, right) => left.nome.localeCompare(right.nome, "pt-BR"));
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
  const [clientDraftName, setClientDraftName] = useState("");
  const [clientDraftFrontPayment, setClientDraftFrontPayment] = useState(false);
  const [deleteClientRequest, setDeleteClientRequest] = useState<DeleteClientState | null>(null);
  const [cancelReceiptRequest, setCancelReceiptRequest] = useState<RecebimentoConvenio | null>(null);
  const [chargeGroupKey, setChargeGroupKey] = useState<string | null>(null);
  const [chargeStep, setChargeStep] = useState<ConvenioChargeStep>("notas");
  const [selectedChargeReceiptIds, setSelectedChargeReceiptIds] = useState<string[]>([]);
  const [expandedChargeReceiptId, setExpandedChargeReceiptId] = useState<string | null>(null);
  const [chargePaymentMethod, setChargePaymentMethod] = useState<RecebimentoPaymentMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const activeProgressIndex = getFlowStepIndex(flowStep);
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;
  const SectionIcon = flowStep === "clientes" ? UsersRound : flowStep === "recebimentos" ? ReceiptText : HandCoins;
  const sectionTitle = flowStep === "clientes" ? "Clientes" : flowStep === "recebimentos" ? "Recebimentos" : "Convênios";
  const filteredClients = useMemo(() => {
    const query = normalizeSearch(clientSearch);

    if (!query) {
      return clientes;
    }

    return clientes.filter((cliente) => normalizeSearch(cliente.nome).includes(query));
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
  const clientNameConflict = useMemo(() => {
    if (!clientModal) {
      return null;
    }

    const nameKey = normalizeClientNameKey(clientDraftName);

    if (nameKey.length < 2) {
      return null;
    }

    const currentClientId = clientModal.mode === "edit" ? clientModal.cliente.id : null;

    return clientes.find((cliente) => {
      if (cliente.id === currentClientId) {
        return false;
      }

      return normalizeClientNameKey(cliente.nome) === nameKey;
    }) ?? null;
  }, [clientes, clientDraftName, clientModal]);
  const canSubmitClient = clientDraftName.trim().length >= 2 && !clientNameConflict;
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
      const result = await apiGet<ClientesResponse>("/convenios/clientes", { token });
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
      const result = await apiGet<RecebimentosResponse>("/convenios/recebimentos", { token });
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

  function openCreateClientModal() {
    setFeedback(null);
    setClientDraftName("");
    setClientDraftFrontPayment(false);
    setClientModal({ mode: "create" });
  }

  function openEditClientModal(cliente: ClienteConvenio) {
    setFeedback(null);
    setClientDraftName(cliente.nome);
    setClientDraftFrontPayment(Boolean(cliente.permite_pagamento_frente_caixa));
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
      nome: clientModal.cliente.nome
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

    const nome = clientDraftName.trim();

    if (nome.length < 2) {
      setFeedback({ tone: "error", message: "Informe o nome do cliente." });
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
        nome,
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
      await apiDelete(`/convenios/clientes/${deleteClientRequest.id}`, { token });
      setClientes((currentClientes) => currentClientes.filter((cliente) => cliente.id !== deleteClientRequest.id));
      setClientModal(null);
      setDeleteClientRequest(null);
      setFeedback({ tone: "success", message: "Cliente removido." });
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
                <p>Pessoa física.</p>
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
                  filteredClients.map((cliente) => (
                    <button
                      className="convenio-row convenio-client-row"
                      key={cliente.id}
                      type="button"
                      onClick={() => openEditClientModal(cliente)}
                    >
                      <span className="convenio-row-icon" aria-hidden="true">
                        <UserRound size={18} />
                      </span>
                      <span className="convenio-row-main">
                        <strong>{cliente.nome}</strong>
                        <small>
                          {getClienteTipoPessoaLabel(cliente.tipo_pessoa)}
                          {cliente.permite_pagamento_frente_caixa ? " · Recebe no caixa" : ""}
                        </small>
                      </span>
                      <span className="convenio-row-action" aria-hidden="true">
                        <Pencil size={15} />
                        Editar
                      </span>
                    </button>
                  ))
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
              <Link className="platform-secondary-button" href="/meu-sistema">
                <ArrowLeft aria-hidden="true" size={17} />
                Voltar
              </Link>
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
          <section className="platform-modal convenio-client-modal" role="dialog" aria-modal="true" aria-labelledby="convenio-client-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeClientModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head convenio-client-modal-head">
              <h2 id="convenio-client-title">
                {clientModalPresence.presentValue.mode === "edit" ? "Editar cliente" : "Novo cliente"}
              </h2>
              <p>Cadastro de cliente pessoa física.</p>
            </header>
            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}
            <form className="convenio-client-form" id="convenio-client-form" onSubmit={submitClient}>
              <label className="convenio-client-field">
                <span>Nome</span>
                <input
                  autoFocus
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
              <button
                className={
                  clientDraftFrontPayment
                    ? "convenio-front-payment-toggle convenio-front-payment-toggle-active"
                    : "convenio-front-payment-toggle"
                }
                type="button"
                role="switch"
                aria-checked={clientDraftFrontPayment}
                onClick={() => setClientDraftFrontPayment(currentValue => !currentValue)}
              >
                <span className="convenio-front-payment-copy">
                  <strong>Pagamento na frente de caixa</strong>
                  <small>Permite receber pendências deste cliente no PDV.</small>
                </span>
                <span className="configuration-switch" aria-hidden="true">
                  <span />
                </span>
              </button>
            </form>
            <div
              className={
                clientModalPresence.presentValue.mode === "edit"
                  ? "platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete convenio-client-modal-actions"
                  : "platform-modal-actions platform-item-modal-actions convenio-client-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeClientModal}>
                Cancelar
              </button>
              {clientModalPresence.presentValue.mode === "edit" ? (
                <button
                  className="convenio-client-remove-button"
                  type="button"
                  onClick={requestDeleteClientFromModal}
                  disabled={isSubmitting}
                >
                  <Trash2 aria-hidden="true" size={16} />
                  Remover
                </button>
              ) : null}
              <button className="platform-primary-button platform-save-button" type="submit" form="convenio-client-form" disabled={isSubmitting || !canSubmitClient}>
                {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
                {clientModalPresence.presentValue.mode === "edit" ? "Salvar" : "Cadastrar"}
              </button>
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
              <h2 id="delete-client-title">Remover cliente?</h2>
              <p>O cadastro deixa de aparecer nas próximas vendas.</p>
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
              <button className="fiscal-danger-button" type="button" onClick={() => void confirmDeleteClient()} disabled={isSubmitting}>
                <Trash2 aria-hidden="true" size={16} />
                Remover
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
