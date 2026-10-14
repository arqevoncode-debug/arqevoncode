import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, HOJE, espera, lerDados, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const DIA = 86400000;
const agora = new Date(HOJE).getTime();
const muitos = n => ({ ...VAZIO(), lancamentos: Array.from({ length: n }, (_, i) =>
  ({ id: "l" + i, tipo: "despesa", descricao: "Gasto " + i, valor: 10, categoria: "outros", data: "2026-10-01" })) });

test("manifesto e ícones do app instalável", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  const r = await p.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]').href;
    const m = await (await fetch(link)).json();
    const icones = await Promise.all(m.icons.map(async i => [i.sizes, (await fetch(i.src)).status, i.purpose || "any"]));
    const apple = (await fetch(document.querySelector('link[rel="apple-touch-icon"]').href)).status;
    return { nome: m.name, display: m.display, start: m.start_url, icones, apple };
  });
  assert.equal(r.nome, "Arqevon Finance");
  assert.equal(r.display, "standalone");
  assert.equal(r.start, "/");
  assert.deepEqual(r.icones, [["192x192", 200, "any"], ["512x512", 200, "any"], ["512x512", 200, "maskable"]]);
  assert.equal(r.apple, 200);
  await p.fechar();
});

test("service worker abre o app sem internet e não guarda dados", async () => {
  const p = await amb.abrir({ dados: muitos(2), sw: true });
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); // a página passa a ser controlada pelo service worker
  await p.waitForFunction(() => navigator.serviceWorker.controller);
  const guardado = await p.evaluate(async () => (await caches.keys()).length && (await (await caches.open("arqevon-finance-v1")).keys()).map(r => new URL(r.url).pathname));
  assert.ok(!guardado.some(c => /supabase|rest|rpc/.test(c)), `só arquivos do app no cache: ${guardado}`);
  await p.setOfflineMode(true);
  await p.reload();
  await p.waitForSelector("#formLanc", { timeout: 10000 });
  assert.equal((await lerDados(p)).lancamentos.length, 2, "os dados continuam no aparelho");
  await p.setOfflineMode(false);
  await p.fechar();
});

test("aviso de dados só no navegador depois de uma semana", async () => {
  const p = await amb.abrir({ dados: muitos(12), extra: { "arqevon-primeiro-uso": String(agora - 8 * DIA) } });
  await p.waitForFunction(() => !document.querySelector("#webAviso").hidden, { timeout: 5000 });
  assert.match(await texto(p, "#webAvisoTexto"), /só neste navegador.*Crie uma conta/);
  assert.equal(await texto(p, "#webAvisoAcao"), "Criar conta");
  await p.click("#webAvisoAcao");
  assert.ok(await p.$eval("#webLogin", e => !e.hidden), "vai para a tela de login");
  assert.equal((await lerDados(p)).lancamentos.length, 12, "os lançamentos continuam aqui");
  // voltar a usar sem conta: o aviso não se repete por 14 dias
  await p.click("#wlLocal");
  await espera(500);
  assert.ok(await p.$eval("#webAviso", e => e.hidden));
  await p.reload(); await espera(500);
  assert.ok(await p.$eval("#webAviso", e => e.hidden));
  await p.fechar();
});

test("sem aviso para quem começou agora ou tem poucos dados", async () => {
  for (const [dados, dias] of [[muitos(12), 2], [muitos(3), 30]]) {
    const p = await amb.abrir({ dados, extra: { "arqevon-primeiro-uso": String(agora - dias * DIA) } });
    await espera(600);
    assert.ok(await p.$eval("#webAviso", e => e.hidden), `${dados.lancamentos.length} registros, ${dias} dias`);
    await p.fechar();
  }
  // primeira visita marca o início do uso
  const p = await amb.abrir({ dados: VAZIO() });
  await espera(400);
  const inicio = await p.evaluate(() => Number(localStorage.getItem("arqevon-primeiro-uso")));
  assert.ok(Math.abs(inicio - agora) < 60000, `início do uso marcado agora (${inicio})`);
  await p.fechar();
});

test("botão de instalar quando o navegador oferece", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await p.evaluate(() => {
    const e = new Event("beforeinstallprompt");
    e.prompt = () => { window.__pediuInstalar = true; };
    e.userChoice = Promise.resolve({ outcome: "accepted" });
    dispatchEvent(e);
  });
  await p.click("#webAbrirConta"); await espera(200);
  assert.ok(await p.$eval("#wcInstalar", e => !e.hidden));
  assert.match(await texto(p, "#wcInstalarTexto"), /funciona sem internet/);
  await p.click("#wcInstalarBotao"); await espera(100);
  assert.equal(await p.evaluate(() => window.__pediuInstalar), true);
  assert.ok(await p.$eval("#wcInstalar", e => e.hidden), "depois de instalar some");
  await p.fechar();
});
