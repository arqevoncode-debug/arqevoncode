import Image from "next/image";

const windowsDownloadPath =
  "/downloads/Arqevon-Finance-1.0.6-Windows-x64-Setup.exe";
// O .dmg da 1.0.6 continua hospedado em /downloads para links já enviados, mas não é
// oferecido na página: sem certificado Developer ID o macOS o recusa como danificado.
// Ao publicar um instalador assinado, restaure o botão e aponte para o arquivo novo.

const financeFeatures = [
  "Receitas, despesas e parcelas em um só lugar",
  "Projeções e objetivos financeiros",
  "Dados armazenados no próprio dispositivo",
  "Backup protegido para levar seus dados",
];

const principles = [
  {
    number: "01",
    title: "Direto ao ponto",
    text: "Interfaces claras, poucos passos e recursos que resolvem problemas reais.",
  },
  {
    number: "02",
    title: "Privacidade primeiro",
    text: "Quando o produto permite, seus dados permanecem no seu dispositivo.",
  },
  {
    number: "03",
    title: "Feito para evoluir",
    text: "Produtos independentes, atualizáveis e preparados para crescer com você.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#inicio" aria-label="Arqevon Code — início">
          <Image src="/simbolo-arqevon.svg" alt="" width={48} height={48} />
          <span>
            <strong>ARQEVON</strong>
            <em>CODE</em>
          </span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#projetos">Projetos</a>
          <a href="#diferenciais">Como construímos</a>
          <a href="#sobre">Sobre</a>
        </nav>
        <a className="header-cta" href="#finance">
          Conhecer produtos <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="hero" id="inicio">
        <div className="hero-copy">
          <p className="eyebrow"><span /> SOFTWARE PRÁTICO. IMPACTO REAL.</p>
          <h1>
            Sistemas construídos
            <br /> para <span>evoluir.</span>
          </h1>
          <p className="hero-lead">
            Criamos produtos digitais próprios para transformar tarefas complexas
            em experiências simples, seguras e agradáveis de usar.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#projetos">
              Explorar projetos <span aria-hidden="true">↓</span>
            </a>
            <a
              className="button secondary"
              href="#finance"
            >
              Ver Arqevon Finance <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-notes" aria-label="Características da Arqevon Code">
            <span>Produtos próprios</span>
            <span>Experiência simples</span>
            <span>Suporte próximo</span>
          </div>
        </div>

        <div className="hero-system" aria-label="Ecossistema de produtos Arqevon Code">
          <div className="system-orbit orbit-one" />
          <div className="system-orbit orbit-two" />
          <div className="system-label label-top">ECOSSISTEMA ARQEVON</div>
          <div className="system-card card-finance">
            <span className="system-index">01</span>
            <div className="finance-glyph" aria-hidden="true">
              <i /><i /><i />
            </div>
            <div><strong>Finance</strong><small>Controle financeiro</small></div>
          </div>
          <div className="system-card card-license">
            <span className="system-index">02</span>
            <div className="license-glyph" aria-hidden="true">◇</div>
            <div><strong>Licenças</strong><small>Ativação segura</small></div>
          </div>
          <div className="system-card card-next">
            <span className="system-index">03</span>
            <div className="next-glyph" aria-hidden="true">+</div>
            <div><strong>Próximo sistema</strong><small>Em desenvolvimento</small></div>
          </div>
          <div className="system-core">
            <Image src="/simbolo-arqevon.svg" alt="" width={96} height={96} />
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Compromissos dos produtos">
        <div><strong>LOCAL</strong><span>Dados no seu dispositivo</span></div>
        <div><strong>SEGURO</strong><span>Licenças por computador</span></div>
        <div><strong>PORTÁTIL</strong><span>Backup para levar seus dados</span></div>
        <div><strong>EVOLUTIVO</strong><span>Atualizações constantes</span></div>
      </section>

      <section className="projects section" id="projetos">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> NOSSOS PROJETOS</p>
            <h2>Software que sai da ideia<br />e chega até você.</h2>
          </div>
          <p>
            Cada produto Arqevon nasce para resolver uma necessidade específica,
            com foco em autonomia e facilidade de uso.
          </p>
        </div>

        <article className="featured-product" id="finance">
          <div className="product-copy">
            <div className="product-topline">
              <span className="product-number">PRODUTO 01</span>
              <span className="available"><i /> DISPONÍVEL</span>
            </div>
            <div className="product-brand">
              <div className="product-icon">
                <span /><span /><span />
              </div>
              <div><h3>Arqevon Finance</h3><p>Gestão financeira pessoal</p></div>
            </div>
            <h4>Clareza para decidir.<br />Controle para evoluir.</h4>
            <p className="product-description">
              Um aplicativo instalável para organizar sua vida financeira sem
              planilhas complicadas e sem entregar seus dados a uma plataforma online.
            </p>
            <ul>
              {financeFeatures.map((feature) => (
                <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>
              ))}
            </ul>
            <div className="download-actions">
              <a className="button primary download" href={windowsDownloadPath} download>
                <span className="platform-mark windows-mark" aria-hidden="true">⊞</span>
                <span><small>BAIXAR PARA</small>Windows 10/11 · 64 bits</span>
                <b aria-hidden="true">↓</b>
              </a>
              {/* Sem certificado Developer ID o macOS recusa o download como danificado.
                  O botão fica inerte até haver instalador assinado. */}
              <span className="button download indisponivel" role="link" aria-disabled="true">
                <span className="platform-mark" aria-hidden="true">●</span>
                <span><small>MACOS APPLE SILICON</small>Em breve</span>
                <b aria-hidden="true">⏳</b>
              </span>
              <span className="version">Versão 1.0.6 · requer licença · versão para macOS em preparação</span>
            </div>
          </div>

          <div className="product-preview" aria-label="Prévia do painel Arqevon Finance">
            <div className="preview-window">
              <div className="preview-toolbar">
                <div className="mini-brand"><span /> Arqevon Finance</div>
                <div className="window-pills"><i /><i /></div>
              </div>
              <div className="preview-tabs"><b>Visão geral</b><span>Lançamentos</span><span>Objetivos</span></div>
              <div className="preview-kpis">
                <div><small>RECEITAS</small><strong className="mint">R$ 5.800</strong></div>
                <div><small>DESPESAS</small><strong>R$ 3.460</strong></div>
                <div><small>SALDO DO MÊS</small><strong className="blue">R$ 2.340</strong></div>
              </div>
              <div className="preview-grid">
                <div className="category-card">
                  <div><b>Gastos por categoria</b><span>Este mês</span></div>
                  <div className="donut"><span><small>TOTAL</small>R$ 3.460</span></div>
                  <div className="legend"><i />Moradia <i />Alimentação <i />Outros</div>
                </div>
                <div className="bars-card">
                  <div><b>Últimos 6 meses</b><span>Evolução das despesas</span></div>
                  <div className="bars"><i /><i /><i /><i /><i /><i /></div>
                  <div className="months"><span>Fev</span><span>Mar</span><span>Abr</span><span>Mai</span><span>Jun</span><span>Jul</span></div>
                </div>
              </div>
            </div>
            <div className="preview-tag tag-private"><i /> DADOS LOCAIS</div>
            <div className="preview-tag tag-backup"><i /> BACKUP PROTEGIDO</div>
          </div>
        </article>

        <div className="project-grid">
          <article className="project-card">
            <div className="project-card-top"><span>INFRAESTRUTURA</span><b>02</b></div>
            <div className="project-symbol license-symbol">◇</div>
            <h3>Arqevon Licenças</h3>
            <p>
              A tecnologia que ativa nossos produtos por dispositivo, permite
              planos flexíveis e valida o acesso com segurança.
            </p>
            <span className="project-status"><i /> EM OPERAÇÃO</span>
          </article>
          <article className="project-card upcoming">
            <div className="project-card-top"><span>PRÓXIMOS PRODUTOS</span><b>03+</b></div>
            <div className="project-symbol">+</div>
            <h3>Uma família de sistemas</h3>
            <p>
              Novas soluções estão sendo desenhadas para rotina, organização e
              gestão de pequenos negócios.
            </p>
            <a href="#projetos">
              Conhecer projetos <span aria-hidden="true">↗</span>
            </a>
          </article>
        </div>
      </section>

      <section className="principles section" id="diferenciais">
        <div className="section-heading compact">
          <div><p className="eyebrow"><span /> NOSSO JEITO DE CONSTRUIR</p><h2>Tecnologia com menos atrito.</h2></div>
        </div>
        <div className="principle-grid">
          {principles.map((principle) => (
            <article key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="about section" id="sobre">
        <div className="about-mark"><Image src="/simbolo-arqevon.svg" alt="" width={180} height={180} /></div>
        <div>
          <p className="eyebrow"><span /> SOBRE A ARQEVON CODE</p>
          <h2>Arquitetura para criar.<br />Evolução para continuar.</h2>
          <p>
            Arqevon reúne arquitetura, evolução e tecnologia sempre ativa. Somos
            uma marca brasileira criando uma família de produtos digitais próprios,
            pensados para funcionar de verdade no dia a dia.
          </p>
          <a href="#projetos">
            Conheça nossos projetos <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="faq section">
        <div className="section-heading compact">
          <div><p className="eyebrow"><span /> PERGUNTAS FREQUENTES</p><h2>Antes de baixar.</h2></div>
        </div>
        <div className="faq-list">
          <details><summary>O Arqevon Finance funciona sem internet?<span>+</span></summary><p>Sim. A internet é necessária para ativar e validar periodicamente a licença. O uso financeiro acontece no seu computador, com tolerância offline.</p></details>
          <details><summary>Onde meus dados ficam armazenados?<span>+</span></summary><p>Os dados ficam localmente no dispositivo. Você pode criar backups protegidos e importá-los em outro computador.</p></details>
          <details><summary>Preciso de uma licença para abrir o aplicativo?<span>+</span></summary><p>Sim. Depois da compra, você recebe uma chave vinculada à quantidade de dispositivos do seu plano.</p></details>
          <details><summary>Existe versão para Windows?<span>+</span></summary><p>Sim. O instalador está disponível para Windows 10 e 11 de 64 bits e prepara automaticamente o componente WebView2 necessário para abrir o aplicativo.</p></details>
        </div>
      </section>

      <section className="final-cta section">
        <div>
          <p className="eyebrow"><span /> O PRÓXIMO PASSO É SIMPLES</p>
          <h2>Conheça o primeiro<br />produto Arqevon.</h2>
        </div>
        <div>
          <p>Baixe o Arqevon Finance ou acompanhe os próximos lançamentos da nossa família de sistemas.</p>
          <a className="button primary" href="#finance">Ver Arqevon Finance <span aria-hidden="true">↑</span></a>
        </div>
      </section>

      <footer>
        <a className="brand" href="#inicio">
          <Image src="/simbolo-arqevon.svg" alt="" width={48} height={48} />
          <span><strong>ARQEVON</strong><em>CODE</em></span>
        </a>
        <p>Sistemas construídos para evoluir.</p>
        <div><a href="#projetos">Projetos</a><a href="#sobre">Sobre</a></div>
        <small>© {new Date().getFullYear()} Arqevon Code.</small>
      </footer>
    </main>
  );
}
