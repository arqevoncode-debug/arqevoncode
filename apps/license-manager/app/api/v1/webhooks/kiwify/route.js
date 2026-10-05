import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { enviarAlerta, montarAlertaReembolso } from "@/lib/alerta";
import { classificarKiwify, contaDoSck, diaUtc, kiwify, kiwifyWebhookKeyValida, parseKiwifyWebhook, planoKiwify, semDadosPessoais } from "@/lib/kiwify";

// Avisos da Kiwify. A autenticidade vem da chave secreta na URL, que nós cadastramos via API.
// O conteúdo do aviso não é confiável para liberar acesso: status, e-mail e o vínculo com a conta
// são lidos da venda na API da Kiwify. A regra (idempotência, período) vive em billing_apply_kiwify.
export async function POST(request) {
  if (!kiwifyWebhookKeyValida(new URL(request.url).searchParams.get("key"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const aviso = parseKiwifyWebhook(body);
  // Sem pedido não há o que conferir: 200 para não travar a fila com algo que nunca vai passar.
  if (!aviso) {
    console.warn("webhook kiwify: aviso sem pedido", JSON.stringify(body)?.slice(0, 500));
    return NextResponse.json({ ok: true, outcome: "ignored_malformed" });
  }

  try {
    const venda = await kiwify(`/sales/${encodeURIComponent(aviso.orderId)}`);
    const efeito = classificarKiwify(aviso.eventType, venda.status);
    const db = supabaseAdmin();

    let userId = null;
    if (efeito === "approved" || efeito === "renewed") {
      userId = contaDoSck(venda);
      if (userId) {
        const { data } = await db.auth.admin.getUserById(userId);
        if (!data?.user) userId = null;
      }
      if (!userId && venda.customer?.email) {
        const { data, error } = await db.rpc("billing_find_user_by_email", { p_email: venda.customer.email });
        if (error) throw error;
        userId = data || null;
      }
    }

    // Aprovação conta do dia da compra; renovação, do dia em que o aviso chegou.
    const inicio = efeito === "approved" ? (venda.approved_date || venda.created_at) : new Date().toISOString();
    const eventId = (efeito === "renewed"
      ? `kiwify:${aviso.orderId}:renewed:${diaUtc()}`
      : `kiwify:${aviso.orderId}:${efeito}:${aviso.eventType || "sem-tipo"}`).slice(0, 200);

    const { data, error } = await db.rpc("billing_apply_kiwify", {
      p_event_id: eventId,
      p_kind: efeito === "approved" || efeito === "renewed" ? "paid" : efeito,
      p_user_id: userId,
      p_plan_id: planoKiwify(aviso),
      p_provider_ref: aviso.subscriptionId || aviso.orderId,
      p_period_start: inicio,
      p_payload: { aviso: semDadosPessoais(body), venda: { id: venda.id, status: venda.status, product: venda.product, approved_date: venda.approved_date, refunded_at: venda.refunded_at } },
    });
    if (error) throw error;
    if (data?.outcome === "ignored_no_account" || data?.outcome === "ignored_unknown_plan") {
      console.error("webhook kiwify: pagamento sem liberação", data.outcome, aviso.orderId);
    }

    // Reembolso não cancela a assinatura na Kiwify, e a API dela não permite cancelar: o dono
    // precisa fazer à mão, senão o cliente é cobrado de novo. O e-mail sai uma vez por evento; se
    // falhar, o 500 faz a Kiwify reentregar o aviso e o envio é tentado de novo.
    if (efeito === "revoked") {
      const { data: registro, error: lerErro } = await db.from("payment_events").select("alert_sent_at").eq("id", eventId).single();
      if (lerErro) throw lerErro;
      if (!registro.alert_sent_at) {
        await enviarAlerta(montarAlertaReembolso({
          pedido: venda.reference || aviso.orderId,
          assinatura: aviso.subscriptionId,
          plano: planoKiwify(aviso),
          comprador: venda.customer?.email,
          motivo: aviso.eventType === "chargeback" || String(venda.status).startsWith("chargeback") ? "chargeback" : "reembolso",
        }));
        const { error: marcarErro } = await db.from("payment_events").update({ alert_sent_at: new Date().toISOString() }).eq("id", eventId);
        // O e-mail já saiu: na pior hipótese, uma reentrega manda outro igual.
        if (marcarErro) console.error("webhook kiwify: marcar alerta enviado", eventId, marcarErro.message);
      }
    }
    return NextResponse.json({ ok: true, outcome: data?.outcome });
  } catch (error) {
    // 500 faz a Kiwify tentar de novo; o evento não se perde por uma falha momentânea.
    console.error("webhook kiwify", aviso.orderId, error.message);
    return NextResponse.json({ error: "Falha ao registrar o evento." }, { status: 500 });
  }
}
