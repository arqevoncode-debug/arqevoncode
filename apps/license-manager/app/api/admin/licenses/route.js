import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateLicenseKey, hashLicenseKey } from "@/lib/licenses";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("licenses")
    .select("id,customer_name,email,plan,status,max_devices,expires_at,updates_until,notes,created_at,activations(id,device_name,os,app_version,activated_at,last_seen_at,revoked_at)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licenses: data });
}

export async function POST(request) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const body = await request.json();
    const customerName = String(body.customerName || "").trim().slice(0, 120);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    const plan = ["individual", "multidispositivo", "familia"].includes(body.plan) ? body.plan : "individual";
    const maxDevices = Math.min(5, Math.max(1, Number(body.maxDevices) || 1));
    if (!customerName) return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Informe um e-mail válido ou deixe o campo vazio." }, { status: 400 });
    const key = generateLicenseKey();
    const { data, error } = await supabaseAdmin().from("licenses").insert({
      key_hash: hashLicenseKey(key), customer_name: customerName, email: email || null, plan,
      max_devices: maxDevices, notes: String(body.notes || "").trim().slice(0, 500),
    }).select("id").single();
    if (error) throw error;
    return NextResponse.json({ id: data.id, licenseKey: key }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error.message || "Falha ao criar licença." }, { status: 500 }); }
}
