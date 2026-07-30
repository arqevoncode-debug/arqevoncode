import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60;

// O IP nunca é gravado em texto puro: o segredo de sessão atua como pepper do hash.
function clientHash(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "desconhecido";
  return crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(ip).digest("hex");
}

/**
 * Estado do freio para este cliente. Erros de banco falham fechado: sem o freio
 * disponível o login fica indisponível em vez de virar tentativa ilimitada.
 */
export async function loginGate(request) {
  const hash = clientHash(request);
  try {
    const { data, error } = await supabaseAdmin().rpc("admin_login_gate", {
      p_client_hash: hash,
      p_max_attempts: MAX_ATTEMPTS,
      p_window_seconds: WINDOW_SECONDS,
    });
    if (error) throw new Error(error.message);
    return { hash, blocked: !!data?.blocked, retryAfter: Number(data?.retry_after_seconds) || WINDOW_SECONDS };
  } catch (erro) {
    // Falha fechado deixa o painel inacessível: registre a causa, senão o sintoma
    // (503 no login) não distingue banco fora do ar, Supabase sem configuração
    // e migração 202607290003 não aplicada.
    console.error("Freio de login indisponível:", erro.message);
    return { hash, unavailable: true };
  }
}

export async function recordLoginAttempt(hash, success) {
  try {
    await supabaseAdmin().rpc("admin_login_record", { p_client_hash: hash, p_success: success });
  } catch { /* O registro é best-effort: nunca deve impedir um login legítimo. */ }
}

export const LOGIN_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const LOGIN_WINDOW_SECONDS = WINDOW_SECONDS;
