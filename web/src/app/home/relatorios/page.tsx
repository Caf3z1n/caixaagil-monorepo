import {
  BarChart3,
  Boxes,
  CalendarDays,
  ClipboardList,
  ReceiptText,
  TrendingUp
} from "lucide-react";

import { PlatformFrame } from "@/components/platform-frame";

const reportCards = [
  {
    title: "Vendas",
    text: "Resumo por período, forma de pagamento e operador.",
    value: "0 vendas",
    icon: BarChart3
  },
  {
    title: "Estoque",
    text: "Entradas, saídas, contagens e produtos com baixo saldo.",
    value: "0 itens",
    icon: Boxes
  },
  {
    title: "Fechamentos",
    text: "Conferência de caixa, divergências e recebimentos.",
    value: "0 turnos",
    icon: ClipboardList
  },
  {
    title: "Fiscal",
    text: "Notas emitidas, contingências e status de emissão.",
    value: "Plano Inicial",
    icon: ReceiptText
  }
];

export default function PlatformReportsPage() {
  return (
    <PlatformFrame>
      <main className="platform-main">
      <section className="platform-page-heading">
        <div>
          <span className="platform-page-kicker">Relatórios</span>
          <h1>Leitura clara da operação</h1>
          <p>
            Assim que o PDV desktop sincronizar, os relatórios aparecem organizados por venda,
            estoque, fechamento e fiscal.
          </p>
        </div>

        <span className="platform-state-pill platform-state-pill-muted">
          <CalendarDays aria-hidden="true" size={18} />
          Aguardando dados
        </span>
      </section>

      <section className="platform-filter-panel" aria-label="Filtros de relatórios">
        <label>
          <span>Período</span>
          <select defaultValue="30">
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="month">Este mês</option>
          </select>
        </label>
        <label>
          <span>Origem</span>
          <select defaultValue="all">
            <option value="all">Todos os PDVs</option>
            <option value="counter">Balcão principal</option>
          </select>
        </label>
        <button className="platform-primary-button" type="button">
          Gerar relatório
          <TrendingUp aria-hidden="true" size={17} />
        </button>
      </section>

      <section className="platform-report-grid" aria-label="Tipos de relatórios">
        {reportCards.map((report) => {
          const Icon = report.icon;

          return (
            <article className="platform-report-card" key={report.title}>
              <span className="platform-panel-icon">
                <Icon aria-hidden="true" size={18} />
              </span>
              <div>
                <h2>{report.title}</h2>
                <p>{report.text}</p>
              </div>
              <strong>{report.value}</strong>
            </article>
          );
        })}
      </section>

      <section className="platform-work-panel">
        <div className="platform-work-head">
          <div>
            <h2>Relatórios recentes</h2>
            <p>Os últimos arquivos gerados ficam disponíveis aqui.</p>
          </div>
        </div>

        <div className="platform-empty-state">
          <ReceiptText aria-hidden="true" size={22} />
          <span>
            <strong>Nenhum relatório gerado ainda</strong>
            <small>Depois da primeira sincronização, gere um relatório para salvar o histórico.</small>
          </span>
        </div>
      </section>
      </main>
    </PlatformFrame>
  );
}
