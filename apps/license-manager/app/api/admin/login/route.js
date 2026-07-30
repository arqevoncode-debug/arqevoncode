import { NextResponse } from "next/server";
import { createAdminSession, validAdminCredentials } from "@/lib/admin-auth";

export async function POST(request) {
  try {
    const { email = "", password = "" } = await request.json();
    if (!validAdminCredentials(email, password)) return NextResponse.json({ error: "Credenciais inválidas." }, { status: 401 });
    await createAdminSession();
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Não foi possível entrar." }, { status: 400 }); }
}
