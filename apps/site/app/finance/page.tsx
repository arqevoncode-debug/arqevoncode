import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";
import "../landing.css";

export const metadata: Metadata = {
  title: "Arqevon Finance — Suas contas do mês, claras em uma tela",
  description: "Organize receitas, contas fixas e parcelas do cartão. Veja quanto sobra e como ficam os próximos meses. Grátis, no navegador, com seus dados no seu aparelho.",
  alternates: { canonical: "/finance" },
  openGraph: { url: "/finance", siteName: "Arqevon Finance", title: "Arqevon Finance — Suas contas do mês, claras em uma tela", description: "Receitas, contas fixas e parcelas organizadas, com projeção dos próximos meses. Grátis e no navegador.", images: [{ url: "/og-finance.png", width: 1200, height: 630, alt: "Arqevon Finance: suas contas do mês, claras em uma tela" }] },
};


// Endereço do sistema web. Em teste local: NEXT_PUBLIC_APP_URL=http://localhost:4300
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.arqevoncode.com.br";

const recursos = [
  { titulo: "Fixos, avulsos e parcelados", texto: "Salário, aluguel, mercado e a parcela 4 de 12 do cartão entram na mesma lista. As contas do mês se montam sozinhas." },
  { titulo: "Gastos e limites por categoria", texto: "Veja para onde o dinheiro foi e defina um limite por categoria: o app avisa ao chegar em 80% e ao passar do limite." },
  { titulo: "Projeção dos próximos meses", texto: "Fixos, parcelas que ainda vão cair e a média dos gastos variáveis, somados para os próximos 6 meses." },
  { titulo: "Quanto da renda já está comprometido", texto: "Fixos e parcelas somados, em reais e em porcentagem da sua renda." },
  { titulo: "Objetivos com aportes", texto: "Reserva de emergência, viagem ou um notebook novo: acompanhe quanto falta para cada meta." },
  { titulo: "Importe o extrato do banco (Pro)", texto: "Arquivo OFX ou CSV do seu banco, com categorias sugeridas e revisão antes de salvar. O arquivo não sai do seu aparelho." },
];

const passos = [
  { n: "1", titulo: "Crie sua conta", texto: "Só o e-mail. Você recebe um código de acesso, sem senha para decorar." },
  { n: "2", titulo: "Lance o que entra e sai", texto: "Renda, contas fixas, gastos do dia a dia e compras parceladas." },
  { n: "3", titulo: "Decida com clareza", texto: "Saldo do mês, gastos por categoria e a projeção dos próximos meses na mesma tela." },
];

export default function Finance() {
  return (
    <main className="lp">
      <div className="lp-topo-marca">
        <span>Um produto da <strong>Arqevon Code</strong>, fábrica de software</span>
        <Link href="/">Conheça a Arqevon Code →</Link>
      </div>
      <header className="lp-header">
        <a className="lp-marca" href="#inicio" aria-label="Arqevon Finance — início">
          <Image src="/simbolo-arqevon.svg" alt="" width={36} height={36} />
          <span><strong>Arqevon</strong> Finance</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#recursos">Recursos</a>
          <a href="#privacidade">Privacidade</a>
          <a href="#planos">Planos</a>
          <a href="#perguntas">Dúvidas</a>
          <Link href="/calculadoras">Calculadoras</Link>
        </nav>
        <div className="lp-header-acoes">
          <a className="lp-entrar" href={APP_URL}>Entrar</a>
          <a className="lp-botao" href={APP_URL}>Começar grátis</a>
        </div>
      </header>

      <section className="lp-hero" id="inicio">
        <div className="lp-hero-texto">
          <p className="lp-selo"><i /> Finanças pessoais, sem planilha</p>
          <h1>Suas contas do mês,{" "}<br /><span>claras em uma tela.</span></h1>
          <p className="lp-lead">
            O Arqevon Finance organiza receitas, contas fixas e parcelas do cartão e mostra
            quanto sobra, para onde o dinheiro vai e como ficam os próximos meses.
          </p>
          <div className="lp-hero-acoes">
            <a className="lp-botao grande" href={APP_URL}>Começar grátis</a>
            <a className="lp-botao-sec grande" href={`${APP_URL}#exemplo`}>Ver um exemplo</a>
          </div>
          <p className="lp-hero-nota">Grátis para usar. Funciona no navegador, sem instalar nada.</p>
        </div>
        <div className="lp-hero-tela">
          <div className="lp-janela">
            <div className="lp-janela-barra"><i /><i /><i /><span>app.arqevoncode.com.br</span></div>
            <Image src="/produto/visao-geral.png" alt="Tela Visão geral do Arqevon Finance com alertas de limite, receitas, despesas, saldo, gastos por categoria e projeção" width={2800} height={3366} priority sizes="(max-width: 960px) 100vw, 640px" />
          </div>
        </div>
      </section>

      <section className="lp-faixa" aria-label="Destaques">
        <div><strong>Parcelas automáticas</strong><span>a 4/12 aparece no mês certo</span></div>
        <div><strong>Projeção de 6 meses</strong><span>antes de a conta chegar</span></div>
        <div><strong>Criptografado</strong><span>seus dados protegidos por senha</span></div>
        <div><strong>Sem planilha</strong><span>nada de fórmula para montar</span></div>
      </section>

      <section className="lp-secao" id="projetos">
        <div className="lp-titulo" id="recursos">
          <p className="lp-selo"><i /> Recursos</p>
          <h2>Tudo o que você precisa<br />para fechar o mês no azul.</h2>
        </div>
        <div className="lp-recursos">
          {recursos.map((r) => (
            <article key={r.titulo}>
              <h3>{r.titulo}</h3>
              <p>{r.texto}</p>
            </article>
          ))}
        </div>
        <div className="lp-duas-telas">
          <figure>
            <Image src="/produto/lancamentos.png" alt="Aba Lançamentos com contas fixas, renda e parcelas" width={2800} height={2586} sizes="(max-width: 960px) 100vw, 560px" />
            <figcaption>Lançamentos: fixos, renda e parcelas na mesma lista.</figcaption>
          </figure>
          <figure>
            <Image src="/produto/objetivos.png" alt="Aba Objetivos com barras de progresso" width={2800} height={1200} sizes="(max-width: 960px) 100vw, 560px" />
            <figcaption>Objetivos: quanto falta para cada meta.</figcaption>
          </figure>
        </div>
      </section>

      <section className="lp-secao" id="como-funciona">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Como funciona</p>
          <h2>Comece em menos de um minuto.</h2>
        </div>
        <ol className="lp-passos">
          {passos.map((p) => (
            <li key={p.n}><span>{p.n}</span><h3>{p.titulo}</h3><p>{p.texto}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-secao lp-privacidade" id="privacidade">
        <div>
          <p className="lp-selo"><i /> Privacidade</p>
          <h2>Seus dados são seus.<br /><span>E ficam com você.</span></h2>
        </div>
        <ul>
          <li><strong>Guardados no seu aparelho.</strong> No plano grátis, seus lançamentos não saem do seu navegador ou computador.</li>
          <li><strong>Protegidos por senha.</strong> Ative a criptografia (AES-256) e só quem tem a senha abre os dados.</li>
          <li><strong>Na nuvem, cifrados no seu aparelho.</strong> No Pro, os dados saem do aparelho já cifrados e você os abre em qualquer aparelho só entrando com o seu e-mail. <a href="/seguranca">Veja como funciona</a>.</li>
          <li><strong>Sem venda de dados, sem anúncios.</strong> O produto é o app, não você.</li>
          <li><strong>Exporte quando quiser.</strong> Seus dados num arquivo, para guardar ou levar para onde quiser.</li>
        </ul>
      </section>

      <section className="lp-secao" id="planos">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Planos</p>
          <h2>Comece grátis.<br /><span>Vá além com o Pro.</span></h2>
        </div>
        <div className="lp-planos">
          <article>
            <span className="lp-plano-nome">Grátis</span>
            <strong>R$ 0</strong>
            <ul>
              <li>Lançamentos e contas fixas sem limite</li>
              <li>Até 5 compras parceladas ativas</li>
              <li>Últimos 6 meses na tela e projeção de 3 meses</li>
              <li>1 objetivo e limite em 2 categorias</li>
              <li>Dados só neste aparelho</li>
            </ul>
            <a className="lp-botao-sec" href={APP_URL}>Começar grátis</a>
          </article>
          <article className="destaque">
            <span className="lp-plano-nome">Pro</span>
            <strong>R$ 14,90<small className="lp-plano-mes">/mês</small></strong>
            <p className="lp-plano-anual">ou R$ 119/ano · economize R$ 59,80</p>
            <p className="lp-plano-teste">Teste grátis por 30 dias ao criar sua conta, sem cartão.</p>
            <ul>
              <li>Parcelados, histórico, objetivos e limites sem restrição</li>
              <li>Importação do extrato do banco (OFX e CSV)</li>
              <li>Relatórios completos, com CSV e PDF</li>
              <li>Projeção de 12 meses</li>
              <li>Qualquer aparelho, inclusive celular, com sincronização</li>
              <li>Backup na nuvem, cifrado</li>
            </ul>
            <a className="lp-botao" href={APP_URL}>Testar o Pro grátis</a>
          </article>
        </div>
      </section>


      <section className="lp-secao" id="perguntas">
        <div className="lp-titulo"><p className="lp-selo"><i /> Dúvidas</p><h2>Perguntas frequentes.</h2></div>
        <div className="lp-faq">
          <details><summary>Preciso instalar alguma coisa?<span>+</span></summary><p>Não. O Arqevon Finance funciona no navegador, no computador ou no celular.</p></details>
          <details><summary>O plano grátis tem limite de tempo?<span>+</span></summary><p>Não, o Grátis não expira. Você lança sem limite e tem até 5 compras parceladas ativas, os últimos 6 meses na tela, projeção de 3 meses, 1 objetivo e limite em 2 categorias. Os dados ficam só no aparelho que estiver usando, e você exporta tudo quando quiser.</p></details>
          <details><summary>A Arqevon consegue ver minhas finanças?<span>+</span></summary><p>Não. No plano grátis os lançamentos ficam só no seu aparelho e nunca são enviados para nós.</p></details>
          <details><summary>O que tem no Pro?<span>+</span></summary><p>Tudo sem limites (parcelados, histórico, objetivos e categorias), importação do extrato do banco, relatórios completos com CSV e PDF, projeção de 12 meses e acesso em qualquer aparelho, inclusive no celular, com sincronização e backup na nuvem cifrado. Custa R$ 14,90 por mês ou R$ 119 por ano, e toda conta nova ganha 30 dias de teste grátis, sem cartão. Para assinar, entre no app e abra Sua conta. Você cancela quando quiser e tem 7 dias para desistir com reembolso integral.</p></details>
        </div>
      </section>

      <section className="lp-final">
        <h2>Clareza para decidir.<br /><span>Controle para evoluir.</span></h2>
        <a className="lp-botao grande" href={APP_URL}>Começar grátis</a>
      </section>

      <footer className="lp-rodape">
        <a className="lp-marca" href="#inicio">
          <Image src="/simbolo-arqevon.svg" alt="" width={30} height={30} />
          <span><strong>Arqevon</strong> Finance</span>
        </a>
        <p>Arqevon Finance é um produto da <Link href="/">Arqevon Code</Link>, fábrica de software sob encomenda.</p>
        <nav className="lp-rodape-links" aria-label="Documentos legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/privacidade">Política de Privacidade</a>
          <a href="/seguranca">Segurança</a>
          <a href="/calculadoras">Calculadoras</a>
        </nav>
        <small>© {new Date().getFullYear()} Arqevon Code.</small>
      </footer>
    </main>
  );
}
