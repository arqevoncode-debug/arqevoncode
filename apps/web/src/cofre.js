// Criptografia do cofre na nuvem. Tudo acontece no aparelho: o servidor só recebe texto cifrado,
// a chave dos dados embrulhada e os parâmetros (públicos) para derivar as chaves de embrulho.
//
// DEK (chave dos dados): 32 bytes aleatórios, criada uma vez por conta. Dela saem, por HKDF,
//   - a chave AES-GCM que cifra cada registro;
//   - a chave HMAC que gera o id opaco de cada registro (o servidor não sabe o que é cada item).
// A DEK é guardada na nuvem embrulhada duas vezes: pela senha (PBKDF2) e pela chave de
// recuperação. Trocar a senha só reembrulha a DEK; os registros não são recifrados.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const ITERACOES_SENHA = 600_000; // recomendação OWASP para PBKDF2-SHA256
const ITERACOES_RECUPERACAO = 100_000; // a chave de recuperação já tem 160 bits de entropia
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // base32 sem 0/O/1/I, para ditar sem erro

export const b64 = bytes => {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000));
  return btoa(s);
};
export const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64url = bytes => b64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const aleatorio = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Chave de recuperação: 32 caracteres em 8 grupos de 4 (160 bits). */
export function gerarChaveRecuperacao() {
  const bytes = aleatorio(20);
  let bits = 0, valor = 0, out = "";
  for (const b of bytes) {
    valor = (valor << 8) | b; bits += 8;
    while (bits >= 5) { out += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  return out.match(/.{4}/g).join("-");
}

/** Aceita a chave digitada com espaços, hífens ou minúsculas; null se não tem o formato. */
export function normalizarChaveRecuperacao(texto) {
  const limpa = String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpa.length !== 32 || [...limpa].some(c => !ALFABETO.includes(c))) return null;
  return limpa.match(/.{4}/g).join("-");
}

async function derivarKek(segredo, saltB64, iteracoes) {
  const material = await subtle.importKey("raw", enc.encode(segredo), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", salt: deB64(saltB64), iterations: iteracoes, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function embrulhar(kek, dek) {
  const iv = aleatorio(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, kek, dek);
  return `${b64(iv)}.${b64(ct)}`;
}

async function desembrulhar(kek, embrulhada) {
  const [iv, ct] = String(embrulhada).split(".");
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: deB64(iv) }, kek, deB64(ct)));
}

/** Chaves de trabalho, não exportáveis, derivadas da DEK. */
async function chavesDaDek(dek) {
  const base = await subtle.importKey("raw", dek, "HKDF", false, ["deriveKey"]);
  const hkdf = info => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode(info) });
  const [cifra, ids] = await Promise.all([
    subtle.deriveKey(hkdf("arqevon/v1/registro"), base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]),
    subtle.deriveKey(hkdf("arqevon/v1/id"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, ["sign"]),
  ]);
  return { cifra, ids };
}

/** Cria o cofre: DEK nova embrulhada pela senha e pela chave de recuperação. */
export async function criarCofre(senha, chaveRecuperacao, iteracoes = ITERACOES_SENHA) {
  const dek = aleatorio(32);
  const params = { v: 1, kdf: "PBKDF2-SHA256", iter: iteracoes, salt: b64(aleatorio(16)), rsalt: b64(aleatorio(16)), riter: ITERACOES_RECUPERACAO };
  const [kek, rkek] = await Promise.all([
    derivarKek(senha, params.salt, params.iter),
    derivarKek(chaveRecuperacao, params.rsalt, params.riter),
  ]);
  const [wrapped, recovery] = await Promise.all([embrulhar(kek, dek), embrulhar(rkek, dek)]);
  return { params, wrapped, recovery, chaves: await chavesDaDek(dek) };
}

/** Abre o cofre com a senha. Senha errada lança erro (a autenticação do GCM falha). */
export async function abrirComSenha(status, senha) {
  const p = status.key_params;
  const dek = await desembrulhar(await derivarKek(senha, p.salt, p.iter), status.wrapped_key);
  return chavesDaDek(dek);
}

/**
 * Abre com a chave de recuperação e já define uma senha nova. Devolve as chaves e o que gravar
 * com vault_rekey. A chave de recuperação continua a mesma (o embrulho dela não muda).
 */
export async function recuperarComChave(status, chaveRecuperacao, novaSenha, iteracoes = ITERACOES_SENHA) {
  const p = status.key_params;
  const dek = await desembrulhar(await derivarKek(chaveRecuperacao, p.rsalt, p.riter), status.recovery_wrapped_key);
  const params = { ...p, iter: iteracoes, salt: b64(aleatorio(16)) };
  const wrapped = await embrulhar(await derivarKek(novaSenha, params.salt, params.iter), dek);
  return { params, wrapped, recovery: status.recovery_wrapped_key, chaves: await chavesDaDek(dek) };
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
