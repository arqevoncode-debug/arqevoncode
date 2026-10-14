import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });
// hoje = 13/10/2026

async function definirLimites(p, limites) {
  await aba(p, "painel");
  await p.evaluate(() => abrirLimites());
  await p.waitForFunction(() => document.querySelector("#modalLimites").open);
  for (const [cat, v] of Object.entries(limites)) await limparEDigitar(p, `[data-limite="${cat}"]`, v);
  await p.click("#limSalvar");
  await espera(100);
}
async function lancar(p, desc, valor, cat) {
  await aba(p, "lancamentos");
  await p.type("#lDesc", desc); await p.type("#lValor", valor); await p.select("#lCat", cat); await p.click("#lBtn");
  await espera(100);
}

test("definir limites e receber aviso a 80% e ao passar do limite", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "x", tipo: "despesa", descricao: "Salário?", valor: 1, categoria: "outros", data: "2026-10-01" }] } });
  assert.match(await texto(p, "#aba-painel"), /Definir limites/);
  await definirLimites(p, { alimentacao: "50000", lazer: "10000" });
  const d = await lerDados(p);
  assert.deepEqual(d.orcamentos.map(o => [o.categoria, o.limite]), [["alimentacao", 500], ["lazer", 100]]);
  const painel = await texto(p, "#aba-painel");
  assert.match(painel, /Alimentação\s+R\$ 0,00 de R\$ 500,00/, "categoria com limite aparece mesmo sem gasto");
  assert.match(painel, /Editar limites/);

  await lancar(p, "Mercado", "30000", "alimentacao"); // 60%: sem aviso
  assert.ok(await p.$eval("#avisoMotor", e => e.hidden));
  await lancar(p, "Feira", "11000", "alimentacao"); // 82%
  assert.ok(await p.$eval("#avisoMotor", e => !e.hidden));
  assert.match(await texto(p, "#avisoMotor"), /Alimentação chegou a 82% do limite em outubro de 2026: R\$ 410,00 de R\$ 500,00/);
  await lancar(p, "Restaurante", "12000", "alimentacao"); // 106%
  assert.match(await texto(p, "#avisoMotor"), /Alimentação passou do limite de R\$ 500,00 em outubro de 2026: R\$ 530,00 gastos/);
  assert.ok(await p.$eval("#avisoMotor", e => e.classList.contains("estourou")));

  await aba(p, "painel");
  assert.match(await texto(p, ".alertas-orc"), /Alimentação: passou do limite em R\$ 30,00/);
  assert.ok(await p.evaluate(() => [...document.querySelectorAll(".barra-cat")].some(b => b.classList.contains("orc-estourou") && b.innerText.includes("Alimentação"))));
  // outro mês não herda o gasto
  await p.click("#mesProx");
  assert.equal(await p.$(".alertas-orc"), null);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("limite soma contas fixas e parcelas da categoria", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(),
    fixos: [{ id: "f", tipo: "despesa", descricao: "Academia", valor: 100, categoria: "lazer", dia: 5 }],
    parcelamentos: [{ id: "pp", descricao: "Videogame", valorTotal: 1000, numParcelas: 10, categoria: "lazer", inicio: "2026-09" }] } });
  await definirLimites(p, { lazer: "25000" });
  const s = await p.evaluate(() => situacaoOrcamento("2026-10"));
  assert.deepEqual(s.map(x => [x.cat.id, x.gasto, x.estado]), [["lazer", 200, "perto"]]);
  assert.match(await texto(p, ".alertas-orc"), /Lazer: 80% do limite usado \(R\$ 200,00 de R\$ 250,00\)/);
  await p.fechar();
});

test("apagar o valor remove o limite; exportar e importar levam os limites", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await definirLimites(p, { alimentacao: "50000", transporte: "30000" });
  await definirLimites(p, { alimentacao: "" });
  await p.$eval('[data-limite="alimentacao"]', () => {}).catch(() => {});
  assert.deepEqual((await lerDados(p)).orcamentos.map(o => o.categoria), ["transporte"]);
  assert.equal(await p.$('[data-limite="cartao"]'), null, "cartão de crédito não tem limite");

  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => { window.__exportado = t; }); return orig(blob); };
  });
  await p.click("#btnExportar");
  await p.waitForFunction(() => window.__exportado);
  assert.deepEqual(JSON.parse(await p.evaluate(() => window.__exportado)).orcamentos.map(o => o.limite), [300]);
  // backup antigo, sem limites, continua abrindo
  await p.evaluate(() => MyFinanceBridge.substituirDados({ lancamentos: [], fixos: [], parcelamentos: [], objetivos: [] }));
  assert.deepEqual((await lerDados(p)).orcamentos, []);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("o exemplo mostra limites perto e estourado, sem gravar", async () => {
  const p = await amb.abrir({ dados: null });
  await p.evaluate(() => verExemplo());
  const alertas = await texto(p, ".alertas-orc");
  assert.match(alertas, /Lazer: passou do limite/);
  assert.match(alertas, /Alimentação: 87% do limite usado/);
  assert.equal(await lerDados(p), null);
  await p.fechar();
});

test("janela de limites cabe no celular", async () => {
  const p = await amb.abrir({ dados: VAZIO(), vp: { width: 360, height: 760, isMobile: true, hasTouch: true } });
  await p.evaluate(() => abrirLimites());
  const r = await p.evaluate(() => { const d = document.querySelector("#modalLimites"); return [d.scrollWidth <= d.clientWidth, d.getBoundingClientRect().right <= innerWidth]; });
  assert.deepEqual(r, [true, true]);
  await p.fechar();
});
