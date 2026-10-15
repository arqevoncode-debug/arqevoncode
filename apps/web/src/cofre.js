// Criptografia da nuvem. Cada registro é cifrado no aparelho; o servidor guarda texto cifrado.
//
// DEK (chave dos dados): 32 bytes aleatórios criados no aparelho. Dela saem, por HKDF,
//   - a chave AES-GCM que cifra cada registro;
//   - a chave HMAC que gera o id opaco de cada registro (o servidor não sabe o que é cada item).
// Acesso só pelo e-mail (desde 2026-10-15): a DEK fica no aparelho e sob custódia da Arqevon
// (license-manager, /api/v1/vault/key, cifrada com uma chave mestra que não fica no banco). Cada DEK
// nova tem um `kid` público em key_params: o aparelho sabe se a chave que guarda é a atual.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64 = bytes => {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = bytes => b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const aleatorio = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

/**
 * Chaves de trabalho, não exportáveis, derivadas da DEK. `dek` guarda a própria DEK para este
 * aparelho poder entregá-la à custódia do servidor (exportável por necessidade da Web Crypto).
 */
async function chavesDaDek(dek) {
  const base = await subtle.importKey("raw", dek, "HKDF", false, ["deriveKey"]);
  const hkdf = info => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) });
  const [cifra, ids, guardada] = await Promise.all([
    subtle.deriveKey(hkdf("arqevon/v1/registro"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    subtle.deriveKey(hkdf("arqevon/v1/id"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]),
    subtle.importKey("raw", dek, { name: "AES-GCM" }, true, ["encrypt"]),
  ]);
  return { cifra, ids, dek: guardada };
}

/**
 * Chave nova da nuvem com custódia (acesso só pelo e-mail, desde 2026-10-15): a DEK fica no aparelho
 * e é entregue ao servidor, que a guarda cifrada com a chave mestra. Os campos de embrulho do cofre
 * (exigidos pelo banco) levam só um marcador.
 */
export async function novaChaveCustodia() {
  const dek = aleatorio(32);
  const params = { v: 3, custodia: "servidor", kid: b64url(aleatorio(12)) };
  const chaves = await chavesDaDek(dek);
  dek.fill(0);
  return { params, wrapped: MARCA_CUSTODIA, recovery: MARCA_CUSTODIA, chaves };
}
export const MARCA_CUSTODIA = "custodia-do-servidor";

/** DEK em base64 (para entregar ao servidor) a partir das chaves guardadas no aparelho. */
export async function dekEmBase64(chaves) {
  return b64(await subtle.exportKey("raw", chaves.dek));
}

/** Chaves de trabalho a partir da DEK recebida do servidor. */
export async function chavesDeDekBase64(dekB64) {
  const dek = deB64(dekB64);
  if (dek.length !== 32) throw new Error("Chave inválida.");
  const chaves = await chavesDaDek(dek);
  dek.fill(0);
  return chaves;
}

/** Id opaco e estável de um registro: o mesmo em todos os aparelhos, sem revelar o conteúdo. */
export async function idDoItem(chaves, colecao, id) {
  const mac = await subtle.sign("HMAC", chaves.ids, enc.encode(`${colecao}:${id}`));
  return b64url(mac);
}

/** Cifra {c, r}. O id do item entra como dado autenticado: um texto cifrado não troca de lugar. */
export async function cifrarItem(chaves, itemId, colecao, registro) {
  const iv = aleatorio(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(itemId) },
    chaves.cifra, enc.encode(JSON.stringify({ c: colecao, r: registro })));
  const saida = new Uint8Array(12 + ct.byteLength);
  saida.set(iv); saida.set(new Uint8Array(ct), 12);
  return b64(saida);
}

export async function decifrarItem(chaves, itemId, ctB64) {
  const bytes = deB64(ctB64);
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12), additionalData: enc.encode(itemId) },
    chaves.cifra, bytes.subarray(12));
  const { c, r } = JSON.parse(dec.decode(pt));
  return { colecao: c, registro: r };
}

/** Impressão digital do conteúdo de um registro, para saber se mudou desde a última sincronização. */
export async function hashRegistro(registro) {
  const d = await subtle.digest("SHA-256", enc.encode(JSON.stringify(registro)));
  return b64url(d).slice(0, 22);
}
