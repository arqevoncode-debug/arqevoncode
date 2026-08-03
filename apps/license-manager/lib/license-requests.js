export const REQUEST_STATUSES = ["novo", "emitida", "recusada"];
export const REQUEST_PLATFORMS = ["windows", "macos"];
export const EMAIL_MAX = 200;
export const NAME_MAX = 120;

/**
 * Valida e normaliza o pedido de licença vindo da landing page.
 * Os mesmos limites existem como check constraint e como regex na função do banco;
 * aqui servem para devolver uma mensagem em português a quem preencheu o formulário.
 * Retorna { ok: true, value } ou { ok: false, error }.
 */
export function normalizeLicenseRequest(input = {}) {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, NAME_MAX);
  const platform = REQUEST_PLATFORMS.includes(input.platform) ? input.platform : "windows";

  if (!email) return { ok: false, error: "Informe o e-mail para receber a licença." };
  if (email.length > EMAIL_MAX) return { ok: false, error: "O e-mail informado é longo demais." };
  // Checagem deliberadamente simples: só descarta o que claramente não é endereço.
  // Quem valida de fato é a entrega da licença.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Informe um e-mail válido." };

  return { ok: true, value: { email, name: name || null, platform } };
}
