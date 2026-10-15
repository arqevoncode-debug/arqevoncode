// Dados no navegador sem "Dados e segurança" (removido em 2026-10-15): sem exportar, importar,
// resetar, criptografia nem bloqueio. Quem tinha a criptografia ligada abre uma última vez.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, espera, lerDados, aba, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const CHAVE = "meu-financeiro-v1";
const b64 = u => Buffer.from(u).toString("base64");

// Mesmo formato que a versão antiga gravava: PBKDF2-SHA256 (150 mil) + AES-256-GCM.
async function cifrarComoAntes(senha, dados, salt) {
  const s = salt || crypto.getRandomValues(new Uint8Array(16));
  const mat = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
  const chave = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: s, iterations: 150000, hash: "SHA-256" }, mat, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, new TextEncoder().encode(JSON.stringify(dados)));
  return { enc: true, salt: b64(s), iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}

test("não existe mais 'Dados e segurança' (exportar, importar, resetar, criptografia, bloqueio)", async () => {
  const p = await amb.abrir({ dados: { ...VAZIO(), lancamentos: [{ id: "a", tipo: "despesa", descricao: "Mercado", valor: 10, categoria: "outros", data: "2026-10-03" }] } });
  for (const a of ["painel", "lancamentos", "objetivos", "relatorios"]) {
    await aba(p, a);
    assert.doesNotMatch(await texto(p, "body"), /Dados e segurança|Exportar backup|Importar backup|Resetar dados|Bloqueio automático/);
  }
  for (const sel of ["#btnExportar", "#btnImportar", "#btnResetar", "#btnCripto", "#btnBloqueio", "#modalSeg", "#modalReset", "#arqImportar"]) assert.equal(await p.$(sel), null, `${sel} não existe`);
  assert.ok(await p.$eval("#telaBloqueio", e => e.hidden), "sem tela de senha");
  assert.equal(await p.evaluate(() => localStorage.getItem("meu-financeiro-v1").startsWith("{\"enc\"")), false, "gravado sem criptografia");
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("dados incompletos não travam o app", async () => {
  const quebrados = {
    lancamentos: [{ id: "a", descricao: "Sem data", valor: 1 }, { id: "b", tipo: "despesa", descricao: "Ok", valor: 2, categoria: "outros", data: "2026-10-01" }, null],
    fixos: [{ id: "f", tipo: "despesa", descricao: "Sem valor" }],
    parcelamentos: [{ id: "p", descricao: "Sem início", valorTotal: 10, numParcelas: 2 }],
    objetivos: [{ id: "o", nome: "Sem aportes", meta: 10 }],
  };
  const p = await amb.abrir({ dados: quebrados });
  for (const a of ["lancamentos", "objetivos", "painel"]) await aba(p, a);
  assert.deepEqual(p.erros, []);
  assert.deepEqual(await p.evaluate(() => [dados.lancamentos.length, dados.fixos.length, dados.parcelamentos.length, dados.objetivos.length]), [1, 0, 0, 1]);
  // vindos da nuvem (camada web)
  await p.evaluate(d => MyFinanceBridge.substituirDados(d, { sync: true }), quebrados);
  for (const a of ["lancamentos", "objetivos", "painel"]) await aba(p, a);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("dados cifrados por uma versão antiga: a senha é pedida uma última vez e some de vez", async () => {
  const reais = { ...VAZIO(), lancamentos: [{ id: "s1", tipo: "despesa", descricao: "Aluguel antigo", valor: 1450, categoria: "moradia", data: "2026-10-02" }] };
  const blob = await cifrarComoAntes("senha-antiga-1", reais);
  const p = await amb.abrir({ dados: null, aceleraIdle: 60, extra: {
    [CHAVE]: JSON.stringify(blob), [CHAVE + "-backup"]: JSON.stringify(blob),
    [CHAVE + "-seg"]: JSON.stringify({ salt: blob.salt, cripto: true, bloqueio: true, minutos: 1, convite: true }),
  } });
  assert.ok(!(await p.$eval("#telaBloqueio", e => e.hidden)), "pede a senha");
  assert.match(await texto(p, "#tbMsg"), /uma última vez/);
  assert.ok(await p.$eval(".app", e => e.inert), "nada atrás da tela de senha pode ser usado");
  await p.type("#tbSenha", "errada-999"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector("#tbErro").hidden, { timeout: 15000 });
  await p.$eval("#tbSenha", e => { e.value = ""; });
  await p.type("#tbSenha", "senha-antiga-1"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector("#telaBloqueio").hidden, { timeout: 15000 });
  assert.deepEqual((await lerDados(p)).lancamentos.map(l => l.descricao), ["Aluguel antigo"], "dados abertos e gravados sem criptografia");
  assert.equal(await p.evaluate(k => localStorage.getItem(k + "-seg"), CHAVE), null, "configuração antiga apagada");
  assert.ok(await p.evaluate(k => !JSON.parse(localStorage.getItem(k + "-backup")).enc, CHAVE), "cópia sem criptografia");
  // sem bloqueio por inatividade (1 minuto acelerado 60x = 1 s) e sem senha ao reabrir
  await espera(2500);
  assert.ok(await p.$eval("#telaBloqueio", e => e.hidden), "não bloqueia mais por inatividade");
  await p.reload(); await espera(400);
  assert.ok(await p.$eval("#telaBloqueio", e => e.hidden), "reabre sem pedir senha");
  assert.match(await texto(p, "#aba-painel"), /1\.450,00/);
  assert.deepEqual(p.erros, []);
  await p.fechar();
});
