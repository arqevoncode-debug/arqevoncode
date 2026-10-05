import Image from "next/image";
import DownloadWindows from "./download-windows";
import Orcamento from "./orcamento";
import "./landing.css";

const windowsDownloadPath =
  "/downloads/Arqevon-Finance-1.0.6-Windows-x64-Setup.exe";
// O .dmg da 1.0.6 continua hospedado em /downloads para links já enviados, mas não é
// oferecido na página: sem certificado Developer ID o macOS o recusa como danificado.
// Ao publicar um instalador assinado, restaure o botão e aponte para o arquivo novo.

// Endereço do sistema web. Em teste local: NEXT_PUBLIC_APP_URL=http://localhost:4300
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.arqevoncode.com.br";

const recursos = [
  { titulo: "Fixos, avulsos e parcelados", texto: "Salário, aluguel, mercado e a parcela 4 de 12 do cartão entram na mesma lista. As contas do mês se montam sozinhas." },
  { titulo: "Gastos por categoria", texto: "Veja para onde o dinheiro foi: moradia, alimentação, transporte e o que mais você usar." },
  { titulo: "Projeção dos próximos meses", texto: "Fixos, parcelas que ainda vão cair e a média dos gastos variáveis, somados para os próximos 6 meses." },
  { titulo: "Quanto da renda já está comprometido", texto: "Fixos e parcelas somados, em reais e em porcentagem da sua renda." },
  { titulo: "Objetivos com aportes", texto: "Reserva de emergência, viagem ou um notebook novo: acompanhe quanto falta para cada meta." },
  { titulo: "Backup protegido por senha", texto: "Exporte seus dados em um arquivo criptografado e leve para outro computador quando quiser." },
];

const servicos = [
  { titulo: "Sistemas web e painéis", texto: "Cadastros, relatórios, área do cliente e controle interno, acessíveis de qualquer navegador." },
  { titulo: "Aplicativos para computador", texto: "Programas instaláveis para Windows, com ativação por licença e atualizações." },
  { titulo: "Automações e integrações", texto: "Pagamentos, assinaturas, e-mails automáticos e conexão entre os sistemas que você já usa." },
  { titulo: "Segurança desde o início", texto: "Criptografia, backup e adequação à LGPD: o mesmo padrão que usamos no Arqevon Finance." },
];

const passos = [
  { n: "1", titulo: "Crie sua conta", texto: "Só o e-mail. Você recebe um código de acesso, sem senha para decorar." },
  { n: "2", titulo: "Lance o que entra e sai", texto: "Renda, contas fixas, gastos do dia a dia e compras parceladas." },
  { n: "3", titulo: "Decida com clareza", texto: "Saldo do mês, gastos por categoria e a projeção dos próximos meses na mesma tela." },
];

export default function Home() {
  return (
    <main className="lp">
      <div className="lp-topo-marca">
        <span><strong>Arqevon Code</strong> · produtos próprios e software sob encomenda</span>
        <a href="#sob-encomenda">Peça um orçamento →</a>
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
          <a href="#sob-encomenda">Sob encomenda</a>
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
            <a className="lp-botao-sec grande" href="#como-funciona">Ver como funciona</a>
          </div>
          <p className="lp-hero-nota">Grátis para usar. Funciona no navegador, sem instalar nada.</p>
        </div>
        <div className="lp-hero-tela">
          <div className="lp-janela">
            <div className="lp-janela-barra"><i /><i /><i /><span>app.arqevoncode.com.br</span></div>
            <Image src="/produto/visao-geral.png" alt="Tela Visão geral do Arqevon Finance com receitas, despesas, saldo e gastos por categoria" width={2800} height={3320} priority sizes="(max-width: 960px) 100vw, 640px" />
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
            <Image src="/produto/lancamentos.png" alt="Aba Lançamentos com contas fixas, renda e parcelas" width={2800} height={3120} sizes="(max-width: 960px) 100vw, 560px" />
            <figcaption>Lançamentos: fixos, renda e parcelas na mesma lista.</figcaption>
          </figure>
          <figure>
            <Image src="/produto/objetivos.png" alt="Aba Objetivos com barras de progresso" width={2800} height={1240} sizes="(max-width: 960px) 100vw, 560px" />
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
          <li><strong>Sem venda de dados, sem anúncios.</strong> O produto é o app, não você.</li>
          <li><strong>Exporte quando quiser.</strong> Backup protegido em arquivo, para levar seus dados para onde quiser.</li>
        </ul>
      </section>

      <section className="lp-secao" id="planos">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Planos</p>
          <h2>Grátis de verdade. E o Pro está chegando.</h2>
        </div>
        <div className="lp-planos">
          <article>
            <span className="lp-plano-nome">Grátis</span>
            <strong>R$ 0</strong>
            <ul>
              <li>Todas as funções do Finance</li>
              <li>Dados só neste aparelho</li>
              <li>Backup manual em arquivo</li>
            </ul>
            <a className="lp-botao-sec" href={APP_URL}>Começar grátis</a>
          </article>
          <article className="destaque">
            <span className="lp-plano-nome">Pro · em breve</span>
            <strong>Em breve</strong>
            <ul>
              <li>Tudo do Grátis</li>
              <li>Acesso em qualquer aparelho, inclusive celular</li>
              <li>Sincronização automática</li>
              <li>Backup na nuvem com criptografia ponta a ponta</li>
            </ul>
            <a className="lp-botao" href={APP_URL}>Criar conta e ser avisado</a>
          </article>
        </div>
      </section>

      <section className="lp-secao lp-windows" id="download">
        <div>
          <h2>Prefere instalar no computador?</h2>
          <p>O aplicativo para Windows continua disponível para quem já usa ou prefere a versão instalada.</p>
        </div>
        <div className="download-actions">
          <DownloadWindows href={windowsDownloadPath} />
          {/* Sem certificado Developer ID o macOS recusa o download como danificado.
              O botão fica inerte até haver instalador assinado. */}
          <span className="button download indisponivel" role="link" aria-disabled="true">
            <span className="platform-mark" aria-hidden="true">●</span>
            <span><small>MACOS APPLE SILICON</small>Em breve</span>
            <b aria-hidden="true">⏳</b>
          </span>
          <span className="version">Versão 1.0.6 · requer licença</span>
        </div>
      </section>

      <section className="lp-secao lp-encomenda" id="sob-encomenda">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Arqevon Code · sob encomenda</p>
          <h2>Precisa de um sistema sob medida?<br /><span>A gente desenvolve.</span></h2>
          <p className="lp-encomenda-lead">
            O Arqevon Finance é um produto nosso. Além dele, a Arqevon Code desenvolve software sob
            encomenda para empresas e profissionais, com o mesmo cuidado com segurança e privacidade.
          </p>
        </div>
        <div className="lp-encomenda-grade">
          <div>
            <div className="lp-servicos">
              {servicos.map((s) => (
                <article key={s.titulo}><h3>{s.titulo}</h3><p>{s.texto}</p></article>
              ))}
            </div>
            <ol className="lp-encomenda-passos">
              <li><b>1</b> Conte sua ideia no formulário.</li>
              <li><b>2</b> Receba uma proposta com escopo, prazo e valor.</li>
              <li><b>3</b> Acompanhe as entregas até o sistema estar no ar.</li>
            </ol>
          </div>
          <Orcamento />
        </div>
      </section>

      <section className="lp-secao" id="perguntas">
        <div className="lp-titulo"><p className="lp-selo"><i /> Dúvidas</p><h2>Perguntas frequentes.</h2></div>
        <div className="lp-faq">
          <details><summary>Preciso instalar alguma coisa?<span>+</span></summary><p>Não. O Arqevon Finance funciona no navegador, no computador ou no celular. Se preferir, existe também o aplicativo para Windows.</p></details>
          <details><summary>O plano grátis tem limite de tempo?<span>+</span></summary><p>Não. No Grátis você usa todas as funções, com os dados guardados só no aparelho que estiver usando.</p></details>
          <details><summary>A Arqevon consegue ver minhas finanças?<span>+</span></summary><p>Não. No plano grátis os lançamentos ficam só no seu aparelho e nunca são enviados para nós.</p></details>
          <details><summary>E se eu esquecer a senha da criptografia?<span>+</span></summary><p>A senha nunca sai do seu aparelho, então ninguém consegue recuperá-la, nem a gente. Guarde-a bem e faça backups. Sem criptografia ativada, não há senha a esquecer.</p></details>
          <details><summary>O que vai ter no Pro?<span>+</span></summary><p>Acesso em qualquer aparelho, inclusive no celular, com sincronização automática e backup na nuvem criptografado de ponta a ponta. Quem criar a conta agora será avisado no lançamento.</p></details>
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
        <p>Arqevon Finance é um produto da Arqevon Code, que também desenvolve <a href="#sob-encomenda">software sob encomenda</a>.</p>
        <nav className="lp-rodape-links" aria-label="Documentos legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/privacidade">Política de Privacidade</a>
        </nav>
        <small>© {new Date().getFullYear()} Arqevon Code.</small>
      </footer>
    </main>
  );
}
