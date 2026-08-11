import type { InstallmentPaymentPlan } from "@/app/promissory-note";

export type FiscalPaymentMethod = "dinheiro" | "pix" | "cartao" | "credito_loja";

export type FiscalPaymentDetail = {
  paymentMethod: FiscalPaymentMethod;
  amountCents: number;
};

export type BuildFiscalPaymentDetailsInput = {
  paymentMethod: string;
  totalCents: number;
  installmentPlan?: InstallmentPaymentPlan | null;
};

export class FiscalPaymentDetailsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalPaymentDetailsValidationError";
  }
}

function requirePositiveCents(value: unknown, label: string) {
  const cents = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new FiscalPaymentDetailsValidationError(`${label} deve ser informado em centavos positivos.`);
  }

  return cents;
}

function requireNonNegativeCents(value: unknown, label: string) {
  const cents = typeof value === "number" ? value : Number(value);

  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new FiscalPaymentDetailsValidationError(`${label} deve ser informado em centavos não negativos.`);
  }

  return cents;
}

function normalizeImmediatePaymentMethod(value: unknown): Exclude<FiscalPaymentMethod, "credito_loja"> | null {
  return value === "dinheiro" || value === "pix" || value === "cartao" ? value : null;
}

function sumSafeCents(values: number[], label: string) {
  const total = values.reduce((sum, value) => sum + value, 0);

  if (!Number.isSafeInteger(total)) {
    throw new FiscalPaymentDetailsValidationError(`${label} ultrapassa o limite monetário seguro.`);
  }

  return total;
}

function buildInstallmentPaymentDetails(totalCents: number, plan?: InstallmentPaymentPlan | null) {
  if (!plan || Number(plan.schemaVersion) < 2) {
    return [{ paymentMethod: "credito_loja", amountCents: totalCents }] satisfies FiscalPaymentDetail[];
  }

  const adjustedTotalCents = requirePositiveCents(plan.adjustedTotalCents, "Total ajustado do parcelamento");
  const downPaymentCents = requireNonNegativeCents(plan.downPaymentCents ?? 0, "Entrada do parcelamento");
  const financedBalanceCents = requirePositiveCents(
    plan.financedBalanceCents ?? plan.financedTotalCents,
    "Saldo parcelado"
  );
  const entries = Array.isArray(plan.entries) ? plan.entries : [];
  const entriesTotalCents = sumSafeCents(
    entries.map((entry) => requirePositiveCents(entry.amountCents, "Valor da parcela")),
    "Soma das parcelas"
  );

  if (adjustedTotalCents !== totalCents) {
    throw new FiscalPaymentDetailsValidationError("O total fiscal diverge do total ajustado do parcelamento.");
  }

  if (entriesTotalCents !== financedBalanceCents) {
    throw new FiscalPaymentDetailsValidationError("A soma das parcelas diverge do saldo parcelado.");
  }

  if (sumSafeCents([downPaymentCents, financedBalanceCents], "Entrada e saldo parcelado") !== totalCents) {
    throw new FiscalPaymentDetailsValidationError("A entrada somada ao saldo parcelado diverge do total fiscal.");
  }

  const details: FiscalPaymentDetail[] = [];

  if (downPaymentCents > 0) {
    const downPaymentMethod = normalizeImmediatePaymentMethod(plan.downPaymentMethod);

    if (!downPaymentMethod) {
      throw new FiscalPaymentDetailsValidationError("A forma de pagamento da entrada é inválida para o documento fiscal.");
    }

    details.push({ paymentMethod: downPaymentMethod, amountCents: downPaymentCents });
  }

  details.push({ paymentMethod: "credito_loja", amountCents: financedBalanceCents });

  return details;
}

export function buildFiscalPaymentDetails({
  paymentMethod,
  totalCents,
  installmentPlan
}: BuildFiscalPaymentDetailsInput): FiscalPaymentDetail[] {
  const safeTotalCents = requirePositiveCents(totalCents, "Total fiscal");

  if (paymentMethod === "parcelamento") {
    return buildInstallmentPaymentDetails(safeTotalCents, installmentPlan);
  }

  if (paymentMethod === "convenio") {
    return [{ paymentMethod: "credito_loja", amountCents: safeTotalCents }];
  }

  const immediatePaymentMethod = normalizeImmediatePaymentMethod(paymentMethod);

  if (!immediatePaymentMethod) {
    throw new FiscalPaymentDetailsValidationError("A forma de pagamento da venda é inválida para o documento fiscal.");
  }

  return [{ paymentMethod: immediatePaymentMethod, amountCents: safeTotalCents }];
}
