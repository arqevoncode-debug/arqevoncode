import crypto from "node:crypto";

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function normalizeLicenseKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashLicenseKey(value) {
  return crypto.createHash("sha256").update(normalizeLicenseKey(value)).digest("hex");
}

export function generateLicenseKey() {
  const bytes = crypto.randomBytes(20);
  let value = "";
  for (let i = 0; i < 20; i++) value += ALPHABET[bytes[i] % ALPHABET.length];
  return `MYF-${value.match(/.{1,5}/g).join("-")}`;
}
