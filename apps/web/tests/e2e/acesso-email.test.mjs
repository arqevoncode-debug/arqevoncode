// Acesso só pelo e-mail: entrar na conta basta para abrir os dados da nuvem em qualquer aparelho.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { banco, servir, navegador, abrirApp, criarNuvemUI, abrirConta, entrarPorCodigo, lerLocal, lanc, espera, VAZIO } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const visivel = (p, sel) => p.$eval(sel, e => !e.hidden);
const status = p => p.$eval("#wnStatus", e => e.textContent);
const CELULAR = { width: 390, height: 844, isMobile: true, hasTouch: true };
const sincronizado = (p, t = 20000) => p.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent), { timeout: t });

async function computadorComNuvem(db) {
  db.conta("uid-a", "ana@teste.com", { cloud: true });
  const a = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: [lanc("a1", "Aluguel", 1450), lanc("a2", "Mercado", 312.45)] } });
  await criarNuvemUI(a);
  await a.waitForFunction(() => true);
  for (let i = 0; i < 40 && !db.contas.get("uid-a").vault.custodia; i++) await espera(100);
  return a;
}
// Simula o computador conectado antes de 15/10: nuvem sem kid, sem custódia, chaves sem a DEK.
async function tornarAntigo(db, a) {
  const v = db.contas.get("uid-a").vault;
  v.key_params = { v: 1 }; v.custodia = null;
  await a.evaluate(() => new Promise(ok => {
    const r = indexedDB.open("arqevon");
    r.onsuccess = () => { const st = r.result.transaction("chaves", "readwrite").objectStore("chaves"); const g = st.get("uid-a"); g.onsuccess = () => { const { cifra, ids } = g.result; st.put({ cifra, ids }, "uid-a").onsuccess = ok; }; };
  }));
}

test("celular novo entra só pelo e-mail e já vê os dados, sem senha nem código", async () => {
  const db = banco();
  const a = await computadorComNuvem(db);
  assert.ok(db.contas.get("uid-a").vault.custodia, "o computador entregou a chave ao servidor");
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO(), vp: CELULAR });
  await b.bringToFront();
  await abrirConta(b); await sincronizado(b);
  assert.deepEqual((await lerLocal(b)).lancamentos.map(l => l.descricao).sort(), ["Aluguel", "Mercado"]);
  for (const sel of ["#wnSenha", "#wnSenhaAbrir", "#wnCodigo", "#wnChaveRec", "#webAprovar", "#wnGuardar"]) assert.equal(await b.$(sel), null, `${sel} não existe`);
  assert.ok(b.chamadas.includes("vault_key"));
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "cabe no celular");
  // ao reabrir, usa a chave guardada no aparelho
  b.chamadas.length = 0;
  await b.reload(); await b.waitForSelector("#formLanc"); await abrirConta(b); await sincronizado(b);
  assert.ok(!b.chamadas.includes("vault_key"), "não precisa buscar a chave de novo");
  for (const p of [a, b]) assert.deepEqual(p.erros, []);
  await b.fechar(); await a.fechar();
});

test("computador conectado antes: o celular espera; ao abrir o computador, ele se atualiza e o celular entra", async () => {
  const db = banco();
  const a = await computadorComNuvem(db);
  await tornarAntigo(db, a);
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO(), vp: CELULAR });
  await b.bringToFront();
  await b.waitForFunction(() => /Aguardando a chave/.test(document.querySelector("#wnStatus").textContent), { timeout: 8000 });
  assert.ok(await b.$eval("#webAviso", e => e.hidden), "celular vazio espera em silêncio");
  assert.equal(db.contas.get("uid-a").vault.key_version, 1, "celular sem dados não mexe na nuvem");
  // o computador abre a versão nova: troca a chave sozinho e entrega ao servidor
  await a.bringToFront(); await a.reload(); await a.waitForSelector("#formLanc");
  for (let i = 0; i < 80 && !db.contas.get("uid-a").vault.custodia; i++) await espera(150);
  const v = db.contas.get("uid-a").vault;
  assert.equal(v.key_version, 2, "chave trocada uma vez"); assert.ok(v.key_params.kid && v.custodia, "chave nova no servidor");
  assert.equal(db.vivos("uid-a"), 2, "dados reenviados sem duplicar");
  await b.bringToFront(); await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await abrirConta(b); await sincronizado(b);
  assert.deepEqual((await lerLocal(b)).lancamentos.map(l => l.id).sort(), ["a1", "a2"]);
  for (const p of [a, b]) assert.deepEqual(p.erros, []);
  await b.fechar(); await a.fechar();
});

test("chave trocada em outro aparelho: este busca a chave nova sozinho e não perde o que lançou", async () => {
  const db = banco();
  const a = await computadorComNuvem(db);
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await b.bringToFront(); await abrirConta(b); await sincronizado(b);
  await b.evaluate(() => { const d = ArqevonFinanceBridge.obterDados(); d.lancamentos.push({ id: "b9", tipo: "despesa", descricao: "Lançado no celular", valor: 7, categoria: "outros", data: "2026-10-07" }); ArqevonFinanceBridge.substituirDados(d); });
  await tornarAntigo(db, a);
  await a.bringToFront(); await a.reload(); await a.waitForSelector("#formLanc");
  for (let i = 0; i < 80 && !db.contas.get("uid-a").vault.custodia; i++) await espera(150);
  assert.equal(db.contas.get("uid-a").vault.key_version, 2);
  await b.bringToFront(); await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await b.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent) && JSON.parse(localStorage.getItem("meu-financeiro-v1")).lancamentos.length === 3, { timeout: 20000 });
  for (let i = 0; i < 40 && db.vivos("uid-a") < 3; i++) await espera(150);
  assert.equal(db.vivos("uid-a"), 3, "o lançamento do celular subiu com a chave nova");
  for (const p of [a, b]) assert.deepEqual(p.erros, []);
  await b.fechar(); await a.fechar();
});

test("ninguém tem a chave (perdida): o aparelho com os lançamentos assume a nuvem sozinho e o celular entra", async () => {
  const db = banco();
  const a = await computadorComNuvem(db);
  // nuvem antiga sem chave no servidor e computador que perdeu as chaves (saiu e entrou de novo)
  const v = db.contas.get("uid-a").vault;
  v.key_params = { v: 1 }; v.custodia = null;
  await a.evaluate(() => new Promise(ok => { const r = indexedDB.open("arqevon"); r.onsuccess = () => { const d = r.result.transaction("chaves", "readwrite").objectStore("chaves").delete("uid-a"); d.onsuccess = ok; }; }));
  await a.reload(); await a.waitForSelector("#formLanc");
  for (let i = 0; i < 80 && !db.contas.get("uid-a").vault.custodia; i++) await espera(150);
  assert.equal(db.contas.get("uid-a").vault.key_version, 2, "assumiu com uma chave nova");
  assert.ok(db.contas.get("uid-a").vault.custodia, "chave nova no servidor");
  for (let i = 0; i < 40 && db.vivos("uid-a") < 2; i++) await espera(150);
  assert.equal(db.vivos("uid-a"), 2, "reenviou os lançamentos do computador");
  assert.ok(await a.$eval("#webAviso", e => e.hidden), "sem aviso nenhum");
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO(), vp: CELULAR });
  await b.bringToFront(); await sincronizado(b);
  assert.deepEqual((await lerLocal(b)).lancamentos.map(l => l.id).sort(), ["a1", "a2"]);
  for (const p of [a, b]) assert.deepEqual(p.erros, []);
  await b.fechar(); await a.fechar();
});

test("sessão com token vencido: o app renova e busca a chave sem mostrar erro", async () => {
  const db = banco();
  const a = await computadorComNuvem(db); await a.fechar();
  db.tokenVencido = 1; db.renovarSessao = true;
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await sincronizado(b);
  assert.ok(b.chamadas.includes("refresh"), "renovou a sessão");
  assert.equal(db.tokenVencido, 0, "o servidor recusou o token velho uma vez");
  assert.equal((await lerLocal(b)).lancamentos.length, 2);
  assert.deepEqual(b.erros.filter(e => !/status of 401/.test(e)), []);
  await b.fechar();
});

test("servidor da chave fora do ar: avisa e não quebra", async () => {
  const db = banco();
  const a = await computadorComNuvem(db); await a.fechar();
  db.falharChave = true;
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await abrirConta(b);
  await b.waitForFunction(() => /Não foi possível abrir a nuvem/.test(document.querySelector("#wnStatus").textContent), { timeout: 8000 });
  assert.deepEqual(b.erros.filter(e => !/status of 503/.test(e)), [], "só o 503 simulado no console");
  db.falharChave = false;
  await b.evaluate(() => document.querySelector("#webConta").close()); await abrirConta(b); await sincronizado(b);
  assert.equal((await lerLocal(b)).lancamentos.length, 2, "na tentativa seguinte, abre");
  await b.fechar();
});

test("sessão morta de vez: volta para a tela de entrar sem apagar os lançamentos; ao entrar, sincroniza", async () => {
  const db = banco();
  const a = await computadorComNuvem(db); await a.fechar();
  db.tokenVencido = 2; db.renovarSessao = true; // recusa o token antigo e o renovado
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: [lanc("b1", "Só neste aparelho")] } });
  await b.waitForFunction(() => !document.querySelector("#webLogin").hidden, { timeout: 15000 });
  assert.deepEqual((await lerLocal(b)).lancamentos.map(l => l.id), ["b1"], "lançamentos do aparelho continuam");
  await entrarPorCodigo(b, "ana@teste.com");
  await sincronizado(b);
  assert.deepEqual((await lerLocal(b)).lancamentos.map(l => l.id).sort(), ["a1", "a2", "b1"], "nuvem + o que só existia aqui");
  for (let i = 0; i < 40 && db.vivos("uid-a") < 3; i++) await espera(150);
  assert.equal(db.vivos("uid-a"), 3);
  assert.deepEqual(b.erros.filter(e => !/status of 401/.test(e)), []);
  await b.fechar();
});
