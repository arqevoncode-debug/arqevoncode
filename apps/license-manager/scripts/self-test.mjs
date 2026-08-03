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

console.log("Self-test de licenças, feedback e pedidos concluído com sucesso.");
