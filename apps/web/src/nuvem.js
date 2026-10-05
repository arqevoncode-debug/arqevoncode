// Liga o motor de sincronização (sync.js) ao app: estado da conta, telas da seção "Nuvem",
// chaves guardadas no aparelho e quando sincronizar.
import { criarCofre, abrirComSenha, recuperarComChave, gerarChaveRecuperacao, normalizarChaveRecuperacao } from "./cofre.js";
import { Sincronizador, estadoVazio, COLECOES } from "./sync.js";

const $ = id => document.getElementById(id);
const DONO = "arqevon-sync-dono"; // conta cujos dados estão neste navegador
const chaveEstado = uid => `arqevon-sync:${uid}`;

// ---------- Chaves no IndexedDB ----------
// CryptoKey não exportável: o navegador usa a chave, mas nenhum script consegue lê-la para fora.
function idb() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open("arqevon", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("chaves");
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}
async function idbOp(modo, fn) {
  const db = await idb();
  return new Promise((ok, falha) => {
    const tx = db.transaction("chaves", modo);
    const req = fn(tx.objectStore("chaves"));
    tx.oncomplete = () => { db.close(); ok(req?.result); };
    tx.onerror = () => { db.close(); falha(tx.error); };
  });
}
const lerChaves = uid => idbOp("readonly", s => s.get(uid)).catch(() => null);
const gravarChaves = (uid, chaves) => idbOp("readwrite", s => s.put(chaves, uid));
const apagarChaves = uid => idbOp("readwrite", s => s.delete(uid)).catch(() => {});

// ---------- Ponte com o motor financeiro ----------
const ponte = () => window.ArqevonFinanceBridge;
const motor = {
  // Bloqueado (senha local ainda não digitada) os dados em memória estão vazios: sincronizar
  // nesse estado apagaria a nuvem. Por isso o motor só é "pronto" com a tela de bloqueio fechada.
  pronto: () => !!ponte() && $("telaBloqueio")?.hidden !== false,
  editando: () => {
    const ativo = document.activeElement;
    const campo = ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && ativo.closest(".app");
    const janela = document.querySelector(".app dialog[open], dialog[open]:not(#webConta)");
    return !!campo || !!janela;
  },
  ler: () => ponte().obterDados(),
  gravar: dados => ponte().substituirDados(dados),
};
const temDados = d => COLECOES.some(c => (d?.[c] || []).length > 0);

const erroVisivel = (id, msg) => { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; };
const mostrar = ativo => ["wnCriar", "wnGuardar", "wnAbrir", "wnRecuperar", "wnAtiva"].forEach(id => { $(id).hidden = id !== ativo; });

export function criarNuvem({ supabase, aoMudar }) {
  let uid = null;
  let sync = null;
  let status = null; // resultado de vault_status
  let criando = null; // {senha, chave} entre os dois passos da criação
  let texto = "";
  let ultimoJson = "";
  let timerMudanca = null;
  let timerPeriodico = null;
  let ocupado = false;

  const rpc = (fn, args) => supabase.rpc(fn, args);
  const store = {
    ler: () => { try { return JSON.parse(localStorage.getItem(chaveEstado(uid))) || estadoVazio(uid); } catch { return estadoVazio(uid); } },
    gravar: st => localStorage.setItem(chaveEstado(uid), JSON.stringify(st)),
  };

  function informar(msg) { texto = msg; $("wnStatus").textContent = msg; aoMudar?.(msg); }

  async function confirmar(msg) { return window.confirm(msg); }

  async function iniciarSync(chaves) {
    sync = new Sincronizador({ rpc, chaves, store, motor, confirmar });
    ultimoJson = "";
    await rodar();
    clearInterval(timerPeriodico);
    // Mudança local: verificada a cada 3 s (barato: compara o JSON). Remota: a cada 30 s.
    let contador = 0;
    timerPeriodico = setInterval(() => {
      if (!sync || document.visibilityState !== "visible") return;
      contador += 1;
      let json = "";
      try { json = motor.pronto() ? JSON.stringify(motor.ler()) : ultimoJson; } catch { return; }
      if (json !== ultimoJson) { clearTimeout(timerMudanca); timerMudanca = setTimeout(rodar, 1500); }
      else if (contador % 10 === 0) rodar();
    }, 3000);
  }

  async function rodar() {
    if (!sync || ocupado) return;
    ocupado = true;
    try {
      const r = await sync.sincronizar();
      try { ultimoJson = JSON.stringify(motor.ler()); } catch { /* bloqueado */ }
      if (r.resultado === "ok") {
        const st = store.ler();
        informar(`Sincronizado às ${new Date(st.ultimaSync).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
      } else if (r.resultado === "bloqueado") informar("Aguardando a senha local do app para sincronizar.");
    } catch (e) {
      if (e.code === "NOT_ENTITLED") informar("Sua assinatura Pro não está ativa: os dados da nuvem continuam guardados, mas novas alterações não são enviadas.");
      else if (e.code === "QUOTA_EXCEEDED") informar(e.message);
      else informar(navigator.onLine ? "Não foi possível sincronizar agora. Tentaremos de novo." : "Sem internet. Suas alterações serão enviadas quando a conexão voltar.");
    } finally { ocupado = false; }
  }

  // Este navegador tem dados de outra conta: eles não podem ir para a nuvem desta.
  async function prepararDono() {
    const dono = localStorage.getItem(DONO);
    if (dono && dono !== uid && temDados(motor.ler())) {
      const ok = window.confirm("Este navegador tem lançamentos de outra conta. Para abrir os dados da sua nuvem aqui, eles serão substituídos (a outra conta continua com os dela na nuvem). Continuar?");
      if (!ok) return false;
      motor.gravar({ lancamentos: [], fixos: [], parcelamentos: [], objetivos: [] });
    }
    localStorage.setItem(DONO, uid);
    return true;
  }

  async function atualizar() {
    if (!uid) return;
    const { data, error } = await rpc("vault_status");
    if (error || !data?.ok) { informar("Não foi possível consultar a nuvem agora."); return; }
    status = data;
    $("wcNuvem").hidden = false;
    if (sync) { mostrar("wnAtiva"); informar(texto || "Sincronização ativa."); return; }
    if (!status.exists && !status.entitled) {
      mostrar(null);
      informar("A sincronização entre aparelhos faz parte do plano Pro.");
      return;
    }
    if (!status.exists) { mostrar(criando ? "wnGuardar" : "wnCriar"); informar("Desligada neste aparelho."); return; }
    const chaves = await lerChaves(uid);
    if (chaves) { mostrar("wnAtiva"); informar("Conectando…"); if (await prepararDono()) await iniciarSync(chaves); return; }
    mostrar("wnAbrir");
    informar("Sua conta tem dados na nuvem.");
  }

  // ---------- Telas ----------
  $("wnCriar").addEventListener("submit", e => {
    e.preventDefault();
    const s1 = $("wnSenha").value, s2 = $("wnSenha2").value;
    if (s1.length < 10) return erroVisivel("wnErroCriar", "Use pelo menos 10 caracteres.");
    if (s1 !== s2) return erroVisivel("wnErroCriar", "As senhas não são iguais.");
    erroVisivel("wnErroCriar", "");
    criando = { senha: s1, chave: gerarChaveRecuperacao() };
    $("wnChave").textContent = criando.chave;
    $("wnGuardei").checked = false;
    mostrar("wnGuardar");
  });

  $("wnCopiar").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(criando?.chave || ""); $("wnCopiar").textContent = "Copiada"; } catch { /* sem permissão */ }
  });

  $("wnGuardar").addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("wnGuardei").checked || !criando) return;
    const botao = $("wnBotaoGuardar");
    botao.disabled = true; botao.textContent = "Protegendo seus dados…"; erroVisivel("wnErroGuardar", "");
    try {
      if (!(await prepararDono())) throw new Error("Cancelado.");
      const c = await criarCofre(criando.senha, criando.chave);
      const { data, error } = await rpc("vault_create", { p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível criar a nuvem agora.");
      await gravarChaves(uid, c.chaves);
      localStorage.setItem(chaveEstado(uid), JSON.stringify(estadoVazio(uid)));
      criando = null;
      $("wnSenha").value = ""; $("wnSenha2").value = "";
      mostrar("wnAtiva");
      informar("Enviando seus dados com criptografia…");
      await iniciarSync(c.chaves);
    } catch (err) {
      erroVisivel("wnErroGuardar", err.message);
    } finally { botao.disabled = false; botao.textContent = "Ativar sincronização"; }
  });

  $("wnAbrir").addEventListener("submit", async e => {
    e.preventDefault();
    const botao = $("wnBotaoAbrir");
    botao.disabled = true; botao.textContent = "Abrindo…"; erroVisivel("wnErroAbrir", "");
    try {
      let chaves;
      try { chaves = await abrirComSenha(status, $("wnSenhaAbrir").value); } catch { throw new Error("Senha incorreta."); }
      if (!(await prepararDono())) throw new Error("Cancelado.");
      await gravarChaves(uid, chaves);
      $("wnSenhaAbrir").value = "";
      mostrar("wnAtiva");
      informar("Baixando seus dados…");
      await iniciarSync(chaves);
    } catch (err) {
      erroVisivel("wnErroAbrir", err.message);
    } finally { botao.disabled = false; botao.textContent = "Abrir dados da nuvem"; }
  });

  $("wnEsqueci").addEventListener("click", () => mostrar("wnRecuperar"));
  $("wnVoltarAbrir").addEventListener("click", () => mostrar("wnAbrir"));

  $("wnRecuperar").addEventListener("submit", async e => {
    e.preventDefault();
    const chave = normalizarChaveRecuperacao($("wnChaveRec").value);
    const nova = $("wnNovaSenha").value;
    if (!chave) return erroVisivel("wnErroRec", "A chave tem 32 letras e números, em 8 grupos de 4.");
    if (nova.length < 10) return erroVisivel("wnErroRec", "A nova senha precisa de pelo menos 10 caracteres.");
    const botao = $("wnBotaoRec");
    botao.disabled = true; botao.textContent = "Recuperando…"; erroVisivel("wnErroRec", "");
    try {
      let r;
      try { r = await recuperarComChave(status, chave, nova); } catch { throw new Error("Chave de recuperação incorreta."); }
      const { data, error } = await rpc("vault_rekey", { p_expected_version: status.key_version, p_key_params: r.params, p_wrapped_key: r.wrapped, p_recovery_wrapped_key: r.recovery });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível salvar a nova senha.");
      if (!(await prepararDono())) throw new Error("Cancelado.");
      await gravarChaves(uid, r.chaves);
      $("wnChaveRec").value = ""; $("wnNovaSenha").value = "";
      mostrar("wnAtiva");
      informar("Senha nova definida. Baixando seus dados…");
      await iniciarSync(r.chaves);
    } catch (err) {
      erroVisivel("wnErroRec", err.message);
    } finally { botao.disabled = false; botao.textContent = "Recuperar e definir senha"; }
  });

  $("wnAgora").addEventListener("click", () => { informar("Sincronizando…"); rodar(); });
  $("wnEsquecer").addEventListener("click", async () => {
    if (!window.confirm("Desligar a nuvem neste aparelho? Os dados continuam aqui e na nuvem; para religar, você vai precisar da senha da nuvem.")) return;
    await parar(true);
    atualizar();
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") rodar(); });
  window.addEventListener("online", () => rodar());

  async function parar(esquecerChaves) {
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    sync = null; texto = ""; criando = null;
    if (esquecerChaves && uid) await apagarChaves(uid);
  }

  return {
    async entrar(novoUid) {
      if (uid !== novoUid) await parar(false);
      uid = novoUid;
      await atualizar();
    },
    atualizar,
    async sair() { await parar(true); uid = null; $("wcNuvem").hidden = true; },
    texto: () => texto,
    ativa: () => !!sync,
  };
}
