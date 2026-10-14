import type { Metadata } from "next";
import Estrutura from "../estrutura";
import Calculadora from "./calculadora";

export const metadata: Metadata = {
  title: "Calculadora de reserva de emergência — Arqevon Finance",
  description: "Calcule grátis o valor da sua reserva de emergência pelos seus gastos essenciais e em quantos meses você chega lá guardando todo mês.",
  alternates: { canonical: "/calculadoras/reserva-de-emergencia" },
  openGraph: { url: "/calculadoras/reserva-de-emergencia", title: "Calculadora de reserva de emergência", description: "Quanto guardar para imprevistos e em quanto tempo você chega lá.", images: [{ url: "/og-finance.png", width: 1200, height: 630 }] },
};

export default function Pagina() {
  return (
    <Estrutura atual="reserva-de-emergencia" titulo="Reserva de emergência" subtitulo="Descubra quanto guardar para imprevistos, como uma demissão ou uma despesa de saúde, e em quanto tempo você chega lá."
      convite="No Arqevon Finance você cria a meta “Reserva de emergência”, registra cada valor guardado e vê o progresso e a previsão de quando chega lá.">
      <Calculadora />
      <section className="calc-texto">
        <h2>Quanto guardar</h2>
        <p>A reserva de emergência cobre seus gastos essenciais por alguns meses se a renda parar. A conta parte do que você precisa para viver, não do salário: some moradia, contas da casa, mercado, transporte e saúde.</p>
        <ul>
          <li><strong>Renda estável</strong> (carteira assinada, servidor público, aposentadoria): uma referência comum é de 3 a 6 meses de gastos. A calculadora usa 6.</li>
          <li><strong>Renda variável</strong> (autônomo, MEI, comissão): como os meses ruins são mais prováveis, a referência costuma ir de 6 a 12 meses. A calculadora usa 12.</li>
        </ul>
        <h2>Como montar</h2>
        <p>Defina um valor fixo para guardar todo mês, de preferência logo que o salário cair, e trate esse valor como uma conta fixa. Use a reserva só para emergências de verdade e, se precisar usar, recomponha antes de voltar a outros objetivos.</p>
      </section>
    </Estrutura>
  );
}
