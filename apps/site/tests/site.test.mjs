import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function sha256(relativePath) {
  const contents = await readFile(new URL(relativePath, root));
  return createHash("sha256").update(contents).digest("hex");
}

test("mantém marca, projeto e links de download publicados", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");

  assert.match(page, /Arqevon Code/);
  assert.match(page, /Arqevon Finance/);
  assert.match(page, /Arqevon-Finance-1\.0\.6-Windows-x64-Setup\.exe/);
  assert.match(page, /Arqevon-Finance-1\.0\.6-macOS-Apple-Silicon\.dmg/);
  assert.match(page, /Versão 1\.0\.6/);
});

test("preserva os instaladores exatos do baseline 1.0.6", async () => {
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.6-Windows-x64-Setup.exe"),
    "053b83ab64a7befc9385a81c6e815a8940b4c93c2e27301c1b929204ddd0d079",
  );
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.6-macOS-Apple-Silicon.dmg"),
    "05d2a99f95aab6f1f673c895e47d9ef652a8efba8f153b1a48ceb7482a3ec16a",
  );
});

// A 1.0.5 continua hospedada para não quebrar links já enviados a clientes.
test("mantém os instaladores da 1.0.5 acessíveis", async () => {
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.5-Windows-x64-Setup-v3.exe"),
    "c51bbc9d8b0b96bef3d15a2f06b2002178db92aab70968e28d0cceb214d8ce48",
  );
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.5-macOS-Apple-Silicon.dmg"),
    "b44b34502cff2a7117032a250c3ae3ad56b80733045831411c8138f937a160ff",
  );
});

test("mantém a rota curta apontando para projetos", async () => {
  const route = await readFile(new URL("app/p/route.ts", root), "utf8");
  assert.match(route, /\/#projetos/);
  assert.match(route, /302/);
});
