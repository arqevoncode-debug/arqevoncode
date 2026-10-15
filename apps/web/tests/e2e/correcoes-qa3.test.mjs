// Terceira rodada do teste exploratório (2026-10-14): conta, nuvem e várias abas, com o Supabase
// falso em memória (supabase-falso.mjs) e a criptografia real.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { banco, servir, navegador, abrirApp, entrarPorCodigo, criarNuvemUI, abrirNuvemUI, abrirConta, lerLocal, lanc, espera, VAZIO, emDias, PLANOS } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });

const modalAberto = p => p.waitForFunction(() => document.querySelector("#modalConfirmacao").open, { timeout: 8000 });
async function sairDaConta(p, resposta) {
  await abrirConta(p);
  await p.click("#wcSair");
  if (resposta) { await modalAberto(p); await p.click(resposta); }
  await p.waitForFunction(() => !document.querySelector("#webLogin").hidden, { timeout: 15000 });
  await espera(300);
}
const veNaTela = (p, texto) => p.evaluate(t => { ativarAba("lancamentos"); return document.querySelector("#cardLista").innerText.includes(t); }, texto);

test("trocar de conta no mesmo navegador não mostra nem apaga os dados da outra", async () => {
  const db = banco();
  db.conta("uid-a", "ana@teste.com", { cloud: true });
  db.conta("uid-b", "bruno@teste.com", { cloud: false });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: [1, 2, 3, 4, 5].map(i => lanc("a" + i, "Gasto da Ana " + i)) } });
  await criarNuvemUI(p);
  assert.equal(db.vivos("uid-a"), 5);

  // Ana sai com a nuvem em dia: os lançamentos saem deste navegador (estão na nuvem)
  await sairDaConta(p);
  assert.equal((await lerLocal(p)).lancamentos.length, 0);
  assert.equal(await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("arqevon-sync:")).length), 0, "estado da sincronização da Ana saiu");

  // Bruno entra e não vê nada da Ana
  await entrarPorCodigo(p, "bruno@teste.com");
  assert.ok(!(await veNaTela(p, "Gasto da Ana")));
  await p.evaluate(() => { const d = ArqevonFinanceBridge.obterDados(); d.lancamentos = [{ id: "b1", tipo: "despesa", descricao: "Gasto do Bruno", valor: 99, categoria: "outros", data: "2026-10-06" }]; ArqevonFinanceBridge.substituirDados(d); });
  // Bruno não tem nuvem: o app pergunta; ele apaga deste navegador
  await sairDaConta(p, "#confirmacaoAlternativa");
  assert.equal((await lerLocal(p)).lancamentos.length, 0);

  // Ana volta: a nuvem dela está intacta e nada do Bruno entra nela
  await entrarPorCodigo(p, "ana@teste.com");
  await abrirNuvemUI(p); // só entrar pelo e-mail: a chave vem do servidor
  await espera(1500);
  assert.equal(db.vivos("uid-a"), 5, "nuvem da Ana com os 5 itens");
  const local = await lerLocal(p);
  assert.deepEqual(local.lancamentos.map(l => l.id).sort(), ["a1", "a2", "a3", "a4", "a5"]);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("entrar com dados de outra conta no navegador pergunta antes de mostrar", async () => {
  const db = banco();
  db.conta("uid-c", "carla@teste.com", { cloud: false });
  const p = await abrirApp(browser, srv.url, db, { dados: { ...VAZIO(), lancamentos: [lanc("x", "Dado de outra pessoa")] }, extra: { "arqevon-sync-dono": "uid-z" } });
  p.otp["carla@teste.com"] = "123456";
  await p.type("#wlEmail", "carla@teste.com"); await p.click("#wlEnviar");
  await p.waitForFunction(() => !document.querySelector("#wlPasso2").hidden);
  await p.type("#wlCodigo", "123456"); await p.click("#wlEntrar");
  await modalAberto(p);
  assert.ok(await p.$eval("#webLogin", e => !e.hidden), "o app continua escondido atrás do login");
  await p.click("#confirmacaoCancelar");
  await espera(500);
  assert.ok(await p.$eval("#webLogin", e => !e.hidden), "cancelar volta ao login");
  assert.equal((await lerLocal(p)).lancamentos.length, 1, "os dados da outra conta não foram apagados");
  // agora aceita apagar
  await p.click("#wlVoltar").catch(() => {});
  await p.evaluate(() => { document.querySelector("#wlPasso1").hidden = false; document.querySelector("#wlPasso2").hidden = true; });
  await p.$eval("#wlEmail", e => { e.value = ""; });
  await p.type("#wlEmail", "carla@teste.com"); await p.click("#wlEnviar");
  await p.waitForFunction(() => !document.querySelector("#wlPasso2").hidden);
  await p.$eval("#wlCodigo", e => { e.value = ""; });
  await p.type("#wlCodigo", "123456"); await p.click("#wlEntrar");
  await modalAberto(p);
  await p.click("#confirmacaoAceitar");
  await p.waitForFunction(() => document.querySelector("#webLogin").hidden, { timeout: 8000 });
  assert.equal((await lerLocal(p)).lancamentos.length, 0);
  assert.equal(await p.evaluate(() => localStorage.getItem("arqevon-sync-dono")), "uid-c");
  await p.fechar();
});

test("aparelho com dados de outra conta: pergunta antes de abrir a nuvem; recusar não guarda as chaves", async () => {
  const db = banco();
  db.conta("uid-a", "ana@teste.com", { cloud: true });
  const p1 = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), lancamentos: [lanc("a1", "Ana 1")] } });
  await criarNuvemUI(p1);
  await p1.fechar();
  // o servidor ainda não responde quando o aparelho abre (nada é guardado)...
  db.falharChave = true;
  const p2 = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
  await abrirConta(p2);
  await p2.waitForFunction(() => /Não foi possível abrir a nuvem/.test(document.querySelector("#wnStatus").textContent), { timeout: 8000 });
  // ...e no meio da sessão o navegador passa a ter dados de outra conta
  await p2.evaluate(() => { localStorage.setItem("arqevon-sync-dono", "uid-z"); ArqevonFinanceBridge.substituirDados({ lancamentos: [{ id: "z", tipo: "despesa", descricao: "Z", valor: 1, categoria: "outros", data: "2026-10-01" }] }, { sync: true }); });
  db.falharChave = false;
  p2.respostas.push(false);
  await p2.evaluate(() => document.querySelector("#webConta").close()); await abrirConta(p2);
  await p2.waitForFunction(() => /Cancelado/.test(document.querySelector("#wnStatus").textContent), { timeout: 20000 });
  assert.match(p2.vistos.join(" "), /lançamentos de outra conta/);
  assert.deepEqual((await lerLocal(p2)).lancamentos.map(l => l.id), ["z"], "dados do navegador mantidos");
  assert.ok(await p2.evaluate(() => new Promise(ok => { const r = indexedDB.open("arqevon"); r.onsuccess = () => { const g = r.result.transaction("chaves").objectStore("chaves").get("uid-a"); g.onsuccess = () => ok(!g.result); }; })), "chaves não foram guardadas");
  assert.equal(db.vivos("uid-a"), 1, "nada da outra conta foi para a nuvem");
  assert.deepEqual(p2.erros.filter(e => !/status of 503/.test(e)), []);
  await p2.fechar();
});

test("duas abas abertas: uma não apaga o que a outra lançou", async () => {
  const db = banco();
  const p1 = await abrirApp(browser, srv.url, db, { dados: VAZIO(), extra: { "arqevon-web-local": "1" } });
  const p2 = await p1.contexto.newPage();
  await p2.setBypassServiceWorker(true);
  await p2.evaluateOnNewDocument(() => { const D = Date, t0 = new D("2026-10-13T12:00:00").getTime(); let t = t0; window.Date = class extends D { constructor(...a) { a.length ? super(...a) : super(t); } static now() { return t++; } }; });
  await p2.goto(srv.url); await p2.waitForSelector("#formLanc"); await espera(600);
  for (const [p, desc] of [[p1, "Mercado"], [p2, "Farmácia"]]) {
    await p.bringToFront(); // aba em segundo plano não responde no navegador sem tela
    await p.evaluate(() => ativarAba("lancamentos"));
    await p.type("#lDesc", desc); await p.type("#lValor", "1000"); await p.click("#lBtn");
    await espera(300);
  }
  await p1.bringToFront(); await espera(200);
  const final = await lerLocal(p1);
  assert.deepEqual(final.lancamentos.map(l => l.descricao).sort(), ["Farmácia", "Mercado"]);
  assert.ok(await veNaTela(p1, "Farmácia"), "a primeira aba mostra o que a segunda lançou");
  await p2.close();
  await p1.fechar();
});

test("Sua conta: pagamento pendente, cancelado com acesso, teste em andamento e planos indisponíveis", async () => {
  const db = banco();
  const c = db.conta("uid-a", "ana@teste.com", { cloud: true, sub: { plan: "pro_mensal", status: "past_due", current_period_end: emDias(-1) } });
  let p = await abrirApp(browser, srv.url, db, { uid: "uid-a" });
  await abrirConta(p);
  assert.ok(await p.$eval("#wcGerenciar", e => !e.hidden), "pendente: mostra onde regularizar");
  await p.fechar();
  c.sub = { plan: "pro_mensal", status: "canceled", current_period_end: emDias(10) };
  p = await abrirApp(browser, srv.url, db, { uid: "uid-a" });
  await abrirConta(p);
  assert.ok(await p.$eval("#wcAssinar", e => !e.hidden), "cancelado com acesso pode assinar de novo");
  await p.fechar();
  c.sub = { plan: "pro_mensal", status: "trialing", current_period_end: emDias(5) };
  p = await abrirApp(browser, srv.url, db, { uid: "uid-a" });
  await abrirConta(p);
  assert.match(await p.$eval("#wcProStatus", e => e.textContent), /Em teste até/);
  await p.fechar();
  c.sub = null; c.cloud = false;
  p = await abrirApp(browser, srv.url, db, { uid: "uid-a" });
  p.falhar = { list_plans: { status: 500 } };
  await p.reload(); await p.waitForSelector("#formLanc"); await espera(600);
  await abrirConta(p);
  assert.ok(await p.$eval("#wcAssinar", e => e.hidden), "sem planos, sem formulário vazio");
  assert.ok(await p.$eval("#wcPlanosIndisponiveis", e => !e.hidden));
  await p.fechar();
});

test("login: código colado com espaço, e-mail recusado e reenviar código", async () => {
  const db = banco();
  db.conta("uid-a", "ana@teste.com");
  const p = await abrirApp(browser, srv.url, db, {});
  p.otpErro = { status: 422, corpo: { code: 422, msg: "Unable to validate email address: invalid format" } };
  await p.type("#wlEmail", "ana@teste.com"); await p.click("#wlEnviar");
  await espera(400);
  assert.match(await p.$eval("#wlErro1", e => e.textContent), /Confira se está escrito certo/);
  p.otpErro = null;
  await p.click("#wlEnviar");
  await p.waitForFunction(() => !document.querySelector("#wlPasso2").hidden);
  await p.$eval("#wlCodigo", e => { e.value = "123 456"; e.dispatchEvent(new Event("input")); });
  assert.equal(await p.$eval("#wlCodigo", e => e.value), "123456");
  await p.click("#wlReenviar"); await espera(300);
  assert.equal(p.chamadas.filter(c => c.startsWith("otp:")).length, 3, "e-mail recusado, enviado e reenviado");
  assert.match(await p.$eval("#wlReenviar", e => e.textContent), /reenviado/);
  await p.fechar();
});

test("convite inválido: o aviso explica o prazo normal e o endereço volta ao normal", async () => {
  const db = banco();
  db.conta("uid-a", "ana@teste.com", { cloud: false, extra: {
    claim_referral: { ok: true, status: "invalid_code" },
    claim_trial: { ok: true, status: "started", ends_at: emDias(30) },
  } });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", extra: { "arqevon-convite": "ABCD2345" } });
  await p.waitForFunction(() => !document.querySelector("#webAviso").hidden, { timeout: 5000 });
  assert.match(await p.$eval("#webAvisoTexto", e => e.textContent), /convite usado não era válido/);
  await p.goto(srv.url + "?convite=abc"); await p.waitForSelector("#formLanc"); await espera(400);
  assert.ok(!p.url().includes("convite"), "código mal formado também sai do endereço");
  await p.fechar();
});
