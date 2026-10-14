import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// Números do negócio para o painel. Só contagens: o servidor não tem dados financeiros em claro.
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const db = supabaseAdmin();
  const [{ data, error }, indicacao] = await Promise.all([db.rpc("admin_metrics"), db.rpc("admin_referral_metrics")]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: { ...data, indicacao: indicacao.error ? null : indicacao.data } });
}
