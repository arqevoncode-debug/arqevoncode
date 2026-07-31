import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// O Tauri lê o certificado do Windows de bundle.windows.certificateThumbprint.
// O thumbprint só existe depois de importar o .pfx no runner, então ele é gravado
// aqui em vez de ficar versionado no tauri.conf.json.
const thumbprint = (process.env.WINDOWS_CERTIFICATE_THUMBPRINT || "").replace(/[^0-9A-Fa-f]/g, "");
if (!thumbprint) throw new Error("WINDOWS_CERTIFICATE_THUMBPRINT ausente ou sem dígitos hexadecimais.");

const conf = resolve(import.meta.dirname, "../src-tauri/tauri.conf.json");
const config = JSON.parse(await readFile(conf, "utf8"));
config.bundle ??= {};
config.bundle.windows = {
  ...config.bundle.windows,
  certificateThumbprint: thumbprint,
  digestAlgorithm: "sha256",
  // Sem carimbo de tempo a assinatura deixa de ser válida quando o certificado expira.
  timestampUrl: process.env.WINDOWS_TIMESTAMP_URL || "http://timestamp.digicert.com",
};
await writeFile(conf, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Assinatura do Windows configurada (thumbprint ${thumbprint.slice(0, 8)}…).`);
