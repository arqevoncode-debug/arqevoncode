import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });
// hoje = 13/10/2026
const irPara = (p, mk) => p.evaluate(mk => { mesAtual = deChave(mk); renderTudo(); }, mk);
const lista = p => texto(p, "#cardLista");
const despesas = (p, mk) => p.evaluate(mk => resumoDoMes(mk).fixas, mk);
const ALUGUEL = { id: "al", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10, inicio: "2026-09" };

async function editarFixo(p, mk, id, novoValor, escolha) {
  await irPara(p, mk);
  await p.evaluate(id => editarItem("fixo", id), id);
  await limparEDigitar(p, "#lValor", novoValor);
  await p.click("#lBtn");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  await p.click(escolha);
  await espera(150);
}

test("conta fixa nova vale a partir do mês em que foi criada", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "lancamentos");
  await irPara(p, "2026-11");
  await p.select("#lRep", "fixo");
  await p.type("#lDesc", "Academia"); await p.type("#lValor", "9900"); await p.type("#lDia", "8"); await p.click("#lBtn");
  const d = await lerDados(p);
  assert.equal(d.fixos[0].inicio, "2026-11");
  assert.match(await lista(p), /Academia/);
  await irPara(p, "2026-10");
  assert.doesNotMatch(await lista(p), /Academia/, "não aparece em outubro");
  assert.equal(await despesas(p, "2026-10"), 0);
  assert.equal(await despesas(p, "2027-03"), 99);
  const proj = await p.evaluate(() => projecao(6).meses.map(m => m.fixas));
  assert.deepEqual(proj, [99, 99, 99, 99, 99, 99], "projeção a partir de novembro");
  await p.fechar();
});

test("aumento do aluguel a partir deste mês preserva o histórico", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL] } });
  await aba(p, "lancamentos");
  await editarFixo(p, "2026-11", "al", "165000", "#confirmacaoAceitar"); // "A partir deste mês"
  const d = await lerDados(p);
  assert.deepEqual(d.fixos.map(f => [f.valor, f.inicio, f.fim ?? null]), [[1500, "2026-09", "2026-10"], [1650, "2026-11", null]]);
  assert.equal(await despesas(p, "2026-10"), 1500);
  assert.equal(await despesas(p, "2026-11"), 1650);
  await irPara(p, "2026-10");
  assert.match(await lista(p), /fixo até out\/26/i);
  assert.equal(await texto(p, "#lBtn"), "Adicionar despesa", "saiu da edição");
  await p.fechar();
});

test("correção em todos os meses mantém um registro só", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL] } });
  await aba(p, "lancamentos");
  await editarFixo(p, "2026-11", "al", "155000", "#confirmacaoAlternativa"); // "Em todos os meses"
  const d = await lerDados(p);
  assert.deepEqual(d.fixos.map(f => [f.id, f.valor, f.inicio, f.fim ?? null]), [["al", 1550, "2026-09", null]]);
  await p.fechar();
});

test("cancelar a escolha não muda nada", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL] } });
  await aba(p, "lancamentos");
  await editarFixo(p, "2026-11", "al", "999900", "#confirmacaoCancelar");
  assert.deepEqual((await lerDados(p)).fixos, [ALUGUEL]);
  assert.equal(await texto(p, "#lBtn"), "Salvar alterações", "continua em edição");
  await p.fechar();
});

test("encerrar a partir deste mês ou excluir de todos os meses", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL, { ...ALUGUEL, id: "net", descricao: "Internet", valor: 100 }] } });
  await aba(p, "lancamentos");
  await irPara(p, "2026-11");
  const excluir = desc => p.evaluate(d => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes(d)).querySelector("button.excluir").click(), desc);
  await excluir("Aluguel");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  assert.match(await texto(p, "#confirmacaoMensagem"), /deixa de aparecer a partir de novembro de 2026/);
  await p.click("#confirmacaoAceitar");
  await espera(100);
  assert.equal((await lerDados(p)).fixos.find(f => f.id === "al").fim, "2026-10");
  assert.doesNotMatch(await lista(p), /Aluguel/);
  await irPara(p, "2026-10");
  assert.match(await lista(p), /Aluguel/, "outubro continua com o aluguel");

  await irPara(p, "2026-11");
  await excluir("Internet");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  await p.click("#confirmacaoAlternativa");
  await espera(100);
  assert.ok(!(await lerDados(p)).fixos.some(f => f.id === "net"), "excluída de todos os meses");
  await p.fechar();
});

test("conta criada neste mês: exclusão simples; conta antiga sem início vale em todos os meses", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [
    { ...ALUGUEL, id: "novo", descricao: "Novo", inicio: "2026-10" },
    { id: "velho", tipo: "despesa", descricao: "Velho", valor: 50, categoria: "outros", dia: 1 }] } });
  assert.equal(await despesas(p, "2020-01"), 50, "sem início vale desde sempre");
  await aba(p, "lancamentos");
  await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Novo")).querySelector("button.excluir").click());
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  assert.ok(await p.$eval("#confirmacaoAlternativa", e => e.hidden), "sem a pergunta de encerrar");
  assert.equal(await texto(p, "#confirmacaoAceitar"), "Excluir");
  await p.click("#confirmacaoAceitar"); await espera(100);
  assert.deepEqual((await lerDados(p)).fixos.map(f => f.id), ["velho"]);
  await p.fechar();
});

test("excluir lançamento comum continua com a confirmação de sempre", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL], lancamentos: [{ id: "a", tipo: "despesa", descricao: "Pão", valor: 5, categoria: "alimentacao", data: "2026-10-02" }] } });
  await aba(p, "lancamentos");
  // depois de uma pergunta de conta fixa, a janela volta ao texto normal
  await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Aluguel")).querySelector("button.excluir").click());
  await p.click("#confirmacaoCancelar");
  await p.evaluate(() => [...document.querySelectorAll("#cardLista tr")].find(t => t.innerText.includes("Pão")).querySelector("button.excluir").click());
  assert.equal(await texto(p, "#confirmacaoTitulo"), "Confirmar exclusão");
  assert.ok(await p.$eval("#confirmacaoAlternativa", e => e.hidden));
  await p.click("#confirmacaoAceitar"); await espera(100);
  assert.equal((await lerDados(p)).lancamentos.length, 0);
  assert.equal((await lerDados(p)).fixos.length, 1);
  await p.fechar();
});
