// Limites do plano grátis e o convite para o Pro.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";
import { banco, servir as servirFalso, navegador as navegadorFalso, abrirApp } from "./supabase-falso.mjs";

const amb = preparar({ before, after });
const gratis = (o = {}) => amb.abrir({ plano: "gratis", ...o });
const modal = p => p.waitForFunction(() => document.querySelector("#modalConfirmacao").open, { timeout: 5000 });
// hoje = 13/10/2026; histórico do grátis: maio a outubro
const parc = (n, inicio = "2026-09") => Array.from({ length: n }, (_, i) => ({ id: "p" + i, descricao: "Compra " + i, valorTotal: 600, numParcelas: 6, categoria: "outros", inicio }));

test("projeção de 3 meses no grátis e 12 no Pro", async () => {
  const dados = { ...VAZIO(), fixos: [{ id: "f", tipo: "despesa", descricao: "Aluguel", valor: 1000, categoria: "moradia", dia: 5, inicio: "2026-10" }] };
  const p = await gratis({ dados });
  assert.match(await texto(p, "#aba-painel"), /Projeção — próximos 3 meses/);
  assert.equal(await p.$$eval("#aba-painel .tabela-wrap tbody tr", t => t.length), 3);
  await p.evaluate(() => MyFinanceBridge.definirPlano({ pro: true }));
  assert.match(await texto(p, "#aba-painel"), /Projeção — próximos 12 meses/);
  assert.equal(await p.$$eval("#aba-painel .tabela-wrap tbody tr", t => t.length), 12);
  await p.fechar();
});

test("6ª compra parcelada ativa: convite para o Pro; sem conta, convite para criar conta", async () => {
  const p = await gratis({ dados: { ...VAZIO(), parcelamentos: [...parc(5), ...parc(3, "2025-01").map((x, i) => ({ ...x, id: "velha" + i }))] } });
  await aba(p, "lancamentos");
  await p.select("#lRep", "parcelado");
  await p.type("#lDesc", "Celular"); await p.type("#lValor", "250000"); await p.click("#lBtn");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /cabem 5 compras parceladas ativas.*já tem 5/);
  assert.equal((await lerDados(p)).parcelamentos.length, 8, "não gravou (as 3 já quitadas não contam)");
  await p.click("#confirmacaoAceitar"); // Conhecer o Pro
  await modal(p);
  assert.match(await texto(p, "#confirmacaoTitulo"), /Teste o Pro grátis/);
  await p.click("#confirmacaoAceitar"); // Criar conta
  await espera(300);
  assert.ok(await p.$eval("#webLogin", e => !e.hidden), "vai para o login");
  assert.equal((await lerDados(p)).parcelamentos.length, 8, "os lançamentos continuam");
  await p.fechar();
});

test("editar uma compra parcelada existente continua livre no limite", async () => {
  const p = await gratis({ dados: { ...VAZIO(), parcelamentos: parc(5) } });
  await aba(p, "lancamentos");
  await p.evaluate(() => editarItem("parc", "p0"));
  await limparEDigitar(p, "#lValor", "70000"); await p.click("#lBtn");
  // espera a gravação em vez de um tempo fixo (no CI, 150 ms às vezes não bastavam)
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("meu-financeiro-v1") || "{}").parcelamentos?.some(x => x.valorTotal === 700), { timeout: 5000 }).catch(() => {});
  const d = await lerDados(p);
  assert.equal(d.parcelamentos.length, 5);
  assert.equal(d.parcelamentos.find(x => x.descricao === "Compra 0").valorTotal, 700);
  await p.fechar();
});

test("histórico de 6 meses: meses antigos com cadeado, dados guardados", async () => {
  const p = await gratis({ dados: { ...VAZIO(), lancamentos: [
    { id: "v", tipo: "despesa", descricao: "Antigo", valor: 50, categoria: "outros", data: "2026-03-10" },
    { id: "n", tipo: "despesa", descricao: "Recente", valor: 20, categoria: "outros", data: "2026-05-10" }] } });
  await aba(p, "lancamentos");
  await p.evaluate(() => { mesAtual = { ano: 2026, mes: 4 }; renderTudo(); }); // maio: liberado
  assert.match(await texto(p, "#cardLista"), /Recente/);
  await p.click("#mesAnt"); // abril: travado
  assert.match(await texto(p, "#cardLista"), /histórico do Pro/);
  assert.doesNotMatch(await texto(p, "#cardLista"), /Antigo/);
  assert.match(await texto(p, "#aba-painel"), /histórico do Pro/);
  await p.type("#lDesc", "Tentativa"); await p.type("#lValor", "1000"); await p.click("#lBtn");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /mês atual e nos 5 anteriores/);
  await p.click("#confirmacaoCancelar");
  assert.equal((await lerDados(p)).lancamentos.length, 2, "nada apagado nem gravado");
  await p.evaluate(() => MyFinanceBridge.definirPlano({ pro: true }));
  await p.evaluate(() => { mesAtual = { ano: 2026, mes: 2 }; renderTudo(); });
  assert.match(await texto(p, "#cardLista"), /Antigo/, "no Pro o histórico volta");
  await p.fechar();
});

test("1 objetivo e 2 limites no grátis; quem já tinha mais mantém", async () => {
  const p = await gratis({ dados: { ...VAZIO(), objetivos: [{ id: "o", nome: "Reserva", meta: 0, aporteMensal: 0, aportes: [] }] } });
  await aba(p, "objetivos");
  await p.type("#oNome", "Viagem"); await p.click("#oBtn");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /acompanha 1 objetivo/);
  await p.click("#confirmacaoCancelar");
  assert.equal((await lerDados(p)).objetivos.length, 1);
  // editar o objetivo existente continua livre
  await p.evaluate(() => editarObjetivo("o"));
  await limparEDigitar(p, "#oNome", "Reserva 2"); await p.click("#oBtn"); await espera(100);
  assert.equal((await lerDados(p)).objetivos[0].nome, "Reserva 2");

  await p.evaluate(() => abrirLimites());
  for (const [cat, v] of [["alimentacao", "50000"], ["lazer", "20000"], ["transporte", "30000"]]) await limparEDigitar(p, `[data-limite="${cat}"]`, v);
  await p.click("#limSalvar");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /até 2 categorias/);
  await p.click("#confirmacaoCancelar");
  await limparEDigitar(p, '[data-limite="transporte"]', "");
  await p.click("#limSalvar"); await espera(100);
  assert.equal((await lerDados(p)).orcamentos.length, 2);
  await p.fechar();

  const q = await gratis({ dados: { ...VAZIO(), orcamentos: ["alimentacao", "lazer", "saude"].map(c => ({ id: c, categoria: c, limite: 100 })) } });
  await q.evaluate(() => abrirLimites());
  await limparEDigitar(q, '[data-limite="lazer"]', "15000");
  await q.click("#limSalvar"); await espera(100);
  assert.equal((await lerDados(q)).orcamentos.find(o => o.categoria === "lazer").limite, 150, "quem já tinha 3 limites edita sem trava");
  await q.fechar();
});

test("extrato e relatórios: convite no grátis, prévia desfocada", async () => {
  const p = await gratis({ dados: { ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Mercado", valor: 100, categoria: "alimentacao", data: "2026-10-05" }] } });
  await aba(p, "lancamentos");
  await p.click("#btnExtrato");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /Importar o extrato do banco é um recurso do Pro/);
  await p.click("#confirmacaoCancelar");
  await aba(p, "relatorios");
  assert.ok(await p.$(".rel-previa .rel-previa-conteudo"), "prévia desfocada");
  assert.match(await texto(p, "#relConteudo"), /Relatórios completos no Pro/);
  await p.click("#relCsv");
  await modal(p);
  assert.match(await texto(p, "#confirmacaoMensagem"), /CSV é um recurso do Pro/);
  await p.fechar();
});

test("o exemplo mostra tudo liberado, mesmo no grátis", async () => {
  const p = await gratis({ dados: null });
  await p.evaluate(() => verExemplo());
  assert.match(await texto(p, "#aba-painel"), /Projeção — próximos 12 meses/);
  await aba(p, "relatorios");
  assert.equal(await p.$(".rel-previa"), null);
  await p.click("#exemploSair");
  await aba(p, "painel");
  assert.match(await texto(p, "#aba-painel"), /Bem-vindo/);
  await p.fechar();
});

test("conta: o Pro vem dos direitos da nuvem; sem eles, limites do grátis", async () => {
  const srv = await servirFalso(); const browser = await navegadorFalso();
  try {
    const db = banco();
    const c = db.conta("uid-a", "ana@teste.com", { cloud: true });
    let p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: { ...VAZIO(), fixos: [{ id: "f", tipo: "despesa", descricao: "X", valor: 1, categoria: "outros", dia: 1, inicio: "2026-10" }] } });
    assert.match(await texto(p, "#aba-painel"), /Projeção — próximos 12 meses/);
    assert.equal(await p.evaluate(() => localStorage.getItem("arqevon-plano:uid-a")), "pro", "plano guardado para a próxima abertura");
    await p.fechar();
    c.cloud = false;
    p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: VAZIO() });
    await espera(500);
    assert.match(await texto(p, "#aba-painel"), /Bem-vindo/);
    await p.evaluate(() => { dados.fixos.push({ id: "f", tipo: "despesa", descricao: "X", valor: 1, categoria: "outros", dia: 1, inicio: "2026-10" }); renderTudo(); });
    assert.match(await texto(p, "#aba-painel"), /Projeção — próximos 3 meses/);
    // "Conhecer o Pro" com conta abre os planos
    await p.click("#aba-painel [data-conhecer-pro]");
    await p.waitForFunction(() => document.querySelector("#webConta").open, { timeout: 5000 });
    await p.fechar();
  } finally { await browser.close(); await srv.fechar(); }
});
