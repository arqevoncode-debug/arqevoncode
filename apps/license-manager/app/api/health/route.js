import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Consulta mínima ao banco. Além de servir de monitor, mantém o projeto do Supabase ativo: o plano
// grátis pausa o projeto após dias sem uso, e pausado ele derruba ativações e pedidos de licença.
// O workflow keep-alive.yml chama esta rota todo dia.
export async function GET() {
  try {
    const { error } = await supabaseAdmin().from("licenses").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("health", error);
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
