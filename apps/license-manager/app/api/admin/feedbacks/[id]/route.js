import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { FEEDBACK_STATUSES } from "@/lib/feedback";

export async function PATCH(request, context) {
  if (!await isAdmin()) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  if (!FEEDBACK_STATUSES.includes(body.status)) return NextResponse.json({ error: "Situação inválida." }, { status: 400 });
  const { error } = await supabaseAdmin().from("feedbacks").update({ status: body.status }).eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}
