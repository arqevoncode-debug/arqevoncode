import { importPKCS8, importSPKI, jwtVerify, SignJWT } from "jose";

const ALG = "EdDSA";
let signingKey;
let verificationKey;

function privateKeyPem() {
  const value = process.env.LICENSE_SIGNING_PRIVATE_KEY;
  if (!value) throw new Error("LICENSE_SIGNING_PRIVATE_KEY não configurada.");
  return value.replace(/\\n/g, "\n");
}

async function getSigningKey() {
  if (!signingKey) signingKey = await importPKCS8(privateKeyPem(), ALG);
  return signingKey;
}

async function getVerificationKey() {
  if (!verificationKey) {
    const value = process.env.LICENSE_SIGNING_PUBLIC_KEY;
    if (!value) throw new Error("LICENSE_SIGNING_PUBLIC_KEY não configurada.");
    verificationKey = await importSPKI(value.replace(/\\n/g, "\n"), ALG);
  }
  return verificationKey;
}

export async function createActivationToken(data) {
  return new SignJWT({
    activationId: data.activation_id,
    deviceId: data.device_id,
    plan: data.plan,
    maxDevices: data.max_devices,
    customerName: data.customer_name,
  }).setProtectedHeader({ alg: ALG, typ: "JWT" })
    .setSubject(data.license_id).setIssuer("myfinance-license-server").setAudience("myfinance-desktop")
    .setIssuedAt().setExpirationTime("30d").sign(await getSigningKey());
}

export async function verifyActivationToken(token) {
  const { payload } = await jwtVerify(token, await getVerificationKey(), {
    issuer: "myfinance-license-server", audience: "myfinance-desktop", algorithms: [ALG],
  });
  return payload;
}
