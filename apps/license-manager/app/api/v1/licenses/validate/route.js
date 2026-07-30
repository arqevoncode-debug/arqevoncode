import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createActivationToken, verifyActivationToken } from "@/lib/activation-token";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  try {
    const { token } = await request.json(); const payload = await verifyActivationToken(String(token || ""));
    const { data, error } = await supabaseAdmin().rpc("validate_activation", {
      p_license_id: payload.sub, p_activation_id: payload.activationId, p_device_id: payload.deviceId,
    });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Ativação inválida.", code: data?.code || "ACTIVATION_DENIED" }, 403);
    return json({ ok: true, token: await createActivationToken(data), license: { plan: data.plan, maxDevices: data.max_devices, activeDevices: data.active_devices, customerName: data.customer_name } });
  } catch (error) {
    const denied = error?.code === "ERR_JWT_EXPIRED" || error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
    return json({ error: denied ? "Comprovante de ativação expirado ou inválido." : "Serviço de validação indisponível.", code: denied ? "TOKEN_INVALID" : "SERVER_ERROR" }, denied ? 401 : 503);
  }
}
