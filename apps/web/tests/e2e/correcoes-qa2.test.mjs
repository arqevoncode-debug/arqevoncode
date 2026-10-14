// Segunda rodada do teste exploratório (2026-10-14): casos que reproduziam cada bug.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });
const ALUGUEL = { id: "al", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10, inicio: "2026-01" };
async function abrirExtrato(p, nome) {
  await p.evaluate(() => ativarAba("lancamentos"));
  await (await p.$("#arqExtrato")).uploadFile(resolve(import.meta.dirname, "extratos", nome));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open, { timeout: 5000 });
  await espera(100);
}
const itensExtrato = p => p.$$eval("#extLista .ext-item", els => els.map(e => [e.querySelector(".ext-desc").childNodes[0].textContent.trim(), e.querySelector(".ext-valor").textContent.replace(/ /g, " ").trim()]));

test("extrato ou exemplo durante uma edição: o formulário é limpo e não cria cópia", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL] } });
  await aba(p, "lancamentos");
  await p.evaluate(() => editarItem("fixo", "al"));
  await abrirExtrato(p, "banco.ofx");
  await p.click("#extCancelar");
  assert.equal(await p.$eval("#lDesc", e => e.value), "", "formulário limpo depois do extrato");
  await p.evaluate(() => { editarItem("fixo", "al"); verExemplo(); });
  await p.click("#exemploSair");
  await aba(p, "lancamentos");
  assert.equal(await p.$eval("#lDesc", e => e.value), "", "formulário limpo depois do exemplo");
  await p.click("#lBtn"); await espera(100);
  assert.equal((await lerDados(p)).fixos.length, 1, "nenhum Aluguel a mais");
  await p.fechar();
});

test("itens sem id ou com id numérico podem ser editados e excluídos um a um", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    lancamentos: [{ id: 7, tipo: "despesa", descricao: "Numérico", valor: 10, categoria: "outros", data: "2026-10-02" },
      { tipo: "despesa", descricao: "Sem id", valor: 20, categoria: "outros", data: "2026-10-03" }],
    objetivos: [{ id: "o", nome: "Reserva", meta: 0, aporteMensal: 0, aportes: [{ valor: 100, data: "2026-10-01" }, { valor: 50, data: "2026-10-02" }] }] } });
  const d = await lerDados(p);
  assert.ok(d.lancamentos.every(l => typeof l.id === "string" && l.id), "ids gravados como texto");
  assert.ok(d.objetivos[0].aportes.every(a => a.id), "aportes ganham id");
  await aba(p, "lancamentos");
  await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Numérico")).querySelector("button.editar").click());
  assert.equal(await p.$eval("#lDesc", e => e.value), "Numérico");
  await p.click("#lCancelar");
  await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Sem id")).querySelector("button.excluir").click());
  await p.click("#confirmacaoAceitar"); await espera(100);
  assert.deepEqual((await lerDados(p)).lancamentos.map(l => l.descricao), ["Numérico"]);
  // excluir um movimento sem id não apaga os outros
  await aba(p, "objetivos");
  await p.click(".obj-card details summary");
  await p.evaluate(() => [...document.querySelectorAll(".hist-linha")].find(l => l.innerText.includes("100,00")).querySelector("button").click());
  if (await p.$eval("#modalConfirmacao", e => e.open)) await p.click("#confirmacaoAceitar");
  await espera(100);
  assert.deepEqual((await lerDados(p)).objetivos[0].aportes.map(a => a.valor), [50]);
  // os ids criados não mudam ao reabrir
  const antes = (await lerDados(p)).lancamentos.map(l => l.id);
  await p.reload(); await espera(200);
  assert.deepEqual((await lerDados(p)).lancamentos.map(l => l.id), antes);
  await p.fechar();
});

test("CSV com aspa solta e com título antes de um cabeçalho com vírgula", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "aspas-soltas.csv");
  assert.deepEqual((await itensExtrato(p))[0], ["TV 50\" SAMSUNG", "− R$ 2.000,00"]);
  assert.equal((await itensExtrato(p)).length, 3);
  await p.click("#extCancelar");
  await abrirExtrato(p, "titulo-virgula.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => x[0]), ["Padaria", "Mercado"]);
  await p.fechar();
});

test("imprimir: só o relatório pelo botão, cabendo na folha; Ctrl+P em outra aba imprime a tela", async () => {
  const l = [];
  for (let m = 1; m <= 10; m++) l.push({ id: "x" + m, tipo: "despesa", descricao: "Mercado", valor: 1234.56 * m, categoria: "alimentacao", data: `2026-${String(m).padStart(2, "0")}-05` });
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: l } });
  await p.emulateMediaType("print");
  await aba(p, "painel");
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#aba-painel")).visibility), "visible", "Ctrl+P no painel não esconde nada");
  await aba(p, "relatorios");
  await p.select("#relPeriodo", "12");
  await p.evaluate(() => document.documentElement.classList.add("imprimindo-relatorio"));
  await p.setViewport({ width: 1047, height: 720 }); // A4 deitado menos as margens, a 96 dpi
  const r = await p.evaluate(() => {
    const t = document.querySelector(".rel-matriz"), w = t.closest(".tabela-wrap");
    return { tabela: Math.ceil(t.getBoundingClientRect().right), largura: innerWidth, rodape: getComputedStyle(document.querySelector(".rodape-dados, #aba-lancamentos")).visibility };
  });
  assert.ok(r.tabela <= r.largura, `matriz cabe na folha (${r.tabela} ≤ ${r.largura})`);
  await p.fechar();
});

test("virada do dia com o app aberto", async () => {
  const p = await amb.abrir({ dados: VAZIO(), hoje: "2026-10-31T23:50:00" });
  await p.evaluate(() => atualizarHoje(new Date("2026-11-01T00:10:00")));
  assert.equal(await texto(p, "#mesLabel"), "Novembro de 2026", "o topo acompanha o mês");
  await aba(p, "lancamentos");
  await p.type("#lDesc", "Pão"); await p.type("#lValor", "500"); await p.click("#lBtn");
  assert.equal((await lerDados(p)).lancamentos[0].data, "2026-11-01");
  await p.fechar();
});

test("saldo zerado não aparece como -R$ 0,00 nem 'faltando'", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [
    { id: "r", tipo: "receita", descricao: "R", valor: 0.3, categoria: "outros", data: "2026-10-01" },
    { id: "a", tipo: "despesa", descricao: "A", valor: 0.1, categoria: "outros", data: "2026-10-01" },
    { id: "b", tipo: "despesa", descricao: "B", valor: 0.2, categoria: "outros", data: "2026-10-01" }] } });
  const painel = await texto(p, "#aba-painel");
  assert.doesNotMatch(painel, /-R\$ 0,00|faltando/);
  await aba(p, "relatorios");
  assert.doesNotMatch(await texto(p, "#relConteudo"), /-R\$ 0,00|faltou/);
  await p.fechar();
});

test("valor negativo grande não quebra o sinal para outra linha", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [{ id: "f", tipo: "despesa", descricao: "Grande", valor: 13000, categoria: "moradia", dia: 1, inicio: "2026-10" }] } });
  for (const w of [700, 1024, 1280]) {
    await p.setViewport({ width: w, height: 900 });
    const linhas = await p.evaluate(() => [...document.querySelectorAll(".tile .valor")].map(v => Math.round(v.getBoundingClientRect().height / parseFloat(getComputedStyle(v).lineHeight || 30))));
    assert.ok(await p.evaluate(() => [...document.querySelectorAll(".tile .valor")].every(v => getComputedStyle(v).whiteSpace === "nowrap")), `${w}px`);
  }
  await p.fechar();
});

test("refazer a edição de um objetivo: sincronização espera", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), objetivos: [{ id: "o", nome: "Reserva", meta: 0, aporteMensal: 0, aportes: [] }] } });
  await p.evaluate(() => editarObjetivo("o"));
  assert.equal(await p.evaluate(() => MyFinanceBridge.editando()), true);
  await p.fechar();
});

// ---------- Lote B: baixa gravidade e usabilidade ----------
const dadosMes = (mes, extra = {}) => ({ ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Mercado", valor: 100, categoria: "alimentacao", data: `${mes}-05` }], ...extra });

test("relatório: só contas fixas antigas, meses futuros fora, textos", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [{ id: "s", tipo: "receita", descricao: "Salário", valor: 3000, categoria: "outros", dia: 5 }] } });
  await aba(p, "relatorios");
  assert.match(await texto(p, "#relConteudo"), /R\$ 3\.000,00/, "contas fixas antigas aparecem");
  assert.equal(await texto(p, "#relPeriodoTexto"), "Outubro de 2026", "um mês só: sem 'de outubro a outubro'");
  await p.fechar();
  const q = await amb.abrir({ dados: dadosMes("2026-09", { fixos: [{ id: "f", tipo: "despesa", descricao: "Aluguel", valor: 1000, categoria: "moradia", dia: 5, inicio: "2026-09" }] }) });
  await aba(q, "relatorios");
  await q.evaluate(() => { mesAtual = { ano: 2027, mes: 2 }; renderTudo(); });
  assert.match(await texto(q, "#relPeriodoTexto"), /^Outubro de 2026 · meses futuros ficam de fora/, "6 meses até mar/27: só outubro já aconteceu");
  await q.select("#relPeriodo", "12");
  assert.match(await texto(q, "#relPeriodoTexto"), /^De setembro de 2026 a outubro de 2026 · meses futuros ficam de fora/);
  await q.evaluate(() => { mesAtual = { ano: 2026, mes: 9 }; renderTudo(); });
  assert.match(await texto(q, "#relConteudo"), /Outubro de 2026 × mês anterior/);
  await q.fechar();
});

test("CSV: o que está na tela (inclusive o exemplo) e descrições sem virar fórmula", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [
    { id: "a", tipo: "despesa", descricao: "=HYPERLINK(\"x\")", valor: 10, categoria: "outros", data: "2026-10-02" },
    { id: "b", tipo: "despesa", descricao: "+5511999", valor: 5, categoria: "outros", data: "2026-10-03" }] } });
  await aba(p, "relatorios");
  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => { window.__csv = t; }); return orig(blob); };
    HTMLAnchorElement.prototype.click = function () {};
  });
  await p.click("#relCsv");
  await p.waitForFunction(() => window.__csv);
  const csv = await p.evaluate(() => window.__csv);
  assert.ok(csv.includes(`;"'=HYPERLINK(""x"")";`), "fórmula vira texto");
  assert.ok(csv.includes(";'+5511999;"), "telefone vira texto");
  assert.ok(csv.includes(";-10,00"), "o valor continua número");
  await p.evaluate(() => { window.__csv = null; verExemplo(); ativarAba("relatorios"); });
  await p.click("#relCsv");
  await p.waitForFunction(() => window.__csv);
  assert.ok(await p.$eval("#faixaExemplo", e => !e.hidden), "continua no exemplo");
  assert.match(await p.evaluate(() => window.__csv), /Salário/, "exporta o exemplo que está na tela");
  await p.fechar();
});

test("extrato: entidades no OFX, -0.500, ano com 2 dígitos, 'Saldo' no nome da compra", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "ofx-casos.ofx");
  assert.deepEqual(await itensExtrato(p), [["Parenteses", "− R$ 45,10"], ["Mesmo FITID", "− R$ 10,00"], ["Tom & Jerry", "− R$ 10,00"]]);
  await p.click("#extCancelar");
  const r = await p.evaluate(() => ({ meio: valorExtrato("-0.500"), mil: valorExtrato("1.500"), ano: dataExtrato("31/12/99"), ano2: dataExtrato("05/01/27") }));
  assert.deepEqual(r, { meio: -0.5, mil: 1500, ano: "1999-12-31", ano2: "2027-01-05" });
  const linhas = await p.evaluate(() => transacoesCSV({ linhas: [["02/10/2026", "Saldo Restaurante", "-30,00"], ["02/10/2026", "SALDO ANTERIOR", ""], ["03/10/2026", "Saldo do dia", "100,00"]] }, { data: 0, desc: 1, valor: 2, credito: null, debito: null, dc: null }));
  assert.deepEqual(linhas.map(l => l.desc), ["Saldo Restaurante"]);
  await p.fechar();
});

test("um lançamento manual desmarca só uma das compras iguais do extrato", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "m", tipo: "despesa", descricao: "Café", valor: 5, categoria: "alimentacao", data: "2026-10-02" }] } });
  await abrirExtrato(p, "repetidos-mesmo-dia.csv");
  assert.deepEqual(await p.$$eval("#extLista input[type=checkbox]", cs => cs.map(c => c.checked)), [false, true, true]);
  assert.ok(await p.$eval("#extTodos", e => e.indeterminate), "'Todos' mostra o estado intermediário");
  await p.fechar();
});

test("inverter sinais escolhido à mão sobrevive à troca de coluna", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "colunas-estranhas.csv");
  await p.select("#extColData", "0"); await p.select("#extColDesc", "1"); await p.select("#extColValor", "2");
  await p.click("#extInverter");
  assert.ok(await p.$eval("#extInverter", e => e.checked));
  await p.select("#extColDesc", "1");
  assert.ok(await p.$eval("#extInverter", e => e.checked), "a escolha manual continua");
  await p.fechar();
});

test("editar um parcelado não muda o mês do topo; abas com aria-current", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), parcelamentos: [{ id: "p", descricao: "TV", valorTotal: 1000, numParcelas: 10, categoria: "lazer", inicio: "2026-08" }] } });
  await aba(p, "lancamentos");
  assert.equal(await p.$eval('#abas button[data-aba="lancamentos"]', b => b.getAttribute("aria-current")), "page");
  await p.evaluate(() => editarItem("parc", "p"));
  await limparEdicao2(p);
  assert.equal(await texto(p, "#mesLabel"), "Outubro de 2026");
  await p.fechar();
});
async function limparEdicao2(p) { await limparEdicaoValor(p); }
async function limparEdicaoValor(p) { await limparEDigitar(p, "#lValor", "120000"); await p.click("#lBtn"); await espera(100); }
