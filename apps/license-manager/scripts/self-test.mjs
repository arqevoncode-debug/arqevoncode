import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { generateLicenseKey, hashLicenseKey, normalizeLicenseKey } from "../lib/licenses.js";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
process.env.LICENSE_SIGNING_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" });
process.env.LICENSE_SIGNING_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" });

const { createActivationToken, verifyActivationToken } = await import("../lib/activation-token.js");

const key = generateLicenseKey();
assert.match(key, /^MYF(?:-[A-Z2-9]{5}){4}$/);
assert.equal(normalizeLicenseKey(key), key.replaceAll("-", ""));
assert.equal(hashLicenseKey(key).length, 64);

const source = {
  activation_id: "10000000-0000-4000-8000-000000000001",
  device_id: "20000000-0000-4000-8000-000000000002",
  license_id: "30000000-0000-4000-8000-000000000003",
  plan: "individual", max_devices: 1, customer_name: "Cliente teste",
};
const token = await createActivationToken(source);
const payload = await verifyActivationToken(token);
assert.equal(payload.sub, source.license_id);
assert.equal(payload.activationId, source.activation_id);
assert.equal(payload.deviceId, source.device_id);
assert.equal(payload.aud, "myfinance-desktop");
assert.equal(payload.exp - payload.iat, 30 * 24 * 60 * 60);

const { normalizeFeedback, MESSAGE_MIN, MESSAGE_MAX } = await import("../lib/feedback.js");

// Categoria desconhecida cai no padrão em vez de violar a check constraint da tabela.
const padrao = normalizeFeedback({ message: "x".repeat(MESSAGE_MIN), category: "inventada" });
assert.equal(padrao.ok, true);
assert.equal(padrao.value.category, "sugestao");

const valido = normalizeFeedback({ message: "  O gráfico por categoria ajudaria muito.  ", category: "problema", appVersion: "1.0.6" });
assert.equal(valido.ok, true);
assert.equal(valido.value.category, "problema");
assert.equal(valido.value.message, "O gráfico por categoria ajudaria muito.");
assert.equal(valido.value.appVersion, "1.0.6");

// O trim acontece antes da checagem de tamanho: espaços não valem como conteúdo.
assert.equal(normalizeFeedback({ message: `${" ".repeat(40)}curto` }).ok, false);
assert.equal(normalizeFeedback({ message: "x".repeat(MESSAGE_MIN - 1) }).ok, false);
assert.equal(normalizeFeedback({ message: "x".repeat(MESSAGE_MAX + 1) }).ok, false);
assert.equal(normalizeFeedback({}).ok, false);
assert.equal(normalizeFeedback({ message: "x".repeat(MESSAGE_MAX) }).ok, true);
assert.equal(normalizeFeedback({ message: "x".repeat(MESSAGE_MIN), appVersion: "" }).value.appVersion, null);

const { normalizeLicenseRequest } = await import("../lib/license-requests.js");

// E-mail é o único campo obrigatório, e chega normalizado para o banco.
const pedido = normalizeLicenseRequest({ email: "  Cliente@Exemplo.COM  ", name: "  Marina  " });
assert.equal(pedido.ok, true);
assert.equal(pedido.value.email, "cliente@exemplo.com");
assert.equal(pedido.value.name, "Marina");
assert.equal(pedido.value.platform, "windows");

// Plataforma desconhecida cai no padrão em vez de violar a check constraint.
assert.equal(normalizeLicenseRequest({ email: "a@b.co", platform: "linux" }).value.platform, "windows");
assert.equal(normalizeLicenseRequest({ email: "a@b.co", platform: "macos" }).value.platform, "macos");
// Nome vazio virá null, não string vazia.
assert.equal(normalizeLicenseRequest({ email: "a@b.co", name: "   " }).value.name, null);

for (const invalido of ["", "   ", "sem-arroba", "a@b", "a@b.", "@b.co", "a b@c.co"]) {
  assert.equal(normalizeLicenseRequest({ email: invalido }).ok, false, `deveria recusar: ${JSON.stringify(invalido)}`);
}

const { clientHash } = await import("../lib/client-hash.js");
process.env.ADMIN_SESSION_SECRET = "a".repeat(40);
const req = ip => ({ headers: { get: nome => (nome === "x-forwarded-for" ? ip : null) } });
// Mesmo IP gera o mesmo hash; IPs diferentes, hashes diferentes; e o IP não aparece nele.
assert.equal(clientHash(req("203.0.113.7")), clientHash(req("203.0.113.7")));
assert.notEqual(clientHash(req("203.0.113.7")), clientHash(req("203.0.113.8")));
assert.equal(clientHash(req("203.0.113.7")).length, 64);
assert.ok(!clientHash(req("203.0.113.7")).includes("203"));
// Só o primeiro endereço da cadeia importa: os demais são anexados por proxies.
assert.equal(clientHash(req("203.0.113.7, 70.41.3.18")), clientHash(req("203.0.113.7")));

const { bearerToken, isTokenError } = await import("../lib/account-link.js");

const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJh";
assert.equal(bearerToken(`Bearer ${jwt}`), jwt);
assert.equal(bearerToken(`  bearer   ${jwt}  `), jwt, "o esquema não diferencia maiúsculas (RFC 7235)");
for (const ruim of [undefined, null, "", "Bearer", `Basic ${jwt}`, `Bearer ${jwt} extra`, "Bearer a.b", "Bearer a.b.c.d", `Bearer ${jwt}<script>`]) {
  assert.equal(bearerToken(ruim), null, `deveria recusar: ${JSON.stringify(ruim)}`);
}
// Comprovante assinado por outra chave, expirado ou malformado é recusa (401), não falha do servidor.
const { generateKeyPairSync: outraChave } = await import("node:crypto");
const { SignJWT, importPKCS8 } = await import("jose");
const intrusa = await importPKCS8(outraChave("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }), "EdDSA");
const forjado = await new SignJWT({}).setProtectedHeader({ alg: "EdDSA" }).setSubject(source.license_id)
  .setIssuer("myfinance-license-server").setAudience("myfinance-desktop").setExpirationTime("1d").sign(intrusa);
for (const recusado of [forjado, "lixo", ""]) {
  const erro = await verifyActivationToken(recusado).then(() => null, e => e);
  assert.ok(isTokenError(erro), `deveria ser erro de token: ${JSON.stringify(recusado.slice(0, 12))} → ${erro?.code}`);
}
assert.equal(isTokenError(new Error("rede")), false);
assert.equal(isTokenError({ code: "PGRST301" }), false);

const { asaasConfig, asaasCycle, hojeEmBrasilia, normalizeCpf, webhookTokenValido, parseAsaasEvent } = await import("../lib/billing.js");

// O ambiente sai da chave: chave de sandbox nunca fala com a produção, e vice-versa.
assert.equal(asaasConfig("$aact_hmlg_abc").baseUrl, "https://api-sandbox.asaas.com/v3");
assert.equal(asaasConfig("$aact_prod_abc").baseUrl, "https://api.asaas.com/v3");
assert.throws(() => asaasConfig(""), /ASAAS_API_KEY/);

assert.deepEqual(asaasCycle({ id: "pro_mensal", billing_interval: "month" }), { cycle: "MONTHLY", billingType: "CREDIT_CARD" });
assert.deepEqual(asaasCycle({ id: "pro_anual", billing_interval: "year" }), { cycle: "YEARLY", billingType: "UNDEFINED" });
assert.throws(() => asaasCycle({ id: "free", billing_interval: "none" }));

// 02:30 UTC ainda é o dia anterior em Brasília: a cobrança não pode vencer "amanhã".
assert.equal(hojeEmBrasilia(new Date("2026-10-06T02:30:00Z")), "2026-10-05");

assert.equal(normalizeCpf("529.982.247-25"), "52998224725");
for (const invalido of ["529.982.247-24", "111.111.111-11", "123", "", null, "abcdefghijk"]) {
  assert.equal(normalizeCpf(invalido), null, `CPF deveria ser recusado: ${invalido}`);
}

const tokenWebhook = "t".repeat(40);
assert.equal(webhookTokenValido(tokenWebhook, tokenWebhook), true);
assert.equal(webhookTokenValido("errado", tokenWebhook), false);
assert.equal(webhookTokenValido(null, tokenWebhook), false);
// Sem token configurado (ou curto demais), nenhum aviso é aceito.
assert.equal(webhookTokenValido("", ""), false);
assert.equal(webhookTokenValido("curto", "curto"), false);

assert.deepEqual(
  parseAsaasEvent({ id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1", subscription: "sub_1", dueDate: "2026-10-05" } }),
  { eventId: "evt_1", event: "PAYMENT_CONFIRMED", subscriptionId: "sub_1", dueDate: "2026-10-05" },
);
assert.deepEqual(
  parseAsaasEvent({ event: "SUBSCRIPTION_DELETED", subscription: { id: "sub_2" } }),
  { eventId: "SUBSCRIPTION_DELETED:sub_2", event: "SUBSCRIPTION_DELETED", subscriptionId: "sub_2", dueDate: null },
);
assert.equal(parseAsaasEvent({ event: "PAYMENT_CONFIRMED", payment: { id: "pay_3" } }).subscriptionId, null);
assert.equal(parseAsaasEvent({ event: "PAYMENT_CONFIRMED", payment: { dueDate: "05/10/2026" } }).dueDate, null);
assert.equal(parseAsaasEvent(null), null);
assert.equal(parseAsaasEvent({ payment: {} }), null);

// ---------- Kiwify ----------
const kw = await import("../lib/kiwify.js");

// Aviso: aceita os nomes conhecidos e exige o pedido.
assert.equal(kw.parseKiwifyWebhook(null), null);
assert.equal(kw.parseKiwifyWebhook({ webhook_event_type: "order_approved" }), null, "sem pedido não há o que conferir");
assert.deepEqual(kw.parseKiwifyWebhook({
  order_id: "ord-1", webhook_event_type: "Order_Approved",
  Subscription: { id: "sub-1", plan: { frequency: "Monthly", name: "Mensal" } },
  Product: { product_id: "prod-1" },
}), { orderId: "ord-1", eventType: "order_approved", subscriptionId: "sub-1", frequency: "monthly", planName: "Mensal", productId: "prod-1" });
assert.equal(kw.parseKiwifyWebhook({ order: { id: "ord-2" } }).eventType, null);

// O aviso sozinho nunca libera: precisa da venda paga na API.
assert.equal(kw.classificarKiwify("order_approved", "paid"), "approved");
assert.equal(kw.classificarKiwify("compra_aprovada", "paid"), "approved");
assert.equal(kw.classificarKiwify("order_approved", "waiting_payment"), "ignored");
assert.equal(kw.classificarKiwify("order_approved", "refunded"), "ignored");
assert.equal(kw.classificarKiwify("subscription_renewed", "paid"), "renewed");
assert.equal(kw.classificarKiwify("subscription_renewed", "refused"), "ignored");
assert.equal(kw.classificarKiwify("order_refunded", "refunded"), "revoked");
assert.equal(kw.classificarKiwify("chargeback", "chargedback"), "revoked");
assert.equal(kw.classificarKiwify("order_refunded", "paid"), "ignored", "reembolso que a API não confirma não revoga");
// Cancelar ou atrasar a assinatura não mexe no acesso: ele só não é renovado.
assert.equal(kw.classificarKiwify("subscription_canceled", "paid"), "ignored");
assert.equal(kw.classificarKiwify("subscription_late", "paid"), "ignored");
assert.equal(kw.classificarKiwify("pix_created", "waiting_payment"), "ignored");
// Sem tipo, decide pelo status, e uma aprovação sem tipo usa a data da compra (não estende).
assert.equal(kw.classificarKiwify(null, "paid"), "approved");
assert.equal(kw.classificarKiwify(null, "refunded"), "revoked");

assert.equal(kw.planoKiwify({ frequency: "monthly" }), "pro_mensal");
assert.equal(kw.planoKiwify({ frequency: "yearly" }), "pro_anual");
assert.equal(kw.planoKiwify({ planName: "Plano Anual" }), "pro_anual");
assert.equal(kw.planoKiwify({ productId: "p1" }, '{"p1":"pro_anual"}'), "pro_anual");
assert.equal(kw.planoKiwify({ productId: "p2" }, '{"p1":"pro_anual"}'), null);
assert.equal(kw.planoKiwify({ productId: "p1" }, "lixo"), null);

const conta = "c0ffee00-0000-4000-8000-000000000001";
assert.equal(kw.contaDoSck({ tracking: { sck: conta.toUpperCase() } }), conta);
for (const sck of [null, "", "abc", "1; drop table", undefined]) assert.equal(kw.contaDoSck({ tracking: { sck } }), null);
assert.equal(kw.contaDoSck({}), null);

const link = new URL(kw.kiwifyCheckoutUrl("pro_mensal", { id: conta, email: "a+b@c.com" }, '{"pro_mensal":"https://pay.kiwify.com.br/AbC123?coupon=X"}'));
assert.equal(link.origin + link.pathname, "https://pay.kiwify.com.br/AbC123");
assert.equal(link.searchParams.get("sck"), conta);
assert.equal(link.searchParams.get("email"), "a+b@c.com");
assert.equal(link.searchParams.get("coupon"), "X", "parâmetros do link original são mantidos");
assert.equal(kw.kiwifyCheckoutUrl("pro_anual", { id: conta }, '{"pro_mensal":"https://x.y/z"}'), null);
assert.equal(kw.kiwifyCheckoutUrl("pro_mensal", { id: conta }, "lixo"), null);

assert.equal(kw.kiwifyWebhookKeyValida("x".repeat(40), "x".repeat(40)), true);
assert.equal(kw.kiwifyWebhookKeyValida("y".repeat(40), "x".repeat(40)), false);
assert.equal(kw.kiwifyWebhookKeyValida(null, "x".repeat(40)), false);
assert.equal(kw.kiwifyWebhookKeyValida("curta", "curta"), false, "chave curta demais não vale");

const limpo = kw.semDadosPessoais({ order_id: "o", Customer: { email: "a@b", CPF: "1" }, Subscription: { id: "s", plan: { frequency: "monthly" } }, card_last_digits: "1234", items: [{ customer_name: "x", sku: 1 }] });
assert.deepEqual(limpo, { order_id: "o", Subscription: { id: "s", plan: { frequency: "monthly" } }, items: [{ sku: 1 }] });
assert.equal(kw.diaUtc(new Date("2026-10-05T23:30:00-03:00")), "2026-10-06");

// Erro devolvido com status 200 precisa virar exceção (500 no webhook, e a Kiwify reenvia).
{
  const fetchOriginal = globalThis.fetch;
  Object.assign(process.env, { KIWIFY_CLIENT_ID: "id", KIWIFY_CLIENT_SECRET: "segredo", KIWIFY_ACCOUNT_ID: "conta" });
  const respostas = { "/oauth/token": { access_token: "t", expires_in: 86400 }, "/sales/ok": { id: "ok", status: "paid" }, "/sales/erro": { error: "TypeError: x" } };
  globalThis.fetch = async url => new Response(JSON.stringify(respostas[new URL(url).pathname.replace("/v1", "")]), { status: 200 });
  try {
    assert.equal((await kw.kiwify("/sales/ok")).status, "paid");
    await assert.rejects(() => kw.kiwify("/sales/erro"), /TypeError: x/);
  } finally { globalThis.fetch = fetchOriginal; }
}

console.log("Self-test de licenças, feedback, pedidos, contas e pagamentos concluído com sucesso.");
