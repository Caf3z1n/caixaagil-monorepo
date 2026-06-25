"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  Gift,
  Globe2,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  ReceiptText,
  Sparkles,
  Trash2,
  X
} from "lucide-react";

import { AdminFrame } from "@/components/admin-frame";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { clearAdminSession, getStoredAdminAuthToken } from "@/lib/admin-session";
import { formatCurrency } from "@/lib/formatters";

type PlanType = "publico" | "personalizado";
type BillingInterval = "mensal" | "dias";
type PlanFilter = "todos" | "publicos" | "personalizados";

type PlanoRecurso = {
  id: number;
  codigo: string;
  nome: string;
  habilitado: boolean;
};

type PlanoLimite = {
  id: number;
  codigo: string;
  nome: string;
  valor: number | null;
  unidade?: string | null;
};

type PlanoVersao = {
  id: number;
  nome: string;
  descricao?: string | null;
  valor_centavos: number;
  moeda: string;
  intervalo?: BillingInterval;
  intervalo_quantidade?: number;
  recursos?: PlanoRecurso[];
  limites?: PlanoLimite[];
};

type CodigoAssinatura = {
  id: number;
  codigo: string;
  valor_centavos: number;
  moeda?: string;
  gratuito?: boolean;
  cobranca_inicio_em?: string | null;
  intervalo?: BillingInterval;
  intervalo_quantidade?: number;
  trial_dias: number;
  usos_maximos?: number | null;
  usos_realizados: number;
  ativo: boolean;
  usado_em?: string | null;
  status_codigo?: "disponivel" | "usado" | "expirado" | "inativo" | "indisponivel";
  observacao?: string | null;
  usuario_usado_email?: string | null;
  usuario_usado?: {
    id: number;
    email: string;
    ativo?: boolean;
  } | null;
};

type PlanoUso = {
  usuarios_ativos: number;
  usuario_email?: string | null;
};

type PlanoAdmin = {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  publico: boolean;
  ordem: number;
  versao_atual?: PlanoVersao | null;
  codigos_personalizados?: CodigoAssinatura[];
  uso?: PlanoUso | null;
};

type PlanosResponse = {
  planos: PlanoAdmin[];
};

type SavePlanResponse = {
  plano: PlanoAdmin;
  codigo?: CodigoAssinatura | null;
};

type DeletePlanResponse = {
  arquivado?: boolean;
  removido?: boolean;
  message?: string;
};

type PlanFormState = {
  tipo: PlanType | null;
  nome: string;
  valor: string;
  limitePdvs: string;
  limiteSubcontas: string;
  emissaoFiscal: boolean;
  gratuito: boolean;
  trialDias: string;
  intervalo: BillingInterval;
  intervaloQuantidade: string;
  observacao: string;
};

const initialFormState: PlanFormState = {
  tipo: null,
  nome: "",
  valor: "",
  limitePdvs: "",
  limiteSubcontas: "",
  emissaoFiscal: false,
  gratuito: false,
  trialDias: "",
  intervalo: "mensal",
  intervaloQuantidade: "7",
  observacao: ""
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }

  return fallback;
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

function getLimitValue(plano: PlanoAdmin, codigo: string) {
  const limite = plano.versao_atual?.limites?.find(item => item.codigo === codigo);

  return limite?.valor ?? null;
}

function formatBenefitLimit(value: number | null, singular: string, plural: string) {
  if (typeof value === "number") {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  return `Sem limite ${plural}`;
}

function isFiscalEnabled(plano: PlanoAdmin) {
  return Boolean(plano.versao_atual?.recursos?.find(recurso => recurso.codigo === "emissao_fiscal")?.habilitado);
}

function getLatestCode(plano: PlanoAdmin) {
  return plano.codigos_personalizados?.[0] ?? null;
}

function getIntervalLabel(versao?: PlanoVersao | null, codigo?: CodigoAssinatura | null) {
  const intervalo = codigo?.intervalo || versao?.intervalo || "mensal";
  const quantidade = codigo?.intervalo_quantidade || versao?.intervalo_quantidade || 1;

  if (intervalo === "dias") {
    return quantidade === 1 ? "diário" : `a cada ${quantidade} dias`;
  }

  return "mensal";
}

function getTrialDaysFromCode(codigo?: CodigoAssinatura | null) {
  const trialDias = Number(codigo?.trial_dias || 0);

  if (Number.isInteger(trialDias) && trialDias > 0) {
    return trialDias;
  }

  if (!codigo?.cobranca_inicio_em) {
    return 0;
  }

  const date = new Date(codigo.cobranca_inicio_em);

  if (Number.isNaN(date.getTime())) {
    return 0;
  }

  const diffMs = date.getTime() - Date.now();

  return Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
}

function getTrialLabel(codigo?: CodigoAssinatura | null) {
  if (!codigo || codigo.gratuito) {
    return null;
  }

  const trialDias = getTrialDaysFromCode(codigo);

  if (trialDias <= 0) {
    return "Cobrança imediata";
  }

  return trialDias === 1 ? "1 dia grátis" : `${trialDias} dias grátis`;
}

function getChargeLabel(codigo?: CodigoAssinatura | null) {
  if (codigo?.gratuito) {
    return "Sem cobrança";
  }

  return getTrialLabel(codigo) || "Cobrança imediata";
}

function buildFormFromPlan(plano: PlanoAdmin): PlanFormState {
  const codigo = getLatestCode(plano);
  const versao = plano.versao_atual;
  const intervalo = (codigo?.intervalo || versao?.intervalo || "mensal") === "dias" ? "dias" : "mensal";
  const trialDias = getTrialDaysFromCode(codigo);

  return {
    tipo: plano.publico ? "publico" : "personalizado",
    nome: plano.nome,
    valor: formatCurrencyFieldFromCents(codigo?.valor_centavos ?? versao?.valor_centavos),
    limitePdvs: getLimitValue(plano, "pdvs_ativos")?.toString() ?? "",
    limiteSubcontas: getLimitValue(plano, "subcontas_ativas")?.toString() ?? "",
    emissaoFiscal: isFiscalEnabled(plano),
    gratuito: Boolean(codigo?.gratuito),
    trialDias: trialDias > 0 ? String(trialDias) : "",
    intervalo,
    intervaloQuantidade: String(codigo?.intervalo_quantidade || versao?.intervalo_quantidade || 7),
    observacao: codigo?.observacao || ""
  };
}

function getPlanKindLabel(plano: PlanoAdmin) {
  return plano.publico ? "Público" : "Personalizado";
}

function getPlanObservation(plano: PlanoAdmin, codigo?: CodigoAssinatura | null) {
  if (plano.publico) {
    return "";
  }

  return codigo?.observacao || plano.descricao || "";
}

function formatActiveUsers(count?: number | null) {
  const total = typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 0;

  if (total === 1) {
    return "1 usuário ativo";
  }

  return `${total} usuários ativos`;
}

function getPlanUsageLabel(plano: PlanoAdmin, codigo?: CodigoAssinatura | null) {
  if (!plano.publico) {
    return codigo?.usuario_usado_email || codigo?.usuario_usado?.email || plano.uso?.usuario_email || codigo?.codigo || "-";
  }

  return formatActiveUsers(plano.uso?.usuarios_ativos);
}

export default function AdminPlanosPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [planos, setPlanos] = useState<PlanoAdmin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanoAdmin | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [form, setForm] = useState<PlanFormState>(initialFormState);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<PlanFilter>("todos");

  const planosVisiveis = useMemo(
    () =>
      planos.filter(plano => {
        if (filter === "publicos") {
          return plano.publico;
        }

        if (filter === "personalizados") {
          return !plano.publico;
        }

        return true;
      }),
    [filter, planos]
  );

  function updateFormField<TKey extends keyof PlanFormState>(field: TKey, value: PlanFormState[TKey]) {
    setForm(current => ({
      ...current,
      [field]: value
    }));
  }

  async function loadPlanos(activeToken: string) {
    try {
      setIsLoading(true);
      const result = await apiGet<PlanosResponse>("/admin/planos", { token: activeToken });

      setPlanos(result.planos);
      setFeedback(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAdminSession();
        router.replace("/");
        return;
      }

      setFeedback(getErrorMessage(error, "Não foi possível carregar os planos."));
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
    void loadPlanos(storedToken);
  }, [router]);

  function openCreateModal() {
    setEditingPlan(null);
    setConfirmingDelete(false);
    setForm(initialFormState);
    setIsModalOpen(true);
    setFeedback(null);
  }

  function openEditModal(plano: PlanoAdmin) {
    setEditingPlan(plano);
    setConfirmingDelete(false);
    setForm(buildFormFromPlan(plano));
    setIsModalOpen(true);
    setFeedback(null);
  }

  function closeModal() {
    if (isSubmitting || isDeleting) {
      return;
    }

    setIsModalOpen(false);
    setEditingPlan(null);
    setConfirmingDelete(false);
    setForm(initialFormState);
  }

  async function handleSavePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || isSubmitting || !form.tipo) {
      return;
    }

    const personalizado = form.tipo === "personalizado";
    const gratuito = personalizado && form.gratuito;
    const valorCentavos = gratuito ? 0 : parseCurrencyInputToCents(form.valor);
    const trialDias = personalizado && !gratuito && form.trialDias.trim()
      ? Math.max(0, Math.floor(Number(form.trialDias)))
      : 0;

    if (!gratuito && valorCentavos <= 0) {
      setFeedback("Informe um valor válido para o plano.");
      return;
    }

    if (personalizado && !gratuito && !Number.isFinite(trialDias)) {
      setFeedback("Informe uma quantidade válida de dias grátis.");
      return;
    }

    try {
      setIsSubmitting(true);
      setFeedback(null);

      const payload = {
        nome: form.nome,
        valor_centavos: valorCentavos,
        personalizado,
        gratuito,
        trial_dias: trialDias,
        intervalo: personalizado ? form.intervalo : "mensal",
        intervalo_quantidade: personalizado && form.intervalo === "dias" ? Number(form.intervaloQuantidade) || 1 : 1,
        limite_pdvs: form.limitePdvs,
        limite_subcontas: form.limiteSubcontas,
        emissao_fiscal: form.emissaoFiscal,
        observacao: personalizado ? form.observacao : ""
      };
      if (editingPlan) {
        await apiPut<SavePlanResponse>(`/admin/planos/${editingPlan.id}`, payload, { token });
      } else {
        await apiPost<SavePlanResponse>("/admin/planos", payload, { token });
      }

      setIsModalOpen(false);
      setEditingPlan(null);
      setConfirmingDelete(false);
      setForm(initialFormState);
      await loadPlanos(token);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível salvar o plano."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeletePlan() {
    if (!token || !editingPlan || isSubmitting || isDeleting) {
      return;
    }

    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setFeedback(null);
      return;
    }

    try {
      setIsDeleting(true);
      setFeedback(null);

      await apiDelete<DeletePlanResponse>(`/admin/planos/${encodeURIComponent(editingPlan.id)}`, { token });

      setIsModalOpen(false);
      setEditingPlan(null);
      setConfirmingDelete(false);
      setForm(initialFormState);
      await loadPlanos(token);
    } catch (error) {
      setFeedback(getErrorMessage(error, "Não foi possível excluir o plano."));
    } finally {
      setIsDeleting(false);
    }
  }

  async function copyCode(code?: string | null) {
    if (!code) {
      return;
    }

    await navigator.clipboard?.writeText(code);
  }

  return (
    <AdminFrame>
      <main className="admin-content-page">
        <section className="admin-content-shell admin-content-shell-wide" aria-labelledby="admin-planos-title">
          <header className="admin-page-head">
            <span className="admin-page-icon">
              <ReceiptText aria-hidden="true" size={28} />
            </span>
            <div>
              <h1 id="admin-planos-title">Planos</h1>
              <p>{planosVisiveis.length} registro{planosVisiveis.length === 1 ? "" : "s"} encontrado{planosVisiveis.length === 1 ? "" : "s"}</p>
            </div>

            <button className="admin-primary-button admin-head-action" type="button" onClick={openCreateModal}>
              <Plus aria-hidden="true" size={18} />
              Novo plano
            </button>
          </header>

          <div className="admin-list-controls admin-plan-toolbar" aria-label="Filtros de planos">
            <div className="admin-tabs admin-plan-filter" role="tablist" aria-label="Tipo de plano">
              <button className={filter === "todos" ? "admin-segmented-active" : ""} type="button" onClick={() => setFilter("todos")}>
                Todos
              </button>
              <button className={filter === "publicos" ? "admin-segmented-active" : ""} type="button" onClick={() => setFilter("publicos")}>
                Públicos
              </button>
              <button className={filter === "personalizados" ? "admin-segmented-active" : ""} type="button" onClick={() => setFilter("personalizados")}>
                Personalizados
              </button>
            </div>
          </div>

          {feedback ? (
            <div className="admin-feedback admin-feedback-error" role="alert">
              <AlertTriangle aria-hidden="true" size={17} />
              <span>{feedback}</span>
            </div>
          ) : null}

          <section className="admin-panel admin-plans-panel" aria-label="Lista de planos">
            <div className="admin-list-header admin-plan-list-header" aria-hidden="true">
              <span>Tipo</span>
              <span>Nome</span>
              <span>Valor</span>
              <span>Cobrança</span>
              <span>Benefícios</span>
              <span>Uso</span>
              <span className="admin-plan-action-head">Ação</span>
            </div>
            {isLoading ? (
              <div className="admin-list-skeleton" aria-live="polite">
                <span />
                <span />
                <span />
              </div>
            ) : planosVisiveis.length === 0 ? (
              <div className="admin-empty-state">
                <Sparkles aria-hidden="true" size={21} />
                <span>Nenhum plano encontrado neste filtro.</span>
              </div>
            ) : (
              <div className="admin-plan-list">
                {planosVisiveis.map(plano => {
                  const versaoAtual = plano.versao_atual;
                  const codigo = getLatestCode(plano);
                  const isCustom = !plano.publico;
                  const chargeLabel = getChargeLabel(codigo);
                  const usageLabel = getPlanUsageLabel(plano, codigo);
                  const fiscalEnabled = isFiscalEnabled(plano);
                  const pdvLimit = getLimitValue(plano, "pdvs_ativos");
                  const subcontaLimit = getLimitValue(plano, "subcontas_ativas");
                  const planObservation = getPlanObservation(plano, codigo);
                  const PlanTypeIcon = isCustom ? KeyRound : Globe2;

                  return (
                    <article className="admin-plan-row admin-plan-row-actionable" key={plano.id}>
                      <div className={isCustom ? "admin-plan-kind admin-plan-kind-custom" : "admin-plan-kind"}>
                        <span className="admin-plan-kind-icon">
                          <PlanTypeIcon aria-hidden="true" size={17} />
                        </span>
                        <span>
                          <strong>{getPlanKindLabel(plano)}</strong>
                        </span>
                      </div>

                      <div className="admin-plan-main">
                        <span className="admin-row-title">
                          <strong>{plano.nome}</strong>
                        </span>
                        {planObservation ? <p className="admin-plan-note">{planObservation}</p> : null}
                      </div>

                      <div className="admin-plan-meta">
                        <strong>{codigo?.gratuito ? "Grátis" : formatCurrency(versaoAtual?.valor_centavos, versaoAtual?.moeda)}</strong>
                        <small>{getIntervalLabel(versaoAtual, codigo)}</small>
                      </div>

                      <div className="admin-plan-meta admin-plan-billing">
                        <strong>{chargeLabel}</strong>
                      </div>

                      <span className="admin-plan-benefits" aria-label={`Benefícios do plano ${plano.nome}`}>
                        <small>{fiscalEnabled ? "Emissão fiscal" : "Sem emissão fiscal"}</small>
                        <small>{formatBenefitLimit(pdvLimit, "PDV", "PDVs")}</small>
                        <small>{formatBenefitLimit(subcontaLimit, "subconta", "subcontas")}</small>
                      </span>

                      <span className="admin-plan-usage" title={usageLabel}>
                        <strong>{usageLabel}</strong>
                      </span>

                      <div className="admin-plan-actions">
                        {codigo ? (
                          <button type="button" onClick={() => copyCode(codigo.codigo)} aria-label={`Copiar código ${codigo.codigo}`}>
                            <Copy aria-hidden="true" size={16} />
                          </button>
                        ) : null}
                        <button type="button" onClick={() => openEditModal(plano)} aria-label={`Editar plano ${plano.nome}`}>
                          <Pencil aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </section>

        {isModalOpen ? (
          <div
            className={`admin-dialog-backdrop admin-plan-dialog-backdrop${!editingPlan && !form.tipo ? " admin-plan-choice-backdrop" : ""}`}
            role="presentation"
          >
            <section
              className={!editingPlan && !form.tipo ? "admin-dialog-card admin-plan-dialog admin-plan-choice-dialog" : "admin-dialog-card admin-plan-dialog"}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-plan-form-title"
            >
              <header className="admin-dialog-head">
                <div>
                  <h2 id="admin-plan-form-title">
                    {editingPlan
                      ? "Editar plano"
                      : !form.tipo
                        ? "Novo plano"
                        : form.tipo === "personalizado"
                          ? "Plano personalizado"
                          : "Plano público"}
                  </h2>
                  <p>
                    {editingPlan
                      ? "Atualize os dados para salvar o plano."
                      : !form.tipo
                        ? "Escolha o tipo de plano para continuar."
                        : "Preencha os dados para salvar o plano."}
                  </p>
                </div>
                <button type="button" onClick={closeModal} aria-label="Fechar cadastro de plano">
                  <X aria-hidden="true" size={18} />
                </button>
              </header>

              {!editingPlan && !form.tipo ? (
                <div className="admin-plan-type-grid admin-plan-choice-grid">
                  <button type="button" onClick={() => updateFormField("tipo", "publico")}>
                    <Globe2 aria-hidden="true" size={22} />
                    <span>
                      <strong>Plano público</strong>
                      <small>Qualquer cliente pode contratar no fluxo padrão.</small>
                    </span>
                  </button>
                  <button type="button" onClick={() => updateFormField("tipo", "personalizado")}>
                    <KeyRound aria-hidden="true" size={22} />
                    <span>
                      <strong>Plano personalizado</strong>
                      <small>Gera um código único para uma única conta.</small>
                    </span>
                  </button>
                </div>
              ) : (
                <form className="admin-plan-form admin-plan-form-structured admin-plan-form-compact" onSubmit={handleSavePlan}>
                  {form.tipo === "personalizado" ? (
                    <section className="admin-form-section admin-form-wide">
                      <div className="admin-form-grid admin-plan-custom-grid">
                        <label>
                          <span>Nome</span>
                          <input
                            required
                            value={form.nome}
                            onChange={event => updateFormField("nome", event.currentTarget.value)}
                            placeholder="Digite o nome do plano"
                          />
                        </label>

                        <label>
                          <span>Observação</span>
                          <input
                            value={form.observacao}
                            onChange={event => updateFormField("observacao", event.currentTarget.value)}
                            placeholder="Cliente ou motivo interno"
                          />
                        </label>

                        <label className="admin-switch-row admin-switch-row-inline admin-plan-full-row">
                          <input
                            type="checkbox"
                            checked={form.gratuito}
                            onChange={event => updateFormField("gratuito", event.currentTarget.checked)}
                          />
                          <span className="admin-switch-control" aria-hidden="true">
                            <span />
                          </span>
                          <span className="admin-switch-copy">
                            <strong>Plano gratuito</strong>
                          </span>
                        </label>

                        {!form.gratuito ? (
                          <>
                            <label>
                              <span>Valor da cobrança</span>
                              <input
                                inputMode="numeric"
                                required
                                value={form.valor}
                                onChange={event => updateFormField("valor", formatCurrencyInput(event.currentTarget.value))}
                                placeholder="R$ 0,00"
                              />
                            </label>

                            <label>
                              <span>Dias grátis antes da cobrança</span>
                              <input
                                inputMode="numeric"
                                min="0"
                                type="number"
                                value={form.trialDias}
                                onChange={event => updateFormField("trialDias", event.currentTarget.value)}
                                placeholder="Vazio para cobrar imediatamente"
                              />
                            </label>

                            <label className="admin-switch-row admin-switch-row-inline admin-billing-switch">
                              <input
                                type="checkbox"
                                checked={form.intervalo === "dias"}
                                onChange={event => updateFormField("intervalo", event.currentTarget.checked ? "dias" : "mensal")}
                              />
                              <span className="admin-switch-control" aria-hidden="true">
                                <span />
                              </span>
                              <span className="admin-switch-copy">
                                <strong>Cobrança por dias</strong>
                              </span>
                            </label>

                            {form.intervalo === "dias" ? (
                              <label>
                                <span>Dias entre cobranças</span>
                                <input
                                  inputMode="numeric"
                                  min="1"
                                  type="number"
                                  value={form.intervaloQuantidade}
                                  onChange={event => updateFormField("intervaloQuantidade", event.currentTarget.value)}
                                />
                              </label>
                            ) : (
                              <div className="admin-plan-grid-spacer" aria-hidden="true" />
                            )}
                          </>
                        ) : null}

                        <label className="admin-switch-row admin-switch-row-inline admin-plan-full-row">
                          <input
                            type="checkbox"
                            checked={form.emissaoFiscal}
                            onChange={event => updateFormField("emissaoFiscal", event.currentTarget.checked)}
                          />
                          <span className="admin-switch-control" aria-hidden="true">
                            <span />
                          </span>
                          <span className="admin-switch-copy">
                            <strong>Permite emissão fiscal</strong>
                          </span>
                        </label>

                        <label>
                          <span>Limite de subcontas</span>
                          <input
                            inputMode="numeric"
                            min="0"
                            type="number"
                            value={form.limiteSubcontas}
                            onChange={event => updateFormField("limiteSubcontas", event.currentTarget.value)}
                            placeholder="Sem limite"
                          />
                        </label>

                        <label>
                          <span>Limite de PDVs</span>
                          <input
                            inputMode="numeric"
                            min="0"
                            type="number"
                            value={form.limitePdvs}
                            onChange={event => updateFormField("limitePdvs", event.currentTarget.value)}
                            placeholder="Sem limite"
                          />
                        </label>
                      </div>

                      <div className="admin-plan-code-note">
                        {form.gratuito ? <Gift aria-hidden="true" size={18} /> : <CalendarClock aria-hidden="true" size={18} />}
                        <span>
                          <strong>{editingPlan ? "Código existente" : "Código gerado automaticamente"}</strong>
                          <small>
                            {editingPlan
                              ? "Se o código já foi usado, ele continua bloqueado."
                              : "Depois que uma conta usar o código, ele não pode ser usado novamente."}
                          </small>
                        </span>
                      </div>
                    </section>
                  ) : (
                    <>
                      <section className="admin-form-section admin-form-wide">
                        <header>
                          <h3>Identificação</h3>
                          <small>Plano visível para todos</small>
                        </header>
                        <div className="admin-form-grid">
                          <label>
                            <span>Nome</span>
                            <input
                              required
                              value={form.nome}
                              onChange={event => updateFormField("nome", event.currentTarget.value)}
                              placeholder="Digite o nome do plano"
                            />
                          </label>

                          <label>
                            <span>Valor mensal</span>
                            <input
                              inputMode="numeric"
                              required
                              value={form.valor}
                              onChange={event => updateFormField("valor", formatCurrencyInput(event.currentTarget.value))}
                              placeholder="R$ 0,00"
                            />
                          </label>
                        </div>
                      </section>

                      <section className="admin-form-section admin-form-wide">
                        <header>
                          <h3>Recursos e limites</h3>
                          <small>Regras usadas nos bloqueios do web e PDV</small>
                        </header>
                        <div className="admin-form-grid">
                          <label className="admin-switch-row admin-switch-row-inline admin-plan-full-row">
                            <input
                              type="checkbox"
                              checked={form.emissaoFiscal}
                              onChange={event => updateFormField("emissaoFiscal", event.currentTarget.checked)}
                            />
                            <span className="admin-switch-control" aria-hidden="true">
                              <span />
                            </span>
                            <span className="admin-switch-copy">
                              <strong>Permite emissão fiscal</strong>
                            </span>
                          </label>

                          <label>
                            <span>Limite de subcontas</span>
                            <input
                              inputMode="numeric"
                              min="0"
                              type="number"
                              value={form.limiteSubcontas}
                              onChange={event => updateFormField("limiteSubcontas", event.currentTarget.value)}
                              placeholder="Sem limite"
                            />
                          </label>

                          <label>
                            <span>Limite de PDVs</span>
                            <input
                              inputMode="numeric"
                              min="0"
                              type="number"
                              value={form.limitePdvs}
                              onChange={event => updateFormField("limitePdvs", event.currentTarget.value)}
                              placeholder="Sem limite"
                            />
                          </label>
                        </div>
                      </section>
                    </>
                  )}

                  {editingPlan && confirmingDelete ? (
                    <div className="admin-plan-delete-warning" role="alert">
                      <AlertTriangle aria-hidden="true" size={17} />
                      <span>
                        <strong>Confirmar exclusão de {editingPlan.nome}</strong>
                        <small>Se houver assinaturas ou código usado, o plano será arquivado para preservar o histórico.</small>
                      </span>
                    </div>
                  ) : null}

                  <footer className="admin-dialog-actions">
                    <button className="admin-secondary-button" type="button" onClick={closeModal}>
                      Cancelar
                    </button>
                    <div className="admin-dialog-action-cluster">
                      {editingPlan ? (
                        <button className="admin-danger-button" disabled={isSubmitting || isDeleting} type="button" onClick={handleDeletePlan}>
                          {isDeleting ? <LoaderCircle aria-hidden="true" className="admin-spin" size={17} /> : <Trash2 aria-hidden="true" size={17} />}
                          {confirmingDelete ? "Confirmar exclusão" : "Excluir"}
                        </button>
                      ) : null}
                      <button className="admin-confirm-button" disabled={isSubmitting || isDeleting} type="submit">
                        {isSubmitting ? <LoaderCircle aria-hidden="true" className="admin-spin" size={17} /> : <CheckCircle2 aria-hidden="true" size={17} />}
                        {editingPlan ? "Salvar" : "Cadastrar"}
                      </button>
                    </div>
                  </footer>
                </form>
              )}
            </section>
          </div>
        ) : null}
      </main>
    </AdminFrame>
  );
}
