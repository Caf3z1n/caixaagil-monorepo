"use client";

import Link from "next/link";
import { flushSync } from "react-dom";
import {
  FormEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  FileCheck2,
  Info,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  FileText,
  X
} from "lucide-react";

import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import { PlatformSelect } from "@/components/platform-select";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";
import { capitalizeFirstTextLetter } from "@/lib/text-format";
import { useModalDismiss } from "@/lib/use-modal-dismiss";
import { useModalPresence } from "@/lib/use-modal-presence";
import { usePlatformModalScrollLock } from "@/lib/use-platform-modal-scroll-lock";

type RegimeTributario = "simples_nacional" | "regime_normal";
type FiscalFlowStep = "choice" | "create" | "list" | "edit";
type FiscalFlowMotion = "forward" | "backward";

type GrupoFiscal = {
  id: number;
  usuario_id: number;
  nome: string;
  icone: string;
  regime_tributario: RegimeTributario;
  ativo: boolean;
  ncm: string | null;
  cfop: string;
  cst_icms: string | null;
  csosn: string | null;
  aliquota_icms: number | null;
  reducao_icms: number | null;
  base_icms_st: number | null;
  cst_pis: string;
  aliquota_pis: number | null;
  cst_cofins: string;
  aliquota_cofins: number | null;
  ibs_ativo: boolean;
  cst_ibs: string | null;
  classificacao_ibs: string | null;
  aliquota_ibs_uf: number | null;
  aliquota_ibs_municipal: number | null;
  aliquota_cbs: number | null;
  produtos_vinculados: number;
  pode_excluir: boolean;
  acao_remocao: "excluir" | "desativar";
};

type DeleteFiscalGroupResponse =
  | { action: "deleted"; id: number; message?: string }
  | { action: "deactivated"; grupo_fiscal: GrupoFiscal; message?: string };

type ActivateFiscalGroupResponse = {
  action: "activated";
  grupo_fiscal: GrupoFiscal;
  message?: string;
};

type FiscalGroupDraft = {
  nome: string;
  icone: string;
  regime_tributario: RegimeTributario;
  ativo: boolean;
  ncm: string;
  cfop: string;
  cst_icms: string;
  csosn: string;
  aliquota_icms: string;
  reducao_icms: string;
  base_icms_st: string;
  cst_pis: string;
  aliquota_pis: string;
  cst_cofins: string;
  aliquota_cofins: string;
  ibs_ativo: boolean;
  cst_ibs: string;
  classificacao_ibs: string;
  aliquota_ibs_uf: string;
  aliquota_ibs_municipal: string;
  aliquota_cbs: string;
};

const regimeOptions = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "regime_normal", label: "Regime normal" }
] satisfies Array<{ value: RegimeTributario; label: string }>;

const cstReductionCodes = new Set(["20", "70", "90"]);
const cstIcmsStCodes = new Set(["10", "30", "70", "90"]);
const csosnIcmsStCodes = new Set(["201", "202", "203", "900"]);

const fiscalFlowMotionOrder: FiscalFlowStep[] = ["choice", "create", "list", "edit"];

function getFiscalFlowMotionIndex(step: FiscalFlowStep) {
  const index = fiscalFlowMotionOrder.indexOf(step);

  return index >= 0 ? index : 0;
}

function digitsOnly(value: string, maxLength?: number) {
  const digits = value.replace(/\D/g, "");

  return typeof maxLength === "number" ? digits.slice(0, maxLength) : digits;
}

function decimalInput(value: string) {
  return value.replace(/[^\d,.]/g, "");
}

function formatDecimalInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value).replace(".", ",");
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase();
}

function formatTaxRegimeLabel(profile: GrupoFiscal) {
  return profile.regime_tributario === "simples_nacional"
    ? "Simples Nacional"
    : "Regime normal";
}

function formatLinkedProductCount(total: number) {
  return `${total} produto${total === 1 ? "" : "s"}`;
}

function getFiscalTaxCode(draft: FiscalGroupDraft) {
  return draft.regime_tributario === "simples_nacional"
    ? draft.csosn.trim()
    : draft.cst_icms.trim();
}

function shouldShowIcmsReduction(regime: RegimeTributario, taxCode: string) {
  return regime === "regime_normal" && cstReductionCodes.has(taxCode);
}

function shouldShowIcmsSt(regime: RegimeTributario, taxCode: string) {
  return regime === "simples_nacional"
    ? csosnIcmsStCodes.has(taxCode)
    : cstIcmsStCodes.has(taxCode);
}

function normalizeAdvancedIcmsFields(draft: FiscalGroupDraft) {
  const taxCode = getFiscalTaxCode(draft);

  return {
    ...draft,
    reducao_icms: shouldShowIcmsReduction(draft.regime_tributario, taxCode)
      ? draft.reducao_icms
      : "",
    base_icms_st: shouldShowIcmsSt(draft.regime_tributario, taxCode)
      ? draft.base_icms_st
      : ""
  };
}

function buildEmptyFiscalGroupDraft(): FiscalGroupDraft {
  return {
    nome: "",
    icone: "package",
    regime_tributario: "simples_nacional",
    ativo: true,
    ncm: "",
    cfop: "",
    cst_icms: "",
    csosn: "",
    aliquota_icms: "",
    reducao_icms: "",
    base_icms_st: "",
    cst_pis: "",
    aliquota_pis: "",
    cst_cofins: "",
    aliquota_cofins: "",
    ibs_ativo: false,
    cst_ibs: "",
    classificacao_ibs: "",
    aliquota_ibs_uf: "",
    aliquota_ibs_municipal: "",
    aliquota_cbs: ""
  };
}

function buildFiscalGroupDraft(profile: GrupoFiscal): FiscalGroupDraft {
  return {
    nome: capitalizeFirstTextLetter(profile.nome),
    icone: profile.icone || "package",
    regime_tributario: profile.regime_tributario,
    ativo: true,
    ncm: profile.ncm ?? "",
    cfop: profile.cfop ?? "",
    cst_icms: profile.cst_icms ?? "",
    csosn: profile.csosn ?? "",
    aliquota_icms: formatDecimalInput(profile.aliquota_icms),
    reducao_icms: formatDecimalInput(profile.reducao_icms),
    base_icms_st: formatDecimalInput(profile.base_icms_st),
    cst_pis: profile.cst_pis ?? "",
    aliquota_pis: formatDecimalInput(profile.aliquota_pis),
    cst_cofins: profile.cst_cofins ?? "",
    aliquota_cofins: formatDecimalInput(profile.aliquota_cofins),
    ibs_ativo: profile.ibs_ativo === true,
    cst_ibs: profile.cst_ibs ?? "",
    classificacao_ibs: profile.classificacao_ibs ?? "",
    aliquota_ibs_uf: formatDecimalInput(profile.aliquota_ibs_uf),
    aliquota_ibs_municipal: formatDecimalInput(profile.aliquota_ibs_municipal),
    aliquota_cbs: formatDecimalInput(profile.aliquota_cbs)
  };
}

function canSaveFiscalGroupDraft(draft: FiscalGroupDraft) {
  return (
    draft.nome.trim().length > 0 &&
    draft.cfop.trim().length > 0 &&
    (draft.regime_tributario === "simples_nacional"
      ? draft.csosn.trim().length > 0
      : draft.cst_icms.trim().length > 0) &&
    draft.cst_pis.trim().length > 0 &&
    draft.aliquota_pis.trim().length > 0 &&
    draft.cst_cofins.trim().length > 0 &&
    draft.aliquota_cofins.trim().length > 0 &&
    (!draft.ibs_ativo ||
      (draft.cst_ibs.trim().length > 0 &&
        draft.classificacao_ibs.trim().length > 0))
  );
}

function buildSaveFiscalGroupInput(draft: FiscalGroupDraft) {
  const normalizedDraft = normalizeAdvancedIcmsFields(draft);

  return {
    nome: capitalizeFirstTextLetter(normalizedDraft.nome).trim(),
    icone: "package",
    regime_tributario: normalizedDraft.regime_tributario,
    ativo: true,
    ncm: normalizedDraft.ncm.trim() || null,
    cfop: normalizedDraft.cfop.trim(),
    cst_icms: normalizedDraft.cst_icms.trim() || null,
    csosn: normalizedDraft.csosn.trim() || null,
    aliquota_icms: normalizedDraft.aliquota_icms,
    reducao_icms: normalizedDraft.reducao_icms,
    base_icms_st: normalizedDraft.base_icms_st,
    cst_pis: normalizedDraft.cst_pis.trim(),
    aliquota_pis: normalizedDraft.aliquota_pis,
    cst_cofins: normalizedDraft.cst_cofins.trim(),
    aliquota_cofins: normalizedDraft.aliquota_cofins,
    ibs_ativo: normalizedDraft.ibs_ativo,
    cst_ibs: normalizedDraft.cst_ibs.trim() || null,
    classificacao_ibs: normalizedDraft.classificacao_ibs.trim() || null,
    aliquota_ibs_uf: normalizedDraft.aliquota_ibs_uf,
    aliquota_ibs_municipal: normalizedDraft.aliquota_ibs_municipal,
    aliquota_cbs: normalizedDraft.aliquota_cbs
  };
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallbackMessage;
  }

  return fallbackMessage;
}

function FiscalGroupListItem({
  profile,
  onEdit
}: {
  profile: GrupoFiscal;
  onEdit: (profileId: number) => void;
}) {
  return (
    <button
      type="button"
      className={profile.ativo ? "fiscal-group-row" : "fiscal-group-row platform-record-inactive"}
      onClick={() => onEdit(profile.id)}
    >
      <span className="fiscal-group-row-icon" aria-hidden="true">
        <FileText size={18} />
      </span>

      <span className="fiscal-group-row-main">
        <span className="fiscal-group-row-title">
          <strong>{profile.nome}</strong>
        </span>
        <small>
          CFOP {profile.cfop || "--"} · {formatTaxRegimeLabel(profile)} ·{" "}
          {formatLinkedProductCount(profile.produtos_vinculados ?? 0)}
          {!profile.ativo ? " · Desativado" : ""}
        </small>
      </span>

      <span className="fiscal-group-row-action" aria-hidden="true">
        <Pencil size={15} />
        Editar
      </span>
    </button>
  );
}

function FiscalGroupEditor({
  editingGroupId,
  linkedProductsCount,
  draft,
  errorMessage,
  onDraftChange,
  onSubmit
}: {
  editingGroupId: number | null;
  linkedProductsCount: number;
  draft: FiscalGroupDraft;
  errorMessage: string | null;
  onDraftChange: (updater: (currentDraft: FiscalGroupDraft) => FiscalGroupDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const taxCodeLabel = draft.regime_tributario === "simples_nacional" ? "CSOSN" : "CST ICMS";
  const taxCodeHelpLines =
    draft.regime_tributario === "simples_nacional"
      ? [
          "Use CSOSN para empresas do Simples Nacional.",
          "201, 202, 203 e 900 exibem campos de ICMS-ST."
        ]
      : [
          "Use CST ICMS para empresas no regime normal.",
          "20, 70 e 90 exibem redução de base.",
          "10, 30, 70 e 90 exibem ICMS-ST."
        ];
  const taxCodeHelpText = taxCodeHelpLines.join(" ");
  const taxCode = getFiscalTaxCode(draft);
  const showIcmsReduction = shouldShowIcmsReduction(draft.regime_tributario, taxCode);
  const showIcmsSt = shouldShowIcmsSt(draft.regime_tributario, taxCode);
  const showAdvancedIcms = showIcmsReduction || showIcmsSt;

  return (
    <section className="fiscal-group-editor">
        <header className="platform-flow-head fiscal-editor-head">
          <h2 id={editingGroupId ? "fiscal-edit-modal-title" : undefined}>
            {editingGroupId ? "Editar grupo fiscal" : "Novo grupo fiscal"}
          </h2>
          <p>Defina os códigos fiscais reutilizados pelos produtos da empresa.</p>
        </header>

        {errorMessage ? (
          <div className="auth-feedback auth-feedback-error platform-modal-feedback" role="alert">
            <span className="auth-feedback-marker" aria-hidden="true" />
            <span className="auth-feedback-copy">{errorMessage}</span>
          </div>
        ) : null}

        <form className="fiscal-group-form" id="fiscal-group-form" onSubmit={onSubmit}>
          <section className="fiscal-form-section">
            <div className="fiscal-form-grid fiscal-form-grid-main">
              <label>
                <span>Nome do grupo</span>
                <input
                  value={draft.nome}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      nome: capitalizeFirstTextLetter(event.target.value)
                    }))
                  }
                  placeholder="Ex.: Revenda comum"
                />
              </label>

              <div className="fiscal-form-field">
                <span>Regime</span>
                <PlatformSelect
                  ariaLabel="Selecionar regime do grupo fiscal"
                  options={regimeOptions}
                  value={draft.regime_tributario}
                  onChange={nextRegime =>
                    onDraftChange(currentDraft =>
                      normalizeAdvancedIcmsFields({
                        ...currentDraft,
                        regime_tributario: nextRegime,
                        cst_icms:
                          nextRegime === "regime_normal"
                            ? currentDraft.cst_icms
                            : "",
                        csosn:
                          nextRegime === "simples_nacional"
                            ? currentDraft.csosn
                            : ""
                      })
                    )
                  }
                />
              </div>
            </div>

          </section>

          <section className="fiscal-form-section">
            <div className="fiscal-form-grid fiscal-form-grid-four">
              <label>
                <span>Sugestão de NCM</span>
                <input
                  value={draft.ncm}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      ncm: digitsOnly(event.target.value, 8)
                    }))
                  }
                  placeholder="Opcional"
                  inputMode="numeric"
                />
              </label>

              <label>
                <span>CFOP</span>
                <input
                  value={draft.cfop}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      cfop: digitsOnly(event.target.value, 4)
                    }))
                  }
                  placeholder="Ex.: 5102"
                  inputMode="numeric"
                />
              </label>

              <label>
                <span className="fiscal-form-label fiscal-form-label-with-help">
                  <span>{taxCodeLabel}</span>
                  <span className="fiscal-label-tooltip" tabIndex={0} aria-label={taxCodeHelpText}>
                    <Info aria-hidden="true" size={13} />
                    <span className="fiscal-label-tooltip-panel" role="tooltip">
                      {taxCodeHelpLines.map(line => (
                        <span key={line}>{line}</span>
                      ))}
                    </span>
                  </span>
                </span>
                <input
                  value={draft.regime_tributario === "simples_nacional" ? draft.csosn : draft.cst_icms}
                  onChange={event => {
                    const value = digitsOnly(
                      event.target.value,
                      draft.regime_tributario === "simples_nacional" ? 3 : 2
                    );
                    onDraftChange(currentDraft =>
                      normalizeAdvancedIcmsFields({
                        ...currentDraft,
                        csosn:
                          currentDraft.regime_tributario === "simples_nacional"
                            ? value
                            : currentDraft.csosn,
                        cst_icms:
                          currentDraft.regime_tributario === "regime_normal"
                            ? value
                            : currentDraft.cst_icms
                      })
                    );
                  }}
                  placeholder={draft.regime_tributario === "simples_nacional" ? "Ex.: 102" : "Ex.: 00"}
                  inputMode="numeric"
                />
              </label>

              <label>
                <span>ICMS %</span>
                <input
                  value={draft.aliquota_icms}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      aliquota_icms: decimalInput(event.target.value)
                    }))
                  }
                  placeholder="Ex.: 0"
                  inputMode="decimal"
                />
              </label>
            </div>

            {showAdvancedIcms ? (
              <div className="fiscal-advanced-icms">
                <div className="fiscal-advanced-icms-head">
                  <strong>ICMS avançado</strong>
                  <span>
                    {draft.regime_tributario === "simples_nacional" ? "CSOSN" : "CST"} {taxCode}
                  </span>
                </div>

                <div className="fiscal-form-grid fiscal-form-grid-advanced">
                  {showIcmsReduction ? (
                    <label>
                      <span>Redução ICMS %</span>
                      <input
                        value={draft.reducao_icms}
                        onChange={event =>
                          onDraftChange(currentDraft => ({
                            ...currentDraft,
                            reducao_icms: decimalInput(event.target.value)
                          }))
                        }
                        placeholder="Ex.: 20"
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}

                  {showIcmsSt ? (
                    <label>
                      <span>Base ICMS-ST</span>
                      <input
                        value={draft.base_icms_st}
                        onChange={event =>
                          onDraftChange(currentDraft => ({
                            ...currentDraft,
                            base_icms_st: decimalInput(event.target.value)
                          }))
                        }
                        placeholder="Ex.: 0"
                        inputMode="decimal"
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="fiscal-form-grid fiscal-form-grid-four">
              <label>
                <span>CST PIS</span>
                <input
                  value={draft.cst_pis}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      cst_pis: digitsOnly(event.target.value, 2)
                    }))
                  }
                  placeholder="Ex.: 49"
                  inputMode="numeric"
                />
              </label>

              <label>
                <span>PIS %</span>
                <input
                  value={draft.aliquota_pis}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      aliquota_pis: decimalInput(event.target.value)
                    }))
                  }
                  placeholder="Ex.: 0"
                  inputMode="decimal"
                />
              </label>

              <label>
                <span>CST COFINS</span>
                <input
                  value={draft.cst_cofins}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      cst_cofins: digitsOnly(event.target.value, 2)
                    }))
                  }
                  placeholder="Ex.: 49"
                  inputMode="numeric"
                />
              </label>

              <label>
                <span>COFINS %</span>
                <input
                  value={draft.aliquota_cofins}
                  onChange={event =>
                    onDraftChange(currentDraft => ({
                      ...currentDraft,
                      aliquota_cofins: decimalInput(event.target.value)
                    }))
                  }
                  placeholder="Ex.: 0"
                  inputMode="decimal"
                />
              </label>
            </div>
          </section>

          <section className="fiscal-form-section fiscal-form-section-collapsible">
            <div className="fiscal-tax-reform-head">
              <span>
                <small>Reforma tributária</small>
                <strong>IBS/CBS</strong>
                <em>Códigos e alíquotas de IBS/CBS para esta regra.</em>
              </span>

              <button
                type="button"
                className={draft.ibs_ativo ? "fiscal-switch fiscal-switch-active" : "fiscal-switch"}
                role="switch"
                aria-checked={draft.ibs_ativo}
                aria-label={draft.ibs_ativo ? "Remover IBS/CBS" : "Aplicar IBS/CBS"}
                onClick={() =>
                  onDraftChange(currentDraft => ({
                    ...currentDraft,
                    ibs_ativo: !currentDraft.ibs_ativo
                  }))
                }
              >
                <span />
              </button>
            </div>

            {draft.ibs_ativo ? (
              <div className="fiscal-form-grid fiscal-form-grid-five">
                {[
                  ["CST IBS/CBS", "cst_ibs", "000", 3],
                  ["Classificação", "classificacao_ibs", "000001", 6],
                  ["IBS UF %", "aliquota_ibs_uf", "0", null],
                  ["IBS Mun. %", "aliquota_ibs_municipal", "0", null],
                  ["CBS %", "aliquota_cbs", "0", null]
                ].map(([label, key, placeholder, maxLength]) => (
                  <label key={String(key)}>
                    <span>{String(label)}</span>
                    <input
                      value={String(draft[key as keyof FiscalGroupDraft] ?? "")}
                      onChange={event =>
                        onDraftChange(currentDraft => ({
                          ...currentDraft,
                          [key as string]:
                            typeof maxLength === "number"
                              ? digitsOnly(event.target.value, maxLength)
                              : decimalInput(event.target.value)
                        }))
                      }
                      placeholder={String(placeholder)}
                      inputMode={typeof maxLength === "number" ? "numeric" : "decimal"}
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </section>

          {editingGroupId ? (
            <span className="fiscal-modal-notice">
              {editingGroupId
                ? `${linkedProductsCount} produto${linkedProductsCount === 1 ? "" : "s"} vinculado${linkedProductsCount === 1 ? "" : "s"}`
                : ""}
            </span>
          ) : null}
        </form>
      </section>
  );
}

export function FiscalGroupsManager() {
  const [fiscalGroups, setFiscalGroups] = useState<GrupoFiscal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const deferredSearchValue = useDeferredValue(searchValue);
  const [flowStep, setFlowStep] = useState<FiscalFlowStep>("choice");
  const [flowMotion, setFlowMotion] = useState<FiscalFlowMotion>("forward");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFiscalGroupId, setEditingFiscalGroupId] = useState<number | null>(null);
  const [groupPendingDelete, setGroupPendingDelete] = useState<GrupoFiscal | null>(null);
  const hasOpenModal = isEditModalOpen || Boolean(groupPendingDelete);
  const editModalPresence = useModalPresence(isEditModalOpen);
  const deleteModalPresence = useModalPresence(groupPendingDelete);
  const visibleGroupPendingDelete = deleteModalPresence.presentValue;
  const hasVisibleModal = editModalPresence.isPresent || deleteModalPresence.isPresent;
  const [fiscalGroupDraft, setFiscalGroupDraft] = useState<FiscalGroupDraft>(
    buildEmptyFiscalGroupDraft
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const editingFiscalGroup = editingFiscalGroupId
    ? fiscalGroups.find(profile => profile.id === editingFiscalGroupId) ?? null
    : null;
  const editGroupPresence = useModalPresence(isEditModalOpen ? editingFiscalGroup : null);
  const visibleEditingFiscalGroup = editGroupPresence.presentValue;
  const canSave = canSaveFiscalGroupDraft(fiscalGroupDraft);
  const normalizedSearchValue = normalizeSearchValue(deferredSearchValue);
  const filteredFiscalGroups = useMemo(() => {
    return fiscalGroups
      .filter(profile => {
        if (!normalizedSearchValue) {
          return true;
        }

        const haystack = [
          profile.nome,
          profile.ncm ?? "",
          profile.cfop ?? "",
          profile.csosn ?? "",
          profile.cst_icms ?? "",
          formatTaxRegimeLabel(profile)
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearchValue);
      })
      .sort((left, right) => {
        if (left.ativo !== right.ativo) {
          return left.ativo ? -1 : 1;
        }

        return left.nome.localeCompare(right.nome, "pt-BR");
      });
  }, [fiscalGroups, normalizedSearchValue]);

  function closeTopFiscalModal() {
    if (groupPendingDelete) {
      setGroupPendingDelete(null);
      return;
    }

    if (isEditModalOpen) {
      closeFiscalGroupEditModal();
    }
  }

  usePlatformModalScrollLock(hasVisibleModal);
  const fiscalModalDismiss = useModalDismiss(hasOpenModal, closeTopFiscalModal);

  const loadFiscalGroups = useCallback(async () => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLoadError("Sessão expirada. Entre novamente para continuar.");
      setIsLoading(false);
      return;
    }

    try {
      const result = await apiGet<GrupoFiscal[]>("/grupos-fiscais", { cacheTtlMs: 60_000, token });

      setFiscalGroups(result);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, "Não foi possível carregar os grupos fiscais."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiscalGroups();
  }, [loadFiscalGroups]);

  function moveToFlowStep(nextStep: FiscalFlowStep) {
    if (nextStep === flowStep) {
      return;
    }

    const motion: FiscalFlowMotion =
      getFiscalFlowMotionIndex(nextStep) >= getFiscalFlowMotionIndex(flowStep)
        ? "forward"
        : "backward";
    const root = document.documentElement;
    const viewTransitionDocument = document as Document & {
      startViewTransition?: (callback: () => void) => { finished: Promise<void> };
    };

    root.dataset.platformFlowMotion = motion;

    if (typeof viewTransitionDocument.startViewTransition === "function") {
      const transition = viewTransitionDocument.startViewTransition(() => {
        flushSync(() => {
          setFlowMotion(motion);
          setFlowStep(nextStep);
        });
      });

      void transition.finished.finally(() => {
        delete root.dataset.platformFlowMotion;
      });
      return;
    }

    root.dataset.platformFlowFallback = "true";
    setFlowMotion(motion);
    setFlowStep(nextStep);
    window.setTimeout(() => {
      delete root.dataset.platformFlowMotion;
      delete root.dataset.platformFlowFallback;
    }, 430);
  }

  function openNewFiscalGroupFlow() {
    setSubmitError(null);
    setEditingFiscalGroupId(null);
    setGroupPendingDelete(null);
    setIsEditModalOpen(false);
    setFiscalGroupDraft(buildEmptyFiscalGroupDraft());
    moveToFlowStep("create");
  }

  function openFiscalGroupList() {
    setSubmitError(null);
    setEditingFiscalGroupId(null);
    setGroupPendingDelete(null);
    setIsEditModalOpen(false);
    moveToFlowStep("list");
  }

  function openEditFiscalGroupFlow(groupId: number) {
    const group = fiscalGroups.find(profile => profile.id === groupId);

    if (!group) {
      return;
    }

    setSubmitError(null);
    setEditingFiscalGroupId(groupId);
    setFiscalGroupDraft(buildFiscalGroupDraft(group));
    setIsEditModalOpen(true);
  }

  function closeFiscalGroupEditor() {
    moveToFlowStep(editingFiscalGroupId ? "list" : "choice");
    setSubmitError(null);
  }

  function closeFiscalGroupEditModal() {
    setIsEditModalOpen(false);
    setEditingFiscalGroupId(null);
    setGroupPendingDelete(null);
    setFiscalGroupDraft(buildEmptyFiscalGroupDraft());
    setSubmitError(null);
  }

  function handleFiscalGroupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token || !canSave) {
        return;
      }

      try {
        setSubmitError(null);

        const payload = buildSaveFiscalGroupInput(fiscalGroupDraft);
        const savedGroup = editingFiscalGroupId
          ? await apiPut<GrupoFiscal>(`/grupos-fiscais/${editingFiscalGroupId}`, payload, { token })
          : await apiPost<GrupoFiscal>("/grupos-fiscais", payload, { token });

        setFiscalGroups(currentGroups => {
          if (editingFiscalGroupId) {
            return currentGroups.map(group =>
              group.id === savedGroup.id ? savedGroup : group
            );
          }

          return [...currentGroups, savedGroup];
        });
        if (editingFiscalGroupId) {
          setIsEditModalOpen(false);
          setEditingFiscalGroupId(null);
          setFiscalGroupDraft(buildEmptyFiscalGroupDraft());
          return;
        }

        setEditingFiscalGroupId(null);
        setFiscalGroupDraft(buildEmptyFiscalGroupDraft());
        moveToFlowStep("list");
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Não foi possível salvar o grupo fiscal."));
      }
    })();
  }

  function requestFiscalGroupDelete() {
    if (!editingFiscalGroup) {
      return;
    }

    setSubmitError(null);
    setGroupPendingDelete(editingFiscalGroup);
  }

  function handleFiscalGroupDelete() {
    void (async () => {
      const token = getStoredPlatformAuthToken();
      const targetGroup = groupPendingDelete ?? editingFiscalGroup;

      if (!token || !targetGroup) {
        return;
      }

      try {
        const result = await apiDelete<DeleteFiscalGroupResponse>(`/grupos-fiscais/${targetGroup.id}`, { token });

        if (result?.action === "deactivated") {
          setFiscalGroups(currentGroups =>
            currentGroups.map(group => (group.id === result.grupo_fiscal.id ? result.grupo_fiscal : group))
          );
        } else {
          setFiscalGroups(currentGroups =>
            currentGroups.filter(group => group.id !== targetGroup.id)
          );
        }
        setGroupPendingDelete(null);
        setIsEditModalOpen(false);
        setEditingFiscalGroupId(null);
        setFiscalGroupDraft(buildEmptyFiscalGroupDraft());
        moveToFlowStep("list");
      } catch (error) {
        setGroupPendingDelete(null);
        setSubmitError(getErrorMessage(error, "Não foi possível excluir o grupo fiscal."));
      }
    })();
  }

  function handleFiscalGroupActivate() {
    void (async () => {
      const token = getStoredPlatformAuthToken();
      const targetGroup = editingFiscalGroup;

      if (!token || !targetGroup) {
        return;
      }

      try {
        setSubmitError(null);
        const result = await apiPost<ActivateFiscalGroupResponse>(`/grupos-fiscais/${targetGroup.id}/ativar`, {}, { token });

        setFiscalGroups(currentGroups =>
          currentGroups.map(group => (group.id === result.grupo_fiscal.id ? result.grupo_fiscal : group))
        );
        setFiscalGroupDraft(buildFiscalGroupDraft(result.grupo_fiscal));
      } catch (error) {
        setSubmitError(getErrorMessage(error, "Não foi possível ativar o grupo fiscal."));
      }
    })();
  }

  const progressStepCount = 3;
  const activeProgressIndex = flowStep === "choice" ? 1 : 2;
  const isEditingFlow = flowStep === "create";
  const flowPanelClassName = `platform-flow-panel platform-flow-panel-${flowMotion}`;

  return (
    <main className="platform-flow-page fiscal-flow-page">
      <div
        className={
          flowStep === "choice"
            ? "platform-flow-shell platform-flow-shell-compact"
            : "platform-flow-shell"
        }
      >
        <div className="platform-flow-section-title" aria-label="Grupos fiscais">
          <span className="platform-flow-section-main">
            <FileCheck2 size={24} aria-hidden="true" />
            <strong>Grupos fiscais</strong>
          </span>
        </div>

      <section
        className={
          flowStep === "choice"
            ? "platform-flow-card fiscal-flow-card fiscal-flow-card-choice"
            : "platform-flow-card fiscal-flow-card fiscal-flow-card-wide"
        }
        aria-label="Fluxo de grupos fiscais"
      >
        {flowStep === "choice" ? (
          <div className={`${flowPanelClassName} fiscal-flow-choice-panel`} key="choice">
            <header className="platform-flow-head">
              <h1 id="fiscal-flow-title">Escolha uma opção</h1>
              <p>Comece criando uma regra fiscal ou abra a lista para revisar o que já existe.</p>
            </header>

            {loadError ? (
              <div className="auth-feedback auth-feedback-error" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{loadError}</span>
              </div>
            ) : null}

            <div className="platform-flow-action-list">
              <button type="button" className="platform-flow-action" onClick={openNewFiscalGroupFlow}>
                <span className="platform-flow-action-icon" aria-hidden="true">
                  <Plus size={21} />
                </span>
                <span>
                  <strong>Criar novo grupo fiscal</strong>
                  <small>Cadastro guiado com NCM, CFOP, ICMS, PIS, COFINS e IBS/CBS.</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>

              <button type="button" className="platform-flow-action" onClick={openFiscalGroupList}>
                <span className="platform-flow-action-icon" aria-hidden="true">
                  {isLoading ? <LoaderCircle className="platform-spin" size={21} /> : <ListChecks size={21} />}
                </span>
                <span>
                  <strong>Visualizar ou editar meus grupos fiscais</strong>
                  <small>
                    {isLoading
                      ? "Carregando grupos cadastrados."
                      : `${fiscalGroups.length} grupo${fiscalGroups.length === 1 ? "" : "s"} cadastrado${fiscalGroups.length === 1 ? "" : "s"}.`}
                  </small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {flowStep === "create" ? (
          <div className={`${flowPanelClassName} fiscal-flow-editor-panel`} key={flowStep}>
            <FiscalGroupEditor
              editingGroupId={null}
              linkedProductsCount={0}
              draft={fiscalGroupDraft}
              errorMessage={submitError}
              onDraftChange={setFiscalGroupDraft}
              onSubmit={handleFiscalGroupSubmit}
            />
          </div>
        ) : null}

        {flowStep === "list" ? (
          <div className={`${flowPanelClassName} fiscal-flow-list-panel`} key="list">
        <header className="platform-flow-head fiscal-list-head">
          <h1>Meus grupos fiscais</h1>
          <p>Busque um grupo para abrir a edição ou crie uma nova regra fiscal.</p>
        </header>

        <section className="fiscal-groups-panel">
          <div className="fiscal-groups-panel-body">
            {loadError ? (
              <div className="auth-feedback auth-feedback-error" role="alert">
                <span className="auth-feedback-marker" aria-hidden="true" />
                <span className="auth-feedback-copy">{loadError}</span>
              </div>
            ) : null}

            <div className="fiscal-groups-filter">
              <label className="fiscal-search">
                <Search aria-hidden="true" size={17} />
                <input
                  value={searchValue}
                  onChange={event => setSearchValue(event.target.value)}
                  placeholder="Buscar por grupo fiscal, CFOP, NCM ou regra"
                />
              </label>
            </div>

            <div className="fiscal-group-list">
              {isLoading ? (
                Array.from({ length: 3 }, (_, index) => (
                  <div key={index} className="fiscal-group-skeleton" />
                ))
              ) : filteredFiscalGroups.length === 0 ? (
                <div className="fiscal-groups-empty">
                  <span aria-hidden="true">
                    <FileCheck2 size={22} />
                  </span>
                  <strong>Nenhum grupo fiscal encontrado</strong>
                  <p>Ajuste a busca ou cadastre uma regra fiscal para vincular aos produtos.</p>
                </div>
              ) : (
                filteredFiscalGroups.map(profile => (
                  <FiscalGroupListItem
                    key={profile.id}
                    profile={profile}
                    onEdit={openEditFiscalGroupFlow}
                  />
                ))
              )}
            </div>

            <div className="fiscal-groups-notice">
              <span>Produtos com emissão fiscal devem estar vinculados a um grupo fiscal antes da venda.</span>
            </div>
          </div>
        </section>
          </div>
        ) : null}

        <div className="platform-flow-actions" aria-label="Ações do fluxo">
          {flowStep === "choice" ? (
            <Link className="platform-secondary-button" href="/meu-sistema">
              <ArrowLeft size={16} />
              Voltar
            </Link>
          ) : (
            <button
              type="button"
              className="platform-secondary-button"
              onClick={flowStep === "list" ? () => moveToFlowStep("choice") : closeFiscalGroupEditor}
            >
              <ArrowLeft size={16} />
              Voltar
            </button>
          )}

          {flowStep === "list" ? (
            <button type="button" className="platform-primary-button" onClick={openNewFiscalGroupFlow}>
              <Plus size={16} />
              Novo grupo
            </button>
          ) : null}

          {isEditingFlow ? (
            <>
              <button className="platform-primary-button platform-save-button" type="submit" form="fiscal-group-form" disabled={!canSave}>
                <ShieldCheck size={16} />
                Cadastrar grupo
              </button>
            </>
          ) : null}
        </div>

        <div className="platform-flow-progress" aria-label={`Etapa ${activeProgressIndex + 1} de ${progressStepCount}`}>
          {Array.from({ length: progressStepCount }, (_, index) => (
            <span
              className={
                index === activeProgressIndex
                  ? "platform-flow-progress-bar platform-flow-progress-bar-active"
                  : index < activeProgressIndex
                    ? "platform-flow-progress-bar platform-flow-progress-bar-done"
                    : "platform-flow-progress-bar"
              }
              key={index}
            />
          ))}
        </div>
      </section>

      {editModalPresence.isPresent && visibleEditingFiscalGroup ? (
        <div
          className="platform-modal-backdrop"
          data-modal-state={editModalPresence.state}
          role="presentation"
          {...fiscalModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="fiscal-edit-modal-title"
            aria-modal="true"
            className="platform-modal fiscal-group-edit-modal"
            role="dialog"
          >
            <button
              className="platform-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={closeFiscalGroupEditModal}
            >
              <X aria-hidden="true" size={18} />
            </button>

            <FiscalGroupEditor
              editingGroupId={editingFiscalGroupId ?? visibleEditingFiscalGroup.id}
              linkedProductsCount={visibleEditingFiscalGroup.produtos_vinculados ?? 0}
              draft={fiscalGroupDraft}
              errorMessage={submitError}
              onDraftChange={setFiscalGroupDraft}
              onSubmit={handleFiscalGroupSubmit}
            />

            <div
              className={
                visibleEditingFiscalGroup.ativo
                  ? "platform-modal-actions fiscal-edit-modal-actions platform-item-modal-actions platform-item-modal-actions-with-delete"
                  : "platform-modal-actions fiscal-edit-modal-actions platform-item-modal-actions"
              }
            >
              <button className="platform-secondary-button" type="button" onClick={closeFiscalGroupEditModal}>
                Cancelar
              </button>

              {!visibleEditingFiscalGroup.ativo ? (
                <button
                  type="button"
                  className="platform-primary-button platform-save-button"
                  onClick={handleFiscalGroupActivate}
                >
                  <RotateCcw size={16} />
                  Ativar
                </button>
              ) : (
                <button
                  type="button"
                  className="fiscal-danger-button fiscal-edit-delete-button"
                  title={visibleEditingFiscalGroup.acao_remocao === "desativar" ? "Desativar grupo fiscal" : "Excluir grupo fiscal"}
                  onClick={requestFiscalGroupDelete}
                >
                  {visibleEditingFiscalGroup.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                  {visibleEditingFiscalGroup.acao_remocao === "desativar" ? "Desativar" : "Excluir"}
                </button>
              )}

              {visibleEditingFiscalGroup.ativo ? (
                <button className="platform-primary-button platform-save-button" type="submit" form="fiscal-group-form" disabled={!canSave}>
                  <ShieldCheck size={16} />
                  Salvar grupo
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {deleteModalPresence.isPresent && visibleGroupPendingDelete ? (
        <div
          className="platform-modal-backdrop fiscal-confirm-backdrop"
          data-modal-state={deleteModalPresence.state}
          role="presentation"
          {...fiscalModalDismiss.backdropProps}
        >
          <section
            aria-labelledby="fiscal-delete-confirm-title"
            aria-modal="true"
            className="platform-modal platform-modal-compact fiscal-delete-confirm-modal"
            role="dialog"
          >
            <div className="platform-modal-head">
              <span className="platform-modal-kicker">Grupo fiscal</span>
              <h2 id="fiscal-delete-confirm-title">
                {visibleGroupPendingDelete.acao_remocao === "desativar" ? "Desativar grupo fiscal?" : "Excluir grupo fiscal?"}
              </h2>
              <p>
                {visibleGroupPendingDelete.acao_remocao === "desativar"
                  ? `“${visibleGroupPendingDelete.nome}” deixa de aparecer em novos vínculos, mas segue preservado nos produtos antigos.`
                  : `Confirme para excluir “${visibleGroupPendingDelete.nome}”. Essa ação não poderá ser desfeita.`}
              </p>
            </div>

            <div className="platform-modal-actions fiscal-delete-confirm-actions">
              <button
                className="platform-secondary-button"
                type="button"
                onClick={() => setGroupPendingDelete(null)}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="fiscal-danger-button fiscal-edit-delete-button"
                onClick={handleFiscalGroupDelete}
              >
                {visibleGroupPendingDelete.acao_remocao === "desativar" ? <Ban size={16} /> : <Trash2 size={16} />}
                {visibleGroupPendingDelete.acao_remocao === "desativar" ? "Desativar grupo" : "Excluir grupo"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      </div>
    </main>
  );
}
