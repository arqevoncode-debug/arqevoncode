import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("license_requests")
    .select("id,email,name,platform,status,notes,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}
