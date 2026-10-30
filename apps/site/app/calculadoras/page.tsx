import type { Metadata } from "next";
import Estrutura, { ListaCalculadoras } from "./estrutura";

export const metadata: Metadata = {
  title: "Calculadoras de finanças pessoais grátis — Arqevon Finance",
  description: "Regra 50/30/20, quanto as parcelas comprometem a renda e reserva de emergência: calculadoras grátis, sem cadastro.",
  alternates: { canonical: "/calculadoras" },
  openGraph: { url: "/calculadoras", title: "Calculadoras de finanças pessoais grátis", description: "50/30/20, parcelas e renda, reserva de emergência.", images: [{ url: "/og-finance.png", width: 1200, height: 630 }] },
};

export default function Calculadoras() {
  return (
    <Estrutura atual="indice" titulo="Calculadoras de finanças pessoais" subtitulo="Grátis e sem cadastro. Os números ficam no seu navegador: nada é enviado."
      convite="Quando quiser ir além das contas de cabeça, o Arqevon Finance organiza receitas, contas fixas e parcelas e mostra como ficam os próximos meses.">
      <section className="calc-indice">
        <ListaCalculadoras />
      </section>
    </Estrutura>
  );
}
