import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { REQUEST_STATUSES } from "@/lib/license-requests";

export async function PATCH(request, context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  const patch = {};
  if (REQUEST_STATUSES.includes(body.status)) patch.status = body.status;
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 500);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  const { error } = await supabaseAdmin().from("license_requests").update(patch).eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

export async function DELETE(_request, context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const { error } = await supabaseAdmin().from("license_requests").delete().eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
