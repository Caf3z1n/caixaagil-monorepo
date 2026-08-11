import {
  mergeShiftReceipts,
  type ShiftReceiptRecord
} from "./shift-receipts.ts";

export const RECEIPT_ALREADY_CONFIRMED_CODE = "RECEIPT_ALREADY_CONFIRMED";

export type ReceiptConflictKind = "parcela" | "convenio";

export type ReceiptConflictReconciliation<TReceipt = unknown, TSale = unknown, TAgreementReceipt = unknown> = {
  kind: ReceiptConflictKind;
  saleId: string;
  rejectedInstallmentNumbers: number[];
  confirmedInstallmentNumbers: number[];
  canonicalReceipts: TReceipt[];
  canonicalInstallmentSale: TSale | null;
  canonicalAgreementReceipt: TAgreementReceipt | null;
};

type ReceiptConflictResponse<TReceipt, TSale, TAgreementReceipt> = {
  code?: unknown;
  conciliacao_recebimento?: {
    tipo?: unknown;
    venda_id?: unknown;
    parcelas_rejeitadas?: unknown;
    parcelas_confirmadas?: unknown;
    recebimentos?: unknown;
    venda_parcelada?: unknown;
    recebimento_convenio?: unknown;
  } | null;
};

function compactText(value: unknown, maximumLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximumLength);
}

function normalizeInstallmentNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map(number => Math.floor(Number(number)))
      .filter(number => Number.isSafeInteger(number) && number > 0)
  )].sort((left, right) => left - right);
}

export function normalizeReceiptConflictReconciliation<
  TReceipt = unknown,
  TSale = unknown,
  TAgreementReceipt = unknown
>(
  response: ReceiptConflictResponse<TReceipt, TSale, TAgreementReceipt>
): ReceiptConflictReconciliation<TReceipt, TSale, TAgreementReceipt> | null {
  if (response?.code !== RECEIPT_ALREADY_CONFIRMED_CODE) {
    return null;
  }

  const payload = response.conciliacao_recebimento;
  const kind = payload?.tipo === "parcela" || payload?.tipo === "convenio"
    ? payload.tipo
    : null;
  const saleId = compactText(payload?.venda_id, 180);

  if (!payload || !kind || !saleId) {
    return null;
  }

  return {
    kind,
    saleId,
    rejectedInstallmentNumbers: normalizeInstallmentNumbers(payload.parcelas_rejeitadas),
    confirmedInstallmentNumbers: normalizeInstallmentNumbers(payload.parcelas_confirmadas),
    canonicalReceipts: Array.isArray(payload.recebimentos)
      ? payload.recebimentos as TReceipt[]
      : [],
    canonicalInstallmentSale: payload.venda_parcelada && typeof payload.venda_parcelada === "object"
      ? payload.venda_parcelada as TSale
      : null,
    canonicalAgreementReceipt: payload.recebimento_convenio && typeof payload.recebimento_convenio === "object"
      ? payload.recebimento_convenio as TAgreementReceipt
      : null
  };
}

export function reconcileRejectedShiftReceipts({
  currentReceipts,
  conflict,
  canonicalReceipts
}: {
  currentReceipts: readonly ShiftReceiptRecord[];
  conflict: Pick<ReceiptConflictReconciliation, "kind" | "saleId" | "rejectedInstallmentNumbers">;
  canonicalReceipts?: readonly ShiftReceiptRecord[];
}) {
  const rejectedIds = new Set(
    conflict.kind === "convenio"
      ? [`${conflict.saleId}:convenio`]
      : conflict.rejectedInstallmentNumbers.map(number => `${conflict.saleId}:parcela:${number}`)
  );
  const withoutRejectedAttempt = currentReceipts.filter(receipt => !rejectedIds.has(receipt.id));

  return mergeShiftReceipts(withoutRejectedAttempt, canonicalReceipts ?? []);
}
