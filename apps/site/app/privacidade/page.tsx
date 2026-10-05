import type { Metadata } from "next";
import LegalLayout, { CONTATO } from "../legal-layout";

export const metadata: Metadata = {
  title: "Política de Privacidade — Arqevon Finance",
  description: "Quais dados o Arqevon Finance trata, por quê, com quem compartilha e como exercer seus direitos pela LGPD.",
};

// Ao mudar o que o sistema coleta, guarda ou compartilha (novo fornecedor, novo campo, outra
// retenção), atualize esta página e ATUALIZADO_EM no mesmo PR.
export default function Privacidade() {
  return (
    <LegalLayout titulo="Política de Privacidade">
      <p className="legal-resumo">
        <strong>Em resumo:</strong> no plano grátis, seus lançamentos ficam só no seu aparelho e nós
        não os recebemos. No plano Pro, eles vão para a nuvem cifrados de ponta a ponta: são
        embaralhados no seu aparelho antes de sair dele, e nós não temos a chave para lê-los. Não
        vendemos dados, não usamos seus dados para publicidade e não usamos cookies de rastreamento.
      </p>

      <h2>1. Quem somos</h2>
      <p>
        O Arqevon Finance é um produto da <strong>Arqevon Code</strong>, que é a controladora dos
        dados pessoais tratados no serviço, nos termos da Lei Geral de Proteção de Dados (Lei nº
        13.709/2018, a &quot;LGPD&quot;). Para qualquer assunto de privacidade, inclusive para falar
        com o encarregado pelo tratamento de dados, escreva para{" "}
        <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
      </p>

      <h2>2. Quais dados tratamos e por quê</h2>
      <div className="legal-tabela">
        <table>
          <thead>
            <tr><th>Dado</th><th>Para quê</th><th>Base legal (LGPD)</th></tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>E-mail da conta</strong> e dados técnicos da sessão (data, hora e endereço IP)</td>
              <td>Criar a conta, enviar o código de acesso, manter a sessão segura e avisar sobre a conta ou a assinatura</td>
              <td>Execução de contrato (art. 7º, V); legítimo interesse na segurança da conta (art. 7º, IX)</td>
            </tr>
            <tr>
              <td><strong>Dados financeiros na nuvem</strong> (plano Pro), sempre cifrados, e metadados técnicos: quantidade e tamanho dos registros e datas de alteração</td>
              <td>Sincronizar seus dados entre os seus aparelhos</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td><strong>Assinatura:</strong> plano, situação, datas do período e o identificador da compra na plataforma de pagamento</td>
              <td>Liberar o plano Pro, renovar, cancelar e reembolsar</td>
              <td>Execução de contrato (art. 7º, V); obrigação legal (art. 7º, II)</td>
            </tr>
            <tr>
              <td><strong>Pedido de licença do app para Windows:</strong> e-mail, nome (se informado) e um código derivado do endereço IP</td>
              <td>Enviar a licença e evitar abuso do formulário</td>
              <td>Procedimentos preliminares a contrato (art. 7º, V); legítimo interesse na prevenção de abuso (art. 7º, IX)</td>
            </tr>
            <tr>
              <td><strong>Licença do app para Windows:</strong> nome e e-mail do cliente, identificador, nome e sistema do dispositivo, versão do app</td>
              <td>Validar a licença e respeitar o limite de dispositivos do plano</td>
              <td>Execução de contrato (art. 7º, V)</td>
            </tr>
            <tr>
              <td><strong>Pedido de orçamento</strong> (software sob encomenda): nome, e-mail, telefone e empresa (se informados), tipo de projeto, faixa de orçamento, descrição e um código derivado do endereço IP</td>
              <td>Responder ao pedido e preparar a proposta, e evitar abuso do formulário</td>
              <td>Procedimentos preliminares a contrato, a seu pedido (art. 7º, V); legítimo interesse na prevenção de abuso (art. 7º, IX)</td>
            </tr>
            <tr>
              <td><strong>Mensagens de feedback</strong> enviadas pelo app</td>
              <td>Responder e melhorar o produto</td>
              <td>Legítimo interesse (art. 7º, IX)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>O que nós não recebemos:</strong> seus lançamentos no plano grátis, o conteúdo dos
        seus dados na nuvem, sua senha da nuvem, sua chave de recuperação e os dados do seu cartão.
        O pagamento é processado pela Kiwify. Não armazenamos seu CPF nem os dados de pagamento.
      </p>

      <h2>3. Como a criptografia protege seus dados</h2>
      <p>
        No plano Pro, cada registro é cifrado no seu aparelho com AES-256-GCM, usando uma chave que
        só abre com a sua <strong>senha da nuvem</strong> ou com a sua <strong>chave de
        recuperação</strong>. Nós guardamos apenas o conteúdo cifrado. Por isso, se você perder a
        senha da nuvem e a chave de recuperação, nem nós conseguimos recuperar esses dados. A
        comunicação com nossos servidores usa conexão segura (HTTPS).
      </p>

      <h2>4. Armazenamento no seu aparelho e cookies</h2>
      <p>
        O app guarda no armazenamento local do navegador (ou do app para Windows) os seus
        lançamentos, as suas preferências e a sessão da conta. Não usamos cookies de publicidade,
        pixels de rastreamento nem ferramentas de análise de comportamento. O app web carrega fontes
        tipográficas do Google Fonts, e por isso o Google recebe o endereço IP do seu aparelho ao
        carregar a página.
      </p>

      <h2>5. Com quem compartilhamos</h2>
      <p>Usamos fornecedores que tratam dados em nosso nome, só para fazer o serviço funcionar:</p>
      <ul>
        <li><strong>Supabase</strong>: banco de dados e login. Servidores em São Paulo (Brasil).</li>
        <li><strong>Vercel</strong>: hospedagem do site, do app web e da API.</li>
        <li><strong>Resend</strong>: envio dos e-mails com o código de acesso.</li>
        <li><strong>Kiwify</strong>: pagamento das assinaturas. A Kiwify trata os dados de pagamento como controladora, conforme a política de privacidade dela.</li>
        <li><strong>GitHub</strong>: guarda as cópias de segurança do banco de dados, cifradas.</li>
        <li><strong>Google Fonts</strong>: fontes tipográficas do app web.</li>
      </ul>
      <p>
        Também podemos compartilhar dados quando a lei ou uma ordem de autoridade competente exigir.
        Fora isso, não vendemos, alugamos nem cedemos dados pessoais a ninguém.
      </p>

      <h2>6. Transferência internacional</h2>
      <p>
        Alguns desses fornecedores (Vercel, GitHub e Google) mantêm servidores fora do Brasil,
        principalmente nos Estados Unidos. Essas transferências ocorrem para executar o contrato com
        você (LGPD, art. 33, V) e com as garantias contratuais de proteção de dados oferecidas por
        esses fornecedores.
      </p>

      <h2>7. Por quanto tempo guardamos</h2>
      <ul>
        <li><strong>Conta e dados na nuvem:</strong> enquanto a conta existir. Se você pedir a exclusão, apagamos em até 15 dias.</li>
        <li><strong>Cópias de segurança:</strong> são diárias, cifradas e descartadas automaticamente em até 90 dias. Um dado apagado da conta some das cópias nesse prazo.</li>
        <li><strong>Dados técnicos da sessão:</strong> enquanto a sessão estiver ativa. Os registros técnicos dos fornecedores de hospedagem são mantidos por poucos dias, conforme a política de cada um.</li>
        <li><strong>Registros de pagamento e assinatura:</strong> pelo prazo exigido pela legislação fiscal e de defesa do consumidor (até 5 anos).</li>
        <li><strong>Pedidos de licença:</strong> até 12 meses depois do atendimento.</li>
        <li><strong>Pedidos de orçamento:</strong> até 12 meses depois da resposta, ou durante o contrato, se o projeto for fechado.</li>
      </ul>
      <p>
        Cancelar a assinatura <strong>não</strong> apaga seus dados da nuvem: você continua podendo
        baixá-los. Eles só são apagados se você pedir ou excluir a conta.
      </p>

      <h2>8. Seus direitos</h2>
      <p>
        Pela LGPD (art. 18), você pode pedir a qualquer momento: confirmação de que tratamos seus
        dados, acesso a eles, correção, anonimização, bloqueio ou eliminação de dados
        desnecessários, portabilidade, eliminação dos dados tratados com base no seu consentimento,
        informação sobre com quem compartilhamos e revisão de decisões automatizadas. Também pode
        pedir a <strong>exclusão da conta</strong>.
      </p>
      <p>
        Para isso, escreva para <a href={`mailto:${CONTATO}`}>{CONTATO}</a> a partir do e-mail da
        sua conta. Respondemos em até 15 dias. Seus lançamentos podem ser exportados a qualquer
        momento pelo próprio app, em um arquivo de backup. Você também pode reclamar à Autoridade
        Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>9. Menores de idade</h2>
      <p>
        O Arqevon Finance é destinado a maiores de 18 anos. Menores só devem usá-lo com
        autorização e acompanhamento do responsável legal.
      </p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Se mudarmos esta política de forma relevante, avisaremos pelo app ou por e-mail antes de a
        mudança valer. A data da última atualização fica sempre no topo da página.
      </p>
    </LegalLayout>
  );
}
