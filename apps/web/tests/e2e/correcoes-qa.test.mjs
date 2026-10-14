// Bugs encontrados pelo teste exploratório de 2026-10-14, com os passos que os reproduziam.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar, ligarCripto, desbloquear } from "./ambiente.mjs";

const amb = preparar({ before, after });
const real = () => ({ ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Meu gasto real", valor: 10, categoria: "outros", data: "2026-10-02" }] });
const descricoes = p => p.evaluate(() => dados.lancamentos.map(l => l.descricao));

test("trocar a senha com o exemplo aberto: a senha nova abre", async () => {
  const p = await amb.abrir({ dados: real() });
  await ligarCripto(p, "senhaA123");
  await p.evaluate(() => verExemplo());
  await p.click("#btnCripto");
  assert.ok(await p.$eval("#faixaExemplo", e => e.hidden), "abrir a segurança sai do exemplo");
  await p.type("#sgAtual", "senhaA123"); await p.type("#sgNova", "senhaB456"); await p.type("#sgConf", "senhaB456");
  await p.click("#sgSalvar");
  await p.waitForFunction(() => !document.querySelector("#modalSeg").open, { timeout: 15000 });
  await espera(500);
  await p.reload(); await espera(300);
  await desbloquear(p, "senhaB456");
  assert.deepEqual(await descricoes(p), ["Meu gasto real"]);
  await p.fechar();
});

test("ligar a criptografia com o exemplo aberto: os dados reais ficam cifrados e continuam gravando", async () => {
  const p = await amb.abrir({ dados: real() });
  await p.evaluate(() => verExemplo());
  await ligarCripto(p);
  await p.reload(); await espera(300);
  assert.ok(await p.$eval("#telaBloqueio", e => !e.hidden), "pede a senha ao reabrir");
  await desbloquear(p);
  await aba(p, "lancamentos");
  await p.type("#lDesc", "Depois"); await p.type("#lValor", "500"); await p.click("#lBtn");
  await espera(800);
  await p.reload(); await espera(300);
  await desbloquear(p);
  assert.deepEqual(await descricoes(p), ["Meu gasto real", "Depois"]);
  await p.fechar();
});

test("primeira visita pelo /#exemplo: o convite de criptografia espera o exemplo terminar", async () => {
  const p = await amb.abrir({ dados: null });
  await p.evaluate(() => localStorage.clear()); // sem convite já feito e sem modo local
  await p.goto(p.url().split("#")[0] + "#exemplo");
  await p.reload();
  await p.waitForFunction(() => !document.querySelector("#faixaExemplo").hidden, { timeout: 10000 });
  await espera(600);
  assert.ok(!(await p.$eval("#modalSeg", e => e.open)), "sem convite por cima do exemplo");
  await p.click("#exemploSair");
  await p.waitForFunction(() => document.querySelector("#modalSeg").open, { timeout: 5000 });
  assert.ok(await p.$eval("#sgConvite", e => !e.hidden), "o convite aparece ao sair do exemplo");
  await p.fechar();
});

test("conta fixa que vira 'Só este mês' a partir deste mês mantém os meses anteriores", async () => {
  const ALUGUEL = { id: "al", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10, inicio: "2026-01" };
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [ALUGUEL] } });
  await aba(p, "lancamentos");
  await p.evaluate(() => editarItem("fixo", "al"));
  await p.select("#lRep", "unico");
  await p.click("#lBtn");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  assert.equal(await texto(p, "#confirmacaoTitulo"), "Deixar de ser conta fixa");
  await p.click("#confirmacaoAceitar"); // a partir deste mês
  await espera(150);
  const d = await lerDados(p);
  assert.deepEqual(d.fixos.map(f => [f.id, f.fim]), [["al", "2026-09"]]);
  assert.deepEqual(d.lancamentos.map(l => [l.descricao, l.data]), [["Aluguel", "2026-10-10"]]);
  assert.equal(await p.evaluate(() => resumoDoMes("2026-06").fixas), 1500, "junho continua com o aluguel");

  // e "Apagar de todos os meses" apaga, como antes
  await p.evaluate(() => { dados.fixos.push({ id: "net", tipo: "despesa", descricao: "Internet", valor: 100, categoria: "moradia", dia: 5, inicio: "2026-01" }); renderTudo(); editarItem("fixo", "net"); });
  await p.select("#lRep", "parcelado");
  await p.click("#lBtn");
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  await p.click("#confirmacaoAlternativa");
  await espera(150);
  assert.ok(!(await lerDados(p)).fixos.some(f => f.id === "net"));
  await p.fechar();
});

test("clique duplo em Adicionar numa conta fixa grava uma vez só", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "lancamentos");
  await p.select("#lRep", "fixo");
  await p.type("#lDesc", "Academia"); await p.type("#lValor", "9900");
  await p.evaluate(() => { const f = document.querySelector("#formLanc"); f.requestSubmit(); f.requestSubmit(); });
  await espera(300);
  assert.equal((await lerDados(p)).fixos.length, 1);
  await p.fechar();
});

test("a tela de bloqueio fecha as janelas abertas (extrato, limites)", async () => {
  const p = await amb.abrir({ dados: VAZIO(), aceleraIdle: 30 });
  await p.click("#btnBloqueio"); await p.type("#sgNova", "senha-xyz"); await p.type("#sgConf", "senha-xyz");
  await p.$eval("#sgCripto", e => { e.checked = false; }); await p.$eval("#sgBloqueio", e => { e.checked = true; });
  await p.select("#sgMinutos", "1"); await p.click("#sgSalvar");
  await p.waitForFunction(() => !document.querySelector("#modalSeg").open, { timeout: 15000 });
  await aba(p, "lancamentos");
  await (await p.$("#arqExtrato")).uploadFile(resolve(import.meta.dirname, "extratos", "banco.ofx"));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open);
  await p.waitForFunction(() => !document.querySelector("#telaBloqueio").hidden, { timeout: 10000 });
  assert.equal(await p.evaluate(() => document.querySelectorAll("dialog[open]").length), 0, "nenhuma janela aberta por cima do cadeado");
  await desbloquear(p, "senha-xyz");
  assert.equal((await lerDados(p)).lancamentos.length, 0, "o extrato não foi importado");
  await p.fechar();
});

test("id malicioso num backup não executa código nos objetivos", async () => {
  const id = "o');window.__xss=1;('";
  const p = await amb.abrir({ dados: { ...VAZIO(), objetivos: [{ id, nome: "Reserva", meta: 100, aporteMensal: 0, aportes: [{ id: "x');window.__xss=2;('", valor: 10, data: "2026-10-01" }] }] } });
  await aba(p, "objetivos");
  await p.click(".obj-card button.editar");
  assert.equal(await p.$eval("#oNome", e => e.value), "Reserva", "editar continua funcionando");
  await p.click("#oCancelar");
  await limparEDigitar(p, "input[data-aporte]", "2000");
  await p.click(".obj-card .botao.entrada");
  await p.click(".obj-card details summary");
  p.respostas.push(true);
  await p.evaluate(() => [...document.querySelectorAll(".hist-linha")].find(l => l.innerText.includes("10,00")).querySelector("button.excluir").click());
  await espera(100);
  assert.equal(await p.evaluate(() => window.__xss), undefined);
  assert.deepEqual((await lerDados(p)).objetivos[0].aportes.map(a => a.valor), [20], "guardou 20 e excluiu o movimento antigo");
  await p.fechar();
});

test("centavos dos objetivos: guardar 0,70 + 0,10 e retirar 0,80", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), objetivos: [{ id: "o", nome: "Cofrinho", meta: 0.8, aporteMensal: 0, aportes: [] }] } });
  await aba(p, "objetivos");
  for (const v of ["70", "10"]) { await limparEDigitar(p, "input[data-aporte]", v); await p.click(".obj-card .botao.entrada"); }
  assert.match(await texto(p, "#listaObjetivos"), /Meta atingida/);
  await limparEDigitar(p, "input[data-aporte]", "80");
  await p.click(".obj-card .botao.cancelar");
  await espera(100);
  assert.deepEqual(p.vistos, [], "sem o alerta 'você só tem R$ 0,80'");
  assert.match(await texto(p, "#listaObjetivos"), /R\$ 0,00/);
  await p.fechar();
});
