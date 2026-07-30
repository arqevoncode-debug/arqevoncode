import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyActivationToken } from "@/lib/activation-token";
import { normalizeFeedback } from "@/lib/feedback";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  try {
    const body = await request.json();
    // A licença vem da assinatura do comprovante, nunca do corpo da requisição.
    const payload = await verifyActivationToken(String(body.token || ""));

    const feedback = normalizeFeedback(body);
    if (!feedback.ok) return json({ error: feedback.error, code: "FEEDBACK_INVALID" }, 400);

    const { data, error } = await supabaseAdmin().rpc("submit_feedback", {
      p_license_id: payload.sub,
      p_activation_id: payload.activationId,
      p_device_id: payload.deviceId,
      p_category: feedback.value.category,
      p_message: feedback.value.message,
      p_app_version: feedback.value.appVersion,
    });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Não foi possível registrar o feedback.", code: data?.code || "FEEDBACK_DENIED" }, 409);

    return json({ ok: true });
  } catch (error) {
    const denied = error?.code === "ERR_JWT_EXPIRED" || error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
    return json({
      error: denied ? "Comprovante de ativação expirado ou inválido." : "Serviço de feedback indisponível.",
      code: denied ? "TOKEN_INVALID" : "SERVER_ERROR",
    }, denied ? 401 : 503);
  }
}
