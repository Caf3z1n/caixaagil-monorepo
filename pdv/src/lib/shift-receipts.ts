export type ShiftReceiptKind = "entrada" | "parcela" | "convenio";

export type ShiftReceiptStatus = "efetivado" | "cancelado" | "estornado";

export type ShiftReceiptRecord = {
  id: string;
  saleId: string;
  sessionId: string;
  kind: ShiftReceiptKind;
  clientName: string;
  amountCents: number;
  paymentMethod: "dinheiro" | "pix" | "cartao";
  receivedAt: string;
  /** Revisão canônica do servidor; localmente, é o instante da própria operação. */
  revisionAt?: string | null;
  installmentNumber?: number | null;
  status: ShiftReceiptStatus;
};

type ReceiptLike = {
  id?: unknown;
  saleId?: unknown;
  sessionId?: unknown;
  kind?: unknown;
  clientName?: unknown;
  amountCents?: unknown;
  paymentMethod?: unknown;
  receivedAt?: unknown;
  revisionAt?: unknown;
  installmentNumber?: unknown;
  status?: unknown;
};

const supportedKinds = new Set<ShiftReceiptKind>(["entrada", "parcela", "convenio"]);
const supportedMethods = new Set<ShiftReceiptRecord["paymentMethod"]>(["dinheiro", "pix", "cartao"]);
const supportedStatuses = new Set<ShiftReceiptStatus>(["efetivado", "cancelado", "estornado"]);

function compactText(value: unknown, maximumLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function normalizeCents(value: unknown) {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(numericValue) && numericValue >= 0 ? numericValue : 0;
}

export function normalizeShiftReceipt(value: ReceiptLike): ShiftReceiptRecord | null {
  const id = compactText(value.id, 180);
  const saleId = compactText(value.saleId, 180);
  const sessionId = compactText(value.sessionId, 180);
  const receivedAt = compactText(value.receivedAt, 64);
  const revisionAt = compactText(value.revisionAt, 64) || receivedAt;
  const kind = compactText(value.kind, 20) as ShiftReceiptKind;
  const paymentMethod = compactText(value.paymentMethod, 20) as ShiftReceiptRecord["paymentMethod"];
  const statusValue = compactText(value.status, 20) as ShiftReceiptStatus;
  const status = supportedStatuses.has(statusValue) ? statusValue : "efetivado";
  const amountCents = normalizeCents(value.amountCents);
  const parsedDate = new Date(receivedAt);
  const parsedRevisionDate = new Date(revisionAt);

  if (
    !id ||
    !saleId ||
    !sessionId ||
    !supportedKinds.has(kind) ||
    !supportedMethods.has(paymentMethod) ||
    amountCents <= 0 ||
    Number.isNaN(parsedDate.getTime()) ||
    Number.isNaN(parsedRevisionDate.getTime())
  ) {
    return null;
  }

  const installmentNumberValue = Number(value.installmentNumber);
  const installmentNumber = Number.isSafeInteger(installmentNumberValue) && installmentNumberValue > 0
    ? installmentNumberValue
    : null;

  return {
    id,
    saleId,
    sessionId,
    kind,
    clientName: compactText(value.clientName, 120) || "Cliente não informado",
    amountCents,
    paymentMethod,
    receivedAt: parsedDate.toISOString(),
    revisionAt: parsedRevisionDate.toISOString(),
    installmentNumber,
    status
  };
}

export function mergeShiftReceipts(
  currentReceipts: readonly ShiftReceiptRecord[],
  incomingReceipts: readonly ReceiptLike[]
) {
  const receiptsById = new Map<string, ShiftReceiptRecord>();

  const mergeReceipt = (receipt: ReceiptLike) => {
    const normalizedReceipt = normalizeShiftReceipt(receipt);

    if (!normalizedReceipt) {
      return;
    }

    const currentReceipt = receiptsById.get(normalizedReceipt.id);
    const currentRevision = currentReceipt
      ? new Date(currentReceipt.revisionAt ?? currentReceipt.receivedAt).getTime()
      : Number.NEGATIVE_INFINITY;
    const incomingRevision = new Date(normalizedReceipt.revisionAt ?? normalizedReceipt.receivedAt).getTime();

    if (!currentReceipt || incomingRevision >= currentRevision) {
      receiptsById.set(normalizedReceipt.id, normalizedReceipt);
    }
  };

  for (const receipt of currentReceipts) {
    mergeReceipt(receipt);
  }

  for (const receipt of incomingReceipts) {
    mergeReceipt(receipt);
  }

  return [...receiptsById.values()].sort((leftReceipt, rightReceipt) => {
    const dateDifference = new Date(rightReceipt.receivedAt).getTime() - new Date(leftReceipt.receivedAt).getTime();

    return dateDifference || rightReceipt.id.localeCompare(leftReceipt.id);
  });
}

export function replaceShiftReceiptsForSession(
  currentReceipts: readonly ShiftReceiptRecord[],
  incomingReceipts: readonly ReceiptLike[],
  sessionId: string
) {
  const retainedReceipts = currentReceipts.filter((receipt) => receipt.sessionId !== sessionId);

  // Na reabertura, o ledger retornado pela API é o snapshot completo e
  // autoritativo do turno. Uma mesclagem por relógio poderia ressuscitar uma
  // baixa otimista perdedora cujo relógio local estivesse adiantado.
  return mergeShiftReceipts(retainedReceipts, incomingReceipts);
}

export function getEffectiveShiftReceipts(
  receipts: readonly ShiftReceiptRecord[],
  sessionId: string | null | undefined,
  canceledSaleIds: ReadonlySet<string> = new Set<string>()
) {
  if (!sessionId) {
    return [];
  }

  return mergeShiftReceipts([], receipts).filter(
    (receipt) =>
      receipt.sessionId === sessionId &&
      receipt.status === "efetivado" &&
      !canceledSaleIds.has(receipt.saleId)
  );
}

export function totalShiftReceipts(receipts: readonly ShiftReceiptRecord[]) {
  return receipts.reduce((total, receipt) => total + receipt.amountCents, 0);
}

export function buildDownPaymentReceipt({
  saleId,
  sessionId,
  clientName,
  amountCents,
  paymentMethod,
  receivedAt
}: {
  saleId: string;
  sessionId: string;
  clientName?: string | null;
  amountCents: number;
  paymentMethod?: string | null;
  receivedAt: string;
}) {
  return normalizeShiftReceipt({
    id: `${saleId}:entrada`,
    saleId,
    sessionId,
    kind: "entrada",
    clientName: clientName ?? undefined,
    amountCents,
    paymentMethod,
    receivedAt,
    revisionAt: receivedAt,
    status: "efetivado"
  });
}

export function buildInstallmentReceipt({
  saleId,
  sessionId,
  clientName,
  amountCents,
  paymentMethod,
  receivedAt,
  installmentNumber
}: {
  saleId: string;
  sessionId: string;
  clientName?: string | null;
  amountCents: number;
  paymentMethod?: string | null;
  receivedAt: string;
  installmentNumber: number;
}) {
  return normalizeShiftReceipt({
    id: `${saleId}:parcela:${installmentNumber}`,
    saleId,
    sessionId,
    kind: "parcela",
    clientName: clientName ?? undefined,
    amountCents,
    paymentMethod,
    receivedAt,
    revisionAt: receivedAt,
    installmentNumber,
    status: "efetivado"
  });
}

export function buildAgreementReceipt({
  saleId,
  sessionId,
  clientName,
  amountCents,
  paymentMethod,
  receivedAt
}: {
  saleId: string;
  sessionId: string;
  clientName?: string | null;
  amountCents: number;
  paymentMethod?: string | null;
  receivedAt: string;
}) {
  return normalizeShiftReceipt({
    id: `${saleId}:convenio`,
    saleId,
    sessionId,
    kind: "convenio",
    clientName: clientName ?? undefined,
    amountCents,
    paymentMethod,
    receivedAt,
    revisionAt: receivedAt,
    status: "efetivado"
  });
}
