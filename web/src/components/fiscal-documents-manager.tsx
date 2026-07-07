"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  FileX2,
  LoaderCircle,
  RefreshCcw,
  ReceiptText,
  Search,
  ShieldAlert,
  X,
  XCircle
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PlatformSelect } from "@/components/platform-select";
import type { PlatformSelectOption } from "@/components/platform-select";
import { ApiError, apiGet, getApiUrl } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type FiscalDocumentStatus =
  | "rascunho"
  | "pendente"
  | "transmitindo"
  | "autorizada"
  | "contingencia"
  | "rejeitada"
  | "denegada"
  | "cancelada"
  | "inutilizada"
  | "erro_tecnico"
  | "duplicidade";

type FiscalDocumentStatusFilter = "todos" | FiscalDocumentStatus;

type FiscalFile = {
  id: number;
  nome_original: string;
  mime_type: string;
  tipo: string;
  tamanho_bytes: number;
  created_at?: string | null;
};

type FiscalEvent = {
  id: number;
  nf_id: string;
  tipo: string;
  status: FiscalDocumentStatus;
  codigo_retorno_sefaz: string | null;
  mensagem: string | null;
  arquivo_xml_id: number | null;
  arquivo_xml: FiscalFile | null;
  detalhes: Record<string, unknown>;
  ocorrido_em: string | null;
  created_at: string | null;
};

type FiscalDocument = {
  id: string;
  venda_id: string | null;
  pdv_id: number | null;
  caixa_id: string | null;
  ambiente: "homologacao" | "producao" | string;
  modelo: "55" | "65" | string;
  serie: number;
  numero: number;
  chave_acesso: string | null;
  status: FiscalDocumentStatus;
  tipo_emissao: string;
  finalidade: string;
  natureza_operacao: string;
  total_centavos: number;
  protocolo_autorizacao: string | null;
  protocolo_cancelamento: string | null;
  codigo_retorno_sefaz: string | null;
  mensagem_retorno_sefaz: string | null;
  ultimo_erro_tecnico: string | null;
  xml_enviado_arquivo_id: number | null;
  xml_autorizado_arquivo_id: number | null;
  danfe_pdf_arquivo_id: number | null;
  xml_enviado: FiscalFile | null;
  xml_autorizado: FiscalFile | null;
  danfe_pdf: FiscalFile | null;
  retorno_sefaz: Record<string, unknown>;
  eventos: Array<Record<string, unknown>>;
  historico?: FiscalEvent[];
  payload?: Record<string, unknown>;
  emitida_em: string | null;
  autorizada_em: string | null;
  cancelada_em: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FiscalDocumentListResponse = {
  items: FiscalDocument[];
  total: number;
  limit: number;
  offset: number;
};

type FiscalStatusMeta = {
  label: string;
  tone: "ok" | "warning" | "danger" | "neutral" | "info";
  icon: LucideIcon;
};

type FiscalDownloadOption = {
  key: string;
  label: string;
  description: string;
  file: FiscalFile | null;
  extension?: "xml" | "pdf";
  suffix: string;
  icon?: LucideIcon;
};

const loadBatchSize = 100;

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

const dateOnlyFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

const timeOnlyFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit"
});

const monthYearFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric"
});

const calendarWeekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function createStatusSelectLeading(icon: LucideIcon, tone: FiscalStatusMeta["tone"]) {
  const Icon = icon;

  return (
    <span className={`fiscal-status-select-icon fiscal-status-select-icon-${tone}`}>
      <Icon aria-hidden="true" size={14} />
    </span>
  );
}

const statusOptions: Array<PlatformSelectOption<FiscalDocumentStatusFilter>> = [
  { value: "todos", label: "Todos os status", leading: createStatusSelectLeading(FileText, "neutral") },
  { value: "autorizada", label: "Emitidas", leading: createStatusSelectLeading(CheckCircle2, "ok") },
  { value: "pendente", label: "Pendentes", leading: createStatusSelectLeading(Clock3, "warning") },
  { value: "transmitindo", label: "Transmitindo", leading: createStatusSelectLeading(LoaderCircle, "info") },
  { value: "contingencia", label: "Contingência", leading: createStatusSelectLeading(ShieldAlert, "warning") },
  { value: "rejeitada", label: "Rejeitadas", leading: createStatusSelectLeading(XCircle, "danger") },
  { value: "cancelada", label: "Canceladas", leading: createStatusSelectLeading(XCircle, "neutral") },
  { value: "erro_tecnico", label: "Erro técnico", leading: createStatusSelectLeading(AlertTriangle, "danger") },
  { value: "denegada", label: "Denegadas", leading: createStatusSelectLeading(XCircle, "danger") },
  { value: "inutilizada", label: "Inutilizadas", leading: createStatusSelectLeading(FileX2, "neutral") },
  { value: "duplicidade", label: "Duplicidade", leading: createStatusSelectLeading(ShieldAlert, "warning") },
  { value: "rascunho", label: "Rascunho", leading: createStatusSelectLeading(FileText, "neutral") }
];

const statusMetaByStatus: Record<FiscalDocumentStatus, FiscalStatusMeta> = {
  rascunho: { label: "Rascunho", tone: "neutral", icon: FileText },
  pendente: { label: "Pendente", tone: "warning", icon: Clock3 },
  transmitindo: { label: "Transmitindo", tone: "info", icon: LoaderCircle },
  autorizada: { label: "Emitida", tone: "ok", icon: CheckCircle2 },
  contingencia: { label: "Contingência", tone: "warning", icon: ShieldAlert },
  rejeitada: { label: "Rejeitada", tone: "danger", icon: XCircle },
  denegada: { label: "Denegada", tone: "danger", icon: XCircle },
  cancelada: { label: "Cancelada", tone: "neutral", icon: XCircle },
  inutilizada: { label: "Inutilizada", tone: "neutral", icon: FileX2 },
  erro_tecnico: { label: "Erro técnico", tone: "danger", icon: AlertTriangle },
  duplicidade: { label: "Duplicidade", tone: "warning", icon: ShieldAlert }
};

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function formatCurrencyFromCents(value: number | null | undefined) {
  const cents = Number(value ?? 0);

  return currencyFormatter.format((Number.isFinite(cents) ? cents : 0) / 100);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatDateParts(value: string | null | undefined) {
  if (!value) {
    return {
      date: "Sem data",
      time: "Sem hora"
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "Sem data",
      time: "Sem hora"
    };
  }

  return {
    date: dateOnlyFormatter.format(date),
    time: timeOnlyFormatter.format(date)
  };
}

function createLocalDate(value: string | null | undefined) {
  const [year, month, day] = String(value || "").split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateInputValue(value: string | null | undefined) {
  const date = createLocalDate(value);

  return date ? dateOnlyFormatter.format(date) : "";
}

function getDateRangeLabel(startDate: string, endDate: string) {
  if (startDate && endDate) {
    return `${formatDateInputValue(startDate)} até ${formatDateInputValue(endDate)}`;
  }

  if (startDate) {
    return `A partir de ${formatDateInputValue(startDate)}`;
  }

  if (endDate) {
    return `Até ${formatDateInputValue(endDate)}`;
  }

  return "Selecionar período";
}

function getCalendarMonthBase(value?: string) {
  const date = createLocalDate(value) ?? new Date();

  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startDate = new Date(firstDay);
  const todayValue = toDateInputValue(new Date());

  startDate.setDate(firstDay.getDate() - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    const value = toDateInputValue(date);

    return {
      date,
      value,
      isCurrentMonth: date.getMonth() === monthDate.getMonth(),
      isToday: value === todayValue
    };
  });
}

function isDateInRange(value: string, startDate: string, endDate: string) {
  return Boolean(startDate && endDate && value > startDate && value < endDate);
}

function getDocumentDate(documento: FiscalDocument) {
  return documento.autorizada_em || documento.emitida_em || documento.created_at;
}

function getFiscalModelLabel(modelo: string) {
  if (modelo === "65") {
    return "NFC-e";
  }

  if (modelo === "55") {
    return "NF-e";
  }

  return `Modelo ${modelo || "--"}`;
}

function getFiscalEnvironmentLabel(ambiente: string) {
  if (ambiente === "producao") {
    return "Produção";
  }

  if (ambiente === "homologacao") {
    return "Homologação";
  }

  return ambiente || "Não informado";
}

function formatTechnicalLabel(value: string | null | undefined) {
  const text = String(value || "").trim();

  if (!text) {
    return "Não informado";
  }

  return text
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\w/, firstLetter => firstLetter.toUpperCase());
}

function isContingencyEmission(tipoEmissao: string | null | undefined) {
  const normalized = String(tipoEmissao || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return normalized.includes("contingencia");
}

function getFiscalDocumentTitle(documento: FiscalDocument) {
  return `${getFiscalModelLabel(documento.modelo)} ${documento.serie}/${documento.numero}`;
}

function getStatusMeta(status: FiscalDocumentStatus, tipoEmissao?: string | null): FiscalStatusMeta {
  if (status === "autorizada" && isContingencyEmission(tipoEmissao)) {
    return {
      label: "Contingência autorizada",
      tone: "ok",
      icon: CheckCircle2
    };
  }

  return statusMetaByStatus[status] ?? {
    label: formatTechnicalLabel(status),
    tone: "neutral",
    icon: FileText
  };
}

function isTerminalFiscalStatus(status: FiscalDocumentStatus | string | null | undefined) {
  return status === "cancelada" || status === "inutilizada";
}

function getFiscalEventXmlLabel(evento: FiscalEvent) {
  const normalized = `${evento.tipo} ${evento.status}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("cancel")) {
    return {
      label: "XML de cancelamento",
      suffix: "cancelamento",
      description: "Evento de cancelamento homologado na SEFAZ"
    };
  }

  if (normalized.includes("inutil")) {
    return {
      label: "XML de inutilização",
      suffix: "inutilizacao",
      description: "Evento de inutilização homologado na SEFAZ"
    };
  }

  return {
    label: `XML de ${formatTechnicalLabel(evento.tipo).toLowerCase()}`,
    suffix: evento.tipo || "evento",
    description: "Evento fiscal sincronizado"
  };
}

function getFiscalEventXmlOptions(documento: FiscalDocument): FiscalDownloadOption[] {
  return (documento.historico ?? [])
    .filter((evento) => evento.arquivo_xml)
    .map((evento) => {
      const meta = getFiscalEventXmlLabel(evento);

      return {
        key: `evento-${evento.id}`,
        label: meta.label,
        description: meta.description,
        file: evento.arquivo_xml,
        suffix: meta.suffix
      };
    });
}

function dedupeDownloadOptions(options: FiscalDownloadOption[]) {
  const seenFileIds = new Set<number>();
  const dedupedOptions: FiscalDownloadOption[] = [];

  for (const option of options) {
    const fileId = option.file?.id;

    if (fileId && seenFileIds.has(fileId)) {
      continue;
    }

    if (fileId) {
      seenFileIds.add(fileId);
    }

    dedupedOptions.push(option);
  }

  return dedupedOptions;
}

function getXmlDownloadOptions(documento: FiscalDocument): FiscalDownloadOption[] {
  const sentFileId = documento.xml_enviado?.id ?? null;
  const authorizedFileId = documento.xml_autorizado?.id ?? null;
  const options: FiscalDownloadOption[] = [
    {
      key: "autorizado",
      label: "XML autorizado",
      description: "Documento fiscal autorizado pela SEFAZ",
      file: documento.xml_autorizado,
      suffix: "autorizado"
    }
  ];

  if (sentFileId && sentFileId !== authorizedFileId) {
    options.push({
      key: "enviado",
      label: "XML enviado",
      description: "XML transmitido antes do retorno final",
      file: documento.xml_enviado,
      suffix: "enviado"
    });
  }

  const eventOptions = getFiscalEventXmlOptions(documento);
  const orderedOptions = isTerminalFiscalStatus(documento.status)
    ? [...eventOptions, ...options]
    : [...options, ...eventOptions];

  return dedupeDownloadOptions(orderedOptions);
}

function getPrimaryXmlDownloadOption(documento: FiscalDocument) {
  return getXmlDownloadOptions(documento).find((option) => option.file) ?? null;
}

function getDownloadKey(documento: FiscalDocument, file: FiscalFile | null | undefined) {
  return file ? `${documento.id}:${file.id}` : "";
}

function buildFallbackFileName(documento: FiscalDocument, extension: "xml" | "pdf", suffix?: string) {
  const model = getFiscalModelLabel(documento.modelo).replace(/[^A-Za-z0-9-]/g, "").toLowerCase();
  const number = String(documento.numero || "sem-numero").padStart(6, "0");
  const fileSuffix = suffix ? `-${suffix}` : "";

  return `${model}-serie-${documento.serie}-${number}${fileSuffix}.${extension}`;
}

function getDownloadFileNameFromResponse(response: Response, fallbackName: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  const encodedName = utf8Match?.[1] || plainMatch?.[1] || "";

  if (!encodedName) {
    return fallbackName;
  }

  try {
    return decodeURIComponent(encodedName);
  } catch {
    return encodedName;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getRecordString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return "";
}

function getRecordNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (value === null || value === undefined || value === "") {
      continue;
    }

    const numberValue = Number(value);

    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function getPayloadItems(payload: Record<string, unknown> | undefined) {
  const directItems = payload?.itens;

  if (Array.isArray(directItems)) {
    return directItems.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  const sale = asRecord(payload?.venda);
  const saleItems = sale?.itens || sale?.items;

  if (Array.isArray(saleItems)) {
    return saleItems.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item));
  }

  return [];
}

function FiscalStatusBadge({ status, tipoEmissao }: { status: FiscalDocumentStatus; tipoEmissao?: string | null }) {
  const meta = getStatusMeta(status, tipoEmissao);
  const Icon = meta.icon;

  return (
    <span className={`fiscal-document-status fiscal-document-status-${meta.tone}`}>
      <Icon aria-hidden="true" className={status === "transmitindo" ? "platform-spin" : undefined} size={14} />
      {meta.label}
    </span>
  );
}

function FeedbackMessage({ message, tone = "error" }: { message: string; tone?: "error" | "warning" }) {
  return (
    <div className={`auth-feedback auth-feedback-${tone} fiscal-documents-feedback`} role="alert">
      <span className="auth-feedback-marker" aria-hidden="true" />
      <span className="auth-feedback-copy">{message}</span>
    </div>
  );
}

function FileDownloadButton({
  documento,
  file,
  label,
  icon: Icon = Download,
  extension = "xml",
  suffix,
  isDownloading,
  onDownload
}: {
  documento: FiscalDocument;
  file: FiscalFile | null;
  label: string;
  icon?: LucideIcon;
  extension?: "xml" | "pdf";
  suffix?: string;
  isDownloading: boolean;
  onDownload: (documento: FiscalDocument, file: FiscalFile, fallbackName: string) => void;
}) {
  if (!file) {
    return (
      <button className="fiscal-document-download-button fiscal-document-download-button-disabled" type="button" disabled>
        <FileX2 aria-hidden="true" size={15} />
        Sem XML
      </button>
    );
  }

  return (
    <button
      className="fiscal-document-download-button"
      type="button"
      disabled={isDownloading}
      onClick={(event) => {
        event.stopPropagation();
        onDownload(documento, file, buildFallbackFileName(documento, extension, suffix));
      }}
    >
      {isDownloading ? <LoaderCircle aria-hidden="true" className="platform-spin" size={15} /> : <Icon aria-hidden="true" size={15} />}
      {label}
    </button>
  );
}

function FiscalFileListItem({
  documento,
  option,
  isDownloading,
  onDownload
}: {
  documento: FiscalDocument;
  option: FiscalDownloadOption;
  isDownloading: boolean;
  onDownload: (documento: FiscalDocument, file: FiscalFile, fallbackName: string) => void;
}) {
  const Icon = option.icon ?? Download;
  const extension = option.extension ?? "xml";
  const file = option.file;

  if (!file) {
    return null;
  }

  return (
    <button
      className="fiscal-document-file-item"
      type="button"
      disabled={isDownloading}
      onClick={() => onDownload(documento, file, buildFallbackFileName(documento, extension, option.suffix))}
    >
      <span className="fiscal-document-file-item-icon" aria-hidden="true">
        {isDownloading ? <LoaderCircle className="platform-spin" size={17} /> : <Icon size={17} />}
      </span>
      <span className="fiscal-document-file-item-copy">
        <strong>{option.label}</strong>
        <em>{option.description}</em>
      </span>
    </button>
  );
}

function FiscalDocumentRow({
  documento,
  downloadingFileKey,
  onDownload,
  onOpen
}: {
  documento: FiscalDocument;
  downloadingFileKey: string | null;
  onDownload: (documento: FiscalDocument, file: FiscalFile, fallbackName: string) => void;
  onOpen: (documentId: string) => void;
}) {
  const primaryXmlOption = getPrimaryXmlDownloadOption(documento);
  const primaryXmlFile = primaryXmlOption?.file ?? null;
  const dateParts = formatDateParts(getDocumentDate(documento));
  const documentTitle = getFiscalDocumentTitle(documento);
  const dateMeta = dateParts.date === "Sem data"
    ? dateParts.date
    : `${dateParts.date} ${dateParts.time === "Sem hora" ? "" : dateParts.time}`.trim();

  return (
    <article
      className="fiscal-document-row"
      role="button"
      tabIndex={0}
      aria-label={`Ver detalhes de ${documentTitle}`}
      onClick={() => onOpen(documento.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(documento.id);
        }
      }}
    >
      <span className="fiscal-document-icon" aria-hidden="true">
        <ReceiptText size={18} />
      </span>

      <span className="fiscal-document-main">
        <strong>{documentTitle}</strong>
        <small>
          <span>{getFiscalEnvironmentLabel(documento.ambiente)}</span>
          <span className="fiscal-document-row-date">{dateMeta}</span>
        </small>
      </span>

      <FiscalStatusBadge status={documento.status} tipoEmissao={documento.tipo_emissao} />

      <span className="fiscal-document-total">
        <small>Total</small>
        <strong>{formatCurrencyFromCents(documento.total_centavos)}</strong>
      </span>

      <span className="fiscal-document-row-actions">
        <span className="fiscal-document-xml-action" onClick={(event) => event.stopPropagation()}>
          <FileDownloadButton
            documento={documento}
            file={primaryXmlFile}
            label="XML"
            isDownloading={downloadingFileKey === getDownloadKey(documento, primaryXmlFile)}
            onDownload={onDownload}
            suffix={primaryXmlOption?.suffix}
          />
        </span>

        <span className="fiscal-document-detail-button" aria-hidden="true">
          <Eye aria-hidden="true" size={15} />
          Ver detalhes
        </span>
      </span>
    </article>
  );
}

function FiscalDocumentRowSkeleton() {
  return (
    <div className="fiscal-document-row fiscal-document-row-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyState({
  hasActiveFilters
}: {
  hasActiveFilters: boolean;
}) {
  return (
    <div className="fiscal-documents-empty">
      <ReceiptText aria-hidden="true" size={24} />
      <strong>{hasActiveFilters ? "Nenhuma nota encontrada" : "Nenhuma nota fiscal sincronizada"}</strong>
      <p>
        {hasActiveFilters
          ? "Ajuste a busca, o status ou o período para consultar outros documentos."
          : "As notas emitidas pelo PDV aparecem aqui após a sincronização fiscal."}
      </p>
    </div>
  );
}

function FiscalDocumentModalSkeleton() {
  return (
    <div className="fiscal-document-modal-skeleton" aria-live="polite">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function getPayloadItemPreview(item: Record<string, unknown>, index: number) {
  const name = getRecordString(item, ["nome", "name", "descricao", "produto_nome"]) || `Item ${index + 1}`;
  const quantity = getRecordNumber(item, ["quantidade", "quantity", "qtd"]) ?? 1;
  const directTotalCents = getRecordNumber(item, [
    "total_centavos",
    "totalCents",
    "totalPriceCents",
    "total_price_cents",
    "valor_total_centavos",
    "valorTotalCentavos"
  ]);
  const unitPriceCents = getRecordNumber(item, [
    "preco_unitario_centavos",
    "priceCents",
    "preco_venda_centavos",
    "valor_unitario_centavos",
    "unitPriceCents"
  ]);
  const totalCents = directTotalCents ?? (unitPriceCents === null ? null : Math.round(unitPriceCents * quantity));

  return {
    name,
    quantity,
    totalLabel: totalCents === null ? "--" : formatCurrencyFromCents(totalCents)
  };
}

function FiscalDocumentPreview({
  documento,
  payloadItems
}: {
  documento: FiscalDocument;
  payloadItems: Record<string, unknown>[];
}) {
  const dateParts = formatDateParts(getDocumentDate(documento));
  const dateLabel = dateParts.date === "Sem data"
    ? "Sem data"
    : `${dateParts.date} ${dateParts.time === "Sem hora" ? "" : dateParts.time}`.trim();
  const previewItems = payloadItems.map(getPayloadItemPreview);

  return (
    <section className="fiscal-document-preview" aria-label="Visualização da nota fiscal">
      <header className="fiscal-document-preview-head">
        <span>
          <ReceiptText aria-hidden="true" size={19} />
          <span>
            <strong>{getFiscalDocumentTitle(documento)}</strong>
            <em>{getFiscalEnvironmentLabel(documento.ambiente)} · {dateLabel}</em>
          </span>
        </span>

        <FiscalStatusBadge status={documento.status} tipoEmissao={documento.tipo_emissao} />
      </header>

      <div className="fiscal-document-preview-grid">
        <span>
          <em>Natureza</em>
          <strong>{documento.natureza_operacao || "Venda"}</strong>
        </span>
        <span>
          <em>Protocolo</em>
          <strong className="fiscal-document-mono">{documento.protocolo_autorizacao || "Não informado"}</strong>
        </span>
        <span>
          <em>Chave</em>
          <strong className="fiscal-document-mono">{documento.chave_acesso || "Não informada"}</strong>
        </span>
      </div>

      <div className="fiscal-document-preview-items">
        <div className="fiscal-document-preview-items-head">
          <span>Descrição</span>
          <span>Qtd.</span>
          <span>Total</span>
        </div>

        {previewItems.length > 0 ? (
          previewItems.map((item, index) => (
            <div className="fiscal-document-preview-item" key={`${item.name}-${index}`}>
              <strong>{item.name}</strong>
              <span>{item.quantity}</span>
              <strong>{item.totalLabel}</strong>
            </div>
          ))
        ) : (
          <div className="fiscal-document-preview-empty">Itens não enviados no payload sincronizado.</div>
        )}
      </div>

      <footer className="fiscal-document-preview-total">
        <span>Total da NF</span>
        <strong>{formatCurrencyFromCents(documento.total_centavos)}</strong>
      </footer>
    </section>
  );
}

function FiscalDocumentDetails({
  documento,
  downloadingFileKey,
  downloadError,
  onDownload
}: {
  documento: FiscalDocument;
  downloadingFileKey: string | null;
  downloadError: string | null;
  onDownload: (documento: FiscalDocument, file: FiscalFile, fallbackName: string) => void;
}) {
  const xmlOptions = getXmlDownloadOptions(documento);
  const fileOptions: FiscalDownloadOption[] = [
    ...xmlOptions.filter((option) => option.file),
    ...(documento.danfe_pdf
      ? [
          {
            key: "danfe",
            label: "DANFE PDF",
            description: "Representação impressa da nota fiscal",
            file: documento.danfe_pdf,
            extension: "pdf" as const,
            suffix: "danfe",
            icon: FileText
          }
        ]
      : [])
  ];
  const payloadItems = getPayloadItems(documento.payload);
  const returnMessage = documento.mensagem_retorno_sefaz || documento.ultimo_erro_tecnico;

  return (
    <div className="fiscal-document-modal-body">
      {downloadError ? <FeedbackMessage message={downloadError} /> : null}

      <FiscalDocumentPreview documento={documento} payloadItems={payloadItems} />

      <section className="fiscal-document-file-strip" aria-label="Arquivos da nota fiscal">
        <div>
          <strong>Arquivos fiscais</strong>
          <span>{fileOptions.length > 0 ? "XMLs e documentos disponíveis para download" : "XML ainda não vinculado"}</span>
        </div>

        {fileOptions.length > 0 ? (
          <div className="fiscal-document-file-list">
            {fileOptions.map((option) => (
              <FiscalFileListItem
                documento={documento}
                isDownloading={downloadingFileKey === getDownloadKey(documento, option.file)}
                key={option.key}
                onDownload={onDownload}
                option={option}
              />
            ))}
          </div>
        ) : (
          <div className="fiscal-document-file-empty">
            <FileX2 aria-hidden="true" size={17} />
            <span>Nenhum XML fiscal sincronizado.</span>
          </div>
        )}
      </section>

      {returnMessage || documento.codigo_retorno_sefaz ? (
        <section className="fiscal-document-return-panel" aria-label="Retorno da SEFAZ">
          <span>
            <strong>Retorno SEFAZ</strong>
            <em>{documento.codigo_retorno_sefaz ? `Código ${documento.codigo_retorno_sefaz}` : "Sem código"}</em>
          </span>
          {returnMessage ? <p>{returnMessage}</p> : null}
        </section>
      ) : null}

      <section className="fiscal-document-history-panel" aria-label="Histórico da nota fiscal">
        <header>
          <strong>Histórico</strong>
          <span>{documento.historico?.length ?? 0} evento{documento.historico?.length === 1 ? "" : "s"}</span>
        </header>

        {documento.historico && documento.historico.length > 0 ? (
          <div className="fiscal-document-history-list">
            {documento.historico.slice(0, 10).map(evento => (
              <div className="fiscal-document-history-row" key={evento.id}>
                <span className="fiscal-document-history-dot" aria-hidden="true" />
                <span>
                  <strong>{formatTechnicalLabel(evento.tipo)}</strong>
                  <em>{formatDateTime(evento.ocorrido_em || evento.created_at)}</em>
                  {evento.mensagem ? <p>{evento.mensagem}</p> : null}
                </span>
                <FiscalStatusBadge status={evento.status} />
              </div>
            ))}
          </div>
        ) : (
          <div className="fiscal-document-history-empty">
            <Clock3 aria-hidden="true" size={18} />
            <span>Sem histórico sincronizado.</span>
          </div>
        )}
      </section>
    </div>
  );
}

export function FiscalDocumentsManager() {
  const [documents, setDocuments] = useState<FiscalDocument[]>([]);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [pageOffset, setPageOffset] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<FiscalDocumentStatusFilter>("todos");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [hoveredDate, setHoveredDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => getCalendarMonthBase());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [details, setDetails] = useState<FiscalDocument | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [downloadingFileKey, setDownloadingFileKey] = useState<string | null>(null);
  const [bulkDownloadKind, setBulkDownloadKind] = useState<"xmls" | "reports" | null>(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLSpanElement | null>(null);
  const deferredSearchValue = useDeferredValue(searchValue);
  const normalizedSearchValue = deferredSearchValue.trim();
  const modalPresence = useModalPresence(selectedDocumentId);
  const visibleDocumentId = typeof modalPresence.presentValue === "string" ? modalPresence.presentValue : null;
  const visibleDocument = visibleDocumentId
    ? details?.id === visibleDocumentId
      ? details
      : documents.find(documento => documento.id === visibleDocumentId) ?? null
    : null;
  const hasInvalidDateRange = Boolean(startDate && endDate && startDate > endDate);
  const hasActiveFilters = Boolean(searchValue.trim() || statusFilter !== "todos" || startDate || endDate);
  const calendarDays = getCalendarDays(calendarMonth);
  const dateRangeLabel = getDateRangeLabel(startDate, endDate);
  const loadedDocumentsCount = documents.length;
  const hasMoreDocuments = loadedDocumentsCount < totalDocuments;
  const isInitialLoading = isLoading && documents.length === 0;
  const previewEndDate = startDate && !endDate ? hoveredDate : "";
  const previewRangeStartDate = previewEndDate && previewEndDate < startDate ? previewEndDate : startDate;
  const previewRangeEndDate = previewEndDate && previewEndDate < startDate ? startDate : endDate || previewEndDate;
  const isPreviewingDateRange = Boolean(startDate && !endDate && hoveredDate);

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();

    if (normalizedSearchValue) {
      params.set("q", normalizedSearchValue);
    }

    if (statusFilter !== "todos") {
      params.set("status", statusFilter);
    }

    if (startDate) {
      params.set("data_inicio", startDate);
    }

    if (endDate) {
      params.set("data_fim", endDate);
    }

    return params;
  }, [endDate, normalizedSearchValue, startDate, statusFilter]);

  const closeModal = useCallback(() => {
    setSelectedDocumentId(null);
  }, []);
  const modalDismiss = useModalDismiss(modalPresence.isPresent, closeModal);

  usePlatformModalScrollLock(modalPresence.isPresent);

  useEffect(() => {
    if (!isDatePickerOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (target instanceof Node && datePickerRef.current && !datePickerRef.current.contains(target)) {
        setIsDatePickerOpen(false);
        setHoveredDate("");
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDatePickerOpen(false);
        setHoveredDate("");
      }
    }

    window.document.addEventListener("pointerdown", handlePointerDown);
    window.document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.document.removeEventListener("pointerdown", handlePointerDown);
      window.document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDatePickerOpen]);

  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;

    if (!sentinel || !hasMoreDocuments || isLoading || hasInvalidDateRange || loadError) {
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) {
          return;
        }

        setPageOffset(currentOffset => Math.min(currentOffset + loadBatchSize, totalDocuments));
      },
      {
        root: null,
        rootMargin: "260px 0px",
        threshold: 0
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, [hasInvalidDateRange, hasMoreDocuments, isLoading, loadError, totalDocuments]);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLoadError("Sessão expirada. Entre novamente para consultar documentos fiscais.");
      setIsLoading(false);
      return;
    }

    if (hasInvalidDateRange) {
      setDocuments([]);
      setTotalDocuments(0);
      setLoadError("A data inicial precisa ser anterior à data final.");
      setIsLoading(false);
      return;
    }

    async function loadDocuments() {
      setIsLoading(true);

      try {
        const params = buildFilterParams();
        params.set("limit", String(loadBatchSize));
        params.set("offset", String(pageOffset));

        const result = await apiGet<FiscalDocumentListResponse>(`/nf?${params.toString()}`, { cacheTtlMs: 30_000, token });

        if (!cancelled) {
          const nextItems = Array.isArray(result.items) ? result.items : [];

          if (pageOffset === 0) {
            setDocuments(nextItems);
          } else {
            setDocuments(currentItems => {
              const existingIds = new Set(currentItems.map(documento => documento.id));
              const appendedItems = nextItems.filter(documento => !existingIds.has(documento.id));

              return [...currentItems, ...appendedItems];
            });
          }

          setTotalDocuments(Number(result.total || 0));
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getErrorMessage(error, "Não foi possível carregar os documentos fiscais."));
          setDocuments([]);
          setTotalDocuments(0);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [buildFilterParams, hasInvalidDateRange, pageOffset, refreshNonce]);

  useEffect(() => {
    if (!selectedDocumentId) {
      return;
    }

    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    setDownloadError(null);
    setDetails(null);
    setDetailsError(null);
    setIsLoadingDetails(true);

    if (!token) {
      setDetailsError("Sessão expirada. Entre novamente para abrir os detalhes da NF.");
      setIsLoadingDetails(false);
      return;
    }

    async function loadDetails() {
      try {
        const result = await apiGet<FiscalDocument>(`/nf/${selectedDocumentId}`, { token });

        if (!cancelled) {
          setDetails(result);
        }
      } catch (error) {
        if (!cancelled) {
          setDetailsError(getErrorMessage(error, "Não foi possível abrir os detalhes da NF."));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDetails(false);
        }
      }
    }

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedDocumentId]);

  const downloadFile = useCallback(async (documento: FiscalDocument, file: FiscalFile, fallbackName: string) => {
    const token = getStoredPlatformAuthToken();
    const key = getDownloadKey(documento, file);

    if (!token) {
      setDownloadError("Sessão expirada. Entre novamente para baixar o arquivo.");
      return;
    }

    setDownloadError(null);
    setDownloadingFileKey(key);

    try {
      const response = await fetch(getApiUrl(`/arquivos/${file.id}`), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = "Não foi possível baixar o arquivo.";

        try {
          const parsed = JSON.parse(text) as { message?: string };
          message = parsed.message || message;
        } catch {
          message = text || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = file.nome_original || fallbackName;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(getErrorMessage(error, "Não foi possível baixar o arquivo."));
    } finally {
      setDownloadingFileKey(null);
    }
  }, []);

  const downloadFilteredPackage = useCallback(async (kind: "xmls" | "reports") => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setDownloadError("Sessão expirada. Entre novamente para baixar os arquivos.");
      return;
    }

    const endpoint = kind === "xmls" ? "/nf/download/xmls" : "/nf/download/relatorios";
    const fallbackName = kind === "xmls" ? "documentos-fiscais-filtrados.zip" : "relatorios-fiscais.zip";
    const params = buildFilterParams();

    setDownloadError(null);
    setBulkDownloadKind(kind);

    try {
      const queryString = params.toString();
      const response = await fetch(getApiUrl(`${endpoint}${queryString ? `?${queryString}` : ""}`), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        let message = kind === "xmls"
          ? "Não foi possível baixar os documentos fiscais filtrados."
          : "Não foi possível baixar os relatórios fiscais.";

        try {
          const parsed = JSON.parse(text) as { message?: string };
          message = parsed.message || message;
        } catch {
          message = text || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");

      anchor.href = objectUrl;
      anchor.download = getDownloadFileNameFromResponse(response, fallbackName);
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(getErrorMessage(
        error,
        kind === "xmls"
          ? "Não foi possível baixar os documentos fiscais filtrados."
          : "Não foi possível baixar os relatórios fiscais."
      ));
    } finally {
      setBulkDownloadKind(null);
    }
  }, [buildFilterParams]);

  function handleSearchChange(value: string) {
    setSearchValue(value);
    setPageOffset(0);
    setDocuments([]);
  }

  function handleStatusChange(value: FiscalDocumentStatusFilter) {
    setStatusFilter(value);
    setPageOffset(0);
    setDocuments([]);
  }

  function handleDateRangeChange(nextStartDate: string, nextEndDate: string) {
    setStartDate(nextStartDate);
    setEndDate(nextEndDate);
    setPageOffset(0);
    setDocuments([]);
  }

  function handleDateSelection(value: string) {
    if (!startDate || endDate) {
      handleDateRangeChange(value, "");
      setHoveredDate("");
      return;
    }

    if (value < startDate) {
      handleDateRangeChange(value, startDate);
    } else {
      handleDateRangeChange(startDate, value);
    }

    setHoveredDate("");
    setIsDatePickerOpen(false);
  }

  function clearDateRange() {
    handleDateRangeChange("", "");
    setHoveredDate("");
    setCalendarMonth(getCalendarMonthBase());
  }

  function selectToday() {
    const todayValue = toDateInputValue(new Date());

    handleDateRangeChange(todayValue, todayValue);
    setCalendarMonth(getCalendarMonthBase(todayValue));
    setHoveredDate("");
    setIsDatePickerOpen(false);
  }

  function openDocument(documentId: string) {
    setSelectedDocumentId(documentId);
  }

  return (
    <main className="platform-flow-page fiscal-documents-flow-page">
      <div className="platform-flow-shell fiscal-documents-flow-shell">
        <div className="platform-flow-section-title" aria-label="Documentos fiscais">
          <span className="platform-flow-section-main">
            <ReceiptText size={24} aria-hidden="true" />
            <strong>Documentos fiscais</strong>
          </span>
        </div>

        <section className="platform-flow-card fiscal-documents-flow-card" aria-label="Lista de documentos fiscais">
          <div className="platform-flow-panel fiscal-documents-flow-panel">
            <header className="platform-flow-head fiscal-documents-flow-head">
              <h1>Notas fiscais</h1>
              <p>Consulte as NF-e e NFC-e emitidas, acompanhe o status e baixe os XMLs sincronizados.</p>
            </header>

            <div className="fiscal-documents-toolbar">
              <label className="fiscal-documents-search">
                <Search aria-hidden="true" size={17} />
                <input
                  value={searchValue}
                  onChange={event => handleSearchChange(event.target.value)}
                  placeholder="Buscar por número ou protocolo"
                />
                {searchValue ? (
                  <button type="button" aria-label="Limpar busca" onClick={() => handleSearchChange("")}>
                    <X aria-hidden="true" size={15} />
                  </button>
                ) : null}
              </label>

              <PlatformSelect
                ariaLabel="Filtrar documentos fiscais por status"
                className="fiscal-documents-status-select"
                options={statusOptions}
                value={statusFilter}
                onChange={handleStatusChange}
              />

              <div className="fiscal-documents-date-filter" ref={datePickerRef}>
                <div className="fiscal-documents-date-range-shell">
                  <button
                    className="fiscal-documents-date-range-control"
                    type="button"
                    aria-expanded={isDatePickerOpen}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setCalendarMonth(getCalendarMonthBase(startDate || endDate));
                      setHoveredDate("");
                      setIsDatePickerOpen(current => !current);
                    }}
                  >
                    <CalendarRange aria-hidden="true" size={17} />
                    <span>{dateRangeLabel}</span>
                  </button>

                  {startDate || endDate ? (
                    <button
                      aria-label="Limpar período"
                      className="fiscal-documents-date-clear"
                      type="button"
                      onClick={clearDateRange}
                    >
                      <X aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>

                {isDatePickerOpen ? (
                  <div className="fiscal-documents-date-popover" role="dialog" aria-label="Selecionar período">
                    <div className="fiscal-documents-date-popover-head">
                      <button
                        type="button"
                        aria-label="Mês anterior"
                        onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                      >
                        <ChevronLeft aria-hidden="true" size={16} />
                      </button>
                      <strong>{monthYearFormatter.format(calendarMonth)}</strong>
                      <button
                        type="button"
                        aria-label="Próximo mês"
                        onClick={() => setCalendarMonth(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                      >
                        <ChevronRight aria-hidden="true" size={16} />
                      </button>
                    </div>

                    <div className="fiscal-documents-calendar" role="grid" onMouseLeave={() => setHoveredDate("")}>
                      {calendarWeekdays.map(day => (
                        <span key={day}>{day}</span>
                      ))}

                      {calendarDays.map(day => {
                        const isStart = Boolean(previewRangeStartDate && day.value === previewRangeStartDate);
                        const isEnd = Boolean(previewRangeEndDate && day.value === previewRangeEndDate && previewRangeEndDate !== previewRangeStartDate);
                        const isInRange = isDateInRange(day.value, previewRangeStartDate, previewRangeEndDate);
                        const isPreview = isPreviewingDateRange && (isStart || isEnd || isInRange);

                        return (
                          <button
                            className={[
                              !day.isCurrentMonth ? "is-outside" : "",
                              day.isToday ? "is-today" : "",
                              isStart ? "is-start" : "",
                              isEnd ? "is-end" : "",
                              isInRange ? "is-in-range" : "",
                              isPreview ? "is-preview" : ""
                            ].filter(Boolean).join(" ")}
                            key={day.value}
                            type="button"
                            aria-pressed={day.value === startDate || day.value === endDate}
                            onFocus={() => {
                              if (startDate && !endDate) {
                                setHoveredDate(day.value);
                              }
                            }}
                            onMouseEnter={() => {
                              if (startDate && !endDate) {
                                setHoveredDate(day.value);
                              }
                            }}
                            onClick={() => handleDateSelection(day.value)}
                          >
                            {day.date.getDate()}
                          </button>
                        );
                      })}
                    </div>

                    <div className="fiscal-documents-date-popover-actions">
                      <button type="button" onClick={selectToday}>Hoje</button>
                      <button type="button" disabled={!startDate && !endDate} onClick={clearDateRange}>
                        Limpar período
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="fiscal-documents-export-actions" aria-label="Downloads dos documentos fiscais filtrados">
              <button
                className="platform-secondary-button"
                type="button"
                disabled={Boolean(bulkDownloadKind) || hasInvalidDateRange}
                onClick={() => void downloadFilteredPackage("xmls")}
              >
                {bulkDownloadKind === "xmls" ? (
                  <LoaderCircle aria-hidden="true" className="platform-spin" size={16} />
                ) : (
                  <Download aria-hidden="true" size={16} />
                )}
                Baixar XMLs filtrados
              </button>

              <button
                className="platform-primary-button fiscal-documents-report-button"
                type="button"
                disabled={Boolean(bulkDownloadKind) || hasInvalidDateRange}
                onClick={() => void downloadFilteredPackage("reports")}
              >
                {bulkDownloadKind === "reports" ? (
                  <LoaderCircle aria-hidden="true" className="platform-spin" size={16} />
                ) : (
                  <FileText aria-hidden="true" size={16} />
                )}
                Baixar relatórios
              </button>
            </div>

            {loadError ? <FeedbackMessage message={loadError} tone={hasInvalidDateRange ? "warning" : "error"} /> : null}
            {downloadError && !modalPresence.isPresent ? <FeedbackMessage message={downloadError} /> : null}

            <section className="fiscal-documents-panel">
              <header className="fiscal-documents-list-head">
                <strong>Lista de NF</strong>
                <span>{totalDocuments} registro{totalDocuments === 1 ? "" : "s"}</span>
              </header>

              <div className="fiscal-documents-list" aria-live="polite">
                {isInitialLoading ? (
                  Array.from({ length: 5 }, (_, index) => (
                    <FiscalDocumentRowSkeleton key={index} />
                  ))
                ) : documents.length === 0 ? (
                  <EmptyState hasActiveFilters={hasActiveFilters} />
                ) : (
                  documents.map(documento => (
                    <FiscalDocumentRow
                      documento={documento}
                      downloadingFileKey={downloadingFileKey}
                      key={documento.id}
                      onDownload={downloadFile}
                      onOpen={openDocument}
                    />
                  ))
                )}
              </div>

              {documents.length > 0 ? (
                <div className="fiscal-documents-load-more" aria-label="Carregamento de documentos fiscais">
                  <span>
                    {loadedDocumentsCount} de {totalDocuments} registro{totalDocuments === 1 ? "" : "s"} carregado{loadedDocumentsCount === 1 ? "" : "s"}
                  </span>

                  {hasMoreDocuments ? (
                    <span className="fiscal-documents-auto-loader" ref={loadMoreSentinelRef}>
                      {isLoading ? (
                        <>
                          <LoaderCircle aria-hidden="true" className="platform-spin" size={16} />
                          Carregando
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>

          <div className="platform-flow-actions" aria-label="Ações de documentos fiscais">
            <Link className="platform-secondary-button" href="/meu-sistema">
              <ArrowLeft size={16} />
              Voltar
            </Link>

            <button
              className="platform-primary-button fiscal-documents-refresh-button"
              type="button"
              disabled={isLoading}
              onClick={() => {
                setPageOffset(0);
                setRefreshNonce(current => current + 1);
              }}
            >
              <RefreshCcw className={isLoading ? "platform-spin" : undefined} size={16} />
              Atualizar
            </button>
          </div>
        </section>

        {modalPresence.isPresent && visibleDocument ? (
          <div
            className="platform-modal-backdrop"
            data-modal-state={modalPresence.state}
            role="presentation"
            {...modalDismiss.backdropProps}
          >
            <section
              aria-labelledby="fiscal-document-modal-title"
              aria-modal="true"
              className="platform-modal fiscal-document-modal"
              role="dialog"
            >
              <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeModal}>
                <X size={18} aria-hidden="true" />
              </button>

              <header className="platform-modal-head fiscal-document-modal-head">
                <span className="platform-modal-kicker">Documento fiscal</span>
                <h2 id="fiscal-document-modal-title">{getFiscalDocumentTitle(visibleDocument)}</h2>
                <p>
                  {formatDateTime(getDocumentDate(visibleDocument))} · {formatCurrencyFromCents(visibleDocument.total_centavos)}
                </p>
                <FiscalStatusBadge status={visibleDocument.status} tipoEmissao={visibleDocument.tipo_emissao} />
              </header>

              {detailsError ? <FeedbackMessage message={detailsError} /> : null}

              {isLoadingDetails && !details ? (
                <FiscalDocumentModalSkeleton />
              ) : (
                <FiscalDocumentDetails
                  documento={details ?? visibleDocument}
                  downloadingFileKey={downloadingFileKey}
                  downloadError={downloadError}
                  onDownload={downloadFile}
                />
              )}

              <div className="platform-modal-actions platform-item-modal-actions fiscal-document-modal-actions">
                <button className="platform-secondary-button" type="button" onClick={closeModal}>
                  Fechar
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
