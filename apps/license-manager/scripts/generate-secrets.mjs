import { generateKeyPairSync, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const privatePem = privateKey.export({ type: "pkcs8", format: "pem" }).trim().replace(/\n/g, "\\n");
const publicPem = publicKey.export({ type: "spki", format: "pem" }).trim().replace(/\n/g, "\\n");

const writeAt = process.argv.indexOf("--write");
if (writeAt >= 0) {
  const target = resolve(process.argv[writeAt + 1] || ".");
  await writeFile(resolve(target, ".license-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }));
  await writeFile(resolve(target, ".license-public.pem"), publicKey.export({ type: "spki", format: "pem" }));
  await writeFile(resolve(target, ".admin-session-secret"), randomBytes(32).toString("base64url"));
  process.stdout.write(`Segredos gravados em ${target}\n`);
  process.exit(0);
}

process.stdout.write([
  `ADMIN_SESSION_SECRET=${randomBytes(32).toString("base64url")}`,
  `LICENSE_SIGNING_PRIVATE_KEY="${privatePem}"`,
  `LICENSE_SIGNING_PUBLIC_KEY="${publicPem}"`,
].join("\n") + "\n");
