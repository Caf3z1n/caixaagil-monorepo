import { Check, Clock, X } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { PaymentLoginAction } from "@/components/payment-login-action";

type PaymentStatusPageProps = {
  params: Promise<{
    status: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const statusCopy = {
  sucesso: {
    eyebrow: "Pagamento aprovado",
    title: "Plano ativado",
    text: "Recebemos a aprovação do Mercado Pago. Você já pode entrar no sistema usando o e-mail contratado.",
    tone: "success",
    icon: Check
  },
  pendente: {
    eyebrow: "Pagamento pendente",
    title: "Ainda estamos aguardando a confirmação",
    text: "Assim que o Mercado Pago confirmar o pagamento, seu acesso será liberado.",
    tone: "pending",
    icon: Clock
  },
  falha: {
    eyebrow: "Pagamento recusado",
    title: "O pagamento não foi concluído",
    text: "Você pode voltar ao site para tentar novamente ou escolher outro meio de pagamento.",
    tone: "failure",
    icon: X
  }
} as const;

const actionSuccessCopy = {
  mudar_plano: {
    eyebrow: "Troca enviada",
    title: "Plano em atualização",
    text: "Recebemos o retorno do Mercado Pago. A troca será aplicada assim que a aprovação for confirmada.",
  },
  trocar_pagamento: {
    eyebrow: "Pagamento atualizado",
    title: "Forma de pagamento em troca",
    text: "Recebemos o retorno do Mercado Pago. A assinatura atual continua ativa enquanto a troca é confirmada.",
  },
} as const;

const plans = {
  inicial: { name: "Inicial", price: "299" },
  completo: { name: "Completo", price: "499" }
} as const;

function getStringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function getPlan(planId: string | null, amount: string | null) {
  if (planId === "inicial" || planId === "completo") {
    return plans[planId];
  }

  return {
    name: "Plano Caixa Ágil",
    price: amount && Number.isFinite(Number(amount)) ? amount : null
  };
}

function formatAmountParam(value: string | null) {
  if (!value) {
    return null;
  }

  const amount = Number(value.replace(",", "."));

  if (!Number.isFinite(amount)) {
    return null;
  }

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(amount);
}

export default async function PaymentStatusPage({ params, searchParams }: PaymentStatusPageProps) {
  const { status } = await params;
  const query = await searchParams;
  const copy = statusCopy[status as keyof typeof statusCopy] ?? statusCopy.pendente;
  const email = getStringParam(query.email);
  const planId = getStringParam(query.plan);
  const amount = getStringParam(query.amount);
  const recurringAmount = getStringParam(query.recurring_amount);
  const credit = getStringParam(query.credit);
  const acao = getStringParam(query.acao);
  const plan = getPlan(planId, amount);
  const actionCopy =
    status === "sucesso" && (acao === "mudar_plano" || acao === "trocar_pagamento")
      ? actionSuccessCopy[acao]
      : null;
  const Icon = copy.icon;
  const firstPaymentLabel = formatAmountParam(amount);
  const recurringPaymentLabel = formatAmountParam(recurringAmount) || (plan.price ? `R$ ${plan.price}` : null);
  const creditLabel = formatAmountParam(credit);

  return (
    <main className="payment-return-page">
      <section className={`payment-return-card payment-return-card-${copy.tone}`}>
        <span className="payment-return-icon">
          <Icon aria-hidden="true" size={24} />
        </span>
        <span className="payment-return-eyebrow">{actionCopy?.eyebrow || copy.eyebrow}</span>
        <h1>{actionCopy?.title || copy.title}</h1>
        <p>{actionCopy?.text || copy.text}</p>

        <div className="payment-return-summary" aria-label="Resumo da contratação">
          <div>
            <small>Plano contratado</small>
            <strong>{plan.name}</strong>
          </div>
          {email ? (
            <div>
              <small>E-mail da conta</small>
              <strong>{email}</strong>
            </div>
          ) : null}
          <div>
            <small>{acao === "mudar_plano" && firstPaymentLabel ? "Primeiro pagamento" : "Assinatura"}</small>
            <strong>
              {acao === "mudar_plano" && firstPaymentLabel
                ? firstPaymentLabel
                : recurringPaymentLabel
                  ? `${recurringPaymentLabel}/mês`
                  : "Mensal recorrente"}
            </strong>
            {acao === "mudar_plano" && recurringPaymentLabel ? <em>Depois, {recurringPaymentLabel}/mês.</em> : null}
            {acao === "mudar_plano" && creditLabel ? <em>Crédito aplicado: {creditLabel}.</em> : null}
            <em>Sem fidelidade, cancele quando quiser dentro da plataforma.</em>
          </div>
        </div>

        <div className="payment-return-actions">
          <ActionButton href="/#planos" variant="secondary">Voltar ao site</ActionButton>
          {status === "sucesso" ? <PaymentLoginAction email={email} /> : null}
        </div>
      </section>
    </main>
  );
}
