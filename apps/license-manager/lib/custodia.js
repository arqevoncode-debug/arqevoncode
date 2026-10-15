import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Custódia da chave dos dados (DEK) da nuvem. A chave mestra (VAULT_CUSTODY_KEY, 32 bytes em base64)
// existe só no ambiente do license-manager: o banco guarda a DEK cifrada por ela, então quem tiver
// só o banco ou as cópias de segurança não abre os dados. A conta e o kid entram como dado
// autenticado: uma DEK guardada não serve para outra conta nem para outra geração de chave.

export function chaveMestra(env = process.env) {
  const bruta = Buffer.from(String(env.VAULT_CUSTODY_KEY || ""), "base64");
  if (bruta.length !== 32) throw new Error("VAULT_CUSTODY_KEY ausente ou inválida (32 bytes em base64).");
  return bruta;
}

const contexto = (userId, kid) => Buffer.from(`arqevon/custodia/v1:${userId}:${kid}`);

export function guardarDek(dek, userId, kid, mestra = chaveMestra()) {
  if (!(dek instanceof Buffer) || dek.length !== 32) throw new Error("DEK inválida.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", mestra, iv);
  c.setAAD(contexto(userId, kid));
  const ct = Buffer.concat([c.update(dek), c.final()]);
  return `v1.${iv.toString("base64")}.${Buffer.concat([ct, c.getAuthTag()]).toString("base64")}`;
}

export function abrirDek(guardada, userId, kid, mestra = chaveMestra()) {
  const [versao, ivB64, ctB64] = String(guardada).split(".");
  if (versao !== "v1") throw new Error("Formato de custódia desconhecido.");
  const bytes = Buffer.from(ctB64, "base64");
  const d = createDecipheriv("aes-256-gcm", mestra, Buffer.from(ivB64, "base64"));
  d.setAAD(contexto(userId, kid));
  d.setAuthTag(bytes.subarray(bytes.length - 16));
  return Buffer.concat([d.update(bytes.subarray(0, bytes.length - 16)), d.final()]);
}
