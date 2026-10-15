// Liberar aparelho novo aprovando em outro (cofre.js): o pacote só abre no aparelho que mostrou o
// código, e um servidor que troque a chave pública é pego pela etiqueta.
import assert from "node:assert/strict";
import test from "node:test";
import {
  criarCofre, abrirComSenha, cifrarItem, decifrarItem, idDoItem,
  novoPedidoAparelho, selarParaAparelho, abrirPacoteAparelho, normalizarCodigoAparelho, gerarCodigoAparelho,
} from "../src/cofre.js";

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
