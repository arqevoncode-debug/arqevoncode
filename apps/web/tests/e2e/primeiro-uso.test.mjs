import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });

// Abre sem nada gravado: é a tela de boas-vindas de quem acabou de chegar.
const abrirNovo = (o = {}) => amb.abrir({ dados: null, ...o });
const clicarTexto = (p, sel, t) => p.evaluate((sel, t) => [...document.querySelectorAll(sel)].find(b => b.textContent.trim() === t).click(), sel, t);

test("ver um exemplo enche o painel sem gravar nada", async () => {
  const p = await abrirNovo();
  const painel = await texto(p, "#aba-painel");
  assert.match(painel, /Bem-vindo/);
  for (const b of ["Configurar em 2 minutos", "Lançar à mão", "Ver um exemplo"]) assert.ok(painel.includes(b), `botão ${b}`);

  await clicarTexto(p, "#aba-painel button", "Ver um exemplo");
  assert.ok(await p.$eval("#faixaExemplo", e => !e.hidden), "faixa de exemplo visível");
  const cheio = await texto(p, "#aba-painel");
  assert.match(cheio, /R\$ 6\.100,00/, "receitas do exemplo (salário + freela)");
  assert.match(cheio, /Projeção/);
  await aba(p, "lancamentos");
  assert.match(await texto(p, "#cardLista"), /parcela 3\/10/i);
  await aba(p, "objetivos");
  assert.match(await texto(p, "#listaObjetivos"), /Reserva de emergência/);

  // nada gravado e nada visível para a nuvem/backup
  assert.equal(await lerDados(p), null, "localStorage continua vazio");
  assert.deepEqual(await p.evaluate(() => MyFinanceBridge.obterDados()), VAZIO(), "a ponte entrega os dados reais (vazios)");
  // mexer no exemplo também não grava
  await aba(p, "lancamentos");
  await p.type("#lDesc", "Teste"); await p.type("#lValor", "1000"); await p.click("#lBtn");
  assert.equal(await lerDados(p), null);

  await p.click("#exemploSair");
  assert.ok(await p.$eval("#faixaExemplo", e => e.hidden));
  await aba(p, "painel");
  assert.match(await texto(p, "#aba-painel"), /Bem-vindo/, "volta para a tela vazia");
  await p.reload(); await espera(200);
  assert.ok(await p.$eval("#faixaExemplo", e => e.hidden), "recarregar não traz o exemplo");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("exportar ou importar durante o exemplo age sobre os dados reais", async () => {
  const real = { ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Meu gasto", valor: 10, categoria: "outros", data: "2026-10-02" }] };
  const p = await amb.abrir({ dados: real });
  await p.evaluate(() => verExemplo());
  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => { window.__exportado = t; }); return orig(blob); };
  });
  await p.click("#btnExportar");
  await p.waitForFunction(() => window.__exportado);
  const exp = JSON.parse(await p.evaluate(() => window.__exportado));
  assert.deepEqual(exp.lancamentos.map(l => l.descricao), ["Meu gasto"]);
  assert.ok(await p.$eval("#faixaExemplo", e => e.hidden), "exportar sai do exemplo");
  assert.deepEqual((await lerDados(p)).lancamentos.map(l => l.descricao), ["Meu gasto"]);
  await p.fechar();
});

test("configuração guiada cria renda, contas fixas e parcelas", async () => {
  const p = await abrirNovo();
  await clicarTexto(p, "#aba-painel button", "Configurar em 2 minutos");
  await p.waitForFunction(() => document.querySelector("#modalGuia").open);
  assert.equal(await p.$eval("#guiaPasso", e => e.textContent), "Passo 1 de 3");
  await p.type("#gRenda", "520000"); await p.type("#gRendaDia", "5");
  await p.click("#guiaAvancar");
  assert.equal(await p.$eval("#guiaPasso", e => e.textContent), "Passo 2 de 3");
  await p.type('[data-fixo="0"]', "150000"); await p.type('[data-fixo-dia="0"]', "10"); // aluguel
  await p.type('[data-fixo="4"]', "10990"); // internet, sem dia
  await p.click("#guiaAvancar");
  assert.equal(await texto(p, "#guiaAvancar"), "Concluir");
  const linha = '#gParcelas .guia-parcela:nth-child(1)';
  await p.type(`${linha} [data-g="desc"]`, "Celular"); await p.type(`${linha} [data-g="valor"]`, "25000");
  await p.type(`${linha} [data-g="atual"]`, "11"); await p.type(`${linha} [data-g="total"]`, "10");
  await p.click("#guiaAvancar");
  assert.match(await texto(p, "#guiaErro"), /Confira as parcelas de "Celular"/, "parcela 11 de 10 é recusada");
  await p.$eval(`${linha} [data-g="atual"]`, e => { e.value = "3"; });
  await p.click("#gMaisParcela"); // linha extra em branco é ignorada
  await p.click("#guiaAvancar");
  await p.waitForFunction(() => !document.querySelector("#modalGuia").open);

  const d = await lerDados(p);
  assert.deepEqual(d.fixos.map(f => [f.descricao, f.valor, f.dia, f.tipo]), [
    ["Salário", 5200, 5, "receita"], ["Aluguel ou financiamento", 1500, 10, "despesa"], ["Internet", 109.9, null, "despesa"]]);
  assert.deepEqual(d.parcelamentos.map(x => [x.descricao, x.valorTotal, x.numParcelas, x.inicio]), [["Celular", 2500, 10, "2026-08"]]);
  assert.match(await texto(p, "#aba-painel"), /R\$ 5\.200,00/);
  await aba(p, "lancamentos");
  assert.match(await texto(p, "#cardLista"), /parcela 3\/10/i, "outubro é a 3ª parcela");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("fechar a configuração não grava nada", async () => {
  const p = await abrirNovo();
  await p.evaluate(() => abrirGuia());
  await p.type("#gRenda", "100000"); await p.click("#guiaAvancar");
  await p.click("#guiaFechar");
  assert.equal(await lerDados(p), null);
  // concluir sem preencher nada também não grava
  await p.evaluate(() => abrirGuia());
  for (let i = 0; i < 3; i++) await p.click("#guiaAvancar");
  const d = await lerDados(p);
  assert.ok(!d || d.fixos.length + d.parcelamentos.length === 0);
  await p.fechar();
});

test("exemplo e configuração cabem no celular", async () => {
  const p = await abrirNovo({ vp: { width: 360, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  await p.evaluate(() => verExemplo());
  for (const a of ["painel", "lancamentos", "objetivos"]) {
    await aba(p, a);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `aba ${a} sem rolagem lateral`);
  }
  await p.click("#exemploConfigurar");
  await p.waitForFunction(() => document.querySelector("#modalGuia").open);
  for (let passo = 1; passo <= 3; passo++) {
    const larg = await p.evaluate(() => { const d = document.querySelector("#modalGuia"); return [d.scrollWidth, d.clientWidth, d.getBoundingClientRect().right, innerWidth]; });
    assert.ok(larg[0] <= larg[1] && larg[2] <= larg[3], `passo ${passo} cabe na tela: ${larg}`);
    if (passo < 3) await p.click("#guiaAvancar");
  }
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/guia-celular.png` });
  await p.fechar();
});

test("o link /#exemplo abre o exemplo sem pedir login", async () => {
  const p = await abrirNovo();
  // visitante novo: sem modo local e sem sessão
  await p.evaluate(() => localStorage.removeItem("arqevon-web-local"));
  await p.goto(p.url().split("#")[0] + "#exemplo");
  await p.reload();
  await p.waitForFunction(() => !document.querySelector("#faixaExemplo").hidden, { timeout: 10000 });
  assert.ok(await p.$eval("#webLogin", e => e.hidden), "sem tela de login");
  assert.ok(!p.url().includes("#exemplo"), "o endereço volta ao normal");
  assert.equal(await lerDados(p), null, "nada gravado");
  await p.fechar();
});
