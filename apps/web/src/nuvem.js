// Liga o motor de sincronização (sync.js) ao app: estado da conta, seção "Nuvem", chaves guardadas
// no aparelho e quando sincronizar.
//
// Acesso só pelo e-mail (2026-10-15): entrar na conta basta. A chave dos dados (DEK) fica no aparelho
// e sob custódia do servidor (/api/v1/vault/key no license-manager, cifrada com uma chave mestra que
// não fica no banco). Um aparelho novo busca a DEK lá; os registros continuam cifrados no aparelho.
// Tudo é silencioso (decisão do dono): sem seção "Nuvem" na tela, sem botões e sem avisos. A nuvem
// liga sozinha para quem tem o Pro.
import { novaChaveCustodia, dekEmBase64, chavesDeDekBase64 } from "./cofre.js";
import { Sincronizador, estadoVazio, COLECOES } from "./sync.js";
import { LICENSE_API } from "./config.js";

const $ = id => document.getElementById(id);
const DONO = "arqevon-sync-dono"; // conta cujos dados estão neste navegador
const chaveEstado = uid => `arqevon-sync:${uid}`;

// ---------- Chaves no IndexedDB ----------
// Registro: {cifra, ids, dek, versao, kid}. versao e kid dizem com qual chave da nuvem ele vale.
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
const kidDe = st => st?.key_params?.kid || null;

export function criarNuvem({ supabase, aoMudar }) {
  let uid = null;
  let sync = null;
  let status = null; // resultado de vault_status
  let texto = "";
  let ultimoJson = "";
  let timerMudanca = null;
  let timerPeriodico = null;
  let timerEspera = null;
  let ocupado = false;
  let esperando = false; // a nuvem existe, mas a chave ainda não chegou ao servidor
  let chavesAtuais = null;
  let atualizandoChave = false;
  let criandoOuAssumindo = false;

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
    const reg = { cifra: chaves.cifra, ids: chaves.ids, dek: chaves.dek, versao, kid, entregue: !!chaves.entregue };
    await gravarChaves(uid, reg);
    return reg;
  }

  // ---------- Custódia da chave no servidor ----------
  async function servidorChave(corpo = {}, renovou = false) {
    // token velho (aba aberta há horas, aparelho que dormiu): renova a sessão e tenta de novo
    const { data } = renovou ? await supabase.auth.refreshSession() : await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      if (!renovou) return servidorChave(corpo, true);
      // sessão morta de vez (nem a renovação funciona): volta para a tela de entrar. Só a sessão sai;
      // os lançamentos deste aparelho ficam (o evento SIGNED_OUT não apaga dados)
      supabase.auth.signOut({ scope: "local" }).catch(() => {});
      return { ok: false, code: "AUTH" };
    }
    try {
      const r = await fetch(`${LICENSE_API}/api/v1/vault/key`, {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(corpo),
      });
      // recusa da rota: renova e tenta uma vez; se continuar, só tenta de novo mais tarde (quem
      // decide que a sessão acabou é o Supabase, ao recusar a renovação, nunca esta rota)
      if (r.status === 401) return renovou ? { ok: false, code: "AUTH" } : servidorChave(corpo, true);
      return await r.json().catch(() => ({ ok: false, code: "SERVER_ERROR" }));
    } catch {
      return { ok: false, code: "REDE" };
    }
  }

  // Aparelho que tem a chave atual: garante que o servidor também a tenha (para os outros aparelhos
  // entrarem só pelo e-mail). Aparelho de antes de 2026-10-15 (sem a DEK ou sem kid) troca a chave
  // uma vez: recifra e reenvia tudo o que tem, e entrega a chave nova.
  async function garantirCustodia() {
    if (!sync || !chavesAtuais || atualizandoChave) return;
    if (chavesAtuais.dek && chavesAtuais.kid) {
      if (chavesAtuais.entregue) return;
      const r = await servidorChave({ dek: await dekEmBase64(chavesAtuais), kid: chavesAtuais.kid });
      if (r.ok) { chavesAtuais.entregue = true; await gravarChaves(uid, chavesAtuais); }
      return;
    }
    if (!motor.pronto()) return; // bloqueado ou no exemplo: tenta na próxima rodada
    atualizandoChave = true;
    let trocou = false;
    try { await trocarChave(); trocou = true; } catch { /* tenta de novo na próxima rodada */ } finally { atualizandoChave = false; }
    if (trocou) await garantirCustodia(); // entrega a chave nova já
  }

  async function iniciarSync(chaves) {
    pararEspera();
    chavesAtuais = chaves;
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
  }

  async function rodar() {
    if (!sync || ocupado) return;
    ocupado = true;
    let ok = false;
    try {
      const r = await sync.sincronizar();
      try { ultimoJson = JSON.stringify(motor.ler()); } catch { /* bloqueado */ }
      if (r.resultado === "ok") {
        ok = true;
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
    if (ok) garantirCustodia();
  }

  // A chave da nuvem foi trocada em outro aparelho: as chaves daqui não valem mais. Os dados locais
  // ficam; a chave nova vem do servidor e a mescla recomeça do zero (o que só existe aqui volta).
  async function chaveTrocadaFora() {
    await parar(true);
    localStorage.removeItem(chaveEstado(uid));
    await atualizar();
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

  // Chave nova para a conta: tudo o que este aparelho tem é recifrado e reenviado. Os outros
  // aparelhos recebem KEY_CHANGED e buscam a chave nova no servidor sozinhos.
  async function trocarChave() {
    if (!sync) throw new Error("Nuvem desligada.");
    // primeiro traz tudo da nuvem: depois da troca, o que existir só lá some
    const r = await sync.sincronizar();
    if (r.resultado !== "ok") throw new Error("Não foi possível sincronizar agora.");
    const atual = await consultarStatus();
    if (!atual) throw new Error("Não foi possível consultar a nuvem agora.");
    const antigas = chavesAtuais;
    const c = await novaChaveCustodia();
    // as chaves novas são gravadas antes: se a troca passar e a página fechar no meio, este aparelho
    // já tem a chave certa
    const reg = await guardarChaves(c.chaves, atual.key_version + 1, c.params.kid);
    informar("Atualizando a proteção da nuvem…");
    const { data, error } = await rpc("vault_rotate", { p_expected_version: atual.key_version, p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
    if (error || !data?.ok) {
      // sem resposta, a troca pode ter passado: confere pelo kid antes de voltar às chaves antigas
      const depois = await consultarStatus();
      if (kidDe(depois) !== c.params.kid) { await gravarChaves(uid, antigas); throw new Error(data?.message || "Não foi possível atualizar agora."); }
    }
    await consultarStatus();
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    sync = null;
    store.gravar(estadoVazio(uid));
    await iniciarSync(reg);
    return reg;
  }

  // Aparelho sem as chaves: busca a chave no servidor (basta estar na conta).
  async function abrirPeloServidor() {
    informar("Abrindo seus dados da nuvem…");
    const r = await servidorChave();
    if (r.ok && r.dek) {
      if (!(await prepararDono())) { informar("Cancelado: os dados deste navegador foram mantidos."); return; }
      const chaves = await chavesDeDekBase64(r.dek);
      const reg = await guardarChaves({ ...chaves, entregue: true }, status.key_version, r.kid || kidDe(status));
      informar("Baixando seus dados…");
      await iniciarSync(reg);
      aoMudar?.(texto);
      return;
    }
    if (r.code === "KEY_PENDING") {
      // Ninguém entregou a chave desta nuvem (formato antigo, chave perdida). Um aparelho com
      // lançamentos assume a nuvem com uma chave nova e reenvia o que tem; um aparelho vazio espera.
      if (motor.pronto() && temDados(motor.ler())) { await assumirNuvem(); return; }
      esperando = true;
      informar("Aguardando a chave da nuvem.");
      clearInterval(timerEspera);
      timerEspera = setInterval(() => { if (document.visibilityState === "visible" && esperando && !sync) atualizar(); }, 10000);
      return;
    }
    informar(r.message || "Não foi possível abrir a nuvem agora.");
    clearInterval(timerEspera);
    timerEspera = setInterval(() => { if (document.visibilityState === "visible" && !sync) atualizar(); }, 30000);
  }

  // Nuvem nova (primeira vez com o Pro): liga sozinha, sem botão.
  async function criarNuvem() {
    if (criandoOuAssumindo) return;
    if (!motor.pronto()) { // bloqueado pela senha local ou no exemplo: tenta de novo em instantes
      clearInterval(timerEspera);
      timerEspera = setInterval(() => { if (document.visibilityState === "visible" && !sync) atualizar(); }, 10000);
      return;
    }
    criandoOuAssumindo = true;
    try {
      if (!(await prepararDono())) return;
      const c = await novaChaveCustodia();
      const { data, error } = await rpc("vault_create", { p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
      if (error || !data?.ok) { informar(data?.message || "Não foi possível ligar a nuvem agora."); return; }
      await consultarStatus();
      const reg = await guardarChaves(c.chaves, status?.key_version ?? 1, c.params.kid);
      store.gravar(estadoVazio(uid));
      informar("Enviando seus dados com criptografia…");
      await iniciarSync(reg);
    } finally { criandoOuAssumindo = false; }
  }

  // A nuvem existe, mas ninguém tem a chave: este aparelho (com lançamentos) troca a chave e reenvia
  // tudo o que tem. Os outros aparelhos recebem a chave nova pelo servidor e somam o que só eles têm.
  async function assumirNuvem() {
    if (criandoOuAssumindo) return;
    criandoOuAssumindo = true;
    try {
      if (!(await prepararDono())) return;
      const c = await novaChaveCustodia();
      const reg = await guardarChaves(c.chaves, status.key_version + 1, c.params.kid);
      const { data, error } = await rpc("vault_rotate", { p_expected_version: status.key_version, p_key_params: c.params, p_wrapped_key: c.wrapped, p_recovery_wrapped_key: c.recovery });
      if (error || !data?.ok) {
        const depois = await consultarStatus();
        if (kidDe(depois) !== c.params.kid) { await apagarChaves(uid); informar(data?.message || "Não foi possível abrir a nuvem agora."); return; }
      }
      await consultarStatus();
      store.gravar(estadoVazio(uid));
      informar("Reenviando seus dados com uma chave nova…");
      await iniciarSync(reg);
    } finally { criandoOuAssumindo = false; }
  }

  function pararEspera() { esperando = false; clearInterval(timerEspera); timerEspera = null; }

  async function atualizar() {
    if (!uid) return;
    $("wcNuvem").hidden = true;
    if (!(await consultarStatus())) { informar("Não foi possível consultar a nuvem agora."); return; }
    if (sync) return;
    if (!status.exists) {
      pararEspera();
      if (status.entitled) await criarNuvem(); else informar("A nuvem faz parte do plano Pro.");
      return;
    }
    const chaves = await lerChaves(uid);
    if (chaves && (chaves.kid || null) !== kidDe(status)) {
      // guardadas antes de uma troca de chave feita em outro aparelho
      await apagarChaves(uid);
      localStorage.removeItem(chaveEstado(uid));
    } else if (chaves) {
      // registro de antes de existir a versão: vale para a versão atual (o kid confere)
      const reg = chaves.versao == null ? await guardarChaves(chaves, status.key_version, kidDe(status)) : chaves;
      informar("Conectando…");
      if (await prepararDono()) await iniciarSync(reg);
      return;
    }
    await abrirPeloServidor();
  }

  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") rodar(); });
  window.addEventListener("online", () => rodar());

  async function parar(esquecerChaves) {
    clearInterval(timerPeriodico); clearTimeout(timerMudanca);
    pararEspera();
    sync = null; texto = ""; chavesAtuais = null;
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
    esperandoChave: () => esperando && !sync,
  };
}
