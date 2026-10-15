import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { bearerToken } from "@/lib/account-link";
import { guardarDek, abrirDek } from "@/lib/custodia";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,authorization", "access-control-allow-methods": "POST,OPTIONS" };
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }
const json = (body, status = 200) => NextResponse.json(body, { status, headers: cors, });

// Chave dos dados da nuvem para quem entrou na conta (acesso só pelo e-mail).
// - Com custódia: devolve a DEK da chave atual da conta.
// - Sem custódia: um aparelho que já tem a DEK da chave atual (kid igual ao da nuvem) a entrega.
// A conta vem sempre do JWT do Supabase Auth; o corpo só traz a DEK e o kid de quem entrega.
export async function POST(request) {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return json({ ok: false, code: "AUTH_REQUIRED", message: "Entre na sua conta para continuar." }, 401);
  let body = {};
  try { body = await request.json(); } catch { /* corpo vazio: só buscar */ }
  try {
    const db = supabaseAdmin();
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth?.user) return json({ ok: false, code: "AUTH_INVALID", message: "Sessão expirada. Entre na sua conta novamente." }, 401);
    const uid = auth.user.id;

    const { data: c, error } = await db.rpc("vault_custody_get", { p_user_id: uid });
    if (error) throw error;
    if (!c?.exists) return json({ ok: false, code: "VAULT_NOT_FOUND", message: "Esta conta ainda não tem dados na nuvem." }, 404);
    // KEY_PENDING é uma situação normal (outro aparelho ainda vai entregar a chave): 200, sem erro no console
    if (!c.kid) return json({ ok: false, code: "KEY_PENDING", message: "Abra o app uma vez no aparelho onde você já usa a nuvem para concluir a atualização." });

    if (c.wrapped && c.wrapped_kid === c.kid) {
      return json({ ok: true, kid: c.kid, dek: abrirDek(c.wrapped, uid, c.kid).toString("base64") });
    }
    const dek = typeof body.dek === "string" ? Buffer.from(body.dek, "base64") : null;
    if (dek && dek.length === 32 && body.kid === c.kid) {
      const { data: r, error: e2 } = await db.rpc("vault_custody_set", { p_user_id: uid, p_wrapped: guardarDek(dek, uid, c.kid), p_kid: c.kid });
      if (e2) throw e2;
      if (!r?.ok) return json({ ok: false, code: r?.code || "KID_MISMATCH", message: "A chave deste aparelho não é a atual." }, 409);
      return json({ ok: true, kid: c.kid, stored: r.stored });
    }
    return json({ ok: false, code: "KEY_PENDING", message: "Abra o app uma vez no aparelho onde você já usa a nuvem para concluir a atualização." });
  } catch (error) {
    console.error("vault-key", error);
    return json({ ok: false, code: "SERVER_ERROR", message: "Não foi possível abrir a nuvem agora. Tente de novo." }, 503);
  }
}
