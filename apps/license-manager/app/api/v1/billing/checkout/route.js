import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/account-link";
import { asaas, asaasCycle, hojeEmBrasilia, normalizeCpf } from "@/lib/billing";
import { kiwifyCheckoutUrl } from "@/lib/kiwify";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

// Inicia a assinatura do Pro e devolve o link da fatura do Asaas, onde o cliente paga. O cartão
// nunca passa por aqui. A conta vem do JWT do Supabase Auth; o corpo só escolhe plano e CPF.
// O acesso só é liberado quando o webhook confirmar o pagamento.
export async function POST(request) {
  const accessToken = bearerToken(request.headers.get("authorization"));
  if (!accessToken) return json({ error: "Entre na sua conta para continuar.", code: "AUTH_REQUIRED" }, 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const planId = String(body?.plan ?? "");
  // Na Kiwify o CPF é pedido pela própria página de pagamento; só o Asaas precisa dele aqui.
  const viaKiwify = process.env.BILLING_PROVIDER === "kiwify";
  const cpf = normalizeCpf(body?.cpf);
  if (!viaKiwify && !cpf) return json({ error: "Informe um CPF válido.", code: "CPF_INVALID" }, 400);

  try {
    const db = supabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !auth?.user) return json({ error: "Sessão expirada. Entre na sua conta novamente.", code: "AUTH_INVALID" }, 401);
    const user = auth.user;
    if (!user.email_confirmed_at) return json({ error: "Confirme seu e-mail antes de assinar.", code: "EMAIL_NOT_CONFIRMED" }, 403);

    const { data: inicio, error: inicioError } = await db.rpc("billing_begin_checkout", { p_user_id: user.id, p_plan_id: planId });
    if (inicioError) throw inicioError;
    if (!inicio?.ok) return json({ error: inicio.message, code: inicio.code }, inicio.code === "PLAN_INVALID" ? 400 : 409);

    // Kiwify: a assinatura nasce no pagamento (webhook). Aqui só entregamos o link do plano com
    // o id da conta em sck, para o pagamento voltar vinculado a ela.
    if (viaKiwify) {
      const checkoutUrl = kiwifyCheckoutUrl(planId, user);
      if (!checkoutUrl) return json({ error: "Plano indisponível.", code: "PLAN_INVALID" }, 400);
      return json({ ok: true, checkoutUrl });
    }

    // Checkout já aberto para o mesmo plano: devolve o mesmo link em vez de gerar outra cobrança.
    if (inicio.subscription_id && inicio.checkout_url) return json({ ok: true, checkoutUrl: inicio.checkout_url });

    // Trocou de plano antes de pagar: a assinatura antiga não pode continuar gerando faturas.
    if (inicio.replaced_provider_subscription_id) {
      await asaas(`/subscriptions/${inicio.replaced_provider_subscription_id}`, { method: "DELETE" })
        .catch(error => console.error("checkout: cancelar assinatura substituída", error.message));
    }

    let customerId = inicio.customer_id;
    if (!customerId) {
      const cliente = await asaas("/customers", {
        method: "POST",
        body: { name: user.user_metadata?.name || user.email, email: user.email, cpfCnpj: cpf, externalReference: user.id },
      });
      customerId = cliente.id;
      const { error } = await db.rpc("billing_save_customer", { p_user_id: user.id, p_customer_id: customerId });
      if (error) throw error;
    } else {
      // O CPF pode ter sido corrigido pelo cliente; o Asaas precisa do atual para emitir a cobrança.
      await asaas(`/customers/${customerId}`, { method: "PUT", body: { cpfCnpj: cpf } });
    }

    const plano = inicio.plan;
    const { cycle, billingType } = asaasCycle(plano);
    const assinatura = await asaas("/subscriptions", {
      method: "POST",
      body: {
        customer: customerId, billingType, cycle,
        value: plano.price_cents / 100,
        nextDueDate: hojeEmBrasilia(),
        description: `Arqevon Finance — ${plano.name}`,
        externalReference: user.id,
      },
    });
    const cobrancas = await asaas(`/subscriptions/${assinatura.id}/payments`);
    const checkoutUrl = cobrancas?.data?.[0]?.invoiceUrl;
    if (!checkoutUrl) throw new Error(`Assinatura ${assinatura.id} sem fatura inicial.`);

    const { data: salvo, error: salvoError } = await db.rpc("billing_save_subscription", {
      p_user_id: user.id, p_plan_id: plano.id, p_provider_subscription_id: assinatura.id, p_checkout_url: checkoutUrl,
    });
    if (salvoError) throw salvoError;
    if (!salvo?.ok) {
      // Outro clique chegou primeiro: desfaz a assinatura recém-criada para não cobrar duas vezes.
      await asaas(`/subscriptions/${assinatura.id}`, { method: "DELETE" })
        .catch(error => console.error("checkout: desfazer assinatura duplicada", error.message));
      return json({ error: salvo?.message, code: salvo?.code }, 409);
    }

    return json({ ok: true, checkoutUrl });
  } catch (error) {
    console.error("checkout", error.message);
    return json({ error: "Pagamento indisponível no momento. Tente novamente em alguns minutos.", code: "SERVER_ERROR" }, 503);
  }
}
