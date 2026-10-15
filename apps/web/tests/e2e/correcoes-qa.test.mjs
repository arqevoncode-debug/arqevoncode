// Bugs encontrados pelo teste exploratório de 2026-10-14, com os passos que os reproduziam.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });
const real = () => ({ ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Meu gasto real", valor: 10, categoria: "outros", data: "2026-10-02" }] });
const descricoes = p => p.evaluate(() => dados.lancamentos.map(l => l.descricao));

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
  await p.evaluate(() => [...document.querySelectorAll(".hist-linha")].find(l => l.innerText.includes("10,00")).querySelector("button.excluir").click());
  await p.waitForFunction(() => document.querySelector("#modalConfirmacao").open);
  await p.click("#confirmacaoAceitar");
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

// ---------- Lote 2: bugs médios e leves ----------
const extrato = nome => resolve(import.meta.dirname, "extratos", nome);
async function abrirExtrato(p, nome) {
  await p.evaluate(() => ativarAba("lancamentos"));
  await (await p.$("#arqExtrato")).uploadFile(extrato(nome));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open, { timeout: 5000 });
  await espera(100);
}
const itensExtrato = p => p.$$eval("#extLista .ext-item", els => els.map(e => ({
  desc: e.querySelector(".ext-desc").childNodes[0].textContent.trim(),
  valor: e.querySelector(".ext-valor").textContent.replace(/ /g, " ").trim(),
  data: e.querySelector(".ext-data").textContent.trim(),
  marcado: e.querySelector("input").checked,
})));

test("extratos de mais bancos: crédito/débito com (R$), D/C, resumo antes do cabeçalho, data americana", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "bradesco-credito-debito.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => [x.desc, x.valor]), [
    ["PIX RECEBIDO JOAO", "+ R$ 250,00"], ["PADARIA PÃO QUENTE", "− R$ 35,90"], ["CONTA DE LUZ", "− R$ 180,00"]], "Bradesco: saldo anterior ignorado");
  await p.click("#extCancelar");
  await abrirExtrato(p, "caixa-dc.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => [x.desc, x.valor]), [
    ["SAQUE ATM", "− R$ 100,00"], ["CRED SALARIO", "+ R$ 3.000,00"], ["COMPRA MERCADO", "− R$ 250,00"], ["PAG BOLETO", "− R$ 89,90"]], "Caixa: D/C decide o sinal");
  assert.ok(!(await p.$eval("#extInverter", e => e.checked)));
  await p.click("#extCancelar");
  await abrirExtrato(p, "mercadopago.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => [x.desc, x.valor]), [
    ["Pagamento com QR Pix PADARIA", "− R$ 20,00"], ["Transferência recebida", "+ R$ 500,00"], ["Pagamento Uber", "− R$ 180,00"]], "Mercado Pago: resumo antes do cabeçalho");
  await p.click("#extCancelar");
  await abrirExtrato(p, "data-americana.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => [x.desc, x.data]), [["Coffee", "13/10"], ["Lunch", "02/10"]], "10/02 no arquivo americano é 2 de outubro");
  await p.fechar();
});

test("valores com menos tipográfico, sufixo D/C e OFX com milhar não somem", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "menos-unicode.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => x.valor), ["− R$ 50,00", "+ R$ 1.000,00", "− R$ 30,00"]);
  await p.click("#extCancelar");
  await abrirExtrato(p, "sufixo-dc.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => x.valor), ["− R$ 50,00", "+ R$ 1.000,00", "− R$ 30,00"]);
  await p.click("#extCancelar");
  await abrirExtrato(p, "ofx-virgula-milhar.ofx");
  assert.deepEqual((await itensExtrato(p)).map(x => x.valor), ["− R$ 1.234,56", "− R$ 50,00"]);
  await p.fechar();
});

test("compras iguais no mesmo arquivo entram todas, e reimportar reconhece cada uma", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await abrirExtrato(p, "repetidos-mesmo-dia.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => x.marcado), [true, true, true]);
  await p.click("#extImportar");
  await p.waitForFunction(() => !document.querySelector("#modalExtrato").open);
  assert.equal((await lerDados(p)).lancamentos.length, 3);
  await abrirExtrato(p, "repetidos-mesmo-dia.csv");
  assert.deepEqual((await itensExtrato(p)).map(x => x.marcado), [false, false, false]);
  assert.match(await texto(p, "#extResumo"), /3 parecem já estar no app e ficaram desmarcados/);
  await p.fechar();
});

test("linhas ilegíveis e arquivos grandes são informados", async () => {
  const dir = mkdtempSync(join(tmpdir(), "arqevon-"));
  const linhas = ["Data;Descrição;Valor", "02/10/2026;Ok;-10,00", "sem data;Ruim;-5,00", "03/10/2026;Sem valor;abc"];
  writeFileSync(join(dir, "ilegiveis.csv"), linhas.join("\n"));
  const grande = ["Data;Descrição;Valor", ...Array.from({ length: 5003 }, (_, i) => `${String(i % 28 + 1).padStart(2, "0")}/09/2026;Compra ${i};-1,00`)];
  writeFileSync(join(dir, "grande.csv"), grande.join("\n"));
  const p = await amb.abrir({ dados: VAZIO() });
  await p.evaluate(() => ativarAba("lancamentos"));
  await (await p.$("#arqExtrato")).uploadFile(join(dir, "ilegiveis.csv"));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open);
  assert.match(await texto(p, "#extResumo"), /2 linhas não foram lidas/);
  await p.click("#extCancelar");
  await (await p.$("#arqExtrato")).uploadFile(join(dir, "grande.csv"));
  await p.waitForFunction(() => document.querySelector("#modalExtrato").open);
  assert.match(await texto(p, "#extResumo"), /limite de 5\.000 lançamentos: 3 ficaram de fora/);
  await p.click("#extCancelar");
  // arquivo só com cabeçalho: mensagem e seletores de coluna visíveis
  await abrirExtrato(p, "so-cabecalho.csv");
  assert.match(await texto(p, "#extResumo"), /Nenhum lançamento lido/);
  assert.ok(await p.$eval("#extColunas", e => !e.hidden));
  await p.fechar();
});

test("excluir o item em edição cancela a edição", async () => {
  const p = await amb.abrir({ dados: real() });
  await aba(p, "lancamentos");
  await p.evaluate(() => editarItem("lanc", "a"));
  await p.evaluate(() => excluirLanc("a"));
  assert.equal(await texto(p, "#lBtn"), "Adicionar despesa");
  assert.equal(await p.$eval("#lDesc", e => e.value), "");
  assert.equal((await lerDados(p)).lancamentos.length, 0);
  await p.fechar();
});

test("dados antigos: parcelamento sem descrição e categoria que não existe mais", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    parcelamentos: [{ id: "p", valorTotal: 100, numParcelas: 2, categoria: "lazer", inicio: "2026-10" }],
    lancamentos: [{ id: "x", tipo: "despesa", descricao: "Ração", valor: 80, categoria: "pets", data: "2026-10-02" }] } });
  for (const a of ["lancamentos", "objetivos", "relatorios", "painel"]) await aba(p, a);
  assert.deepEqual(p.erros, []);
  assert.match(await texto(p, "#cardLista"), /Compra parcelada/);
  const cat = await p.evaluate(() => { editarItem("lanc", "x"); return document.querySelector("#lCat").value; });
  assert.equal(cat, "outros", "a edição mostra a categoria em Outros, não em branco");
  assert.equal(await p.evaluate(() => gastosPorCategoria("2026-10").find(c => c.cat.id === "outros")?.valor), 80);
  await p.fechar();
});

test("parcelas com centavos somam o total; conta fixa de cartão entra na projeção", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    parcelamentos: [{ id: "p", descricao: "Fone", valorTotal: 100, numParcelas: 3, categoria: "outros", inicio: "2026-10" }],
    fixos: [{ id: "c", tipo: "despesa", descricao: "Fatura média", valor: 2000, categoria: "cartao", dia: 10, inicio: "2026-10" }] } });
  const parcelas = await p.evaluate(() => ["2026-10", "2026-11", "2026-12"].map(mk => parcelasDoMes(mk).map(({ p, indice }) => valorParcela(p, indice))[0]));
  assert.deepEqual(parcelas, [33.34, 33.33, 33.33]);
  assert.equal(await p.evaluate(() => projecao(1).meses[0].fixas), 2000, "fatura fixa conta em novembro");
  await p.fechar();
});

test("rodar a configuração guiada de novo atualiza em vez de duplicar", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), fixos: [{ id: "s", tipo: "receita", descricao: "Salário", valor: 5000, categoria: "outros", dia: 5, inicio: "2026-01" }] } });
  await p.evaluate(() => abrirGuia());
  await p.type("#gRenda", "550000"); await p.click("#guiaAvancar");
  await p.type('[data-fixo="4"]', "10000"); await p.click("#guiaAvancar"); await p.click("#guiaAvancar");
  const d = await lerDados(p);
  assert.deepEqual(d.fixos.map(f => [f.descricao, f.valor, f.inicio, f.fim ?? null]),
    [["Salário", 5000, "2026-01", "2026-09"], ["Salário", 5500, "2026-10", null], ["Internet", 100, "2026-10", null]],
    "o salário novo vale a partir deste mês; o histórico continua");
  assert.equal(await p.evaluate(() => resumoDoMes("2026-10").receitas), 5500, "sem duplicar em outubro");
  assert.equal(await p.evaluate(() => resumoDoMes("2026-03").receitas), 5000, "março continua com 5.000");
  // rodar de novo com os mesmos valores não muda nada
  await p.evaluate(() => abrirGuia());
  await p.type("#gRenda", "550000"); await p.click("#guiaAvancar"); await p.click("#guiaAvancar"); await p.click("#guiaAvancar");
  assert.equal((await lerDados(p)).fixos.length, 3);
  await p.fechar();
});

test("Enter salva os limites", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await p.evaluate(() => abrirLimites());
  await p.type('[data-limite="lazer"]', "20000");
  await p.keyboard.press("Enter");
  await espera(100);
  assert.ok(!(await p.$eval("#modalLimites", e => e.open)));
  assert.deepEqual((await lerDados(p)).orcamentos.map(o => [o.categoria, o.limite]), [["lazer", 200]]);
  await p.fechar();
});

test("armazenamento cheio avisa que não salvou", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "lancamentos");
  await p.evaluate(() => { const orig = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === "meu-financeiro-v1") throw new DOMException("cheio", "QuotaExceededError"); return orig.call(this, k, v); }; });
  await p.type("#lDesc", "Mercado"); await p.type("#lValor", "1000"); await p.click("#lBtn");
  await espera(100);
  assert.match(await texto(p, "#avisoMotor"), /Não foi possível salvar/);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("aviso do motor fica acima da barra de abas no celular", async () => {
  const p = await amb.abrir({ dados: VAZIO(), vp: { width: 360, height: 760, isMobile: true, hasTouch: true } });
  await p.evaluate(() => avisarMotor("teste"));
  const [aviso, abas] = await p.evaluate(() => [document.querySelector("#avisoMotor").getBoundingClientRect().bottom, document.querySelector("#abas").getBoundingClientRect().top]);
  assert.ok(aviso <= abas, `aviso ${aviso} × barra ${abas}`);
  await p.fechar();
});

test("sincronização: não sobrescreve a cópia de recuperação, espera a edição e o exemplo", async () => {
  const p = await amb.abrir({ dados: real() });
  await p.evaluate(() => localStorage.setItem("meu-financeiro-v1-pre-import", "COPIA-DE-UMA-IMPORTACAO"));
  await p.evaluate(() => MyFinanceBridge.substituirDados({ ...JSON.parse(localStorage.getItem("meu-financeiro-v1")), lancamentos: [] }, { sync: true }));
  assert.equal(await p.evaluate(() => localStorage.getItem("meu-financeiro-v1-pre-import")), "COPIA-DE-UMA-IMPORTACAO");
  await p.evaluate(() => { dados.lancamentos.push({ id: "b", tipo: "despesa", descricao: "B", valor: 1, categoria: "outros", data: "2026-10-01" }); renderTudo(); editarItem("lanc", "b"); });
  assert.equal(await p.evaluate(() => MyFinanceBridge.editando()), true);
  await p.evaluate(() => verExemplo());
  assert.equal(await p.evaluate(() => MyFinanceBridge.emExemplo()), true);
  await p.fechar();
});

test("armazenamento bloqueado: 'Usar sem conta' explica o problema", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await p.evaluate(() => { localStorage.removeItem("arqevon-web-local"); });
  await p.reload(); await p.waitForFunction(() => !document.querySelector("#webLogin").hidden);
  await p.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("bloqueado", "SecurityError"); }; });
  await p.click("#wlLocal");
  assert.match(await texto(p, "#wlErro1"), /bloqueando o armazenamento/);
  await p.fechar();
});
