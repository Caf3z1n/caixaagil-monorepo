import { apiGet } from "@/lib/api-client";

export type SubscriptionBillingStatus = {
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

export type SubscriptionEntitlements = {
  assinatura_id: number;
  plano_id: string;
  plano_nome: string;
  recursos: {
    emissao_fiscal: boolean;
  };
  limites: {
    pdvs_ativos: number | null;
    subcontas_ativas: number | null;
  };
  uso: {
    pdvs_ativos: number;
    subcontas_ativas: number;
  };
  disponivel: {
    pdvs_ativos: number | null;
    subcontas_ativas: number | null;
  };
  billing_status?: SubscriptionBillingStatus | null;
};

export function loadSubscriptionEntitlements(token: string) {
  return apiGet<SubscriptionEntitlements>("/assinaturas/entitlements", { token });
}

export function hasFiscalEntitlement(entitlements: SubscriptionEntitlements | null) {
  return entitlements?.recursos.emissao_fiscal === true;
}

export function isPlanLimitReached(
  entitlements: SubscriptionEntitlements | null,
  limit: keyof SubscriptionEntitlements["limites"]
) {
  if (!entitlements) {
    return false;
  }

  const planLimit = entitlements.limites[limit];

  return planLimit !== null && entitlements.uso[limit] >= planLimit;
}

export function formatPlanLimitUsage(
  entitlements: SubscriptionEntitlements | null,
  limit: keyof SubscriptionEntitlements["limites"]
) {
  if (!entitlements) {
    return "";
  }

  const planLimit = entitlements.limites[limit];
  const usage = entitlements.uso[limit] ?? 0;

  return planLimit === null ? `${usage} ativos` : `${usage}/${planLimit} ativos`;
}
