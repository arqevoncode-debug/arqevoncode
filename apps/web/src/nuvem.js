// Liga o motor de sincronização (sync.js) ao app: estado da conta, telas da seção "Nuvem",
// chaves guardadas no aparelho e quando sincronizar.
import { criarCofre, abrirComSenha, recuperarComChave, gerarChaveRecuperacao, normalizarChaveRecuperacao,
  novoPedidoAparelho, selarParaAparelho, abrirPacoteAparelho } from "./cofre.js";
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
  pronto: () => !!ponte() && $("telaBloqueio")?.hidden !== false && !ponte().emExemplo?.(),
  editando: () => {
    const ativo = document.activeElement;
    // só campos de formulário que gravam algo (lançamento, objetivo, aporte); um seletor de
    // período ou de tema com foco não pode segurar a sincronização indefinidamente
    const campo = ativo && /^(INPUT|TEXTAREA|SELECT)$/.test(ativo.tagName) && ativo.closest(".app form, .app .aporte-form");
    const janela = document.querySelector(".app dialog[open], dialog[open]:not(#webConta)");
    return !!campo || !!janela || !!ponte()?.editando?.();
  },
  ler: () => ponte().obterDados(),
  gravar: dados => ponte().substituirDados(dados, { sync: true }),
};
const temDados = d => COLECOES.some(c => (d?.[c] || []).length > 0);

// Nome do aparelho no pedido de liberação ("iPhone · Safari"), para a pessoa reconhecer no outro.
function rotuloAparelho() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
    : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Aparelho";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return nav ? `${so} · ${nav}` : so;
}

const erroVisivel = (id, msg) => { const el = $(id); el.textContent = msg || ""; el.hidden = !msg; };
const mostrar = ativo => ["wnCriar", "wnGuardar", "wnAparelho", "wnAbrir", "wnRecuperar", "wnAtiva"].forEach(id => { $(id).hidden = id !== ativo; });

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
  let pedeSenha = false; // a conta tem dados na nuvem, mas este aparelho ainda não tem as chaves
  let chavesAtuais = null; // chaves em uso, para liberar outro aparelho
  // Aparelho novo esperando aprovação: {par, pub, codigo, tag, id, expira}
  let pedido = null;
  let timerPedido = null;
  let conferindo = false;
  let modoSenha = false; // a pessoa escolheu digitar a senha em vez de aprovar no outro aparelho
  // Aparelho aberto: pedidos de liberação
  let timerPendentes = null;
  let aprovando = null;
  const dispensados = new Set();

  const rpc = (fn, args) => supabase.rpc(fn, args);
  const store = {
    ler: () => { try { return JSON.parse(localStorage.getItem(chaveEstado(uid))) || estadoVazio(uid); } catch { return estadoVazio(uid); } },
    gravar: st => localStorage.setItem(chaveEstado(uid), JSON.stringify(st)),
  };

  function informar(msg) { texto = msg; $("wnStatus").textContent = msg; aoMudar?.(msg); }

  async function confirmar(msg) { return window.confirm(msg); }

  async function iniciarSync(chaves) {
    pararPedido(true);
    chavesAtuais = chaves;
    pedeSenha = false;
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
    // Pedidos de outro aparelho para ser liberado: consultados a cada 8 s com o app visível.
    clearInterval(timerPendentes);
    timerPendentes = setInterval(verPendentes, 8000);
    verPendentes();
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
      } else if (r.resultado === "bloqueado") informar(ponte()?.emExemplo?.()
        ? "Sincronização pausada enquanto o exemplo está aberto."
        : "Aguardando a senha local do app para sincronizar.");
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
      motor.gravar({ lancamentos: [], fixos: [], parcelamentos: [], objetivos: [], orcamentos: [] });
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
    pedeSenha = true;
    informar("Sua conta tem dados na nuvem.");
    if (modoSenha) { mostrar("wnAbrir"); return; }
    mostrar("wnAparelho");
    if (!pedido) pedirAprovacao();
  }

  // ---------- Aparelho novo: pedir aprovação a um aparelho já aberto ----------
  function pararPedido(cancelar) {
    clearInterval(timerPedido); timerPedido = null;
    if (cancelar && pedido) Promise.resolve(rpc("vault_link_cancel", { p_id: pedido.id })).catch(() => {});
    pedido = null;
  }

  function pedidoEncerrado(msg) {
    pararPedido(false);
    $("wnCodigo").textContent = "····-····";
    $("wnAparelhoStatus").textContent = msg;
    $("wnNovoCodigo").hidden = false;
  }

  async function pedirAprovacao() {
    pararPedido(true);
    const dono = uid;
    erroVisivel("wnErroAparelho", "");
    $("wnNovoCodigo").hidden = true;
    $("wnCodigo").textContent = "····-····";
    $("wnAparelhoStatus").textContent = "Gerando código…";
    try {
      const p = await novoPedidoAparelho();
      const { data, error } = await rpc("vault_link_request", { p_device_pub: p.pub, p_device_tag: p.tag, p_label: rotuloAparelho() });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível gerar o código agora.");
      if (uid !== dono || sync) { Promise.resolve(rpc("vault_link_cancel", { p_id: data.id })).catch(() => {}); return; }
      pedido = { ...p, id: data.id, expira: Date.parse(data.expires_at) || Date.now() + 10 * 60000 };
      $("wnCodigo").textContent = p.codigo;
      $("wnAparelhoStatus").textContent = "Aguardando a aprovação no outro aparelho…";
      timerPedido = setInterval(conferirPedido, 2500);
    } catch (e) {
      $("wnAparelhoStatus").textContent = "";
      erroVisivel("wnErroAparelho", navigator.onLine ? e.message : "Sem internet. Conecte-se para gerar o código.");
      $("wnNovoCodigo").hidden = false;
    }
  }

  async function conferirPedido() {
    if (!pedido || conferindo || document.visibilityState !== "visible") return;
    if (Date.now() > pedido.expira) { pararPedido(true); return pedidoEncerrado("O código venceu. Gere outro para tentar de novo."); }
    conferindo = true;
    const atual = pedido;
    try {
      const { data, error } = await rpc("vault_link_take", { p_id: atual.id });
      if (error || pedido !== atual) return; // falha de rede: tenta de novo na próxima volta
      if (data?.sealed) { pararPedido(false); await concluirAprovacao(atual, data.sealed); return; }
      if (!data?.ok) pedidoEncerrado(data?.code === "EXPIRED" ? "O código venceu. Gere outro para tentar de novo." : "O pedido foi recusado no outro aparelho.");
    } catch { /* tenta de novo */ } finally { conferindo = false; }
  }

  async function concluirAprovacao(p, selado) {
    let chaves;
    try { chaves = await abrirPacoteAparelho(p, p.id, selado); }
    catch { erroVisivel("wnErroAparelho", "Não foi possível abrir o que o outro aparelho enviou. Gere outro código."); $("wnNovoCodigo").hidden = false; return; }
    if (!(await prepararDono())) { erroVisivel("wnErroAparelho", "Cancelado."); $("wnNovoCodigo").hidden = false; return; }
    await gravarChaves(uid, chaves);
    mostrar("wnAtiva");
    informar("Aparelho liberado. Baixando seus dados…");
    await iniciarSync(chaves);
    aoMudar?.(texto);
  }

  // ---------- Aparelho aberto: liberar um aparelho novo ----------
  async function verPendentes() {
    if (!sync || document.visibilityState !== "visible" || $("webAprovar").open) return;
    try {
      const { data, error } = await rpc("vault_link_pending");
      if (error || !data?.ok || $("webAprovar").open || !sync) return;
      const item = (data.items || []).find(i => !dispensados.has(i.id));
      if (item) abrirAprovacao(item);
    } catch { /* sem rede: tenta depois */ }
  }

  function abrirAprovacao(item) {
    aprovando = item;
    $("waTexto").textContent = `${item.label || "Um aparelho"} pediu acesso aos seus dados da nuvem. Digite o código que aparece nele.`;
    $("waSenhaCampo").hidden = !!chavesAtuais?.dek;
    $("waCodigo").value = ""; $("waSenha").value = "";
    erroVisivel("waErro", "");
    $("waOk").hidden = true;
    $("waLiberar").disabled = false; $("waLiberar").hidden = false; $("waRecusar").hidden = false;
    $("webAprovar").showModal();
    $("waCodigo").focus();
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
    try {
      await navigator.clipboard.writeText(criando?.chave || "");
      $("wnCopiar").textContent = "Copiada";
      setTimeout(() => { $("wnCopiar").textContent = "Copiar chave"; }, 2500);
    } catch { /* sem permissão */ }
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

  $("wnUsarSenha").addEventListener("click", () => { modoSenha = true; mostrar("wnAbrir"); $("wnSenhaAbrir").focus(); });
  $("wnVoltarAparelho").addEventListener("click", () => { modoSenha = false; mostrar("wnAparelho"); if (!pedido) pedirAprovacao(); });
  $("wnNovoCodigo").addEventListener("click", () => pedirAprovacao());

  $("waForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!aprovando) return;
    const botao = $("waLiberar");
    botao.disabled = true; botao.textContent = "Liberando…"; erroVisivel("waErro", "");
    try {
      let chaves = chavesAtuais;
      if (!chaves?.dek) {
        // chaves salvas antes de existir a liberação por aparelho: a senha abre a DEK uma vez
        const senha = $("waSenha").value;
        if (!senha) throw new Error("Digite a senha da nuvem.");
        try { chaves = await abrirComSenha(status, senha); } catch { throw new Error("Senha incorreta."); }
        await gravarChaves(uid, chaves);
        chavesAtuais = chaves;
        $("waSenhaCampo").hidden = true;
      }
      const selado = await selarParaAparelho(chaves, aprovando, $("waCodigo").value);
      const { data, error } = await rpc("vault_link_approve", { p_id: aprovando.id, p_sealed: selado });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível liberar agora. Tente de novo.");
      dispensados.add(aprovando.id);
      aprovando = null;
      $("waOk").hidden = false; botao.hidden = true; $("waRecusar").hidden = true;
      setTimeout(() => $("webAprovar").close(), 2500);
    } catch (err) {
      erroVisivel("waErro", err.message);
    } finally { botao.disabled = false; botao.textContent = "Liberar aparelho"; }
  });
  $("waRecusar").addEventListener("click", () => {
    if (aprovando) { dispensados.add(aprovando.id); Promise.resolve(rpc("vault_link_cancel", { p_id: aprovando.id })).catch(() => {}); }
    aprovando = null;
    $("webAprovar").close();
  });
  // Fechar com Esc: não pergunta de novo sobre o mesmo pedido nesta sessão (ele vence sozinho).
  $("webAprovar").addEventListener("close", () => { if (aprovando) dispensados.add(aprovando.id); aprovando = null; });

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
      // A pergunta sobre dados de outra conta vem antes de trocar a senha no servidor:
      // cancelar aqui não pode deixar a senha trocada e o aparelho sem as chaves.
      if (!(await prepararDono())) throw new Error("Cancelado. A senha da nuvem não foi alterada.");
      const { data, error } = await rpc("vault_rekey", { p_expected_version: status.key_version, p_key_params: r.params, p_wrapped_key: r.wrapped, p_recovery_wrapped_key: r.recovery });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível salvar a nova senha.");
      const novo = await rpc("vault_status");
      if (!novo.error && novo.data?.ok) status = novo.data;
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
    if (!window.confirm("Desligar a nuvem neste aparelho? Os dados continuam aqui e na nuvem; para religar, aprove por outro aparelho ou use a senha da nuvem.")) return;
    await parar(true);
    atualizar();
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { rodar(); verPendentes(); conferirPedido(); } });
  window.addEventListener("online", () => rodar());

  async function parar(esquecerChaves) {
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    sync = null; texto = ""; criando = null;
    pararPedido(true);
    clearInterval(timerPendentes); timerPendentes = null;
    chavesAtuais = null; modoSenha = false; pedeSenha = false;
    if ($("webAprovar").open) { aprovando = null; $("webAprovar").close(); }
    if (esquecerChaves && uid) await apagarChaves(uid);
  }

  return {
    async entrar(novoUid) {
      if (uid !== novoUid) await parar(false);
      uid = novoUid;
      await atualizar();
    },
    atualizar,
    /** Envia o que falta antes de sair. Devolve se a nuvem estava ligada e se ficou tudo enviado. */
    async preparaSaida() {
      if (!sync) return { nuvem: false, enviado: false };
      try { const r = await sync.sincronizar(); return { nuvem: true, enviado: r.resultado === "ok" }; }
      catch { return { nuvem: true, enviado: false }; }
    },
    async sair() {
      const saindo = uid;
      await parar(true);
      // o estado de sincronização desta conta sai do navegador: ao voltar, a mescla recomeça do zero
      // e nada daqui é tomado como "apagado"
      if (saindo) localStorage.removeItem(chaveEstado(saindo));
      uid = null; $("wcNuvem").hidden = true;
    },
    texto: () => texto,
    ativa: () => !!sync,
    pedeSenha: () => pedeSenha && !sync,
  };
}
