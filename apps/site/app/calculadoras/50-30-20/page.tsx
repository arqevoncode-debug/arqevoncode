import type { Metadata } from "next";
import Estrutura from "../estrutura";
import Calculadora from "./calculadora";

export const metadata: Metadata = {
  title: "Calculadora da regra 50/30/20 — Arqevon Finance",
  description: "Calcule grátis quanto da sua renda vai para necessidades, desejos e futuro pela regra 50/30/20, e compare com o que você gasta hoje.",
  alternates: { canonical: "/calculadoras/50-30-20" },
  openGraph: { url: "/calculadoras/50-30-20", title: "Calculadora da regra 50/30/20", description: "Quanto da sua renda vai para necessidades, desejos e futuro.", images: [{ url: "/og-finance.png", width: 1200, height: 630 }] },
};

export default function Pagina() {
  return (
    <Estrutura atual="50-30-20" titulo="Regra 50/30/20" subtitulo="Divida a renda em três partes e veja quanto cabe em cada uma: necessidades, desejos e futuro."
      convite="No Arqevon Finance você registra a renda, as contas fixas e as parcelas, define um limite por categoria e recebe um aviso quando chegar perto.">
      <Calculadora />
      <section className="calc-texto">
        <h2>O que é a regra 50/30/20</h2>
        <p>É um jeito simples de organizar o dinheiro do mês. A renda líquida, o que de fato cai na conta, é dividida em três partes:</p>
        <ul>
          <li><strong>50% para necessidades:</strong> o que você precisa pagar de qualquer jeito, como aluguel ou financiamento, contas da casa, mercado, transporte e saúde.</li>
          <li><strong>30% para desejos:</strong> o que melhora o dia a dia, mas dá para cortar se apertar, como lazer, restaurantes, roupas e assinaturas.</li>
          <li><strong>20% para o futuro:</strong> reserva de emergência, objetivos e pagar dívidas antes do prazo.</li>
        </ul>
        <h2>E se as contas não cabem nos 50%?</h2>
        <p>É comum, principalmente com aluguel alto ou parcelas no cartão. A regra serve como referência, não como obrigação. O primeiro passo é saber para onde o dinheiro está indo: anote os gastos de um mês inteiro, separe por categoria e veja quais contas fixas dá para renegociar.</p>
      </section>
    </Estrutura>
  );
}
