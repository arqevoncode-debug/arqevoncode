import Image from "next/image";
import Link from "next/link";
import Orcamento from "./orcamento";
import "./landing.css";
import "./home.css";

// Página da empresa: a Arqevon Code é uma fábrica de software. O foco é captar projetos sob
// encomenda; os produtos próprios (como o Arqevon Finance) aparecem depois, como parte do portfólio.
// Não citar clientes, números ou depoimentos que não existam.

const FINANCE_APP = "https://app.arqevoncode.com.br";

const servicos = [
  { titulo: "Sistemas web e painéis", texto: "Cadastros, controle interno, relatórios e área do cliente, acessíveis de qualquer navegador." },
  { titulo: "Plataformas com assinatura", texto: "Sistemas com login, planos e cobrança recorrente, prontos para vender como serviço." },
  { titulo: "Aplicativos para computador", texto: "Programas instaláveis para Windows, com ativação por licença e atualizações." },
  { titulo: "Automações", texto: "Tarefas repetitivas feitas pelo sistema: lembretes, cobranças, relatórios e e-mails automáticos." },
  { titulo: "Integrações", texto: "Conexão entre os sistemas que você já usa: pagamentos, e-mail, planilhas e APIs de terceiros." },
  { titulo: "Sites e páginas", texto: "Site institucional e páginas de captação, rápidos e fáceis de atualizar." },
];

const etapas = [
  { n: "01", titulo: "Conversa", texto: "Entendemos o problema, quem vai usar e como o processo funciona hoje." },
  { n: "02", titulo: "Proposta", texto: "Você recebe por escrito o escopo, o prazo e o valor antes de qualquer desenvolvimento." },
  { n: "03", titulo: "Desenvolvimento", texto: "Entregas por etapa: você testa, valida e acompanha a evolução do sistema." },
  { n: "04", titulo: "No ar", texto: "Publicamos o sistema e acompanhamos o começo do uso com a sua equipe." },
];

const motivos = [
  { titulo: "Feito para o seu processo", texto: "O sistema se adapta à sua empresa, e não o contrário. Nada de encaixar o negócio num software genérico." },
  { titulo: "Preço e prazo claros", texto: "Escopo, prazo e valor combinados antes de começar, sem surpresa no meio do caminho." },
  { titulo: "Você fala com quem desenvolve", texto: "Comunicação direta com quem constrói o sistema, sem intermediários." },
  { titulo: "Experiência de produto", texto: "Também criamos e mantemos produtos próprios no ar, com login, sincronização e pagamento recorrente." },
];

export default function Home() {
  return (
    <main className="lp">
      <header className="lp-header">
        <a className="lp-marca" href="#inicio" aria-label="Arqevon Code — início">
          <Image src="/simbolo-arqevon.svg" alt="" width={36} height={36} />
          <span><strong>Arqevon</strong> Code</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#servicos">Serviços</a>
          <a href="#como-trabalhamos">Como trabalhamos</a>
          <a href="#produtos">Produtos</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className="lp-header-acoes">
          <a className="lp-botao" href="#sob-encomenda">Pedir orçamento</a>
        </div>
      </header>

      <section className="lp-hero hm-hero" id="inicio">
        <div className="lp-hero-texto">
          <p className="lp-selo"><i /> Fábrica de software</p>
          <h1>Software sob medida{" "}<br /><span>para o seu negócio.</span></h1>
          <p className="lp-lead">
            A Arqevon Code desenvolve sistemas web, aplicativos, automações e integrações do jeito
            que a sua empresa funciona. Você conta o que precisa; a gente projeta, desenvolve e
            coloca no ar.
          </p>
          <div className="lp-hero-acoes">
            <a className="lp-botao grande" href="#sob-encomenda">Pedir orçamento</a>
            <a className="lp-botao-sec grande" href="#servicos">Ver o que fazemos</a>
          </div>
          <p className="lp-hero-nota">Orçamento sem compromisso.</p>
        </div>
        {/* Ilustração genérica de um sistema em módulos: não representa nenhum cliente. */}
        <div className="hm-diagrama" aria-hidden="true">
          <div className="hm-janela">
            <div className="lp-janela-barra"><i /><i /><i /><span>seu-sistema</span></div>
            <div className="hm-modulos">
              <div className="hm-modulo destaque"><b>Painel</b><span>indicadores do dia</span></div>
              <div className="hm-modulo"><b>Cadastros</b><span>clientes e produtos</span></div>
              <div className="hm-modulo"><b>Pedidos</b><span>do orçamento à entrega</span></div>
              <div className="hm-modulo"><b>Pagamentos</b><span>Pix, cartão, recorrência</span></div>
              <div className="hm-modulo"><b>Relatórios</b><span>exportação e gráficos</span></div>
              <div className="hm-modulo"><b>Automações</b><span>lembretes e e-mails</span></div>
              <div className="hm-modulo"><b>Integrações</b><span>APIs e outros sistemas</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-faixa" aria-label="Destaques">
        <div><strong>Sob medida</strong><span>feito para o seu processo</span></div>
        <div><strong>Proposta clara</strong><span>escopo, prazo e valor</span></div>
        <div><strong>Entregas por etapa</strong><span>você acompanha tudo</span></div>
        <div><strong>Do zero ou evolução</strong><span>sistema novo ou melhoria</span></div>
      </section>

      <section className="lp-secao" id="servicos">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Serviços</p>
          <h2>Do controle interno<br />ao <span>sistema completo.</span></h2>
        </div>
        <div className="lp-recursos">
          {servicos.map((s) => (
            <article key={s.titulo}><h3>{s.titulo}</h3><p>{s.texto}</p></article>
          ))}
        </div>
      </section>

      <section className="lp-secao" id="como-trabalhamos">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Como trabalhamos</p>
          <h2>Da ideia ao sistema no ar,<br /><span>sem surpresas.</span></h2>
        </div>
        <ol className="hm-etapas">
          {etapas.map((e) => (
            <li key={e.n}><span>{e.n}</span><h3>{e.titulo}</h3><p>{e.texto}</p></li>
          ))}
        </ol>
      </section>

      <section className="lp-secao lp-privacidade hm-motivos">
        <div>
          <p className="lp-selo"><i /> Por que a Arqevon</p>
          <h2>Tecnologia a serviço<br /><span>do seu negócio.</span></h2>
        </div>
        <ul>
          {motivos.map((m) => (
            <li key={m.titulo}><strong>{m.titulo}.</strong> {m.texto}</li>
          ))}
        </ul>
      </section>

      <section className="lp-secao" id="produtos">
        <div className="lp-titulo" id="projetos">
          <p className="lp-selo"><i /> Produtos prontos</p>
          <h2>Também temos<br /><span>sistemas prontos para usar.</span></h2>
        </div>
        <article className="hm-produto">
          <div className="hm-produto-texto">
            <span className="hm-produto-tag">Finanças pessoais</span>
            <h3>Arqevon Finance</h3>
            <p>
              Organiza receitas, contas fixas e parcelas do cartão e mostra quanto sobra e como ficam
              os próximos meses. Grátis no navegador, com plano Pro para sincronizar entre aparelhos.
            </p>
            <div className="hm-produto-acoes">
              <Link className="lp-botao-sec" href="/finance">Conhecer o Finance</Link>
              <a className="hm-link" href={FINANCE_APP}>Usar grátis →</a>
            </div>
          </div>
          <div className="hm-produto-tela">
            <Image src="/produto/visao-geral.png" alt="Tela do Arqevon Finance com receitas, despesas e gastos por categoria" width={2800} height={3320} sizes="(max-width: 960px) 100vw, 520px" />
          </div>
        </article>
      </section>

      <section className="lp-secao lp-encomenda" id="sob-encomenda">
        <div className="lp-titulo">
          <p className="lp-selo"><i /> Orçamento</p>
          <h2>Conte sua ideia.<br /><span>O orçamento é sem compromisso.</span></h2>
          <p className="lp-encomenda-lead">
            Descreva o que você precisa. Respondemos com as próximas perguntas ou já com uma proposta
            de escopo, prazo e valor.
          </p>
        </div>
        <div className="lp-encomenda-grade">
          <ol className="lp-encomenda-passos hm-passos-orcamento">
            <li><b>1</b> Conte sua ideia no formulário.</li>
            <li><b>2</b> Receba uma proposta com escopo, prazo e valor.</li>
            <li><b>3</b> Acompanhe as entregas até o sistema estar no ar.</li>
          </ol>
          <Orcamento />
        </div>
      </section>

      <section className="lp-secao" id="duvidas">
        <div className="lp-titulo"><p className="lp-selo"><i /> Dúvidas</p><h2>Perguntas frequentes.</h2></div>
        <div className="lp-faq">
          <details><summary>Quanto custa um sistema?<span>+</span></summary><p>Depende do que ele precisa fazer: telas e funções, integrações, número de usuários e prazo. Por isso o valor vem na proposta, depois de entendermos o projeto, e é combinado antes de começar.</p></details>
          <details><summary>Quanto tempo leva?<span>+</span></summary><p>Também depende do escopo. Uma automação pontual é bem mais rápida que um sistema completo. O prazo vem por escrito na proposta, junto com as etapas de entrega.</p></details>
          <details><summary>Preciso entender de tecnologia?<span>+</span></summary><p>Não. Você explica como o seu negócio funciona e o que quer resolver; a parte técnica é com a gente.</p></details>
          <details><summary>Vocês fazem só sistemas grandes?<span>+</span></summary><p>Não. Fazemos desde uma automação ou integração pontual até um sistema completo, e também melhoramos sistemas que já existem.</p></details>
          <details><summary>Como peço um orçamento?<span>+</span></summary><p>Pelo formulário acima ou pelo e-mail contato@arqevoncode.com.br. Não há custo nem compromisso para receber a proposta.</p></details>
        </div>
      </section>

      <section className="lp-final">
        <h2>Tem um processo que poderia ser um sistema?<br /><span>Vamos construir juntos.</span></h2>
        <a className="lp-botao grande" href="#sob-encomenda">Pedir orçamento</a>
      </section>

      <footer className="lp-rodape">
        <a className="lp-marca" href="#inicio">
          <Image src="/simbolo-arqevon.svg" alt="" width={30} height={30} />
          <span><strong>Arqevon</strong> Code</span>
        </a>
        <p>Fábrica de software sob medida. Produtos: <Link href="/finance">Arqevon Finance</Link>.</p>
        <nav className="lp-rodape-links" aria-label="Documentos legais">
          <a href="/termos">Termos de Uso</a>
          <a href="/privacidade">Política de Privacidade</a>
          <a href="mailto:contato@arqevoncode.com.br">contato@arqevoncode.com.br</a>
        </nav>
        <small>© {new Date().getFullYear()} Arqevon Code.</small>
      </footer>
    </main>
  );
}
