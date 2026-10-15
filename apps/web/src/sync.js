// Motor de sincronização por registro. Não conhece DOM nem Supabase: recebe tudo por injeção,
// para ser testado com dois "aparelhos" e um servidor falso (tests/sync.test.mjs).
//
// Regras:
// - Cada registro (lançamento, fixo, parcelamento, objetivo, limite) é um item cifrado na nuvem.
// - Mudança local ainda não enviada vence a remota no mesmo registro: o usuário nunca perde o que
//   acabou de digitar. Fora disso, vale a ordem do servidor (rev).
// - Nunca sincroniza com o app bloqueado, nem aplica mudanças enquanto o usuário edita um campo.
// - Apagar muita coisa de uma vez pede confirmação; recusada, os registros voltam da nuvem.
import { idDoItem, cifrarItem, decifrarItem, hashRegistro } from "./cofre.js";

export const COLECOES = ["lancamentos", "fixos", "parcelamentos", "objetivos", "orcamentos"];
const LOTE = 500;

export function estadoVazio(owner) {
  return { v: 1, owner, lastRev: 0, itens: {}, ultimaSync: null };
}

const copiar = dados => Object.fromEntries(COLECOES.map(c => [c, (dados?.[c] || []).map(r => r)]));

export class Sincronizador {
  /**
   * @param {object} o
   * @param {(fn: string, args?: object) => Promise<{data: any, error: any}>} o.rpc
   * @param {{cifra: CryptoKey, ids: CryptoKey}} o.chaves
   * @param {{ler: () => object, gravar: (estado: object) => void}} o.store
   * @param {{pronto: () => boolean, editando: () => boolean, ler: () => object, gravar: (dados: object) => void}} o.motor
   * @param {(msg: string) => Promise<boolean>} [o.confirmar]
   * @param {number|null} [o.versao] versão da chave (key_version) com que estas chaves valem. Se a
   *   nuvem estiver noutra versão, a chave foi trocada em outro aparelho: erro KEY_CHANGED, sem
   *   gravar nada (cifrar com a chave antiga deixaria registros que ninguém mais abre).
   */
  constructor({ rpc, chaves, store, motor, confirmar = async () => false, versao = null }) {
    Object.assign(this, { rpc, chaves, store, motor, confirmar, versao });
    this.idCache = new Map();
    this.rodando = null;
  }

  async idDe(colecao, id) {
    const k = `${colecao}:${id}`;
    if (!this.idCache.has(k)) this.idCache.set(k, await idDoItem(this.chaves, colecao, id));
    return this.idCache.get(k);
  }

  async mapaLocal(dados) {
    const mapa = new Map();
    for (const c of COLECOES) {
      for (const registro of dados[c] || []) {
        if (registro?.id == null) continue;
        const itemId = await this.idDe(c, registro.id);
        mapa.set(itemId, { c, id: registro.id, h: await hashRegistro(registro), registro });
      }
    }
    return mapa;
  }

  async chamar(fn, args) {
    const { data, error } = await this.rpc(fn, args);
    if (error) throw Object.assign(new Error(error.message || String(error)), { code: "REDE" });
    if (data && data.ok === false) throw Object.assign(new Error(data.message), { code: data.code });
    return data;
  }

  /** Baixa tudo depois de `desde`, decifrado. Devolve {itens: Map(itemId → {deleted}|{colecao, registro}), ate}. */
  async baixar(desde) {
    const itens = new Map();
    let since = desde;
    for (;;) {
      const r = await this.chamar("vault_pull", { p_since: since, p_limit: 1000 });
      if (this.versao != null && r.key_version != null && r.key_version !== this.versao) {
        throw Object.assign(new Error("A chave da nuvem foi trocada em outro aparelho."), { code: "KEY_CHANGED" });
      }
      for (const it of r.items) {
        if (it.deleted) { itens.set(it.id, { deleted: true }); continue; }
        // um item que não abre (gravado por uma versão com defeito, corrompido) é pulado: travar a
        // sincronização inteira por causa dele deixaria todo o resto parado para sempre
        try { itens.set(it.id, await decifrarItem(this.chaves, it.id, it.ct)); }
        catch { this.ilegiveis = (this.ilegiveis || 0) + 1; }
      }
      since = r.until;
      if (!r.has_more) return { itens, ate: since };
    }
  }

  /** Uma rodada completa. Rodadas simultâneas viram uma só. */
  sincronizar() {
    if (!this.rodando) this.rodando = this.rodada().finally(() => { this.rodando = null; });
    return this.rodando;
  }

  async rodada() {
    if (!this.motor.pronto()) return { resultado: "bloqueado" };
    const st = this.store.ler();

    // 1. O que mudou na nuvem desde a última vez.
    const { itens: remoto, ate } = await this.baixar(st.lastRev);

    // 2. Mescla na cópia local. Mudança local pendente vence.
    const atual = this.motor.ler();
    const lido = JSON.stringify(atual);
    // A pessoa pode ter lançado algo enquanto a rodada decifrava e calculava: gravar a mescla por
    // cima apagaria o que acabou de entrar. Nesse caso a rodada fica para a próxima.
    const mudouAqui = () => JSON.stringify(this.motor.ler()) !== lido;
    const local = await this.mapaLocal(atual);
    const novo = copiar(atual);
    let mudou = false;

    for (const [itemId, rem] of remoto) {
      const conhecido = st.itens[itemId];
      const loc = local.get(itemId);
      const pendenteLocal = loc ? (!conhecido || conhecido.h !== loc.h) : !!conhecido;
      if (rem.deleted) {
        if (pendenteLocal && loc) continue; // editado aqui: a edição será reenviada
        if (loc) {
          novo[loc.c] = novo[loc.c].filter(r => r.id !== loc.id);
          mudou = true;
        }
        delete st.itens[itemId];
        continue;
      }
      const h = await hashRegistro(rem.registro);
      if (loc && loc.h === h) { st.itens[itemId] = { c: loc.c, id: loc.id, h }; continue; }
      if (pendenteLocal) {
        // Objetivo mexido nos dois aparelhos: os aportes de cada lado são dinheiro guardado de
        // verdade; ficam os dois (união por id) e o resultado é reenviado.
        if (loc && rem.colecao === "objetivos" && loc.c === "objetivos") {
          const aportes = [...(loc.registro.aportes || [])];
          for (const a of rem.registro.aportes || []) if (!aportes.some(x => String(x.id) === String(a.id))) aportes.push(a);
          if (aportes.length !== (loc.registro.aportes || []).length) {
            const lista = novo.objetivos;
            const i = lista.findIndex(x => x.id === loc.id);
            if (i >= 0) { lista[i] = { ...lista[i], aportes }; mudou = true; }
          }
          st.itens[itemId] = { c: loc.c, id: loc.id, h }; // a versão mesclada difere e será enviada
        }
        continue; // alterado ou apagado aqui e ainda não enviado
      }
      if (!COLECOES.includes(rem.colecao)) continue;
      const lista = novo[rem.colecao];
      const i = lista.findIndex(r => r.id === rem.registro.id);
      if (i >= 0) lista[i] = rem.registro; else lista.push(rem.registro);
      st.itens[itemId] = { c: rem.colecao, id: rem.registro.id, h };
      mudou = true;
    }

    if (mudou) {
      // Aplicar agora apagaria o formulário em edição; tenta na próxima rodada sem avançar o rev.
      if (this.motor.editando() || mudouAqui()) return { resultado: "adiado" };
      this.motor.gravar(novo);
    }
    st.lastRev = ate;

    // 3. O que mudou aqui e ainda não foi para a nuvem.
    const final = mudou ? await this.mapaLocal(novo) : local;
    const envios = [];
    for (const [itemId, loc] of final) {
      if (st.itens[itemId]?.h !== loc.h) envios.push({ itemId, loc });
    }
    let exclusoes = Object.keys(st.itens).filter(itemId => !final.has(itemId));

    // 4. Freio contra apagar a nuvem por engano (dados locais perdidos, navegador limpo pela metade).
    const conhecidos = Object.keys(st.itens).length;
    if (exclusoes.length > 5 && exclusoes.length >= conhecidos * 0.3) {
      const ok = await this.confirmar(`Isto vai apagar ${exclusoes.length} registros também na nuvem, em todos os seus aparelhos. Continuar?`);
      if (!ok) {
        if (mudouAqui()) return { resultado: "adiado" };
        await this.restaurar(exclusoes, novo, st);
        exclusoes = [];
      }
    }

    const lote = [];
    for (const { itemId, loc } of envios) lote.push({ id: itemId, ct: await cifrarItem(this.chaves, itemId, loc.c, loc.registro), _c: loc.c, _id: loc.id, _h: loc.h });
    for (const itemId of exclusoes) lote.push({ id: itemId, deleted: true });

    for (let i = 0; i < lote.length; i += LOTE) {
      const parte = lote.slice(i, i + LOTE);
      const itens = parte.map(({ id, ct, deleted }) => (deleted ? { id, deleted: true } : { id, ct }));
      const r = await this.chamar("vault_push", this.versao != null ? { p_items: itens, p_key_version: this.versao } : { p_items: itens });
      for (const it of parte) {
        if (it.deleted) delete st.itens[it.id];
        else st.itens[it.id] = { c: it._c, id: it._id, h: it._h };
      }
      // Se ninguém gravou entre o nosso pull e este push, já estamos em dia até last_rev.
      // Caso contrário, mantém o rev: a próxima rodada baixa o que outro aparelho gravou.
      if (r.from_rev === st.lastRev) st.lastRev = r.last_rev;
      this.store.gravar(st); // progresso salvo a cada lote: uma queda não reenvia tudo
    }

    st.ultimaSync = new Date().toISOString();
    this.store.gravar(st);
    return { resultado: "ok", recebidos: remoto.size, enviados: envios.length, apagados: exclusoes.length };
  }

  /** Traz de volta da nuvem os registros que seriam apagados. */
  async restaurar(itemIds, novo, st) {
    const alvo = new Set(itemIds);
    const { itens } = await this.baixar(0);
    for (const [itemId, rem] of itens) {
      if (!alvo.has(itemId) || rem.deleted || !COLECOES.includes(rem.colecao)) continue;
      const lista = novo[rem.colecao];
      if (!lista.some(r => r.id === rem.registro.id)) lista.push(rem.registro);
    }
    this.motor.gravar(novo);
  }
}
