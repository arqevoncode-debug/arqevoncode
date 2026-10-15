import type { Metadata } from "next";
import LegalLayout, { CONTATO } from "../legal-layout";

export const metadata: Metadata = {
  title: "Como protegemos seus dados — Arqevon Finance",
  description: "Seus lançamentos são cifrados no seu aparelho antes de irem para a nuvem, e a chave fica separada do banco de dados. Veja como a proteção funciona.",
  // sem isto a página herda canonical e og:url da página inicial e some das buscas
  alternates: { canonical: "/seguranca" },
  openGraph: { url: "/seguranca", siteName: "Arqevon Finance", title: "Como protegemos seus dados — Arqevon Finance", description: "Seus lançamentos são cifrados no seu aparelho antes de irem para a nuvem, e a chave fica separada do banco de dados. Veja como a proteção funciona.", images: [{ url: "/og-finance.png", width: 1200, height: 630 }] },
};

// Cada afirmação daqui foi conferida no código (apps/web/src/cofre.js, apps/web/src/motor.html,
// vercel.json) e no banco. Ao mudar a criptografia, os algoritmos ou o que o servidor guarda,
// atualize esta página e a Política de Privacidade juntas.
export default function Seguranca() {
  return (
    <LegalLayout titulo="Como protegemos seus dados">
      <p className="legal-resumo">
        <strong>Em resumo:</strong> seus lançamentos são cifrados no seu aparelho antes de irem para a
        nuvem, e o banco de dados guarda só o conteúdo cifrado. Para você abrir os dados em qualquer
        aparelho só entrando com o seu e-mail, a chave fica guardada por nós, separada do banco e
        protegida por uma chave mestra.
      </p>

      <h2>Sem conta ou no plano grátis</h2>
      <p>
        Os lançamentos ficam guardados no seu navegador ou computador e <strong>não são enviados</strong>{" "}
        para nós. Se quiser, ligue a criptografia local em <em>Dados e segurança</em>: os dados passam a
        ser guardados cifrados com AES-256-GCM, com uma chave derivada da sua senha (PBKDF2-SHA256,
        150 mil iterações), e o app pede a senha ao abrir.
      </p>

      <h2>Na nuvem (plano Pro)</h2>
      <ul>
        <li><strong>Cifrado antes de sair do aparelho.</strong> Cada lançamento, conta fixa, parcela, objetivo e limite é cifrado no seu aparelho com AES-256-GCM. O servidor recebe e guarda apenas o resultado cifrado.</li>
        <li><strong>Acesso só pelo e-mail.</strong> Em um aparelho novo, basta entrar com o código enviado ao seu e-mail: o app recebe a chave dos dados e abre tudo.</li>
        <li><strong>Chave separada do banco.</strong> A chave dos dados é aleatória e criada no seu aparelho. Nós a guardamos cifrada (AES-256-GCM) com uma chave mestra que fica só no servidor que entrega a chave, nunca no banco de dados nem nas cópias de segurança. Quem tivesse acesso só ao banco veria apenas conteúdo cifrado.</li>
        <li><strong>Entregue só a quem entra na conta.</strong> O servidor confere o login antes de entregar a chave. Proteja o seu e-mail: quem entra nele consegue entrar na sua conta.</li>
        <li><strong>Nem o tipo do registro aparece.</strong> Cada registro na nuvem tem um identificador opaco (HMAC-SHA256): o banco não sabe se é uma despesa, uma receita ou um objetivo.</li>
      </ul>

      <h2>O que nós vemos</h2>
      <ul>
        <li>O e-mail da conta e as datas de cadastro e de acesso.</li>
        <li>A situação do plano: teste grátis, assinatura e datas do período.</li>
        <li>Sobre a nuvem, no dia a dia, só dados técnicos: quantos registros cifrados existem, o tamanho deles e quando foram alterados.</li>
      </ul>
      <p>
        Como guardamos a chave, temos meios técnicos de abrir os dados da nuvem. Não fazemos isso: não
        lemos seus valores, descrições ou categorias, e só usaríamos esse acesso se a lei obrigar. Os
        detalhes estão na <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>No app</h2>
      <ul>
        <li><strong>Sem scripts de terceiros.</strong> O app não carrega pixel de anúncio, ferramenta de análise ou chat de outras empresas, e uma política de segurança de conteúdo (CSP) rígida impede o navegador de carregar código de outros endereços.</li>
        <li><strong>Extrato lido no aparelho.</strong> O arquivo OFX ou CSV do banco é lido pelo próprio app e não é enviado para nós.</li>
        <li><strong>Entrada sem senha de conta.</strong> Você entra com um código de 6 dígitos enviado ao seu e-mail, então não existe uma senha de conta para vazar ou ser reaproveitada.</li>
        <li><strong>Pagamento fora daqui.</strong> O pagamento é processado pela Kiwify. Os dados do cartão não passam pela Arqevon.</li>
      </ul>

      <h2>Cópias de segurança do servidor</h2>
      <p>
        O banco de dados tem cópias diárias, cifradas, descartadas automaticamente em até 90 dias. Como
        os seus lançamentos já estão cifrados com a sua chave, as cópias também não permitem lê-los.
      </p>

      <h2>Encontrou um problema?</h2>
      <p>
        Se encontrar uma falha de segurança, escreva para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
        Respondemos e corrigimos o quanto antes.
      </p>
    </LegalLayout>
  );
}
