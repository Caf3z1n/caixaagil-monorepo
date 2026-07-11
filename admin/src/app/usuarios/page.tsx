"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  CircleDollarSign,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  MailCheck,
  Monitor,
  Search,
  ShieldCheck,
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

type RemoteSupportSummary = {
  provider?: string | null;
  rustdesk_id?: string | null;
  servidor?: string | null;
  versao?: string | null;
  status?: string | null;
  configurado_em?: string | null;
  ultimo_check_em?: string | null;
  erro?: string | null;
  senha_configurada?: boolean;
};

type PdvAdmin = {
  id: number;
  nome: string;
  status: string;
  ativo: boolean;
  ultimo_acesso_em?: string | null;
  ultima_sincronizacao_em?: string | null;
  suporte_remoto?: RemoteSupportSummary | null;
};

type RemoteSupportCredentialsResponse = RemoteSupportSummary & {
  senha?: string | null;
};

type RemoteSupportCredentialState = {
  rustdesk_id?: string | null;
  senha?: string | null;
  loading?: boolean;
  showPassword?: boolean;
  error?: string | null;
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
  pdvs: PdvAdmin[];
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

type AccountDetailView = "pagamentos" | "assinaturas" | "pdvs" | "subcontas";

type AccountActionFeedback = {
  tone: "success" | "error";
  message: string;
};

type VerifyUserEmailResponse = {
  message?: string;
  usuario?: {
    email_verificado?: boolean;
    email_verificado_em?: string | null;
  };
};

type SupportAccessResponse = {
  acesso_url: string;
  codigo: string;
  codigo_expira_em: string;
  sessao_duracao_segundos: number;
  usuario: {
    id: number;
    email: string;
  };
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
    cancelamento_agendado: "Cancelamento agendado",
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
    processed: "Pago",
    rejected: "Falhou",
    refunded: "Reembolsado",
    scheduled: "Agendado"
  };

  return labels[String(status || "").toLowerCase()] || status || "Sem status";
}

function getPaymentMethodLabel(method?: string | null) {
  const labels: Record<string, string> = {
    account_money: "Saldo Mercado Pago",
    card: "Cartão",
    master: "Mastercard",
    mastercard: "Mastercard",
    pix: "Pix",
    visa: "Visa"
  };

  return labels[String(method || "").toLowerCase()] || method || null;
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

  if (["approved", "accredited", "authorized", "paid", "processed"].includes(normalized)) {
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

function getRemoteSupportStatusValue(support?: RemoteSupportSummary | null) {
  return String(support?.status || "nao_configurado").trim().toLowerCase();
}

function getRemoteSupportStatusLabel(support?: RemoteSupportSummary | null) {
  const status = getRemoteSupportStatusValue(support);

  if (status === "configurado" && support?.rustdesk_id) {
    return "Suporte configurado";
  }

  if (status === "erro") {
    return "Suporte com erro";
  }

  if (status === "configurando") {
    return "Suporte em configuração";
  }

  return "Suporte pendente";
}

function getRemoteSupportStatusClass(support?: RemoteSupportSummary | null) {
  const status = getRemoteSupportStatusValue(support);

  if (status === "configurado" && support?.rustdesk_id) {
    return "admin-status-pill admin-status-pill-success";
  }

  if (status === "configurando") {
    return "admin-status-pill admin-status-pill-warning";
  }

  return "admin-status-pill admin-status-pill-danger";
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
  const [isEmailVerifying, setIsEmailVerifying] = useState(false);
  const [isSupportAccessGenerating, setIsSupportAccessGenerating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [accountActionFeedback, setAccountActionFeedback] = useState<AccountActionFeedback | null>(null);
  const [selectedUser, setSelectedUser] = useState<UsuarioDetalheResponse | null>(null);
  const [supportAccess, setSupportAccess] = useState<SupportAccessResponse | null>(null);
  const [supportAccessClock, setSupportAccessClock] = useState(() => Date.now());
  const [remoteSupportCredentialsByPdv, setRemoteSupportCredentialsByPdv] = useState<Record<number, RemoteSupportCredentialState>>({});
  const [accountDetailView, setAccountDetailView] = useState<AccountDetailView | null>(null);
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

  const supportAccessSecondsRemaining = supportAccess
    ? Math.max(0, Math.ceil((new Date(supportAccess.codigo_expira_em).getTime() - supportAccessClock) / 1000))
    : 0;

  useEffect(() => {
    if (!supportAccess) {
      return undefined;
    }

    setSupportAccessClock(Date.now());
    const intervalId = window.setInterval(() => setSupportAccessClock(Date.now()), 1000);

    return () => window.clearInterval(intervalId);
  }, [supportAccess]);

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
      setAccountDetailView(null);
      setRemoteSupportCredentialsByPdv({});
      setSupportAccess(null);
      setActionFeedback(null);
      setAccountActionFeedback(null);
      const result = await apiGet<UsuarioDetalheResponse>(`/admin/usuarios/${usuarioId}`, { token });

      setSelectedUser(result);
      setFeedback(null);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível carregar os detalhes da conta."));
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function generateSupportAccess() {
    if (!token || !selectedUser || isSupportAccessGenerating) {
      return;
    }

    try {
      setIsSupportAccessGenerating(true);
      setAccountActionFeedback(null);
      const result = await apiPost<SupportAccessResponse>(
        `/admin/usuarios/${selectedUser.usuario.id}/acesso-suporte`,
        {},
        { token }
      );

      setSupportAccess(result);
      setSupportAccessClock(Date.now());
    } catch (error) {
      setAccountActionFeedback({
        tone: "error",
        message: getErrorMessage(error, "Não foi possível gerar o acesso administrativo.")
      });
    } finally {
      setIsSupportAccessGenerating(false);
    }
  }

  async function copySupportAccessCode() {
    if (!supportAccess) {
      return;
    }

    try {
      await navigator.clipboard.writeText(supportAccess.codigo);
      setAccountActionFeedback({ tone: "success", message: "Código temporário copiado." });
    } catch {
      setAccountActionFeedback({ tone: "error", message: `Código temporário: ${supportAccess.codigo}` });
    }
  }

  function openSupportAccess() {
    if (!supportAccess || supportAccessSecondsRemaining <= 0) {
      setAccountActionFeedback({
        tone: "error",
        message: "O código expirou. Gere um novo acesso administrativo."
      });
      return;
    }

    window.open(supportAccess.acesso_url, "_blank", "noopener,noreferrer");
  }

  async function verifySelectedUserEmail() {
    if (!token || !selectedUser || isEmailVerifying) {
      return;
    }

    const usuarioId = selectedUser.usuario.id;

    if (selectedUser.usuario.email_verificado_em) {
      setAccountActionFeedback({
        tone: "success",
        message: "Este e-mail já está verificado."
      });
      return;
    }

    try {
      setIsEmailVerifying(true);
      setAccountActionFeedback(null);

      const result = await apiPost<VerifyUserEmailResponse>(
        `/admin/usuarios/${usuarioId}/verificar-email`,
        {},
        { token }
      );
      const verifiedAt = result.usuario?.email_verificado_em || new Date().toISOString();

      setSelectedUser(current => current && current.usuario.id === usuarioId
        ? {
            ...current,
            usuario: {
              ...current.usuario,
              email_verificado_em: verifiedAt
            }
          }
        : current);
      setUsuarios(current => current.map(usuario => usuario.id === usuarioId
        ? {
            ...usuario,
            email_verificado: true
          }
        : usuario));
      setAccountActionFeedback({
        tone: "success",
        message: result.message || "E-mail marcado como verificado."
      });
    } catch (error) {
      setAccountActionFeedback({
        tone: "error",
        message: getErrorMessage(error, "Não foi possível verificar este e-mail.")
      });
    } finally {
      setIsEmailVerifying(false);
    }
  }

  async function copyAdminValue(value: string | null | undefined, successMessage: string, fallbackLabel: string) {
    const trimmedValue = String(value || "").trim();

    if (!trimmedValue) {
      setActionFeedback(`${fallbackLabel} indisponível.`);
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmedValue);
      setActionFeedback(successMessage);
    } catch {
      setActionFeedback(`${fallbackLabel}: ${trimmedValue}`);
    }
  }

  async function revealRemoteSupportPassword(pdv: PdvAdmin) {
    if (!token || !selectedUser) {
      setActionFeedback("Entre novamente para ver a senha do suporte remoto.");
      return;
    }

    const current = remoteSupportCredentialsByPdv[pdv.id];

    if (current?.senha) {
      setRemoteSupportCredentialsByPdv(previous => ({
        ...previous,
        [pdv.id]: {
          ...current,
          showPassword: !current.showPassword,
        },
      }));
      return;
    }

    setRemoteSupportCredentialsByPdv(previous => ({
      ...previous,
      [pdv.id]: {
        rustdesk_id: pdv.suporte_remoto?.rustdesk_id,
        loading: true,
        showPassword: false,
        error: null,
      },
    }));
    setActionFeedback(null);

    try {
      const credentials = await apiGet<RemoteSupportCredentialsResponse>(
        `/admin/usuarios/${selectedUser.usuario.id}/pdvs/${pdv.id}/suporte-remoto/credenciais`,
        { token }
      );

      setRemoteSupportCredentialsByPdv(previous => ({
        ...previous,
        [pdv.id]: {
          rustdesk_id: credentials.rustdesk_id,
          senha: credentials.senha,
          loading: false,
          showPassword: true,
          error: null,
        },
      }));
    } catch (error) {
      setRemoteSupportCredentialsByPdv(previous => ({
        ...previous,
        [pdv.id]: {
          rustdesk_id: pdv.suporte_remoto?.rustdesk_id,
          loading: false,
          showPassword: false,
          error: getErrorMessage(error, "Não foi possível carregar a senha."),
        },
      }));
    }
  }

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
                    setAccountDetailView(null);
                    setRemoteSupportCredentialsByPdv({});
                    setSupportAccess(null);
                    setActionFeedback(null);
                    setAccountActionFeedback(null);
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
                  <small>
                    {selectedUser.assinatura_atual
                      ? `${normalizeStatus(selectedUser.assinatura_atual.status)} · ${formatCurrency(selectedUser.assinatura_atual.valor_recorrente_centavos ?? selectedUser.assinatura_atual.valor_centavos, selectedUser.assinatura_atual.moeda || "BRL")}`
                      : "Nenhuma assinatura vigente"}
                  </small>
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

              <section className="admin-detail-section admin-account-actions-section" aria-label="Acesso à conta">
                <header>
                  <h3>Acesso</h3>
                  <small>
                    {selectedUser.usuario.email_verificado_em
                      ? `E-mail verificado em ${formatDate(selectedUser.usuario.email_verificado_em)}`
                      : "E-mail pendente"}
                  </small>
                </header>

                <div className="admin-subscription-actions">
                  <button
                    disabled={isSupportAccessGenerating || !selectedUser.usuario.ativo}
                    type="button"
                    onClick={() => void generateSupportAccess()}
                  >
                    {isSupportAccessGenerating ? (
                      <LoaderCircle aria-hidden="true" className="admin-spin" size={16} />
                    ) : (
                      <ShieldCheck aria-hidden="true" size={16} />
                    )}
                    {supportAccess ? "Gerar novo acesso" : "Acessar conta"}
                  </button>
                  <button
                    className={selectedUser.usuario.email_verificado_em ? "admin-account-action-verified" : ""}
                    disabled={isEmailVerifying || Boolean(selectedUser.usuario.email_verificado_em)}
                    type="button"
                    onClick={() => void verifySelectedUserEmail()}
                  >
                    {isEmailVerifying ? (
                      <LoaderCircle aria-hidden="true" className="admin-spin" size={16} />
                    ) : (
                      <MailCheck aria-hidden="true" size={16} />
                    )}
                    {selectedUser.usuario.email_verificado_em ? "E-mail verificado" : "Verificar e-mail"}
                  </button>
                </div>

                {supportAccess ? (
                  <div className={supportAccessSecondsRemaining > 0 ? "admin-support-access" : "admin-support-access admin-support-access-expired"}>
                    <span className="admin-support-access-icon">
                      <KeyRound aria-hidden="true" size={18} />
                    </span>
                    <span className="admin-support-access-copy">
                      <small>Código temporário</small>
                      <strong>{supportAccess.codigo}</strong>
                      <em>
                        {supportAccessSecondsRemaining > 0
                          ? `Expira em ${supportAccessSecondsRemaining}s · sessão de 30 minutos`
                          : "Código expirado"}
                      </em>
                    </span>
                    <span className="admin-support-access-actions">
                      <button type="button" onClick={() => void copySupportAccessCode()}>
                        <Copy aria-hidden="true" size={15} />
                        Copiar
                      </button>
                      <button
                        className="admin-support-access-open"
                        disabled={supportAccessSecondsRemaining <= 0}
                        type="button"
                        onClick={openSupportAccess}
                      >
                        <ExternalLink aria-hidden="true" size={15} />
                        Abrir conta
                      </button>
                    </span>
                  </div>
                ) : null}

                {accountActionFeedback ? (
                  <div className={`admin-feedback admin-feedback-${accountActionFeedback.tone}`} role={accountActionFeedback.tone === "error" ? "alert" : "status"}>
                    {accountActionFeedback.tone === "error" ? (
                      <AlertTriangle aria-hidden="true" size={16} />
                    ) : (
                      <MailCheck aria-hidden="true" size={16} />
                    )}
                    <span>{accountActionFeedback.message}</span>
                  </div>
                ) : null}
              </section>

              <nav className="admin-account-detail-links" aria-label="Detalhes relacionados à conta">
                <button type="button" onClick={() => setAccountDetailView("pagamentos")}>
                  <span className="admin-account-detail-link-icon"><CircleDollarSign aria-hidden="true" size={18} /></span>
                  <span>
                    <strong>Pagamentos</strong>
                    <small>
                      {selectedUser.pagamentos.length > 0
                        ? `${selectedUser.pagamentos.length} registro${selectedUser.pagamentos.length === 1 ? "" : "s"} · último em ${formatDate(getPaymentDate(selectedUser.pagamentos[0]))}`
                        : "Nenhum pagamento registrado"}
                    </small>
                  </span>
                  <em>{selectedUser.pagamentos.length}</em>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
                <button type="button" onClick={() => setAccountDetailView("assinaturas")}>
                  <span className="admin-account-detail-link-icon"><CreditCard aria-hidden="true" size={18} /></span>
                  <span>
                    <strong>Assinaturas</strong>
                    <small>{selectedUser.assinatura_atual?.plano_nome || "Nenhum plano vigente"}</small>
                  </span>
                  <em>{selectedUser.assinaturas.length}</em>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
                <button type="button" onClick={() => {
                  setActionFeedback(null);
                  setAccountDetailView("pdvs");
                }}>
                  <span className="admin-account-detail-link-icon"><Monitor aria-hidden="true" size={18} /></span>
                  <span>
                    <strong>PDVs</strong>
                    <small>{selectedUser.resumo.pdvs_ativos} ativo{selectedUser.resumo.pdvs_ativos === 1 ? "" : "s"} de {selectedUser.pdvs.length}</small>
                  </span>
                  <em>{selectedUser.pdvs.length}</em>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
                <button type="button" onClick={() => setAccountDetailView("subcontas")}>
                  <span className="admin-account-detail-link-icon"><UsersRound aria-hidden="true" size={18} /></span>
                  <span>
                    <strong>Subcontas</strong>
                    <small>{selectedUser.resumo.subcontas_ativas} ativa{selectedUser.resumo.subcontas_ativas === 1 ? "" : "s"} de {selectedUser.subcontas.length}</small>
                  </span>
                  <em>{selectedUser.subcontas.length}</em>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </nav>
            </section>

            {accountDetailView ? (
              <div className="admin-subdialog-backdrop" role="presentation">
                <section className="admin-dialog-card admin-account-subdialog" role="dialog" aria-modal="true" aria-labelledby="admin-account-subdialog-title">
                  <header className="admin-dialog-head">
                    <div>
                      <span className="admin-subdialog-eyebrow">{selectedUser.usuario.email}</span>
                      <h2 id="admin-account-subdialog-title">
                        {accountDetailView === "pagamentos" ? "Pagamentos" : null}
                        {accountDetailView === "assinaturas" ? "Assinaturas" : null}
                        {accountDetailView === "pdvs" ? "PDVs" : null}
                        {accountDetailView === "subcontas" ? "Subcontas" : null}
                      </h2>
                      <p>
                        {accountDetailView === "pagamentos" ? `${selectedUser.pagamentos.length} registro${selectedUser.pagamentos.length === 1 ? "" : "s"}` : null}
                        {accountDetailView === "assinaturas" ? `${selectedUser.assinaturas.length} vínculo${selectedUser.assinaturas.length === 1 ? "" : "s"}` : null}
                        {accountDetailView === "pdvs" ? `${selectedUser.pdvs.length} equipamento${selectedUser.pdvs.length === 1 ? "" : "s"}` : null}
                        {accountDetailView === "subcontas" ? `${selectedUser.subcontas.length} acesso${selectedUser.subcontas.length === 1 ? "" : "s"}` : null}
                      </p>
                    </div>
                    <button type="button" onClick={() => setAccountDetailView(null)} aria-label="Fechar detalhes">
                      <X aria-hidden="true" size={18} />
                    </button>
                  </header>

                  <div className="admin-subdialog-content">
                    {accountDetailView === "pagamentos" ? (
                      <div className="admin-compact-list admin-subdialog-list">
                        {selectedUser.pagamentos.map(payment => (
                          <div key={payment.id}>
                            <span>
                              <strong>{formatCurrency(payment.valor_centavos, payment.moeda || "BRL")}</strong>
                              <small>{formatDate(getPaymentDate(payment))}{payment.forma_pagamento ? ` · ${getPaymentMethodLabel(payment.forma_pagamento)}` : ""}</small>
                            </span>
                            <em className={getPaymentStatusClass(payment.status)}>{getPaymentLabel(payment.status)}</em>
                          </div>
                        ))}
                        {selectedUser.pagamentos.length === 0 ? <p className="admin-subdialog-empty">Nenhum pagamento registrado.</p> : null}
                      </div>
                    ) : null}

                    {accountDetailView === "assinaturas" ? (
                      <div className="admin-compact-list admin-subdialog-list">
                        {selectedUser.assinaturas.map(assinatura => (
                          <div key={assinatura.id}>
                            <span>
                              <strong>{assinatura.plano_nome || assinatura.plano}</strong>
                              <small>
                                Assinatura #{assinatura.id} · {formatCurrency(assinatura.valor_recorrente_centavos ?? assinatura.valor_centavos, assinatura.moeda || "BRL")}
                                {assinatura.proximo_pagamento_em ? ` · próxima em ${formatDate(assinatura.proximo_pagamento_em)}` : ""}
                              </small>
                            </span>
                            <em className={getStatusClass(assinatura.status)}>{normalizeStatus(assinatura.status)}</em>
                          </div>
                        ))}
                        {selectedUser.assinaturas.length === 0 ? <p className="admin-subdialog-empty">Nenhuma assinatura vinculada.</p> : null}
                      </div>
                    ) : null}

                    {accountDetailView === "pdvs" ? (
                      <>
                        {actionFeedback ? <div className="admin-feedback" role="status"><span>{actionFeedback}</span></div> : null}
                        <div className="admin-compact-list admin-remote-support-list admin-subdialog-list">
                          {selectedUser.pdvs.map(pdv => {
                            const support = pdv.suporte_remoto;
                            const credentialsState = remoteSupportCredentialsByPdv[pdv.id];
                            const rustdeskId = credentialsState?.rustdesk_id || support?.rustdesk_id || null;
                            const canShowPassword = Boolean(support?.senha_configurada && rustdeskId);
                            const isPasswordVisible = Boolean(credentialsState?.showPassword);

                            return (
                              <div className="admin-remote-support-row" key={pdv.id}>
                                <span className="admin-remote-support-main">
                                  <strong>{pdv.nome}</strong>
                                  <small>
                                    Última sincronização em {formatDate(pdv.ultima_sincronizacao_em || pdv.ultimo_acesso_em)}
                                    {rustdeskId ? ` · ID ${rustdeskId}` : " · sem ID de suporte"}
                                  </small>
                                  {isPasswordVisible ? <small className="admin-remote-support-secret">Senha {credentialsState?.senha || "indisponível"}</small> : null}
                                  {credentialsState?.error ? <small className="admin-remote-support-error">{credentialsState.error}</small> : null}
                                </span>
                                <span className="admin-remote-support-side">
                                  <span className="admin-remote-support-statuses">
                                    <em className={pdv.ativo ? "admin-status-pill admin-status-pill-success" : "admin-status-pill"}>{pdv.ativo ? "Ativo" : "Inativo"}</em>
                                    <em className={getRemoteSupportStatusClass(support)}>{getRemoteSupportStatusLabel(support)}</em>
                                  </span>
                                  {rustdeskId ? (
                                    <span className="admin-remote-support-actions">
                                      <button type="button" onClick={() => void copyAdminValue(rustdeskId, "ID do RustDesk copiado.", "ID do RustDesk")}>
                                        <Copy aria-hidden="true" size={14} /> ID
                                      </button>
                                      {canShowPassword ? (
                                        <button disabled={Boolean(credentialsState?.loading)} type="button" onClick={() => void revealRemoteSupportPassword(pdv)}>
                                          {isPasswordVisible ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
                                          {credentialsState?.loading ? "Carregando" : isPasswordVisible ? "Ocultar" : "Senha"}
                                        </button>
                                      ) : null}
                                      {isPasswordVisible && credentialsState?.senha ? (
                                        <button type="button" onClick={() => void copyAdminValue(credentialsState.senha, "Senha do RustDesk copiada.", "Senha")}>
                                          <Copy aria-hidden="true" size={14} /> Copiar
                                        </button>
                                      ) : null}
                                    </span>
                                  ) : null}
                                </span>
                              </div>
                            );
                          })}
                          {selectedUser.pdvs.length === 0 ? <p className="admin-subdialog-empty">Nenhum PDV cadastrado.</p> : null}
                        </div>
                      </>
                    ) : null}

                    {accountDetailView === "subcontas" ? (
                      <div className="admin-compact-list admin-subdialog-list">
                        {selectedUser.subcontas.map(subconta => (
                          <div key={subconta.id}>
                            <span>
                              <strong>{subconta.nome}</strong>
                              <small>{subconta.email}{subconta.ultimo_acesso_em ? ` · último acesso em ${formatDate(subconta.ultimo_acesso_em)}` : ""}</small>
                            </span>
                            <em className={subconta.ativo ? "admin-status-pill admin-status-pill-success" : "admin-status-pill"}>{subconta.ativo ? "Ativa" : "Inativa"}</em>
                          </div>
                        ))}
                        {selectedUser.subcontas.length === 0 ? <p className="admin-subdialog-empty">Nenhuma subconta cadastrada.</p> : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        ) : null}
      </main>
    </AdminFrame>
  );
}
