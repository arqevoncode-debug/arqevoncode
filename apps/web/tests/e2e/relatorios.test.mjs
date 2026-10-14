import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
// hoje = 13/10/2026; dados de agosto a outubro
const l = (id, data, descricao, valor, categoria, tipo = "despesa") => ({ id, tipo, descricao, valor, categoria, data });
const DADOS = {
  ...VAZIO(),
  lancamentos: [
    l("a1", "2026-08-05", "Mercado", 500, "alimentacao"), l("a2", "2026-09-05", "Mercado", 500, "alimentacao"),
    l("a3", "2026-10-05", "Mercado", 900, "alimentacao"), l("t1", "2026-10-08", "Uber", 100, "transporte"),
    l("r1", "2026-09-20", "Freela; urgente", 1000, "outros", "receita"),
  ],
  fixos: [
    { id: "f1", tipo: "receita", descricao: "Salário", valor: 5000, categoria: "outros", dia: 5, inicio: "2026-08" },
    { id: "f2", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10, inicio: "2026-08" },
    { id: "f3", tipo: "despesa", descricao: "Antigo sem início", valor: 50, categoria: "assinaturas", dia: 1 },
  ],
  parcelamentos: [{ id: "p1", descricao: "TV", valorTotal: 900, numParcelas: 3, categoria: "lazer", inicio: "2026-09" }],
};

test("relatório do período confere com as contas feitas à mão", async () => {
  const p = await amb.abrir({ dados: DADOS });
  await aba(p, "relatorios");
  assert.equal(await texto(p, "#relPeriodoTexto"), "De agosto de 2026 a outubro de 2026", "começa no primeiro mês com dados");
  const meses = await p.$$eval(".rel-meses tbody tr", trs => trs.map(t => t.innerText.replace(/ /g, " ").split("\t").map(x => x.trim())));
  // ago: 5000 | 500+1500+50 = 2050 · set: 6000 | 500+1500+50+300 = 2350 · out: 5000 | 900+100+1500+50+300 = 2850
  assert.deepEqual(meses.map(m => m.slice(0, 4)), [
    ["ago/26", "R$ 5.000,00", "R$ 2.050,00", "R$ 2.950,00"],
    ["set/26", "R$ 6.000,00", "R$ 2.350,00", "R$ 3.650,00"],
    ["out/26", "R$ 5.000,00", "R$ 2.850,00", "R$ 2.150,00"]]);
  const tiles = await texto(p, "#relConteudo .tiles");
  assert.match(tiles, /Receitas no período\s+R\$ 16\.000,00/i);
  assert.match(tiles, /Despesas no período\s+R\$ 7\.250,00/i);
  assert.match(tiles, /maior mês: out\/26 \(R\$ 2\.850,00\)/);
  assert.match(tiles, /Saldo do período\s+R\$ 8\.750,00/i);
  assert.match(tiles, /Média de despesas\s+R\$ 2\.416,67/i);

  // categorias × meses: alimentação 500, 500, 900 (média 633,33 → outubro acima)
  const ali = await p.evaluate(() => [...document.querySelectorAll(".rel-matriz tbody tr")].find(t => t.innerText.includes("Alimentação"))
    .innerText.replace(/ /g, " ").split("\t").map(x => x.trim()));
  assert.deepEqual(ali.slice(1), ["R$ 500,00", "R$ 500,00", "R$ 900,00", "R$ 1.900,00", "R$ 633,33"]);
  assert.ok(await p.evaluate(() => [...document.querySelectorAll(".rel-matriz tbody tr")].find(t => t.innerText.includes("Alimentação")).cells[3].classList.contains("acima")));
  const lazer = await p.evaluate(() => [...document.querySelectorAll(".rel-matriz tbody tr")].find(t => t.innerText.includes("Lazer")).innerText.replace(/ /g, " "));
  assert.match(lazer, /—\s+R\$ 300,00\s+R\$ 300,00\s+R\$ 600,00\s+R\$ 200,00/, "parcelas da TV a partir de setembro");

  // outubro × média de agosto e setembro: alimentação +400 (+80%), transporte +100, lazer +150 (+100%)
  const variacao = await texto(p, ".rel-variacao");
  assert.match(variacao, /Alimentação R\$ 900,00\s+\+ R\$ 400,00 \(\+80%\)/);
  assert.match(variacao, /Lazer R\$ 300,00\s+\+ R\$ 150,00 \(\+100%\)/);
  assert.match(variacao, /Transporte R\$ 100,00\s+\+ R\$ 100,00/);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("exportar CSV com avulsos, contas fixas e parcelas", async () => {
  const p = await amb.abrir({ dados: DADOS });
  await aba(p, "relatorios");
  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    HTMLAnchorElement.prototype.click = function () { window.__nomeArquivo = this.download; };
    URL.createObjectURL = blob => {
      blob.arrayBuffer().then(b => { const u = new Uint8Array(b); window.__bom = u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf; window.__csv = new TextDecoder("utf-8", { ignoreBOM: true }).decode(u); });
      return orig(blob);
    };
  });
  await p.click("#relCsv");
  await p.waitForFunction(() => window.__csv);
  const csv = await p.evaluate(() => window.__csv);
  assert.equal(await p.evaluate(() => window.__nomeArquivo), "arqevon-finance-relatorio-2026-08_2026-10.csv");
  assert.ok(await p.evaluate(() => window.__bom), "arquivo começa com BOM (acentos no Excel)");
  assert.ok(csv.startsWith("\uFEFFMês;Data;Tipo;Descrição;Categoria;Origem;Valor"), "cabeçalho");
  const linhas = csv.slice(1).split("\r\n");
  assert.ok(linhas.includes("setembro de 2026;20/09/2026;Entrada;\"Freela; urgente\";;Avulso;1000,00"), "ponto e vírgula entre aspas");
  assert.ok(linhas.includes("outubro de 2026;10/10/2026;Despesa;Aluguel;Moradia;Conta fixa;-1500,00"));
  assert.ok(linhas.includes("outubro de 2026;;Despesa;TV;Lazer;Parcela 2/3;-300,00"));
  assert.equal(linhas.filter(x => x.includes("Parcela")).length, 2, "TV em setembro e outubro");
  // a soma das despesas do CSV bate com o relatório
  const despesas = linhas.slice(1).map(x => x.split(";").at(-1)).map(v => Number(v.replace(",", "."))).filter(v => v < 0).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(despesas * 100), -725000);
  await p.fechar();
});

test("períodos, imprimir e sem dados", async () => {
  const p = await amb.abrir({ dados: DADOS });
  await aba(p, "relatorios");
  await p.select("#relPeriodo", "ano");
  assert.equal(await texto(p, "#relPeriodoTexto"), "De agosto de 2026 a outubro de 2026");
  await p.select("#relPeriodo", "ano-1");
  assert.match(await texto(p, "#relConteudo"), /Nada para mostrar neste período/);
  assert.ok(await p.$eval("#relCsv", e => e.disabled));
  await p.select("#relPeriodo", "12");
  // o fim do período segue o mês escolhido no topo
  await p.click("#mesAnt");
  assert.equal(await texto(p, "#relPeriodoTexto"), "De agosto de 2026 a setembro de 2026");
  await p.evaluate(() => { window.print = () => { window.__imprimiu = true; }; });
  await p.click("#relImprimir");
  assert.equal(await p.evaluate(() => window.__imprimiu), true);
  await p.fechar();
});

test("sem nenhum dado e no exemplo", async () => {
  const p = await amb.abrir({ dados: null });
  await aba(p, "relatorios");
  assert.match(await texto(p, "#relConteudo"), /Nada para mostrar/);
  await p.evaluate(() => { verExemplo(); ativarAba("relatorios"); });
  await espera(100);
  assert.ok(await p.$(".rel-meses"), "o exemplo mostra o relatório");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("relatórios no celular e barra com 4 abas", async () => {
  const p = await amb.abrir({ dados: DADOS, vp: { width: 360, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  await aba(p, "relatorios");
  await p.select("#relPeriodo", "12");
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "sem rolagem lateral na página");
  const abas = await p.$$eval("#abas button", bs => bs.map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim(), r.left >= 0 && r.right <= innerWidth + 1]; }));
  assert.deepEqual(abas.map(a => a[1]), [true, true, true, true]);
  assert.deepEqual(abas.map(a => a[0]), ["Visão geral", "Lançamentos", "Relatórios", "Objetivos"]);
  const saldoVisivel = await p.evaluate(() => { const c = document.querySelector(".rel-meses tbody tr td:nth-child(4)").getBoundingClientRect(); return c.right <= innerWidth - 8; });
  assert.ok(saldoVisivel, "coluna Saldo do mês a mês cabe na tela");
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/relatorios-celular.png`, fullPage: true });
  await p.fechar();
});
