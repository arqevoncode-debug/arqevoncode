// Nuvem sem senha: aparelho novo liberado por um aparelho conectado; chave de recuperação como plano B.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { banco, servir, navegador, abrirApp, criarNuvemUI, abrirNuvemUI, abrirConta, lerLocal, lanc, espera, VAZIO } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const visivel = (p, sel) => p.$eval(sel, e => !e.hidden);
const textoDe = (p, sel) => p.$eval(sel, e => e.textContent.trim());

// Aparelho A com a nuvem ligada e lançamentos; aparelho B da mesma conta, sem chaves.
async function doisAparelhos(db, { dadosA = [lanc("a1", "Aluguel", 1450), lanc("a2", "Mercado", 312.45)], vpB } = {}) {
  db.conta("uid-a", "ana@teste.com", { cloud: true });
  const a = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: dadosA } });
  const chave = await criarNuvemUI(a);
  const b = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO(), vp: vpB });
  return { a, b, chave };
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
async function liberar(a, codigo) {
  await a.$eval("#waCodigo", e => { e.value = ""; });
  await a.type("#waCodigo", codigo);
  await a.click("#waLiberar");
  await a.waitForFunction(() => !document.querySelector("#waOk").hidden || !document.querySelector("#waErro").hidden, { timeout: 10000 });
}
async function aparelhoNovoSincroniza(b) {
  await b.bringToFront();
  await b.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent), { timeout: 20000 });
}

test("aparelho novo é liberado pelo código, sem senha, e recebe os dados", async () => {
  const db = banco();
  const { a, b, chave } = await doisAparelhos(db);
  assert.equal(await a.$("#wnSenha"), null, "ligar a nuvem não pede senha");
  const codigo = await codigoNoAparelhoNovo(b);
  assert.ok(await visivel(b, "#wnAparelho"), "o aparelho novo mostra a liberação por outro aparelho");

  await pedidoChegaNoAberto(a);
  assert.match(await textoDe(a, "#waTexto"), /pediu acesso/);
  assert.ok(!(await visivel(a, "#waTrocar")), "aparelho conectado nesta versão libera direto");

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
  assert.ok(!a.corpos.concat(b.corpos).some(c => c.includes(chave) || c.includes(chave.replaceAll("-", ""))), "chave de recuperação não vai ao servidor");

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

const lerRegistro = (p, uid = "uid-a") => p.evaluate(u => new Promise(ok => {
  const r = indexedDB.open("arqevon");
  r.onsuccess = () => { const g = r.result.transaction("chaves").objectStore("chaves").get(u); g.onsuccess = () => ok(g.result ? { dek: !!g.result.dek, versao: g.result.versao, kid: g.result.kid } : null); };
}), uid);

test("aparelho conectado numa versão anterior troca a chave uma vez e libera, sem senha", async () => {
  const db = banco();
  const { a, b, chave } = await doisAparelhos(db);
  // simula chaves salvas antes desta versão (sem a DEK, sem versão e sem kid) e reabre o app
  db.contas.get("uid-a").vault.key_params = { ...db.contas.get("uid-a").vault.key_params, kid: undefined };
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
  assert.ok(await visivel(a, "#waTrocar"), "explica a troca de chave e mostra a chave nova");
  const chaveNova = await textoDe(a, "#waChave");
  assert.notEqual(chaveNova, chave);
  await liberar(a, codigo.startsWith("A") ? "BBBB-BBBB" : "AAAA-AAAA");
  assert.match(await textoDe(a, "#waErro"), /não confere/);
  assert.equal(db.contas.get("uid-a").vault.key_version, 1, "código errado não troca a chave");
  await liberar(a, codigo);
  assert.match(await textoDe(a, "#waErro"), /Guarde a chave/);
  await a.click("#waGuardei");
  await liberar(a, codigo);
  assert.ok(await visivel(a, "#waOk"), "liberou");
  assert.equal(db.contas.get("uid-a").vault.key_version, 2, "chave trocada");
  await aparelhoNovoSincroniza(b);
  assert.equal((await lerLocal(b)).lancamentos.length, 2);
  assert.equal(db.vivos("uid-a"), 2, "nuvem refeita com os 2 registros, sem duplicar");
  assert.deepEqual(await lerRegistro(b), { dek: true, versao: 2, kid: db.contas.get("uid-a").vault.key_params.kid });
  // a chave de recuperação antiga deixou de valer; a nova abre
  const c = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await abrirNuvemUI(c, chave);
  assert.match(await textoDe(c, "#wnErroRec"), /incorreta/);
  await c.$eval("#wnChaveRec", e => { e.value = ""; });
  await abrirNuvemUI(c, chaveNova);
  assert.equal((await lerLocal(c)).lancamentos.length, 2);
  for (const p of [a, b, c]) assert.deepEqual(p.erros, []);
  await c.fechar(); await b.fechar(); await a.fechar();
});

test("sem outro aparelho, a chave de recuperação abre os dados e encerra o pedido", async () => {
  const db = banco();
  const { a, b, chave } = await doisAparelhos(db);
  await codigoNoAparelhoNovo(b);
  assert.equal(db.links.size, 1);
  await abrirNuvemUI(b, chave);
  await aparelhoNovoSincroniza(b);
  await espera(300);
  assert.equal(db.links.size, 0, "o pedido em aberto é cancelado");
  assert.equal((await lerLocal(b)).lancamentos.length, 2);
  await b.fechar(); await a.fechar();
});

test("nova chave de recuperação: os outros aparelhos pedem para ser liberados de novo, sem perder nada", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  const codigo = await codigoNoAparelhoNovo(b);
  await pedidoChegaNoAberto(a); await liberar(a, codigo); await aparelhoNovoSincroniza(b);
  await a.evaluate(() => document.querySelector("#webAprovar").close());
  // B lança algo que ainda não subiu quando A troca a chave
  await b.evaluate(() => { const d = ArqevonFinanceBridge.obterDados(); d.lancamentos.push({ id: "b9", tipo: "despesa", descricao: "Lançado no celular", valor: 7, categoria: "outros", data: "2026-10-07" }); ArqevonFinanceBridge.substituirDados(d); });
  await a.bringToFront(); await abrirConta(a);
  await a.click("#wnNovaChave");
  assert.ok(await visivel(a, "#wnGuardar"));
  const nova = await textoDe(a, "#wnChave");
  await a.click("#wnGuardei"); await a.click("#wnBotaoGuardar");
  await a.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent) && !document.querySelector("#wnAtiva").hidden, { timeout: 20000 });
  assert.equal(db.contas.get("uid-a").vault.key_version, 2);
  assert.equal(db.vivos("uid-a"), 2, "A reenviou o que tinha");
  // B percebe a troca: não grava com a chave velha e pede para ser liberado de novo
  await b.bringToFront(); await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await b.waitForFunction(() => !document.querySelector("#wnAparelho").hidden && /trocada em outro aparelho/.test(document.querySelector("#wnStatus").textContent), { timeout: 15000 });
  assert.equal(db.vivos("uid-a"), 2, "nada gravado com a chave antiga");
  assert.ok((await lerLocal(b)).lancamentos.some(l => l.id === "b9"), "o lançamento do celular continua lá");
  const cod2 = await b.$eval("#wnCodigo", e => e.textContent);
  await pedidoChegaNoAberto(a); await liberar(a, cod2); await aparelhoNovoSincroniza(b);
  assert.equal(db.vivos("uid-a"), 3, "o lançamento do celular subiu depois de liberado");
  await a.bringToFront(); await a.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await a.waitForFunction(() => JSON.parse(localStorage.getItem("meu-financeiro-v1")).lancamentos.some(l => l.id === "b9"), { timeout: 15000 });
  assert.ok(nova.length === 39);
  for (const p of [a, b]) assert.deepEqual(p.erros, []);
  await b.fechar(); await a.fechar();
});

test("sem aparelho e sem chave: dá para apagar a nuvem e recomeçar", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  await codigoNoAparelhoNovo(b);
  await b.click("#wnUsarChave");
  await b.click(".wc-recomecar summary");
  b.respostas.push(false);
  await b.click("#wnRecomecar"); await espera(300);
  assert.ok(db.contas.get("uid-a").vault, "cancelar não apaga");
  await b.click("#wnRecomecar");
  await b.waitForFunction(() => !document.querySelector("#wnCriar").hidden, { timeout: 8000 });
  assert.equal(db.contas.get("uid-a").vault, null, "nuvem apagada");
  await b.fechar(); await a.fechar();
});

test("sair no aparelho conectado avisa que vai precisar de outro aparelho ou da chave", async () => {
  const db = banco();
  const { a, b } = await doisAparelhos(db);
  await b.fechar();
  await a.bringToFront(); await abrirConta(a);
  a.respostas.push(false);
  await a.click("#wcSair"); await espera(300);
  assert.match(a.vistos.at(-1), /outro aparelho conectado ou usar a chave de recuperação/);
  assert.ok(await a.$eval("#webConta", d => d.open), "cancelar mantém na conta");
  await a.fechar();
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
