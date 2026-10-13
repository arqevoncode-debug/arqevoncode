import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });

test("lança no mês escolhido no topo, com o dia opcional", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "lancamentos");
  assert.equal(await p.$eval("#lDia", e => e.placeholder), "13", "no mês atual o dia sugerido é hoje");
  await p.click("#mesProx");
  assert.equal(await texto(p, "#mesLabel"), "Novembro de 2026");
  assert.equal(await p.$eval("#lDia", e => e.placeholder), "1", "nos outros meses o dia sugerido é 1");

  await p.type("#lDesc", "Mercado"); await p.type("#lValor", "12345");
  assert.equal(await p.$eval("#lValor", e => e.value), "123,45", "máscara de valor");
  await p.click("#lBtn");
  await p.type("#lDesc", "Internet"); await p.type("#lValor", "9990"); await p.type("#lDia", "31"); await p.click("#lBtn");
  await p.type("#eDesc", "Freela"); await p.type("#eValor", "80000"); await p.type("#eDia", "7"); await p.click("#eBtn");
  await p.select("#lRep", "parcelado");
  assert.ok(await p.$eval("#campoDiaLanc", e => e.hidden), "parcelado esconde o dia");
  await p.type("#lDesc", "Celular"); await p.type("#lValor", "250000"); await limparEDigitar(p, "#lNum", "10"); await p.click("#lBtn");
  assert.equal(await p.$eval("#lRep", e => e.value), "unico", "depois de salvar volta para 'Só este mês'");
  await p.select("#lRep", "fixo");
  assert.equal(await texto(p, "#lDiaLabel"), "Vencimento (opcional)");
  await p.type("#lDesc", "Academia"); await p.type("#lValor", "9000"); await p.click("#lBtn");
  assert.equal(await texto(p, "#mesLabel"), "Novembro de 2026", "continua no mês escolhido");

  const d = await lerDados(p);
  assert.deepEqual(d.lancamentos.map(l => `${l.descricao}@${l.data}`), ["Mercado@2026-11-01", "Internet@2026-11-30", "Freela@2026-11-07"]);
  assert.equal(d.parcelamentos[0].inicio, "2026-11");
  assert.equal(d.fixos[0].dia, null);
  const lista = await texto(p, "#cardLista");
  for (const t of ["01/11", "30/11", "07/11", "parcela 1/10", "Academia"]) assert.ok(lista.toLowerCase().includes(t.toLowerCase()), `lista mostra ${t}`);
  await p.click("#mesHoje");
  assert.equal(await p.$eval("#lDia", e => e.placeholder), "13");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("editar mantém o mês original do registro", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    lancamentos: [{ id: "l", tipo: "despesa", descricao: "Pão", valor: 5, categoria: "alimentacao", data: "2026-11-20" }],
    parcelamentos: [{ id: "p", descricao: "TV", valorTotal: 1000, numParcelas: 10, categoria: "lazer", inicio: "2026-09" }] } });
  await aba(p, "lancamentos");
  await p.evaluate(() => { mesAtual = { ano: 2027, mes: 0 }; renderTudo(); editarItem("parc", "p"); });
  await limparEDigitar(p, "#lValor", "120000"); await p.click("#lBtn");
  await p.evaluate(() => { mesAtual = { ano: 2026, mes: 10 }; renderTudo(); editarItem("lanc", "l"); });
  assert.equal(await p.$eval("#lDia", e => e.value), "20", "o dia gravado vem preenchido");
  await limparEDigitar(p, "#lDia", "15"); await p.click("#lBtn");
  const d = await lerDados(p);
  assert.deepEqual(d.parcelamentos.map(x => [x.inicio, x.valorTotal]), [["2026-09", 1200]]);
  assert.deepEqual(d.lancamentos.map(x => x.data), ["2026-11-15"]);
  await p.fechar();
});

test("trocar de item em edição não duplica nada", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [
    { id: "l1", tipo: "despesa", descricao: "Mercado", valor: 300, categoria: "alimentacao", data: "2026-10-05" },
    { id: "l2", tipo: "receita", descricao: "Freela", valor: 900, categoria: "outros", data: "2026-10-08" }] } });
  await aba(p, "lancamentos");
  await p.evaluate(() => { editarItem("lanc", "l1"); editarItem("lanc", "l2"); });
  assert.equal(await p.$eval("#lDesc", e => e.value), "");
  assert.equal(await texto(p, "#lBtn"), "Adicionar despesa");
  assert.equal(await texto(p, "#eBtn"), "Salvar alterações");
  await p.click("#lBtn"); // formulário vazio: não grava
  await limparEDigitar(p, "#eValor", "100000"); await p.click("#eBtn");
  const d = await lerDados(p);
  assert.equal(d.lancamentos.length, 2);
  assert.equal(d.lancamentos.find(l => l.descricao === "Freela").valor, 1000);
  // começar a editar e cancelar não muda nada
  await p.evaluate(() => editarItem("lanc", "l1"));
  await limparEDigitar(p, "#lValor", "99900"); await p.click("#lCancelar");
  assert.equal((await lerDados(p)).lancamentos.find(l => l.id === "l1").valor, 300);
  await p.fechar();
});

test("validação dos campos", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "lancamentos");
  const tentar = async ({ desc = "Teste", valor = "10,00", dia = "", rep = "unico", num = "10" }) => {
    await p.select("#lRep", rep);
    await p.$eval("#lDesc", (e, v) => { e.value = v; }, desc);
    await p.$eval("#lValor", (e, v) => { e.value = v; }, valor);
    await p.$eval("#lDia", (e, v) => { e.value = v; }, dia);
    await p.$eval("#lNum", (e, v) => { e.value = v; }, num);
    await p.click("#lBtn"); await espera(50);
    const d = await lerDados(p);
    return (d?.lancamentos?.length || 0) + (d?.parcelamentos?.length || 0);
  };
  assert.equal(await tentar({ dia: "0" }), 0, "dia 0");
  assert.equal(await tentar({ dia: "32" }), 0, "dia 32");
  assert.equal(await tentar({ dia: "2.5" }), 0, "dia 2,5");
  assert.equal(await tentar({ valor: "" }), 0, "sem valor");
  assert.equal(await tentar({ desc: "   " }), 0, "descrição só com espaços");
  assert.equal(await tentar({ rep: "parcelado", num: "0" }), 0, "0 parcelas");
  assert.equal(await tentar({ rep: "parcelado", num: "61" }), 0, "61 parcelas");
  assert.equal(await tentar({ dia: "31" }), 1, "dia 31 é aceito");
  assert.equal(await tentar({ rep: "parcelado", num: "60" }), 2, "60 parcelas é aceito");
  await p.$eval("#eDesc", e => { e.value = "  "; }); await p.$eval("#eValor", e => { e.value = "5,00"; }); await p.click("#eBtn");
  assert.equal((await lerDados(p)).lancamentos.length, 1, "entrada só com espaços");
  await limparEDigitar(p, "#lValor", "9999999999999");
  assert.equal(await p.$eval("#lValor", e => e.value), "999.999.999,99", "valor máximo");
  await p.fechar();
});

test("excluir pede confirmação", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Mercado", valor: 10, categoria: "outros", data: "2026-10-03" }] } });
  await aba(p, "lancamentos");
  await p.click("#cardLista button.excluir"); await p.click("#confirmacaoCancelar");
  assert.equal((await lerDados(p)).lancamentos.length, 1, "Cancelar não exclui");
  await p.click("#cardLista button.excluir"); await p.keyboard.press("Escape"); await espera(50);
  assert.equal((await lerDados(p)).lancamentos.length, 1, "Esc não exclui");
  await p.click("#cardLista button.excluir"); await p.click("#confirmacaoAceitar"); await espera(50);
  assert.equal((await lerDados(p)).lancamentos.length, 0, "Confirmar exclui");
  await p.fechar();
});

test("texto do usuário nunca vira código", async () => {
  const isca = `<img src=x onerror="window.__xss=1">'"`;
  const p = await amb.abrir({ dados: { ...VAZIO(),
    lancamentos: [{ id: "x", tipo: "despesa", descricao: isca, valor: 10, categoria: "outros", data: "2026-10-02" }],
    parcelamentos: [{ id: "p", descricao: isca, valorTotal: 100, numParcelas: 2, categoria: "lazer", inicio: "2026-10" }],
    objetivos: [{ id: "o", nome: isca, meta: 10, aporteMensal: 0, aportes: [] }] } });
  for (const a of ["lancamentos", "objetivos", "painel"]) await aba(p, a);
  await p.evaluate(() => document.querySelectorAll("[data-tip]").forEach(e => e.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))));
  await espera(100);
  assert.equal(await p.evaluate(() => window.__xss), undefined);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
