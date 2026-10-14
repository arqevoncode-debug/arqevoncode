import type { Metadata } from "next";
import Estrutura from "../estrutura";
import Calculadora from "./calculadora";

export const metadata: Metadata = {
  title: "Quanto as parcelas comprometem sua renda? Calculadora — Arqevon Finance",
  description: "Calcule grátis quanto do seu salário já está comprometido com parcelas do cartão, empréstimos e financiamentos, e veja como fica com uma compra nova.",
  alternates: { canonical: "/calculadoras/parcela-e-renda" },
  openGraph: { url: "/calculadoras/parcela-e-renda", title: "Quanto as parcelas comprometem sua renda?", description: "Calcule quanto do salário já está nas parcelas, antes de assumir outra.", images: [{ url: "/og-finance.png", width: 1200, height: 630 }] },
};

export default function Pagina() {
  return (
    <Estrutura atual="parcela-e-renda" titulo="Quanto as parcelas comprometem sua renda?" subtitulo="Some o que você já paga em parcelas e veja, antes de comprar, como fica com uma parcela nova."
      convite="O Arqevon Finance mostra todas as parcelas do cartão mês a mês, o saldo que ainda falta pagar e quanto da renda já está comprometido.">
      <Calculadora />
      <section className="calc-texto">
        <h2>Por que olhar a porcentagem e não só o valor da parcela</h2>
        <p>Uma parcela de R$ 250 parece pouco, mas parcelas se somam: o celular, a geladeira, a viagem. O que pesa no mês é o total, comparado com o que você ganha. Uma referência comum é manter as parcelas abaixo de 30% da renda líquida, para sobrar dinheiro para as contas da casa, o mercado e os imprevistos.</p>
        <h2>Antes de parcelar, confira</h2>
        <ul>
          <li>Quanto já sai por mês em parcelas e até quando cada uma vai.</li>
          <li>Se a parcela nova ainda deixa espaço para os gastos do dia a dia.</li>
          <li>O valor total da compra, somando todas as parcelas.</li>
        </ul>
      </section>
    </Estrutura>
  );
}
