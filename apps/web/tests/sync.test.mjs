import assert from "node:assert/strict";
import test from "node:test";
import {
  criarCofre, abrirComSenha, recuperarComChave, gerarChaveRecuperacao, normalizarChaveRecuperacao,
  idDoItem, cifrarItem, decifrarItem,
} from "../src/cofre.js";
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
  let dados = { lancamentos: [], fixos: [], parcelamentos: [], objetivos: [], ...dadosIniciais };
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
const ITER = 1000; // PBKDF2 rápido nos testes; o app usa 600 mil

test("cofre: senha certa abre, senha errada não, recuperação define senha nova", async () => {
  const rec = gerarChaveRecuperacao();
  assert.match(rec, /^([A-HJ-NP-Z2-9]{4}-){7}[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizarChaveRecuperacao(rec.toLowerCase().replaceAll("-", " ")), rec);
  assert.equal(normalizarChaveRecuperacao("curta"), null);

  const c = await criarCofre("senha-boa-123", rec, ITER);
  const status = { key_params: c.params, wrapped_key: c.wrapped, recovery_wrapped_key: c.recovery };
  const aberto = await abrirComSenha(status, "senha-boa-123");
  await assert.rejects(abrirComSenha(status, "senha-errada"));

  // Mesma DEK: o que um cifra, o outro abre.
  const id = await idDoItem(c.chaves, "lancamentos", "abc");
  assert.equal(id, await idDoItem(aberto, "lancamentos", "abc"));
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  const ct = await cifrarItem(c.chaves, id, "lancamentos", lanc("abc", "Mercado"));
  assert.deepEqual(await decifrarItem(aberto, id, ct), { colecao: "lancamentos", registro: lanc("abc", "Mercado") });
  assert.ok(!ct.includes("Mercado"));

  // Texto cifrado não pode trocar de item (id entra como dado autenticado).
  const outroId = await idDoItem(c.chaves, "lancamentos", "xyz");
  await assert.rejects(decifrarItem(aberto, outroId, ct));

  const r = await recuperarComChave(status, rec, "senha-nova-456", ITER);
  const status2 = { key_params: r.params, wrapped_key: r.wrapped, recovery_wrapped_key: r.recovery };
  const reaberto = await abrirComSenha(status2, "senha-nova-456");
  await assert.rejects(abrirComSenha(status2, "senha-boa-123"));
  assert.deepEqual((await decifrarItem(reaberto, id, ct)).registro.descricao, "Mercado");
  await assert.rejects(recuperarComChave(status, gerarChaveRecuperacao(), "x", ITER));
});

test("dois aparelhos: cria, edita e apaga propagam nos dois sentidos", async () => {
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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

  // Nada muda: rodada vazia não envia nada.
  const r = await b.sync.sincronizar();
  assert.equal(r.enviados, 0);
  assert.equal(r.apagados, 0);
});

test("1º aparelho com dados e 2º com dados próprios: tudo se junta, nada se perde", async () => {
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
  const { chaves } = await criarCofre("s", gerarChaveRecuperacao(), ITER);
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
