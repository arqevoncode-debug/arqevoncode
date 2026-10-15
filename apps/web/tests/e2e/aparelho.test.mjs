// Liberar um aparelho novo aprovando num aparelho já aberto, sem digitar a senha da nuvem.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { banco, servir, navegador, abrirApp, criarNuvemUI, abrirConta, lerLocal, lanc, espera, VAZIO } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const SENHA = "senha-nuvem-123";
const visivel = (p, sel) => p.$eval(sel, e => !e.hidden);
const textoDe = (p, sel) => p.$eval(sel, e => e.textContent.trim());

// Aparelho A com a nuvem ligada e lançamentos; aparelho B da mesma conta, sem chaves.
async function doisAparelhos(db, { dadosA = [lanc("a1", "Aluguel", 1450), lanc("a2", "Mercado", 312.45)], vpB } = {}) {
  db.conta("uid-a", "ana@teste.com", { cloud: true });
  const a = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: dadosA } });
  await criarNuvemUI(a, SENHA);
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO(), vp: vpB });
  return { a, b };
}
async function codigoNoAparelhoNovo(b) {
  await b.bringToFront();
  await abrirConta(b);
  await b.waitForFunction(() => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(document.querySelector("#wnCodigo").textContent), { timeout: 8000 });
  return textoDe(b, "#wnCodigo");
}
async function pedidoChegaNoAberto(a) {
  await a.bringToFront();
  await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.waitForFunction(() => document.querySelector("#webAprovar").open, { timeout: 12000 });
}
async function liberar(a, codigo, senha) {
  await a.$eval("#waCodigo", e => { e.value = ""; });
  await a.type("#waCodigo", codigo);
  if (senha) await a.type("#waSenha", senha);
  await a.click("#waLiberar");
  await a.waitForFunction(() => !document.querySelector("#waOk").hidden || !document.querySelector("#waErro").hidden, { timeout: 10000 });
}
async function aparelhoNovoSincroniza(b) {
  await b.bringToFront();
  await b.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent), { timeout: 20000 });
}

test("aparelho novo é liberado pelo código, sem senha, e recebe os dados", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  const codigo = await codigoNoAparelhoNovo(b);
  assert.ok(await visivel(b, "#wnAparelho"), "o aparelho novo mostra a liberação por outro aparelho");
  assert.ok(!(await visivel(b, "#wnAbrir")), "não pede a senha de cara");

  await pedidoChegaNoAberto(a);
  assert.match(await textoDe(a, "#waTexto"), /pediu acesso/);
  assert.ok(!(await visivel(a, "#waSenhaCampo")), "aparelho já aberto não precisa da senha");

  // código errado não libera
  await liberar(a, codigo.startsWith("A") ? "BBBB-BBBB" : "AAAA-AAAA");
  assert.match(await textoDe(a, "#waErro"), /não confere/);
  assert.equal([...db.links.values()][0].sealed, null, "nada foi entregue");

  await liberar(a, codigo.toLowerCase());
  assert.ok(await visivel(a, "#waOk"), "aparelho aberto confirma");
  await aparelhoNovoSincroniza(b);
  const dados = await lerLocal(b);
  assert.deepEqual(dados.lancamentos.map(l => l.descricao).sort(), ["Aluguel", "Mercado"]);
  assert.equal(db.links.size, 0, "o pedido some depois de entregue");
  assert.ok(await b.evaluate(() => new Promise(ok => { const r = indexedDB.open("arqevon"); r.onsuccess = () => { const g = r.result.transaction("chaves").objectStore("chaves").get("uid-a"); g.onsuccess = () => ok(!!g.result?.cifra && !!g.result?.dek); }; })),
    "chaves guardadas no aparelho novo (abre sozinho da próxima vez)");

  // o código nunca passou pelo servidor, de nenhum dos dois lados
  for (const p of [a, b]) assert.ok(!p.corpos.some(c => c.includes(codigo) || c.includes(codigo.replace("-", ""))), "código não vai ao servidor");
  assert.ok(!a.corpos.concat(b.corpos).some(c => c.includes(SENHA)), "senha não vai ao servidor");

  // B agora também libera um terceiro aparelho, sem senha
  const c = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  const cod3 = await codigoNoAparelhoNovo(c);
  await pedidoChegaNoAberto(b);
  await liberar(b, cod3);
  assert.ok(await visivel(b, "#waOk"));
  await aparelhoNovoSincroniza(c);
  assert.equal((await lerLocal(c)).lancamentos.length, 2);
  for (const p of [a, b, c]) assert.deepEqual(p.erros, []);
  await c.fechar(); await b.fechar(); await a.fechar();
});

test("recusar no aparelho aberto avisa o novo, que pode gerar outro código", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  await codigoNoAparelhoNovo(b);
  await pedidoChegaNoAberto(a);
  await a.click("#waRecusar");
  assert.ok(!(await a.$eval("#webAprovar", d => d.open)));
  await b.bringToFront();
  await b.waitForFunction(() => /recusado/.test(document.querySelector("#wnAparelhoStatus").textContent), { timeout: 8000 });
  assert.ok(await visivel(b, "#wnNovoCodigo"));
  await b.click("#wnNovoCodigo");
  await b.waitForFunction(() => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(document.querySelector("#wnCodigo").textContent), { timeout: 8000 });
  assert.equal(db.links.size, 1, "um pedido novo");
  await b.fechar(); await a.fechar();
});

test("código vencido: aparelho novo avisa e gera outro", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  await codigoNoAparelhoNovo(b);
  for (const l of db.links.values()) l.expira = 0;
  await b.waitForFunction(() => /venceu/.test(document.querySelector("#wnAparelhoStatus").textContent), { timeout: 8000 });
  assert.ok(await visivel(b, "#wnNovoCodigo"));
  assert.equal(await textoDe(b, "#wnCodigo"), "····-····", "o código vencido some da tela");
  await b.fechar(); await a.fechar();
});

test("aparelho aberto antes desta versão pede a senha uma vez para liberar", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  // simula chaves salvas sem a DEK (versão anterior) e reabre o app
  await a.evaluate(() => new Promise(ok => {
    const r = indexedDB.open("arqevon");
    r.onsuccess = () => {
      const st = r.result.transaction("chaves", "readwrite").objectStore("chaves");
      const g = st.get("uid-a");
      g.onsuccess = () => { const { cifra, ids } = g.result; st.put({ cifra, ids }, "uid-a").onsuccess = ok; };
    };
  }));
  await a.reload(); await a.waitForSelector("#formLanc"); await espera(1500);
  const codigo = await codigoNoAparelhoNovo(b);
  await pedidoChegaNoAberto(a);
  assert.ok(await visivel(a, "#waSenhaCampo"), "pede a senha só desta vez");
  await liberar(a, codigo);
  assert.match(await textoDe(a, "#waErro"), /Digite a senha/);
  await liberar(a, codigo, "senha-errada-999");
  assert.match(await textoDe(a, "#waErro"), /Senha incorreta/);
  await a.$eval("#waSenha", e => { e.value = ""; });
  await liberar(a, codigo, SENHA);
  assert.ok(await visivel(a, "#waOk"));
  await aparelhoNovoSincroniza(b);
  assert.equal((await lerLocal(b)).lancamentos.length, 2);
  await b.fechar(); await a.fechar();
});

test("a senha continua funcionando como alternativa e encerra o pedido", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  await codigoNoAparelhoNovo(b);
  assert.equal(db.links.size, 1);
  await b.click("#wnUsarSenha");
  await b.type("#wnSenhaAbrir", SENHA);
  await b.click("#wnBotaoAbrir");
  await aparelhoNovoSincroniza(b);
  await espera(300);
  assert.equal(db.links.size, 0, "o pedido em aberto é cancelado");
  assert.equal((await lerLocal(b)).lancamentos.length, 2);
  await b.fechar(); await a.fechar();
});

test("no celular, o código cabe na tela", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db, { vpB: { width: 360, height: 740, isMobile: true, hasTouch: true } });
  await codigoNoAparelhoNovo(b);
  const r = await b.$eval("#wnCodigo", e => { const x = e.getBoundingClientRect(); return { l: x.left, r: x.right, w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; });
  assert.ok(r.l >= 0 && r.r <= r.w, `código fora da tela: ${JSON.stringify(r)}`);
  assert.equal(r.sw, r.w, "sem rolagem lateral");
  await b.fechar(); await a.fechar();
});
