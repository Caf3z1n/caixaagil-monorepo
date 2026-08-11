export type InstallmentReceiptAttemptEntry = {
  number: number;
  paymentMethod?: string | null;
  paidAt?: string | null;
};

export type InstallmentReceiptAttemptGroup<TEntry extends InstallmentReceiptAttemptEntry> = {
  paymentMethod: string;
  receivedAt: string;
  entries: TEntry[];
};

function normalizeAttemptDate(value: string) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("A tentativa de recebimento precisa ter data e hora válidas.");
  }

  return parsedDate.toISOString();
}

function normalizeOperationParts(parts: readonly (string | number)[]) {
  return [...new Set(parts.map((part) => String(part).trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "pt-BR", { numeric: true }));
}

/**
 * Identifica uma tentativa financeira, e não apenas a dívida. Assim, um replay da
 * mesma tentativa é idempotente, mas uma nova baixa após estorno gera outro evento.
 */
export function buildReceiptAttemptEventId({
  eventType,
  aggregateId,
  operationParts,
  receivedAt
}: {
  eventType: "parcelamento_recebido" | "convenio_recebido";
  aggregateId: string;
  operationParts?: readonly (string | number)[];
  receivedAt: string;
}) {
  const normalizedAggregateId = String(aggregateId ?? "").trim();

  if (!normalizedAggregateId) {
    throw new Error("A tentativa de recebimento precisa estar associada a uma venda.");
  }

  const attemptTime = normalizeAttemptDate(receivedAt);
  const parts = normalizeOperationParts(operationParts ?? []);
  const operationKey = parts.length > 0 ? `-${parts.join("-")}` : "";

  return `${eventType}-${normalizedAggregateId}${operationKey}-${attemptTime}`;
}

export function groupInstallmentReceiptAttempts<TEntry extends InstallmentReceiptAttemptEntry>(
  entries: readonly TEntry[],
  fallbackReceivedAt: string
) {
  const fallback = normalizeAttemptDate(fallbackReceivedAt);
  const groups = new Map<string, InstallmentReceiptAttemptGroup<TEntry>>();

  for (const entry of entries) {
    const paymentMethod = String(entry.paymentMethod ?? "").trim();

    if (!paymentMethod) {
      continue;
    }

    const receivedAt = normalizeAttemptDate(entry.paidAt || fallback);
    const key = `${paymentMethod}\u0000${receivedAt}`;
    const currentGroup = groups.get(key);

    if (currentGroup) {
      currentGroup.entries.push(entry);
      continue;
    }

    groups.set(key, {
      paymentMethod,
      receivedAt,
      entries: [entry]
    });
  }

  return [...groups.values()].map((group) => ({
    ...group,
    entries: [...group.entries].sort((left, right) => left.number - right.number)
  }));
}
