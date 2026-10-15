// Supabase falso em memória (contas, cofre, login por código), escrito na 3ª rodada de testes exploratórios. Intercepta *.supabase.co
// e licencas.* no navegador: nada sai da máquina.
import { servir, navegador, HOJE, espera, VAZIO } from "./ambiente.mjs";

const agora = new Date(HOJE).getTime();
export const emDias = d => new Date(agora + d * 86400000).toISOString();
export const PLANOS = [
  { id: "pro_fundador", name: "Pro Fundador", price_cents: 990, interval: "month", slots_left: 37 },
  { id: "pro_mensal", name: "Pro mensal", price_cents: 1490, interval: "month", slots_left: null },
  { id: "pro_anual", name: "Pro anual", price_cents: 11900, interval: "year", slots_left: null },
];

export function jwt(uid, email) {
  const b = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ sub: uid, email, role: "authenticated", exp: Math.floor(agora / 1000) + 3600 })}.x`;
}
export const sessao = (uid, email) => ({ access_token: jwt(uid, email), refresh_token: "r-" + uid, token_type: "bearer", expires_in: 3600,
  expires_at: Math.floor(agora / 1000) + 3600, user: { id: uid, email, aud: "authenticated", role: "authenticated" } });

/** Estado do "banco": contas (uid → {email, cloud, vault, direitos...}). */
export function banco() {
  const contas = new Map();
  return {
    contas,
    conta(uid, email, o = {}) { contas.set(uid, { uid, email, cloud: true, vault: null, sub: null, trial: null, extra: {}, ...o }); return contas.get(uid); },
    porEmail(email) { return [...contas.values()].find(c => c.email === email); },
    vivos(uid) { const v = contas.get(uid)?.vault; return v ? [...v.itens.values()].filter(i => !i.deleted).length : 0; },
    /** Mesmas regras da rota /api/v1/vault/key: devolve [status, corpo]. */
    chave(uid, corpo) {
      const v = contas.get(uid)?.vault;
      if (!v) return [404, { ok: false, code: "VAULT_NOT_FOUND", message: "Esta conta ainda não tem dados na nuvem." }];
      const kid = v.key_params?.kid;
      const pendente = [200, { ok: false, code: "KEY_PENDING", message: "Abra o app uma vez no aparelho onde você já usa a nuvem para concluir a atualização." }];
      if (!kid) return pendente;
      if (v.custodia?.kid === kid) return [200, { ok: true, kid, dek: v.custodia.dek }];
      if (corpo.dek && corpo.kid === kid && atob(corpo.dek).length === 32) { v.custodia = { kid, dek: corpo.dek }; return [200, { ok: true, kid, stored: true }]; }
      return pendente;
    },
    rpc(uid, fn, args) {
      const c = contas.get(uid);
      if (!c) return { ok: false, code: "NOT_AUTHENTICATED" };
      if (fn in c.extra) return typeof c.extra[fn] === "function" ? c.extra[fn](args) : c.extra[fn];
      const v = c.vault;
      switch (fn) {
        case "claim_trial": return { ok: true, status: "not_eligible" };
        case "list_plans": return PLANOS;
        case "my_entitlements": return { ok: true, entitlements: [{ product: "finance", feature: "use" }, ...(c.cloud ? [{ product: "finance", feature: "cloud" }] : [])], subscription: c.sub, trial: c.trial };
        case "my_referral": return { ok: true, code: "QWER7890", convidados: 0, assinaram: 0 };
        case "claim_referral": return { ok: true, status: "referred" };
        case "vault_status": return v ? { ok: true, entitled: c.cloud, exists: true, key_params: v.key_params, wrapped_key: v.wrapped_key, recovery_wrapped_key: v.recovery_wrapped_key, key_version: v.key_version }
          : { ok: true, entitled: c.cloud, exists: false };
        case "vault_create":
          if (!c.cloud) return { ok: false, code: "NOT_ENTITLED", message: "A sincronização exige uma assinatura ativa vinculada a esta conta." };
          if (v) return { ok: false, code: "VAULT_EXISTS", message: "Esta conta já tem dados na nuvem." };
          c.vault = { key_params: args.p_key_params, wrapped_key: args.p_wrapped_key, recovery_wrapped_key: args.p_recovery_wrapped_key, key_version: 1, last_rev: 0, itens: new Map() };
          return { ok: true };
        case "vault_rekey":
          if (!v) return { ok: false, code: "VAULT_NOT_FOUND", message: "Esta conta ainda não tem dados na nuvem." };
          if (args.p_expected_version !== v.key_version) return { ok: false, code: "KEY_VERSION_CONFLICT", message: "A senha foi alterada em outro dispositivo. Abra os dados com a senha nova." };
          Object.assign(v, { key_params: args.p_key_params, wrapped_key: args.p_wrapped_key, recovery_wrapped_key: args.p_recovery_wrapped_key, key_version: v.key_version + 1 });
          return { ok: true, key_version: v.key_version };
        case "vault_rotate":
          if (!v) return { ok: false, code: "VAULT_NOT_FOUND", message: "Esta conta ainda não tem dados na nuvem." };
          if (!c.cloud) return { ok: false, code: "NOT_ENTITLED", message: "A sincronização exige uma assinatura ativa vinculada a esta conta." };
          if (args.p_expected_version !== v.key_version) return { ok: false, code: "KEY_VERSION_CONFLICT", message: "A chave da nuvem foi trocada em outro aparelho." };
          Object.assign(v, { key_params: args.p_key_params, wrapped_key: args.p_wrapped_key, recovery_wrapped_key: args.p_recovery_wrapped_key, key_version: v.key_version + 1, last_rev: 0 });
          v.itens.clear();
          v.custodia = null;
          return { ok: true, key_version: v.key_version };
        case "vault_delete": c.vault = null; return { ok: true, deleted: !!v };
        case "vault_push": {
          if (v && args.p_key_version != null && args.p_key_version !== v.key_version) return { ok: false, code: "KEY_CHANGED", message: "A chave da nuvem foi trocada em outro aparelho. Libere este aparelho de novo." };
          if (!c.cloud) return { ok: false, code: "NOT_ENTITLED", message: "A sincronização exige uma assinatura ativa vinculada a esta conta." };
          if (!v) return { ok: false, code: "VAULT_NOT_FOUND", message: "x" };
          if (c.quota) return { ok: false, code: "QUOTA_EXCEEDED", message: "O limite de armazenamento na nuvem desta conta foi atingido." };
          const from = v.last_rev;
          for (const it of args.p_items) { v.last_rev++; v.itens.set(it.id, { id: it.id, rev: v.last_rev, deleted: !!it.deleted, ct: it.deleted ? null : it.ct }); }
          return { ok: true, from_rev: from, last_rev: v.last_rev };
        }
        case "vault_pull": {
          if (!v) return { ok: false, code: "VAULT_NOT_FOUND", message: "x" };
          const lista = [...v.itens.values()].filter(i => i.rev > args.p_since).sort((a, b) => a.rev - b.rev).slice(0, args.p_limit);
          const until = lista.length ? lista.at(-1).rev : args.p_since;
          return { ok: true, items: lista.map(({ id, rev, deleted, ct }) => ({ id, rev, deleted, ct })), until, has_more: until < v.last_rev, last_rev: v.last_rev, key_version: v.key_version };
        }
        default: return { ok: true };
      }
    },
  };
}

const uidDoToken = h => {
  const t = (h || "").replace(/^Bearer /i, "");
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url")).sub; } catch { return null; }
};

/**
 * Liga a página ao banco falso. `p.offline = true` derruba as chamadas; `p.otp` controla o login
 * por código: { [email]: "123456" } e `p.otpErro` força uma resposta de erro.
 */
export async function ligar(p, db) {
  p.chamadas = [];
  p.corpos = []; // corpo de cada chamada RPC, para provar o que (não) vai ao servidor
  p.otp = {};
  p.offline = false;
  await p.setRequestInterception(true);
  p.on("request", req => {
    const u = new URL(req.url());
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    if (!u.hostname.endsWith("supabase.co") && !u.hostname.startsWith("licencas.")) return req.continue();
    if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors });
    if (p.offline) return req.abort("internetdisconnected");
    const json = (status, corpo) => req.respond({ status, contentType: "application/json", headers: cors, body: JSON.stringify(corpo) });
    const corpo = (() => { try { return JSON.parse(req.postData() || "{}"); } catch { return {}; } })();
    const uid = uidDoToken(req.headers().authorization);
    if (u.hostname.startsWith("licencas.") && u.pathname === "/api/v1/vault/key") {
      p.chamadas.push("vault_key");
      p.corpos.push("vault_key " + (req.postData() || ""));
      if (db.tokenVencido > 0) { db.tokenVencido--; return json(401, { ok: false, code: "AUTH_INVALID", message: "Sessão expirada. Entre na sua conta novamente." }); }
      if (db.falharChave) return json(503, { ok: false, code: "SERVER_ERROR", message: "Não foi possível abrir a nuvem agora. Tente de novo." });
      const [st, resp] = db.chave(uid, corpo);
      return json(st, resp);
    }
    if (u.hostname.startsWith("licencas.")) { p.chamadas.push("checkout"); return json(p.checkout?.status || 200, p.checkout?.corpo || { checkoutUrl: "about:blank#pago" }); }
    if (u.pathname === "/auth/v1/otp") {
      p.chamadas.push("otp:" + corpo.email);
      if (p.otpErro) return json(p.otpErro.status, p.otpErro.corpo);
      return json(200, {});
    }
    if (u.pathname === "/auth/v1/verify") {
      p.chamadas.push("verify:" + corpo.token);
      if (p.otpErro) return json(p.otpErro.status, p.otpErro.corpo);
      const c = db.porEmail(corpo.email);
      if (!c || p.otp[corpo.email] !== corpo.token) return json(403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
      return json(200, sessao(c.uid, c.email));
    }
    if (u.pathname === "/auth/v1/logout") { p.chamadas.push("logout"); return req.respond({ status: 204, headers: cors }); }
    if (u.pathname === "/auth/v1/user") { const c = db.contas.get(uid); return json(200, { id: uid, email: c?.email, aud: "authenticated", role: "authenticated" }); }
    if (u.pathname === "/auth/v1/token") {
      // renovação de sessão (só quando o teste liga): o refresh_token é "r-<uid>"
      const alvo = String(corpo.refresh_token || "").replace(/^r-/, "");
      if (db.renovarSessao && db.contas.get(alvo)) { p.chamadas.push("refresh"); return json(200, sessao(alvo, db.contas.get(alvo).email)); }
      return json(400, { error: "invalid_grant" });
    }
    const fn = u.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)?.[1];
    if (fn) {
      p.chamadas.push(fn);
      p.corpos.push(fn + " " + (req.postData() || ""));
      if (p.falhar?.[fn]) return json(p.falhar[fn].status || 500, p.falhar[fn].corpo || { message: "erro" });
      return json(200, db.rpc(uid, fn, corpo));
    }
    return json(200, {});
  });
}

/** Abre um contexto limpo já ligado ao banco falso. `uid` = sessão inicial (ou null = tela de login). */
export async function abrirApp(browser, url, db, { uid = null, dados = null, vp = { width: 1300, height: 950 }, extra = {}, ctx = null, respostas = [] } = {}) {
  const contexto = ctx || await browser.createBrowserContext();
  const p = await contexto.newPage();
  await p.setViewport(vp);
  await p.setBypassServiceWorker(true);
  p.erros = []; p.vistos = []; p.respostas = [...respostas]; // respostas programadas valem já no carregamento
  p.on("pageerror", e => p.erros.push(e.message));
  p.on("console", m => { if (m.type() === "error") p.erros.push("console: " + m.text()); });
  p.on("dialog", async d => {
    p.vistos.push(`${d.type()}: ${d.message()}`);
    const r = p.respostas.shift();
    if (r === false) await d.dismiss(); else await d.accept(typeof r === "string" ? r : undefined);
  });
  await p.evaluateOnNewDocument(iso => {
    let t = new Date(iso).getTime(); const D = Date;
    window.Date = class extends D { constructor(...a) { a.length ? super(...a) : super(t); } static now() { return t++; } };
  }, HOJE);
  await ligar(p, db);
  if (!ctx) {
    await p.goto(url);
    await p.evaluate((d, s, x) => {
      localStorage.clear();
      localStorage.setItem("meu-financeiro-v1-seg", JSON.stringify({ convite: true }));
      if (d) localStorage.setItem("meu-financeiro-v1", JSON.stringify(d));
      if (s) localStorage.setItem("arqevon-auth", JSON.stringify(s));
      for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
    }, dados, uid ? sessao(uid, db.contas.get(uid).email) : null, extra);
  }
  await p.goto(url);
  await p.waitForSelector("#formLanc");
  await espera(600);
  p.fechar = () => contexto.close();
  p.contexto = contexto;
  return p;
}

export async function entrarPorCodigo(p, email, codigo = "123456") {
  p.otp[email] = codigo;
  await p.$eval("#wlEmail", e => { e.value = ""; });
  await p.type("#wlEmail", email);
  await p.click("#wlEnviar");
  await p.waitForFunction(() => !document.querySelector("#wlPasso2").hidden, { timeout: 5000 });
  await p.type("#wlCodigo", codigo);
  await p.click("#wlEntrar");
  await espera(1200);
}

export async function sair(p) {
  await p.click("#webAbrirConta");
  await p.waitForFunction(() => document.querySelector("#webConta").open);
  await espera(300);
  await p.click("#wcSair");
  await p.waitForFunction(() => !document.querySelector("#webLogin").hidden, { timeout: 5000 });
  await espera(300);
}

export async function abrirConta(p) {
  await p.evaluate(() => { if (!document.querySelector("#webConta").open) document.querySelector("#webAbrirConta").click(); });
  await p.waitForFunction(() => document.querySelector("#webConta").open);
  await espera(500);
}

/** Conta com o Pro: a nuvem liga sozinha. Espera sincronizar e a chave chegar ao servidor. */
export async function criarNuvemUI(p) {
  await p.waitForFunction(() => /Sincronizado/.test(document.querySelector("#wnStatus").textContent), { timeout: 20000 });
  // a chave segue para o servidor logo depois da primeira sincronização
  for (let i = 0; i < 50; i++) {
    const entregue = await p.evaluate(() => new Promise(ok => { const r = indexedDB.open("arqevon"); r.onsuccess = () => { const g = r.result.transaction("chaves").objectStore("chaves").getAll(); g.onsuccess = () => ok(g.result.some(x => x.entregue)); }; }));
    if (entregue) return;
    await espera(100);
  }
  throw new Error("a chave não foi entregue ao servidor");
}

/** Aparelho sem as chaves: abrir "Sua conta" basta; espera sincronizar. */
export async function abrirNuvemUI(p) {
  await abrirConta(p);
  await p.waitForFunction(() => /Sincronizado|Cancelado|Não foi|Aguardando a chave/.test(document.querySelector("#wnStatus").textContent), { timeout: 20000 });
}

export const lerLocal = p => p.evaluate(() => JSON.parse(localStorage.getItem("meu-financeiro-v1") || "null"));
export const lanc = (id, descricao, valor = 10) => ({ id, tipo: "despesa", descricao, valor, categoria: "outros", data: "2026-10-05" });
export { servir, navegador, espera, VAZIO };
