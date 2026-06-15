import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  MonitorDown,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  UserPlus,
  UsersRound
} from "lucide-react";

import { PlatformAccountEmail } from "@/components/platform-account-email";
import { PlatformFrame } from "@/components/platform-frame";

const summaryItems = [
  { label: "Plano atual", value: "Inicial", detail: "R$ 299/mês" },
  { label: "Status da conta", value: "Ativa", detail: "E-mail verificado" },
  { label: "Assinatura", value: "Recorrente", detail: "Sem fidelidade" }
];

const nextActions = [
  {
    title: "Instalar PDV Windows",
    text: "Prepare o computador do caixa para vender com operação local.",
    href: "#instalacao",
    icon: MonitorDown,
    action: "Preparar instalação"
  },
  {
    title: "Gerenciar PDVs e equipe",
    text: "Cadastre caixas, gere códigos de pareamento e separe acessos da equipe.",
    href: "/subcontas",
    icon: UserPlus,
    action: "Abrir PDVs e subcontas"
  },
  {
    title: "Acompanhar relatórios",
    text: "Quando o PDV sincronizar, vendas, estoque e fechamento aparecem aqui.",
    href: "/relatorios",
    icon: BarChart3,
    action: "Ver relatórios"
  }
];

const operationSnapshot = [
  { label: "Vendas sincronizadas", value: "0", icon: ReceiptText },
  { label: "Itens no estoque", value: "0", icon: PackageCheck },
  { label: "PDVs ativos", value: "1", icon: UsersRound },
  { label: "Status fiscal", value: "Inicial", icon: ShieldCheck }
];

export default function PlatformHomePage() {
  return (
    <PlatformFrame>
      <main className="platform-main">
      <section className="platform-page-heading">
        <div>
          <span className="platform-page-kicker">Início</span>
          <h1>Central da sua operação</h1>
          <p>
            Acompanhe a conta, prepare o PDV e mantenha os próximos passos de ativação no mesmo lugar.
          </p>
        </div>

        <span className="platform-state-pill">
          <CheckCircle2 aria-hidden="true" size={18} />
          Conta ativa
        </span>
      </section>

      <section className="platform-dashboard-grid" aria-label="Resumo da plataforma">
        <article className="platform-start-panel">
          <div className="platform-start-copy">
            <span className="platform-soft-badge">Caixa Ágil pronto</span>
            <h2>Comece pelo computador do caixa.</h2>
            <p>
              O app desktop concentra a venda. Esta área fica como central de conta, relatórios,
              equipe, PDVs e assinatura.
            </p>
          </div>

          <div className="platform-start-actions" id="instalacao">
            {nextActions.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="platform-action-row"
                  href={item.href}
                  key={item.title}
                >
                  <span className="platform-action-icon">
                    <Icon aria-hidden="true" size={20} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </span>
                  <em>
                    {item.action}
                    <ArrowRight aria-hidden="true" size={16} />
                  </em>
                </Link>
              );
            })}
          </div>
        </article>

        <aside className="platform-account-panel" aria-label="Conta e assinatura">
          <div className="platform-panel-title">
            <span className="platform-panel-icon">
              <ShieldCheck aria-hidden="true" size={18} />
            </span>
            <span>
              <strong>Conta</strong>
              <PlatformAccountEmail className="platform-account-email" />
            </span>
          </div>

          <div className="platform-summary-list">
            {summaryItems.map((item) => (
              <div key={item.label}>
                <small>{item.label}</small>
                <strong>{item.value}</strong>
                <em>{item.detail}</em>
              </div>
            ))}
          </div>

          <Link className="platform-inline-link" href="/conta">
            Ver minha conta
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </aside>
      </section>

      <section className="platform-section-grid" aria-label="Estado inicial">
        {operationSnapshot.map((item) => {
          const Icon = item.icon;

          return (
            <article className="platform-metric" key={item.label}>
              <Icon aria-hidden="true" size={18} />
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="platform-work-panel" aria-labelledby="platform-work-title">
        <div className="platform-work-head">
          <div>
            <h2 id="platform-work-title">Próximos movimentos</h2>
            <p>Organize a primeira entrada no sistema sem depender de suporte.</p>
          </div>
          <span>
            <CalendarClock aria-hidden="true" size={17} />
            Hoje
          </span>
        </div>

        <div className="platform-task-list">
          <div className="platform-task-row platform-task-row-done">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span>
              <strong>Conta verificada</strong>
              <small>Seu e-mail principal já pode acessar a plataforma.</small>
            </span>
          </div>
          <div className="platform-task-row">
            <MonitorDown aria-hidden="true" size={18} />
            <span>
              <strong>Instalar o app desktop</strong>
              <small>Depois da instalação, o PDV começa a sincronizar dados para relatórios.</small>
            </span>
          </div>
          <div className="platform-task-row">
            <UsersRound aria-hidden="true" size={18} />
            <span>
              <strong>Adicionar PDVs e operadores</strong>
              <small>Separe o computador do caixa, os operadores e o acesso gerencial antes de abrir a operação.</small>
            </span>
          </div>
        </div>
      </section>
      </main>
    </PlatformFrame>
  );
}
