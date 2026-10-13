import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const quase = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} ≠ ${b}`);

// hoje = 13/10/2026
const DADOS = {
  lancamentos: [
    { id: "a", tipo: "despesa", descricao: "Mercado", valor: 600, categoria: "alimentacao", data: "2026-10-03" },
    { id: "b", tipo: "despesa", descricao: "Fatura", valor: 1000, categoria: "cartao", data: "2026-10-10" },
    { id: "c", tipo: "despesa", descricao: "Uber", valor: 300, categoria: "transporte", data: "2026-09-12" },
    { id: "d", tipo: "receita", descricao: "Freela", valor: 700, categoria: "outros", data: "2026-10-20" },
    { id: "e", tipo: "despesa", descricao: "Ago", valor: 900, categoria: "lazer", data: "2026-08-01" },
    { id: "g", tipo: "despesa", descricao: "Antiga", valor: 5000, categoria: "lazer", data: "2026-06-01" },
  ],
  fixos: [
    { id: "f1", tipo: "receita", descricao: "Salário", valor: 5000, categoria: "outros", dia: 5 },
    { id: "f2", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10 },
  ],
  parcelamentos: [{ id: "p1", descricao: "TV", valorTotal: 1000, numParcelas: 3, categoria: "lazer", inicio: "2026-09" }],
  objetivos: [],
};

test("resumo do mês, projeção e saldo devedor", async () => {
  const p = await amb.abrir({ dados: DADOS });
  const r = await p.evaluate(() => resumoDoMes("2026-10"));
  quase(r.receitas, 5700, "receitas = salário + freela");
  quase(r.despesas, 600 + 1000 + 1500 + 1000 / 3, "despesas = avulsas + fixo + parcela");
  quase(r.saldo, 5700 - (3100 + 1000 / 3), "saldo");

  const proj = await p.evaluate(() => projecao(6));
  quase(proj.media, 600, "média de variáveis dos últimos 3 meses, sem a categoria cartão");
  quase(proj.meses[0].parcelas, 1000 / 3, "última parcela em novembro");
  assert.equal(proj.meses[1].parcelas, 0, "nada em dezembro");
  quase(proj.meses[0].saldo, 5000 - (1500 + 1000 / 3 + 600), "saldo previsto de novembro");
  assert.equal(proj.meses[5].mk, "2027-04", "seis meses à frente");

  await aba(p, "lancamentos");
  const lista = await texto(p, "#cardLista");
  assert.match(lista, /parcela 2\/3/i);
  assert.match(lista, /R\$ 333,33/);
  assert.match(lista, /parcelas futuras\): R\$ 333,33/, "falta 1 parcela");
  const painel = await texto(p, "#aba-painel");
  assert.match(painel, /R\$ 5\.700,00/);
  assert.match(painel, /Novembro de 2026/, "projeção com o mês escrito certo");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("fevereiro, virada de ano e mês sem dados", async () => {
  const p = await amb.abrir({ dados: DADOS, hoje: "2027-02-10T12:00:00" });
  await aba(p, "lancamentos");
  assert.equal(await texto(p, "#mesLabel"), "Fevereiro de 2027");
  await p.click("#mesAnt"); await p.click("#mesAnt");
  assert.equal(await texto(p, "#mesLabel"), "Dezembro de 2026");
  await p.click("#mesProx");
  assert.equal(await texto(p, "#mesLabel"), "Janeiro de 2027");
  const r = await p.evaluate(() => resumoDoMes("2027-01"));
  quase(r.despesas, 1500, "em janeiro só o aluguel (a TV acabou em novembro)");
  // dia 31 em fevereiro cai no último dia do mês
  await p.click("#mesHoje");
  await p.type("#lDesc", "Conta"); await p.type("#lValor", "1000"); await p.type("#lDia", "31"); await p.click("#lBtn");
  const d = await p.evaluate(() => dados.lancamentos.find(l => l.descricao === "Conta").data);
  assert.equal(d, "2027-02-28");
  await p.fechar();
});

test("categoria desconhecida aparece como Outros", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "x", tipo: "despesa", descricao: "Coisa", valor: 10, categoria: "pets", data: "2026-10-02" }] } });
  await aba(p, "lancamentos");
  const chip = await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Coisa")).querySelector(".chip").innerText);
  assert.equal(chip.trim(), "Outros");
  await p.fechar();
});

test("muitos dados continuam rápidos", async () => {
  const l = [];
  for (let i = 0; i < 6000; i++) {
    const m = i % 60, ano = 2022 + Math.floor(m / 12), mes = (m % 12) + 1;
    l.push({ id: "x" + i, tipo: i % 7 ? "despesa" : "receita", descricao: "Item " + i, valor: (i % 300) + 0.99,
      categoria: ["moradia", "alimentacao", "lazer", "cartao"][i % 4],
      data: `${ano}-${String(mes).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}` });
  }
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: l } });
  const ms = await p.evaluate(() => { const t0 = performance.now(); for (let i = 0; i < 5; i++) renderTudo(); return (performance.now() - t0) / 5; });
  assert.ok(ms < 500, `redesenhar levou ${ms.toFixed(0)} ms`);
  await p.fechar();
});
