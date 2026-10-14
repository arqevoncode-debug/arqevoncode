// A Vercel recusa o deploy inteiro se vercel.json fugir do formato dela, e isso só aparece na
// hora de publicar. Aqui conferimos o formato e os cabeçalhos de segurança antes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

test("vercel.json no formato aceito pela Vercel", () => {
  assert.deepEqual(Object.keys(cfg).sort(), ["buildCommand", "headers", "outputDirectory"]);
  for (const regra of cfg.headers) {
    assert.deepEqual(Object.keys(regra).sort(), ["headers", "source"], JSON.stringify(regra).slice(0, 80));
    for (const h of regra.headers) assert.deepEqual(Object.keys(h).sort(), ["key", "value"], JSON.stringify(h).slice(0, 80));
  }
});

test("todas as páginas com CSP rígido e o service worker sem cache", () => {
  const todas = cfg.headers.find(r => r.source === "/(.*)").headers;
  const csp = todas.find(h => h.key === "Content-Security-Policy").value;
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*https?:/, "nenhum script de outro domínio");
  const sw = cfg.headers.find(r => r.source === "/sw.js").headers;
  assert.equal(sw.find(h => h.key === "Cache-Control").value, "no-cache");
});
