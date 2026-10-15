// Acesso só pelo e-mail: a sincronização com uma chave que não é mais a da nuvem para sem gravar.
import assert from "node:assert/strict";
import test from "node:test";
import { novaChaveCustodia } from "../src/cofre.js";
import { Sincronizador, estadoVazio } from "../src/sync.js";

test("sincronização com a chave antiga para e não grava nada (KEY_CHANGED)", async () => {
  const chamadas = [];
  const rpc = async fn => { chamadas.push(fn); if (fn === "vault_pull") return { data: { ok: true, items: [], until: 0, has_more: false, last_rev: 0, key_version: 2 } }; return { data: { ok: true, from_rev: 0, last_rev: 1 } }; };
  const { chaves } = await novaChaveCustodia();
  let estado = estadoVazio("u");
  const motor = { pronto: () => true, editando: () => false, ler: () => ({ lancamentos: [{ id: "1", descricao: "x" }] }), gravar: () => {} };
  const s = new Sincronizador({ rpc, chaves, motor, store: { ler: () => estado, gravar: e => { estado = e; } }, versao: 1 });
  await assert.rejects(s.sincronizar(), e => e.code === "KEY_CHANGED");
  assert.deepEqual(chamadas, ["vault_pull"], "não chegou a enviar");
  const enviados = [];
  const rpc2 = async (fn, args) => { if (fn === "vault_push") enviados.push(args); return rpc(fn, args); };
  const s2 = new Sincronizador({ rpc: rpc2, chaves, motor, store: { ler: () => estadoVazio("u"), gravar: () => {} }, versao: 2 });
  assert.equal((await s2.sincronizar()).resultado, "ok");
  assert.equal(enviados[0].p_key_version, 2, "envia a versão da chave");
});
