"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X
} from "lucide-react";

import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { capitalizeFirstTextLetter } from "@/lib/text-format";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type Funcionario = {
  id: number;
  nome: string;
  codigo: string;
  ativo: boolean;
  registros_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
  created_at: string | null;
  updated_at: string | null;
};

type FuncionariosResponse = {
  funcionarios: Funcionario[];
  resumo: {
    ativos: number;
  };
};

type EmployeeModalState =
  | {
      mode: "create";
      funcionario?: never;
    }
  | {
      mode: "edit";
      funcionario: Funcionario;
    };

type Feedback = {
  tone: "success" | "error";
  message: string;
};

type DeleteEmployeeResponse =
  | {
      action: "deleted";
      id: number;
      message?: string;
    }
  | {
      action: "deactivated";
      funcionario: Funcionario;
      message?: string;
    };

type ActivateEmployeeResponse = {
  action: "activated";
  funcionario: Funcionario;
  message?: string;
};

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeEmployeeCode(value: string) {
  return value.replace(/\D/g, "");
}

function sortEmployees(funcionarios: Funcionario[]) {
  return [...funcionarios].sort((left, right) => {
    if (left.ativo !== right.ativo) {
      return left.ativo ? -1 : 1;
    }

    return left.nome.localeCompare(right.nome, "pt-BR");
  });
}

export function FuncionarioManager() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employeeModal, setEmployeeModal] = useState<EmployeeModalState | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCode, setDraftCode] = useState("");
  const [showEmployeePassword, setShowEmployeePassword] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const modalPresence = useModalPresence(employeeModal);
  const codeIsValid = draftCode.length > 0;
  const canSubmitEmployee = draftName.trim().length >= 2 && codeIsValid;
  const filteredEmployees = useMemo(() => {
    const query = normalizeSearch(search);

    if (!query) {
      return funcionarios;
    }

    return funcionarios.filter((funcionario) => normalizeSearch(funcionario.nome).includes(query));
  }, [funcionarios, search]);

  const closeEmployeeModal = useCallback(() => {
    if (isSubmitting) {
      return;
    }

    setEmployeeModal(null);
  }, [isSubmitting]);
  const modalDismiss = useModalDismiss(Boolean(employeeModal), closeEmployeeModal);

  usePlatformModalScrollLock(modalPresence.isPresent);

  const loadEmployees = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setFeedback({ tone: "error", message: "Sessão expirada. Entre novamente." });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      const result = await apiGet<FuncionariosResponse>("/funcionarios", { token });
      setFuncionarios(sortEmployees(result.funcionarios));
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível carregar os funcionários."
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  function openCreateEmployeeModal() {
    setFeedback(null);
    setDraftName("");
    setDraftCode("");
    setShowEmployeePassword(false);
    setEmployeeModal({ mode: "create" });
  }

  function openEditEmployeeModal(funcionario: Funcionario) {
    setFeedback(null);
    setDraftName(funcionario.nome);
    setDraftCode(normalizeEmployeeCode(funcionario.codigo ?? ""));
    setShowEmployeePassword(false);
    setEmployeeModal({ mode: "edit", funcionario });
  }

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!employeeModal || isSubmitting || !canSubmitEmployee) {
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
        nome: draftName.trim(),
        codigo: draftCode
      };
      const saved =
        employeeModal.mode === "edit"
          ? await apiPut<Funcionario>(`/funcionarios/${employeeModal.funcionario.id}`, payload, { token })
          : await apiPost<Funcionario>("/funcionarios", payload, { token });

      setFuncionarios((currentEmployees) =>
        sortEmployees(
          employeeModal.mode === "edit"
            ? currentEmployees.map((funcionario) => (funcionario.id === saved.id ? saved : funcionario))
            : [saved, ...currentEmployees]
        )
      );
      setEmployeeModal(null);
      setFeedback({
        tone: "success",
        message: employeeModal.mode === "edit" ? "Funcionário atualizado." : "Funcionário cadastrado."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível salvar o funcionário."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteEmployee() {
    if (!employeeModal || employeeModal.mode !== "edit" || isSubmitting) {
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
      const result = await apiDelete<DeleteEmployeeResponse>(`/funcionarios/${employeeModal.funcionario.id}`, { token });

      if (result?.action === "deactivated") {
        setFuncionarios((currentEmployees) => {
          const withoutEmployee = currentEmployees.filter((funcionario) => funcionario.id !== result.funcionario.id);
          return sortEmployees([...withoutEmployee, result.funcionario]);
        });
      } else {
        setFuncionarios((currentEmployees) =>
          currentEmployees.filter((funcionario) => funcionario.id !== employeeModal.funcionario.id)
        );
      }

      setEmployeeModal(null);
      setFeedback({
        tone: "success",
        message: result?.action === "deactivated" ? "Funcionário desativado." : "Funcionário excluído."
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível excluir o funcionário."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function activateEmployee() {
    if (!employeeModal || employeeModal.mode !== "edit" || employeeModal.funcionario.ativo || isSubmitting) {
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
      const result = await apiPost<ActivateEmployeeResponse>(
        `/funcionarios/${employeeModal.funcionario.id}/ativar`,
        {},
        { token }
      );

      setFuncionarios((currentEmployees) => {
        const withoutEmployee = currentEmployees.filter((funcionario) => funcionario.id !== result.funcionario.id);
        return sortEmployees([...withoutEmployee, result.funcionario]);
      });
      setEmployeeModal({ mode: "edit", funcionario: result.funcionario });
      setFeedback({ tone: "success", message: "Funcionário ativado." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível ativar o funcionário."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="platform-flow-page convenio-flow-page employee-flow-page">
      <div className="platform-flow-shell platform-flow-shell-compact convenio-flow-shell employee-flow-shell">
        <section className="platform-flow-section-title" aria-label="Funcionários">
          <span className="platform-flow-section-main">
            <BadgeCheck aria-hidden="true" />
            <strong>Funcionários</strong>
          </span>
        </section>

        <section className="platform-flow-card convenio-flow-card employee-flow-card" aria-label="Lista de funcionários">
          <div className="platform-flow-panel employee-section-panel">
            <header className="platform-flow-head convenio-flow-head employee-flow-head">
              <h1>Funcionários</h1>
              <p>Senhas usadas para abrir e fechar caixa.</p>
            </header>

            <div className="convenio-toolbar employee-toolbar">
              <label className="convenio-search">
                <Search aria-hidden="true" size={18} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar funcionário"
                  type="search"
                />
              </label>
            </div>

            {feedback ? (
              <div className={`auth-feedback auth-feedback-${feedback.tone} convenio-feedback`} role="status">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">
                  <strong>{feedback.message}</strong>
                </span>
              </div>
            ) : null}

            <div className="convenio-list employee-list" aria-label="Funcionários cadastrados">
              {isLoading ? (
                Array.from({ length: 4 }, (_, index) => <span className="convenio-row-skeleton" key={index} />)
              ) : filteredEmployees.length > 0 ? (
                filteredEmployees.map((funcionario) => (
                  <button
                    className={
                      funcionario.ativo
                        ? "convenio-row employee-row employee-row-clickable"
                        : "convenio-row employee-row employee-row-clickable platform-record-inactive"
                    }
                    key={funcionario.id}
                    type="button"
                    onClick={() => openEditEmployeeModal(funcionario)}
                  >
                    <span className="convenio-row-icon" aria-hidden="true">
                      <BadgeCheck size={18} />
                    </span>
                    <span className="convenio-row-main">
                      <strong>{funcionario.nome}</strong>
                      <small>{funcionario.ativo ? "Senha configurada" : "Desativado"}</small>
                    </span>
                    <span className="employee-row-key">
                      <KeyRound aria-hidden="true" size={15} />
                      <span>Acesso ao caixa</span>
                    </span>
                    <span className="convenio-row-action employee-row-action" aria-hidden="true">
                      <Pencil size={15} />
                      Editar
                    </span>
                  </button>
                ))
              ) : (
                <div className="convenio-empty employee-empty">
                  <BadgeCheck aria-hidden="true" size={26} />
                  <strong>Nenhum funcionário</strong>
                </div>
              )}
            </div>
          </div>

          <div className="platform-flow-actions convenio-flow-actions employee-flow-actions" aria-label="Ações de funcionários">
            <Link className="platform-secondary-button" href="/meu-sistema/configuracoes">
              <ArrowLeft aria-hidden="true" size={17} />
              Voltar
            </Link>
            <button className="platform-primary-button" type="button" onClick={openCreateEmployeeModal}>
              <Plus aria-hidden="true" size={17} />
              Novo funcionário
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
          <section className="platform-modal convenio-client-modal employee-modal" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeEmployeeModal}>
              <X aria-hidden="true" size={19} />
            </button>
            <header className="platform-modal-head convenio-client-modal-head">
              <h2 id="employee-modal-title">
                {modalPresence.presentValue.mode === "edit" ? "Editar funcionário" : "Novo funcionário"}
              </h2>
              <p>{modalPresence.presentValue.mode === "edit" ? "Atualize o nome ou a senha do caixa." : "Defina quem pode operar o caixa."}</p>
            </header>

            {feedback?.tone === "error" ? (
              <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{feedback.message}</span>
              </div>
            ) : null}

            <form className="convenio-client-form employee-form" id="employee-form" onSubmit={submitEmployee}>
              <label className="convenio-client-field">
                <span>Nome</span>
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => {
                    setDraftName(capitalizeFirstTextLetter(event.target.value));
                    if (feedback?.tone === "error") {
                      setFeedback(null);
                    }
                  }}
                  placeholder="Ex.: Pedro"
                />
              </label>
              <label className="convenio-client-field">
                <span>Senha</span>
                <div className="employee-password-input">
                  <input
                    autoComplete="new-password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    type={showEmployeePassword ? "text" : "password"}
                    value={draftCode}
                    onChange={(event) => {
                      setDraftCode(normalizeEmployeeCode(event.target.value));
                      if (feedback?.tone === "error") {
                        setFeedback(null);
                      }
                    }}
                    placeholder="Apenas números"
                  />
                  <button
                    aria-label={showEmployeePassword ? "Ocultar senha" : "Mostrar senha"}
                    className="employee-password-toggle"
                    type="button"
                    onClick={() => setShowEmployeePassword(current => !current)}
                  >
                    {showEmployeePassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                  </button>
                </div>
              </label>
            </form>

            <div
              className={
                modalPresence.presentValue.mode === "edit" && modalPresence.presentValue.funcionario.ativo
                  ? "platform-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete convenio-client-modal-actions"
                  : "platform-modal-actions platform-item-modal-actions convenio-client-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeEmployeeModal}>
                Cancelar
              </button>
              {modalPresence.presentValue.mode === "edit" && !modalPresence.presentValue.funcionario.ativo ? (
                <button
                  className="platform-primary-button platform-save-button"
                  type="button"
                  onClick={() => void activateEmployee()}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <RotateCcw aria-hidden="true" size={16} />}
                  Ativar
                </button>
              ) : modalPresence.presentValue.mode === "edit" ? (
                <button
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  type="button"
                  onClick={() => void deleteEmployee()}
                  disabled={isSubmitting}
                >
                  {modalPresence.presentValue.funcionario.acao_remocao === "desativar" ? (
                    <Ban aria-hidden="true" size={16} />
                  ) : (
                    <Trash2 aria-hidden="true" size={16} />
                  )}
                  {modalPresence.presentValue.funcionario.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              ) : null}
              {modalPresence.presentValue.mode === "edit" && !modalPresence.presentValue.funcionario.ativo ? null : (
                <button className="platform-primary-button platform-save-button" type="submit" form="employee-form" disabled={isSubmitting || !canSubmitEmployee}>
                  {isSubmitting ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={16} /> : <Check aria-hidden="true" size={16} />}
                  {modalPresence.presentValue.mode === "edit" ? "Salvar" : "Cadastrar"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
