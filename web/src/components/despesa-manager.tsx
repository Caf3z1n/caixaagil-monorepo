"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
  X
} from "lucide-react";

import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { capitalizeFirstTextLetter } from "@/lib/text-format";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type DespesaOrigem = "pdv" | "administrativa";
type OriginFilter = "todos" | "administrativa" | "pdv";

type CaixaReferencia = {
  id: string | null;
  data_operacao_rotulo: string | null;
  numero_turno: number | null;
  aberto_em: string | null;
};

type PdvReferencia = {
  id: number | null;
  nome: string | null;
};

type Despesa = {
  id: string;
  descricao: string;
  valor_centavos: number;
  origem: DespesaOrigem;
  lancado_por_email: string | null;
  lancado_por_tipo: "usuario" | "subconta" | null;
  lancado_por_subconta_id: number | null;
  caixa_id: string | null;
  pdv_id: number | null;
  caixa: CaixaReferencia | null;
  pdv: PdvReferencia | null;
  registrado_em: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type DespesasResponse = {
  despesas: Despesa[];
  resumo: {
    total_centavos: number;
    administrativas: number;
    pdv: number;
  };
};

type ExpenseModalState =
  | {
      mode: "create";
      despesa?: never;
    }
  | {
      mode: "edit";
      despesa: Despesa;
    };

type Feedback = {
  tone: "success" | "error";
  message: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatCurrencyFromCents(value: number) {
  return currencyFormatter.format(value / 100);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return dateTimeFormatter.format(date).replace(",", "");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return 0;
  }

  return Number(digits);
}

function formatCurrencyInput(value: string) {
  const cents = parseCurrencyInput(value);

  if (cents <= 0) {
    return "";
  }

  return formatCurrencyFromCents(cents);
}

function getExpenseDate(despesa: Despesa) {
  return despesa.registrado_em || despesa.created_at;
}

function getExpenseOriginLabel(despesa: Despesa) {
  if (despesa.origem === "administrativa" || !despesa.caixa) {
    return "Painel web";
  }

  if (despesa.caixa.data_operacao_rotulo && despesa.caixa.numero_turno) {
    return `${despesa.caixa.data_operacao_rotulo} · Turno ${despesa.caixa.numero_turno}`;
  }

  return formatDateTime(despesa.caixa.aberto_em || getExpenseDate(despesa));
}

function getExpenseOriginDetail(despesa: Despesa) {
  if (despesa.origem === "administrativa" || !despesa.caixa) {
    return despesa.lancado_por_email || "E-mail não registrado";
  }

  return despesa.pdv?.nome || "Frente de caixa";
}

function sortDespesas(despesas: Despesa[]) {
  return [...despesas].sort((left, right) => {
    const leftDate = getExpenseDate(left) ? new Date(getExpenseDate(left) as string).getTime() : 0;
    const rightDate = getExpenseDate(right) ? new Date(getExpenseDate(right) as string).getTime() : 0;
    return rightDate - leftDate;
  });
}

export function DespesaManager() {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("todos");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expenseModal, setExpenseModal] = useState<ExpenseModalState | null>(null);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftAmount, setDraftAmount] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const modalPresence = useModalPresence(expenseModal);
  const amountCents = parseCurrencyInput(draftAmount);
  const canSubmitExpense = draftDescription.trim().length >= 2 && amountCents > 0;
  const filteredDespesas = useMemo(() => {
    const query = normalizeSearch(search);

    return despesas.filter((despesa) => {
      if (originFilter !== "todos" && despesa.origem !== originFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return normalizeSearch(
        [
          despesa.descricao,
          formatCurrencyFromCents(despesa.valor_centavos),
          formatDateTime(getExpenseDate(despesa)),
          getExpenseOriginLabel(despesa),
          getExpenseOriginDetail(despesa)
        ].join(" ")
      ).includes(query);
    });
  }, [despesas, originFilter, search]);

  const closeExpenseModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setExpenseModal(null);
  }, [isSubmitting]);
  const modalDismiss = useModalDismiss(Boolean(expenseModal), closeExpenseModal);

  usePlatformModalScrollLock(modalPresence.isPresent);

  const loadDespesas = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const result = await apiGet<DespesasResponse>("/despesas", { token });
      setDespesas(sortDespesas(result.despesas));
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível carregar as despesas."
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDespesas();
  }, [loadDespesas]);

  function openCreateExpenseModal() {
    setFeedback(null);
    setDraftDescription("");
    setDraftAmount("");
    setExpenseModal({ mode: "create" });
  }

  function openEditExpenseModal(despesa: Despesa) {
    setFeedback(null);
    setDraftDescription(despesa.descricao);
    setDraftAmount(formatCurrencyFromCents(despesa.valor_centavos));
    setExpenseModal({ mode: "edit", despesa });
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!expenseModal || isSubmitting || !canSubmitExpense) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const payload = {
        descricao: draftDescription.trim(),
        valor_centavos: amountCents
      };
      const saved =
        expenseModal.mode === "edit"
          ? await apiPut<Despesa>(`/despesas/${expenseModal.despesa.id}`, payload, { token })
          : await apiPost<Despesa>("/despesas", payload, { token });

      setDespesas((currentDespesas) =>
        sortDespesas(
          expenseModal.mode === "edit"
            ? currentDespesas.map((despesa) => (despesa.id === saved.id ? saved : despesa))
            : [saved, ...currentDespesas]
        )
      );
      setExpenseModal(null);
      setFeedback({
        tone: "success",
        message: expenseModal.mode === "edit" ? "Despesa atualizada." : "Despesa lançada."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível salvar a despesa."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteExpense() {
    if (!expenseModal || expenseModal.mode !== "edit" || isSubmitting) {
      return;
    }

    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await apiDelete(`/despesas/${expenseModal.despesa.id}`, { token });
      setDespesas((currentDespesas) => currentDespesas.filter((despesa) => despesa.id !== expenseModal.despesa.id));
      setExpenseModal(null);
      setFeedback({ tone: "success", message: "Despesa excluída." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível excluir a despesa."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="platform-flow-page convenio-flow-page expense-flow-page">
      <div className="platform-flow-shell platform-flow-shell-compact convenio-flow-shell expense-flow-shell">
        <section className="platform-flow-section-title" aria-label="Despesas">
          <span className="platform-flow-section-main">
            <WalletCards aria-hidden="true" />
            <strong>Despesas</strong>
          </span>
        </section>

        <section className="platform-flow-card convenio-flow-card expense-flow-card" aria-label="Lista de despesas">
          <div className="platform-flow-panel expense-section-panel">
            <header className="platform-flow-head convenio-flow-head expense-flow-head">
              <h1>Despesas</h1>
              <p>Saídas registradas no PDV e no painel.</p>
            </header>

            <div className="convenio-toolbar expense-toolbar">
              <label className="convenio-search">
                <Search aria-hidden="true" size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar despesa"
                  type="search"
                />
              </label>
              <div className="product-category-filter expense-origin-filter" aria-label="Filtrar por origem">
                <button
                  className={
                    originFilter === "todos"
                      ? "product-category-filter-chip product-category-filter-chip-active"
                      : "product-category-filter-chip"
                  }
                  type="button"
                  aria-pressed={originFilter === "todos"}
                  onClick={() => setOriginFilter("todos")}
                >
                  Todos
                </button>
                <button
                  className={
                    originFilter === "administrativa"
                      ? "product-category-filter-chip product-category-filter-chip-active"
                      : "product-category-filter-chip"
                  }
                  type="button"
                  aria-pressed={originFilter === "administrativa"}
                  onClick={() => setOriginFilter("administrativa")}
                >
                  Painel web
                </button>
                <button
                  className={
                    originFilter === "pdv"
                      ? "product-category-filter-chip product-category-filter-chip-active"
                      : "product-category-filter-chip"
                  }
                  type="button"
                  aria-pressed={originFilter === "pdv"}
                  onClick={() => setOriginFilter("pdv")}
                >
                  PDV
                </button>
              </div>
            </div>

            {feedback ? (
              <div className={`auth-feedback auth-feedback-${feedback.tone} convenio-feedback`} role="status">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">
                  <strong>{feedback.message}</strong>
                </span>
              </div>
            ) : null}

            <div className="convenio-list expense-list" aria-label="Despesas cadastradas">
              {isLoading ? (
                Array.from({ length: 4 }, (_, index) => <span className="convenio-row-skeleton" key={index} />)
              ) : filteredDespesas.length > 0 ? (
                filteredDespesas.map((despesa) => {
                  return (
                    <button
                      className="convenio-row expense-row expense-row-clickable"
                      key={despesa.id}
                      type="button"
                      onClick={() => openEditExpenseModal(despesa)}
                    >
                      <span className="convenio-row-icon" aria-hidden="true">
                        <WalletCards size={18} />
                      </span>
                      <span className="convenio-row-main">
                        <strong>{despesa.descricao}</strong>
                        <small>{formatDateTime(getExpenseDate(despesa))}</small>
                      </span>
                      <span className="expense-row-origin">
                        <strong>{getExpenseOriginLabel(despesa)}</strong>
                        <small>{getExpenseOriginDetail(despesa)}</small>
                      </span>
                      <span className="convenio-row-amount expense-row-amount">
                        <small>Saída</small>
                        <strong>{formatCurrencyFromCents(despesa.valor_centavos)}</strong>
                      </span>
                      <span className="convenio-row-action expense-row-action" aria-hidden="true">
                        <Pencil size={15} />
                        Editar
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="convenio-empty expense-empty">
                  <WalletCards aria-hidden="true" size={26} />
                  <strong>Nenhuma despesa</strong>
                </div>
              )}
            </div>
          </div>

          <div className="platform-flow-actions convenio-flow-actions expense-flow-actions" aria-label="Ações de despesas">
            <Link className="platform-secondary-button" href="/meu-sistema/configuracoes">
              <ArrowLeft aria-hidden="true" size={17} />
              Voltar
            </Link>
            <button className="platform-primary-button" type="button" onClick={openCreateExpenseModal}>
              <Plus aria-hidden="true" size={17} />
              Nova despesa
            </button>
          </div>
        </section>
      </div>

      {modalPresence.isPresent && modalPresence.presentValue ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={modalPresence.state}
          {...modalDismiss.backdropProps}
        >
          <section className="platform-modal convenio-client-modal expense-modal" role="dialog" aria-modal="true" aria-labelledby="expense-modal-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeExpenseModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head convenio-client-modal-head">
              <h2 id="expense-modal-title">
                {modalPresence.presentValue.mode === "edit" ? "Editar despesa" : "Nova despesa"}
              </h2>
              <p>
                {modalPresence.presentValue.mode === "edit"
                  ? `${getExpenseOriginLabel(modalPresence.presentValue.despesa)} · ${getExpenseOriginDetail(modalPresence.presentValue.despesa)}`
                  : "Origem administrativa."}
              </p>
            </header>

            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}

            <form className="convenio-client-form expense-form" id="expense-form" onSubmit={submitExpense}>
              <label className="convenio-client-field">
                <span>Descrição</span>
                <input
                  autoFocus
                  value={draftDescription}
                  onChange={(event) => {
                    setDraftDescription(capitalizeFirstTextLetter(event.target.value));
                    if (feedback?.tone === "error") {
                      setFeedback(null);
                    }
                  }}
                  placeholder="Ex.: Compra de gelo"
                />
              </label>
              <label className="convenio-client-field">
                <span>Valor</span>
                <input
                  inputMode="numeric"
                  value={draftAmount}
                  onChange={(event) => {
                    setDraftAmount(formatCurrencyInput(event.target.value));
                    if (feedback?.tone === "error") {
                      setFeedback(null);
                    }
                  }}
                  placeholder="R$ 0,00"
                />
              </label>
            </form>

            <div
              className={
                modalPresence.presentValue.mode === "edit"
                  ? "platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete convenio-client-modal-actions"
                  : "platform-modal-actions platform-item-modal-actions convenio-client-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeExpenseModal}>
                Cancelar
              </button>
              {modalPresence.presentValue.mode === "edit" ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  type="button"
                  onClick={() => void deleteExpense()}
                  disabled={isSubmitting}
                >
                  <Trash2 aria-hidden="true" size={16} />
                  Excluir
                </button>
              ) : null}
              <button className="platform-primary-button platform-save-button" type="submit" form="expense-form" disabled={isSubmitting || !canSubmitExpense}>
                {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
                {modalPresence.presentValue.mode === "edit" ? "Salvar" : "Cadastrar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
