import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const password = randomBytes(18).toString("base64url") + "!9Aa";
await writeFile(resolve(".admin-password"), password, { mode: 0o600 });
console.log("Senha administrativa gerada em arquivo local protegido.");
