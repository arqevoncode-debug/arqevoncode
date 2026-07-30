import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyActivationToken } from "@/lib/activation-token";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  try {
    const { token } = await request.json(); const payload = await verifyActivationToken(String(token || ""));
    const { error } = await supabaseAdmin().from("activations").update({ revoked_at: new Date().toISOString() })
      .eq("id", payload.activationId).eq("license_id", payload.sub).eq("device_id", payload.deviceId).is("revoked_at", null);
    if (error) throw error;
    return json({ ok: true });
  } catch { return json({ error: "Não foi possível desativar este dispositivo." }, 400); }
}
