import { createHash, timingSafeEqual } from "node:crypto";

const SANDBOX = "https://api-sandbox.asaas.com/v3";
const PRODUCAO = "https://api.asaas.com/v3";

/**
 * O ambiente sai do prefixo da própria chave ($aact_hmlg_ = sandbox). Uma variável separada para
 * a URL poderia divergir da chave e mandar cobranças reais para o ambiente errado.
 */
export function asaasConfig(apiKey = process.env.ASAAS_API_KEY) {
  if (!apiKey) throw new Error("ASAAS_API_KEY não configurada.");
  const sandbox = apiKey.startsWith("$aact_hmlg_");
  return { apiKey, sandbox, baseUrl: sandbox ? SANDBOX : PRODUCAO };
}

export async function asaas(path, { method = "GET", body } = {}) {
  const { apiKey, baseUrl } = asaasConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "user-agent": "arqevon-license-manager", access_token: apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detalhe = data?.errors?.map(e => e.description).join("; ") || response.statusText;
    const error = new Error(`Asaas ${method} ${path}: ${response.status} ${detalhe}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Plano → ciclo e forma de cobrança. Mensal no cartão renova sozinho; anual aceita Pix e boleto. */
export function asaasCycle(plan) {
  if (plan.billing_interval === "month") return { cycle: "MONTHLY", billingType: "CREDIT_CARD" };
  if (plan.billing_interval === "year") return { cycle: "YEARLY", billingType: "UNDEFINED" };
  throw new Error(`Plano sem cobrança recorrente: ${plan.id}`);
}

/** Data de hoje no fuso de Brasília, no formato que o Asaas espera (AAAA-MM-DD). */
export function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

/** CPF só com dígitos e com os dois dígitos verificadores corretos; null se inválido. */
export function normalizeCpf(valor) {
  const cpf = String(valor ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return null;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(cpf[i]) * (tamanho + 1 - i);
    const digito = ((soma * 10) % 11) % 10;
    if (digito !== Number(cpf[tamanho])) return null;
  }
  return cpf;
}

/** Comparação em tempo constante: o tempo da resposta não revela quantos caracteres acertaram. */
export function webhookTokenValido(recebido, esperado = process.env.ASAAS_WEBHOOK_TOKEN) {
  if (!esperado || esperado.length < 32 || typeof recebido !== "string") return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Extrai do aviso do Asaas só o que a regra de acesso usa. Eventos de cobrança trazem `payment`;
 * eventos de assinatura trazem `subscription`. Sem `id`, o identificador é montado do conteúdo,
 * para a repetição do mesmo aviso continuar sendo reconhecida como duplicada.
 */
export function parseAsaasEvent(body) {
  if (!body || typeof body !== "object" || typeof body.event !== "string") return null;
  const payment = body.payment && typeof body.payment === "object" ? body.payment : null;
  const subscription = body.subscription && typeof body.subscription === "object" ? body.subscription : null;
  const subscriptionId = payment?.subscription || subscription?.id || null;
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(payment?.dueDate ?? "") ? payment.dueDate : null;
  const origem = payment?.id || subscription?.id || "sem-objeto";
  const eventId = typeof body.id === "string" && body.id ? body.id.slice(0, 200) : `${body.event}:${origem}`;
  return { eventId, event: body.event, subscriptionId, dueDate };
}
