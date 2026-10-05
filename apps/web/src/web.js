import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, LICENSE_API } from "./config.js";
import { criarNuvem } from "./nuvem.js";

// ARQEVON_BILLING é fixado no build (scripts/build.mjs). Desligado, o Pro aparece como "em breve":
// o plano só é vendido quando a sincronização existir.
/* global ARQEVON_BILLING */
const VENDER_PRO = ARQEVON_BILLING === true;
const MODO_LOCAL = "arqevon-web-local"; // "Usar sem conta"
const $ = id => document.getElementById(id);
const raiz = document.documentElement;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "arqevon-auth" },
});

const ICONES = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  lancamentos: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  objetivos: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};
const ICONE_CONTA = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

const brl = centavos => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = iso => new Date(iso).toLocaleDateString("pt-BR");

let estado = { modo: null, email: null, uid: null, direitos: null, planos: [] };

const nuvem = criarNuvem({ supabase, aoMudar: () => atualizarConta() });

// ---------- Layout ----------
function montarLayout() {
  const app = document.querySelector(".app");
  const abas = $("abas");
  const topo = document.querySelector("header.topo");
  if (!app || !abas || !topo || app.classList.contains("web-shell")) return;

  abas.querySelectorAll("button[data-aba]").forEach(b => {
    if (ICONES[b.dataset.aba]) b.insertAdjacentHTML("afterbegin", ICONES[b.dataset.aba]);
  });

  const lateral = document.createElement("aside");
  lateral.className = "web-lateral";
  const logo = topo.querySelector(".marca .logo")?.innerHTML || "";
  lateral.innerHTML = `<div class="web-marca"><span class="logo">${logo}</span><strong>Arqevon Finance</strong></div>`;
  lateral.appendChild(abas);
  lateral.insertAdjacentHTML("beforeend",
    '<div class="web-cartao"><span class="web-quem" id="webQuem"></span><span class="web-plano" id="webPlano"></span><button type="button" id="webAbrirConta">Sua conta</button></div>');
  app.prepend(lateral);
  app.classList.add("web-shell");

  const botaoConta = document.createElement("button");
  botaoConta.type = "button";
  botaoConta.className = "web-conta-topo";
  botaoConta.setAttribute("aria-label", "Sua conta");
  botaoConta.innerHTML = ICONE_CONTA;
  topo.insertBefore(botaoConta, $("btnTema"));

  // No celular as abas viram barra inferior: elas precisam estar fora do <aside>, que some.
  const celular = matchMedia("(max-width: 960px)");
  const reposicionar = () => {
    if (celular.matches && abas.parentElement !== app) app.appendChild(abas);
    if (!celular.matches && abas.parentElement !== lateral) lateral.insertBefore(abas, lateral.querySelector(".web-cartao"));
  };
  celular.addEventListener("change", reposicionar);
  reposicionar();

  $("webAbrirConta").addEventListener("click", abrirConta);
  botaoConta.addEventListener("click", abrirConta);
}

// ---------- Conta e plano ----------
function planoAtual() {
  const sub = estado.direitos?.subscription;
  const temNuvem = estado.direitos?.entitlements?.some(e => e.product === "finance" && e.feature === "cloud");
  return { sub, pro: !!temNuvem };
}

function atualizarCartao() {
  const local = estado.modo === "local";
  const { pro } = planoAtual();
  $("webQuem").textContent = local ? "Sem conta" : estado.email || "";
  $("webPlano").textContent = local ? "Dados só neste navegador"
    : nuvem.ativa() ? `Pro · ${nuvem.texto() || "nuvem ativa"}`
    : pro ? "Plano Pro" : "Plano Grátis";
}

function atualizarConta() {
  const local = estado.modo === "local";
  const { sub, pro } = planoAtual();
  atualizarCartao();
  $("wcEmail").textContent = local
    ? "Você está usando sem conta: os dados ficam só neste navegador."
    : nuvem.ativa() ? `${estado.email} · seus dados estão na nuvem, criptografados.`
    : `${estado.email} · seus lançamentos ficam neste navegador.`;
  $("wcGratis").classList.toggle("wc-atual", !pro);
  $("wcPro").classList.toggle("wc-atual", pro);
  $("wcSair").textContent = local ? "Voltar ao login" : "Sair";

  const mensal = estado.planos.find(p => p.interval === "month");
  $("wcProPreco").innerHTML = mensal ? `${brl(mensal.price_cents)}<small>/mês</small>` : "—";

  const status = $("wcProStatus");
  status.hidden = !pro && (!sub || sub.status === "pending");
  if (pro && (!sub || sub.status === "pending")) status.textContent = "Ativo";
  if (sub?.status === "active") status.textContent = `Ativo · renova em ${dataBr(sub.current_period_end)}`;
  if (sub?.status === "past_due") status.textContent = "Pagamento pendente: regularize para não perder o Pro.";
  if (sub?.status === "canceled" && pro) status.textContent = `Cancelado · acesso até ${dataBr(sub.current_period_end)}`;
  if (sub?.status === "canceled" && !pro) status.hidden = true;

  $("wcAssinar").hidden = !VENDER_PRO || local || pro;
  $("wcBreve").hidden = VENDER_PRO || pro;
  if (VENDER_PRO && !local && !pro) montarCiclos();
}

function montarCiclos() {
  const caixa = $("wcCiclos");
  if (caixa.childElementCount) return;
  estado.planos.forEach((p, i) => {
    const rotulo = p.interval === "month"
      ? `<b>Mensal</b> · ${brl(p.price_cents)}/mês no cartão, renova sozinho`
      : `<b>Anual</b> · ${brl(p.price_cents)}/ano no Pix, boleto ou cartão`;
    caixa.insertAdjacentHTML("beforeend",
      `<label class="wc-ciclo"><input type="radio" name="wcPlano" value="${p.id}" ${i === 0 ? "checked" : ""}><span>${rotulo}</span></label>`);
  });
}

async function carregarConta() {
  const [planos, direitos] = await Promise.all([
    supabase.rpc("list_plans"),
    estado.modo === "conta" ? supabase.rpc("my_entitlements") : Promise.resolve({ data: null }),
  ]);
  if (!planos.error) estado.planos = planos.data || [];
  if (!direitos.error) estado.direitos = direitos.data;
  atualizarConta();
}

function abrirConta() {
  $("webConta").showModal();
  carregarConta();
  if (estado.modo === "conta") nuvem.atualizar(); else $("wcNuvem").hidden = true;
}

// ---------- Entrar e sair ----------
function liberarApp() {
  $("webLogin").hidden = true;
  // "desktop-bloqueado" é o sinal que o motor espera para abrir o convite de criptografia.
  raiz.classList.remove("web-bloqueado", "desktop-bloqueado");
  atualizarConta();
  carregarConta();
  if (estado.modo === "conta" && estado.uid) nuvem.entrar(estado.uid);
}

function mostrarLogin() {
  $("wlPasso1").hidden = false;
  $("wlPasso2").hidden = true;
  $("wlErro").hidden = true;
  $("wlErro1").hidden = true;
  $("webLogin").hidden = false;
  raiz.classList.add("web-bloqueado", "desktop-bloqueado");
  setTimeout(() => $("wlEmail").focus(), 0);
}

function erro(id, msg) { const el = $(id); el.textContent = msg; el.hidden = !msg; }

function mensagemAuth(e) {
  const m = String(e?.message || "");
  if (e?.status === 429 || /rate limit|security purposes/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (/expired|invalid/i.test(m)) return "Código incorreto ou expirado. Confira ou peça um novo.";
  return "Não foi possível continuar agora. Verifique a internet e tente de novo.";
}

$("wlPasso1").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("wlEmail").value.trim().toLowerCase();
  const botao = $("wlEnviar");
  botao.disabled = true; botao.textContent = "Enviando…"; erro("wlErro1", "");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  botao.disabled = false; botao.textContent = "Receber código";
  if (error) { erro("wlErro1", mensagemAuth(error)); return; }
  $("wlEmailMostra").textContent = email;
  $("wlPasso1").hidden = true;
  $("wlPasso2").hidden = false;
  $("wlCodigo").value = "";
  $("wlCodigo").focus();
});

$("wlCodigo").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6); });

$("wlPasso2").addEventListener("submit", async e => {
  e.preventDefault();
  const token = $("wlCodigo").value;
  if (!/^\d{6}$/.test(token)) { erro("wlErro", "O código tem 6 números."); return; }
  const botao = $("wlEntrar");
  botao.disabled = true; botao.textContent = "Entrando…"; erro("wlErro", "");
  const { data, error } = await supabase.auth.verifyOtp({ email: $("wlEmailMostra").textContent, token, type: "email" });
  botao.disabled = false; botao.textContent = "Entrar";
  if (error || !data?.session) { erro("wlErro", mensagemAuth(error)); return; }
  localStorage.removeItem(MODO_LOCAL);
  estado = { ...estado, modo: "conta", email: data.session.user.email, uid: data.session.user.id };
  liberarApp();
});

$("wlVoltar").addEventListener("click", mostrarLogin);
$("wlLocal").addEventListener("click", () => {
  localStorage.setItem(MODO_LOCAL, "1");
  estado = { ...estado, modo: "local", email: null, uid: null, direitos: null };
  liberarApp();
});

$("wcFechar").addEventListener("click", () => $("webConta").close());
$("wcSair").addEventListener("click", async () => {
  // Sair encerra a sessão da conta; os lançamentos continuam neste navegador (plano grátis é local).
  // As chaves da nuvem saem deste aparelho junto com a sessão.
  await nuvem.sair();
  if (estado.modo === "conta") await supabase.auth.signOut().catch(() => {});
  localStorage.removeItem(MODO_LOCAL);
  estado = { ...estado, modo: null, email: null, direitos: null };
  $("webConta").close();
  mostrarLogin();
});

// ---------- Assinar ----------
$("wcCpf").addEventListener("input", e => {
  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
  e.target.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

$("wcAssinar").addEventListener("submit", async e => {
  e.preventDefault();
  const plano = document.querySelector('input[name="wcPlano"]:checked')?.value;
  const botao = $("wcIrPagar");
  botao.disabled = true; botao.textContent = "Gerando cobrança…"; erro("wcErro", "");
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw Object.assign(new Error("Sessão expirada. Entre de novo."), { visivel: true });
    const r = await fetch(`${LICENSE_API}/api/v1/billing/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ plan: plano, cpf: $("wcCpf").value }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.checkoutUrl) throw Object.assign(new Error(j.error || "Pagamento indisponível agora."), { visivel: true });
    window.location.assign(j.checkoutUrl);
  } catch (err) {
    erro("wcErro", err.visivel ? err.message : "Não foi possível abrir o pagamento. Tente de novo.");
    botao.disabled = false; botao.textContent = "Ir para o pagamento";
  }
});

// Ao voltar da página de pagamento, o plano pode ter mudado.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && estado.modo === "conta") carregarConta();
});

// ---------- Início ----------
montarLayout();
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  estado = { ...estado, modo: "conta", email: session.user.email, uid: session.user.id };
  liberarApp();
} else if (localStorage.getItem(MODO_LOCAL) === "1") {
  estado = { ...estado, modo: "local" };
  liberarApp();
} else {
  mostrarLogin();
}
supabase.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT" && estado.modo === "conta") { nuvem.sair(); estado = { ...estado, modo: null, uid: null }; mostrarLogin(); }
});
