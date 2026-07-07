import type { NonFiscalReceiptPayload } from "@/lib/local-pdv-store";

export type AgreementSaleAdditionalData = {
  consumerName?: string | null;
  consumerObservation?: string | null;
};

export type PromissorySaleData = AgreementSaleAdditionalData & {
  id: string;
  createdAt: string;
  totalCents: number;
  clientName?: string | null;
  originCommandTitle?: string | null;
  installmentPlan?: InstallmentPaymentPlan | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    priceCents: number;
  }>;
};

export type PromissoryAgreementClient = {
  name: string;
  personType: "fisica" | "juridica";
  fiscalData?: Record<string, unknown> | null;
};

export type PromissoryFiscalDocument = {
  modelo?: string | null;
  serie?: number | string | null;
  numero?: number | string | null;
  chave?: string | null;
};

export type InstallmentPaymentEntry = {
  number: number;
  dueDate: string;
  amountCents: number;
  paid?: boolean;
  paidAt?: string | null;
  paymentMethod?: string | null;
  receivedSessionId?: string | null;
};

export type InstallmentPaymentPlan = {
  installmentCount: number;
  adjustmentPercent: number;
  originalTotalCents: number;
  adjustmentCents: number;
  adjustedTotalCents: number;
  customerName?: string | null;
  observation?: string | null;
  entries: InstallmentPaymentEntry[];
};

type PromissoryPayloadInput = {
  fiscalSettings?: Record<string, unknown> | null;
  pdvIdentity: string;
  printerName?: string;
  sale: PromissorySaleData;
  agreementClient?: PromissoryAgreementClient | null;
  fiscalDocument?: PromissoryFiscalDocument | null;
};

type SaleReceiptPayloadInput = {
  fiscalSettings?: Record<string, unknown> | null;
  paymentLabel: string;
  pdvIdentity: string;
  printerName?: string;
  sale: PromissorySaleData;
  sellerName?: string | null;
};

const promissoryLineWidth = 34;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function compactText(value: unknown, maxLength?: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  const limitedText = typeof maxLength === "number" && maxLength > 0 ? text.slice(0, maxLength) : text;

  return limitedText || "";
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatDocument(value: unknown) {
  const digits = onlyDigits(value);

  if (digits.length === 14) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }

  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }

  return digits;
}

function formatPostalCode(value: unknown) {
  const digits = onlyDigits(value);

  if (digits.length !== 8) {
    return "";
  }

  return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
}

function formatPhone(value: unknown) {
  const digits = onlyDigits(value);

  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }

  return digits;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(cents / 100).replace(/\u00a0/g, " ");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Não informado";
  }

  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatShortDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  }).format(date);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 3
  }).format(value);
}

function padColumn(value: string, width: number, align: "left" | "right" = "left") {
  const text = compactText(value).slice(0, width);

  return align === "right" ? text.padStart(width, " ") : text.padEnd(width, " ");
}

function buildReceiptLine(label: string, value: string) {
  const left = compactText(label);
  const right = compactText(value);

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  if (left.length + right.length + 1 >= promissoryLineWidth) {
    return `${left}\n${right.padStart(promissoryLineWidth, " ")}`;
  }

  return `${left}${" ".repeat(promissoryLineWidth - left.length - right.length)}${right}`;
}

function buildFixedReceiptLine(label: string, value: string, width = 32) {
  const left = compactText(label);
  const right = compactText(value);

  if (!left) {
    return right.slice(0, width);
  }

  if (!right) {
    return left.slice(0, width);
  }

  if (left.length + right.length + 1 >= width) {
    return `${left.slice(0, width)}\n${right.slice(0, width).padStart(width, " ")}`;
  }

  return `${left}${" ".repeat(width - left.length - right.length)}${right}`;
}

function wrapReceiptText(value: string, width = 32) {
  const text = compactText(value);

  if (!text) {
    return [""];
  }

  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }

      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > width) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [text.slice(0, width)];
}

function getCompanyDisplayName(fiscalSettings: Record<string, unknown> | null | undefined, pdvIdentity: string) {
  const emitente = asRecord(fiscalSettings?.emitente);

  return compactText(
    emitente?.nome_fantasia ??
      emitente?.nomeFantasia ??
      emitente?.razao_social ??
      emitente?.razaoSocial ??
      pdvIdentity
  ) || "Caixa Ágil";
}

function buildCompanyLines(fiscalSettings: Record<string, unknown> | null | undefined, pdvIdentity: string) {
  const emitente = asRecord(fiscalSettings?.emitente);
  const document = formatDocument(emitente?.cnpj_cpf ?? emitente?.cnpjCpf ?? emitente?.cnpj);
  const companyName = getCompanyDisplayName(fiscalSettings, pdvIdentity).toLowerCase();
  const identity = compactText(pdvIdentity);

  return [
    document ? `CNPJ ${document}` : "",
    document ? "" : identity
  ].filter((line) => line && line.toLowerCase() !== companyName);
}

function buildFiscalReference(fiscalDocument: PromissoryFiscalDocument | null | undefined, saleId: string) {
  const saleCode = saleId.replace(/^venda-/, "").slice(0, 40) || saleId;
  const fiscalNumber = compactText(fiscalDocument?.numero);

  if (!fiscalNumber) {
    return saleCode;
  }

  const model = fiscalDocument?.modelo === "55" ? "NF-e" : fiscalDocument?.modelo === "65" ? "NFC-e" : "NF";
  const serie = compactText(fiscalDocument?.serie);

  return [`${model} ${fiscalNumber}`, serie ? `Série ${serie}` : ""].filter(Boolean).join(" | ");
}

function buildItemsText(items: PromissorySaleData["items"]) {
  const header = `${padColumn("ITEM", 22)} ${padColumn("TOTAL", 9, "right")}`;
  const divider = "-".repeat(header.length);
  const rows = items.flatMap((item) => {
    const totalCents = Math.max(0, Math.round(item.priceCents * item.quantity));
    const quantityLine = `${formatQuantity(item.quantity)} x ${formatMoney(item.priceCents)}`;

    return [
      `${padColumn(compactText(item.name).toUpperCase() || "ITEM", 22)} ${padColumn(formatMoney(totalCents), 9, "right")}`,
      quantityLine
    ];
  });

  return [header, divider, ...rows].join("\n");
}

function buildSaleReceiptItemsText(items: PromissorySaleData["items"]) {
  const divider = "-".repeat(32);
  const rows = items.flatMap((item, index) => {
    const totalCents = Math.max(0, Math.round(item.priceCents * item.quantity));
    const itemName = compactText(item.name).toUpperCase() || "ITEM";
    const quantityLabel = `${formatQuantity(item.quantity)} x ${formatMoney(item.priceCents)}`;
    const lines = [
      ...wrapReceiptText(itemName, 32),
      buildFixedReceiptLine(quantityLabel, formatMoney(totalCents), 32)
    ];

    return index > 0 ? [divider, ...lines] : lines;
  });

  return rows.join("\n");
}

function formatAdjustmentPercent(value: number) {
  const formatted = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(Math.abs(value));

  return `${value > 0 ? "+" : "-"}${formatted}%`;
}

function getInstallmentAdjustmentField(plan: InstallmentPaymentPlan | null) {
  if (!plan || plan.adjustmentCents === 0) {
    return null;
  }

  const isFee = plan.adjustmentCents > 0;
  const label = isFee ? "Juros" : "Desconto";
  const prefix = isFee ? "+" : "-";
  const percent = plan.adjustmentPercent !== 0 ? ` (${formatAdjustmentPercent(plan.adjustmentPercent)})` : "";

  return {
    label,
    value: `${prefix}${formatMoney(Math.abs(plan.adjustmentCents))}${percent}`
  };
}

function buildInstallmentScheduleText(plan: InstallmentPaymentPlan) {
  const header = `${padColumn("PARC", 4)} ${padColumn("VENC", 8)} ${padColumn("VALOR", 8, "right")} ${padColumn("PAGO", 8)}`;
  const divider = "-".repeat(header.length);
  const rows = plan.entries.map((entry, index) => {
    const numberLabel = `${entry.number || index + 1}/${plan.installmentCount}`;
    const paidLabel = entry.paid ? formatShortDateOnly(entry.paidAt || "") : "-";

    return `${padColumn(numberLabel, 4)} ${padColumn(formatShortDateOnly(entry.dueDate), 8)} ${padColumn(formatMoney(entry.amountCents), 8, "right")} ${padColumn(paidLabel, 8)}`;
  });

  return [header, divider, ...rows].join("\n");
}

function buildSaleReceiptInstallmentScheduleText(plan: InstallmentPaymentPlan, saleCreatedAt: string) {
  const entries = plan.entries.map((entry, index) => {
    if (!entry.paid || entry.paidAt) {
      return entry;
    }

    return {
      ...entry,
      paidAt: index === 0 ? saleCreatedAt : entry.paidAt
    };
  });

  return buildInstallmentScheduleText({
    ...plan,
    entries
  });
}

export function buildPromissoryNoteReceiptPayload({
  fiscalSettings,
  pdvIdentity,
  printerName,
  sale,
  agreementClient,
  fiscalDocument
}: PromissoryPayloadInput): NonFiscalReceiptPayload {
  const clientName = compactText(sale.clientName ?? agreementClient?.name) || "Cliente não informado";
  const consumerName = compactText(sale.consumerName);
  const consumerObservation = compactText(sale.consumerObservation, 500);
  const fields = [
    { label: "Emissão", value: formatDateTime(sale.createdAt) },
    { label: "Cliente", value: clientName },
    { label: "Referência fiscal", value: buildFiscalReference(fiscalDocument, sale.id) },
    ...(consumerName ? [{ label: "Nome informado", value: consumerName }] : []),
    ...(consumerObservation ? [{ label: "Observações", value: consumerObservation }] : [])
  ];
  const sections = [
    {
      title: "Itens da venda",
      kind: "preformatted" as const,
      content: buildItemsText(sale.items)
    }
  ];

  return {
    type: "promissoria",
    title: "NOTA PROMISSÓRIA",
    companyName: getCompanyDisplayName(fiscalSettings, pdvIdentity),
    companyLines: buildCompanyLines(fiscalSettings, pdvIdentity),
    highlightLabel: "Valor total",
    highlightValue: formatMoney(sale.totalCents),
    fields,
    sections,
    footerNote: "Reconheço o débito acima e me comprometo a efetuar o pagamento nas condições ajustadas com o emitente.",
    signatureLabel: "Assinatura do cliente",
    signatureName: consumerName || clientName,
    printerName,
    preferredPrinterPatterns: [
      "TANCA TP-550 (copy 1)",
      "TANCA TP-550",
      "TANCA",
      "POS-80",
      "POS-",
      "EPSON TM",
      "BEMATECH",
      "ELGIN",
      "DARUMA",
      "TERMICA",
      "THERMAL"
    ]
  };
}

export function buildSaleReceiptPayload({
  fiscalSettings,
  paymentLabel,
  pdvIdentity,
  printerName,
  sale,
  sellerName
}: SaleReceiptPayloadInput): NonFiscalReceiptPayload {
  const installmentPlan = sale.installmentPlan ?? null;
  const receiptPaymentLabel = installmentPlan
    ? `Parcelamento ${installmentPlan.installmentCount}x`
    : paymentLabel;
  const adjustmentField = getInstallmentAdjustmentField(installmentPlan);
  const fields = [
    { label: "Emissão", value: formatDateTime(sale.createdAt) },
    { label: "Pagamento", value: receiptPaymentLabel },
    ...(adjustmentField ? [adjustmentField] : []),
    ...(compactText(sellerName) ? [{ label: "Vendedor", value: compactText(sellerName, 80) }] : [])
  ];
  const sections = [
    {
      title: "Itens",
      kind: "preformatted" as const,
      content: buildSaleReceiptItemsText(sale.items)
    },
    ...(installmentPlan ? [{
      title: "Parcelas",
      kind: "preformatted" as const,
      content: buildSaleReceiptInstallmentScheduleText(installmentPlan, sale.createdAt)
    }] : [])
  ];

  return {
    type: "comprovante-venda",
    title: "COMPROVANTE DE VENDA",
    companyName: getCompanyDisplayName(fiscalSettings, pdvIdentity),
    companyLines: buildCompanyLines(fiscalSettings, pdvIdentity),
    highlightLabel: "Total",
    highlightValue: formatMoney(sale.totalCents),
    fields,
    sections,
    printerName,
    preferredPrinterPatterns: [
      "TANCA TP-550 (copy 1)",
      "TANCA TP-550",
      "TANCA",
      "POS-80",
      "POS-",
      "EPSON TM",
      "BEMATECH",
      "ELGIN",
      "DARUMA",
      "TERMICA",
      "THERMAL"
    ]
  };
}
