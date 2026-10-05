import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseAsaasEvent, webhookTokenValido } from "@/lib/billing";

// Avisos de pagamento do Asaas. A autenticidade vem do token configurado no painel do Asaas, que
// chega no cabeçalho asaas-access-token. Toda a regra (idempotência, período, carência) vive em
// billing_apply_event, no banco; aqui só autenticamos e repassamos.
export async function POST(request) {
  if (!webhookTokenValido(request.headers.get("asaas-access-token"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch { body = null; }
  const evento = parseAsaasEvent(body);
  // Corpo que não é um evento do Asaas: 200 para não travar a fila com algo que nunca vai passar.
  if (!evento) return NextResponse.json({ ok: true, outcome: "ignored_malformed" });

  try {
    const { data, error } = await supabaseAdmin().rpc("billing_apply_event", {
      p_event_id: evento.eventId,
      p_event: evento.event,
      p_provider_subscription_id: evento.subscriptionId,
      p_due_date: evento.dueDate,
      p_payload: body,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, outcome: data?.outcome });
  } catch (error) {
    // 500 faz o Asaas tentar de novo; o evento não se perde por uma falha momentânea do banco.
    console.error("webhook asaas", evento.event, error.message);
    return NextResponse.json({ error: "Falha ao registrar o evento." }, { status: 500 });
  }
}
