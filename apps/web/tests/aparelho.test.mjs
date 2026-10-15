// Liberar aparelho novo aprovando em outro (cofre.js): o pacote só abre no aparelho que mostrou o
// código, e um servidor que troque a chave pública é pego pela etiqueta.
import assert from "node:assert/strict";
import test from "node:test";
import {
  criarCofre, abrirComSenha, cifrarItem, decifrarItem, idDoItem, novaChaveDaNuvem, abrirComChave, gerarChaveRecuperacao,
  novoPedidoAparelho, selarParaAparelho, abrirPacoteAparelho, normalizarCodigoAparelho, gerarCodigoAparelho,
} from "../src/cofre.js";
import { Sincronizador, estadoVazio } from "../src/sync.js";

const ID = "6f1c2d3e-0000-4000-8000-000000000001";
const pedidoNoServidor = p => ({ id: ID, device_pub: p.pub, device_tag: p.tag, label: "iPhone" });

test("código: 8 caracteres sem 0/1/I/O, aceita digitação solta", () => {
  for (let i = 0; i < 200; i++) assert.match(gerarCodigoAparelho(), /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(normalizarCodigoAparelho(" k7m2 q9xd "), "K7M2-Q9XD");
  assert.equal(normalizarCodigoAparelho("K7M2-Q9X"), null, "curto");
  assert.equal(normalizarCodigoAparelho("K7M2-Q9X0"), null, "0 não existe no alfabeto");
});

test("o aparelho novo recebe as mesmas chaves e lê o que o outro cifrou", async () => {
  const cofre = await criarCofre("senha-nuvem-123", "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", 1000);
  const pedido = await novoPedidoAparelho();
  const selado = await selarParaAparelho(cofre.chaves, pedidoNoServidor(pedido), pedido.codigo.toLowerCase().replace("-", " "));
  assert.doesNotMatch(selado, new RegExp(pedido.codigo), "o código não vai no pacote");
  const novas = await abrirPacoteAparelho(pedido, ID, selado);
  const id = await idDoItem(cofre.chaves, "lancamentos", "x1");
  assert.equal(await idDoItem(novas, "lancamentos", "x1"), id, "mesmo id opaco");
  const ct = await cifrarItem(cofre.chaves, id, "lancamentos", { descricao: "Mercado", valor: 10 });
  assert.deepEqual((await decifrarItem(novas, id, ct)).registro, { descricao: "Mercado", valor: 10 });
  // o aparelho liberado também pode liberar um terceiro
  const terceiro = await novoPedidoAparelho();
  const s2 = await selarParaAparelho(novas, pedidoNoServidor(terceiro), terceiro.codigo);
  const ch3 = await abrirPacoteAparelho(terceiro, ID, s2);
  assert.deepEqual((await decifrarItem(ch3, id, ct)).registro, { descricao: "Mercado", valor: 10 });
});

test("código errado não libera; servidor que troca a chave pública é recusado", async () => {
  const cofre = await criarCofre("senha-nuvem-123", "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", 1000);
  const pedido = await novoPedidoAparelho();
  const outro = gerarCodigoAparelho() === pedido.codigo ? "ZZZZ-ZZZZ" : gerarCodigoAparelho();
  await assert.rejects(selarParaAparelho(cofre.chaves, pedidoNoServidor(pedido), outro), e => e.code === "CODIGO_ERRADO");
  await assert.rejects(selarParaAparelho(cofre.chaves, pedidoNoServidor(pedido), "123"), e => e.code === "CODIGO_FORMATO");
  // ataque: o servidor põe a própria chave pública no lugar (com a etiqueta original ou a dele)
  const atacante = await novoPedidoAparelho();
  await assert.rejects(selarParaAparelho(cofre.chaves, { ...pedidoNoServidor(pedido), device_pub: atacante.pub }, pedido.codigo), e => e.code === "CODIGO_ERRADO");
  await assert.rejects(selarParaAparelho(cofre.chaves, { ...pedidoNoServidor(pedido), device_pub: atacante.pub, device_tag: atacante.tag }, pedido.codigo), e => e.code === "CODIGO_ERRADO");
});

test("pacote só abre no aparelho certo, para o pedido certo e sem adulteração", async () => {
  const cofre = await criarCofre("senha-nuvem-123", "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", 1000);
  const pedido = await novoPedidoAparelho();
  const selado = await selarParaAparelho(cofre.chaves, pedidoNoServidor(pedido), pedido.codigo);
  const intruso = await novoPedidoAparelho();
  await assert.rejects(abrirPacoteAparelho({ ...intruso, codigo: pedido.codigo }, ID, selado), "outra chave privada não abre");
  await assert.rejects(abrirPacoteAparelho(pedido, "outro-id", selado), "o pacote é preso ao id do pedido");
  const s = JSON.parse(selado); s.ct = s.ct.slice(0, -4) + (s.ct.endsWith("AAA=") ? "BBB=" : "AAA=");
  await assert.rejects(abrirPacoteAparelho(pedido, ID, JSON.stringify(s)), "adulterado não abre");
});

test("chaves salvas antes desta versão (sem a DEK) pedem a senha uma vez; com a senha, liberam", async () => {
  const cofre = await criarCofre("senha-nuvem-123", "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-GGGG-HHHH", 1000);
  const antigas = { cifra: cofre.chaves.cifra, ids: cofre.chaves.ids };
  const pedido = await novoPedidoAparelho();
  await assert.rejects(selarParaAparelho(antigas, pedidoNoServidor(pedido), pedido.codigo), e => e.code === "SEM_DEK");
  const status = { key_params: cofre.params, wrapped_key: cofre.wrapped };
  const reabertas = await abrirComSenha(status, "senha-nuvem-123");
  assert.ok(reabertas.dek, "abrir com a senha guarda a DEK");
  const selado = await selarParaAparelho(reabertas, pedidoNoServidor(pedido), pedido.codigo);
  assert.ok(await abrirPacoteAparelho(pedido, ID, selado));
});

test("nuvem sem senha: a chave de recuperação abre; cada chave nova tem kid próprio", async () => {
  const chave = gerarChaveRecuperacao();
  const c = await novaChaveDaNuvem(chave, 1000);
  assert.equal(c.params.v, 2);
  assert.ok(!("salt" in c.params) && !("iter" in c.params), "não há parâmetros de senha");
  assert.equal(c.wrapped, c.recovery);
  assert.ok(c.chaves.dek, "este aparelho pode liberar outros");
  const status = { key_params: c.params, wrapped_key: c.wrapped, recovery_wrapped_key: c.recovery };
  const abertas = await abrirComChave(status, chave);
  const id = await idDoItem(c.chaves, "lancamentos", "x");
  assert.equal(await idDoItem(abertas, "lancamentos", "x"), id);
  await assert.rejects(abrirComChave(status, gerarChaveRecuperacao()), "chave errada não abre");
  const outra = await novaChaveDaNuvem(chave, 1000);
  assert.notEqual(outra.params.kid, c.params.kid);
  // contas antigas (com senha) também abrem pela chave de recuperação
  const antiga = await criarCofre("senha-qualquer-1", chave, 1000);
  assert.ok(await abrirComChave({ key_params: antiga.params, recovery_wrapped_key: antiga.recovery }, chave));
});

test("sincronização com a chave antiga para e não grava nada (KEY_CHANGED)", async () => {
  const chamadas = [];
  const rpc = async (fn, args) => { chamadas.push(fn); if (fn === "vault_pull") return { data: { ok: true, items: [], until: 0, has_more: false, last_rev: 0, key_version: 2 } }; return { data: { ok: true, from_rev: 0, last_rev: 1 } }; };
  const { chaves } = await novaChaveDaNuvem(gerarChaveRecuperacao(), 1000);
  let estado = estadoVazio("u");
  const motor = { pronto: () => true, editando: () => false, ler: () => ({ lancamentos: [{ id: "1", descricao: "x" }] }), gravar: () => {} };
  const s = new Sincronizador({ rpc, chaves, motor, store: { ler: () => estado, gravar: e => { estado = e; } }, versao: 1 });
  await assert.rejects(s.sincronizar(), e => e.code === "KEY_CHANGED");
  assert.deepEqual(chamadas, ["vault_pull"], "não chegou a enviar");
  // com a versão certa, envia informando a versão
  const enviados = [];
  const rpc2 = async (fn, args) => { if (fn === "vault_push") enviados.push(args); return rpc(fn, args); };
  const s2 = new Sincronizador({ rpc: rpc2, chaves, motor, store: { ler: () => estadoVazio("u"), gravar: () => {} }, versao: 2 });
  assert.equal((await s2.sincronizar()).resultado, "ok");
  assert.equal(enviados[0].p_key_version, 2);
});
