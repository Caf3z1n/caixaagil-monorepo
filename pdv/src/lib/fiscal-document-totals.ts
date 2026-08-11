export type FiscalDocumentItemTotal = {
  totalPriceCents: number;
};

export type FiscalDocumentItemAdjustment = {
  discountCents: number;
  otherCents: number;
};

export type FiscalDocumentTotals = {
  schemaVersion: 1;
  productsTotalCents: number;
  discountCents: number;
  otherCents: number;
  invoiceTotalCents: number;
  itemAdjustments: FiscalDocumentItemAdjustment[];
};

export class FiscalDocumentTotalsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FiscalDocumentTotalsValidationError";
  }
}

const MAX_FISCAL_CENTS = 2_147_483_647;

function requireNonNegativeCents(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FISCAL_CENTS) {
    throw new FiscalDocumentTotalsValidationError(`${label} deve ser um valor monetário válido em centavos.`);
  }

  return value;
}

function addSafeCents(total: number, value: number, label: string) {
  const result = total + value;

  if (!Number.isSafeInteger(result) || result > MAX_FISCAL_CENTS) {
    throw new FiscalDocumentTotalsValidationError(`${label} ultrapassa o limite monetário seguro.`);
  }

  return result;
}

function allocateCentsProportionally(amountCents: number, itemTotalsCents: number[]) {
  if (amountCents === 0) {
    return itemTotalsCents.map(() => 0);
  }

  const productsTotalCents = itemTotalsCents.reduce(
    (total, itemTotalCents) => addSafeCents(total, itemTotalCents, "Subtotal fiscal"),
    0
  );

  if (productsTotalCents <= 0) {
    throw new FiscalDocumentTotalsValidationError("O subtotal fiscal deve ser maior que zero.");
  }

  const amount = BigInt(amountCents);
  const productsTotal = BigInt(productsTotalCents);
  const allocations = itemTotalsCents.map((itemTotalCents, index) => {
    const weightedAmount = amount * BigInt(itemTotalCents);

    return {
      index,
      cents: Number(weightedAmount / productsTotal),
      remainder: weightedAmount % productsTotal
    };
  });
  const allocatedCents = allocations.reduce((total, allocation) => total + allocation.cents, 0);
  let remainingCents = amountCents - allocatedCents;

  allocations
    .slice()
    .sort((left, right) => {
      if (left.remainder === right.remainder) {
        return left.index - right.index;
      }

      return left.remainder > right.remainder ? -1 : 1;
    })
    .forEach((allocation) => {
      if (remainingCents <= 0) {
        return;
      }

      allocations[allocation.index].cents += 1;
      remainingCents -= 1;
    });

  if (remainingCents !== 0) {
    throw new FiscalDocumentTotalsValidationError("Não foi possível distribuir o ajuste fiscal em centavos.");
  }

  return allocations.map((allocation) => allocation.cents);
}

export function buildFiscalDocumentTotals(
  items: FiscalDocumentItemTotal[],
  invoiceTotalCents: number
): FiscalDocumentTotals {
  const safeInvoiceTotalCents = requireNonNegativeCents(invoiceTotalCents, "Total fiscal");
  const itemTotalsCents = items.map((item) => requireNonNegativeCents(item.totalPriceCents, "Total do item"));
  const productsTotalCents = itemTotalsCents.reduce(
    (total, itemTotalCents) => addSafeCents(total, itemTotalCents, "Subtotal fiscal"),
    0
  );

  if (productsTotalCents <= 0 || safeInvoiceTotalCents <= 0) {
    throw new FiscalDocumentTotalsValidationError("Subtotal e total fiscal devem ser maiores que zero.");
  }

  const differenceCents = safeInvoiceTotalCents - productsTotalCents;
  const discountCents = Math.max(0, -differenceCents);
  const otherCents = Math.max(0, differenceCents);

  if (discountCents > productsTotalCents) {
    throw new FiscalDocumentTotalsValidationError("O desconto fiscal não pode superar o subtotal dos itens.");
  }

  const discountAllocations = allocateCentsProportionally(discountCents, itemTotalsCents);
  const otherAllocations = allocateCentsProportionally(otherCents, itemTotalsCents);
  const allocatedDiscountCents = discountAllocations.reduce((total, value) => total + value, 0);
  const allocatedOtherCents = otherAllocations.reduce((total, value) => total + value, 0);

  if (
    allocatedDiscountCents !== discountCents ||
    allocatedOtherCents !== otherCents ||
    productsTotalCents - discountCents + otherCents !== safeInvoiceTotalCents
  ) {
    throw new FiscalDocumentTotalsValidationError("Os totais fiscais não fecham exatamente em centavos.");
  }

  return {
    schemaVersion: 1,
    productsTotalCents,
    discountCents,
    otherCents,
    invoiceTotalCents: safeInvoiceTotalCents,
    itemAdjustments: itemTotalsCents.map((_, index) => ({
      discountCents: discountAllocations[index],
      otherCents: otherAllocations[index]
    }))
  };
}
