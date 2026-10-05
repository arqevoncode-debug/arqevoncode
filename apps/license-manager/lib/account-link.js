/**
 * Extrai o JWT do usuário (Supabase Auth) do cabeçalho Authorization.
 * Retorna null quando o cabeçalho falta ou não segue o formato "Bearer <jwt>".
 */
export function bearerToken(header) {
  const match = /^Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(String(header ?? "").trim());
  return match ? match[1] : null;
}

/** Erros do jose (assinatura, expiração, formato) significam comprovante recusado, não falha do servidor. */
export function isTokenError(error) {
  return typeof error?.code === "string" && error.code.startsWith("ERR_J");
}
