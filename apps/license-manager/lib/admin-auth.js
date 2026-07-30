import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "myfinance_admin";
const MAX_AGE = 60 * 60 * 12;
const encoded = value => Buffer.from(value).toString("base64url");

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("ADMIN_SESSION_SECRET deve ter ao menos 32 caracteres.");
  return value;
}

function signature(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function validAdminCredentials(email, password) {
  return safeEqual(email.trim().toLowerCase(), (process.env.ADMIN_EMAIL || "").trim().toLowerCase())
    && safeEqual(password, process.env.ADMIN_PASSWORD || "");
}

export async function createAdminSession() {
  const payload = encoded(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE }));
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${signature(payload)}`, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
}

export async function destroyAdminSession() {
  const jar = await cookies();
  jar.set(COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

export async function isAdmin() {
  try {
    const jar = await cookies(); const token = jar.get(COOKIE)?.value;
    if (!token) return false;
    const [payload, sig] = token.split(".");
    if (!payload || !sig || !safeEqual(sig, signature(payload))) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return Number(data.exp) > Math.floor(Date.now() / 1000);
  } catch { return false; }
}
