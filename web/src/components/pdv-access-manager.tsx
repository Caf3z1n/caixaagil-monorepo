"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Monitor,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UserRound,
  X
} from "lucide-react";

import { AuthFeedback } from "@/components/auth-feedback";
import { PlatformAccountEmail } from "@/components/platform-account-email";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { PLATFORM_ACCOUNT_TYPE_STORAGE_KEY, PLATFORM_AUTH_TOKEN_STORAGE_KEY } from "@/lib/platform-session";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type Pdv = {
  id: number;
  usuario_id: number;
  nome: string;
  identificacao: string;
  status: string;
  status_operacional: string;
  codigo_pareamento?: string;
  codigo_pareamento_pendente: boolean;
  codigo_pareamento_expira_em: string | null;
  pareado_em: string | null;
  ultimo_acesso_em: string | null;
  ultima_sincronizacao_em: string | null;
  ultima_fila_offline_em: string | null;
  sincronizacao_pendente: boolean;
};

type PdvForm = {
  nome: string;
};

type PairingState = {
  codigo: string;
  expiraEm: string | null;
  pdvId: number;
};

type Subconta = {
  id: number;
  usuario_id: number;
  email: string;
  nome: string;
  permissoes: string[];
  ativo: boolean;
  ultimo_acesso_em: string | null;
};

type SubcontaStep = "email" | "password" | "permissions" | "menu" | "data";

type SubcontaForm = {
  nome: string;
  email: string;
  senha: string;
  confirmarSenha: string;
  permissoes: string[];
};

const emptyForm: PdvForm = {
  nome: ""
};

const emptySubcontaForm: SubcontaForm = {
  nome: "",
  email: "",
  senha: "",
  confirmarSenha: "",
  permissoes: ["pdvs_subcontas"]
};

const permissionOptions = [
  {
    chave: "pdvs_subcontas",
    titulo: "PDVs e subcontas",
    descricao: "Acessar esta página, gerenciar PDVs e acompanhar subcontas."
  },
  {
    chave: "grupos_fiscais",
    titulo: "Grupos fiscais",
    descricao: "Acessar o cadastro de grupos fiscais usados nos produtos."
  },
  {
    chave: "produtos",
    titulo: "Produtos",
    descricao: "Acessar categorias e cadastro de produtos da venda."
  },
  {
    chave: "estoque",
    titulo: "Estoque",
    descricao: "Acessar locais de estoque e ajustar saldos dos produtos."
  }
];

function getApiMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function formatLastSync(pdv: Pdv) {
  return (
    formatDateTime(pdv.ultima_sincronizacao_em) ||
    formatDateTime(pdv.ultimo_acesso_em) ||
    (pdv.pareado_em ? "Sem sincronização recente" : "Não conectado")
  );
}

function buildPdvPayload(form: PdvForm) {
  return {
    nome: form.nome.trim()
  };
}

function isSecurePassword(senha: string) {
  return senha.trim().length >= 8 && /[A-Z]/.test(senha) && /[a-z]/.test(senha) && /\d/.test(senha);
}

export function PdvAccessManager() {
  const [token, setToken] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [pdvs, setPdvs] = useState<Pdv[]>([]);
  const [subcontas, setSubcontas] = useState<Subconta[]>([]);
  const [selectedPdvId, setSelectedPdvId] = useState<number | null>(null);
  const [activePairing, setActivePairing] = useState<PairingState | null>(null);
  const [form, setForm] = useState<PdvForm>(emptyForm);
  const [subcontaForm, setSubcontaForm] = useState<SubcontaForm>(emptySubcontaForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSubcontaId, setEditingSubcontaId] = useState<number | null>(null);
  const [subcontaStep, setSubcontaStep] = useState<SubcontaStep>("email");
  const [isPdvModalOpen, setIsPdvModalOpen] = useState(false);
  const [isSubcontaModalOpen, setIsSubcontaModalOpen] = useState(false);
  const [isPairingModalOpen, setIsPairingModalOpen] = useState(false);
  const [pdvToDelete, setPdvToDelete] = useState<Pdv | null>(null);
  const [subcontaToDelete, setSubcontaToDelete] = useState<Subconta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPairingSaving, setIsPairingSaving] = useState(false);
  const [isPairingCopied, setIsPairingCopied] = useState(false);
  const [showSubcontaPassword, setShowSubcontaPassword] = useState(false);
  const [showSubcontaConfirmPassword, setShowSubcontaConfirmPassword] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const pairingCopyTimeoutRef = useRef<number | null>(null);
  const hasOpenModal =
    isPdvModalOpen ||
    isSubcontaModalOpen ||
    isPairingModalOpen ||
    Boolean(pdvToDelete) ||
    Boolean(subcontaToDelete);
  const pdvModalPresence = useModalPresence(isPdvModalOpen);
  const subcontaModalPresence = useModalPresence(isSubcontaModalOpen);
  const pairingModalPresence = useModalPresence(isPairingModalOpen);
  const pdvDeletePresence = useModalPresence(pdvToDelete);
  const visiblePdvToDelete = pdvDeletePresence.presentValue;
  const subcontaDeletePresence = useModalPresence(subcontaToDelete);
  const visibleSubcontaToDelete = subcontaDeletePresence.presentValue;
  const hasVisibleModal =
    pdvModalPresence.isPresent ||
    subcontaModalPresence.isPresent ||
    pairingModalPresence.isPresent ||
    pdvDeletePresence.isPresent ||
    subcontaDeletePresence.isPresent;

  const selectedPdv = useMemo(
    () => pdvs.find((pdv) => pdv.id === selectedPdvId) ?? pdvs[0] ?? null,
    [pdvs, selectedPdvId]
  );

  const editingPdv = useMemo(
    () => pdvs.find((pdv) => pdv.id === editingId) ?? null,
    [editingId, pdvs]
  );

  const editingSubconta = useMemo(
    () => subcontas.find((subconta) => subconta.id === editingSubcontaId) ?? null,
    [editingSubcontaId, subcontas]
  );

  const visiblePairing =
    selectedPdv && activePairing?.pdvId === selectedPdv.id ? activePairing : null;

  const subcontaPasswordRequirements = useMemo(
    () => [
      { label: "8 caracteres", passed: subcontaForm.senha.trim().length >= 8 },
      { label: "Maiúscula", passed: /[A-Z]/.test(subcontaForm.senha) },
      { label: "Minúscula", passed: /[a-z]/.test(subcontaForm.senha) },
      { label: "Número", passed: /\d/.test(subcontaForm.senha) }
    ],
    [subcontaForm.senha]
  );

  usePlatformModalScrollLock(hasVisibleModal);
  const pdvModalDismiss = useModalDismiss(hasOpenModal, closeTopPdvModal);

  const isSubcontaPasswordSecure = isSecurePassword(subcontaForm.senha);
  const doSubcontaPasswordsMatch =
    subcontaForm.senha.length > 0 && subcontaForm.senha === subcontaForm.confirmarSenha;
  const canManageSubcontas = accountType !== "subconta";

  async function loadPdvs(authToken: string) {
    const result = await apiGet<Pdv[]>("/pdvs", { token: authToken });
    setPdvs(result);
    setSelectedPdvId((current) => current ?? result[0]?.id ?? null);
  }

  async function loadSubcontas(authToken: string) {
    const result = await apiGet<Subconta[]>("/subcontas", { token: authToken });
    setSubcontas(result);
  }

  useEffect(() => {
    const storedToken = window.localStorage.getItem(PLATFORM_AUTH_TOKEN_STORAGE_KEY);

    if (!storedToken) {
      setIsLoading(false);
      setFeedback({
        tone: "warning",
        text: "Entre novamente para gerenciar os PDVs desta conta."
      });
      return;
    }

    setToken(storedToken);
    setAccountType(window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY));
    Promise.all([loadPdvs(storedToken), loadSubcontas(storedToken)])
      .catch((error: unknown) => {
        setFeedback({
          tone: "error",
          text: getApiMessage(error, "Não foi possível carregar os acessos.")
        });
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setIsPairingCopied(false);

    return () => {
      if (pairingCopyTimeoutRef.current) {
        window.clearTimeout(pairingCopyTimeoutRef.current);
      }
    };
  }, [activePairing?.codigo]);

  function closePdvModal() {
    setIsPdvModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFeedback(null);
  }

  function openCreatePdvModal() {
    setEditingId(null);
    setForm(emptyForm);
    setFeedback(null);
    setIsPdvModalOpen(true);
  }

  function openEditPdvModal(pdv: Pdv) {
    setEditingId(pdv.id);
    setSelectedPdvId(pdv.id);
    setForm({ nome: pdv.nome });
    setFeedback(null);
    setIsPdvModalOpen(true);
  }

  function openPairingModal(pdv: Pdv) {
    setSelectedPdvId(pdv.id);
    setFeedback(null);
    setIsPairingModalOpen(true);
  }

  function closeSubcontaModal() {
    setIsSubcontaModalOpen(false);
    setEditingSubcontaId(null);
    setSubcontaStep("email");
    setSubcontaForm(emptySubcontaForm);
    setShowSubcontaPassword(false);
    setShowSubcontaConfirmPassword(false);
    setFeedback(null);
  }

  function closeTopPdvModal() {
    if (subcontaToDelete) {
      setSubcontaToDelete(null);
      return;
    }

    if (pdvToDelete) {
      setPdvToDelete(null);
      return;
    }

    if (isPairingModalOpen) {
      setIsPairingModalOpen(false);
      return;
    }

    if (isSubcontaModalOpen) {
      closeSubcontaModal();
      return;
    }

    if (isPdvModalOpen) {
      closePdvModal();
    }
  }

  function openCreateSubcontaModal() {
    setEditingSubcontaId(null);
    setSubcontaStep("email");
    setSubcontaForm(emptySubcontaForm);
    setFeedback(null);
    setIsSubcontaModalOpen(true);
  }

  function openEditSubcontaModal(subconta: Subconta) {
    setEditingSubcontaId(subconta.id);
    setSubcontaStep("menu");
    setSubcontaForm({
      nome: subconta.nome,
      email: subconta.email,
      senha: "",
      confirmarSenha: "",
      permissoes: subconta.permissoes.length ? subconta.permissoes : []
    });
    setFeedback(null);
    setIsSubcontaModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ tone: "warning", text: "Entre novamente para salvar alterações." });
      return;
    }

    if (form.nome.trim().length < 2) {
      setFeedback({ tone: "warning", text: "Informe um nome para o PDV." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      if (editingId) {
        const updated = await apiPut<Pdv>(`/pdvs/${editingId}`, buildPdvPayload(form), { token });
        setPdvs((current) => current.map((pdv) => (pdv.id === updated.id ? updated : pdv)));
        setFeedback({ tone: "success", text: "PDV atualizado." });
      } else {
        const created = await apiPost<Pdv>("/pdvs", buildPdvPayload(form), { token });
        setPdvs((current) => [...current, created]);
        setSelectedPdvId(created.id);

        if (created.codigo_pareamento) {
          setActivePairing({
            codigo: created.codigo_pareamento,
            expiraEm: created.codigo_pareamento_expira_em,
            pdvId: created.id
          });
          setIsPairingModalOpen(true);
        }

        setFeedback({ tone: "success", text: "PDV criado." });
      }

      closePdvModal();
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível salvar o PDV.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!token || !pdvToDelete) {
      setPdvToDelete(null);
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await apiDelete(`/pdvs/${pdvToDelete.id}`, { token });
      setPdvs((current) => current.filter((item) => item.id !== pdvToDelete.id));

      if (selectedPdvId === pdvToDelete.id) {
        setSelectedPdvId(null);
      }

      if (activePairing?.pdvId === pdvToDelete.id) {
        setActivePairing(null);
        setIsPairingModalOpen(false);
      }

      setPdvToDelete(null);
      setFeedback(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível excluir o PDV.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGeneratePairingCode(pdvId = selectedPdv?.id) {
    if (!token || !pdvId) {
      setFeedback({ tone: "warning", text: "Selecione um PDV para gerar o código." });
      return;
    }

    setIsPairingSaving(true);
    setFeedback(null);

    try {
      const updated = await apiPost<Pdv>(`/pdvs/${pdvId}/codigo-pareamento`, {}, { token });
      setPdvs((current) => current.map((pdv) => (pdv.id === updated.id ? updated : pdv)));
      setSelectedPdvId(updated.id);

      if (updated.codigo_pareamento) {
        setActivePairing({
          codigo: updated.codigo_pareamento,
          expiraEm: updated.codigo_pareamento_expira_em,
          pdvId: updated.id
        });
      }

      setIsPairingModalOpen(true);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível gerar o código.")
      });
    } finally {
      setIsPairingSaving(false);
    }
  }

  async function handleCopyPairingCode() {
    if (!visiblePairing?.codigo) {
      setFeedback({ tone: "warning", text: "Gere um código para copiar." });
      return;
    }

    try {
      await navigator.clipboard.writeText(visiblePairing.codigo);
      setIsPairingCopied(true);

      if (pairingCopyTimeoutRef.current) {
        window.clearTimeout(pairingCopyTimeoutRef.current);
      }

      pairingCopyTimeoutRef.current = window.setTimeout(() => {
        setIsPairingCopied(false);
        pairingCopyTimeoutRef.current = null;
      }, 1800);
    } catch {
      setFeedback({ tone: "warning", text: `Copie manualmente: ${visiblePairing.codigo}` });
    }
  }

  function toggleSubcontaPermission(permissionKey: string) {
    setSubcontaForm((current) => {
      const exists = current.permissoes.includes(permissionKey);

      return {
        ...current,
        permissoes: exists
          ? current.permissoes.filter((permission) => permission !== permissionKey)
          : [...current.permissoes, permissionKey]
      };
    });
  }

  async function handleSubcontaEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ tone: "warning", text: "Entre novamente para criar subcontas." });
      return;
    }

    const email = subcontaForm.email.trim().toLowerCase();
    const nome = subcontaForm.nome.trim().replace(/\s+/g, " ");

    if (nome.length < 2) {
      setFeedback({ tone: "warning", text: "Informe um nome para este acesso." });
      return;
    }

    if (!email || !email.includes("@")) {
      setFeedback({ tone: "warning", text: "Informe um e-mail válido." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await apiPost<{ disponivel: boolean; message?: string; email?: string }>(
        "/subcontas/identificar",
        { email },
        { token }
      );

      if (!result.disponivel) {
        setFeedback({ tone: "error", text: result.message || "Este e-mail já está em uso." });
        return;
      }

      setSubcontaForm((current) => ({ ...current, nome, email: result.email || email }));
      setSubcontaStep("password");
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível verificar este e-mail.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubcontaPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isSubcontaPasswordSecure) {
      setFeedback({ tone: "warning", text: "A senha ainda não atende aos requisitos mínimos." });
      return;
    }

    if (!doSubcontaPasswordsMatch) {
      setFeedback({ tone: "warning", text: "As senhas precisam ser iguais." });
      return;
    }

    setFeedback(null);
    setSubcontaStep("permissions");
  }

  async function handleSubcontaDataSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !editingSubcontaId) {
      setFeedback({ tone: "warning", text: "Selecione uma subconta para editar." });
      return;
    }

    const email = subcontaForm.email.trim().toLowerCase();
    const nome = subcontaForm.nome.trim().replace(/\s+/g, " ");

    if (nome.length < 2) {
      setFeedback({ tone: "warning", text: "Informe um nome para este acesso." });
      return;
    }

    if (!email || !email.includes("@")) {
      setFeedback({ tone: "warning", text: "Informe um e-mail válido." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const updated = await apiPut<Subconta>(
        `/subcontas/${editingSubcontaId}/dados`,
        { nome, email },
        { token }
      );

      closeSubcontaModal();
      setSubcontas((current) => current.map((subconta) => (subconta.id === updated.id ? updated : subconta)));
      setFeedback({ tone: "success", text: "Subconta atualizada." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível atualizar a subconta.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubcontaPasswordUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token || !editingSubcontaId) {
      setFeedback({ tone: "warning", text: "Selecione uma subconta para editar." });
      return;
    }

    if (!isSubcontaPasswordSecure) {
      setFeedback({ tone: "warning", text: "A senha ainda não atende aos requisitos mínimos." });
      return;
    }

    if (!doSubcontaPasswordsMatch) {
      setFeedback({ tone: "warning", text: "As senhas precisam ser iguais." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await apiPut<{ subconta: Subconta; message?: string }>(
        `/subcontas/${editingSubcontaId}/senha`,
        { senha: subcontaForm.senha },
        { token }
      );

      closeSubcontaModal();
      setSubcontas((current) =>
        current.map((subconta) => (subconta.id === result.subconta.id ? result.subconta : subconta))
      );
      setFeedback({ tone: "success", text: result.message || "Senha atualizada." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível atualizar a senha.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubcontaPermissionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      setFeedback({ tone: "warning", text: "Entre novamente para salvar subcontas." });
      return;
    }

    if (!subcontaForm.permissoes.length) {
      setFeedback({ tone: "warning", text: "Selecione pelo menos um acesso para esta subconta." });
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      if (editingSubcontaId) {
        const updated = await apiPut<Subconta>(
          `/subcontas/${editingSubcontaId}/permissoes`,
          { permissoes: subcontaForm.permissoes },
          { token }
        );

        closeSubcontaModal();
        setSubcontas((current) => current.map((subconta) => (subconta.id === updated.id ? updated : subconta)));
        setFeedback({ tone: "success", text: "Acessos atualizados." });
        return;
      }

      const result = await apiPost<{ subconta: Subconta; message?: string }>(
        "/subcontas",
        {
          nome: subcontaForm.nome.trim().replace(/\s+/g, " "),
          email: subcontaForm.email.trim().toLowerCase(),
          senha: subcontaForm.senha,
          permissoes: subcontaForm.permissoes
        },
        { token }
      );

      setSubcontas((current) => [...current, result.subconta]);
      closeSubcontaModal();
      setFeedback({ tone: "success", text: result.message || "Subconta criada." });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível salvar a subconta.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirmSubcontaDelete() {
    if (!token || !subcontaToDelete) {
      setSubcontaToDelete(null);
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await apiDelete(`/subcontas/${subcontaToDelete.id}`, { token });
      setSubcontas((current) => current.filter((subconta) => subconta.id !== subcontaToDelete.id));
      setSubcontaToDelete(null);
    } catch (error) {
      setFeedback({
        tone: "error",
        text: getApiMessage(error, "Não foi possível remover a subconta.")
      });
    } finally {
      setIsSaving(false);
    }
  }

  const modalFeedback = feedback ? (
    <div className="platform-modal-feedback">
      <AuthFeedback tone={feedback.tone}>{feedback.text}</AuthFeedback>
    </div>
  ) : null;

  return (
    <main className="platform-main platform-access-main">
      <section className="platform-page-heading platform-access-heading">
        <div>
          <span className="platform-page-kicker">PDVs e subcontas</span>
          <h1>Controle quem entra e quais caixas operam.</h1>
          <p>Cadastre PDVs, gere códigos de ativação e organize acessos da equipe.</p>
        </div>
      </section>

      <section className="platform-access-stack">
        <article className="platform-access-section">
          <div className="platform-access-section-head">
            <div>
              <h2>PDVs</h2>
              <p>Computadores autorizados a abrir o caixa.</p>
            </div>
            <button className="platform-primary-button" type="button" onClick={openCreatePdvModal}>
              <Plus aria-hidden="true" size={16} />
              Novo PDV
            </button>
          </div>

          <div className="platform-access-list">
            {isLoading ? (
              Array.from({ length: 3 }, (_, index) => (
                <div className="platform-access-row platform-access-row-skeleton" key={index}>
                  <i className="platform-skeleton-block platform-access-skeleton-icon" />
                  <span className="platform-access-main-copy">
                    <i className="platform-skeleton-line platform-access-skeleton-title" />
                    <i className="platform-skeleton-line platform-access-skeleton-copy" />
                  </span>
                  <span className="platform-access-meta">
                    <i className="platform-skeleton-line platform-access-skeleton-meta" />
                    <i className="platform-skeleton-line platform-access-skeleton-copy" />
                  </span>
                  <span className="platform-row-actions">
                    <i className="platform-skeleton-block platform-access-skeleton-action" />
                    <i className="platform-skeleton-block platform-access-skeleton-action" />
                  </span>
                </div>
              ))
            ) : pdvs.length ? (
              pdvs.map((pdv) => (
                <div className="platform-access-row" key={pdv.id}>
                  <span className="platform-access-icon">
                    <Monitor aria-hidden="true" size={18} />
                  </span>
                  <span className="platform-access-main-copy">
                    <strong>{pdv.nome}</strong>
                    <small className="platform-device-state">
                      <span>{pdv.identificacao}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          pdv.pareado_em ? "platform-device-state-ok" : "platform-device-state-danger"
                        }
                      >
                        {pdv.pareado_em ? "Pareado" : "Sem dispositivo"}
                      </span>
                    </small>
                  </span>
                  <span className="platform-access-meta">
                    <b>Última sincronização</b>
                    <small>{formatLastSync(pdv)}</small>
                  </span>
                  <span className="platform-row-actions">
                    <button
                      type="button"
                      aria-label={`Editar ${pdv.nome}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditPdvModal(pdv);
                      }}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    {!pdv.pareado_em ? (
                      <button
                        type="button"
                        aria-label={`Gerar código de ativação para ${pdv.nome}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          openPairingModal(pdv);
                          void handleGeneratePairingCode(pdv.id);
                        }}
                      >
                        <KeyRound aria-hidden="true" size={15} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Excluir ${pdv.nome}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPdvToDelete(pdv);
                      }}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </span>
                </div>
              ))
            ) : (
              <div className="platform-access-empty">
                <Monitor aria-hidden="true" size={20} />
                <span>Nenhum PDV cadastrado.</span>
                <button className="platform-primary-button" type="button" onClick={openCreatePdvModal}>
                  Criar primeiro PDV
                  <Plus aria-hidden="true" size={17} />
                </button>
              </div>
            )}
          </div>
        </article>

        <article className="platform-access-section">
          <div className="platform-access-section-head">
            <div>
              <h2>Subcontas</h2>
              <p>Acessos separados para equipe e suporte.</p>
            </div>
            {canManageSubcontas ? (
              <button className="platform-secondary-button" type="button" onClick={openCreateSubcontaModal}>
                <Plus aria-hidden="true" size={16} />
                Nova subconta
              </button>
            ) : null}
          </div>

          <div className="platform-access-list">
            <div className="platform-access-row platform-subaccount-row platform-subaccount-row-static">
              <span className="platform-access-icon">
                <ShieldCheck aria-hidden="true" size={18} />
              </span>
              <span className="platform-access-main-copy">
                <strong>{canManageSubcontas ? "Conta principal" : "Seu acesso"}</strong>
                <small>
                  <PlatformAccountEmail />
                </small>
              </span>
            </div>

            {subcontas.map((subconta) => (
              <div className="platform-access-row platform-subaccount-row" key={subconta.id}>
                <span className="platform-access-icon">
                  <UserRound aria-hidden="true" size={18} />
                </span>
                <span className="platform-access-main-copy">
                  <strong>{subconta.nome}</strong>
                  <small>{subconta.email}</small>
                </span>
                {canManageSubcontas ? (
                  <span className="platform-row-actions">
                    <button
                      type="button"
                      aria-label={`Editar ${subconta.email}`}
                      onClick={() => openEditSubcontaModal(subconta)}
                    >
                      <Pencil aria-hidden="true" size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${subconta.email}`}
                      onClick={() => setSubcontaToDelete(subconta)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </span>
                ) : (
                  <span className="platform-row-actions" aria-hidden="true" />
                )}
              </div>
            ))}
          </div>
        </article>
      </section>

      {pdvModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pdvModalPresence.state}
          role="presentation"
          {...pdvModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-pdv-modal-title"
            aria-modal="true"
            className="platform-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closePdvModal}>
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-pdv-modal-title">{editingId ? "Editar PDV" : "Novo PDV"}</h2>
              <p>{editingPdv ? editingPdv.identificacao : "Nomeie o computador que vai operar o caixa."}</p>
            </div>
            {modalFeedback}

            <form className="platform-compact-form" onSubmit={handleSubmit}>
              <label>
                <span>Nome do PDV</span>
                <input
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                  placeholder="Balcão principal"
                  required
                  type="text"
                  value={form.nome}
                />
              </label>

              <div className="platform-modal-actions platform-item-modal-actions">
                <button className="platform-secondary-button" type="button" onClick={closePdvModal}>
                  Cancelar
                </button>
                <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
                  {isSaving ? "Salvando" : editingId ? "Salvar" : "Criar PDV"}
                  {isSaving ? (
                    <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                  ) : (
                    <Monitor aria-hidden="true" size={17} />
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {pairingModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pairingModalPresence.state}
          role="presentation"
          {...pdvModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-pairing-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact"
            role="dialog"
          >
            <button
              className="platform-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setIsPairingModalOpen(false)}
            >
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-pairing-modal-title">Código de ativação</h2>
              <p>Informe este código no Caixa Ágil Desktop do computador do caixa.</p>
            </div>
            {modalFeedback}

            <div className="platform-pairing-modal-code" aria-label="Código de pareamento">
              <small>{selectedPdv ? `${selectedPdv.identificacao} · ${selectedPdv.nome}` : "Selecione um PDV"}</small>
              <strong>{visiblePairing?.codigo ?? "Gere um código"}</strong>
              <span>
                {visiblePairing?.expiraEm
                  ? `Expira em ${formatDateTime(visiblePairing.expiraEm)}`
                  : "O código aparece aqui após ser gerado."}
              </span>
            </div>

            <div className="platform-modal-actions">
              <button className="platform-secondary-button" type="button" onClick={handleCopyPairingCode}>
                {isPairingCopied ? (
                  <Check aria-hidden="true" size={16} />
                ) : (
                  <Copy aria-hidden="true" size={16} />
                )}
                {isPairingCopied ? "Copiado" : "Copiar código"}
              </button>
              <button
                className="platform-primary-button"
                disabled={isPairingSaving || !selectedPdv}
                type="button"
                onClick={() => void handleGeneratePairingCode()}
              >
                {isPairingSaving ? "Gerando" : "Gerar novo"}
                {isPairingSaving ? (
                  <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                ) : (
                  <RotateCcw aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pdvDeletePresence.isPresent && visiblePdvToDelete ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={pdvDeletePresence.state}
          role="presentation"
          {...pdvModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-delete-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact"
            role="dialog"
          >
            <button
              className="platform-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setPdvToDelete(null)}
            >
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-delete-modal-title">Excluir PDV?</h2>
              <p>{visiblePdvToDelete.identificacao} · {visiblePdvToDelete.nome}</p>
            </div>
            {modalFeedback}

            <div className="platform-modal-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setPdvToDelete(null)}>
                Cancelar
              </button>
              <button className="platform-primary-button platform-danger-button" disabled={isSaving} type="button" onClick={handleConfirmDelete}>
                {isSaving ? "Excluindo" : "Excluir"}
                {isSaving ? (
                  <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                ) : (
                  <Trash2 aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {subcontaModalPresence.isPresent ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={subcontaModalPresence.state}
          role="presentation"
          {...pdvModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-subaccount-modal-title"
            aria-modal="true"
            className="platform-modal platform-subaccount-modal"
            role="dialog"
          >
            <button className="platform-modal-close" type="button" aria-label="Fechar" onClick={closeSubcontaModal}>
              <X aria-hidden="true" size={18} />
            </button>

            {subcontaStep === "menu" && editingSubconta ? (
              <div className="auth-step-panel platform-subaccount-flow">
                <h2 id="platform-subaccount-modal-title">Escolha uma ação</h2>
                <p>
                  Edite a subconta <strong>{editingSubconta.nome}</strong>.
                </p>
                {modalFeedback}

                <div className="platform-subaccount-action-list" aria-label="Ações da subconta">
                  <button
                    className="platform-subaccount-action-card"
                    type="button"
                    onClick={() => setSubcontaStep("data")}
                  >
                    <span className="platform-subaccount-action-icon">
                      <AtSign aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Nome e e-mail</strong>
                      <small>Atualize a identificação interna e o e-mail de acesso.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>

                  <button
                    className="platform-subaccount-action-card"
                    type="button"
                    onClick={() => {
                      setSubcontaForm((current) => ({ ...current, senha: "", confirmarSenha: "" }));
                      setSubcontaStep("password");
                    }}
                  >
                    <span className="platform-subaccount-action-icon">
                      <LockKeyhole aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Nova senha</strong>
                      <small>Defina uma nova senha para este acesso.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>

                  <button
                    className="platform-subaccount-action-card"
                    type="button"
                    onClick={() => setSubcontaStep("permissions")}
                  >
                    <span className="platform-subaccount-action-icon">
                      <SlidersHorizontal aria-hidden="true" size={18} />
                    </span>
                    <span>
                      <strong>Acessos</strong>
                      <small>Escolha quais áreas esta subconta pode abrir.</small>
                    </span>
                    <ArrowRight aria-hidden="true" size={17} />
                  </button>
                </div>
              </div>
            ) : null}

            {subcontaStep === "data" && editingSubconta ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubcontaDataSubmit}>
                <h2 id="platform-subaccount-modal-title">Editar dados</h2>
                <p>Atualize a identificação e o e-mail usado para entrar.</p>
                {modalFeedback}

                <label className="auth-field" htmlFor="subconta-editar-nome">
                  <span>Identificação</span>
                  <input
                    autoFocus
                    id="subconta-editar-nome"
                    maxLength={80}
                    onChange={(event) =>
                      setSubcontaForm((current) => ({ ...current, nome: event.target.value }))
                    }
                    placeholder="Financeiro, Gerente ou Contador"
                    required
                    type="text"
                    value={subcontaForm.nome}
                  />
                </label>

                <label className="auth-field" htmlFor="subconta-editar-email">
                  <span>E-mail</span>
                  <input
                    id="subconta-editar-email"
                    inputMode="email"
                    onChange={(event) =>
                      setSubcontaForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="operador@empresa.com.br"
                    required
                    type="email"
                    value={subcontaForm.email}
                  />
                </label>

                <div className="auth-action-row platform-item-modal-actions">
                  <button className="platform-secondary-button" type="button" onClick={() => setSubcontaStep("menu")}>
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
                    {isSaving ? "Salvando" : "Salvar"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <Check aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {subcontaStep === "email" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubcontaEmailSubmit}>
                <h2 id="platform-subaccount-modal-title">Identifique o acesso</h2>
                <p>Use um nome interno e um e-mail que ainda não exista.</p>
                {modalFeedback}

                <label className="auth-field" htmlFor="subconta-nome">
                  <span>Identificação</span>
                  <input
                    autoFocus
                    id="subconta-nome"
                    maxLength={80}
                    onChange={(event) =>
                      setSubcontaForm((current) => ({ ...current, nome: event.target.value }))
                    }
                    placeholder="Financeiro, Gerente ou Contador"
                    required
                    type="text"
                    value={subcontaForm.nome}
                  />
                </label>

                <label className="auth-field" htmlFor="subconta-email">
                  <span>E-mail</span>
                  <input
                    id="subconta-email"
                    inputMode="email"
                    onChange={(event) =>
                      setSubcontaForm((current) => ({ ...current, email: event.target.value }))
                    }
                    placeholder="operador@empresa.com.br"
                    required
                    type="email"
                    value={subcontaForm.email}
                  />
                </label>

                <div className="auth-action-row">
                  <button className="platform-secondary-button" type="button" onClick={closeSubcontaModal}>
                    Cancelar
                  </button>
                  <button className="platform-primary-button" disabled={isSaving} type="submit">
                    {isSaving ? "Verificando" : "Continuar"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {subcontaStep === "password" ? (
              <form
                className="auth-step-panel platform-subaccount-flow"
                onSubmit={editingSubconta ? handleSubcontaPasswordUpdateSubmit : handleSubcontaPasswordSubmit}
              >
                <h2 id="platform-subaccount-modal-title">{editingSubconta ? "Nova senha" : "Crie a senha"}</h2>
                <p>
                  {editingSubconta ? "Atualize a senha do acesso " : "Esta senha será usada pelo acesso "}
                  <strong>{subcontaForm.nome}</strong>.
                </p>
                {modalFeedback}

                <label className="auth-field" htmlFor="subconta-senha">
                  <span>Senha</span>
                  <div className="auth-password-input">
                    <input
                      autoFocus
                      aria-invalid={subcontaForm.senha.length > 0 && !isSubcontaPasswordSecure}
                      autoComplete="new-password"
                      id="subconta-senha"
                      onChange={(event) =>
                        setSubcontaForm((current) => ({ ...current, senha: event.target.value }))
                      }
                      placeholder="Nova senha"
                      required
                      type={showSubcontaPassword ? "text" : "password"}
                      value={subcontaForm.senha}
                    />
                    <button
                      aria-label={showSubcontaPassword ? "Ocultar senha" : "Mostrar senha"}
                      className="auth-password-toggle"
                      onClick={() => setShowSubcontaPassword((current) => !current)}
                      type="button"
                    >
                      {showSubcontaPassword ? (
                        <EyeOff aria-hidden="true" size={18} />
                      ) : (
                        <Eye aria-hidden="true" size={18} />
                      )}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules" aria-label="Requisitos da senha">
                  {subcontaPasswordRequirements.map((requirement) => (
                    <span
                      className={
                        requirement.passed ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"
                      }
                      key={requirement.label}
                    >
                      <i aria-hidden="true">
                        <Check size={12} />
                      </i>
                      {requirement.label}
                    </span>
                  ))}
                </div>

                <label className="auth-field auth-confirm-field" htmlFor="subconta-confirmar-senha">
                  <span>Confirmar senha</span>
                  <div className="auth-password-input">
                    <input
                      aria-invalid={subcontaForm.confirmarSenha.length > 0 && !doSubcontaPasswordsMatch}
                      autoComplete="new-password"
                      id="subconta-confirmar-senha"
                      onChange={(event) =>
                        setSubcontaForm((current) => ({ ...current, confirmarSenha: event.target.value }))
                      }
                      placeholder="Repita a senha"
                      required
                      type={showSubcontaConfirmPassword ? "text" : "password"}
                      value={subcontaForm.confirmarSenha}
                    />
                    <button
                      aria-label={showSubcontaConfirmPassword ? "Ocultar confirmação" : "Mostrar confirmação"}
                      className="auth-password-toggle"
                      onClick={() => setShowSubcontaConfirmPassword((current) => !current)}
                      type="button"
                    >
                      {showSubcontaConfirmPassword ? (
                        <EyeOff aria-hidden="true" size={18} />
                      ) : (
                        <Eye aria-hidden="true" size={18} />
                      )}
                    </button>
                  </div>
                </label>

                <div className="auth-password-rules auth-confirm-rules" aria-label="Confirmação da senha">
                  <span className={doSubcontaPasswordsMatch ? "auth-password-rule auth-password-rule-ok" : "auth-password-rule"}>
                    <i aria-hidden="true">
                      <Check size={12} />
                    </i>
                    Senhas iguais
                  </span>
                </div>

                <div className="auth-action-row platform-item-modal-actions">
                  <button
                    className="platform-secondary-button"
                    type="button"
                    onClick={() => setSubcontaStep(editingSubconta ? "menu" : "email")}
                  >
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button
                    className={
                      editingSubconta
                        ? "platform-primary-button platform-save-button"
                        : "platform-primary-button"
                    }
                    disabled={!isSubcontaPasswordSecure || !doSubcontaPasswordsMatch || isSaving}
                    type="submit"
                  >
                    {isSaving ? "Salvando" : editingSubconta ? "Salvar senha" : "Continuar"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : editingSubconta ? (
                      <Check aria-hidden="true" size={17} />
                    ) : (
                      <ArrowRight aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}

            {subcontaStep === "permissions" ? (
              <form className="auth-step-panel platform-subaccount-flow" onSubmit={handleSubcontaPermissionsSubmit}>
                <h2 id="platform-subaccount-modal-title">
                  {editingSubconta ? "Editar acessos" : "Defina os acessos"}
                </h2>
                <p>
                  Escolha quais áreas <strong>{subcontaForm.nome}</strong> pode abrir.
                </p>
                {modalFeedback}

                <div className="platform-permission-list" aria-label="Acessos da subconta">
                  {permissionOptions.map((permission) => {
                    const checked = subcontaForm.permissoes.includes(permission.chave);

                    return (
                      <label
                        className={
                          checked
                            ? "platform-permission-option platform-permission-option-selected"
                            : "platform-permission-option"
                        }
                        key={permission.chave}
                      >
                        <input
                          checked={checked}
                          onChange={() => toggleSubcontaPermission(permission.chave)}
                          type="checkbox"
                        />
                        <span className="platform-permission-check" aria-hidden="true">
                          {checked ? <Check size={14} /> : null}
                        </span>
                        <span className="platform-permission-copy">
                          <strong>{permission.titulo}</strong>
                          <small>{permission.descricao}</small>
                        </span>
                      </label>
                    );
                  })}
                </div>

                <div className="auth-action-row platform-item-modal-actions">
                  <button
                    className="platform-secondary-button"
                    type="button"
                    onClick={editingSubconta ? () => setSubcontaStep("menu") : () => setSubcontaStep("password")}
                  >
                    <ArrowLeft aria-hidden="true" size={17} />
                    Voltar
                  </button>
                  <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
                    {isSaving ? "Salvando" : editingSubconta ? "Salvar acessos" : "Criar subconta"}
                    {isSaving ? (
                      <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                    ) : editingSubconta ? (
                      <Check aria-hidden="true" size={17} />
                    ) : (
                      <UserRound aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}

      {subcontaDeletePresence.isPresent && visibleSubcontaToDelete ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={subcontaDeletePresence.state}
          role="presentation"
          {...pdvModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="platform-delete-subaccount-modal-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact"
            role="dialog"
          >
            <button
              className="platform-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setSubcontaToDelete(null)}
            >
              <X aria-hidden="true" size={18} />
            </button>
            <div className="platform-modal-head">
              <h2 id="platform-delete-subaccount-modal-title">Remover subconta?</h2>
              <p>
                {visibleSubcontaToDelete.nome} · {visibleSubcontaToDelete.email}
              </p>
            </div>
            {modalFeedback}

            <div className="platform-modal-actions">
              <button className="platform-secondary-button" type="button" onClick={() => setSubcontaToDelete(null)}>
                Cancelar
              </button>
              <button
                className="platform-primary-button platform-danger-button"
                disabled={isSaving}
                type="button"
                onClick={handleConfirmSubcontaDelete}
              >
                {isSaving ? "Removendo" : "Remover"}
                {isSaving ? (
                  <LoaderCircle className="platform-spin" aria-hidden="true" size={17} />
                ) : (
                  <Trash2 aria-hidden="true" size={16} />
                )}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
