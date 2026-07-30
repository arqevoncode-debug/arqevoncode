import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("gera frontend autocontido com licenciamento configurado", async () => {
  const [html, desktop] = await Promise.all([
    readFile(new URL("dist/index.html", root), "utf8"),
    readFile(new URL("dist/desktop.js", root), "utf8"),
  ]);

  assert.match(html, /id="licencaTela"/);
  assert.match(html, /id="formLanc"/);
  assert.match(html, /id="btnImportar"/);
  assert.match(html, /id="btnResetar"/);
  assert.doesNotMatch(desktop, /__LICENSE_(?:API_BASE|PUBLIC_KEY)__/);
  assert.match(desktop, /https:\/\/myfinance-license-manager\.vercel\.app/);
  assert.match(desktop, /BEGIN PUBLIC KEY/);
});

test("mantém o CSP restrito à origem da API de licenças", async () => {
  const csp = JSON.parse(await readFile(new URL("src-tauri/tauri.conf.json", root), "utf8")).app.security.csp;
  const connectSrc = csp.split(";").map(d => d.trim()).find(d => d.startsWith("connect-src"));

  assert.ok(connectSrc, "connect-src deve estar declarado no CSP");
  // Um esquema solto (https:) reabre a conexão para qualquer host; a origem precisa ser explícita.
  assert.doesNotMatch(connectSrc, /\shttps:(\s|$)/, "connect-src não deve liberar https: genérico");
  assert.match(connectSrc, /https:\/\/myfinance-license-manager\.vercel\.app/);
});

test("recusa build cuja API de licenças o CSP bloquearia", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { fileURLToPath } = await import("node:url");
  const erro = await promisify(execFile)("node", ["scripts/build-frontend.mjs"], {
    cwd: fileURLToPath(root), env: { ...process.env, LICENSE_API_BASE: "https://origem-nao-permitida.example" },
  }).then(() => null, e => e);

  assert.ok(erro, "o build deveria falhar quando a origem não é permitida pelo CSP");
  assert.match(erro.stderr, /não é permitido pelo connect-src/);
});

test("preserva controles críticos de dados e lançamentos", async () => {
  const source = await readFile(new URL("meu-financeiro.html", root), "utf8");

  assert.match(source, /data-acao="editar"/);
  assert.match(source, /data-acao="excluir"/);
  assert.match(source, /id="resetAceitar"/);
  assert.match(source, /Exportar backup/);
  assert.match(source, /Importar backup/);
  assert.match(source, /Gastos por categoria/);
});
