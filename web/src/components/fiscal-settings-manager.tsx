"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  Eye,
  EyeOff,
  FileKey2,
  Hash,
  KeyRound,
  LoaderCircle,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Upload
} from "lucide-react";

import { PlatformSelect, type PlatformSelectOption } from "@/components/platform-select";
import { ApiError, apiGet, apiPostForm } from "@/lib/api-client";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

type Feedback = {
  tone: "success" | "error" | "warning";
  message: string;
};

type FiscalCompanyPrefill = {
  uf?: string;
  emitente?: Partial<FiscalIssuerSettings>;
};

type FiscalZipPrefill = {
  endereco?: Partial<FiscalAddressSettings>;
};

type ArquivoResumo = {
  id: number;
  nome_original: string;
  mime_type: string;
  tipo: string;
  tamanho_bytes: number;
};

type FiscalAddressSettings = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  codigo_municipio: string;
  municipio: string;
  uf: string;
  cep: string;
};

type FiscalIssuerSettings = {
  cnpj_cpf: string;
  razao_social: string;
  nome_fantasia: string;
  inscricao_estadual: string;
  inscricao_municipal: string;
  crt: string;
  cnae: string;
  email: string;
  telefone: string;
  endereco: FiscalAddressSettings;
};

type FiscalIssuerTextKey = Exclude<keyof FiscalIssuerSettings, "endereco">;

type FiscalCertificateSettings = {
  tipo: "A1";
  arquivo_id: number | null;
  nome_arquivo: string;
  senha_pfx?: string;
  senha_configurada?: boolean;
  validade: string | null;
  emitido_para?: string;
};

type FiscalNfceSettings = {
  serie: number;
  proximo_numero: number;
  csc_id: string;
  csc_token?: string;
  csc_token_configurado?: boolean;
};

type FiscalNfeSettings = {
  serie: number;
  proximo_numero: number;
};

type FiscalEnvironmentSettings = {
  ativo: boolean;
  certificado: FiscalCertificateSettings;
  nfce: FiscalNfceSettings;
  nfe: FiscalNfeSettings;
};

export type FiscalSettings = {
  ativo: boolean;
  ambiente: "homologacao" | "producao";
  uf: string;
  modelo_prioritario: "55" | "65";
  natureza_operacao_padrao: string;
  emitente: FiscalIssuerSettings;
  ambientes: Record<"homologacao" | "producao", FiscalEnvironmentSettings>;
  certificado: FiscalCertificateSettings;
  nfce: FiscalNfceSettings;
  nfe: FiscalNfeSettings;
  prontidao?: {
    nfce: boolean;
    nfe: boolean;
    pendencias_nfce: string[];
    pendencias_nfe: string[];
  };
};

const defaultFiscalCertificateSettings: FiscalCertificateSettings = {
  tipo: "A1",
  arquivo_id: null,
  nome_arquivo: "",
  senha_pfx: "",
  senha_configurada: false,
  validade: null,
  emitido_para: ""
};

const defaultFiscalNfceSettings: FiscalNfceSettings = {
  serie: 1,
  proximo_numero: 1,
  csc_id: "",
  csc_token: "",
  csc_token_configurado: false
};

const defaultFiscalNfeSettings: FiscalNfeSettings = {
  serie: 1,
  proximo_numero: 1
};

const defaultFiscalEnvironmentSettings: FiscalEnvironmentSettings = {
  ativo: false,
  certificado: defaultFiscalCertificateSettings,
  nfce: defaultFiscalNfceSettings,
  nfe: defaultFiscalNfeSettings
};

function cloneDefaultFiscalEnvironment(): FiscalEnvironmentSettings {
  return {
    ativo: defaultFiscalEnvironmentSettings.ativo,
    certificado: { ...defaultFiscalCertificateSettings },
    nfce: { ...defaultFiscalNfceSettings },
    nfe: { ...defaultFiscalNfeSettings }
  };
}

export const defaultFiscalSettings: FiscalSettings = {
  ativo: false,
  ambiente: "homologacao",
  uf: "",
  modelo_prioritario: "65",
  natureza_operacao_padrao: "Venda",
  emitente: {
    cnpj_cpf: "",
    razao_social: "",
    nome_fantasia: "",
    inscricao_estadual: "",
    inscricao_municipal: "",
    crt: "",
    cnae: "",
    email: "",
    telefone: "",
    endereco: {
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      codigo_municipio: "",
      municipio: "",
      uf: "",
      cep: ""
    }
  },
  ambientes: {
    homologacao: cloneDefaultFiscalEnvironment(),
    producao: cloneDefaultFiscalEnvironment()
  },
  certificado: {
    tipo: "A1",
    arquivo_id: null,
    nome_arquivo: "",
    senha_pfx: "",
    senha_configurada: false,
    validade: null,
    emitido_para: ""
  },
  nfce: {
    serie: 1,
    proximo_numero: 1,
    csc_id: "",
    csc_token: "",
    csc_token_configurado: false
  },
  nfe: {
    serie: 1,
    proximo_numero: 1
  }
};

const ambienteOptions: ReadonlyArray<PlatformSelectOption<FiscalSettings["ambiente"]>> = [
  { value: "homologacao", label: "Homologação" },
  { value: "producao", label: "Produção" }
];

const ufOptions: ReadonlyArray<PlatformSelectOption<string>> = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"
].map(uf => ({ value: uf, label: uf }));

const crtOptions: ReadonlyArray<PlatformSelectOption<string>> = [
  { value: "1", label: "Simples Nacional" },
  { value: "2", label: "Simples, excesso sublimite" },
  { value: "3", label: "Regime normal" },
  { value: "4", label: "MEI" }
];

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function normalizeFiscalCrt(value: string) {
  const crt = digitsOnly(value, 1);

  return crt === "1" || crt === "2" || crt === "3" || crt === "4" ? crt : "";
}

function formatCnpj(value: string) {
  const digits = digitsOnly(value, 14);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 5);
  const part3 = digits.slice(5, 8);
  const part4 = digits.slice(8, 12);
  const part5 = digits.slice(12, 14);

  if (digits.length <= 2) {
    return part1;
  }

  if (digits.length <= 5) {
    return `${part1}.${part2}`;
  }

  if (digits.length <= 8) {
    return `${part1}.${part2}.${part3}`;
  }

  if (digits.length <= 12) {
    return `${part1}.${part2}.${part3}/${part4}`;
  }

  return `${part1}.${part2}.${part3}/${part4}-${part5}`;
}

function formatCep(value: string) {
  const digits = digitsOnly(value, 8);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

const fiscalDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "UTC"
});

function formatFiscalDate(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return fiscalDateFormatter.format(date);
}

function normalizePositiveInteger(value: unknown, fallback: number, max = 999999999) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), max);
}

export function normalizeFiscalSettings(value?: Partial<FiscalSettings> | null): FiscalSettings {
  const emitente = value?.emitente ?? defaultFiscalSettings.emitente;
  const endereco = emitente.endereco ?? defaultFiscalSettings.emitente.endereco;
  const ambiente = value?.ambiente === "producao" ? "producao" : "homologacao";
  const sourceAmbientes = value?.ambientes ?? defaultFiscalSettings.ambientes;

  function normalizeEnvironment(
    environment: Partial<FiscalEnvironmentSettings> | undefined,
    fallback: FiscalEnvironmentSettings,
    useFlatFallback: boolean
  ): FiscalEnvironmentSettings {
    const certificado = environment?.certificado ?? (useFlatFallback ? value?.certificado : undefined) ?? fallback.certificado;
    const nfce = environment?.nfce ?? (useFlatFallback ? value?.nfce : undefined) ?? fallback.nfce;
    const nfe = environment?.nfe ?? (useFlatFallback ? value?.nfe : undefined) ?? fallback.nfe;

    return {
      ativo: Boolean(environment?.ativo ?? (useFlatFallback ? value?.ativo : undefined) ?? fallback.ativo),
      certificado: {
        ...defaultFiscalCertificateSettings,
        ...certificado,
        tipo: "A1",
        senha_pfx: String(certificado.senha_pfx ?? "")
      },
      nfce: {
        ...defaultFiscalNfceSettings,
        ...nfce,
        serie: normalizePositiveInteger(nfce.serie, defaultFiscalNfceSettings.serie, 999),
        proximo_numero: normalizePositiveInteger(nfce.proximo_numero, defaultFiscalNfceSettings.proximo_numero),
        csc_token: String(nfce.csc_token ?? "")
      },
      nfe: {
        ...defaultFiscalNfeSettings,
        ...nfe,
        serie: normalizePositiveInteger(nfe.serie, defaultFiscalNfeSettings.serie, 999),
        proximo_numero: normalizePositiveInteger(nfe.proximo_numero, defaultFiscalNfeSettings.proximo_numero)
      }
    };
  }

  const ambientes = {
    homologacao: normalizeEnvironment(sourceAmbientes.homologacao, defaultFiscalSettings.ambientes.homologacao, ambiente === "homologacao"),
    producao: normalizeEnvironment(sourceAmbientes.producao, defaultFiscalSettings.ambientes.producao, ambiente === "producao")
  };
  const activeEnvironment = ambientes[ambiente];

  return {
    ...defaultFiscalSettings,
    ...value,
    ambiente,
    modelo_prioritario: value?.modelo_prioritario === "55" ? "55" : "65",
    emitente: {
      ...defaultFiscalSettings.emitente,
      ...emitente,
      cnpj_cpf: digitsOnly(String(emitente.cnpj_cpf ?? ""), 14),
      inscricao_estadual: digitsOnly(String(emitente.inscricao_estadual ?? ""), 20),
      inscricao_municipal: digitsOnly(String(emitente.inscricao_municipal ?? ""), 20),
      crt: normalizeFiscalCrt(String(emitente.crt ?? "")),
      cnae: digitsOnly(String(emitente.cnae ?? ""), 7),
      telefone: digitsOnly(String(emitente.telefone ?? ""), 14),
      endereco: {
        ...defaultFiscalSettings.emitente.endereco,
        ...endereco,
        codigo_municipio: digitsOnly(String(endereco.codigo_municipio ?? ""), 7),
        cep: digitsOnly(String(endereco.cep ?? ""), 8)
      }
    },
    ambientes,
    ativo: activeEnvironment.ativo,
    certificado: activeEnvironment.certificado,
    nfce: activeEnvironment.nfce,
    nfe: activeEnvironment.nfe
  };
}

type FiscalSettingsManagerProps = {
  settings: FiscalSettings;
  isLoading: boolean;
  mode: "company" | "issuance";
  onCancel: () => void;
  onSave: (settings: FiscalSettings) => Promise<FiscalSettings>;
};

const fiscalIssuerKeys: FiscalIssuerTextKey[] = [
  "cnpj_cpf",
  "razao_social",
  "nome_fantasia",
  "inscricao_estadual",
  "inscricao_municipal",
  "crt",
  "cnae",
  "email",
  "telefone"
];

const fiscalAddressKeys: Array<keyof FiscalAddressSettings> = [
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "codigo_municipio",
  "municipio",
  "uf",
  "cep"
];

function compactTextPatch<TKey extends string>(value: Partial<Record<TKey, unknown>> | undefined, keys: TKey[]) {
  const patch: Partial<Record<TKey, string>> = {};

  keys.forEach(key => {
    const nextValue = value?.[key];

    if (typeof nextValue === "string" && nextValue.trim()) {
      patch[key] = nextValue.trim();
    }
  });

  return patch;
}

export function FiscalSettingsManager({ settings, isLoading, mode, onCancel, onSave }: FiscalSettingsManagerProps) {
  const [draft, setDraft] = useState<FiscalSettings>(() => normalizeFiscalSettings(settings));
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [showCertificatePassword, setShowCertificatePassword] = useState(false);
  const [showCscToken, setShowCscToken] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [lookupFeedback, setLookupFeedback] = useState<Feedback | null>(null);
  const [lookupTarget, setLookupTarget] = useState<"cnpj" | "cep" | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lastCnpjLookupRef = useRef("");
  const lastCepLookupRef = useRef("");
  const cnpjChangedByUserRef = useRef(false);
  const cepChangedByUserRef = useRef(false);

  useEffect(() => {
    const normalizedSettings = normalizeFiscalSettings(settings);

    setDraft(normalizedSettings);
    setCertificateFile(null);
    setShowCertificatePassword(false);
    setShowCscToken(false);
    setLookupFeedback(null);
    setLookupTarget(null);
    lastCnpjLookupRef.current = normalizedSettings.emitente.cnpj_cpf;
    lastCepLookupRef.current = normalizedSettings.emitente.endereco.cep;
    cnpjChangedByUserRef.current = false;
    cepChangedByUserRef.current = false;
  }, [settings]);

  const isCompanyMode = mode === "company";
  const isIssuanceMode = mode === "issuance";
  const successMessage = isCompanyMode ? "Cadastro fiscal salvo." : "Configurações de emissão salvas.";
  const errorMessage = isCompanyMode
    ? "Não foi possível salvar o cadastro fiscal."
    : "Não foi possível salvar as configurações de emissão.";
  const submitLabel = isCompanyMode ? "Salvar cadastro fiscal" : "Salvar";
  const ambienteLabel = draft.ambiente === "producao" ? "Produção" : "Homologação";
  const certificateValidityLabel = formatFiscalDate(draft.certificado.validade);

  function updateEmitente(patch: Partial<FiscalIssuerSettings>) {
    setDraft(current => normalizeFiscalSettings({
      ...current,
      emitente: {
        ...current.emitente,
        ...patch
      }
    }));
  }

  function updateEndereco(patch: Partial<FiscalAddressSettings>) {
    setDraft(current => normalizeFiscalSettings({
      ...current,
      emitente: {
        ...current.emitente,
        endereco: {
          ...current.emitente.endereco,
          ...patch
        }
      }
    }));
  }

  function updateActiveEnvironment(patch: Partial<FiscalEnvironmentSettings>) {
    setDraft(current => {
      const currentEnvironment = current.ambientes[current.ambiente];
      const nextEnvironment = {
        ...currentEnvironment,
        ...patch
      };

      return normalizeFiscalSettings({
        ...current,
        ambientes: {
          ...current.ambientes,
          [current.ambiente]: nextEnvironment
        },
        ...nextEnvironment
      });
    });
  }

  function updateAmbiente(ambiente: FiscalSettings["ambiente"]) {
    setDraft(current => normalizeFiscalSettings({
      ...current,
      ambiente
    }));
    setCertificateFile(null);
    setShowCertificatePassword(false);
    setShowCscToken(false);
  }

  function applyCompanyPrefill(prefill: FiscalCompanyPrefill) {
    const emitentePatch = compactTextPatch(prefill.emitente, fiscalIssuerKeys);
    const enderecoPatch = compactTextPatch(prefill.emitente?.endereco, fiscalAddressKeys);

    setDraft(current => normalizeFiscalSettings({
      ...current,
      uf: prefill.uf || enderecoPatch.uf || current.uf,
      emitente: {
        ...current.emitente,
        ...emitentePatch,
        endereco: {
          ...current.emitente.endereco,
          ...enderecoPatch
        }
      }
    }));
  }

  function applyZipPrefill(prefill: FiscalZipPrefill) {
    const enderecoPatch = compactTextPatch(prefill.endereco, fiscalAddressKeys);

    setDraft(current => normalizeFiscalSettings({
      ...current,
      uf: enderecoPatch.uf || current.uf,
      emitente: {
        ...current.emitente,
        endereco: {
          ...current.emitente.endereco,
          ...enderecoPatch
        }
      }
    }));
  }

  async function lookupCnpj(cnpj: string) {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLookupFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para consultar CNPJ."
      });
      return;
    }

    setLookupTarget("cnpj");
    setLookupFeedback(null);

    try {
      const prefill = await apiGet<FiscalCompanyPrefill>(`/configuracoes/integracoes/cnpja/cnpj/${cnpj}`, { token });
      applyCompanyPrefill(prefill);
      setLookupFeedback(null);
    } catch (error) {
      setLookupFeedback({
        tone: "warning",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível consultar o CNPJ."
      });
    } finally {
      setLookupTarget(null);
    }
  }

  async function lookupCep(cep: string) {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      setLookupFeedback({
        tone: "error",
        message: "Sessão expirada. Entre novamente para consultar CEP."
      });
      return;
    }

    setLookupTarget("cep");
    setLookupFeedback(null);

    try {
      const prefill = await apiGet<FiscalZipPrefill>(`/configuracoes/integracoes/cnpja/cep/${cep}`, { token });
      applyZipPrefill(prefill);
      setLookupFeedback(null);
    } catch (error) {
      setLookupFeedback({
        tone: "warning",
        message:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Não foi possível consultar o CEP."
      });
    } finally {
      setLookupTarget(null);
    }
  }

  function updateCertificado(patch: Partial<FiscalCertificateSettings>) {
    updateActiveEnvironment({
      certificado: {
        ...draft.certificado,
        ...patch
      }
    });
  }

  function updateNfce(patch: Partial<FiscalNfceSettings>) {
    updateActiveEnvironment({
      nfce: {
        ...draft.nfce,
        ...patch
      }
    });
  }

  function updateNfe(patch: Partial<FiscalNfeSettings>) {
    updateActiveEnvironment({
      nfe: {
        ...draft.nfe,
        ...patch
      }
    });
  }

  function handleCertificateFileChange(file: File | null) {
    if (!file) {
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension !== "pfx" && extension !== "p12") {
      setFeedback({
        tone: "error",
        message: "Selecione um certificado A1 nos formatos PFX ou P12."
      });
      return;
    }

    setCertificateFile(file);
    updateCertificado({
      arquivo_id: null,
      nome_arquivo: file.name
    });
    setFeedback(null);
  }

  async function uploadCertificateIfNeeded(token: string) {
    if (!certificateFile) {
      return {
        arquivo_id: draft.certificado.arquivo_id,
        nome_arquivo: draft.certificado.nome_arquivo
      };
    }

    const formData = new FormData();

    formData.append("contexto", "certificado_fiscal");
    formData.append("visibilidade", "privado");
    formData.append("arquivo", certificateFile);

    const arquivo = await apiPostForm<ArquivoResumo>("/arquivos", formData, { token });

    return {
      arquivo_id: arquivo.id,
      nome_arquivo: arquivo.nome_original
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    void (async () => {
      const token = getStoredPlatformAuthToken();

      if (!token) {
        setFeedback({
          tone: "error",
          message: "Sessão expirada. Entre novamente para salvar."
        });
        return;
      }

      setIsSaving(true);
      setFeedback(null);

      try {
        const certificate = await uploadCertificateIfNeeded(token);
        const activeEnvironment: FiscalEnvironmentSettings = {
          ...draft.ambientes[draft.ambiente],
          ativo: draft.ativo,
          certificado: {
            ...draft.certificado,
            arquivo_id: certificate.arquivo_id,
            nome_arquivo: certificate.nome_arquivo
          },
          nfce: {
            ...draft.nfce
          },
          nfe: {
            ...draft.nfe
          }
        };
        const payload: FiscalSettings = {
          ...draft,
          ambientes: {
            ...draft.ambientes,
            [draft.ambiente]: activeEnvironment
          },
          ...activeEnvironment,
          emitente: {
            ...draft.emitente,
            endereco: {
              ...draft.emitente.endereco,
              uf: draft.emitente.endereco.uf || draft.uf
            }
          }
        };
        const savedSettings = await onSave(payload);

        setDraft(normalizeFiscalSettings(savedSettings));
        setCertificateFile(null);
        setFeedback({
          tone: "success",
          message: successMessage
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          message:
            error instanceof ApiError || error instanceof Error
              ? error.message
              : errorMessage
        });
      } finally {
        setIsSaving(false);
      }
    })();
  }

  useEffect(() => {
    if (!isCompanyMode) {
      return undefined;
    }

    const cnpj = draft.emitente.cnpj_cpf;

    if (!cnpjChangedByUserRef.current || cnpj.length !== 14 || cnpj === lastCnpjLookupRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      lastCnpjLookupRef.current = cnpj;
      cnpjChangedByUserRef.current = false;
      void lookupCnpj(cnpj);
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [draft.emitente.cnpj_cpf, isCompanyMode]);

  useEffect(() => {
    if (!isCompanyMode) {
      return undefined;
    }

    const cep = draft.emitente.endereco.cep;

    if (!cepChangedByUserRef.current || cep.length !== 8 || cep === lastCepLookupRef.current) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      lastCepLookupRef.current = cep;
      cepChangedByUserRef.current = false;
      void lookupCep(cep);
    }, 520);

    return () => window.clearTimeout(timeout);
  }, [draft.emitente.endereco.cep, isCompanyMode]);

  if (isLoading) {
    return (
      <div className="fiscal-settings-skeleton" aria-live="polite">
        {Array.from({ length: isCompanyMode ? 3 : 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    );
  }

  return (
    <form className="fiscal-settings-form fiscal-group-form" onSubmit={handleSubmit}>
      {feedback ? (
        <div className={`auth-feedback auth-feedback-${feedback.tone} fiscal-settings-feedback`} role="status">
          <span className="auth-feedback-marker">
            {feedback.tone === "success" ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <AlertTriangle aria-hidden="true" size={17} />
            )}
          </span>
          <span className="auth-feedback-copy">
            <strong>{feedback.message}</strong>
          </span>
        </div>
      ) : null}

      {lookupFeedback ? (
        <div className={`auth-feedback auth-feedback-${lookupFeedback.tone} fiscal-settings-feedback`} role="status">
          <span className="auth-feedback-marker">
            {lookupFeedback.tone === "success" ? (
              <Check aria-hidden="true" size={17} />
            ) : (
              <AlertTriangle aria-hidden="true" size={17} />
            )}
          </span>
          <span className="auth-feedback-copy">
            <strong>{lookupFeedback.message}</strong>
          </span>
        </div>
      ) : null}

      {isIssuanceMode ? (
        <section className="fiscal-form-section fiscal-settings-section fiscal-issuance-control-section">
          <header className="fiscal-settings-section-head fiscal-settings-section-head-split">
            <span aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>Emissão fiscal</strong>
              <small>{ambienteLabel} usa certificado, séries e CSC próprios.</small>
            </div>
          </header>

          <div className="fiscal-issuance-headline fiscal-issuance-headline-single">
            <label className="fiscal-environment-field fiscal-environment-card">
              <span>Ambiente</span>
              <PlatformSelect
                ariaLabel="Ambiente fiscal"
                disabled={isSaving}
                options={ambienteOptions}
                value={draft.ambiente}
                onChange={updateAmbiente}
              />
            </label>
          </div>

          {!draft.ativo ? (
            <div className="fiscal-disabled-panel fiscal-disabled-panel-compact">
              <ShieldCheck aria-hidden="true" size={20} />
              <div>
                <strong>Emissão desativada para {ambienteLabel.toLowerCase()}</strong>
                <span>Ative no menu de configurações para liberar certificado, numeração e CSC.</span>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isCompanyMode ? (
      <section className="fiscal-form-section fiscal-settings-section fiscal-settings-section-company">
        <header className="fiscal-settings-section-head">
          <span aria-hidden="true">
            <Building2 size={18} />
          </span>
          <strong>Empresa</strong>
        </header>

        <div className="fiscal-form-grid fiscal-company-grid">
          <label className="fiscal-field-span-4 fiscal-autofill-field">
            <span className="fiscal-field-label-row">
              <span>CNPJ</span>
              <em className={lookupTarget === "cnpj" ? "fiscal-autofill-badge fiscal-autofill-badge-loading" : "fiscal-autofill-badge"}>
                {lookupTarget === "cnpj" ? "Buscando" : "CNPJá"}
              </em>
            </span>
            <input
              autoComplete="off"
              disabled={isSaving || lookupTarget === "cnpj"}
              inputMode="numeric"
              maxLength={18}
              type="text"
              value={formatCnpj(draft.emitente.cnpj_cpf)}
              onChange={event => {
                cnpjChangedByUserRef.current = true;
                setLookupFeedback(null);
                updateEmitente({ cnpj_cpf: digitsOnly(event.currentTarget.value, 14) });
              }}
            />
            {lookupTarget === "cnpj" ? (
              <small className="fiscal-lookup-hint">Consultando CNPJá.</small>
            ) : (
              <small className="fiscal-lookup-muted">Preenche dados ao completar.</small>
            )}
          </label>

          <label className="fiscal-field-span-4">
            <span>Nome fantasia</span>
            <input
              disabled={isSaving}
              maxLength={160}
              value={draft.emitente.nome_fantasia}
              onChange={event => updateEmitente({ nome_fantasia: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-4">
            <span>IE</span>
            <input
              disabled={isSaving}
              inputMode="numeric"
              maxLength={20}
              value={draft.emitente.inscricao_estadual}
              onChange={event => updateEmitente({ inscricao_estadual: digitsOnly(event.currentTarget.value, 20) })}
            />
          </label>

          <label className="fiscal-field-span-8">
            <span>Razão social</span>
            <input
              disabled={isSaving}
              maxLength={160}
              value={draft.emitente.razao_social}
              onChange={event => updateEmitente({ razao_social: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-4">
            <span>CNAE</span>
            <input
              disabled={isSaving}
              inputMode="numeric"
              maxLength={7}
              value={draft.emitente.cnae}
              onChange={event => updateEmitente({ cnae: digitsOnly(event.currentTarget.value, 7) })}
            />
          </label>
        </div>
      </section>
      ) : null}

      {isCompanyMode ? (
      <section className="fiscal-form-section fiscal-settings-section fiscal-settings-section-address">
        <header className="fiscal-settings-section-head">
          <span aria-hidden="true">
            <MapPin size={18} />
          </span>
          <strong>Endereço</strong>
        </header>

        <div className="fiscal-form-grid fiscal-address-grid">
          <label className="fiscal-field-span-3 fiscal-autofill-field">
            <span className="fiscal-field-label-row">
              <span>CEP</span>
              <em className={lookupTarget === "cep" ? "fiscal-autofill-badge fiscal-autofill-badge-loading" : "fiscal-autofill-badge"}>
                {lookupTarget === "cep" ? "Buscando" : "CNPJá"}
              </em>
            </span>
            <input
              autoComplete="postal-code"
              disabled={isSaving || lookupTarget === "cep"}
              inputMode="numeric"
              maxLength={9}
              type="text"
              value={formatCep(draft.emitente.endereco.cep)}
              onChange={event => {
                cepChangedByUserRef.current = true;
                setLookupFeedback(null);
                updateEndereco({ cep: digitsOnly(event.currentTarget.value, 8) });
              }}
            />
            {lookupTarget === "cep" ? (
              <small className="fiscal-lookup-hint">Consultando CNPJá.</small>
            ) : (
              <small className="fiscal-lookup-muted">Preenche endereço ao completar.</small>
            )}
          </label>

          <label className="fiscal-field-span-5">
            <span>Município</span>
            <input
              disabled={isSaving}
              maxLength={80}
              value={draft.emitente.endereco.municipio}
              onChange={event => updateEndereco({ municipio: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-2">
            <span>UF</span>
            <PlatformSelect
              ariaLabel="UF do endereço"
              disabled={isSaving}
              options={ufOptions}
              placeholder="UF"
              value={draft.emitente.endereco.uf}
              onChange={uf => updateEndereco({ uf })}
            />
          </label>

          <label className="fiscal-field-span-2">
            <span>Código IBGE</span>
            <input
              disabled={isSaving}
              inputMode="numeric"
              maxLength={7}
              value={draft.emitente.endereco.codigo_municipio}
              onChange={event => updateEndereco({ codigo_municipio: digitsOnly(event.currentTarget.value, 7) })}
            />
          </label>

          <label className="fiscal-field-span-6">
            <span>Logradouro</span>
            <input
              disabled={isSaving}
              maxLength={160}
              value={draft.emitente.endereco.logradouro}
              onChange={event => updateEndereco({ logradouro: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-2">
            <span>Número</span>
            <input
              disabled={isSaving}
              maxLength={20}
              value={draft.emitente.endereco.numero}
              onChange={event => updateEndereco({ numero: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-4">
            <span>Bairro</span>
            <input
              disabled={isSaving}
              maxLength={80}
              value={draft.emitente.endereco.bairro}
              onChange={event => updateEndereco({ bairro: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-12">
            <span>Complemento</span>
            <input
              disabled={isSaving}
              maxLength={80}
              value={draft.emitente.endereco.complemento}
              onChange={event => updateEndereco({ complemento: event.currentTarget.value })}
            />
          </label>

          <label className="fiscal-field-span-4">
            <span>Regime</span>
            <PlatformSelect
              ariaLabel="Regime tributário do emitente"
              disabled={isSaving}
              options={crtOptions}
              placeholder="CRT"
              value={draft.emitente.crt}
              onChange={crt => updateEmitente({ crt })}
            />
          </label>
        </div>
      </section>
      ) : null}

      {isIssuanceMode && draft.ativo ? (
        <section className="fiscal-form-section fiscal-settings-section fiscal-certificate-section">
          <header className="fiscal-settings-section-head">
            <span aria-hidden="true">
              <FileKey2 size={18} />
            </span>
            <strong>Certificado A1</strong>
          </header>

          <div className="fiscal-certificate-card">
            <div className="fiscal-certificate-details">
              <div className="fiscal-certificate-title-row">
                <span aria-hidden="true">
                  <FileKey2 size={18} />
                </span>
                <div>
                  <strong>{draft.certificado.nome_arquivo || "Nenhum certificado selecionado"}</strong>
                  <small className="fiscal-certificate-subtitle">
                    <span>{draft.certificado.emitido_para || "Titular será identificado ao salvar o A1."}</span>
                    <em>{certificateValidityLabel ? `Validade ${certificateValidityLabel}` : "Validade será identificada pelo arquivo e senha."}</em>
                  </small>
                </div>
              </div>

              <div className="fiscal-certificate-config-row">
                <label className="fiscal-secret-field fiscal-certificate-password-field">
                  <span>Senha do A1</span>
                  <div className="fiscal-secret-input fiscal-secret-input-inline">
                    <input
                      autoComplete="new-password"
                      disabled={isSaving}
                      type={showCertificatePassword ? "text" : "password"}
                      value={draft.certificado.senha_pfx ?? ""}
                      onChange={event => updateCertificado({ senha_pfx: event.currentTarget.value })}
                    />
                    <button
                      aria-label={showCertificatePassword ? "Ocultar senha do A1" : "Mostrar senha do A1"}
                      disabled={isSaving}
                      type="button"
                      onClick={() => setShowCertificatePassword(current => !current)}
                    >
                      {showCertificatePassword ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <label className="fiscal-certificate-picker">
              <span aria-hidden="true">
                <Upload size={18} />
              </span>
              <strong>{draft.certificado.nome_arquivo ? "Trocar A1" : "Selecionar A1"}</strong>
              <input
                accept=".pfx,.p12,application/x-pkcs12,application/pkcs12"
                disabled={isSaving}
                type="file"
                onChange={event => {
                  handleCertificateFileChange(event.currentTarget.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        </section>
      ) : null}

      {isIssuanceMode && draft.ativo ? (
        <section className="fiscal-form-section fiscal-settings-section fiscal-csc-section">
          <header className="fiscal-settings-section-head">
            <span aria-hidden="true">
              <KeyRound size={18} />
            </span>
            <strong>CSC da NFC-e</strong>
          </header>

          <div className="fiscal-csc-card">
            <div className="fiscal-number-card-head fiscal-csc-card-head">
              <span aria-hidden="true">
                <ReceiptText size={18} />
              </span>
              <div>
                <strong>Token do consumidor</strong>
                <small>QR Code e consulta da NFC-e.</small>
              </div>
            </div>

            <div className="fiscal-form-grid fiscal-csc-grid">
              <label className="fiscal-secret-field fiscal-csc-token-field">
                <span>Chave CSC</span>
                <div className="fiscal-secret-input fiscal-secret-input-inline">
                  <input
                    autoComplete="new-password"
                    disabled={isSaving}
                    type={showCscToken ? "text" : "password"}
                    value={draft.nfce.csc_token ?? ""}
                    onChange={event => updateNfce({ csc_token: event.currentTarget.value })}
                  />
                  <button
                    aria-label={showCscToken ? "Ocultar chave CSC" : "Mostrar chave CSC"}
                    disabled={isSaving}
                    type="button"
                    onClick={() => setShowCscToken(current => !current)}
                  >
                    {showCscToken ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
                  </button>
                </div>
              </label>

              <label>
                <span>ID CSC</span>
                <input
                  disabled={isSaving}
                  maxLength={12}
                  value={draft.nfce.csc_id}
                  onChange={event => updateNfce({ csc_id: event.currentTarget.value.trim() })}
                />
              </label>
            </div>
          </div>
        </section>
      ) : null}

      {isIssuanceMode && draft.ativo ? (
        <section className="fiscal-form-section fiscal-settings-section fiscal-numbering-section">
          <header className="fiscal-settings-section-head">
            <span aria-hidden="true">
              <Hash size={18} />
            </span>
            <strong>Numeração</strong>
          </header>

          <div className="fiscal-numbering-cards">
            <div className="fiscal-number-card">
              <div className="fiscal-number-card-head">
                <span aria-hidden="true">
                  <ReceiptText size={18} />
                </span>
                <div>
                  <strong>NFC-e</strong>
                  <small>Documento fiscal para pessoa física.</small>
                </div>
              </div>
              <div className="fiscal-form-grid fiscal-numbering-grid fiscal-numbering-grid-nfce">
                <label>
                  <span>Série</span>
                  <input
                    disabled={isSaving}
                    inputMode="numeric"
                    min={1}
                    type="number"
                    value={draft.nfce.serie}
                    onChange={event => updateNfce({ serie: normalizePositiveInteger(event.currentTarget.value, 1, 999) })}
                  />
                </label>

                <label>
                  <span>Próxima nota</span>
                  <input
                    disabled={isSaving}
                    inputMode="numeric"
                    min={1}
                    type="number"
                    value={draft.nfce.proximo_numero}
                    onChange={event => updateNfce({ proximo_numero: normalizePositiveInteger(event.currentTarget.value, 1) })}
                  />
                </label>
              </div>
            </div>

            <div className="fiscal-number-card">
              <div className="fiscal-number-card-head">
                <span aria-hidden="true">
                  <FileKey2 size={18} />
                </span>
                <div>
                  <strong>NF-e</strong>
                  <small>Documento fiscal para pessoa jurídica.</small>
                </div>
              </div>
              <div className="fiscal-form-grid fiscal-numbering-grid fiscal-numbering-grid-nfe">
                <label>
                  <span>Série</span>
                  <input
                    disabled={isSaving}
                    inputMode="numeric"
                    min={1}
                    type="number"
                    value={draft.nfe.serie}
                    onChange={event => updateNfe({ serie: normalizePositiveInteger(event.currentTarget.value, 1, 999) })}
                  />
                </label>

                <label>
                  <span>Próxima nota</span>
                  <input
                    disabled={isSaving}
                    inputMode="numeric"
                    min={1}
                    type="number"
                    value={draft.nfe.proximo_numero}
                    onChange={event => updateNfe({ proximo_numero: normalizePositiveInteger(event.currentTarget.value, 1) })}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <div className="fiscal-settings-submit-row">
        <button className="platform-secondary-button" disabled={isSaving} type="button" onClick={onCancel}>
          <ArrowLeft aria-hidden="true" size={17} />
          Cancelar
        </button>
        <button className="platform-primary-button platform-save-button" disabled={isSaving} type="submit">
          {isSaving ? <LoaderCircle className="configuration-switch-loader" aria-hidden="true" size={17} /> : <Check aria-hidden="true" size={17} />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
