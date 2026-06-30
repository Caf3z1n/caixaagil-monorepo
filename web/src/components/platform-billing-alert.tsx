"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Ban, CreditCard } from "lucide-react";

import {
  loadSubscriptionEntitlements,
  type SubscriptionBillingStatus
} from "@/lib/subscription-entitlements";
import { getStoredPlatformAuthToken } from "@/lib/platform-session";

function formatDate(value?: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short"
  }).format(date);
}

function getBillingTitle(status: SubscriptionBillingStatus) {
  if (status.bloqueado || status.fase === "bloqueada") {
    return "Conta bloqueada por pagamento";
  }

  if (status.fase === "atrasada") {
    return "Pagamento em atraso";
  }

  return "Pagamento precisa de atenção";
}

function getBillingMessage(status: SubscriptionBillingStatus) {
  if (status.mensagem) {
    return status.mensagem;
  }

  if (status.dias_em_atraso > 0) {
    return `${status.dias_em_atraso} dia${status.dias_em_atraso === 1 ? "" : "s"} em atraso.`;
  }

  return `Próximo pagamento: ${formatDate(status.proximo_pagamento_em)}.`;
}

export function PlatformBillingAlert() {
  const [billingStatus, setBillingStatus] = useState<SubscriptionBillingStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredPlatformAuthToken();

    if (!token) {
      return undefined;
    }

    loadSubscriptionEntitlements(token)
      .then((entitlements) => {
        if (!cancelled) {
          setBillingStatus(entitlements.billing_status ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBillingStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!billingStatus || billingStatus.fase === "regular") {
    return null;
  }

  const Icon = billingStatus.bloqueado ? Ban : billingStatus.fase === "atrasada" ? AlertTriangle : CreditCard;
  const toneClass = billingStatus.bloqueado
    ? "platform-billing-alert-danger"
    : billingStatus.fase === "atrasada"
      ? "platform-billing-alert-warning"
      : "";

  return (
    <div className="platform-billing-alert-band">
      <section className={`platform-billing-alert ${toneClass}`} aria-live="polite">
        <Icon aria-hidden="true" size={18} />
        <span>
          <strong>{getBillingTitle(billingStatus)}</strong>
          <small>{getBillingMessage(billingStatus)}</small>
        </span>
        {billingStatus.bloqueia_em ? (
          <em>Bloqueio em {formatDate(billingStatus.bloqueia_em)}</em>
        ) : null}
      </section>
    </div>
  );
}
