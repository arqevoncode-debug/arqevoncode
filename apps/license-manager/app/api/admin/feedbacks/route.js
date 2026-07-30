import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  // O join traz o cliente para o painel identificar o autor sem uma segunda consulta.
  const { data, error } = await supabaseAdmin().from("feedbacks")
    .select("id,license_id,device_id,category,message,app_version,status,created_at,licenses(customer_name,email,plan,status)")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ feedbacks: data });
}
