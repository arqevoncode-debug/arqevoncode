import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import HeroProduto from "./hero-produto";
import Orcamento from "./orcamento";
import "./inicio.css";

// Página inicial: o Arqevon Finance em destaque. O orçamento sob medida é um extra discreto no fim.
// Não citar clientes, números ou depoimentos que não existam.
const FINANCE_APP = process.env.NEXT_PUBLIC_APP_URL || "https://app.arqevoncode.com.br";

const TITULO = "Arqevon Finance — Suas finanças sem planilha";
const DESCRICAO = "Receitas, contas fixas e parcelas do cartão num só lugar, e quanto sobra neste mês e nos próximos. Grátis no navegador; Pro com nuvem criptografada.";
export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  alternates: { canonical: "/" },
  openGraph: { url: "/", siteName: "Arqevon Code", title: TITULO, description: DESCRICAO, images: [{ url: "/og-finance.png", width: 1200, height: 630, alt: "Arqevon Finance" }] },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: ["/og-finance.png"] },
};

export default function Home() {
  return (
    <main className="ini">
      <div className="ini-malha" aria-hidden="true" />
      <header className="ini-topo">
        <div className="ini-w">
          <Link className="ini-marca" href="/" aria-label="Arqevon Code — início">
            <Image src="/simbolo-arqevon.svg" alt="" width={34} height={34} />
            <span><strong>Arqevon</strong> Code</span>
          </Link>
          <nav aria-label="Navegação principal">
            <a href="#planos">Planos</a>
            <a href="#duvidas">Dúvidas</a>
          </nav>
          <div className="ini-dir">
            <a className="ini-entrar" href={FINANCE_APP}>Entrar</a>
            <a className="ini-btn" href={FINANCE_APP}>Começar grátis</a>
          </div>
        </div>
      </header>

      <div className="ini-w">
        <HeroProduto app={FINANCE_APP} />

        <section className="ini-sec" id="planos">
          <div className="ini-cab">
            <p className="ini-selo"><i /> Planos</p>
            <h2>Comece grátis.</h2>
            <p>Vá para o Pro quando precisar de mais.</p>
          </div>
          <div className="ini-planos">
            <article className="ini-plano">
              <h3>Grátis</h3>
              <div className="ini-preco">R$ 0</div>
              <p>Para organizar o mês, sem cartão e sem prazo. Seus dados ficam no navegador.</p>
              <a className="ini-btn-sec ini-g" href={FINANCE_APP}>Usar grátis</a>
            </article>
            <article className="ini-plano pro">
              <span className="ini-etq">30 dias grátis</span>
              <h3>Pro</h3>
              <div className="ini-preco">R$ 14,90<small> /mês</small></div>
              <p>Tudo sem limite, em todos os seus aparelhos. Ou R$ 119 por ano.</p>
              <a className="ini-btn ini-g" href={FINANCE_APP}>Testar o Pro</a>
            </article>
          </div>
          <p className="ini-nota">No Pro, seus dados são cifrados antes de sair do aparelho. <Link href="/seguranca">Como protegemos</Link></p>
        </section>

        <section className="ini-sec" id="duvidas">
          <div className="ini-cab">
            <p className="ini-selo"><i /> Dúvidas</p>
            <h2>Perguntas frequentes.</h2>
          </div>
          <div className="ini-faq">
            <details><summary>É grátis mesmo?</summary><p>Sim. O plano grátis não pede cartão e não tem prazo. O Pro tem 30 dias de teste.</p></details>
            <details><summary>Meus dados ficam seguros?</summary><p>No grátis, ficam só no seu navegador. No Pro, são cifrados no aparelho antes de ir para a nuvem.</p></details>
            <details><summary>Funciona no celular?</summary><p>Sim. Abra pelo navegador do celular e instale, sem loja de aplicativos.</p></details>
            <details><summary>Se eu cancelar o Pro, perco meus dados?</summary><p>Não. Você volta para o grátis e nada é apagado.</p></details>
          </div>
        </section>

        <Orcamento />
      </div>

      <footer className="ini-rodape">
        <div className="ini-w">
          <Link className="ini-marca" href="/">
            <Image src="/simbolo-arqevon.svg" alt="" width={30} height={30} />
            <span><strong>Arqevon</strong> Code</span>
          </Link>
          <nav aria-label="Rodapé">
            <Link href="/finance">Recursos do Finance</Link>
            <Link href="/calculadoras">Calculadoras</Link>
            <Link href="/seguranca">Segurança</Link>
            <a href="/termos">Termos de Uso</a>
            <a href="/privacidade">Política de Privacidade</a>
            <a href="mailto:contato@arqevoncode.com.br">contato@arqevoncode.com.br</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
