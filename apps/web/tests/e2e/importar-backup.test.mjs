// Link /#importar: os clientes do app antigo para computador trazem o backup (.myfinance) para o
// app web. A janela não aparece no app; só esse link a abre.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { banco, servir, navegador, abrirApp, entrarPorCodigo, espera, lerLocal, lanc, VAZIO } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });
const dir = mkdtempSync(join(tmpdir(), "arqevon-imp-"));
const arquivo = (nome, conteudo) => { const c = join(dir, nome); writeFileSync(c, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo)); return c; };
const DO_DESKTOP = { ...VAZIO(),
  lancamentos: [lanc("d1", "Mercado do desktop", 250), lanc("d2", "Farmácia do desktop", 40)],
  fixos: [{ id: "f", tipo: "receita", descricao: "Salário", valor: 5000, categoria: "outros", dia: 5 }] };

/** Backup protegido no formato do app desktop: PBKDF2 250 mil + AES-GCM, conteúdo em { data }. */
const myfinance = (p, senha, dados) => p.evaluate(async (senha, dados) => {
  const b = u => btoa(String.fromCharCode(...new Uint8Array(u)));
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  const k = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" }, mat, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(JSON.stringify({ data: dados })));
  return JSON.stringify({ format: "myfinance-backup", version: 1, iterations: 250000, salt: b(salt), iv: b(iv), ciphertext: b(ct) });
}, senha, dados);
const aberta = p => p.$eval("#modalImportar", d => d.open);
const comLink = async p => { await p.evaluate(() => { location.hash = "#importar"; location.reload(); }); await p.waitForSelector("#formLanc"); await espera(1200); };

test("sem o link, a janela não abre e nada no app leva a ela", async () => {
  const db = banco(); db.conta("uid-a", "ana@teste.com", { cloud: true });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  assert.equal(await aberta(p), false);
  assert.doesNotMatch(await p.evaluate(() => document.body.innerText), /Trazer seus dados|backup/i);
  await p.fechar();
});

test("cliente logado abre o link, erra a senha, acerta e os dados do desktop entram", async () => {
  const db = banco(); db.conta("uid-a", "ana@teste.com", { cloud: true });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await comLink(p);
  assert.equal(await aberta(p), true);
  assert.equal(await p.evaluate(() => location.hash), "", "o link some do endereço");
  const caminho = arquivo("backup.myfinance", await myfinance(p, "senha-antiga", DO_DESKTOP));
  await (await p.$("#arqBackup")).uploadFile(caminho);
  await p.waitForFunction(() => !document.querySelector("#impCampoSenha").hidden);
  await p.type("#impSenha", "errada");
  await p.click("#impImportar");
  await p.waitForFunction(() => !document.querySelector("#impErro").hidden, { timeout: 15000 });
  assert.match(await p.$eval("#impErro", e => e.textContent), /Senha incorreta/);
  await p.$eval("#impSenha", e => { e.value = ""; });
  await p.type("#impSenha", "senha-antiga");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector("#modalImportar").open, { timeout: 15000 });
  const d = await lerLocal(p);
  assert.deepEqual(d.lancamentos.map(l => l.descricao), ["Mercado do desktop", "Farmácia do desktop"]);
  assert.equal(d.fixos.length, 1);
  assert.match(await p.evaluate(() => document.body.innerText), /Mercado do desktop|5\.000,00/);
  // vai para a nuvem da conta (e aparece no celular): 2 lançamentos + 1 fixo
  for (let i = 0; i < 40 && db.vivos("uid-a") < 3; i++) await espera(250);
  assert.equal(db.vivos("uid-a"), 3);
  // recarregar não abre de novo
  await p.reload(); await p.waitForSelector("#formLanc"); await espera(1000);
  assert.equal(await aberta(p), false);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("link aberto antes do login: a janela espera a pessoa entrar", async () => {
  const db = banco(); db.conta("uid-b", "bia@teste.com", { cloud: true });
  const p = await abrirApp(browser, srv.url, db, { dados: null });
  await comLink(p);
  assert.equal(await p.$eval("#webLogin", e => e.hidden), false);
  assert.equal(await aberta(p), false, "não abre por cima do login");
  await entrarPorCodigo(p, "bia@teste.com");
  await p.waitForFunction(() => document.querySelector("#modalImportar").open, { timeout: 5000 });
  await p.fechar();
});

test("arquivo errado avisa; com dados no app, pergunta antes de substituir", async () => {
  const db = banco(); db.conta("uid-a", "ana@teste.com", { cloud: true });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: [lanc("x", "Já estava aqui")] } });
  await comLink(p);
  await (await p.$("#arqBackup")).uploadFile(arquivo("foto.json", "não é json"));
  await p.waitForFunction(() => !document.querySelector("#impErro").hidden);
  assert.match(await p.$eval("#impErro", e => e.textContent), /não é um backup/);
  assert.ok(await p.$eval("#impImportar", e => e.disabled));
  // backup sem senha (formato de dados) e recusa a substituição
  await (await p.$("#arqBackup")).uploadFile(arquivo("dados.json", { format: "myfinance-data", data: DO_DESKTOP }));
  await p.waitForFunction(() => !document.querySelector("#impImportar").disabled);
  assert.ok(await p.$eval("#impCampoSenha", e => e.hidden), "sem senha para arquivo aberto");
  await p.click("#impImportar");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  assert.match(await p.$eval("#modalConfirmacao", e => e.innerText), /Substituir os dados atuais/);
  await p.click("#confirmacaoCancelar");
  await espera(200);
  assert.deepEqual((await lerLocal(p)).lancamentos.map(l => l.descricao), ["Já estava aqui"]);
  assert.equal(await aberta(p), true, "volta para a janela");
  await p.click("#impImportar");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  await p.click("#confirmacaoAceitar");
  await espera(300);
  assert.deepEqual((await lerLocal(p)).lancamentos.map(l => l.descricao), ["Mercado do desktop", "Farmácia do desktop"]);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
