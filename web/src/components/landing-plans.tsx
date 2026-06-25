"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";

import { AuthFlowModal } from "@/components/auth-flow-modal";
import { apiGet } from "@/lib/api-client";

type PublicPlanResource = {
  codigo?: string;
  habilitado?: boolean;
  included?: boolean;
  label?: string;
  nome?: string;
};

type PublicPlanLimit = {
  codigo?: string;
  nome?: string;
  unidade?: string | null;
  valor?: number | null;
};

type PublicPlanFromApi = {
  id: string;
  descricao?: string | null;
  intervalo?: "mensal" | "dias";
  intervalo_quantidade?: number;
  limites?: PublicPlanLimit[];
  moeda?: string;
  name?: string;
  nome?: string;
  price?: string;
  recursos?: PublicPlanResource[];
  resources?: PublicPlanResource[];
  valor_centavos?: number;
};

type PlansResponse = {
  planos?: PublicPlanFromApi[];
};

type PlanFeature = {
  included: boolean;
  isConfigurable?: boolean;
  label: string;
};

type DisplayPlan = {
  billingLabel: string;
  cta: string;
  description: string;
  featured?: boolean;
  features: PlanFeature[];
  id: string;
  isCustom?: boolean;
  name: string;
  price: string;
};

const fallbackPublicPlans: PublicPlanFromApi[] = [
  {
    id: "inicial",
    nome: "Inicial",
    descricao: "Operação comercial com caixa, vendas, estoque e fechamento sem emissão fiscal.",
    valor_centavos: 29900,
    intervalo: "mensal",
    intervalo_quantidade: 1,
    recursos: [
      { codigo: "emissao_fiscal", nome: "Emissão de notas NF-e/NFC-e", habilitado: false }
    ],
    limites: [
      { codigo: "pdvs_ativos", nome: "PDVs", valor: null },
      { codigo: "subcontas_ativas", nome: "Subcontas", valor: null }
    ]
  },
  {
    id: "completo",
    nome: "Completo",
    descricao: "Operação comercial completa com caixa, vendas, estoque e emissão fiscal.",
    valor_centavos: 49900,
    intervalo: "mensal",
    intervalo_quantidade: 1,
    recursos: [
      { codigo: "emissao_fiscal", nome: "Emissão de notas NF-e/NFC-e", habilitado: true }
    ],
    limites: [
      { codigo: "pdvs_ativos", nome: "PDVs", valor: null },
      { codigo: "subcontas_ativas", nome: "Subcontas", valor: null }
    ]
  }
];

function formatPlanPriceFromCents(cents?: number) {
  if (!Number.isInteger(cents)) {
    return "";
  }

  const normalizedCents = cents ?? 0;
  const value = normalizedCents / 100;
  const hasCents = normalizedCents % 100 !== 0;

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: hasCents ? 2 : 0,
    minimumFractionDigits: hasCents ? 2 : 0
  }).format(value);
}

function getBillingLabel(plan: PublicPlanFromApi) {
  if (plan.intervalo === "dias") {
    const quantidade = Number(plan.intervalo_quantidade || 1);

    return quantidade === 1 ? "/dia" : `/ ${quantidade} dias`;
  }

  return "/mês";
}

function getResources(plan: PublicPlanFromApi) {
  return plan.recursos || plan.resources || [];
}

function isFeatureEnabled(plan: PublicPlanFromApi, codigo: string) {
  const resource = getResources(plan).find((item) => item.codigo === codigo);

  if (!resource) {
    return false;
  }

  return Boolean(resource.habilitado ?? resource.included);
}

function getLimit(plan: PublicPlanFromApi, codigo: string) {
  const limit = (plan.limites || []).find((item) => item.codigo === codigo);

  return Number.isInteger(limit?.valor) ? Number(limit?.valor) : null;
}

function formatLimitFeature(value: number | null, singular: string, plural: string) {
  if (typeof value === "number") {
    return `${value} ${value === 1 ? singular : plural}`;
  }

  return `${plural} sem limite`;
}

function normalizePlan(plan: PublicPlanFromApi, index: number, total: number): DisplayPlan | null {
  if (!plan?.id) {
    return null;
  }

  const name = plan.nome || plan.name || plan.id;
  const price = plan.price || formatPlanPriceFromCents(plan.valor_centavos);

  return {
    id: plan.id,
    name,
    price,
    billingLabel: getBillingLabel(plan),
    description: plan.descricao || "Sem fidelidade. Cancele quando quiser.",
    cta: `Contratar ${name}`,
    featured: total > 1 && index === total - 1,
    features: [
      { label: "Abertura de caixa e vendas", included: true },
      { label: "Controle de estoque", included: true },
      { label: formatLimitFeature(getLimit(plan, "pdvs_ativos"), "PDV", "PDVs"), included: true },
      { label: formatLimitFeature(getLimit(plan, "subcontas_ativas"), "subconta", "Subcontas"), included: true },
      { label: "Emissão de notas NF-e/NFC-e", included: isFeatureEnabled(plan, "emissao_fiscal") }
    ]
  };
}

const customPlan: DisplayPlan = {
  id: "personalizado",
  name: "Personalizado",
  price: "Sob consulta",
  billingLabel: "configurável",
  description: "Recursos, limites e cobrança definidos conforme a operação.",
  cta: "Ativar personalizado",
  isCustom: true,
  features: [
    { label: "Abertura de caixa e vendas", included: true },
    { label: "Controle de estoque", included: true },
    { label: "PDVs configuráveis", included: true, isConfigurable: true },
    { label: "Subcontas configuráveis", included: true, isConfigurable: true },
    { label: "Emissão de notas NF-e/NFC-e configurável", included: true, isConfigurable: true }
  ]
};

function normalizePlans(rawPlans: PublicPlanFromApi[]) {
  const publicPlans = rawPlans
    .map((plan, index) => normalizePlan(plan, index, rawPlans.length))
    .filter((plan): plan is DisplayPlan => Boolean(plan));

  return [...publicPlans, customPlan];
}

function PlanFeatureIcon({ feature }: { feature: PlanFeature }) {
  return feature.included ? <Check aria-hidden="true" size={17} /> : <X aria-hidden="true" size={17} />;
}

function PlanCard({ plan }: { plan: DisplayPlan }) {
  const buttonClassName = plan.featured ? "button button-primary" : "button button-outline";

  return (
    <article
      className={[
        "plan-card",
        plan.featured ? "plan-card-featured" : ""
      ].filter(Boolean).join(" ")}
    >
      <div className="plan-content">
        <div className="plan-card-head">
          <h3>{plan.name}</h3>

          <div className={plan.isCustom ? "plan-price plan-price-custom" : "plan-price"}>
            {plan.isCustom ? (
              <strong>{plan.price}</strong>
            ) : (
              <>
                <span>R$</span>
                <strong>{plan.price}</strong>
                <em>{plan.billingLabel}</em>
              </>
            )}
          </div>

          <p className="plan-text">{plan.description}</p>
        </div>

        <ul aria-label={`Recursos do plano ${plan.name}`}>
          {plan.features.map((feature) => (
            <li
              className={[
                feature.included ? "plan-feature-included" : "plan-feature-missing"
              ].filter(Boolean).join(" ")}
              key={feature.label}
            >
              <PlanFeatureIcon feature={feature} />
              {feature.label}
            </li>
          ))}
        </ul>

        <AuthFlowModal
          buttonClassName={buttonClassName}
          buttonLabel={plan.cta}
          initialPlan={plan.isCustom ? undefined : plan.id}
          triggerIcon="chevron"
        />
      </div>
    </article>
  );
}

function PlanSkeletonCard() {
  return (
    <article className="plan-card plan-card-skeleton" aria-hidden="true">
      <div className="plan-content">
        <div className="plan-card-head">
          <span className="plan-skeleton-line plan-skeleton-label" />
          <span className="plan-skeleton-line plan-skeleton-title" />
          <span className="plan-skeleton-line plan-skeleton-price" />
          <span className="plan-skeleton-line plan-skeleton-copy" />
        </div>
        <ul>
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index}>
              <span className="plan-skeleton-dot" />
              <span className="plan-skeleton-line" />
            </li>
          ))}
        </ul>
        <span className="plan-skeleton-button" />
      </div>
    </article>
  );
}

export function LandingPlans() {
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let isActive = true;

    async function loadPlans() {
      try {
        const result = await apiGet<PlansResponse | PublicPlanFromApi[]>("/assinaturas/planos", {
          cacheTtlMs: 300_000
        });
        const rawPlans = Array.isArray(result) ? result : result?.planos ?? [];
        const nextPlans = normalizePlans(rawPlans.length > 0 ? rawPlans : fallbackPublicPlans);

        if (!isActive) {
          return;
        }

        setPlans(nextPlans);
        setStatus("ready");
      } catch {
        if (!isActive) {
          return;
        }

        setPlans(normalizePlans(fallbackPublicPlans));
        setStatus("error");
      }
    }

    void loadPlans();

    return () => {
      isActive = false;
    };
  }, []);

  const skeletons = useMemo(() => Array.from({ length: 3 }), []);
  const isLoading = status === "loading";

  return (
    <>
      <div
        className={isLoading ? "plan-cards plan-cards-loading" : "plan-cards"}
        aria-busy={isLoading}
        aria-label="Planos do Caixa Ágil"
        data-reveal
        data-reveal-loop
      >
        {isLoading
          ? skeletons.map((_, index) => <PlanSkeletonCard key={index} />)
          : plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
      </div>

      {status === "error" ? (
        <p className="plans-api-note" role="status">
          Não foi possível carregar a API agora. Mostrando a configuração base dos planos.
        </p>
      ) : null}
    </>
  );
}
