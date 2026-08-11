import type {
  InstallmentPaymentEntry,
  InstallmentPaymentPlan
} from "@/app/promissory-note";

export type InstallmentAdjustmentKind = "none" | "discount" | "interest";

export type BuildInstallmentPaymentPlanV2Input = {
  installmentCount: number;
  adjustmentKind: InstallmentAdjustmentKind;
  adjustmentAmountCents: number;
  originalTotalCents: number;
  downPaymentCents: number;
  downPaymentMethod?: string | null;
  firstDueDate?: string | null;
  saleDate?: Date;
  customerName?: string | null;
  observation?: string | null;
};

export class InstallmentPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallmentPlanValidationError";
  }
}

function requireNonNegativeCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new InstallmentPlanValidationError(`${label} deve ser um valor monetário válido em centavos.`);
  }

  return value;
}

function compactText(value: unknown, maximumLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function getLocalDateKey(date = new Date()) {
  if (Number.isNaN(date.getTime())) {
    throw new InstallmentPlanValidationError("Data inválida.");
  }

  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

export function parseLocalDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addMonthsToLocalDateKey(firstDueDate: string, months: number) {
  const sourceDate = parseLocalDateKey(firstDueDate);

  if (!sourceDate || !Number.isSafeInteger(months) || months < 0) {
    throw new InstallmentPlanValidationError("Data da primeira parcela inválida.");
  }

  const sourceMonthIndex = sourceDate.getFullYear() * 12 + sourceDate.getMonth();
  const targetMonthIndex = sourceMonthIndex + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastTargetDay = new Date(targetYear, targetMonth + 1, 0, 12, 0, 0, 0).getDate();
  const targetDay = Math.min(sourceDate.getDate(), lastTargetDay);

  return `${targetYear}-${padDatePart(targetMonth + 1)}-${padDatePart(targetDay)}`;
}

export function splitCentsInInstallments(totalCents: number, installmentCount: number) {
  requireNonNegativeCents(totalCents, "Saldo parcelado");

  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1) {
    throw new InstallmentPlanValidationError("A quantidade mínima é uma parcela.");
  }

  if (totalCents < installmentCount) {
    throw new InstallmentPlanValidationError("O saldo não permite gerar parcelas sem valor zero.");
  }

  const baseValue = Math.floor(totalCents / installmentCount);
  const remainder = totalCents - baseValue * installmentCount;

  return Array.from(
    { length: installmentCount },
    (_, index) => baseValue + (index < remainder ? 1 : 0)
  );
}

function resolveAdjustmentCents(
  kind: InstallmentAdjustmentKind,
  originalTotalCents: number,
  amountCents: number
) {
  if (kind === "none") {
    return 0;
  }

  if (kind === "discount") {
    if (amountCents > originalTotalCents) {
      throw new InstallmentPlanValidationError("O desconto não pode ser maior que o subtotal da venda.");
    }

    return -amountCents;
  }

  if (kind === "interest") {
    if (!Number.isSafeInteger(originalTotalCents + amountCents)) {
      throw new InstallmentPlanValidationError("O total com juros ultrapassa o limite monetário seguro.");
    }

    return amountCents;
  }

  throw new InstallmentPlanValidationError("Selecione desconto, juros ou nenhum ajuste.");
}

export function buildInstallmentPaymentPlanV2({
  installmentCount,
  adjustmentKind,
  adjustmentAmountCents,
  originalTotalCents,
  downPaymentCents,
  downPaymentMethod,
  firstDueDate,
  saleDate = new Date(),
  customerName,
  observation
}: BuildInstallmentPaymentPlanV2Input): InstallmentPaymentPlan {
  const safeOriginalTotalCents = requireNonNegativeCents(originalTotalCents, "Subtotal");
  const safeAdjustmentAmountCents = requireNonNegativeCents(adjustmentAmountCents, "Ajuste");
  const safeDownPaymentCents = requireNonNegativeCents(downPaymentCents, "Entrada");

  if (safeOriginalTotalCents <= 0) {
    throw new InstallmentPlanValidationError("O subtotal da venda deve ser maior que zero.");
  }

  if (!Number.isSafeInteger(installmentCount) || installmentCount < 1 || installmentCount > 12) {
    throw new InstallmentPlanValidationError("Selecione entre 1 e 12 parcelas.");
  }

  const adjustmentCents = resolveAdjustmentCents(
    adjustmentKind,
    safeOriginalTotalCents,
    safeAdjustmentAmountCents
  );
  const adjustedTotalCents = safeOriginalTotalCents + adjustmentCents;

  if (adjustedTotalCents <= 0) {
    throw new InstallmentPlanValidationError("O total final deve ser maior que zero.");
  }

  if (safeDownPaymentCents > adjustedTotalCents) {
    throw new InstallmentPlanValidationError("A entrada não pode ser maior que o total final da venda.");
  }

  if (safeDownPaymentCents === adjustedTotalCents) {
    throw new InstallmentPlanValidationError("A entrada igual ao total deve ser recebida como venda à vista.");
  }

  const normalizedDownPaymentMethod = compactText(downPaymentMethod, 20);

  if (
    safeDownPaymentCents > 0 &&
    normalizedDownPaymentMethod !== "dinheiro" &&
    normalizedDownPaymentMethod !== "pix" &&
    normalizedDownPaymentMethod !== "cartao"
  ) {
    throw new InstallmentPlanValidationError("Selecione a forma de pagamento da entrada.");
  }

  const financedBalanceCents = adjustedTotalCents - safeDownPaymentCents;
  const firstDueDateKey = compactText(firstDueDate, 10) || getLocalDateKey(saleDate);

  if (!parseLocalDateKey(firstDueDateKey)) {
    throw new InstallmentPlanValidationError("Informe uma data válida para a primeira parcela.");
  }

  const installmentValues = splitCentsInInstallments(financedBalanceCents, installmentCount);

  return {
    schemaVersion: 2,
    installmentCount,
    adjustmentKind,
    adjustmentPercent: 0,
    originalTotalCents: safeOriginalTotalCents,
    adjustmentCents,
    adjustmentAmountCents: Math.abs(adjustmentCents),
    adjustedTotalCents,
    downPaymentCents: safeDownPaymentCents,
    downPaymentMethod: safeDownPaymentCents > 0 ? normalizedDownPaymentMethod : null,
    downPaymentPaidAt: null,
    downPaymentSessionId: null,
    financedBalanceCents,
    financedTotalCents: financedBalanceCents,
    firstDueDate: firstDueDateKey,
    customerName: compactText(customerName, 120) || null,
    observation: compactText(observation, 1_000) || null,
    entries: installmentValues.map((amountCents, index) => ({
      number: index + 1,
      dueDate: addMonthsToLocalDateKey(firstDueDateKey, index),
      amountCents,
      paid: false,
      paidAt: null,
      paymentMethod: null,
      receivedSessionId: null
    }))
  };
}

function normalizeStoredCents(value: unknown, fallback = 0) {
  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isSafeInteger(numericValue) ? numericValue : fallback;
}

function normalizeStoredEntry(value: unknown, index: number): InstallmentPaymentEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<InstallmentPaymentEntry>;
  const amountCents = normalizeStoredCents(entry.amountCents, -1);
  const dueDate = compactText(entry.dueDate, 10);

  if (amountCents < 0 || !dueDate) {
    return null;
  }

  return {
    number: Number.isSafeInteger(entry.number) && Number(entry.number) > 0 ? Number(entry.number) : index + 1,
    dueDate,
    amountCents,
    paid: entry.paid === true || Boolean(entry.paidAt),
    paidAt: compactText(entry.paidAt, 64) || null,
    paymentMethod: compactText(entry.paymentMethod, 20) || null,
    receivedSessionId: compactText(entry.receivedSessionId, 180) || null
  };
}

export function normalizeInstallmentPaymentPlan(value: unknown): InstallmentPaymentPlan | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const plan = value as Partial<InstallmentPaymentPlan>;
  const entries = Array.isArray(plan.entries)
    ? plan.entries.map(normalizeStoredEntry).filter((entry): entry is InstallmentPaymentEntry => Boolean(entry))
    : [];

  if (entries.length === 0) {
    return null;
  }

  const installmentCountValue = normalizeStoredCents(plan.installmentCount, entries.length);
  const installmentCount = Math.max(1, Math.min(12, installmentCountValue || entries.length));
  const originalTotalCents = Math.max(0, normalizeStoredCents(plan.originalTotalCents));
  const adjustmentCents = normalizeStoredCents(plan.adjustmentCents);
  const entriesTotalCents = entries.reduce((total, entry) => total + entry.amountCents, 0);
  const schemaVersion = Number(plan.schemaVersion);
  const isVersion2 = Number.isSafeInteger(schemaVersion) && schemaVersion >= 2;
  const adjustmentKind: InstallmentAdjustmentKind = isVersion2 &&
    (plan.adjustmentKind === "discount" || plan.adjustmentKind === "interest" || plan.adjustmentKind === "none")
    ? plan.adjustmentKind
    : adjustmentCents < 0
      ? "discount"
      : adjustmentCents > 0
        ? "interest"
        : "none";
  const adjustedTotalCents = Math.max(
    0,
    normalizeStoredCents(plan.adjustedTotalCents, originalTotalCents + adjustmentCents)
  );

  if (!isVersion2) {
    return {
      ...plan,
      installmentCount,
      adjustmentPercent: normalizeStoredCents(plan.adjustmentPercent),
      originalTotalCents,
      adjustmentCents,
      adjustedTotalCents,
      customerName: compactText(plan.customerName, 120) || null,
      observation: compactText(plan.observation, 1_000) || null,
      entries
    };
  }

  const downPaymentCents = Math.max(0, normalizeStoredCents(plan.downPaymentCents));
  const financedBalanceCents = Math.max(
    0,
    normalizeStoredCents(plan.financedBalanceCents ?? plan.financedTotalCents, entriesTotalCents)
  );

  return {
    ...plan,
    schemaVersion,
    installmentCount,
    adjustmentKind,
    adjustmentPercent: 0,
    originalTotalCents,
    adjustmentCents,
    adjustmentAmountCents: Math.abs(adjustmentCents),
    adjustedTotalCents,
    downPaymentCents,
    downPaymentMethod: compactText(plan.downPaymentMethod, 20) || null,
    downPaymentPaidAt: compactText(plan.downPaymentPaidAt, 64) || null,
    downPaymentSessionId: compactText(plan.downPaymentSessionId, 180) || null,
    financedBalanceCents,
    financedTotalCents: financedBalanceCents,
    firstDueDate: compactText(plan.firstDueDate, 10) || entries[0].dueDate,
    customerName: compactText(plan.customerName, 120) || null,
    observation: compactText(plan.observation, 1_000) || null,
    entries
  };
}
