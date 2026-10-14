import type { Metadata } from "next";
import LegalLayout, { CONTATO } from "../legal-layout";

export const metadata: Metadata = {
  title: "Como protegemos seus dados — Arqevon Finance",
  description: "Seus lançamentos são cifrados no seu aparelho antes de irem para a nuvem. Veja o que a Arqevon vê, o que não vê e como a proteção funciona.",
};

// Cada afirmação daqui foi conferida no código (apps/web/src/cofre.js, meu-financeiro.html,
// vercel.json) e no banco. Ao mudar a criptografia, os algoritmos ou o que o servidor guarda,
// atualize esta página e a Política de Privacidade juntas.
export default function Seguranca() {
  return (
    <LegalLayout titulo="Como protegemos seus dados">
      <p className="legal-resumo">
        <strong>Em resumo:</strong> seus lançamentos são cifrados no seu aparelho antes de irem para a
        nuvem. Nós guardamos só o conteúdo cifrado e não temos a chave: nem a Arqevon consegue ver
        seus valores, descrições ou categorias.
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
        <li><strong>A chave é sua.</strong> Os dados são cifrados com uma chave aleatória criada no seu aparelho. Ela fica guardada na nuvem protegida duas vezes: pela sua <strong>senha da nuvem</strong> (PBKDF2-SHA256, 600 mil iterações) e pela <strong>chave de recuperação</strong> (160 bits) que você anota ao ativar a nuvem.</li>
        <li><strong>A senha da nuvem nunca é enviada.</strong> Ela é usada só no seu aparelho para abrir a chave dos dados.</li>
        <li><strong>Nem o tipo do registro aparece.</strong> Cada registro na nuvem tem um identificador opaco (HMAC-SHA256): o servidor não sabe se é uma despesa, uma receita ou um objetivo.</li>
        <li><strong>Sem a senha e sem a chave de recuperação, ninguém recupera os dados</strong>, nem nós. É o preço da privacidade: guarde a chave de recuperação em lugar seguro.</li>
      </ul>

      <h2>O que nós vemos</h2>
      <ul>
        <li>O e-mail da conta e as datas de cadastro e de acesso.</li>
        <li>A situação do plano: teste grátis, assinatura e datas do período.</li>
        <li>Sobre a nuvem, só dados técnicos: quantos registros cifrados existem, o tamanho deles e quando foram alterados.</li>
      </ul>
      <p>
        <strong>Nunca</strong> vemos valores, descrições, categorias, datas dos lançamentos ou nomes dos
        objetivos. Os detalhes estão na <a href="/privacidade">Política de Privacidade</a>.
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
