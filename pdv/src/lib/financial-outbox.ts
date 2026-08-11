export type FinancialOutboxEvent = {
  event_type?: string | null;
  aggregate_id?: string | null;
};

export function getUnsyncedFinancialAggregateProtection({
  pendingEvents,
  failedEvents,
  allOutstandingInstallmentSaleIds,
  allPaidAgreementReceiptIds,
  windowLimit = 1_000,
  forceFullProtection = false
}: {
  pendingEvents: readonly FinancialOutboxEvent[];
  failedEvents: readonly FinancialOutboxEvent[];
  allOutstandingInstallmentSaleIds: readonly string[];
  allPaidAgreementReceiptIds: readonly string[];
  windowLimit?: number;
  forceFullProtection?: boolean;
}) {
  const hasIncompleteWindow = forceFullProtection ||
    pendingEvents.length >= windowLimit ||
    failedEvents.length >= windowLimit;

  if (hasIncompleteWindow) {
    // A ponte limita cada consulta da outbox a 1.000 linhas. Quando a janela
    // chega ao teto, não há como provar que um agregado financeiro ausente do
    // lote já foi sincronizado. Preservar todo o estado financeiro local evita
    // tombstones e rebaixamentos incorretos até a fila diminuir.
    return {
      installmentSaleIds: new Set(allOutstandingInstallmentSaleIds),
      agreementReceiptIds: new Set(allPaidAgreementReceiptIds),
      windowIncomplete: true
    };
  }

  const installmentSaleIds = new Set<string>();
  const agreementReceiptIds = new Set<string>();

  for (const event of [...pendingEvents, ...failedEvents]) {
    if (!event.aggregate_id) {
      continue;
    }

    if (
      event.event_type === "venda_concluida" ||
      event.event_type === "venda_cancelada" ||
      event.event_type === "parcelamento_recebido"
    ) {
      installmentSaleIds.add(event.aggregate_id);
    }

    if (event.event_type === "convenio_recebido") {
      agreementReceiptIds.add(event.aggregate_id);
    }
  }

  return { installmentSaleIds, agreementReceiptIds, windowIncomplete: false };
}
