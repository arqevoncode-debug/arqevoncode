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
  // o pagamento da fatura já vem desmarcado (não é renda); muda a categoria da loja
  assert.equal(l[2].marcado, false);
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

test("fatura do cartão: parcela vira compra parcelada, pagamento da fatura fica de fora, categorias por loja", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "fatura-parcelas.csv");
  assert.ok(await p.$eval("#extInverter", e => e.checked), "fatura em CSV inverte os sinais");
  const l = await linhas(p);
  const por = d => l.find(x => x.desc === d);
  assert.equal(por("Pagamento recebido").marcado, false);
  assert.equal(por("Pagamento recebido").aviso, "pagamento da fatura, não é renda");
  assert.equal(por("Amazon - Parcela 2/10").aviso.replace(/\s/g, " "), "vira compra parcelada: 10x de R$ 129,90");
  assert.deepEqual(["Supermercado Pão de Açúcar", "Plano de Saúde Bradesco", "Conta de luz", "Mercado Livre - Parcela 1/6"].map(d => por(d).cat),
    ["alimentacao", "saude", "moradia", "outros"]);
  assert.equal(await texto(p, "#extImportar"), "Importar 5 lançamentos");
  await p.click("#extImportar");
  await p.waitForFunction(() => !document.querySelector("#modalExtrato").open);
  const d = await lerDados(p);
  assert.deepEqual(d.parcelamentos.map(x => [x.descricao, x.valorTotal, x.numParcelas, x.inicio, x.categoria]), [
    ["Amazon", 1299, 10, "2026-09", "outros"], ["Mercado Livre", 537, 6, "2026-10", "outros"]]);
  assert.deepEqual(d.lancamentos.map(x => x.descricao), ["Supermercado Pão de Açúcar", "Plano de Saúde Bradesco", "Conta de luz"]);
  assert.ok(!d.lancamentos.some(x => x.tipo === "receita"), "pagamento da fatura não virou renda");
  // a parcela aparece na lista de outubro como 2/10
  assert.match(await texto(p, "#cardLista"), /parcela 2\/10/i);

  // a fatura do mês seguinte traz a parcela 3/10 da mesma compra: não duplica
  await abrirExtrato(p, "fatura-parcelas.csv");
  const de2 = await linhas(p);
  assert.equal(de2.find(x => x.desc === "Amazon - Parcela 2/10").aviso, "compra parcelada já importada");
  await p.click("#extCancelar");
  const proxima = await p.evaluate(() => { const q = parcelaDoExtrato({ desc: "Amazon - Parcela 3/10", data: "2026-11-03", valor: 129.9 }); return [q.inicio, q.chave === dados.parcelamentos[0].imp]; });
  assert.deepEqual(proxima, ["2026-09", true]);
  // trocar para "não é fatura" volta a marcar o pagamento
  await abrirExtrato(p, "fatura-parcelas.csv");
  await p.click("#extInverter");
  assert.equal((await linhas(p)).find(x => x.desc === "Pagamento recebido").marcado, true);
  await p.click("#extCancelar");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
