export type SynchronizedPdvSession = {
  id: number;
  usuario_id?: number | null;
  identificacao: string | null;
  nome: string;
  status_operacional?: string;
  ultimo_acesso_em?: string | null;
  ultima_sincronizacao_em?: string | null;
};

export function mergeSynchronizedPdvSession(
  currentSession: SynchronizedPdvSession | null,
  synchronizedSession: SynchronizedPdvSession | null | undefined
) {
  if (
    !synchronizedSession ||
    !Number.isSafeInteger(synchronizedSession.id) ||
    synchronizedSession.id <= 0 ||
    !String(synchronizedSession.nome ?? "").trim() ||
    (currentSession && currentSession.id !== synchronizedSession.id)
  ) {
    return currentSession;
  }

  return {
    ...currentSession,
    ...synchronizedSession,
    nome: synchronizedSession.nome.trim(),
    identificacao: synchronizedSession.identificacao?.trim() || null
  };
}
