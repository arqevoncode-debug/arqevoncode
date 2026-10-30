import Image from "next/image";
import Link from "next/link";
import { EXEMPLOS, parcelasERenda, porcento, regra503020, reservaEmergencia } from "./contas";
import "../landing.css";
import "./calculadoras.css";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.arqevoncode.com.br";

// Reais sem centavos quando o valor é redondo: "R$ 1.500", "R$ 22,50".
const curto = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
const regra = regra503020(EXEMPLOS.regra.renda);
const parcelas = parcelasERenda({ ...EXEMPLOS.parcelas, hoje: new Date(2026, 0, 1) });
const reserva = reservaEmergencia({ ...EXEMPLOS.reserva, meses: 6 });

export const CALCULADORAS = [
  { slug: "50-30-20", titulo: "Regra 50/30/20", resumo: "Quanto da sua renda vai para o essencial, para os desejos e para o futuro.",
    exemplo: `Renda de ${curto(EXEMPLOS.regra.renda)}: ${curto(regra.necessidades)} · ${curto(regra.desejos)} · ${curto(regra.futuro)}`,
    icone: <><path d="M21 12A9 9 0 1 1 12 3v9z" /><path d="M15 3.5A9 9 0 0 1 20.5 9H15z" /></> },
  { slug: "parcela-e-renda", titulo: "Parcelas e renda", resumo: "Quanto as parcelas do cartão e dos empréstimos comprometem o seu salário.",
    exemplo: `${curto(parcelas.total)} em parcelas com renda de ${curto(EXEMPLOS.parcelas.renda)}: ${porcento(parcelas.pct)}`,
    icone: <><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></> },
  { slug: "reserva-de-emergencia", titulo: "Reserva de emergência", resumo: "Quanto guardar para imprevistos e em quanto tempo você chega lá.",
    exemplo: `Gastos de ${curto(EXEMPLOS.reserva.gastos)} por mês: reserva de ${curto(reserva.meta)}`,
    icone: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z" /><path d="m8.8 12.2 2.3 2.3 4.3-4.6" /></> },
];

function CartaoCalculadora({ c }: { c: (typeof CALCULADORAS)[number] }) {
  return (
    <Link className="calc-cartao" href={`/calculadoras/${c.slug}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{c.icone}</svg>
      <strong>{c.titulo}</strong>
      <span>{c.resumo}</span>
      <small>Ex.: {c.exemplo}</small>
      <em>Calcular <b aria-hidden="true">→</b></em>
    </Link>
  );
}

export function ListaCalculadoras({ menos }: { menos?: string }) {
  return (
    <div className="calc-lista">
      {CALCULADORAS.filter(c => c.slug !== menos).map(c => <CartaoCalculadora key={c.slug} c={c} />)}
    </div>
  );
}

/** Moldura comum: cabeçalho do Finance, a calculadora, o convite para o app e o rodapé. */
export default function Estrutura({ titulo, subtitulo, children, convite, atual }: {
  titulo: string; subtitulo: string; children: React.ReactNode; convite: string; atual: string;
}) {
  const indice = atual === "indice";
  return (
    <main className="lp calc">
      <header className="lp-header">
        <Link className="lp-marca" href="/finance" aria-label="Arqevon Finance">
          <Image src="/simbolo-arqevon.svg" alt="" width={36} height={36} />
          <span><strong>Arqevon</strong> Finance</span>
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/calculadoras" aria-current={indice ? "page" : undefined}>Calculadoras</Link>
          <Link href="/finance">O app</Link>
        </nav>
        <div className="lp-header-acoes">
          <a className="lp-botao" href={APP_URL}>Começar grátis</a>
        </div>
      </header>

      <section className="calc-topo">
        {/* no celular o menu do topo some: sem este link, só o fim da página levava às outras */}
        {!indice && <Link className="calc-voltar" href="/calculadoras"><b aria-hidden="true">←</b> Todas as calculadoras</Link>}
        <p className="lp-selo"><i /> {indice ? "Calculadoras grátis" : "Calculadora grátis"}</p>
        <h1>{titulo}</h1>
        <p className="lp-lead">{subtitulo}</p>
      </section>

      {children}

      <section className="calc-convite">
        <div>
          <h2>Faça isso com os seus números de verdade</h2>
          <p>{convite}</p>
        </div>
        <div className="calc-convite-acoes">
          <a className="lp-botao grande" href={APP_URL}>Começar grátis</a>
          <a className="lp-botao-sec grande" href={`${APP_URL}#exemplo`}>Ver um exemplo</a>
        </div>
      </section>

      {!indice && <section className="calc-outras">
        <h2>Outras calculadoras</h2>
        <ListaCalculadoras menos={atual} />
      </section>}

      <footer className="lp-rodape">
        <Link className="lp-marca" href="/finance">
          <Image src="/simbolo-arqevon.svg" alt="" width={30} height={30} />
          <span><strong>Arqevon</strong> Finance</span>
        </Link>
        <p>Os resultados são estimativas para ajudar no planejamento, não recomendação de investimento.</p>
        <nav className="lp-rodape-links" aria-label="Documentos legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/seguranca">Segurança</a>
        </nav>
        <small>© {new Date().getFullYear()} Arqevon Code.</small>
      </footer>
    </main>
  );
}
