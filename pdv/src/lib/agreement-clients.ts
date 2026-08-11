export type AgreementClientAvailability = {
  id: number;
  name: string;
  active: boolean;
  allowFrontPayment: boolean;
};

export function normalizeAgreementClients<TClient extends AgreementClientAvailability>(
  clients: readonly TClient[]
) {
  const clientById = new Map<number, TClient>();

  for (const client of clients) {
    if (Number.isFinite(client.id) && client.id > 0) {
      clientById.set(client.id, client);
    }
  }

  return [...clientById.values()].sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export function getActiveAgreementClients<TClient extends AgreementClientAvailability>(
  clients: readonly TClient[]
) {
  return clients.filter(client => client.active);
}

export function getFrontCashAgreementClients<TClient extends AgreementClientAvailability>(
  clients: readonly TClient[]
) {
  // Um cliente inativado não pode participar de novas vendas, mas as dívidas que
  // já o referenciam continuam recebíveis. A API só mantém inativos com saldo aberto.
  return clients.filter(client => client.allowFrontPayment || !client.active);
}
