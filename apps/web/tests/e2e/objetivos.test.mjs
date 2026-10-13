import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto, limparEDigitar } from "./ambiente.mjs";

const amb = preparar({ before, after });

test("criar, guardar, retirar, editar e atingir a meta", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await aba(p, "objetivos");
  await p.type("#oNome", "Reserva"); await p.type("#oMeta", "100000"); await p.type("#oAporte", "25000");
  await p.click("#oBtn");
  let o = (await lerDados(p)).objetivos[0];
  assert.deepEqual([o.nome, o.meta, o.aporteMensal], ["Reserva", 1000, 250]);
  assert.match(await texto(p, "#listaObjetivos"), /4 meses \(fev\/27\)/);

  const aporte = async (v, botao) => { await limparEDigitar(p, "input[data-aporte]", v); await p.click(`.obj-card .botao.${botao}`); await espera(50); };
  await aporte("30000", "entrada");
  p.respostas.push(true);
  await aporte("50000", "cancelar");
  assert.ok(p.vistos.some(v => v.includes("só tem R$ 300,00")), "não retira mais do que foi guardado");
  await aporte("10000", "cancelar");
  o = (await lerDados(p)).objetivos[0];
  assert.deepEqual(o.aportes.map(a => [a.valor, a.data]), [[300, "2026-10-13"], [-100, "2026-10-13"]]);
  assert.match(await texto(p, "#listaObjetivos"), /R\$ 200,00/);
  assert.match(await texto(p, "#listaObjetivos"), /20%/);
  await aporte("80000", "entrada");
  assert.match(await texto(p, "#listaObjetivos"), /Meta atingida/);

  await p.evaluate(() => editarObjetivo(dados.objetivos[0].id));
  await limparEDigitar(p, "#oNome", "Reserva 2"); await p.click("#oBtn");
  o = (await lerDados(p)).objetivos;
  assert.equal(o.length, 1);
  assert.equal(o[0].nome, "Reserva 2");
  assert.equal(o[0].aportes.length, 3, "editar mantém o histórico");
  await p.evaluate(() => { const o = dados.objetivos[0]; excluirAporte(o.id, o.aportes[0].id); });
  assert.equal((await lerDados(p)).objetivos[0].aportes.length, 2);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("excluir objetivos com aspas e apóstrofo no nome", async () => {
  const nomes = ["Viagem d'água", 'Carro "novo"', "Casa <própria>"];
  const p = await amb.abrir({ dados: { ...VAZIO(), objetivos: nomes.map((nome, i) => ({ id: "o" + i, nome, meta: 0, aporteMensal: 0, aportes: [] })) } });
  await aba(p, "objetivos");
  // cancelar a confirmação não exclui
  p.respostas.push(false);
  await p.click(".obj-card button.excluir");
  assert.equal((await lerDados(p))?.objetivos?.length ?? 3, 3);
  for (const nome of nomes) {
    p.respostas.push(true);
    await p.evaluate(n => [...document.querySelectorAll(".obj-card")].find(c => c.querySelector("h2").textContent === n)
      .querySelector("button.excluir").click(), nome);
    await espera(50);
    assert.ok(!(await lerDados(p)).objetivos.some(o => o.nome === nome), `excluiu ${nome}`);
  }
  assert.ok(p.vistos.some(v => v.includes(`"Viagem d'água"`)), "a confirmação mostra o nome certo");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
