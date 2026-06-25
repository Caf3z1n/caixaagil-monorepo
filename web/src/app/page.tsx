import Image from "next/image";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  Download
} from "lucide-react";

import { AuthFlowModal } from "@/components/auth-flow-modal";
import { FaqAccordion } from "@/components/faq-accordion";
import { HeroProductStories } from "@/components/hero-product-stories";
import { LandingEffects } from "@/components/landing-effects";
import { LandingNav } from "@/components/landing-nav";
import { LandingPlans } from "@/components/landing-plans";
import { LandingSessionRedirect } from "@/components/landing-session-redirect";
import { SmoothScrollLink } from "@/components/smooth-scroll-link";
import { TypewriterHeading } from "@/components/typewriter-heading";

const headerBackdropStyle: CSSProperties = {
  backdropFilter: "blur(var(--header-backdrop-blur))",
  WebkitBackdropFilter: "blur(var(--header-backdrop-blur))"
};

const productHighlights = [
  {
    image: "/produto/desktop-windows-sync.png",
    width: 1536,
    height: 1024,
    alt: "Ilustração 3D de um aplicativo desktop Windows com login, backup em nuvem e mais de um PDV sincronizado.",
    label: "Instale no seu Windows",
    text: "O Caixa Ágil é instalado no Windows e roda no computador do caixa, onde a venda realmente acontece. A internet é usada para login, validação da conta, backup e sincronização com outros PDVs. Depois disso, a operação local continua vendendo e pode emitir nota em contingência quando a conexão cair.",
    points: ["Executável Windows", "Login com sua conta", "Backup e múltiplos PDVs"]
  },
  {
    image: "/produto/comercios-multiplos.png",
    width: 1536,
    height: 1024,
    alt: "Ilustração 3D com fachadas de diferentes comércios usando o Caixa Ágil como sistema de venda e controle.",
    label: "Feito para qualquer comércio",
    text: "Mercado, mercearia, adega, loja, restaurante, comércio automotivo ou qualquer negócio que venda produto ou serviço: o Caixa Ágil organiza a rotina do balcão com emissão de nota ou apenas como controle interno de estoque e faturamento, sem amarrar o comércio ao sistema na parte fiscal.",
    points: ["Mercados e mercearias", "Lojas e conveniências", "Restaurantes e serviços"]
  },
  {
    image: "/produto/operacional-fluxo.png",
    width: 1672,
    height: 941,
    alt: "Ilustração 3D mostrando o fluxo operacional com leitor ou busca, venda, pagamento, emissão de cupom e baixa de estoque.",
    label: "Fluxo fácil de operar",
    text: "No atendimento, o operador pode passar o leitor de código de barras ou pesquisar o produto pelo nome. Depois é só lançar a venda, informar a forma de pagamento e seguir o fluxo. O sistema baixa o estoque, emite a nota quando o plano fiscal estiver ativo e deixa entradas e saídas prontas para conferir no fechamento do turno.",
    points: ["Leitor ou busca", "Comanda digital", "Conferência do turno"]
  },
  {
    image: "/produto/estoque-controle.png",
    width: 1536,
    height: 1024,
    alt: "Ilustração 3D com caixas de estoque, etiquetas, leitor e conferência operacional.",
    label: "Controle facilmente seu estoque",
    text: "O estoque acompanha a operação sem depender de planilha. A venda baixa o saldo automaticamente, as compras alimentam a entrada e as contagens ajudam a corrigir diferença antes de faltar produto no balcão. Assim o dono entende o que saiu, o que precisa repor e onde pode estar perdendo controle.",
    points: ["Baixa automática", "Reposição mais clara", "Contagem de estoque"]
  },
  {
    image: "/produto/fiscal-financeiro.png",
    width: 1536,
    height: 1024,
    alt: "Ilustração 3D com documentos fiscais, recebimentos, calculadora, dinheiro e painel de resultado.",
    label: "Emissão de notas e fechamento",
    text: "No fechamento, o caixa mostra o que entrou, por qual forma de pagamento e o que precisa ser conferido. Convênios e recebimentos ficam registrados para não se perderem no papel. Se o comércio contratar o plano fiscal, a emissão de NFC-e e NF-e entra no mesmo fluxo, com histórico e contingência quando precisar.",
    points: ["Fechamento do turno", "Convênios registrados", "NFC-e/NF-e"]
  }
] as const;

const faqItems = [
  {
    question: "O Caixa Ágil funciona sem internet?",
    answer:
      "Sim. A operação principal roda no computador do caixa, então venda, comanda, estoque e fechamento continuam locais. A internet é usada para login, validação da conta, backup e sincronização quando houver conexão."
  },
  {
    question: "Preciso emitir nota fiscal para usar o sistema?",
    answer:
      "Não. O plano Inicial pode ser usado para controle interno, faturamento, estoque e rotina do balcão sem emitir NF. A emissão fiscal entra apenas no plano Completo."
  },
  {
    question: "Qual é a diferença principal entre os planos?",
    answer:
      "Os dois planos atendem a venda local, comanda digital, estoque e fechamento do turno. A diferença é fiscal: o Completo inclui NF-e, NFC-e e contingência fiscal."
  },
  {
    question: "O sistema aceita leitor de código de barras e impressora de cupom?",
    answer:
      "Sim. O fluxo foi pensado para balcão: o operador pode usar leitor de código de barras, buscar produto pelo nome e imprimir comprovantes ou cupons conforme a estrutura instalada."
  },
  {
    question: "Posso usar em mais de um caixa?",
    answer:
      "Sim. O desktop opera localmente em cada PDV e a sincronização com a nuvem ajuda a manter backup e compartilhamento de informações quando houver mais de um ponto de venda."
  },
  {
    question: "Existe fidelidade no contrato?",
    answer:
      "Não. Os planos são mensais, sem fidelidade. Você pode cancelar quando quiser."
  }
];

export default function HomePage() {
  return (
    <main>
      <LandingSessionRedirect />
      <LandingEffects />

      <header
        className="site-header"
        style={headerBackdropStyle}
        aria-label="Navegação principal"
      >
        <a className="brand-mark" href="#inicio" aria-label="Caixa Ágil">
          <Image
            src="/brand/logo-caixa-agil.png"
            alt=""
            width={52}
            height={52}
            priority
          />
          <span>CAIXA ÁGIL</span>
        </a>

        <LandingNav />

        <AuthFlowModal />
      </header>

      <section className="hero" id="inicio" aria-labelledby="hero-title">
        <div className="hero-inner">
          <div className="hero-content">
            <TypewriterHeading
              id="hero-title"
              phrases={[
                "Vendeu no balcão? O Caixa Ágil já fez o resto.",
                "Leu o produto? O estoque já acompanhou a venda.",
                "Fechou o turno? Confira o caixa e acompanhe o lucro."
              ]}
            />
            <p className="hero-subtitle">
              Venda, comanda, estoque, recebimento e fechamento ficam no mesmo
              fluxo. Sem planilha paralela. Com fiscal só quando sua operação
              pedir.
            </p>

            <div className="hero-actions">
              <a
                className="button button-primary hero-download-button"
                href="/download/pdv"
                rel="noopener noreferrer"
                target="_blank"
              >
                Baixar PDV
                <Download aria-hidden="true" size={18} />
              </a>
              <SmoothScrollLink className="button button-primary" href="#planos">
                Ver planos
                <ArrowRight aria-hidden="true" size={19} />
              </SmoothScrollLink>
            </div>
          </div>

          <div className="hero-stage" aria-hidden="true">
            <div className="hero-product-visual">
              <HeroProductStories items={productHighlights} />
            </div>
          </div>
        </div>
      </section>

      <section className="operation product-section section-reveal" id="produto" aria-labelledby="product-title">
        <div className="product-heading">
          <h2 id="product-title">Produto</h2>
        </div>

        <div className="product-showcase">
          {productHighlights.map((item, index) => (
            <article
              className={`product-card ${index % 2 === 1 ? "product-card-reverse" : ""}`}
              key={item.label}
              data-reveal
              data-reveal-loop
            >
              <div className="product-card-media">
                <Image
                  src={item.image}
                  alt={item.alt}
                  width={item.width}
                  height={item.height}
                  sizes="(max-width: 820px) 88vw, 560px"
                />
              </div>
              <div className="product-card-copy">
                <span className="product-card-label">
                  {String(index + 1).padStart(2, "0")} - {item.label}
                </span>
                <p>{item.text}</p>
                <ul className="product-points" aria-label={`Destaques de ${item.label}`}>
                  {item.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="plans section-reveal" id="planos" aria-labelledby="plans-title">
        <div className="product-heading plans-heading">
          <h2 id="plans-title">Planos</h2>
        </div>

        <LandingPlans />
      </section>

      <section className="faq section-reveal" id="faq" aria-labelledby="faq-title" data-reveal>
        <div className="product-heading faq-heading">
          <h2 id="faq-title">FAQ</h2>
        </div>

        <FaqAccordion items={faqItems} />
      </section>

      <footer className="site-footer">
        <p className="footer-company">Ética Sistemas LTDA - 04.588.995/0001-04</p>
        <address className="footer-address">
          Rua Benedito Galdino de Barros, 455, Vila São Bernardo, Sorocaba, SP, 18080-445
        </address>
        <p className="footer-copy">© 2026 Ética Sistemas LTDA. Todos os direitos reservados.</p>
      </footer>
    </main>
  );
}
