import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparar, VAZIO, espera, lerDados, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const dir = mkdtempSync(join(tmpdir(), "arqevon-"));
const arquivo = (nome, conteudo) => { const c = join(dir, nome); writeFileSync(c, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo)); return c; };
const DADOS = () => ({ ...VAZIO(),
  lancamentos: [{ id: "a", tipo: "despesa", descricao: "Mercado", valor: 10, categoria: "outros", data: "2026-10-03" }],
  objetivos: [{ id: "o", nome: "Reserva", meta: 0, aporteMensal: 0, aportes: [] }] });

test("exportar, importar, recusar arquivo inválido e resetar", async () => {
  const p = await amb.abrir({ dados: DADOS() });
  await p.evaluate(() => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => { window.__exportado = t; }); return orig(blob); };
  });
  await p.click("#btnExportar");
  await p.waitForFunction(() => window.__exportado);
  const exp = JSON.parse(await p.evaluate(() => window.__exportado));
  assert.equal(exp.lancamentos.length, 1);
  assert.equal(exp.objetivos.length, 1);

  const inp = await p.$("#arqImportar");
  p.respostas.push(false); // recusar a substituição não muda nada
  await inp.uploadFile(arquivo("a.json", { ...exp, lancamentos: [] }));
  await espera(300);
  assert.equal((await lerDados(p)).lancamentos.length, 1);

  p.respostas.push(true);
  await inp.uploadFile(arquivo("b.json", { ...exp, lancamentos: [...exp.lancamentos, { id: "z", tipo: "receita", descricao: "Bônus", valor: 50, categoria: "outros", data: "2026-10-04" }] }));
  await p.waitForFunction(() => dados.lancamentos.length === 2);

  await inp.uploadFile(arquivo("ruim.json", "isto não é json"));
  await espera(300);
  assert.ok(p.vistos.some(v => v.includes("Arquivo inválido")));
  assert.equal((await lerDados(p)).lancamentos.length, 2, "arquivo inválido não estraga nada");

  await p.click("#btnResetar"); await p.type("#resetConfirmacao", "apagar"); await p.click("#resetAceitar");
  assert.ok(await p.$eval("#resetErro", e => !e.hidden), "exige APAGAR em maiúsculas");
  assert.equal((await lerDados(p)).lancamentos.length, 2);
  await p.$eval("#resetConfirmacao", e => { e.value = ""; }); await p.type("#resetConfirmacao", "APAGAR"); await p.keyboard.press("Enter");
  await espera(100);
  const z = await lerDados(p);
  assert.equal(z.lancamentos.length + z.objetivos.length, 0);
  assert.match(await texto(p, "#aba-painel"), /Bem-vindo/);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("importar backup cifrado pede a senha dele", async () => {
  // gera um backup cifrado no próprio app, com outra senha
  const p = await amb.abrir({ dados: DADOS() });
  const blob = await p.evaluate(async () => {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const chave = await derivarChave("senha-do-arquivo", salt);
    const c = await cifrar(chave, JSON.stringify({ lancamentos: [{ id: "c", tipo: "despesa", descricao: "Cifrado", valor: 7, categoria: "lazer", data: "2026-10-09" }], fixos: [], parcelamentos: [], objetivos: [] }));
    return JSON.stringify({ enc: true, salt, iv: c.iv, ct: c.ct });
  });
  const inp = await p.$("#arqImportar");
  p.respostas.push("senha-errada");
  await inp.uploadFile(arquivo("c1.json", blob)); await espera(1500);
  assert.ok(p.vistos.some(v => v.includes("Senha incorreta")));
  assert.equal((await lerDados(p)).lancamentos[0].descricao, "Mercado");
  p.respostas.push("senha-do-arquivo", true);
  await inp.uploadFile(arquivo("c2.json", blob));
  await p.waitForFunction(() => dados.lancamentos[0]?.descricao === "Cifrado", { timeout: 15000 });
  await p.fechar();
});

test("dados incompletos não travam o app", async () => {
  const quebrados = {
    lancamentos: [{ id: "a", descricao: "Sem data", valor: 1 }, { id: "b", tipo: "despesa", descricao: "Ok", valor: 2, categoria: "outros", data: "2026-10-01" }, null],
    fixos: [{ id: "f", tipo: "despesa", descricao: "Sem valor" }],
    parcelamentos: [{ id: "p", descricao: "Sem início", valorTotal: 10, numParcelas: 2 }],
    objetivos: [{ id: "o", nome: "Sem aportes", meta: 10 }],
  };
  // já gravados no navegador
  const p = await amb.abrir({ dados: quebrados });
  for (const a of ["lancamentos", "objetivos", "painel"]) await aba(p, a);
  assert.deepEqual(p.erros, []);
  assert.deepEqual(await p.evaluate(() => [dados.lancamentos.length, dados.fixos.length, dados.parcelamentos.length, dados.objetivos.length]), [1, 0, 0, 1]);
  // vindos de um arquivo
  p.respostas.push(true);
  await (await p.$("#arqImportar")).uploadFile(arquivo("q.json", quebrados));
  await espera(300);
  await p.reload(); await espera(200);
  for (const a of ["lancamentos", "objetivos", "painel"]) await aba(p, a);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
