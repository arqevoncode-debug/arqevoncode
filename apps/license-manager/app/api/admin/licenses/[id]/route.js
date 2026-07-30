import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request, context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params; const body = await request.json(); const patch = {};
  if (["active", "suspended", "cancelled"].includes(body.status)) patch.status = body.status;
  if (body.maxDevices !== undefined) patch.max_devices = Math.min(5, Math.max(1, Number(body.maxDevices) || 1));
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 500);
  if (body.expiresAt !== undefined) patch.expires_at = body.expiresAt || null;
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  const { error } = await supabaseAdmin().from("licenses").update(patch).eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function DELETE(_request, context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const { data, error } = await supabaseAdmin().from("licenses").delete().eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Licença não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
