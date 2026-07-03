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

type PromissoryPayloadInput = {
  fiscalSettings?: Record<string, unknown> | null;
  pdvIdentity: string;
  printerName?: string;
  sale: PromissorySaleData;
  agreementClient?: PromissoryAgreementClient | null;
  fiscalDocument?: PromissoryFiscalDocument | null;
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

function getNestedRecord(source: Record<string, unknown> | null | undefined, key: string) {
  return asRecord(source?.[key]);
}

function getFiscalAddress(source: Record<string, unknown> | null | undefined) {
  return getNestedRecord(source, "endereco") ?? getNestedRecord(source, "address") ?? {};
}

function buildAddressLine(address: Record<string, unknown> | null | undefined) {
  return [
    compactText(address?.logradouro ?? address?.rua ?? address?.street),
    compactText(address?.numero ?? address?.number),
    compactText(address?.complemento ?? address?.details)
  ].filter(Boolean).join(", ");
}

function buildRegionLine(address: Record<string, unknown> | null | undefined) {
  const city = compactText(address?.municipio ?? address?.cidade ?? address?.city);
  const state = compactText(address?.uf ?? address?.estado ?? address?.state).toUpperCase();
  const cityState = city && state ? `${city}/${state}` : city || state;
  const postalCode = formatPostalCode(address?.cep ?? address?.zip ?? address?.code);

  return [
    compactText(address?.bairro ?? address?.district),
    cityState,
    postalCode ? `CEP ${postalCode}` : ""
  ].filter(Boolean).join(" - ");
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

  return [
    document ? `CNPJ ${document}` : "",
    compactText(pdvIdentity)
  ].filter(Boolean);
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

function buildDebtorSection(client: PromissoryAgreementClient | null | undefined) {
  const fiscalData = asRecord(client?.fiscalData);

  if (!fiscalData) {
    return null;
  }

  const address = getFiscalAddress(fiscalData);
  const document = formatDocument(fiscalData.cnpj_cpf ?? fiscalData.cnpjCpf ?? fiscalData.cnpj ?? fiscalData.documento);
  const stateRegistration = compactText(fiscalData.inscricao_estadual ?? fiscalData.inscricaoEstadual);
  const legalName = compactText(fiscalData.razao_social ?? fiscalData.razaoSocial ?? fiscalData.nome ?? client?.name, 58);
  const documentLine = [
    document ? `${document.length > 14 ? "CNPJ" : "CPF"} ${document}` : "",
    stateRegistration ? `IE ${stateRegistration}` : ""
  ].filter(Boolean).join(" | ");
  const content = [
    legalName,
    compactText(documentLine, 58),
    compactText(buildAddressLine(address), 58),
    compactText(buildRegionLine(address), 58)
  ].filter(Boolean).join("\n");

  if (!content) {
    return null;
  }

  return {
    title: "Dados do devedor",
    kind: "text" as const,
    content
  };
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

export function buildPromissoryNoteReceiptPayload({
  fiscalSettings,
  pdvIdentity,
  printerName,
  sale,
  agreementClient,
  fiscalDocument
}: PromissoryPayloadInput): NonFiscalReceiptPayload {
  const debtorName = compactText(sale.clientName ?? agreementClient?.name) || "Cliente não informado";
  const consumerName = compactText(sale.consumerName);
  const consumerObservation = compactText(sale.consumerObservation, 500);
  const debtorSection = buildDebtorSection(agreementClient);
  const fields = [
    { label: "Referencia fiscal", value: buildFiscalReference(fiscalDocument, sale.id) },
    { label: "Devedor", value: debtorName },
    ...(consumerName ? [{ label: "Nome informado", value: consumerName }] : []),
    ...(consumerObservation ? [{ label: "Observacoes", value: consumerObservation }] : [])
  ];
  const sections = [
    ...(debtorSection ? [debtorSection] : []),
    {
      title: "Itens da venda",
      kind: "preformatted" as const,
      content: buildItemsText(sale.items)
    }
  ];

  return {
    type: "promissoria",
    title: "NOTA PROMISSORIA",
    subtitle: `Emitida em ${formatDateTime(sale.createdAt)}`,
    companyName: getCompanyDisplayName(fiscalSettings, pdvIdentity),
    companyLines: buildCompanyLines(fiscalSettings, pdvIdentity),
    highlightLabel: "Valor total",
    highlightValue: formatMoney(sale.totalCents),
    fields,
    sections,
    footerNote: "Reconheco o debito acima e me comprometo a efetuar o pagamento nas condicoes ajustadas com o emitente.",
    signatureLabel: "Assinatura do cliente",
    signatureName: consumerName || debtorName,
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
