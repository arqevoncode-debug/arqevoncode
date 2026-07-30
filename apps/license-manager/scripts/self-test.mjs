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

console.log("Self-test de licenças e feedback concluído com sucesso.");
