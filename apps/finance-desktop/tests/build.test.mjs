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

test("preserva controles críticos de dados e lançamentos", async () => {
  const source = await readFile(new URL("meu-financeiro.html", root), "utf8");

  assert.match(source, /data-acao="editar"/);
  assert.match(source, /data-acao="excluir"/);
  assert.match(source, /id="resetAceitar"/);
  assert.match(source, /Exportar backup/);
  assert.match(source, /Importar backup/);
  assert.match(source, /Gastos por categoria/);
});
