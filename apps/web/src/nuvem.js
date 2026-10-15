// Liga o motor de sincronização (sync.js) ao app: estado da conta, telas da seção "Nuvem",
// chaves guardadas no aparelho e quando sincronizar.
//
// Sem senha da nuvem (2026-10-15): um aparelho novo é liberado por um aparelho já conectado
// (código na tela do novo, digitado no conectado). A chave de recuperação é o único plano B.
import { novaChaveDaNuvem, abrirComChave, gerarChaveRecuperacao, normalizarChaveRecuperacao,
  novoPedidoAparelho, selarParaAparelho, abrirPacoteAparelho, conferirCodigoAparelho, normalizarCodigoAparelho } from "./cofre.js";
import { Sincronizador, estadoVazio, COLECOES } from "./sync.js";

const $ = id => document.getElementById(id);
const DONO = "arqevon-sync-dono"; // conta cujos dados estão neste navegador
const chaveEstado = uid => `arqevon-sync:${uid}`;
const TROCADA = "A chave da nuvem foi trocada em outro aparelho. Libere este aparelho de novo.";

// ---------- Chaves no IndexedDB ----------
// CryptoKey: o navegador usa a chave sem que um script a leia (exceto a DEK, ver cofre.js).
// O registro guarda também a versão (key_version) e o kid da chave, para saber se ela ainda vale.
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
const mostrar = ativo => ["wnCriar", "wnGuardar", "wnAparelho", "wnRecuperar", "wnAtiva"].forEach(id => { $(id).hidden = id !== ativo; });
const kidDe = st => st?.key_params?.kid || null;
const copiarTexto = async (texto, botao, rotulo) => {
  try { await navigator.clipboard.writeText(texto); botao.textContent = "Copiada"; setTimeout(() => { botao.textContent = rotulo; }, 2500); } catch { /* sem permissão */ }
};

export function criarNuvem({ supabase, aoMudar }) {
  let uid = null;
  let sync = null;
  let status = null; // resultado de vault_status
  let guardando = null; // {chave, modo: "criar"|"trocar"} enquanto a chave de recuperação está na tela
  let texto = "";
  let ultimoJson = "";
  let timerMudanca = null;
  let timerPeriodico = null;
  let ocupado = false;
  let pedeLiberacao = false; // a conta tem dados na nuvem, mas este aparelho ainda não tem as chaves
  let chavesAtuais = null; // {cifra, ids, dek, versao, kid} em uso
  // Aparelho novo esperando aprovação: {par, pub, codigo, tag, id, expira}
  let pedido = null;
  let timerPedido = null;
  let conferindo = false;
  let modoChave = false; // a pessoa escolheu a chave de recuperação em vez de outro aparelho
  // Aparelho conectado: pedidos de liberação
  let timerPendentes = null;
  let aprovando = null;
  let trocaNaAprovacao = null; // {chave}: aparelho de antes de 2026-10-15 troca a chave para liberar
  const dispensados = new Set();

  const rpc = (fn, args) => supabase.rpc(fn, args);
  const store = {
    ler: () => { try { return JSON.parse(localStorage.getItem(chaveEstado(uid))) || estadoVazio(uid); } catch { return estadoVazio(uid); } },
    gravar: st => localStorage.setItem(chaveEstado(uid), JSON.stringify(st)),
  };

  function informar(msg) { texto = msg; $("wnStatus").textContent = msg; aoMudar?.(msg); }
  async function confirmar(msg) { return window.confirm(msg); }
  async function consultarStatus() {
    const { data, error } = await rpc("vault_status");
    if (error || !data?.ok) return null;
    status = data;
    return data;
  }
  async function guardarChaves(chaves, versao, kid) {
    const reg = { cifra: chaves.cifra, ids: chaves.ids, dek: chaves.dek, versao, kid };
    await gravarChaves(uid, reg);
    return reg;
  }

  async function iniciarSync(chaves) {
    pararPedido(true);
    chavesAtuais = chaves;
    pedeLiberacao = false;
    sync = new Sincronizador({ rpc, chaves, store, motor, confirmar, versao: chaves.versao ?? null });
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
      if (e.code === "KEY_CHANGED") { ocupado = false; await chaveTrocadaFora(); return; }
      if (e.code === "NOT_ENTITLED") informar("Sua assinatura Pro não está ativa: os dados da nuvem continuam guardados, mas novas alterações não são enviadas.");
      else if (e.code === "QUOTA_EXCEEDED") informar(e.message);
      else informar(navigator.onLine ? "Não foi possível sincronizar agora. Tentaremos de novo." : "Sem internet. Suas alterações serão enviadas quando a conexão voltar.");
    } finally { ocupado = false; }
  }

  // Outro aparelho trocou a chave: as chaves daqui não valem mais. Os dados locais ficam; ao ser
  // liberado de novo, a mescla recomeça do zero e o que só existe aqui volta para a nuvem.
  async function chaveTrocadaFora() {
    await parar(true);
    localStorage.removeItem(chaveEstado(uid));
    await atualizar(TROCADA);
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

  async function atualizar(aviso) {
    if (!uid) return;
    if (!(await consultarStatus())) { informar("Não foi possível consultar a nuvem agora."); return; }
    $("wcNuvem").hidden = false;
    if (sync) { mostrar(guardando ? "wnGuardar" : "wnAtiva"); informar(texto || "Sincronização ativa."); return; }
    if (!status.exists && !status.entitled) {
      mostrar(null);
      informar("A sincronização entre aparelhos faz parte do plano Pro.");
      return;
    }
    if (!status.exists) { mostrar(guardando ? "wnGuardar" : "wnCriar"); informar("Desligada neste aparelho."); return; }
    const chaves = await lerChaves(uid);
    if (chaves && (chaves.kid || null) !== kidDe(status)) {
      // guardadas antes de uma troca de chave feita em outro aparelho
      await apagarChaves(uid);
      localStorage.removeItem(chaveEstado(uid));
      aviso = TROCADA;
    } else if (chaves) {
      // chaves de antes de existir a versão no registro: valem para a versão atual (sem kid na nuvem,
      // nenhuma troca de chave aconteceu)
      const reg = chaves.versao == null ? await guardarChaves(chaves, status.key_version, kidDe(status)) : chaves;
      mostrar("wnAtiva"); informar("Conectando…");
      if (await prepararDono()) await iniciarSync(reg);
      return;
    }
    pedeLiberacao = true;
    informar(aviso || "Sua conta tem dados na nuvem.");
    if (modoChave) { mostrar("wnRecuperar"); return; }
    mostrar("wnAparelho");
    if (!pedido) pedirAprovacao();
  }

  // ---------- Troca de chave ----------
  // Chave nova (e chave de recuperação nova): tudo o que este aparelho tem é recifrado e reenviado.
  // Os outros aparelhos conectados recebem KEY_CHANGED e pedem para ser liberados de novo.
  async function trocarChave(chaveRec) {
    if (!sync) throw new Error("Ligue a nuvem neste aparelho primeiro.");
    if (!motor.pronto()) throw new Error("Desbloqueie o app (e saia do exemplo) antes de trocar a chave.");
    // primeiro traz tudo da nuvem: depois da troca, o que existir só lá some
    const r = await sync.sincronizar();
    if (r.resultado !== "ok") throw new Error("Não foi possível sincronizar agora. Tente de novo em instantes.");
    const atual = await consultarStatus();
    if (!atual) throw new Error("Não foi possível consultar a nuvem agora.");
    const antigas = chavesAtuais;
    const c = await novaChaveDaNuvem(chaveRec);
    // as chaves novas são gravadas antes: se a troca passar e a página fechar no meio, este aparelho
    // já tem a chave certa
    const reg = await guardarChaves(c.chaves, atual.key_version + 1, c.params.kid);
    const { data, error } = await rpc("vault_rotate", { p_expected_version: atual.key_version, p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
    if (error || !data?.ok) {
      // sem resposta, a troca pode ter passado: confere pelo kid antes de voltar às chaves antigas
      const depois = await consultarStatus();
      if (kidDe(depois) !== c.params.kid) {
        await gravarChaves(uid, antigas);
        throw new Error(data?.message || "Não foi possível trocar a chave agora. Nada foi alterado.");
      }
    }
    await consultarStatus();
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    sync = null;
    store.gravar(estadoVazio(uid));
    informar("Chave trocada. Reenviando seus dados com a chave nova…");
    await iniciarSync(reg);
    return reg;
  }

  // ---------- Aparelho novo: pedir aprovação a um aparelho conectado ----------
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
    // a chave pode ter sido trocada pelo outro aparelho para liberar este: versão e kid atuais
    await consultarStatus();
    const reg = await guardarChaves(chaves, status.key_version, kidDe(status));
    modoChave = false;
    mostrar("wnAtiva");
    informar("Aparelho liberado. Baixando seus dados…");
    await iniciarSync(reg);
    aoMudar?.(texto);
  }

  // ---------- Aparelho conectado: liberar um aparelho novo ----------
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
    // conectado antes de 2026-10-15: não tem a chave dos dados para entregar; troca a chave uma vez
    trocaNaAprovacao = chavesAtuais?.dek ? null : { chave: gerarChaveRecuperacao() };
    $("waTrocar").hidden = !trocaNaAprovacao;
    if (trocaNaAprovacao) { $("waChave").textContent = trocaNaAprovacao.chave; $("waGuardei").checked = false; }
    $("waCodigo").value = "";
    erroVisivel("waErro", "");
    $("waOk").hidden = true;
    $("waLiberar").disabled = false; $("waLiberar").hidden = false; $("waRecusar").hidden = false;
    $("webAprovar").showModal();
    $("waCodigo").focus();
  }

  // ---------- Telas ----------
  function mostrarGuardar(modo) {
    guardando = { chave: gerarChaveRecuperacao(), modo };
    $("wnChave").textContent = guardando.chave;
    $("wnGuardei").checked = false;
    erroVisivel("wnErroGuardar", "");
    $("wnGuardarTexto").innerHTML = modo === "trocar"
      ? "<b>Nova chave de recuperação.</b> A chave da nuvem será trocada e seus dados reenviados com ela. A chave antiga deixa de valer, e os outros aparelhos conectados vão pedir para ser liberados de novo."
      : "<b>Guarde sua chave de recuperação.</b> Se você perder todos os aparelhos conectados, só ela abre seus dados. Anote em papel ou num gerenciador de senhas.";
    $("wnBotaoGuardar").textContent = modo === "trocar" ? "Trocar a chave" : "Ativar sincronização";
    $("wnCancelarGuardar").hidden = modo !== "trocar";
    mostrar("wnGuardar");
  }

  $("wnCriar").addEventListener("submit", e => { e.preventDefault(); erroVisivel("wnErroCriar", ""); mostrarGuardar("criar"); });
  $("wnNovaChave").addEventListener("click", () => mostrarGuardar("trocar"));
  $("wnCancelarGuardar").addEventListener("click", () => { guardando = null; mostrar(sync ? "wnAtiva" : "wnCriar"); });
  $("wnCopiar").addEventListener("click", () => copiarTexto(guardando?.chave || "", $("wnCopiar"), "Copiar chave"));
  $("waCopiar").addEventListener("click", () => copiarTexto(trocaNaAprovacao?.chave || "", $("waCopiar"), "Copiar chave"));

  $("wnGuardar").addEventListener("submit", async e => {
    e.preventDefault();
    if (!$("wnGuardei").checked || !guardando) return;
    const botao = $("wnBotaoGuardar"), rotulo = botao.textContent;
    botao.disabled = true; botao.textContent = "Protegendo seus dados…"; erroVisivel("wnErroGuardar", "");
    try {
      if (guardando.modo === "trocar") {
        await trocarChave(guardando.chave);
        guardando = null;
        mostrar("wnAtiva");
        return;
      }
      if (!(await prepararDono())) throw new Error("Cancelado.");
      const c = await novaChaveDaNuvem(guardando.chave);
      const { data, error } = await rpc("vault_create", { p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
      if (error || !data?.ok) throw new Error(data?.message || "Não foi possível criar a nuvem agora.");
      await consultarStatus();
      const reg = await guardarChaves(c.chaves, status?.key_version ?? 1, c.params.kid);
      store.gravar(estadoVazio(uid));
      guardando = null;
      mostrar("wnAtiva");
      informar("Enviando seus dados com criptografia…");
      await iniciarSync(reg);
    } catch (err) {
      erroVisivel("wnErroGuardar", err.message);
    } finally { botao.disabled = false; botao.textContent = rotulo; }
  });

  $("wnUsarChave").addEventListener("click", () => { modoChave = true; mostrar("wnRecuperar"); $("wnChaveRec").focus(); });
  $("wnVoltarAparelho").addEventListener("click", () => { modoChave = false; mostrar("wnAparelho"); if (!pedido) pedirAprovacao(); });
  $("wnNovoCodigo").addEventListener("click", () => pedirAprovacao());

  $("wnRecuperar").addEventListener("submit", async e => {
    e.preventDefault();
    const chave = normalizarChaveRecuperacao($("wnChaveRec").value);
    if (!chave) return erroVisivel("wnErroRec", "A chave tem 32 letras e números, em 8 grupos de 4.");
    const botao = $("wnBotaoRec");
    botao.disabled = true; botao.textContent = "Abrindo…"; erroVisivel("wnErroRec", "");
    try {
      let chaves;
      try { chaves = await abrirComChave(status, chave); } catch { throw new Error("Chave de recuperação incorreta."); }
      if (!(await prepararDono())) throw new Error("Cancelado.");
      const reg = await guardarChaves(chaves, status.key_version, kidDe(status));
      $("wnChaveRec").value = "";
      modoChave = false;
      mostrar("wnAtiva");
      informar("Baixando seus dados…");
      await iniciarSync(reg);
    } catch (err) {
      erroVisivel("wnErroRec", err.message);
    } finally { botao.disabled = false; botao.textContent = "Abrir meus dados"; }
  });

  $("wnRecomecar").addEventListener("click", async () => {
    if (!window.confirm("Apagar os dados da nuvem desta conta? Eles não podem ser abertos sem um aparelho conectado ou a chave de recuperação, e não há como desfazer. Os lançamentos deste aparelho continuam aqui.")) return;
    const { data, error } = await rpc("vault_delete");
    if (error || !data?.ok) return erroVisivel("wnErroRec", data?.message || "Não foi possível apagar agora.");
    pararPedido(true);
    modoChave = false;
    localStorage.removeItem(chaveEstado(uid));
    await apagarChaves(uid);
    await atualizar();
  });

  $("waForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (!aprovando) return;
    const botao = $("waLiberar");
    botao.disabled = true; botao.textContent = "Liberando…"; erroVisivel("waErro", "");
    try {
      const codigo = $("waCodigo").value;
      let chaves = chavesAtuais;
      if (!chaves?.dek) {
        if (!normalizarCodigoAparelho(codigo)) throw new Error("O código tem 8 letras e números, como K7M2-Q9XD.");
        if (!(await conferirCodigoAparelho(aprovando, codigo))) throw new Error("O código não confere. Confira no aparelho novo e digite de novo.");
        if (!$("waGuardei").checked) throw new Error("Guarde a chave de recuperação nova e marque a confirmação.");
        botao.textContent = "Trocando a chave…";
        chaves = await trocarChave(trocaNaAprovacao.chave);
        trocaNaAprovacao = null;
        $("waTrocar").hidden = true;
      }
      const selado = await selarParaAparelho(chaves, aprovando, codigo);
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

  $("wnAgora").addEventListener("click", () => { informar("Sincronizando…"); rodar(); });
  $("wnEsquecer").addEventListener("click", async () => {
    if (!window.confirm("Desligar a nuvem neste aparelho? Os dados continuam aqui e na nuvem. Para religar, libere este aparelho por outro conectado ou use a chave de recuperação.")) return;
    await parar(true);
    atualizar();
  });

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { rodar(); verPendentes(); conferirPedido(); } });
  window.addEventListener("online", () => rodar());

  async function parar(esquecerChaves) {
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    sync = null; texto = ""; guardando = null;
    pararPedido(true);
    clearInterval(timerPendentes); timerPendentes = null;
    chavesAtuais = null; modoChave = false; pedeLiberacao = false; trocaNaAprovacao = null;
    if ($("webAprovar").open) { aprovando = null; $("webAprovar").close(); }
    if (esquecerChaves && uid) await apagarChaves(uid);
  }

  return {
    async entrar(novoUid) {
      if (uid !== novoUid) await parar(false);
      uid = novoUid;
      await atualizar();
    },
    atualizar: () => atualizar(),
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
    pedeSenha: () => pedeLiberacao && !sync,
  };
}
