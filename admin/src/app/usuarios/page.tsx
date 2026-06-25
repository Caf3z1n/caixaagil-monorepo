"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  CircleDollarSign,
  CreditCard,
  Eye,
  History,
  Monitor,
  PauseCircle,
  PlayCircle,
  Search,
  Save,
  TimerReset,
  UserRound,
  UsersRound,
  X
} from "lucide-react";

import { AdminFrame } from "@/components/admin-frame";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";
import { clearAdminSession, getStoredAdminAuthToken } from "@/lib/admin-session";
import { formatCurrency, formatDate } from "@/lib/formatters";

type PagamentoAdmin = {
  id: number;
  status: string;
  status_detalhe?: string | null;
  valor_centavos?: number | null;
  moeda?: string | null;
  forma_pagamento?: string | null;
  pago_em?: string | null;
  vencimento_em?: string | null;
  processado_em?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

type AlteracaoAgendada = {
  id: number;
  status: string;
  tipo: string;
  plano_novo: string;
  valor_novo_centavos: number;
  moeda?: string | null;
  aplicar_em?: string | null;
};

type AssinaturaAdmin = {
  id: number;
  plano: string;
  plano_nome?: string | null;
  status: string;
  valor_centavos?: number | null;
  valor_recorrente_centavos?: number | null;
  moeda?: string | null;
  proximo_pagamento_em?: string | null;
  iniciada_em?: string | null;
  ativada_em?: string | null;
  cancelada_em?: string | null;
  alteracao_agendada?: AlteracaoAgendada | null;
  alteracoes?: AlteracaoAgendada[];
};

type ReguaInadimplencia = {
  fase: "regular" | "aviso" | "atrasada" | "bloqueada" | string;
  bloqueado: boolean;
  permite_operacao: boolean;
  motivo?: string | null;
  mensagem?: string | null;
  proximo_pagamento_em?: string | null;
  dias_em_atraso: number;
  dias_para_bloqueio?: number | null;
  bloqueia_em?: string | null;
  tolerancia_dias?: number;
  assinatura_id?: number | null;
  assinatura_status?: string | null;
};

type AcaoAdminAssinatura = {
  id: number;
  acao: string;
  status: string;
  motivo?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  administrador?: {
    id: number;
    nome?: string | null;
    email?: string | null;
  } | null;
};

type UsuarioAdmin = {
  id: number;
  email: string;
  ativo: boolean;
  email_verificado?: boolean;
  registrado_em?: string | null;
  plano?: string | null;
  plano_id?: string | null;
  assinatura_id?: number | null;
  assinatura_status?: string | null;
  proximo_pagamento_em?: string | null;
  fiscal_configurado: boolean;
  vendas_30_dias: number;
  pdvs_ativos: number;
  subcontas_ativas: number;
  ultimo_pagamento?: PagamentoAdmin | null;
  inadimplente: boolean;
  fase_inadimplencia?: string | null;
  dias_em_atraso?: number;
  dias_para_bloqueio?: number | null;
  bloqueado?: boolean;
  motivo_inadimplencia?: string | null;
  regua_inadimplencia?: ReguaInadimplencia | null;
  alteracao_agendada?: AlteracaoAgendada | null;
};

type UsuariosResponse = {
  filtros?: {
    planos?: Array<{ id: string; nome: string }>;
  };
  usuarios: UsuarioAdmin[];
};

type UsuarioDetalheResponse = {
  usuario: {
    id: number;
    email: string;
    ativo: boolean;
    email_verificado_em?: string | null;
    created_at?: string | null;
    createdAt?: string | null;
  };
  assinatura_atual?: AssinaturaAdmin | null;
  assinaturas: AssinaturaAdmin[];
  pagamentos: PagamentoAdmin[];
  auditoria?: AcaoAdminAssinatura[];
  pdvs: Array<{
    id: number;
    nome: string;
    status: string;
    ativo: boolean;
    ultimo_acesso_em?: string | null;
    ultima_sincronizacao_em?: string | null;
  }>;
  subcontas: Array<{
    id: number;
    nome: string;
    email: string;
    ativo: boolean;
    ultimo_acesso_em?: string | null;
  }>;
  configuracao?: {
    fiscal_configurado: boolean;
  } | null;
  resumo: {
    inadimplente: boolean;
    fase_inadimplencia?: string | null;
    dias_em_atraso?: number;
    dias_para_bloqueio?: number | null;
    bloqueado?: boolean;
    motivo_inadimplencia?: string | null;
    regua_inadimplencia?: ReguaInadimplencia | null;
    ultimo_pagamento?: PagamentoAdmin | null;
    pdvs_ativos: number;
    subcontas_ativas: number;
    vendas_30_dias: number;
    total_vendas_30_dias_centavos: number;
    vendas_total: number;
    total_vendas_centavos: number;
  };
};

type SubscriptionActionType = "valor" | "trial" | "cancelar" | "pausar" | "reativar";

type SubscriptionActionForm = {
  assinaturaId: number;
  tipo: SubscriptionActionType;
  valor: string;
  diasGratis: string;
  motivo: string;
};

const statusOptions = [
  { label: "Todos", value: "todos" },
  { label: "Sem assinatura", value: "sem_assinatura" },
  { label: "Em dia", value: "em_dia" },
  { label: "Em atraso", value: "em_atraso" },
  { label: "Bloqueado", value: "bloqueado" }
];

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function normalizeStatus(status?: string | null) {
  if (!status) {
    return "Sem assinatura";
  }

  const labels: Record<string, string> = {
    ativa: "Ativa",
    pendente: "Pendente",
    falha: "Falha",
    pagamento_falhou: "Falha",
    pausada: "Pausada",
    cancelada: "Cancelada",
    substituida: "Substituída"
  };

  return labels[status] || status;
}

function getStatusClass(status?: string | null) {
  if (status === "ativa") {
    return "admin-status-pill admin-status-pill-success";
  }

  if (status === "pendente" || status === "pausada") {
    return "admin-status-pill admin-status-pill-warning";
  }

  if (status === "falha" || status === "pagamento_falhou" || status === "cancelada") {
    return "admin-status-pill admin-status-pill-danger";
  }

  return "admin-status-pill";
}

function normalizeBillingPhase(fase?: string | null) {
  const labels: Record<string, string> = {
    regular: "Regular",
    aviso: "Aviso",
    atrasada: "Atrasada",
    bloqueada: "Bloqueada"
  };

  return labels[String(fase || "").toLowerCase()] || "Sem régua";
}

function getBillingPhaseClass(fase?: string | null, bloqueado?: boolean) {
  if (bloqueado || fase === "bloqueada") {
    return "admin-status-pill admin-status-pill-danger";
  }

  if (fase === "atrasada" || fase === "aviso") {
    return "admin-status-pill admin-status-pill-warning";
  }

  if (fase === "regular") {
    return "admin-status-pill admin-status-pill-success";
  }

  return "admin-status-pill";
}

function getBillingPhaseHint(regua?: ReguaInadimplencia | null) {
  if (!regua || regua.fase === "regular") {
    return "Operação liberada";
  }

  if (regua.bloqueado) {
    return regua.mensagem || "Operação bloqueada";
  }

  if (regua.dias_em_atraso > 0) {
    return `${regua.dias_em_atraso} dia${regua.dias_em_atraso === 1 ? "" : "s"} em atraso`;
  }

  return regua.mensagem || "Pagamento vencido";
}

function parseCurrencyInputToCents(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return 0;
  }

  return Number(digits);
}

function formatCurrencyInput(value: string) {
  const cents = parseCurrencyInputToCents(value);

  if (cents <= 0) {
    return "";
  }

  return formatCurrency(cents, "BRL");
}

function formatCurrencyFieldFromCents(cents?: number | null) {
  if (!Number.isInteger(cents) || !cents || cents <= 0) {
    return "";
  }

  return formatCurrency(cents, "BRL");
}

function getPaymentDate(payment?: PagamentoAdmin | null) {
  return payment?.pago_em || payment?.processado_em || payment?.vencimento_em || payment?.created_at || payment?.createdAt || null;
}

function getPaymentLabel(status?: string | null) {
  const labels: Record<string, string> = {
    accredited: "Pago",
    approved: "Pago",
    authorized: "Pago",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    charged_back: "Estornado",
    in_process: "Pendente",
    paid: "Pago",
    pending: "Pendente",
    rejected: "Falhou",
    refunded: "Reembolsado"
  };

  return labels[String(status || "").toLowerCase()] || status || "Sem status";
}

function getAccountEmailStatus(usuario: UsuarioAdmin) {
  return usuario.email_verificado ? "E-mail verificado" : "E-mail pendente";
}

function getAccountEmailStatusClass(usuario: UsuarioAdmin) {
  return usuario.email_verificado ? "admin-email-status admin-email-status-verified" : "admin-email-status admin-email-status-pending";
}

function getAccountPlanClass(usuario: UsuarioAdmin) {
  return usuario.plano ? "admin-account-plan" : "admin-account-plan admin-account-plan-missing";
}

function getNextPaymentText(usuario: UsuarioAdmin) {
  const paymentDate = formatDate(usuario.proximo_pagamento_em);

  return paymentDate === "Sem data" ? "Próximo pagamento: sem data" : `Próximo pagamento: ${paymentDate}`;
}

function getPaymentStatusClass(status?: string | null) {
  const normalized = String(status || "").toLowerCase();

  if (["approved", "accredited", "authorized", "paid"].includes(normalized)) {
    return "admin-status-pill admin-status-pill-success";
  }

  if (["pending", "in_process"].includes(normalized)) {
    return "admin-status-pill admin-status-pill-warning";
  }

  if (["rejected", "cancelled", "canceled", "charged_back"].includes(normalized)) {
    return "admin-status-pill admin-status-pill-danger";
  }

  return "admin-status-pill";
}

function getAccountInitials(email: string) {
  const [name = ""] = email.split("@");
  const parts = name.replace(/[^a-zA-Z0-9._-]/g, " ").split(/[._\-\s]+/).filter(Boolean);
  const first = parts[0]?.[0] || email[0] || "C";
  const second = parts[1]?.[0] || parts[0]?.[1] || "";

  return `${first}${second}`.toUpperCase();
}

function getAuditDate(action: AcaoAdminAssinatura) {
  return action.created_at || action.createdAt || null;
}

function getAuditActionLabel(action?: string | null) {
  const labels: Record<string, string> = {
    ajustar_valor: "Valor ajustado",
    conceder_dias_gratis: "Dias grátis",
    status_cancelar: "Cancelamento",
    status_pausar: "Pausa",
    status_reativar: "Reativação"
  };

  return labels[String(action || "")] || action || "Ação";
}

function getSubscriptionActionTitle(tipo: SubscriptionActionType) {
  const labels: Record<SubscriptionActionType, string> = {
    cancelar: "Cancelar assinatura",
    pausar: "Pausar assinatura",
    reativar: "Reativar assinatura",
    trial: "Conceder dias grátis",
    valor: "Ajustar valor recorrente"
  };

  return labels[tipo];
}

function normalizeSearchValue(value?: string | number | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAccountBillingStatus(usuario: UsuarioAdmin) {
  const atrasoDias = Number(usuario.dias_em_atraso ?? usuario.regua_inadimplencia?.dias_em_atraso ?? 0);
  const fase = String(usuario.fase_inadimplencia || usuario.regua_inadimplencia?.fase || "").toLowerCase();
  const isBlocked = Boolean(usuario.bloqueado || usuario.regua_inadimplencia?.bloqueado || fase === "bloqueada" || atrasoDias > 7);
  const isLate = Boolean(usuario.inadimplente || atrasoDias > 0 || fase === "atrasada" || fase === "aviso");

  if (!usuario.assinatura_id || !usuario.assinatura_status) {
    return {
      value: "sem_assinatura",
      label: "Sem assinatura",
      className: "admin-status-pill admin-billing-status admin-billing-status-neutral",
    };
  }

  if (isBlocked) {
    return {
      value: "bloqueado",
      label: "Bloqueado",
      className: "admin-status-pill admin-billing-status admin-billing-status-danger",
    };
  }

  if (isLate) {
    return {
      value: "em_atraso",
      label: "Em atraso",
      className: "admin-status-pill admin-billing-status admin-billing-status-warning",
    };
  }

  return {
    value: "em_dia",
    label: "Em dia",
    className: "admin-status-pill admin-billing-status admin-billing-status-success",
  };
}

function matchesStatusFilter(usuario: UsuarioAdmin, status: string) {
  if (status === "todos") {
    return true;
  }

  return getAccountBillingStatus(usuario).value === status;
}

function buildUsuarioSearchText(usuario: UsuarioAdmin) {
  const ultimoPagamento = usuario.ultimo_pagamento;

  return [
    usuario.id,
    usuario.email,
    getAccountEmailStatus(usuario),
    usuario.email_verificado ? "email verificado confirmado" : "email pendente",
    usuario.ativo ? "conta ativa" : "conta inativa",
    usuario.plano || "Sem plano",
    usuario.plano_id,
    getNextPaymentText(usuario),
    formatCurrency(ultimoPagamento?.valor_centavos, ultimoPagamento?.moeda || "BRL"),
    getPaymentLabel(ultimoPagamento?.status),
    formatDate(getPaymentDate(ultimoPagamento)),
    getAccountBillingStatus(usuario).label,
    getAccountBillingStatus(usuario).value,
    normalizeStatus(usuario.assinatura_status),
    usuario.assinatura_status,
    normalizeBillingPhase(usuario.fase_inadimplencia),
    usuario.fase_inadimplencia,
    usuario.inadimplente ? "inadimplente" : "regular",
    getBillingPhaseHint(usuario.regua_inadimplencia),
    usuario.pdvs_ativos,
    `${usuario.pdvs_ativos} PDV`,
    usuario.subcontas_ativas,
    `${usuario.subcontas_ativas} subconta`,
    usuario.vendas_30_dias,
    `${usuario.vendas_30_dias} vendas`,
  ]
    .filter(value => value !== null && value !== undefined && value !== "")
    .join(" ");
}

export default function AdminUsuariosPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UsuarioDetalheResponse | null>(null);
  const [subscriptionActionForm, setSubscriptionActionForm] = useState<SubscriptionActionForm | null>(null);
  const [filters, setFilters] = useState({
    busca: "",
    status: "todos"
  });

  const usuariosVisiveis = useMemo(() => {
    const busca = normalizeSearchValue(filters.busca.trim());

    return usuarios.filter(usuario => {
      if (!matchesStatusFilter(usuario, filters.status)) {
        return false;
      }

      if (!busca) {
        return true;
      }

      return normalizeSearchValue(buildUsuarioSearchText(usuario)).includes(busca);
    });
  }, [filters.busca, filters.status, usuarios]);

  async function loadUsuarios(activeToken = token) {
    if (!activeToken) {
      return;
    }

    try {
      setIsLoading(true);
      const result = await apiGet<UsuariosResponse>("/admin/usuarios", { token: activeToken });

      setUsuarios(result.usuarios);
      setFeedback(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAdminSession();
        router.replace("/");
        return;
      }

      setFeedback(getErrorMessage(error, "Não foi possível carregar as contas."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const storedToken = getStoredAdminAuthToken();

    if (!storedToken) {
      router.replace("/");
      return;
    }

    setToken(storedToken);
    void loadUsuarios(storedToken);
  }, [router]);

  async function openUserDetails(usuarioId: number) {
    if (!token) {
      return;
    }

    try {
      setIsDetailLoading(true);
      setSubscriptionActionForm(null);
      setActionFeedback(null);
      const result = await apiGet<UsuarioDetalheResponse>(`/admin/usuarios/${usuarioId}`, { token });

      setSelectedUser(result);
      setFeedback(null);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível carregar os detalhes da conta."));
    } finally {
      setIsDetailLoading(false);
    }
  }

  function openSubscriptionAction(tipo: SubscriptionActionType, assinatura: AssinaturaAdmin) {
    setActionFeedback(null);
    setSubscriptionActionForm({
      assinaturaId: assinatura.id,
      tipo,
      valor: formatCurrencyFieldFromCents(assinatura.valor_recorrente_centavos ?? assinatura.valor_centavos),
      diasGratis: "30",
      motivo: ""
    });
  }

  async function submitSubscriptionAction() {
    if (!token || !selectedUser || !subscriptionActionForm || isActionSubmitting) {
      return;
    }

    const usuarioId = selectedUser.usuario.id;
    const assinaturaId = subscriptionActionForm.assinaturaId;
    const motivo = subscriptionActionForm.motivo.trim();

    try {
      setIsActionSubmitting(true);
      setActionFeedback(null);

      if (subscriptionActionForm.tipo === "valor") {
        const valorCentavos = parseCurrencyInputToCents(subscriptionActionForm.valor);

        if (valorCentavos <= 0) {
          setActionFeedback("Informe um valor recorrente válido.");
          return;
        }

        await apiPost(`/admin/usuarios/${usuarioId}/assinaturas/${assinaturaId}/valor`, {
          motivo,
          valor_centavos: valorCentavos
        }, { token });
      } else if (subscriptionActionForm.tipo === "trial") {
        const diasGratis = Math.max(0, Math.floor(Number(subscriptionActionForm.diasGratis)));

        if (!Number.isFinite(diasGratis) || diasGratis <= 0) {
          setActionFeedback("Informe a quantidade de dias grátis.");
          return;
        }

        await apiPost(`/admin/usuarios/${usuarioId}/assinaturas/${assinaturaId}/trial`, {
          dias_gratis: diasGratis,
          motivo
        }, { token });
      } else {
        await apiPost(`/admin/usuarios/${usuarioId}/assinaturas/${assinaturaId}/status`, {
          acao: subscriptionActionForm.tipo,
          motivo
        }, { token });
      }

      setSubscriptionActionForm(null);
      await openUserDetails(usuarioId);
      await loadUsuarios(token);
    } catch (error) {
      setActionFeedback(getErrorMessage(error, "Não foi possível concluir a ação administrativa."));
    } finally {
      setIsActionSubmitting(false);
    }
  }

  const assinaturaAtualDetalhe = selectedUser?.assinatura_atual || null;

  return (
    <AdminFrame>
      <main className="admin-content-page">
        <section className="admin-content-shell admin-content-shell-wide" aria-labelledby="admin-usuarios-title">
          <header className="admin-page-head">
            <span className="admin-page-icon">
              <UsersRound aria-hidden="true" size={28} />
            </span>
            <div>
              <h1 id="admin-usuarios-title">Contas</h1>
              <p>{usuariosVisiveis.length} registro{usuariosVisiveis.length === 1 ? "" : "s"} encontrado{usuariosVisiveis.length === 1 ? "" : "s"}</p>
            </div>
          </header>

          <section className="admin-list-controls admin-account-controls" aria-label="Filtros de contas">
            <div className="admin-tabs" role="tablist" aria-label="Status de pagamento">
              {statusOptions.map(option => (
                <button
                  key={option.value}
                  className={filters.status === option.value ? "admin-segmented-active" : ""}
                  type="button"
                  onClick={() => setFilters(current => ({ ...current, status: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="admin-filter-actions">
              <label className="admin-search-field">
                <Search aria-hidden="true" size={17} />
                <input
                  value={filters.busca}
                  onChange={event => setFilters(current => ({ ...current, busca: event.currentTarget.value }))}
                  placeholder="Buscar por e-mail, plano, status..."
                />
              </label>
            </div>
          </section>

          {feedback ? (
            <div className="admin-feedback admin-feedback-error" role="alert">
              <AlertTriangle aria-hidden="true" size={17} />
              <span>{feedback}</span>
            </div>
          ) : null}

          <section className="admin-panel" aria-label="Lista de contas cadastradas">
            {isLoading ? (
              <div className="admin-table-skeleton" aria-live="polite">
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : usuariosVisiveis.length === 0 ? (
              <div className="admin-empty-state">
                <UsersRound aria-hidden="true" size={21} />
                <span>Nenhuma conta encontrada para os filtros atuais.</span>
              </div>
            ) : (
              <div className="admin-table-scroll">
                <table className="admin-data-table admin-accounts-table">
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Plano</th>
                      <th>Valor</th>
                      <th>Uso</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {usuariosVisiveis.map(usuario => (
                      <tr key={usuario.id}>
                        <td>
                          <span className="admin-account-cell">
                            <strong>{usuario.email}</strong>
                            <small className={getAccountEmailStatusClass(usuario)}>{getAccountEmailStatus(usuario)}</small>
                          </span>
                        </td>
                        <td>
                          <span className={getAccountPlanClass(usuario)}>
                            <strong>{usuario.plano || "Sem plano"}</strong>
                            <small>{getNextPaymentText(usuario)}</small>
                            {usuario.alteracao_agendada ? <small>Troca agendada em {formatDate(usuario.alteracao_agendada.aplicar_em)}</small> : null}
                          </span>
                        </td>
                        <td>
                          <strong>{formatCurrency(usuario.ultimo_pagamento?.valor_centavos, usuario.ultimo_pagamento?.moeda || "BRL")}</strong>
                          <small>{getPaymentLabel(usuario.ultimo_pagamento?.status)} · {formatDate(getPaymentDate(usuario.ultimo_pagamento))}</small>
                        </td>
                        <td>
                          <span className="admin-usage-cell">
                            <small>{usuario.pdvs_ativos} PDV</small>
                            <small>{usuario.subcontas_ativas} subconta</small>
                            <small>{usuario.vendas_30_dias} vendas</small>
                          </span>
                        </td>
                        <td>
                          {(() => {
                            const billingStatus = getAccountBillingStatus(usuario);

                            return <span className={billingStatus.className}>{billingStatus.label}</span>;
                          })()}
                        </td>
                        <td>
                          <button
                            className="admin-icon-button"
                            disabled={isDetailLoading}
                            type="button"
                            onClick={() => void openUserDetails(usuario.id)}
                            aria-label={`Ver detalhes de ${usuario.email}`}
                          >
                            <Eye aria-hidden="true" size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        {selectedUser ? (
          <div className="admin-dialog-backdrop" role="presentation">
            <section className="admin-dialog-card admin-account-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-account-detail-title">
              <header className="admin-dialog-head">
                <div>
                  <h2 id="admin-account-detail-title">{selectedUser.usuario.email}</h2>
                  <p>Conta #{selectedUser.usuario.id} criada em {formatDate(selectedUser.usuario.created_at || selectedUser.usuario.createdAt)}.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setSubscriptionActionForm(null);
                    setActionFeedback(null);
                  }}
                  aria-label="Fechar detalhes da conta"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </header>

              <div className="admin-detail-metrics" aria-label="Resumo da conta">
                <span>
                  <UserRound aria-hidden="true" size={17} />
                  <strong>{selectedUser.assinatura_atual?.plano_nome || "Sem plano"}</strong>
                  <small>{normalizeStatus(selectedUser.assinatura_atual?.status)}</small>
                </span>
                <span>
                  <CreditCard aria-hidden="true" size={17} />
                  <strong>{formatDate(selectedUser.assinatura_atual?.proximo_pagamento_em)}</strong>
                  <small>Próximo pagamento</small>
                </span>
                <span>
                  <Monitor aria-hidden="true" size={17} />
                  <strong>{selectedUser.resumo.pdvs_ativos} / {selectedUser.resumo.subcontas_ativas}</strong>
                  <small>PDVs / subcontas</small>
                </span>
                <span>
                  <CircleDollarSign aria-hidden="true" size={17} />
                  <strong>{formatCurrency(selectedUser.resumo.total_vendas_30_dias_centavos)}</strong>
                  <small>{selectedUser.resumo.vendas_30_dias} vendas em 30 dias</small>
                </span>
              </div>

              {selectedUser.resumo.regua_inadimplencia && selectedUser.resumo.regua_inadimplencia.fase !== "regular" ? (
                <div className={selectedUser.resumo.regua_inadimplencia.bloqueado ? "admin-account-alert admin-account-alert-danger" : "admin-account-alert"}>
                  {selectedUser.resumo.regua_inadimplencia.bloqueado ? <Ban aria-hidden="true" size={17} /> : <AlertTriangle aria-hidden="true" size={17} />}
                  <span>
                    <strong>{normalizeBillingPhase(selectedUser.resumo.regua_inadimplencia.fase)}</strong>
                    <small>
                      {getBillingPhaseHint(selectedUser.resumo.regua_inadimplencia)}
                      {selectedUser.resumo.regua_inadimplencia.bloqueia_em && !selectedUser.resumo.regua_inadimplencia.bloqueado
                        ? ` · bloqueio em ${formatDate(selectedUser.resumo.regua_inadimplencia.bloqueia_em)}`
                        : ""}
                    </small>
                  </span>
                </div>
              ) : null}

              {selectedUser.assinatura_atual?.alteracao_agendada ? (
                <div className="admin-account-alert">
                  <AlertTriangle aria-hidden="true" size={17} />
                  <span>
                    <strong>Troca agendada</strong>
                    <small>
                      Plano {selectedUser.assinatura_atual.alteracao_agendada.plano_novo} em {formatDate(selectedUser.assinatura_atual.alteracao_agendada.aplicar_em)}.
                    </small>
                  </span>
                </div>
              ) : null}

              {assinaturaAtualDetalhe ? (
                <section className="admin-detail-section admin-account-actions-section" aria-label="Ações administrativas da assinatura">
                  <header>
                    <h3>Ações administrativas</h3>
                    <small>Assinatura #{assinaturaAtualDetalhe.id}</small>
                  </header>

                  <div className="admin-subscription-actions">
                    <button type="button" onClick={() => openSubscriptionAction("valor", assinaturaAtualDetalhe)}>
                      <CircleDollarSign aria-hidden="true" size={16} />
                      Ajustar valor
                    </button>
                    <button type="button" onClick={() => openSubscriptionAction("trial", assinaturaAtualDetalhe)}>
                      <TimerReset aria-hidden="true" size={16} />
                      Dias grátis
                    </button>
                    {assinaturaAtualDetalhe.status === "pausada" || assinaturaAtualDetalhe.status === "cancelada" ? (
                      <button type="button" onClick={() => openSubscriptionAction("reativar", assinaturaAtualDetalhe)}>
                        <PlayCircle aria-hidden="true" size={16} />
                        Reativar
                      </button>
                    ) : (
                      <button type="button" onClick={() => openSubscriptionAction("pausar", assinaturaAtualDetalhe)}>
                        <PauseCircle aria-hidden="true" size={16} />
                        Pausar
                      </button>
                    )}
                    <button className="admin-subscription-action-danger" type="button" onClick={() => openSubscriptionAction("cancelar", assinaturaAtualDetalhe)}>
                      <Ban aria-hidden="true" size={16} />
                      Cancelar
                    </button>
                  </div>

                  {subscriptionActionForm ? (
                    <div className="admin-inline-action-form">
                      <header>
                        <strong>{getSubscriptionActionTitle(subscriptionActionForm.tipo)}</strong>
                        <button type="button" onClick={() => setSubscriptionActionForm(null)} aria-label="Cancelar ação administrativa">
                          <X aria-hidden="true" size={15} />
                        </button>
                      </header>

                      {subscriptionActionForm.tipo === "valor" ? (
                        <label>
                          <span>Valor recorrente</span>
                          <input
                            inputMode="numeric"
                            value={subscriptionActionForm.valor}
                            onChange={event => setSubscriptionActionForm(current => current ? {
                              ...current,
                              valor: formatCurrencyInput(event.currentTarget.value)
                            } : current)}
                            placeholder="R$ 0,00"
                          />
                        </label>
                      ) : null}

                      {subscriptionActionForm.tipo === "trial" ? (
                        <label>
                          <span>Dias grátis</span>
                          <input
                            inputMode="numeric"
                            min="1"
                            type="number"
                            value={subscriptionActionForm.diasGratis}
                            onChange={event => setSubscriptionActionForm(current => current ? {
                              ...current,
                              diasGratis: event.currentTarget.value
                            } : current)}
                          />
                        </label>
                      ) : null}

                      <label>
                        <span>Motivo</span>
                        <textarea
                          value={subscriptionActionForm.motivo}
                          onChange={event => setSubscriptionActionForm(current => current ? {
                            ...current,
                            motivo: event.currentTarget.value
                          } : current)}
                          placeholder="Registro interno da decisão"
                          rows={3}
                        />
                      </label>

                      {actionFeedback ? (
                        <div className="admin-feedback admin-feedback-error" role="alert">
                          <AlertTriangle aria-hidden="true" size={16} />
                          <span>{actionFeedback}</span>
                        </div>
                      ) : null}

                      <div className="admin-inline-action-footer">
                        <button className="admin-secondary-button" type="button" onClick={() => setSubscriptionActionForm(null)}>
                          Cancelar
                        </button>
                        <button
                          className={subscriptionActionForm.tipo === "cancelar" ? "admin-danger-button" : "admin-confirm-button"}
                          disabled={isActionSubmitting}
                          type="button"
                          onClick={() => void submitSubscriptionAction()}
                        >
                          <Save aria-hidden="true" size={16} />
                          Confirmar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}

              <div className="admin-detail-grid">
                <section className="admin-detail-section" aria-label="Histórico de pagamentos">
                  <header>
                    <h3>Pagamentos</h3>
                    <small>{selectedUser.pagamentos.length} registro{selectedUser.pagamentos.length === 1 ? "" : "s"}</small>
                  </header>
                  <div className="admin-compact-list">
                    {selectedUser.pagamentos.slice(0, 8).map(payment => (
                      <div key={payment.id}>
                        <span>
                          <strong>{formatCurrency(payment.valor_centavos, payment.moeda || "BRL")}</strong>
                          <small>{formatDate(getPaymentDate(payment))}</small>
                        </span>
                        <em className={getPaymentStatusClass(payment.status)}>{getPaymentLabel(payment.status)}</em>
                      </div>
                    ))}
                    {selectedUser.pagamentos.length === 0 ? <p>Nenhum pagamento registrado.</p> : null}
                  </div>
                </section>

                <section className="admin-detail-section" aria-label="Assinaturas da conta">
                  <header>
                    <h3>Assinaturas</h3>
                    <small>{selectedUser.assinaturas.length} vínculo{selectedUser.assinaturas.length === 1 ? "" : "s"}</small>
                  </header>
                  <div className="admin-compact-list">
                    {selectedUser.assinaturas.slice(0, 6).map(assinatura => (
                      <div key={assinatura.id}>
                        <span>
                          <strong>{assinatura.plano_nome || assinatura.plano}</strong>
                          <small>{formatCurrency(assinatura.valor_recorrente_centavos ?? assinatura.valor_centavos, assinatura.moeda || "BRL")}</small>
                        </span>
                        <em className={getStatusClass(assinatura.status)}>{normalizeStatus(assinatura.status)}</em>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-detail-section" aria-label="PDVs da conta">
                  <header>
                    <h3>PDVs</h3>
                    <small>{selectedUser.pdvs.length} cadastro{selectedUser.pdvs.length === 1 ? "" : "s"}</small>
                  </header>
                  <div className="admin-compact-list">
                    {selectedUser.pdvs.slice(0, 6).map(pdv => (
                      <div key={pdv.id}>
                        <span>
                          <strong>{pdv.nome}</strong>
                          <small>{formatDate(pdv.ultima_sincronizacao_em || pdv.ultimo_acesso_em)}</small>
                        </span>
                        <em className={pdv.ativo ? "admin-status-pill admin-status-pill-success" : "admin-status-pill"}>{pdv.ativo ? "Ativo" : "Inativo"}</em>
                      </div>
                    ))}
                    {selectedUser.pdvs.length === 0 ? <p>Nenhum PDV cadastrado.</p> : null}
                  </div>
                </section>

                <section className="admin-detail-section" aria-label="Subcontas da conta">
                  <header>
                    <h3>Subcontas</h3>
                    <small>{selectedUser.subcontas.length} acesso{selectedUser.subcontas.length === 1 ? "" : "s"}</small>
                  </header>
                  <div className="admin-compact-list">
                    {selectedUser.subcontas.slice(0, 6).map(subconta => (
                      <div key={subconta.id}>
                        <span>
                          <strong>{subconta.nome}</strong>
                          <small>{subconta.email}</small>
                        </span>
                        <em className={subconta.ativo ? "admin-status-pill admin-status-pill-success" : "admin-status-pill"}>{subconta.ativo ? "Ativa" : "Inativa"}</em>
                      </div>
                    ))}
                    {selectedUser.subcontas.length === 0 ? <p>Nenhuma subconta cadastrada.</p> : null}
                  </div>
                </section>

                <section className="admin-detail-section admin-detail-section-wide" aria-label="Auditoria administrativa">
                  <header>
                    <h3>Auditoria</h3>
                    <small>{selectedUser.auditoria?.length || 0} ação{selectedUser.auditoria?.length === 1 ? "" : "ões"}</small>
                  </header>
                  <div className="admin-compact-list">
                    {(selectedUser.auditoria || []).slice(0, 8).map(action => (
                      <div key={action.id}>
                        <span>
                          <strong>{getAuditActionLabel(action.acao)}</strong>
                          <small>
                            {formatDate(getAuditDate(action))}
                            {action.administrador?.nome ? ` · ${action.administrador.nome}` : ""}
                          </small>
                          {action.motivo ? <small>{action.motivo}</small> : null}
                        </span>
                        <em className="admin-status-pill">{action.status}</em>
                      </div>
                    ))}
                    {(selectedUser.auditoria || []).length === 0 ? <p>Nenhuma ação administrativa registrada.</p> : null}
                  </div>
                </section>
              </div>
            </section>
          </div>
        ) : null}
      </main>
    </AdminFrame>
  );
}
