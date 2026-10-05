import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyActivationToken } from "@/lib/activation-token";
import { bearerToken, isTokenError } from "@/lib/account-link";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors });

// Vincula a licença deste dispositivo à conta logada, liberando a sincronização na nuvem.
// As duas identidades vêm de credenciais assinadas: a licença do comprovante Ed25519 e a conta
// do JWT do Supabase Auth. Nada no corpo da requisição escolhe qual licença ou qual conta.
export async function POST(request) {
  const accessToken = bearerToken(request.headers.get("authorization"));
  if (!accessToken) return json({ error: "Entre na sua conta para continuar.", code: "AUTH_REQUIRED" }, 401);

  let payload;
  try {
    const body = await request.json();
    payload = await verifyActivationToken(String(body.token || ""));
  } catch (error) {
    if (error instanceof SyntaxError || isTokenError(error))
      return json({ error: "Comprovante de ativação expirado ou inválido.", code: "TOKEN_INVALID" }, 401);
    return json({ error: "Serviço de contas indisponível.", code: "SERVER_ERROR" }, 503);
  }

  try {
    const db = supabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(accessToken);
    if (authError || !auth?.user) return json({ error: "Sessão expirada. Entre na sua conta novamente.", code: "AUTH_INVALID" }, 401);
    if (!auth.user.email_confirmed_at) return json({ error: "Confirme seu e-mail antes de ativar a sincronização.", code: "EMAIL_NOT_CONFIRMED" }, 403);

    // Um comprovante ainda dentro dos 30 dias pode ser de um dispositivo já liberado ou de uma
    // licença suspensa: só vincula o que a validação aceitaria agora.
    const { data: activation, error: activationError } = await db.rpc("validate_activation", {
      p_license_id: payload.sub, p_activation_id: payload.activationId, p_device_id: payload.deviceId,
    });
    if (activationError) throw activationError;
    if (!activation?.ok) return json({ error: activation?.message || "Ativação inválida.", code: activation?.code || "ACTIVATION_DENIED" }, 403);

    const { data, error } = await db.rpc("link_license_to_user", { p_license_id: payload.sub, p_user_id: auth.user.id });
    if (error) throw error;
    if (!data?.ok) return json({ error: data?.message || "Não foi possível vincular a licença.", code: data?.code || "LINK_DENIED" }, 409);

    return json({ ok: true, entitled: data.entitled, plan: data.plan });
  } catch (error) {
    console.error("link-license", error);
    return json({ error: "Serviço de contas indisponível.", code: "SERVER_ERROR" }, 503);
  }
}
