import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { clientHash } from "@/lib/client-hash";
import { normalizeLicenseRequest } from "@/lib/license-requests";

// A landing page é outro domínio, por isso o CORS aberto. O endpoint não expõe
// leitura: só aceita o envio de um pedido.
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  try {
    const body = await request.json();
    const pedido = normalizeLicenseRequest(body);
    if (!pedido.ok) return json({ error: pedido.error, code: "REQUEST_INVALID" }, 400);

    const { data, error } = await supabaseAdmin().rpc("request_license", {
      p_email: pedido.value.email,
      p_name: pedido.value.name,
      p_platform: pedido.value.platform,
      p_client_hash: clientHash(request),
    });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Não foi possível registrar o pedido.", code: data?.code || "REQUEST_DENIED" }, 429);

    // "already" não é revelado: quem pede duas vezes recebe a mesma confirmação.
    return json({ ok: true });
  } catch (error) {
    console.error("Falha ao registrar pedido de licença:", error.message);
    return json({ error: "Serviço indisponível. Tente novamente em alguns minutos.", code: "SERVER_ERROR" }, 503);
  }
}
