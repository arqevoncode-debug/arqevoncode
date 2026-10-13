import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { preparar, VAZIO, espera, lerDados, ligarCripto, desbloquear } from "./ambiente.mjs";

const amb = preparar({ before, after });
const BASE = () => ({ ...VAZIO(), lancamentos: [
  { id: "l1", tipo: "despesa", descricao: "Mercado", valor: 300, categoria: "alimentacao", data: "2026-10-05" },
  { id: "l2", tipo: "receita", descricao: "Freela", valor: 900, categoria: "outros", data: "2026-10-08" }] });

test("ciclo da criptografia: ligar, senha errada, trocar e desligar", async () => {
  const p = await amb.abrir({ dados: BASE() });
  await p.click("#btnCripto"); await p.type("#sgNova", "123"); await p.type("#sgConf", "123");
  await p.$eval("#sgCripto", e => { e.checked = true; }); await p.click("#sgSalvar"); await espera(100);
  assert.match(await p.$eval("#sgErro", e => e.hidden ? "" : e.textContent), /6/, "senha curta é recusada");
  await p.evaluate(() => document.querySelector("#modalSeg").close());

  await ligarCripto(p, "senha-um");
  assert.equal((await lerDados(p)).enc, true);
  await p.reload(); await espera(200);
  await p.type("#tbSenha", "errada!!"); await p.click("#tbEntrar");
  await p.waitForFunction(() => !document.querySelector("#tbErro").hidden, { timeout: 15000 });
  await p.$eval("#tbSenha", e => { e.value = ""; });
  await desbloquear(p, "senha-um");
  assert.equal(await p.evaluate(() => dados.lancamentos.length), 2);

  await p.click("#btnCripto"); await p.type("#sgAtual", "senha-um");
  await p.type("#sgNova", "senha-dois"); await p.type("#sgConf", "senha-dois"); await p.click("#sgSalvar");
  await p.waitForFunction(() => !document.querySelector("#modalSeg").open, { timeout: 15000 });
  await espera(300);
  await p.reload(); await espera(200);
  await desbloquear(p, "senha-dois");

  await p.click("#btnCripto"); await p.type("#sgAtual", "senha-dois");
  await p.$eval("#sgCripto", e => { e.checked = false; }); await p.click("#sgSalvar");
  await p.waitForFunction(() => !document.querySelector("#modalSeg").open, { timeout: 15000 });
  const d = await lerDados(p);
  assert.equal(d.lancamentos.length, 2, "desligar volta para texto puro sem perder nada");
  await p.reload(); await espera(200);
  assert.ok(await p.$eval("#telaBloqueio", e => e.hidden), "sem criptografia não pede senha");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("a tela de bloqueio não deixa mexer no que está atrás", async () => {
  const p = await amb.abrir({ dados: BASE() });
  await ligarCripto(p);
  await p.reload(); await espera(200);
  assert.ok(await p.$eval("#telaBloqueio", e => !e.hidden));
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press("Tab");
    const fora = await p.evaluate(() => !!document.activeElement?.closest(".app"));
    assert.ok(!fora, `Tab chegou em #${await p.evaluate(() => document.activeElement.id)}`);
  }
  // nem uma chamada direta grava texto puro por cima do cofre
  await p.evaluate(() => salvar());
  assert.equal((await lerDados(p)).enc, true);
  await desbloquear(p);
  assert.equal(await p.evaluate(() => dados.lancamentos.length), 2);
  assert.ok(await p.$eval(".app", e => !e.inert), "depois de desbloquear a página responde");
  await p.fechar();
});

test("cópias de recuperação seguem a criptografia", async () => {
  const p = await amb.abrir({ dados: BASE() });
  await ligarCripto(p);
  // cópia em texto puro deixada por versão antiga
  await p.evaluate(d => localStorage.setItem("meu-financeiro-v1-pre-reset", JSON.stringify(d)), BASE());
  await p.reload(); await espera(200);
  await desbloquear(p);
  await p.waitForFunction(() => !localStorage.getItem("meu-financeiro-v1-pre-reset").includes("Mercado"));

  const dir = mkdtempSync(join(tmpdir(), "arqevon-"));
  writeFileSync(join(dir, "novo.json"), JSON.stringify({ ...VAZIO(), lancamentos: [{ id: "z", tipo: "receita", descricao: "Bônus", valor: 50, categoria: "outros", data: "2026-10-04" }] }));
  p.respostas.push(true);
  await (await p.$("#arqImportar")).uploadFile(join(dir, "novo.json"));
  await p.waitForFunction(() => dados.lancamentos[0]?.descricao === "Bônus");
  await espera(800);
  const copia = await p.evaluate(() => localStorage.getItem("meu-financeiro-v1-pre-import"));
  assert.ok(copia && !copia.includes("Mercado"), "a cópia antes de importar está cifrada");
  assert.equal((await lerDados(p)).enc, true, "os dados importados estão cifrados");

  await p.click("#btnResetar"); await p.type("#resetConfirmacao", "APAGAR"); await p.click("#resetAceitar");
  await espera(800);
  const pre = await p.evaluate(() => localStorage.getItem("meu-financeiro-v1-pre-reset"));
  assert.ok(pre && !pre.includes("Bônus"), "a cópia antes do reset está cifrada");
  await p.fechar();
});

test("bloqueio por inatividade", async () => {
  const p = await amb.abrir({ dados: VAZIO(), aceleraIdle: 30 }); // 1 min vira 2 s
  await p.click("#btnBloqueio"); await p.type("#sgNova", "senha-xyz"); await p.type("#sgConf", "senha-xyz");
  await p.$eval("#sgCripto", e => { e.checked = false; }); await p.$eval("#sgBloqueio", e => { e.checked = true; });
  await p.select("#sgMinutos", "1"); await p.click("#sgSalvar");
  await p.waitForFunction(() => !document.querySelector("#modalSeg").open, { timeout: 15000 });
  assert.equal(await p.$eval("#bloqueioEstado", e => e.textContent), "1 min");
  await p.waitForFunction(() => !document.querySelector("#telaBloqueio").hidden, { timeout: 10000 });
  await desbloquear(p, "senha-xyz");
  await p.fechar();
});
