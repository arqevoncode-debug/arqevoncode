import { NextResponse } from "next/server";
import { createAdminSession, validAdminCredentials } from "@/lib/admin-auth";
import { loginGate, recordLoginAttempt } from "@/lib/login-rate-limit";

export async function POST(request) {
  try {
    const { email = "", password = "" } = await request.json();

    const gate = await loginGate(request);
    if (gate.unavailable)
      return NextResponse.json({ error: "Não foi possível verificar o acesso. Tente novamente." }, { status: 503 });
    if (gate.blocked)
      return NextResponse.json(
        { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." },
        { status: 429, headers: { "retry-after": String(gate.retryAfter) } });

    if (!validAdminCredentials(email, password)) {
      await recordLoginAttempt(gate.hash, false);
      return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
    }

    await recordLoginAttempt(gate.hash, true);
    await createAdminSession();
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Não foi possível entrar." }, { status: 400 }); }
}
