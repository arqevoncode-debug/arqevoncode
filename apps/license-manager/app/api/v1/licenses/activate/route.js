import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashLicenseKey } from "@/lib/licenses";
import { createActivationToken } from "@/lib/activation-token";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

export async function POST(request) {
  try {
    const body = await request.json();
    const licenseKey = String(body.licenseKey || "");
    const deviceId = String(body.deviceId || "").slice(0, 120);
    if (licenseKey.length < 12 || deviceId.length < 12) return json({ error: "Dados de ativação inválidos.", code: "INVALID_REQUEST" }, 400);
    const { data, error } = await supabaseAdmin().rpc("activate_license", {
      p_key_hash: hashLicenseKey(licenseKey), p_device_id: deviceId,
      p_device_name: String(body.deviceName || "Computador").slice(0, 120),
      p_os: String(body.os || "unknown").slice(0, 30), p_app_version: String(body.appVersion || "1.0.0").slice(0, 30),
    });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Licença não autorizada.", code: data?.code || "LICENSE_DENIED" }, 403);
    return json({ ok: true, token: await createActivationToken(data), license: { plan: data.plan, maxDevices: data.max_devices, activeDevices: data.active_devices, customerName: data.customer_name } });
  } catch (error) { console.error("activate", error); return json({ error: "Serviço de ativação indisponível.", code: "SERVER_ERROR" }, 503); }
}
