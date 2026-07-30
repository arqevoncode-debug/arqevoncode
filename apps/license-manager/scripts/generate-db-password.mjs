import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const password = randomBytes(24).toString("base64url") + "!9Aa";
await writeFile(resolve(".supabase-db-password"), password, { mode: 0o600 });
console.log("Senha forte do banco gerada em arquivo local protegido.");
