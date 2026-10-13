import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const DADOS = {
  lancamentos: [
    { id: "a", tipo: "despesa", descricao: "Descrição bem comprida de um gasto qualquer no mercado do bairro", valor: 123456.78, categoria: "alimentacao", data: "2026-10-03" },
    { id: "r", tipo: "receita", descricao: "Freela", valor: 800, categoria: "outros", data: "2026-10-09" },
  ],
  fixos: [{ id: "f", tipo: "despesa", descricao: "Aluguel", valor: 1500, categoria: "moradia", dia: 10 }],
  parcelamentos: [{ id: "p", descricao: "TV", valorTotal: 3000, numParcelas: 10, categoria: "lazer", inicio: "2026-09" }],
  objetivos: [{ id: "o", nome: "Reserva de emergência", meta: 10000, aporteMensal: 500, aportes: [{ id: "x", valor: 1500, data: "2026-10-01" }] }],
};

for (const largura of [360, 390, 430]) {
  test(`celular com ${largura} px`, async () => {
    const p = await amb.abrir({ dados: DADOS, vp: { width: largura, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } });
    for (const a of ["painel", "lancamentos", "objetivos"]) {
      await aba(p, a);
      const sw = await p.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(sw <= largura, `aba ${a} com rolagem lateral (${sw} px)`);
    }
    await aba(p, "lancamentos");
    const fora = await p.evaluate(() => [...document.querySelectorAll("#cardLista td.num, #cardLista button")]
      .filter(e => { const b = e.getBoundingClientRect(); return b.right > innerWidth - 8 || b.left < 8; }).length);
    assert.equal(fora, 0, "valores e botões da lista dentro da tela");
    await p.click("#cardLista button.editar");
    assert.equal(await texto(p, "#lBtn"), "Salvar alterações", "o lápis funciona no toque");
    assert.deepEqual(p.erros, []);
    await p.fechar();
  });
}

test("no computador a lista continua em tabela", async () => {
  const p = await amb.abrir({ dados: DADOS });
  await aba(p, "lancamentos");
  assert.equal(await p.evaluate(() => getComputedStyle(document.querySelector("#cardLista tbody tr")).display), "table-row");
  await p.fechar();
});

test("tema claro e escuro continua depois de recarregar", async () => {
  const p = await amb.abrir({ dados: DADOS });
  const antes = await p.evaluate(() => document.documentElement.dataset.theme);
  await p.click("#btnTema");
  await p.reload();
  assert.notEqual(await p.evaluate(() => document.documentElement.dataset.theme), antes);
  await p.fechar();
});
