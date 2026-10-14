// Conta logada com o Supabase simulado: o navegador intercepta as chamadas e responde com dados de
// teste. Nada chega ao Supabase de verdade.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { preparar, VAZIO, HOJE, espera, texto } from "./ambiente.mjs";

const amb = preparar({ before, after });
const UID = "c0ffee00-0000-4000-8000-0000000000aa";
const agora = new Date(HOJE).getTime();
const emDias = d => new Date(agora + d * 86400000).toISOString();
const PLANOS = [
  { id: "pro_fundador", name: "Pro Fundador", price_cents: 990, interval: "month", slots_left: 37 },
  { id: "pro_mensal", name: "Pro mensal", price_cents: 1490, interval: "month", slots_left: null },
  { id: "pro_anual", name: "Pro anual", price_cents: 11900, interval: "year", slots_left: null },
];

function jwt() {
  const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ sub: UID, email: "cliente@teste.com", role: "authenticated", exp: Math.floor(agora / 1000) + 3600 })}.assinatura`;
}

/** Abre o app logado; `rpc` responde às funções do banco pelo nome. */
async function abrirLogado({ rpc, dados = VAZIO(), vp }) {
  const p = await amb.abrir({ dados, vp });
  p.chamadas = [];
  await p.setRequestInterception(true);
  p.on("request", req => {
    const u = new URL(req.url());
    if (!u.hostname.endsWith("supabase.co")) return req.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors });
    const fn = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (fn) p.chamadas.push(fn);
    const corpo = fn && fn in rpc ? rpc[fn] : fn ? { ok: true } : {};
    return req.respond({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify(corpo) });
  });
  await p.evaluate(sessao => {
    localStorage.removeItem("arqevon-web-local");
    localStorage.setItem("arqevon-auth", JSON.stringify(sessao));
  }, { access_token: jwt(), refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(agora / 1000) + 3600,
    user: { id: UID, email: "cliente@teste.com", aud: "authenticated", role: "authenticated" } });
  await p.reload();
  await p.waitForFunction(() => document.querySelector("#webLogin")?.hidden === true, { timeout: 10000 });
  await espera(400);
  return p;
}

const direitos = ({ cloud = false, sub = null, trial = null } = {}) => ({
  ok: true,
  entitlements: [{ product: "finance", feature: "use" }, ...(cloud ? [{ product: "finance", feature: "cloud" }] : [])],
  subscription: sub, trial,
});
const COFRE = { ok: true, entitled: true, exists: false };

test("conta nova ganha 30 dias de Pro e pode assinar durante o teste", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "started", ends_at: emDias(30) },
    my_entitlements: direitos({ cloud: true, trial: { ends_at: emDias(30), active: true } }),
    list_plans: PLANOS, vault_status: COFRE,
  } });
  assert.ok(p.chamadas.includes("claim_trial"), "o app pede o teste grátis");
  assert.ok(p.chamadas.indexOf("claim_trial") < p.chamadas.indexOf("my_entitlements"), "pede o teste antes de ler os direitos");
  assert.ok(await p.$eval("#webAviso", e => !e.hidden), "aviso do teste aparece");
  assert.match(await texto(p, "#webAvisoTexto"), /30 dias de Pro grátis/);
  assert.equal(await texto(p, "#webPlano"), "Pro grátis · faltam 30 dias");
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/teste-aviso.png` });

  await p.click("#webAvisoAcao");
  await p.waitForFunction(() => document.querySelector("#webConta").open);
  await espera(300);
  assert.match(await texto(p, "#wcProStatus"), /Teste grátis até 12\/11\/2026/);
  assert.match(await texto(p, "#wcProPreco"), /R\$ 14,90/, "o preço do Pro é o mensal, não o Fundador");
  assert.ok(await p.$eval("#wcAssinar", e => !e.hidden), "durante o teste dá para assinar");
  const ciclos = await texto(p, "#wcCiclos");
  assert.match(ciclos, /Fundador · R\$ 9,90\/mês para sempre.*restam 37 vagas/);
  assert.match(ciclos, /Mensal · R\$ 14,90\/mês/);
  assert.match(ciclos, /Anual · R\$ 119,00\/ano.*economize R\$ 59,80/);
  if (process.env.FOTOS) await p.screenshot({ path: `${process.env.FOTOS}/teste-conta.png` });
  assert.deepEqual(p.erros, []);
  await p.fechar();
});

test("teste já usado não mostra o aviso de novo", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "used", ends_at: emDias(12) },
    my_entitlements: direitos({ cloud: true, trial: { ends_at: emDias(12), active: true } }),
    list_plans: PLANOS, vault_status: COFRE,
  } });
  assert.ok(await p.$eval("#webAviso", e => e.hidden));
  assert.equal(await texto(p, "#webPlano"), "Pro grátis · faltam 12 dias");
  await p.fechar();
});

test("teste encerrado: dados guardados e convite para assinar", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "used", ends_at: emDias(-2) },
    my_entitlements: direitos({ trial: { ends_at: emDias(-2), active: false } }),
    list_plans: PLANOS, vault_status: { ok: true, entitled: false, exists: true },
  } });
  assert.equal(await texto(p, "#webPlano"), "Plano Grátis");
  await p.click("#webAbrirConta"); await espera(300);
  assert.match(await texto(p, "#wcProStatus"), /teste grátis terminou.*continuam guardados/i);
  assert.ok(await p.$eval("#wcAssinar", e => !e.hidden));
  await p.fechar();
});

test("assinante não vê teste nem oferta", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "not_eligible" },
    my_entitlements: direitos({ cloud: true, sub: { plan: "pro_anual", status: "active", current_period_end: emDias(200) } }),
    list_plans: PLANOS, vault_status: { ok: true, entitled: true, exists: false },
  } });
  assert.ok(await p.$eval("#webAviso", e => e.hidden));
  assert.equal(await texto(p, "#webPlano"), "Plano Pro");
  await p.click("#webAbrirConta"); await espera(300);
  assert.match(await texto(p, "#wcProStatus"), /Ativo · renova em/);
  assert.ok(await p.$eval("#wcAssinar", e => e.hidden));
  await p.fechar();
});

test("sem conta não pede teste e o aviso não cobre a barra do celular", async () => {
  const p = await amb.abrir({ dados: VAZIO(), vp: { width: 390, height: 800, isMobile: true, hasTouch: true } });
  const chamou = [];
  p.on("request", r => { if (/rpc\/claim_trial/.test(r.url())) chamou.push(r.url()); });
  await espera(300);
  assert.equal(chamou.length, 0);
  // o aviso, quando aparece no celular, fica acima da barra de abas
  await p.evaluate(() => { document.querySelector("#webAvisoTexto").textContent = "x"; document.querySelector("#webAviso").hidden = false; });
  const [aviso, abas] = await p.evaluate(() => [document.querySelector("#webAviso").getBoundingClientRect().bottom,
    document.querySelector("#abas").getBoundingClientRect().top]);
  assert.ok(aviso <= abas, `aviso (${aviso}) passa da barra (${abas})`);
  await p.fechar();
});
