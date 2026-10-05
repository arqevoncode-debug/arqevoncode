import { webhookTokenValido } from "./billing.js";

const BASE = "https://public-api.kiwify.com/v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// O token OAuth vale 24 h e a Kiwify pede para não gerar um a cada chamada. Cada instância da
// Vercel guarda o seu; gerar alguns por dia está bem dentro do limite de 100 chamadas/minuto.
let token = null;

function credenciais() {
  const { KIWIFY_CLIENT_ID: clientId, KIWIFY_CLIENT_SECRET: clientSecret, KIWIFY_ACCOUNT_ID: accountId } = process.env;
  if (!clientId || !clientSecret || !accountId) throw new Error("Credenciais da Kiwify não configuradas.");
  return { clientId, clientSecret, accountId };
}

async function bearer() {
  if (token && token.expiraEm > Date.now() + 5 * 60_000) return token.valor;
  const { clientId, clientSecret } = credenciais();
  const response = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(`Kiwify OAuth: ${response.status} ${data.message || ""}`.trim());
  token = { valor: data.access_token, expiraEm: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return token.valor;
}

export async function kiwify(path, { method = "GET", body } = {}) {
  const { accountId } = credenciais();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${await bearer()}`, "x-kiwify-account-id": accountId, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  // A API responde 200 com {"error": "..."} em algumas falhas (pedido inexistente, erro interno).
  // Tratar isso como sucesso faria uma compra real virar "ignorada" numa instabilidade da Kiwify.
  if (!response.ok || typeof data?.error === "string") {
    const error = new Error(`Kiwify ${method} ${path}: ${response.status} ${data.message || data.error || ""}`.trim());
    error.status = response.status;
    throw error;
  }
  return data;
}

/** A chave secreta vai na URL do webhook, que nós cadastramos: só a Kiwify a conhece. */
export function kiwifyWebhookKeyValida(recebida, esperada = process.env.KIWIFY_WEBHOOK_KEY) {
  return webhookTokenValido(recebida, esperada);
}

const texto = v => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Lê do aviso só o que não dá para obter da venda na API: o tipo do evento, a assinatura e o
 * plano. O formato não é documentado publicamente, então vários nomes são aceitos. Status,
 * e-mail e vínculo com a conta vêm sempre da API (getSale), nunca daqui.
 */
export function parseKiwifyWebhook(body) {
  if (!body || typeof body !== "object") return null;
  const sub = body.Subscription || body.subscription || null;
  const produto = body.Product || body.product || null;
  const orderId = texto(body.order_id) || texto(body.order?.id) || texto(body.order_ref) || null;
  if (!orderId) return null;
  return {
    orderId,
    eventType: (texto(body.webhook_event_type) || texto(body.event) || texto(body.trigger) || "").toLowerCase() || null,
    subscriptionId: texto(body.subscription_id) || texto(sub?.id) || null,
    frequency: (texto(sub?.plan?.frequency) || texto(body.plan?.frequency) || "").toLowerCase() || null,
    planName: texto(sub?.plan?.name) || texto(body.plan?.name) || null,
    productId: texto(produto?.product_id) || texto(produto?.id) || texto(body.product_id) || null,
  };
}

// Nomes do evento: os do payload (inglês) e os dos gatilhos do painel (português).
const APROVACAO = new Set(["order_approved", "compra_aprovada"]);
const RENOVACAO = new Set(["subscription_renewed"]);
const ESTORNO = new Set(["order_refunded", "compra_reembolsada", "chargeback"]);

/**
 * Decide o efeito juntando o tipo do aviso com o status real da venda na API.
 * O aviso sozinho nunca libera nada: "paid" exige a venda paga na Kiwify.
 */
export function classificarKiwify(eventType, saleStatus) {
  const status = String(saleStatus || "").toLowerCase();
  const pago = status === "paid" || status === "approved";
  const estornado = status === "refunded" || status === "chargedback" || status === "chargeback";
  if (ESTORNO.has(eventType) || (!eventType && estornado)) return estornado ? "revoked" : "ignored";
  if (RENOVACAO.has(eventType)) return pago ? "renewed" : "ignored";
  if (APROVACAO.has(eventType) || !eventType) return pago ? "approved" : "ignored";
  // subscription_canceled e subscription_late não mudam nada: o acesso vale até o fim do período
  // pago (mais a carência) e simplesmente não é renovado.
  return "ignored";
}

/** Plano pela frequência da assinatura, pelo nome do plano ou pelo produto (KIWIFY_PRODUCT_PLANS). */
export function planoKiwify({ frequency, planName, productId }, mapa = process.env.KIWIFY_PRODUCT_PLANS) {
  if (/^(monthly|month|mensal)$/.test(frequency || "")) return "pro_mensal";
  if (/^(yearly|year|annually|annual|anual)$/.test(frequency || "")) return "pro_anual";
  if (/anual/i.test(planName || "")) return "pro_anual";
  if (/mensal/i.test(planName || "")) return "pro_mensal";
  try {
    const porProduto = mapa ? JSON.parse(mapa) : {};
    if (productId && typeof porProduto[productId] === "string") return porProduto[productId];
  } catch { /* mapa inválido: cai no null */ }
  return null;
}

/** Conta do comprador: o id que o nosso link pôs em sck, se for um UUID. */
export function contaDoSck(sale) {
  const sck = texto(sale?.tracking?.sck);
  return sck && UUID.test(sck) ? sck.toLowerCase() : null;
}

/** Link de pagamento do plano, com o e-mail da conta e o id dela em sck para o vínculo voltar na venda. */
export function kiwifyCheckoutUrl(planId, user, urls = process.env.KIWIFY_CHECKOUT_URLS) {
  let base;
  try { base = JSON.parse(urls || "{}")[planId]; } catch { base = null; }
  if (!base) return null;
  const url = new URL(base);
  url.searchParams.set("sck", user.id);
  if (user.email) url.searchParams.set("email", user.email);
  return url.toString();
}

/**
 * Cópia do aviso para o registro de eventos, sem os dados do comprador (nome, CPF, endereço,
 * telefone, cartão). O registro serve para auditar o pagamento, não para guardar cadastro.
 */
export function semDadosPessoais(body) {
  const PESSOAIS = /^(customer|cliente|card|cartao|address|endereco|cpf|cnpj|mobile|phone|telefone|email|name|nome|ip|instagram|document)/i;
  const limpar = valor => {
    if (Array.isArray(valor)) return valor.map(limpar);
    if (!valor || typeof valor !== "object") return valor;
    return Object.fromEntries(Object.entries(valor).filter(([k]) => !PESSOAIS.test(k)).map(([k, v]) => [k, limpar(v)]));
  };
  return limpar(body);
}

/** Dia (UTC) do processamento: separa renovações do mesmo pedido em meses diferentes. */
export const diaUtc = (agora = new Date()) => agora.toISOString().slice(0, 10);
