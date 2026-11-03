import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
// hoje = 13/10/2026

test("despesa na categoria Investimentos: lançar, painel e saldo do mês", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    fixos: [{ id: "s", tipo: "receita", descricao: "Salário", valor: 5000, categoria: "outros", dia: 5, inicio: "2026-10" }] } });
  await aba(p, "lancamentos");
  const opcoes = await p.$$eval("#lCat option", os => os.map(o => [o.value, o.textContent]));
  assert.ok(opcoes.some(([v, t]) => v === "investimentos" && t === "Investimentos"), "a categoria aparece no formulário");

  await p.type("#lDesc", "Reserva de emergência"); await p.type("#lValor", "50000"); await p.select("#lCat", "investimentos"); await p.click("#lBtn");
  await p.type("#lDesc", "Mercado"); await p.type("#lValor", "30000"); await p.select("#lCat", "alimentacao"); await p.click("#lBtn");
  await p.select("#lRep", "fixo");
  await p.type("#lDesc", "Tesouro Direto"); await p.type("#lValor", "20000"); await p.select("#lCat", "investimentos"); await p.click("#lBtn");
  await espera(100);

  const d = await lerDados(p);
  assert.equal(d.lancamentos.find(l => l.descricao === "Reserva de emergência").categoria, "investimentos");
  assert.equal(d.fixos.find(f => f.descricao === "Tesouro Direto").categoria, "investimentos");
  assert.match(await texto(p, "#cardLista"), /Reserva de emergência[\s\S]*Investimentos/);

  // o dinheiro guardado sai do saldo do mês e aparece separado nas categorias
  const g = await p.evaluate(() => gastosPorCategoria("2026-10").map(x => [x.cat.id, x.valor]));
  assert.deepEqual(g, [["investimentos", 700], ["alimentacao", 300]]);
  assert.equal(await p.evaluate(() => resumoDoMes("2026-10").saldo), 4000);
  await aba(p, "painel");
  assert.match(await texto(p, "#aba-painel"), /Investimentos\s+R\$ 700,00/);

  // continua na categoria depois de recarregar (normalizar não troca por Outros)
  await p.reload({ waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => typeof dados !== "undefined" && dados.lancamentos.length === 2);
  assert.equal((await lerDados(p)).lancamentos.find(l => l.descricao === "Reserva de emergência").categoria, "investimentos");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("Investimentos aparece nos relatórios e no CSV, sem limite de gasto", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [
    { id: "i1", tipo: "despesa", descricao: "CDB", valor: 400, categoria: "investimentos", data: "2026-09-10" },
    { id: "i2", tipo: "despesa", descricao: "CDB", valor: 600, categoria: "investimentos", data: "2026-10-10" },
    { id: "m", tipo: "despesa", descricao: "Mercado", valor: 200, categoria: "alimentacao", data: "2026-10-03" }] } });
  await aba(p, "relatorios");
  const linha = await p.evaluate(() => [...document.querySelectorAll(".rel-matriz tbody tr")].find(t => t.innerText.includes("Investimentos"))
    ?.innerText.replace(/\u00a0/g, " ").split("\t").map(x => x.trim()));
  assert.ok(linha, "linha própria na tabela de categorias × meses");
  assert.deepEqual(linha.slice(-4), ["R$ 400,00", "R$ 600,00", "R$ 1.000,00", "R$ 500,00"]);

  await p.evaluate(() => {
    HTMLAnchorElement.prototype.click = function () {};
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => { window.__csv = t; }); return orig(blob); };
  });
  await p.click("#relCsv");
  await p.waitForFunction(() => window.__csv);
  const linhas = (await p.evaluate(() => window.__csv)).slice(1).split("\r\n");
  assert.ok(linhas.includes("outubro de 2026;10/10/2026;Despesa;CDB;Investimentos;Avulso;-600,00"));

  // limite é para conter gasto: dinheiro guardado não entra
  await aba(p, "painel");
  await p.evaluate(() => abrirLimites());
  assert.equal(await p.$('[data-limite="investimentos"]'), null);
  assert.ok(await p.$('[data-limite="alimentacao"]'));
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("extrato: aplicações e investimentos vêm sugeridos como Investimentos", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  const r = await p.evaluate(() => ["Aplicação RDB", "APLIC CDB BANCO", "Tesouro Direto", "Transferência para poupança",
    "Guardado na Caixinha", "XP Investimentos", "Previdência Privada", "Mercado Extra", "Pagamento de fatura"].map(categoriaSugerida));
  assert.deepEqual(r, ["investimentos", "investimentos", "investimentos", "investimentos", "investimentos", "investimentos", "investimentos", "alimentacao", "cartao"]);
  await p.fechar();
});
