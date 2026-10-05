import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientHash } from "@/lib/client-hash";
import { enviarAlerta } from "@/lib/alerta";
import { montarAvisoOrcamento, normalizeQuoteRequest } from "@/lib/quote-requests";

// Pedido de orçamento do site (outro domínio, por isso o CORS aberto). Só aceita envio.
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const pedido = normalizeQuoteRequest(body);
  if (!pedido.ok) return json({ error: pedido.error, code: "REQUEST_INVALID" }, 400);
  const p = pedido.value;

  try {
    const { data, error } = await supabaseAdmin().rpc("request_quote", {
      p_name: p.name, p_email: p.email, p_phone: p.phone, p_company: p.company,
      p_project_type: p.projectType, p_budget: p.budget, p_description: p.description,
      p_client_hash: clientHash(request),
    });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Não foi possível registrar o pedido.", code: data?.code || "REQUEST_DENIED" }, data?.code === "REQUEST_RATE_LIMIT" ? 429 : 400);
  } catch (error) {
    console.error("pedido de orçamento", error.message);
    return json({ error: "Serviço indisponível. Tente de novo em alguns minutos ou escreva para contato@arqevoncode.com.br.", code: "SERVER_ERROR" }, 503);
  }

  // O pedido já está gravado: uma falha no e-mail não deve fazer o cliente achar que perdeu o envio.
  await enviarAlerta(montarAvisoOrcamento(p)).catch(error => console.error("aviso de orçamento", error.message));
  return json({ ok: true });
}
