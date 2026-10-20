// Achados da varredura pela interface (2026-10-16): gráficos legíveis, títulos de edição, textos que
// não prometem o que não existe e alvos de toque no celular.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { banco, servir, navegador, abrirApp, abrirConta, espera, VAZIO } from "./supabase-falso.mjs";

let srv, browser;
before(async () => { srv = await servir(); browser = await navegador(); });
after(async () => { await browser?.close(); await srv?.fechar(); });
const CEL = { width: 360, height: 800, isMobile: true, hasTouch: true };
const DADOS = () => ({ ...VAZIO(),
  lancamentos: [{ id: "l1", tipo: "despesa", descricao: "Mercado", valor: 412.35, categoria: "alimentacao", data: "2026-10-03" }],
  fixos: [{ id: "s", tipo: "receita", descricao: "Salário", valor: 16500, categoria: "outros", dia: 5, inicio: "2026-01" },
    { id: "a", tipo: "despesa", descricao: "Aluguel", valor: 11800, categoria: "moradia", dia: 10, inicio: "2026-01" }],
  parcelamentos: [{ id: "p", descricao: "Celular", valorTotal: 3600, numParcelas: 12, categoria: "outros", inicio: "2026-08" }] });
async function contaPro(vp) {
  const db = banco(); db.conta("uid-a", "ana@teste.com", { cloud: true });
  const p = await abrirApp(browser, srv.url, db, { uid: "uid-a", dados: DADOS(), vp });
  await p.evaluate(() => ativarAba("painel")); await espera(300);
  return p;
}
// rótulos de texto de um gráfico que se sobrepõem na horizontal (mesma linha)
const sobrepostos = (p, sel) => p.evaluate(s => {
  const ts = [...document.querySelectorAll(`${s} svg text`)].filter(t => t.textContent.trim()).map(t => t.getBoundingClientRect());
  let n = 0;
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    if (Math.abs(a.top - b.top) < 4 && a.left < b.right - 1 && b.left < a.right - 1) n++;
  }
  return { n, menor: Math.min(...ts.map(r => r.height)) };
}, sel);

test("gráficos: rótulos sem sobreposição e legíveis, no computador e no celular", async () => {
  for (const vp of [{ width: 1440, height: 900 }, CEL]) {
    const p = await contaPro(vp);
    const cards = await p.$$eval("#aba-painel .card.viz", cs => cs.map((c, i) => (c.id ||= `viz${i}`)));
    for (const id of cards) {
      const r = await sobrepostos(p, `#${id}`);
      assert.equal(r.n, 0, `${vp.width}px: rótulos sobrepostos em ${id}`);
      if (r.menor !== Infinity) assert.ok(r.menor >= 9, `${vp.width}px: texto de ${r.menor.toFixed(1)}px em ${id}`);
    }
    // a tabela da projeção cabe na tela
    assert.ok(await p.$eval(".tabela-projecao", e => e.querySelector("table").scrollWidth <= e.clientWidth + 1), `${vp.width}px: tabela da projeção cortada`);
    assert.deepEqual(p.erros, []);
    await p.fechar();
  }
});

test("editar mostra 'Editar despesa/entrada' e cancelar volta para 'Nova'", async () => {
  const p = await contaPro({ width: 1300, height: 900 });
  await p.evaluate(() => editarItem("lanc", "l1"));
  assert.equal(await p.$eval("#lTitulo", e => e.textContent), "Editar despesa");
  await p.click("#lCancelar");
  assert.equal(await p.$eval("#lTitulo", e => e.textContent), "Nova despesa");
  await p.evaluate(() => editarItem("fixo", "s"));
  assert.equal(await p.$eval("#eTitulo", e => e.textContent), "Editar entrada");
  await p.click("#eCancelar");
  assert.equal(await p.$eval("#eTitulo", e => e.textContent), "Nova entrada");
  await p.fechar();
});

test("textos: entrar sem promessa de senha; Sua conta sem nuvem, com preço e Fechar como principal", async () => {
  const db = banco();
  const l = await abrirApp(browser, srv.url, db, { dados: null, vp: { width: 1300, height: 900 } });
  assert.doesNotMatch(await l.$eval("#webLogin", e => e.innerText), /protegidos por senha|nuvem|convite/i);
  await l.evaluate(() => [...document.querySelectorAll("button")].find(b => /sem conta/i.test(b.textContent)).click());
  await espera(800);
  await abrirConta(l);
  const conta = await l.$eval("#webConta", e => e.innerText);
  assert.doesNotMatch(conta, /nuvem|criptograf|—/i);
  assert.match(conta, /R\$\s14,90\/mês/);
  const botoes = await l.$$eval("#webConta .botao", bs => bs.filter(b => b.offsetParent).map(b => [b.id, b.classList.contains("cancelar")]));
  assert.deepEqual(botoes.slice(-2), [["wcSair", true], ["wcFechar", false]], "Sair discreto, Fechar principal");
  await l.fechar();
});

test("celular: editar, excluir e troca de mês com alvo de toque de pelo menos 40 px", async () => {
  const p = await contaPro(CEL);
  await p.evaluate(() => ativarAba("lancamentos")); await espera(200);
  const pequenos = await p.evaluate(() => [...document.querySelectorAll("#cardLista button, .mes-nav button")].filter(b => b.offsetParent)
    .map(b => b.getBoundingClientRect()).filter(r => r.width < 40 || r.height < 40).length);
  assert.equal(pequenos, 0);
  await p.fechar();
});

test("alinhamento: ícones de editar/excluir numa coluna só no celular, ícone centralizado no botão", async () => {
  const p = await contaPro(CEL);
  await p.evaluate(() => ativarAba("lancamentos")); await espera(200);
  const r = await p.evaluate(() => {
    const bs = [...document.querySelectorAll("#cardLista button.editar, #cardLista button.excluir")].filter(b => b.offsetParent);
    const xs = cls => new Set(bs.filter(b => b.classList.contains(cls)).map(b => Math.round(b.getBoundingClientRect().left)));
    const desc = bs.map(b => { const a = b.getBoundingClientRect(), s = b.querySelector("svg").getBoundingClientRect();
      return Math.max(Math.abs(a.left + a.width / 2 - s.left - s.width / 2), Math.abs(a.top + a.height / 2 - s.top - s.height / 2)); });
    return { editar: xs("editar").size, excluir: xs("excluir").size, desc: Math.max(...desc), texto: bs.some(b => b.textContent.trim()) };
  });
  assert.deepEqual([r.editar, r.excluir], [1, 1], "uma coluna para cada ícone, qualquer que seja o valor");
  assert.ok(r.desc <= 1, `ícone fora do centro (${r.desc}px)`);
  assert.equal(r.texto, false, "ícones desenhados, não caracteres");
  await p.fechar();
});

test("alinhamento no computador: valores dos cartões na mesma linha, campos da mesma altura, espaço entre cartões do relatório", async () => {
  const p = await contaPro({ width: 1440, height: 900 });
  const topos = await p.$$eval("#aba-painel .tile .valor", vs => vs.map(v => Math.round(v.getBoundingClientRect().top)));
  assert.equal(new Set(topos).size, 1, `valores desalinhados: ${topos}`);
  await p.evaluate(() => ativarAba("lancamentos")); await espera(200);
  const alturas = await p.$$eval("#formLanc .campo input, #formLanc .campo select", es => es.filter(e => e.offsetParent).map(e => e.getBoundingClientRect().height));
  assert.equal(new Set(alturas).size, 1, `alturas diferentes: ${alturas}`);
  await p.evaluate(() => ativarAba("relatorios")); await espera(300);
  const vaos = await p.evaluate(() => {
    const cs = [...document.querySelectorAll("#aba-relatorios > .card, #relConteudo > *")].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
    return cs.slice(1).map((r, i) => Math.round(r.top - cs[i].bottom));
  });
  assert.ok(vaos.length >= 3 && vaos.every(v => v >= 12), `cartões grudados: ${vaos}`);
  await p.fechar();
});
