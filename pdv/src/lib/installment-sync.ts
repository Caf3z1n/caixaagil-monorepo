export type InstallmentSyncSale = {
  id: string;
  createdAt: string;
  sessionId?: string | null;
  paymentMethod: string;
  installmentPlan?: unknown;
  status?: string;
  canceledAt?: string | null;
};

export type InstallmentSaleTombstone<TSale extends InstallmentSyncSale> = {
  id?: string | null;
  reason?: string | null;
  updatedAt?: string | null;
  sale?: TSale | null;
};

export function mergeReopenedSalesSnapshot<TSale extends InstallmentSyncSale>({
  retainedSales,
  reopenedSales,
  reopenedSessionId,
  normalizeSale
}: {
  retainedSales: readonly TSale[];
  reopenedSales: readonly TSale[];
  reopenedSessionId: string;
  normalizeSale: (sale: TSale) => TSale;
}) {
  const saleById = new Map<string, TSale>();

  for (const sale of retainedSales) {
    if (sale?.id && sale.sessionId !== reopenedSessionId) {
      saleById.set(sale.id, normalizeSale(sale));
    }
  }

  // A resposta da reabertura é um snapshot canônico do turno. Ela deve
  // substituir qualquer cópia local do mesmo id, independentemente do meio
  // de pagamento, para não manter uma baixa otimista que perdeu a corrida.
  for (const sale of reopenedSales) {
    if (sale?.id) {
      saleById.set(sale.id, normalizeSale(sale));
    }
  }

  return [...saleById.values()].sort(
    (leftSale, rightSale) => rightSale.createdAt.localeCompare(leftSale.createdAt)
  );
}

export function mergeInstallmentSalesSnapshot<TSale extends InstallmentSyncSale>({
  currentSales,
  remoteSales,
  protectedSaleIds = new Set<string>(),
  tombstones = [],
  normalizeSale
}: {
  currentSales: readonly TSale[];
  remoteSales: readonly TSale[];
  protectedSaleIds?: ReadonlySet<string>;
  tombstones?: readonly InstallmentSaleTombstone<TSale>[];
  normalizeSale: (sale: TSale) => TSale;
}) {
  const isInstallmentSale = (sale: TSale) => (
    sale.paymentMethod === "parcelamento" && Boolean(sale.installmentPlan)
  );
  const remoteSaleById = new Map(
    remoteSales
      .filter((sale) => Boolean(sale?.id) && isInstallmentSale(sale))
      .map((sale) => [sale.id, normalizeSale(sale)])
  );
  const tombstoneById = new Map(
    tombstones
      .filter((tombstone) => Boolean(tombstone?.id))
      .map((tombstone) => [String(tombstone.id), tombstone])
  );
  const mergedSales = currentSales.flatMap((sale) => {
    if (!isInstallmentSale(sale) || protectedSaleIds.has(sale.id)) {
      return [sale];
    }

    const remoteSale = remoteSaleById.get(sale.id);

    if (remoteSale) {
      return [remoteSale];
    }

    const tombstone = tombstoneById.get(sale.id);

    if (!tombstone) {
      return [sale];
    }

    if (tombstone.sale) {
      return [normalizeSale(tombstone.sale)];
    }

    if (tombstone.reason === "cancelada") {
      return [{
        ...sale,
        status: "canceled",
        canceledAt: tombstone.updatedAt ?? sale.canceledAt ?? null
      }];
    }

    return [];
  });
  const currentIds = new Set(currentSales.map((sale) => sale.id));

  for (const remoteSale of remoteSaleById.values()) {
    if (!currentIds.has(remoteSale.id)) {
      mergedSales.push(remoteSale);
    }
  }

  return mergedSales.sort((leftSale, rightSale) => rightSale.createdAt.localeCompare(leftSale.createdAt));
}
