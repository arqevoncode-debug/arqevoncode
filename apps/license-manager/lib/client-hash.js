import crypto from "node:crypto";

/**
 * Identifica a origem da requisição sem guardar o IP.
 * O segredo de sessão age como pepper: o hash não é reversível nem comparável
 * entre ambientes, e serve apenas para conter abuso em endpoints públicos.
 */
export function clientHash(request) {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || request.headers.get("x-real-ip")
    || "desconhecido";
  return crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET || "").update(ip).digest("hex");
}
