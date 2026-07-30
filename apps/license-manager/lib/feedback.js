export const FEEDBACK_CATEGORIES = ["sugestao", "problema", "duvida", "elogio"];
export const FEEDBACK_STATUSES = ["novo", "lido", "arquivado"];
export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

/**
 * Valida e normaliza o feedback recebido do aplicativo. Os mesmos limites estão
 * como check constraint na tabela; aqui eles existem para devolver uma mensagem
 * em português ao cliente em vez de um erro de banco.
 * Retorna { ok: true, value } ou { ok: false, error }.
 */
export function normalizeFeedback(input = {}) {
  const category = FEEDBACK_CATEGORIES.includes(input.category) ? input.category : "sugestao";
  const message = String(input.message ?? "").trim();

  if (message.length < MESSAGE_MIN)
    return { ok: false, error: `Escreva pelo menos ${MESSAGE_MIN} caracteres para enviarmos seu feedback.` };
  if (message.length > MESSAGE_MAX)
    return { ok: false, error: `O texto passou de ${MESSAGE_MAX} caracteres. Resuma um pouco, por favor.` };

  return {
    ok: true,
    value: { category, message, appVersion: String(input.appVersion ?? "").trim().slice(0, 40) || null },
  };
}
