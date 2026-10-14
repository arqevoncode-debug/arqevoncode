import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { preparar, VAZIO, espera, lerDados, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const arquivo = nome => resolve(import.meta.dirname, "extratos", nome);

async function abrirExtrato(p, nome) {
  await p.evaluate(() => ativarAba("lancamentos"));
  await (await p.$("#arqExtrato")).uploadFile(arquivo(nome));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open, { timeout: 5000 });
  await espera(100);
}
const linhas = p => p.$$eval("#extLista .ext-item", els => els.map(e => ({
  desc: e.querySelector(".ext-desc").childNodes[0].textContent.trim(),
  valor: e.querySelector(".ext-valor").textContent.replace(/ /g, " ").trim(),
  cat: e.querySelector("select")?.value || null,
  marcado: e.querySelector("input").checked,
  aviso: e.querySelector("small")?.textContent || "",
})));

test("conversões de data e valor", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  const r = await p.evaluate(() => ({
    datas: ["03/10/2026", "3/10/26", "2026-10-03", "03-10-2026", "20261003120000[-3:BRT]", "31/02/2026", "texto"].map(t => dataExtrato(t)),
    valores: ["R$ -1.234,56", "-1234.56", "(12,30)", "1.234", "1.234,5", "45,9", "+10", "12-", "abc", ""].map(valorExtrato),
  }));
  assert.deepEqual(r.datas, ["2026-10-03", "2026-10-03", "2026-10-03", "2026-10-03", "2026-10-03", null, null]);
  assert.deepEqual(r.valores, [-1234.56, -1234.56, -12.3, 1234, 1234.5, 45.9, 10, -12, null, null]);
  await p.fechar();
});

test("OFX do banco em Windows-1252: acentos, sinais e categorias", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "banco.ofx");
  const l = await linhas(p);
  assert.deepEqual(l.map(x => x.desc), ["PADARIA SÃO JOSÉ", "SALARIO EMPRESA LTDA", "DROGARIA SAO PAULO"]);
  assert.deepEqual(l.map(x => x.valor), ["− R$ 23,50", "+ R$ 5.200,00", "− R$ 89,90"]);
  assert.deepEqual(l.map(x => x.cat), ["alimentacao", null, "saude"]);
  assert.ok(!(await p.$eval("#extInverter", e => e.checked)), "OFX não inverte sinais");
  assert.match(await texto(p, "#extResumo"), /3 lançamentos de 03\/10\/2026 a 07\/10\/2026/);
  assert.equal(await texto(p, "#extImportar"), "Importar 3 lançamentos");
  await p.click("#extImportar");
  await p.waitForFunction(() => !document.querySelector("#modalExtrato").open);
  const d = await lerDados(p);
  assert.deepEqual(d.lancamentos.map(x => [x.tipo, x.descricao, x.valor, x.data, x.categoria]), [
    ["despesa", "PADARIA SÃO JOSÉ", 23.5, "2026-10-03", "alimentacao"],
    ["receita", "SALARIO EMPRESA LTDA", 5200, "2026-10-05", "outros"],
    ["despesa", "DROGARIA SAO PAULO", 89.9, "2026-10-07", "saude"]]);
  assert.match(await texto(p, "#cardLista"), /PADARIA SÃO JOSÉ/);

  // importar o mesmo arquivo de novo: tudo vem desmarcado como já importado
  await abrirExtrato(p, "banco.ofx");
  const de2 = await linhas(p);
  assert.ok(de2.every(x => !x.marcado && x.aviso === "já importado"));
  assert.ok(await p.$eval("#extImportar", e => e.disabled));
  await p.click("#extCancelar");
  assert.equal((await lerDados(p)).lancamentos.length, 3);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("OFX em XML", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "banco.xml.ofx");
  const l = await linhas(p);
  assert.deepEqual(l.map(x => [x.desc, x.cat]), [["Posto Shell", "transporte"], ["Spotify", "assinaturas"]]);
  await p.fechar();
});

test("fatura do cartão em CSV (Nubank): positivos são gastos", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "nubank-cartao.csv");
  assert.ok(await p.$eval("#extInverter", e => e.checked), "inverte sozinho quando quase tudo é positivo");
  const l = await linhas(p);
  assert.deepEqual(l.map(x => x.valor), ["− R$ 152,30", "− R$ 23,90", "+ R$ 500,00", "− R$ 55,90", "− R$ 1.200,00"]);
  assert.equal(l[4].desc, "Loja, Centro", "vírgula dentro de aspas");
  assert.deepEqual(l.map(x => x.cat), ["alimentacao", "transporte", null, "assinaturas", "outros"]);
  // desmarca o pagamento da fatura e muda a categoria da loja
  await p.click('[data-ext="2"]');
  await p.select('[data-ext-cat="4"]', "lazer");
  assert.equal(await texto(p, "#extImportar"), "Importar 4 lançamentos");
  await p.click("#extImportar");
  const d = await lerDados(p);
  assert.equal(d.lancamentos.length, 4);
  assert.ok(d.lancamentos.every(x => x.tipo === "despesa"));
  assert.equal(d.lancamentos.find(x => x.descricao === "Loja, Centro").categoria, "lazer");
  await p.fechar();
});

test("CSV de conta: Nubank, Inter (com título antes) e colunas de crédito e débito", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "nubank-conta.csv");
  assert.ok(!(await p.$eval("#extInverter", e => e.checked)));
  assert.deepEqual((await linhas(p)).map(x => [x.desc, x.valor, x.cat]), [
    ["Compra no débito - Drogasil", "− R$ 45,90", "saude"],
    ["Transferência recebida - Empresa X", "+ R$ 5.200,00", null],
    ["Pagamento de boleto - Aluguel", "− R$ 1.450,00", "moradia"]]);
  await p.click("#extCancelar");

  await abrirExtrato(p, "inter.csv");
  assert.deepEqual((await linhas(p)).map(x => [x.desc, x.valor]), [
    ["Fulano de Tal", "− R$ 1.250,00"], ["POSTO IPIRANGA", "− R$ 200,50"], ["Cliente", "+ R$ 1.000,00"]]);
  await p.click("#extCancelar");

  await abrirExtrato(p, "credito-debito.csv");
  assert.deepEqual((await linhas(p)).map(x => [x.desc, x.valor]), [["Salário", "+ R$ 5.000,00"], ["Supermercado", "− R$ 300,00"]], "linha de saldo ignorada");
  await p.fechar();
});

test("colunas não reconhecidas: a pessoa indica quais são", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "colunas-estranhas.csv");
  assert.ok(await p.$eval("#extColunas", e => !e.hidden));
  assert.equal((await linhas(p)).length, 0);
  assert.ok(await p.$eval("#extImportar", e => e.disabled));
  await p.select("#extColData", "0"); await p.select("#extColDesc", "1"); await p.select("#extColValor", "2");
  assert.deepEqual((await linhas(p)).map(x => [x.desc, x.valor]), [["Algo comprado", "− R$ 10,00"], ["Outra coisa", "− R$ 20,00"]]);
  await p.fechar();
});

test("lançamento manual com mesma data e valor vem desmarcado", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "m", tipo: "despesa", descricao: "Padaria", valor: 23.5, categoria: "alimentacao", data: "2026-10-03" }] } });
  await abrirExtrato(p, "banco.ofx");
  const l = await linhas(p);
  assert.match(l[0].aviso, /parece já lançado/);
  assert.equal(l[0].marcado, false);
  assert.ok(l[1].marcado && l[2].marcado);
  await p.fechar();
});

test("importar extrato cabe no celular", async () => {
  const p = await amb.abrir({ dados: VAZIO(), vp: { width: 360, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
  await abrirExtrato(p, "nubank-cartao.csv");
  const r = await p.evaluate(() => { const d = document.querySelector("#modalExtrato"); return [d.scrollWidth <= d.clientWidth, d.getBoundingClientRect().right <= innerWidth]; });
  assert.deepEqual(r, [true, true]);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/extrato-celular.png` });
  await p.fechar();
});
