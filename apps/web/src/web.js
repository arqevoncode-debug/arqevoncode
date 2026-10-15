import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, LICENSE_API } from "./config.js";
import { criarNuvem } from "./nuvem.js";

// ARQEVON_BILLING é fixado no build (scripts/build.mjs). Desligado, o Pro aparece como "em breve":
// o plano só é vendido quando a sincronização existir.
/* global ARQEVON_BILLING, ARQEVON_PAGAMENTO */
const VENDER_PRO = ARQEVON_BILLING === true;
const VIA_KIWIFY = ARQEVON_PAGAMENTO === "kiwify";
const MODO_LOCAL = "arqevon-web-local"; // "Usar sem conta"
const $ = id => document.getElementById(id);
const raiz = document.documentElement;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "arqevon-auth" },
});

const ICONES = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  lancamentos: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  relatorios: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  objetivos: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};
const ICONE_CONTA = '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

const brl = centavos => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = iso => new Date(iso).toLocaleDateString("pt-BR");
const diasAte = iso => Math.max(Math.ceil((new Date(iso) - Date.now()) / 86400000), 0);

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
  const trial = estado.direitos?.trial || null;
  const temNuvem = estado.direitos?.entitlements?.some(e => e.product === "finance" && e.feature === "cloud");
  const pago = sub && ["active", "past_due"].includes(sub.status);
  // Pro só por causa do teste grátis: continua podendo assinar.
  const soTeste = !!temNuvem && !!trial?.active && !pago;
  return { sub, pro: !!temNuvem, trial, soTeste };
}

function atualizarCartao() {
  const local = estado.modo === "local";
  const { pro, trial, soTeste } = planoAtual();
  $("webQuem").textContent = local ? "Sem conta" : estado.email || "";
  const dias = soTeste ? diasAte(trial.ends_at) : 0;
  const rotuloTeste = `Pro grátis · ${dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`}`;
  $("webPlano").textContent = local ? "Dados só neste navegador"
    : nuvem.ativa() ? `${soTeste ? rotuloTeste : pro ? "Pro" : "Plano Grátis"} · ${nuvem.texto() || "nuvem ativa"}`
    : soTeste ? rotuloTeste
    : pro ? "Plano Pro" : "Plano Grátis";
}

// Plano que o motor usa para liberar os recursos do Pro. Guardado por conta para o app não
// piscar cadeados enquanto os direitos carregam.
const PLANO_CACHE = uid => `arqevon-plano:${uid}`;
function informarPlano(pro) {
  ponteMotor()?.definirPlano({ pro });
  if (estado.modo === "conta" && estado.uid) { try { localStorage.setItem(PLANO_CACHE(estado.uid), pro ? "pro" : "gratis"); } catch { /* sem armazenamento */ } }
}

function atualizarConta() {
  const local = estado.modo === "local";
  const { sub, pro, trial, soTeste } = planoAtual();
  // só a conta decide o plano; sem conta é grátis (e os testes podem ligar o Pro direto no motor)
  if (estado.modo === "conta" && estado.direitos) informarPlano(pro);
  atualizarCartao();
  $("wcEmail").textContent = local
    ? "Você está usando sem conta: os dados ficam só neste navegador."
    : nuvem.ativa() ? `${estado.email} · seus dados estão na nuvem, criptografados.`
    : `${estado.email} · seus lançamentos ficam neste navegador.`;
  $("wcGratis").classList.toggle("wc-atual", !pro);
  $("wcPro").classList.toggle("wc-atual", pro);
  $("wcSair").textContent = local ? "Voltar ao login" : "Sair";

  const mensal = planoMensal();
  $("wcProPreco").innerHTML = mensal ? `${brl(mensal.price_cents)}<small>/mês</small>` : "—";

  const status = $("wcProStatus");
  status.hidden = !pro && (!sub || sub.status === "pending");
  if (pro && (!sub || sub.status === "pending")) status.textContent = "Ativo";
  if (sub?.status === "active") status.textContent = `Ativo · renova em ${dataBr(sub.current_period_end)}`;
  if (sub?.status === "past_due") status.textContent = "Pagamento pendente: regularize para não perder o Pro.";
  if (sub?.status === "trialing") status.textContent = sub.current_period_end ? `Em teste até ${dataBr(sub.current_period_end)}` : "Em teste";
  // quem tem assinatura viva precisa saber onde trocar o cartão, regularizar ou cancelar
  $("wcGerenciar").hidden = local || !sub || !["active", "past_due", "trialing"].includes(sub.status);
  if (sub?.status === "canceled" && pro) status.textContent = `Cancelado · acesso até ${dataBr(sub.current_period_end)}`;
  if (sub?.status === "canceled" && !pro) status.hidden = true;
  if (soTeste) { status.hidden = false; status.textContent = `Teste grátis até ${dataBr(trial.ends_at)} · assine para continuar depois`; }
  const testeAcabou = !local && !pro && trial && !trial.active;
  if (testeAcabou) { status.hidden = false; status.textContent = "Seu teste grátis terminou. Seus dados na nuvem continuam guardados: assine para voltar a sincronizar."; }

  // cancelado com acesso até o fim do período também pode assinar de novo
  const podeAssinar = !local && (!pro || soTeste || sub?.status === "canceled") && estado.planos.length > 0;
  $("wcPlanosIndisponiveis").hidden = !VENDER_PRO || local || estado.planos.length > 0 || (pro && !soTeste);
  $("wcAssinar").hidden = !VENDER_PRO || !podeAssinar;
  $("wcBreve").hidden = VENDER_PRO || pro;
  if (VENDER_PRO && podeAssinar) montarCiclos();
  atualizarInstalar();
}

// Mensal "normal": o Fundador também é mensal, mas tem vagas limitadas.
function planoMensal() {
  return estado.planos.find(p => p.interval === "month" && p.slots_left == null) || estado.planos.find(p => p.interval === "month");
}

function montarCiclos() {
  const caixa = $("wcCiclos");
  // remonta sempre: as vagas do Fundador mudam; mantém o plano que estava escolhido
  const escolhido = document.querySelector('input[name="wcPlano"]:checked')?.value;
  caixa.innerHTML = "";
  estado.planos.forEach((p, i) => {
    // Formas de pagamento de cada gateway: a Kiwify aceita Pix e cartão nos dois ciclos.
    const mensal = planoMensal();
    const economia = mensal && p.interval === "year" ? mensal.price_cents * 12 - p.price_cents : 0;
    const vagas = p.slots_left == null ? "" : ` · ${p.slots_left === 1 ? "resta 1 vaga" : `restam ${p.slots_left} vagas`}`;
    const rotulo = p.slots_left != null
      ? `<b>Fundador</b> · ${brl(p.price_cents)}/mês para sempre, só para os primeiros assinantes${vagas}`
      : p.interval === "month"
      ? `<b>Mensal</b> · ${brl(p.price_cents)}/mês ${VIA_KIWIFY ? "no Pix ou cartão" : "no cartão"}, renova sozinho`
      : `<b>Anual</b> · ${brl(p.price_cents)}/ano ${VIA_KIWIFY ? "no Pix ou cartão em até 12x" : "no Pix, boleto ou cartão"}${economia > 0 ? ` · economize ${brl(economia)}` : ""}`;
    caixa.insertAdjacentHTML("beforeend",
      `<label class="wc-ciclo"><input type="radio" name="wcPlano" value="${p.id}" ${(escolhido && estado.planos.some(x => x.id === escolhido) ? p.id === escolhido : i === 0) ? "checked" : ""}><span>${rotulo}</span></label>`);
  });
}

// O teste grátis de 30 dias começa no primeiro login de uma conta elegível. O banco decide quem
// pode (uma vez por conta, nunca para quem já assinou); aqui só pedimos uma vez por sessão.
let testePedido = false;
async function pedirTeste() {
  if (testePedido || estado.modo !== "conta") return;
  testePedido = true;
  await usarConvite(); // antes do teste: quem veio por indicação ganha 60 dias
  const { data, error } = await supabase.rpc("claim_trial");
  if (!error && data?.status === "started") {
    avisoDaSessao = true;
    const dias = diasAte(data.ends_at);
    const nota = conviteRecusado ? " O convite usado não era válido para esta conta, então o teste ficou com o prazo normal." : "";
    avisar(`Você ganhou ${dias} dias de Pro grátis, sem cartão.${nota} Ative a nuvem em "Sua conta" para usar seus dados em qualquer aparelho.`, "Ativar a nuvem", abrirConta);
  }
}

// ---------- Indique e ganhe ----------
const CONVITE = "arqevon-convite";
const conviteDaUrl = new URLSearchParams(location.search).get("convite");
if (conviteDaUrl !== null) {
  if (/^[A-Za-z2-9]{8}$/.test(conviteDaUrl)) localStorage.setItem(CONVITE, conviteDaUrl.toUpperCase());
  // o endereço volta ao normal mesmo com um código mal formado
  const url = new URL(location.href); url.searchParams.delete("convite");
  history.replaceState(null, "", url.pathname + url.search + url.hash);
}
let conviteRecusado = false; // o convite não valeu: o aviso do teste explica
async function usarConvite() {
  const codigo = localStorage.getItem(CONVITE);
  if (!codigo) return;
  const { data, error } = await supabase.rpc("claim_referral", { p_code: codigo });
  if (error) return; // erro de rede: tenta na próxima
  localStorage.removeItem(CONVITE);
  conviteRecusado = data?.status !== "referred" && data?.status !== "already_referred";
}
function voltaRotulo(botao, temporario, normal) {
  botao.textContent = temporario;
  setTimeout(() => { botao.textContent = normal; }, 2500);
}
let indicacao = null;
async function carregarIndicacao() {
  const sec = $("wcIndique");
  if (estado.modo !== "conta") { sec.hidden = true; return; }
  const { data, error } = await supabase.rpc("my_referral");
  if (error || !data?.ok) { sec.hidden = true; return; }
  indicacao = data;
  sec.hidden = false;
  $("wcIndiqueLink").value = linkConvite();
  $("wcIndiqueNumeros").textContent = data.convidados
    ? `${data.convidados} ${data.convidados === 1 ? "amigo entrou" : "amigos entraram"} pelo seu convite · ${data.assinaram} ${data.assinaram === 1 ? "assinou" : "assinaram"}`
    : "Ninguém entrou pelo seu convite ainda.";
}
const linkConvite = () => `https://app.arqevoncode.com.br/?convite=${indicacao?.code || ""}`;
$("wcIndiqueCopiar").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(linkConvite()); voltaRotulo($("wcIndiqueCopiar"), "Link copiado", "Copiar link"); }
  catch { $("wcIndiqueLink").select(); }
});
$("wcIndiqueCompartilhar").hidden = !navigator.share;
$("wcIndiqueCompartilhar").addEventListener("click", () => {
  navigator.share?.({ title: "Arqevon Finance", text: "Organizo minhas contas no Arqevon Finance. Entrando por este link você ganha 60 dias de Pro grátis:", url: linkConvite() }).catch(() => {});
});

function avisar(texto, acao, aoClicar) {
  const el = $("webAviso");
  $("webAvisoTexto").textContent = texto;
  $("webAvisoAcao").textContent = acao || "";
  $("webAvisoAcao").hidden = !acao;
  $("webAvisoAcao").onclick = () => { el.hidden = true; aoClicar?.(); };
  el.hidden = false;
}
$("webAvisoFechar").addEventListener("click", () => { $("webAviso").hidden = true; });

async function carregarConta() {
  await pedirTeste();
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
  carregarIndicacao();
  if (estado.modo === "conta") nuvem.atualizar(); else $("wcNuvem").hidden = true;
}

// ---------- Entrar e sair ----------
// Dono dos lançamentos deste navegador (a mesma marca que a nuvem usa).
const DONO_DADOS = "arqevon-sync-dono";
const ponteMotor = () => window.ArqevonFinanceBridge;

/** Antes de mostrar qualquer dado: lançamentos de outra conta neste navegador não aparecem sem pergunta. */
async function conferirDono() {
  if (estado.modo !== "conta" || !estado.uid) return true;
  let dono = null;
  try { dono = localStorage.getItem(DONO_DADOS); } catch { return true; }
  if (dono && dono !== estado.uid && ponteMotor()?.temDados()) {
    const ok = await ponteMotor().escolher("Lançamentos de outra conta",
      "Este navegador tem lançamentos de outra conta. Para entrar com esta, eles serão apagados deste navegador. Se a outra conta usa a nuvem, os dados dela continuam lá.",
      "Apagar e entrar", "", true);
    if (!ok) return false;
    ponteMotor().apagarTudo();
  }
  try { localStorage.setItem(DONO_DADOS, estado.uid); } catch { /* armazenamento bloqueado */ }
  return true;
}

async function liberarApp() {
  if (!(await conferirDono())) {
    // não quis apagar os dados da outra conta: volta ao login sem entrar
    await supabase.auth.signOut().catch(() => {});
    estado = { ...estado, modo: null, email: null, uid: null, direitos: null };
    mostrarLogin();
    return;
  }
  if (estado.modo === "conta" && estado.uid) {
    let cache = null;
    try { cache = localStorage.getItem(PLANO_CACHE(estado.uid)); } catch { /* sem armazenamento */ }
    ponteMotor()?.definirPlano({ pro: cache === "pro" });
  }
  $("webLogin").hidden = true;
  // "desktop-bloqueado" é o sinal que o motor espera para abrir o convite de criptografia.
  raiz.classList.remove("web-bloqueado", "desktop-bloqueado");
  atualizarConta();
  // Os avisos esperam a conta e a nuvem: sem isso, quem já sincroniza ouviria "dados só aqui".
  Promise.all([carregarConta(), estado.modo === "conta" && estado.uid ? nuvem.entrar(estado.uid) : null])
    .then(verificarAvisos).catch(() => {});
}

// ---------- Avisos no momento certo ----------
const PRIMEIRO_USO = "arqevon-primeiro-uso";
const AVISO_LOCAL = "arqevon-aviso-dados-locais";
const AVISO_FIM_TESTE = "arqevon-aviso-fim-teste";
const DIA = 86400000;
let avisoDaSessao = false; // no máximo um aviso por visita
const lerNumero = k => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
function registrosNoAparelho() {
  try {
    const d = window.MyFinanceBridge?.obterDados();
    return ["lancamentos", "fixos", "parcelamentos", "objetivos"].reduce((s, c) => s + (d?.[c]?.length || 0), 0);
  } catch { return 0; }
}
function irParaLogin() {
  // os lançamentos continuam neste navegador; ao criar a conta, podem ir para a nuvem
  localStorage.removeItem(MODO_LOCAL);
  ponteMotor()?.definirPlano({ pro: false });
  estado = { ...estado, modo: null, email: null, uid: null, direitos: null };
  mostrarLogin();
}
function verificarAvisos() {
  if (avisoDaSessao || !estado.modo || !$("webAviso").hidden) return;
  const agora = Date.now();
  if (!lerNumero(PRIMEIRO_USO)) localStorage.setItem(PRIMEIRO_USO, String(agora));
  const { pro, trial, soTeste } = planoAtual();

  if (estado.modo === "conta" && nuvem.pedeSenha()) {
    avisoDaSessao = true;
    avisar("Sua conta já tem dados na nuvem. Para abri-los aqui, aprove este aparelho onde você já usa o app.", "Abrir meus dados", abrirConta);
    return;
  }
  if (soTeste && diasAte(trial.ends_at) <= 3 && localStorage.getItem(AVISO_FIM_TESTE) !== trial.ends_at) {
    const dias = diasAte(trial.ends_at);
    localStorage.setItem(AVISO_FIM_TESTE, trial.ends_at);
    avisoDaSessao = true;
    avisar(`Seu Pro grátis termina ${dias <= 0 ? "hoje" : dias === 1 ? "amanhã" : `em ${dias} dias`}. Depois, a nuvem pausa e voltam os limites do grátis (5 parcelados ativos, 6 meses de histórico, 1 objetivo, sem relatórios nem importação de extrato). Nada é apagado.`,
      VENDER_PRO ? "Ver planos" : "", abrirConta);
    return;
  }
  // Dados só neste navegador há uma semana: o argumento mais honesto para a nuvem.
  const soAqui = estado.modo === "local" || !nuvem.ativa();
  if (soAqui && agora - lerNumero(PRIMEIRO_USO) >= 7 * DIA && registrosNoAparelho() >= 10 && agora - lerNumero(AVISO_LOCAL) >= 14 * DIA) {
    localStorage.setItem(AVISO_LOCAL, String(agora));
    avisoDaSessao = true;
    if (estado.modo === "local") avisar("Seus lançamentos estão só neste navegador: se ele for limpo ou você trocar de aparelho, eles se perdem. Crie uma conta para guardar uma cópia cifrada na nuvem.", "Criar conta", irParaLogin);
    else if (pro) avisar("Seus lançamentos estão só neste aparelho. Ative a nuvem para ter uma cópia cifrada e usar em qualquer aparelho.", "Ativar a nuvem", abrirConta);
    else avisar("Seus lançamentos estão só neste aparelho: se o navegador for limpo, eles se perdem. Com o Pro, ficam guardados na nuvem, cifrados.", VENDER_PRO ? "Conhecer o Pro" : "", abrirConta);
  }
}

// ---------- App instalável (PWA) ----------
let pedidoInstalar = null;
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
addEventListener("beforeinstallprompt", e => { e.preventDefault(); pedidoInstalar = e; atualizarInstalar(); });
addEventListener("appinstalled", () => { pedidoInstalar = null; atualizarInstalar(); });
function atualizarInstalar() {
  const sec = $("wcInstalar");
  if (instalado() || (!pedidoInstalar && !ehIOS)) { sec.hidden = true; return; }
  sec.hidden = false;
  $("wcInstalarBotao").hidden = !pedidoInstalar;
  $("wcInstalarTexto").textContent = pedidoInstalar
    ? "Instale o Arqevon Finance na tela inicial: abre como um app, em tela cheia, e funciona sem internet."
    : "No iPhone: toque em Compartilhar (o quadrado com a seta para cima) e depois em \"Adicionar à Tela de Início\".";
}
$("wcInstalarBotao").addEventListener("click", async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice.catch(() => {});
  pedidoInstalar = null;
  atualizarInstalar();
});
if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  // Versão nova publicada com o app aberto (PWA fica aberto por dias): oferece recarregar.
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (tinhaControle) avisar("Há uma versão nova do app.", "Recarregar", () => location.reload());
  });
}

function mostrarLogin() {
  const convidado = !!localStorage.getItem(CONVITE);
  $("wlAviso").hidden = !convidado;
  if (convidado) $("wlAviso").textContent = "Você foi convidado: crie sua conta e ganhe 60 dias de Pro grátis, sem cartão.";
  $("wlPasso1").hidden = false;
  $("wlPasso2").hidden = true;
  $("wlErro").hidden = true;
  $("wlErro1").hidden = true;
  $("webLogin").hidden = false;
  raiz.classList.add("web-bloqueado", "desktop-bloqueado");
  setTimeout(() => $("wlEmail").focus(), 0);
}

function erro(id, msg) { const el = $(id); el.textContent = msg; el.hidden = !msg; }

function mensagemAuth(e, passo = "codigo") {
  const m = String(e?.message || "");
  if (e?.status === 429 || /rate limit|security purposes/i.test(m)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  if (passo === "email" && (e?.status === 422 || /invalid|email/i.test(m))) return "Não conseguimos enviar para este e-mail. Confira se está escrito certo.";
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
  if (error) { erro("wlErro1", mensagemAuth(error, "email")); return; }
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
$("wlReenviar").addEventListener("click", async () => {
  const botao = $("wlReenviar");
  botao.disabled = true; erro("wlErro", "");
  const { error } = await supabase.auth.signInWithOtp({ email: $("wlEmailMostra").textContent, options: { shouldCreateUser: true } });
  if (error) { erro("wlErro", mensagemAuth(error, "email")); botao.disabled = false; return; }
  botao.textContent = "Código reenviado. Confira também o spam.";
  setTimeout(() => { botao.textContent = "Reenviar código"; botao.disabled = false; }, 30000);
});
$("wlLocal").addEventListener("click", () => {
  try { localStorage.setItem(MODO_LOCAL, "1"); }
  catch { erro("wlErro1", "Seu navegador está bloqueando o armazenamento deste site (acontece em algumas janelas anônimas ou com cookies bloqueados). Libere o armazenamento para usar o app."); return; }
  estado = { ...estado, modo: "local", email: null, uid: null, direitos: null };
  ponteMotor()?.definirPlano({ pro: false });
  liberarApp();
});

// "Conhecer o Pro" (limite do grátis, cadeado): com conta, abre os planos; sem conta, convida a criar
// uma, que já vem com 30 dias de Pro grátis.
addEventListener("arqevon:conhecer-pro", async () => {
  if (estado.modo === "conta") { abrirConta(); return; }
  const ok = await ponteMotor()?.escolher("Teste o Pro grátis",
    "Crie sua conta com o seu e-mail e ganhe 30 dias de Pro grátis, sem cartão. Seus lançamentos continuam aqui.",
    "Criar conta", "");
  if (ok) irParaLogin();
});

$("wcFechar").addEventListener("click", () => $("webConta").close());
$("wcSair").addEventListener("click", async () => {
  // Sair encerra a sessão. Com a nuvem em dia, os lançamentos saem deste navegador (estão na nuvem);
  // sem nuvem, a pessoa decide se ficam aqui. As chaves da nuvem sempre saem do aparelho.
  // Sem senha da nuvem, voltar depende de outro aparelho conectado ou da chave de recuperação.
  if (estado.modo === "conta" && nuvem.ativa() && !window.confirm("Ao sair, este aparelho deixa de abrir a nuvem. Para entrar de novo, você vai precisar liberar por outro aparelho conectado ou usar a chave de recuperação. Sair mesmo assim?")) return;
  if (estado.modo === "conta" && ponteMotor()?.temDados()) {
    const botao = $("wcSair");
    botao.disabled = true; botao.textContent = "Enviando para a nuvem…";
    const s = await nuvem.preparaSaida();
    botao.disabled = false; botao.textContent = "Sair";
    if (s.nuvem && s.enviado) {
      ponteMotor().apagarTudo();
      localStorage.removeItem(DONO_DADOS);
    } else {
      const motivo = s.nuvem
        ? "Algumas alterações ainda não chegaram à nuvem (sem internet?). Se apagar agora, elas se perdem."
        : "Seus lançamentos estão só neste navegador, porque a nuvem não está ligada.";
      const r = await ponteMotor().escolher("Sair da conta",
        `${motivo} Quer mantê-los aqui? Quem usar este navegador sem conta poderá vê-los.`,
        "Manter neste navegador", "Apagar deste navegador");
      if (r === false) return; // cancelou: continua na conta
      if (r === "alternativa") { ponteMotor().apagarTudo(); localStorage.removeItem(DONO_DADOS); }
    }
  }
  await nuvem.sair();
  ponteMotor()?.definirPlano({ pro: false });
  if (estado.modo === "conta") await supabase.auth.signOut().catch(() => {});
  localStorage.removeItem(MODO_LOCAL);
  estado = { ...estado, modo: null, email: null, direitos: null };
  testePedido = false;
  avisoDaSessao = false;
  $("webConta").close();
  mostrarLogin();
});

// ---------- Assinar ----------
// Na Kiwify o CPF é pedido na página de pagamento dela; só o Asaas precisa dele aqui.
if (VIA_KIWIFY) {
  $("wcCpfCampo").hidden = true;
  $("wcCpf").required = false;
  $("wcNotaPagamento").textContent = "O pagamento é feito no ambiente seguro da Kiwify. O cartão não passa pela Arqevon.";
}
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
      body: JSON.stringify(VIA_KIWIFY ? { plan: plano } : { plan: plano, cpf: $("wcCpf").value }),
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
// Link "Ver um exemplo" do site (/#exemplo): abre o app com dados fictícios, sem pedir login.
const pediuExemplo = location.hash === "#exemplo";
if (pediuExemplo) history.replaceState(null, "", location.pathname + location.search);
const { data: { session } } = await supabase.auth.getSession();
if (session) {
  estado = { ...estado, modo: "conta", email: session.user.email, uid: session.user.id };
  liberarApp();
} else if (localStorage.getItem(MODO_LOCAL) === "1" || pediuExemplo) {
  localStorage.setItem(MODO_LOCAL, "1");
  estado = { ...estado, modo: "local" };
  liberarApp();
} else {
  mostrarLogin();
}
if (pediuExemplo) window.verExemplo?.();
supabase.auth.onAuthStateChange((evento) => {
  if (evento === "SIGNED_OUT" && estado.modo === "conta") { nuvem.sair(); estado = { ...estado, modo: null, uid: null }; mostrarLogin(); }
});
