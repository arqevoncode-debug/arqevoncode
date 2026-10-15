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
async function abrirLogado({ rpc, dados = VAZIO(), vp, extra }) {
  const p = await amb.abrir({ dados, vp, extra });
  p.chamadas = [];
  p.corpos = {};
  await p.setRequestInterception(true);
  p.on("request", req => {
    const u = new URL(req.url());
    if (!u.hostname.endsWith("supabase.co")) return req.continue();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors });
    const fn = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (fn) { p.chamadas.push(fn); p.corpos[fn] = req.postData() || ""; }
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

test("aparelho novo de quem já tem dados na nuvem: convite para abrir", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "not_eligible" },
    my_entitlements: direitos({ cloud: true, sub: { plan: "pro_mensal", status: "active", current_period_end: emDias(20) } }),
    list_plans: PLANOS, vault_status: { ok: true, entitled: true, exists: true, key_params: {}, wrapped_key: "x".repeat(20), recovery_wrapped_key: "y".repeat(20), key_version: 1 },
    vault_link_request: { ok: true, id: "link-1", expires_at: emDias(1) },
    vault_link_take: { ok: true, pending: true },
  } });
  await p.waitForFunction(() => !document.querySelector("#webAviso").hidden, { timeout: 5000 });
  assert.match(await texto(p, "#webAvisoTexto"), /já tem dados na nuvem.*aprove este aparelho/);
  await p.click("#webAvisoAcao");
  await p.waitForFunction(() => document.querySelector("#webConta").open);
  await espera(300);
  assert.ok(await p.$eval("#wnAparelho", e => !e.hidden), "abre direto na liberação por outro aparelho");
  assert.match(await texto(p, "#wnCodigo"), /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/, "mostra o código");
  await p.click("#wnUsarChave");
  assert.ok(await p.$eval("#wnRecuperar", e => !e.hidden), "a chave de recuperação é a alternativa");
  assert.equal(await p.$("#wnSenhaAbrir"), null, "não existe mais senha da nuvem");
  await p.fechar();
});

test("teste grátis acabando: aviso uma vez só", async () => {
  const rpc = {
    claim_trial: { ok: true, status: "used", ends_at: emDias(2) },
    my_entitlements: direitos({ cloud: true, trial: { ends_at: emDias(2), active: true } }),
    list_plans: PLANOS, vault_status: COFRE,
  };
  const p = await abrirLogado({ rpc });
  await p.waitForFunction(() => !document.querySelector("#webAviso").hidden, { timeout: 5000 });
  assert.match(await texto(p, "#webAvisoTexto"), /Seu Pro grátis termina em 2 dias/);
  assert.equal(await texto(p, "#webAvisoAcao"), "Ver planos");
  await p.reload();
  await p.waitForFunction(() => document.querySelector("#webLogin")?.hidden === true);
  await espera(800);
  assert.ok(await p.$eval("#webAviso", e => e.hidden), "não repete");
  await p.fechar();
});

test("convite: o link guarda o código e a tela de login avisa", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await p.evaluate(() => localStorage.removeItem("arqevon-web-local"));
  await p.goto(p.url().split("?")[0].split("#")[0] + "?convite=abcd2345");
  await p.waitForFunction(() => !document.querySelector("#webLogin").hidden);
  assert.equal(await p.evaluate(() => localStorage.getItem("arqevon-convite")), "ABCD2345");
  assert.match(await texto(p, "#wlAviso"), /convidado.*60 dias de Pro grátis/);
  assert.ok(!p.url().includes("convite="), "o endereço volta ao normal");
  await p.fechar();
});

test("convite usado no login antes do teste grátis, e o aviso fala em 60 dias", async () => {
  const p = await abrirLogado({ extra: { "arqevon-convite": "ABCD2345" }, rpc: {
    claim_referral: { ok: true, status: "referred" },
    claim_trial: { ok: true, status: "started", ends_at: emDias(60) },
    my_entitlements: direitos({ cloud: true, trial: { ends_at: emDias(60), active: true } }),
    list_plans: PLANOS, vault_status: COFRE,
  } });
  assert.ok(p.chamadas.indexOf("claim_referral") >= 0 && p.chamadas.indexOf("claim_referral") < p.chamadas.indexOf("claim_trial"), p.chamadas.join());
  assert.deepEqual(JSON.parse(p.corpos.claim_referral), { p_code: "ABCD2345" });
  assert.equal(await p.evaluate(() => localStorage.getItem("arqevon-convite")), null, "código usado sai do aparelho");
  assert.match(await texto(p, "#webAvisoTexto"), /ganhou 60 dias de Pro grátis/);
  await p.fechar();
});

test("Sua conta mostra o link de convite e os números", async () => {
  const p = await abrirLogado({ rpc: {
    claim_trial: { ok: true, status: "not_eligible" },
    my_entitlements: direitos({ cloud: true, sub: { plan: "pro_mensal", status: "active", current_period_end: emDias(20) } }),
    list_plans: PLANOS, vault_status: COFRE,
    my_referral: { ok: true, code: "QWER7890", convidados: 3, assinaram: 1 },
  } });
  await p.click("#webAbrirConta");
  await p.waitForFunction(() => !document.querySelector("#wcIndique").hidden, { timeout: 5000 });
  assert.equal(await p.$eval("#wcIndiqueLink", e => e.value), "https://app.arqevoncode.com.br/?convite=QWER7890");
  assert.equal(await texto(p, "#wcIndiqueNumeros"), "3 amigos entraram pelo seu convite · 1 assinou");
  await p.fechar();
});

test("sem conta não mostra indique e ganhe", async () => {
  const p = await amb.abrir({ dados: VAZIO() });
  await p.click("#webAbrirConta"); await espera(300);
  assert.ok(await p.$eval("#wcIndique", e => e.hidden));
  await p.fechar();
});
