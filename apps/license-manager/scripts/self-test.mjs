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
console.log("Self-test de licenças concluído com sucesso.");
