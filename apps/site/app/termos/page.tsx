import type { Metadata } from "next";
import LegalLayout, { CONTATO } from "../legal-layout";

export const metadata: Metadata = {
  title: "Termos de Uso — Arqevon Finance",
  description: "Regras de uso do Arqevon Finance: conta, plano grátis e Pro, pagamento, cancelamento, reembolso e responsabilidades.",
};

// Preços e prazos citados aqui precisam bater com a página de pagamento e com a tabela plans.
export default function Termos() {
  return (
    <LegalLayout titulo="Termos de Uso">
      <p className="legal-resumo">
        <strong>Em resumo:</strong> o plano grátis é seu para usar sem prazo. O Pro é uma assinatura
        que você cancela quando quiser, com direito a reembolso integral em até 7 dias. Seus dados
        são seus. Se você perder a senha da nuvem e a chave de recuperação, nem nós conseguimos
        abrir os dados guardados na nuvem.
      </p>

      <h2>1. Aceitação</h2>
      <p>
        Estes Termos regem o uso do Arqevon Finance (o &quot;Serviço&quot;), oferecido pela{" "}
        <strong>Arqevon Code</strong>. Ao criar uma conta, usar o app ou assinar o plano Pro, você
        concorda com eles e com a <a href="/privacidade">Política de Privacidade</a>. Se não
        concordar, não use o Serviço.
      </p>

      <h2>2. O Serviço</h2>
      <p>
        O Arqevon Finance é um app de organização de finanças pessoais: registra receitas,
        despesas, contas fixas, parcelas e objetivos, e mostra gráficos e projeções.
      </p>
      <ul>
        <li>
          <strong>Plano grátis:</strong> todas as funções de organização, com os dados guardados
          apenas no aparelho em que você usa o app. Pode ser usado sem conta.
        </li>
        <li>
          <strong>Plano Pro (pago):</strong> acrescenta a sincronização dos seus dados entre
          aparelhos, pela nuvem, com criptografia de ponta a ponta.
        </li>
        <li>
          <strong>App para Windows:</strong> é ativado por licença, conforme o plano contratado e o
          limite de dispositivos informado na compra.
        </li>
      </ul>
      <p>
        O Serviço é uma ferramenta de organização. <strong>Não é consultoria financeira, contábil
        ou de investimentos.</strong> Projeções e totais são estimativas calculadas a partir do que
        você lança. As decisões financeiras são suas.
      </p>

      <h2>3. Sua conta</h2>
      <ul>
        <li>Você entra com o seu e-mail e um código de acesso enviado a ele. Use um e-mail seu e mantenha o acesso a ele protegido.</li>
        <li>Você é responsável pelo que for feito na sua conta e deve nos avisar se suspeitar de uso indevido.</li>
        <li>O Serviço é destinado a maiores de 18 anos. Menores só devem usá-lo com autorização e acompanhamento do responsável legal.</li>
      </ul>

      <h2>4. Senha da nuvem e chave de recuperação</h2>
      <p>
        No plano Pro, seus dados são cifrados no seu aparelho com uma chave protegida pela sua{" "}
        <strong>senha da nuvem</strong> e pela sua <strong>chave de recuperação</strong>. Nós não
        recebemos nenhuma das duas. Guarde a chave de recuperação em local seguro.{" "}
        <strong>Se você perder as duas, os dados guardados na nuvem não poderão ser recuperados por
        ninguém, inclusive por nós.</strong> Os dados que estiverem salvos nos seus aparelhos
        continuam neles.
      </p>

      <h2>5. Assinatura, preço e pagamento</h2>
      <ul>
        <li>O plano Pro é vendido nas modalidades <strong>mensal</strong> e <strong>anual</strong>, pelos preços exibidos na página de pagamento no momento da compra.</li>
        <li>O pagamento é processado pela <strong>Kiwify</strong>, que aceita Pix e cartão de crédito. Os dados de pagamento ficam com ela, e não conosco.</li>
        <li>A assinatura <strong>renova automaticamente</strong> ao fim de cada período, na mesma modalidade, até ser cancelada.</li>
        <li>Se a renovação não for paga, o Pro continua disponível por até 5 dias de tolerância. Depois disso, a conta volta ao plano grátis.</li>
        <li>Mudanças de preço valem só a partir da renovação seguinte e serão avisadas com antecedência.</li>
      </ul>

      <h2>6. Cancelamento</h2>
      <p>
        Você pode cancelar a assinatura a qualquer momento, sem multa, pela área do cliente da
        Kiwify ou escrevendo para <a href={`mailto:${CONTATO}`}>{CONTATO}</a>. Ao cancelar, o Pro
        continua ativo até o fim do período já pago, e não há novas cobranças. Depois disso, a conta
        volta ao plano grátis. Seus dados <strong>não são apagados</strong> por causa do
        cancelamento.
      </p>

      <h2>7. Direito de arrependimento e reembolso</h2>
      <p>
        Você pode desistir da compra em até <strong>7 dias</strong> após o pagamento e receber o
        valor pago integralmente (Código de Defesa do Consumidor, art. 49). Basta pedir pela Kiwify
        ou pelo nosso e-mail. Com o reembolso, o plano Pro é encerrado na hora e a assinatura é
        cancelada. Os dados salvos nos seus aparelhos continuam com você.
      </p>

      <h2>8. Seus dados</h2>
      <p>
        Os dados que você lança são seus. Você pode exportá-los a qualquer momento em um arquivo de
        backup pelo próprio app e pedir a exclusão da conta e dos dados na nuvem. Como tratamos
        dados pessoais está descrito na <a href="/privacidade">Política de Privacidade</a>.
      </p>

      <h2>9. Uso permitido</h2>
      <p>Ao usar o Serviço, você se compromete a não:</p>
      <ul>
        <li>tentar acessar contas, dados ou sistemas de outras pessoas;</li>
        <li>contornar limites técnicos, de licença ou de pagamento;</li>
        <li>usar o Serviço para atividades ilegais ou para sobrecarregar a infraestrutura;</li>
        <li>copiar, revender ou redistribuir o Serviço ou o app sem autorização.</li>
      </ul>
      <p>
        Podemos suspender ou encerrar contas que violem estes Termos. Antes, sempre que possível,
        avisaremos e daremos prazo para você baixar seus dados.
      </p>

      <h2>10. Disponibilidade</h2>
      <p>
        Trabalhamos para manter o Serviço disponível e os dados seguros, com cópias de segurança
        diárias, mas não garantimos funcionamento ininterrupto. Pode haver pausas para manutenção ou
        por falhas de fornecedores e da internet. Seus lançamentos ficam salvos no seu aparelho, e no
        Pro as alterações feitas sem conexão são enviadas quando ela volta. Recomendamos exportar um
        backup de tempos em tempos.
      </p>

      <h2>11. Responsabilidade</h2>
      <p>
        Respondemos pelos serviços que prestamos nos termos do Código de Defesa do Consumidor. Não
        respondemos por decisões financeiras tomadas com base nas informações do app, por dados
        lançados incorretamente, pela perda da senha da nuvem e da chave de recuperação, nem por
        falhas causadas por terceiros fora do nosso controle, na medida permitida pela lei.
      </p>

      <h2>12. Propriedade intelectual</h2>
      <p>
        O app, a marca Arqevon, o código e o design pertencem à Arqevon Code. Estes Termos dão a você
        uma licença pessoal, não exclusiva e intransferível para usar o Serviço enquanto eles
        estiverem em vigor.
      </p>

      <h2>13. Mudanças nestes Termos</h2>
      <p>
        Podemos atualizar estes Termos. Se a mudança for relevante, avisaremos pelo app ou por
        e-mail antes de ela valer. Se você não concordar, pode cancelar a assinatura e pedir a
        exclusão da conta.
      </p>

      <h2>14. Lei aplicável e contato</h2>
      <p>
        Estes Termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor. Dúvidas,
        pedidos e reclamações: <a href={`mailto:${CONTATO}`}>{CONTATO}</a>.
      </p>
    </LegalLayout>
  );
}
