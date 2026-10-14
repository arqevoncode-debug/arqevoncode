import Image from "next/image";
import Link from "next/link";
import "../landing.css";
import "./calculadoras.css";

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.arqevoncode.com.br";

export const CALCULADORAS = [
  { slug: "50-30-20", titulo: "Regra 50/30/20", resumo: "Quanto da sua renda vai para o essencial, para os desejos e para o futuro." },
  { slug: "parcela-e-renda", titulo: "Parcelas e renda", resumo: "Quanto as parcelas do cartão e dos empréstimos comprometem o seu salário." },
  { slug: "reserva-de-emergencia", titulo: "Reserva de emergência", resumo: "Quanto guardar para imprevistos e em quanto tempo você chega lá." },
];

/** Moldura comum: cabeçalho do Finance, a calculadora, o convite para o app e o rodapé. */
export default function Estrutura({ titulo, subtitulo, children, convite, atual }: {
  titulo: string; subtitulo: string; children: React.ReactNode; convite: string; atual: string;
}) {
  return (
    <main className="lp calc">
      <header className="lp-header">
        <Link className="lp-marca" href="/finance" aria-label="Arqevon Finance">
          <Image src="/simbolo-arqevon.svg" alt="" width={36} height={36} />
          <span><strong>Arqevon</strong> Finance</span>
        </Link>
        <nav aria-label="Navegação principal">
          <Link href="/calculadoras">Calculadoras</Link>
          <Link href="/finance">O app</Link>
        </nav>
        <div className="lp-header-acoes">
          <a className="lp-botao" href={APP_URL}>Começar grátis</a>
        </div>
      </header>

      <section className="calc-topo">
        <p className="lp-selo"><i /> Calculadora grátis</p>
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

      {atual !== "indice" && <section className="calc-outras">
        <h2>Outras calculadoras</h2>
        <div className="calc-lista">
          {CALCULADORAS.filter(c => c.slug !== atual).map(c => (
            <Link key={c.slug} href={`/calculadoras/${c.slug}`}><strong>{c.titulo}</strong><span>{c.resumo}</span></Link>
          ))}
        </div>
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
