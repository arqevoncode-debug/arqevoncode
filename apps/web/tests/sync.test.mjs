import assert from "node:assert/strict";
import test from "node:test";
import { novaChaveCustodia, dekEmBase64, chavesDeDekBase64, idDoItem, cifrarItem, decifrarItem } from "../src/cofre.js";
import { Sincronizador, estadoVazio } from "../src/sync.js";

// Servidor falso com a mesma semântica de vault_push/vault_pull (rev por conta, último vence).
function servidor() {
  const itens = new Map();
  let lastRev = 0;
  return {
    itens,
    get lastRev() { return lastRev; },
    async rpc(fn, args) {
      if (fn === "vault_push") {
        const from = lastRev;
        for (const it of args.p_items) {
          lastRev += 1;
          itens.set(it.id, { id: it.id, rev: lastRev, deleted: !!it.deleted, ct: it.deleted ? null : it.ct });
        }
        return { data: { ok: true, from_rev: from, last_rev: lastRev } };
      }
      if (fn === "vault_pull") {
        const lista = [...itens.values()].filter(i => i.rev > args.p_since).sort((a, b) => a.rev - b.rev).slice(0, args.p_limit);
        const until = lista.length ? lista.at(-1).rev : args.p_since;
        return { data: { ok: true, items: lista, until, has_more: until < lastRev } };
      }
      throw new Error(fn);
    },
  };
}

function aparelho(srv, chaves, dadosIniciais = {}, opcoes = {}) {
  let dados = { lancamentos: [], fixos: [], parcelamentos: [], objetivos: [], orcamentos: [], ...dadosIniciais };
  let estado = estadoVazio("conta-1");
  const ap = {
    get dados() { return dados; },
    set dados(d) { dados = d; },
    bloqueado: false, editando: false, confirmacoes: [],
    sync: null,
  };
  ap.sync = new Sincronizador({
    rpc: (fn, args) => srv.rpc(fn, args),
    chaves,
    store: { ler: () => structuredClone(estado), gravar: e => { estado = structuredClone(e); } },
    motor: {
      pronto: () => !ap.bloqueado,
      editando: () => ap.editando,
      ler: () => structuredClone(dados),
      gravar: d => { dados = structuredClone(d); },
    },
    confirmar: async msg => { ap.confirmacoes.push(msg); return opcoes.confirma ?? false; },
  });
  return ap;
}

const lanc = (id, descricao, valor = 10) => ({ id, tipo: "despesa", descricao, valor, categoria: "outros", data: "2026-10-05" });

test("cofre: a chave entregue ao servidor reabre os dados; texto cifrado não troca de item", async () => {
  const c = await novaChaveCustodia();
  assert.equal(c.params.v, 3);
  assert.match(c.params.kid, /^[A-Za-z0-9_-]{16}$/);
  const outra = await novaChaveCustodia();
  assert.notEqual(outra.params.kid, c.params.kid, "cada chave tem kid próprio");
  const dek = await dekEmBase64(c.chaves);
  const reaberta = await chavesDeDekBase64(dek);
  await assert.rejects(chavesDeDekBase64(btoa("curta")));

  const id = await idDoItem(c.chaves, "lancamentos", "abc");
  assert.equal(id, await idDoItem(reaberta, "lancamentos", "abc"));
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  const ct = await cifrarItem(c.chaves, id, "lancamentos", lanc("abc", "Mercado"));
  assert.deepEqual(await decifrarItem(reaberta, id, ct), { colecao: "lancamentos", registro: lanc("abc", "Mercado") });
  assert.ok(!ct.includes("Mercado"));
  const outroId = await idDoItem(c.chaves, "lancamentos", "xyz");
  await assert.rejects(decifrarItem(reaberta, outroId, ct), "id entra como dado autenticado");
  await assert.rejects(decifrarItem(outra.chaves, id, ct), "outra chave não abre");
});

test("dois aparelhos: cria, edita e apaga propagam nos dois sentidos", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("1", "Aluguel", 1500)] });
  const b = aparelho(srv, chaves);

  assert.equal((await a.sync.sincronizar()).enviados, 1);
  await b.sync.sincronizar();
  assert.deepEqual(b.dados.lancamentos, [lanc("1", "Aluguel", 1500)]);

  b.dados = { ...b.dados, lancamentos: [lanc("1", "Aluguel", 1600)], objetivos: [{ id: "o1", nome: "Viagem", meta: 5000, aportes: [] }] };
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  assert.equal(a.dados.lancamentos[0].valor, 1600);
  assert.equal(a.dados.objetivos[0].nome, "Viagem");

  a.dados = { ...a.dados, objetivos: [] };
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.deepEqual(b.dados.objetivos, []);

  // Limites por categoria também vão e voltam, e a remoção de um limite propaga.
  a.dados = { ...a.dados, orcamentos: [{ id: "alimentacao", categoria: "alimentacao", limite: 700 }, { id: "lazer", categoria: "lazer", limite: 150 }] };
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.deepEqual(b.dados.orcamentos.map(o => [o.categoria, o.limite]).sort(), [["alimentacao", 700], ["lazer", 150]]);
  b.dados = { ...b.dados, orcamentos: [{ id: "alimentacao", categoria: "alimentacao", limite: 800 }] };
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  assert.deepEqual(a.dados.orcamentos, [{ id: "alimentacao", categoria: "alimentacao", limite: 800 }]);

  // Nada muda: rodada vazia não envia nada.
  const r = await b.sync.sincronizar();
  assert.equal(r.enviados, 0);
  assert.equal(r.apagados, 0);
});

test("1º aparelho com dados e 2º com dados próprios: tudo se junta, nada se perde", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("a1", "Mercado")], fixos: [{ id: "f1", tipo: "receita", descricao: "Salário", valor: 6000, dia: 5 }] });
  const b = aparelho(srv, chaves, { lancamentos: [lanc("b1", "Farmácia")] });
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  const ids = d => d.lancamentos.map(l => l.id).sort();
  assert.deepEqual(ids(a.dados), ["a1", "b1"]);
  assert.deepEqual(ids(b.dados), ["a1", "b1"]);
  assert.equal(b.dados.fixos[0].descricao, "Salário");
});

test("conflito: edição local não enviada vence a remota", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("1", "Original")] });
  const b = aparelho(srv, chaves);
  await a.sync.sincronizar();
  await b.sync.sincronizar();

  a.dados = { ...a.dados, lancamentos: [lanc("1", "Editado em A")] };
  await a.sync.sincronizar();
  b.dados = { ...b.dados, lancamentos: [lanc("1", "Editado em B")] }; // B editou sem ter recebido a edição de A
  await b.sync.sincronizar();
  assert.equal(b.dados.lancamentos[0].descricao, "Editado em B", "B não perde o que digitou");
  await a.sync.sincronizar();
  assert.equal(a.dados.lancamentos[0].descricao, "Editado em B", "a última gravação no servidor vale para todos");
});

test("apagado aqui e editado lá: a exclusão local é enviada; editado aqui e apagado lá: a edição volta", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("1", "X"), lanc("2", "Y")] });
  const b = aparelho(srv, chaves);
  await a.sync.sincronizar(); await b.sync.sincronizar();

  b.dados = { ...b.dados, lancamentos: [lanc("2", "Y editado")] }; // B apaga 1 e edita 2
  a.dados = { ...a.dados, lancamentos: [lanc("1", "X editado")] }; // A edita 1 e apaga 2
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  await b.sync.sincronizar();
  assert.deepEqual(a.dados.lancamentos.map(l => l.descricao).sort(), ["X editado"]);
  assert.deepEqual(b.dados.lancamentos.map(l => l.descricao).sort(), ["X editado"]);
});

test("app bloqueado ou usuário digitando: não sincroniza nem apaga", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("1", "X")] });
  const b = aparelho(srv, chaves);
  await a.sync.sincronizar();

  b.bloqueado = true; // dados locais ainda cifrados: a lista vazia NÃO pode virar exclusão
  assert.equal((await b.sync.sincronizar()).resultado, "bloqueado");
  assert.equal(srv.itens.size, 1);

  b.bloqueado = false; b.editando = true;
  assert.equal((await b.sync.sincronizar()).resultado, "adiado");
  assert.deepEqual(b.dados.lancamentos, []);
  b.editando = false;
  await b.sync.sincronizar();
  assert.equal(b.dados.lancamentos.length, 1);
});

test("apagar quase tudo pede confirmação; recusado, os registros voltam da nuvem", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const muitos = Array.from({ length: 10 }, (_, i) => lanc(String(i), `L${i}`));
  const a = aparelho(srv, chaves, { lancamentos: muitos }, { confirma: false });
  await a.sync.sincronizar();

  a.dados = { ...a.dados, lancamentos: [] };
  await a.sync.sincronizar();
  assert.equal(a.confirmacoes.length, 1);
  assert.equal(a.dados.lancamentos.length, 10, "recusou: restaurado da nuvem");
  assert.equal([...srv.itens.values()].filter(i => !i.deleted).length, 10);

  const b = aparelho(srv, chaves, { lancamentos: muitos }, { confirma: true });
  await b.sync.sincronizar();
  b.dados = { ...b.dados, lancamentos: [] };
  await b.sync.sincronizar();
  assert.equal([...srv.itens.values()].filter(i => !i.deleted).length, 0, "confirmou: apagado na nuvem");

  // Apagar poucos não pergunta.
  const c = aparelho(servidor(), chaves, { lancamentos: muitos });
  await c.sync.sincronizar();
  c.dados = { ...c.dados, lancamentos: muitos.slice(2) };
  await c.sync.sincronizar();
  assert.equal(c.confirmacoes.length, 0);
});

test("mais de 500 itens vão em lotes, e rodadas simultâneas viram uma só", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: Array.from({ length: 1203 }, (_, i) => lanc(`x${i}`, `L${i}`)) });
  const [r1, r2] = await Promise.all([a.sync.sincronizar(), a.sync.sincronizar()]);
  assert.equal(r1, r2);
  assert.equal(srv.itens.size, 1203);
  const b = aparelho(srv, chaves);
  await b.sync.sincronizar();
  assert.equal(b.dados.lancamentos.length, 1203);
});

test("outro aparelho grava entre o pull e o push: nada é pulado", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("a", "A")] });
  const b = aparelho(srv, chaves, { lancamentos: [lanc("b", "B")] });
  // Intercala: B grava logo depois do pull de A.
  const rpcOriginal = srv.rpc.bind(srv);
  let intercalado = false;
  srv.rpc = async (fn, args) => {
    const r = await rpcOriginal(fn, args);
    if (fn === "vault_pull" && !intercalado) { intercalado = true; await b.sync.sincronizar(); }
    return r;
  };
  await a.sync.sincronizar();
  srv.rpc = rpcOriginal;
  await a.sync.sincronizar();
  assert.deepEqual(a.dados.lancamentos.map(l => l.id).sort(), ["a", "b"]);
});

test("lançamento feito durante a rodada não é apagado pela mescla", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: Array.from({ length: 300 }, (_, i) => lanc("a" + i, "Item " + i)) });
  await a.sync.sincronizar();
  const b = aparelho(srv, chaves);
  // a pessoa grava algo logo depois que a rodada leu os dados, enquanto ela ainda calcula
  const lerOriginal = b.sync.motor.ler;
  let primeira = true;
  b.sync.motor.ler = () => {
    const d = lerOriginal();
    if (primeira) { primeira = false; setTimeout(() => { b.dados = { ...b.dados, lancamentos: [...b.dados.lancamentos, lanc("novo", "Digitado agora")] }; }, 0); }
    return d;
  };
  const r = await b.sync.sincronizar();
  assert.equal(r.resultado, "adiado", "a rodada percebe a mudança e não grava por cima");
  assert.ok(b.dados.lancamentos.some(l => l.id === "novo"), "o lançamento novo continua lá");
  // na rodada seguinte tudo se acerta: os 300 de A chegam e o novo vai para a nuvem
  await b.sync.sincronizar();
  assert.equal(b.dados.lancamentos.length, 301);
  await a.sync.sincronizar();
  assert.ok(a.dados.lancamentos.some(l => l.id === "novo"));
});

test("aportes no mesmo objetivo em dois aparelhos: os dois ficam", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const obj = { id: "o1", nome: "Reserva", meta: 0, aporteMensal: 0, aportes: [] };
  const a = aparelho(srv, chaves, { objetivos: [obj] });
  await a.sync.sincronizar();
  const b = aparelho(srv, chaves);
  await b.sync.sincronizar();
  // A guarda 100 e sincroniza; B, offline, guarda 200
  a.dados = { ...a.dados, objetivos: [{ ...obj, aportes: [{ id: "x1", valor: 100, data: "2026-10-01" }] }] };
  await a.sync.sincronizar();
  b.dados = { ...b.dados, objetivos: [{ ...obj, aportes: [{ id: "x2", valor: 200, data: "2026-10-02" }] }] };
  await b.sync.sincronizar();
  await a.sync.sincronizar();
  const soma = d => d.objetivos[0].aportes.map(x => x.valor).sort((p, q) => p - q);
  assert.deepEqual(soma(b.dados), [100, 200]);
  assert.deepEqual(soma(a.dados), [100, 200]);
});

test("item ilegível na nuvem é pulado sem travar o resto", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: [lanc("1", "Bom")] });
  await a.sync.sincronizar();
  srv.itens.set("lixo-1234", { id: "lixo-1234", rev: 999, deleted: false, ct: "isto-nao-e-cifrado" });
  const b = aparelho(srv, chaves);
  const r = await b.sync.sincronizar();
  assert.equal(r.resultado, "ok");
  assert.deepEqual(b.dados.lancamentos.map(l => l.descricao), ["Bom"]);
});

test("apagar 30% ou mais dos registros pede confirmação", async () => {
  const { chaves } = await novaChaveCustodia();
  const srv = servidor();
  const a = aparelho(srv, chaves, { lancamentos: Array.from({ length: 20 }, (_, i) => lanc("l" + i, "L" + i)) });
  await a.sync.sincronizar();
  a.dados = { ...a.dados, lancamentos: a.dados.lancamentos.slice(6) }; // 6 de 20
  await a.sync.sincronizar();
  assert.equal(a.confirmacoes.length, 1);
  assert.equal(a.dados.lancamentos.length, 20, "recusado: os registros voltam da nuvem");
});
