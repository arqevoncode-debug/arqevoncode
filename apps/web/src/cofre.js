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

/**
 * Chaves de trabalho, não exportáveis, derivadas da DEK. `dek` guarda a própria DEK para este
 * aparelho poder liberar outro (selarParaAparelho). Ela é exportável por necessidade da Web Crypto;
 * não piora o caso de um script malicioso na página, que já poderia decifrar tudo com `cifra`.
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

// ---------- Liberar um aparelho novo aprovando em outro ----------
// O aparelho novo mostra um código de 8 caracteres (40 bits) que nunca vai ao servidor e envia uma
// chave pública ECDH com uma etiqueta: PBKDF2(código, sal = chave pública). No aparelho aberto, a
// pessoa digita o código; a etiqueta conferida prova que a chave pública é a do aparelho que mostra o
// código (o servidor não consegue trocá-la sem o código, e 100 mil iterações tornam inviável
// adivinhá-lo nos minutos em que o pedido vale). A DEK vai cifrada com ECDH + o próprio código.
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const ITERACOES_CODIGO = 100_000;

export function gerarCodigoAparelho() {
  let valor = 0n;
  for (const b of aleatorio(5)) valor = (valor << 8n) | BigInt(b);
  let out = "";
  for (let i = 7; i >= 0; i--) out += ALFABETO[Number((valor >> BigInt(i * 5)) & 31n)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Aceita o código digitado com espaço, hífen ou minúsculas; null se não tem o formato. */
export function normalizarCodigoAparelho(texto) {
  const limpa = String(texto ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpa.length !== 8 || [...limpa].some(c => !ALFABETO.includes(c))) return null;
  return `${limpa.slice(0, 4)}-${limpa.slice(4)}`;
}

async function etiquetaCodigo(codigo, pubB64) {
  const material = await subtle.importKey("raw", enc.encode(codigo), "PBKDF2", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "PBKDF2", salt: deB64(pubB64), iterations: ITERACOES_CODIGO, hash: "SHA-256" }, material, 256);
  return b64(bits);
}

async function chaveDoPacote(privada, pubOutroB64, codigo, id) {
  const outro = await subtle.importKey("raw", deB64(pubOutroB64), ECDH, false, []);
  const segredo = await subtle.deriveBits({ name: "ECDH", public: outro }, privada, 256);
  const base = await subtle.importKey("raw", segredo, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: enc.encode(codigo), info: enc.encode(`arqevon/v1/aparelho:${id}`) },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

const erroCodigo = (code, message) => Object.assign(new Error(message), { code });

/** Aparelho novo: par de chaves (a privada não sai do aparelho), código para mostrar e etiqueta. */
export async function novoPedidoAparelho() {
  const par = await subtle.generateKey(ECDH, false, ["deriveBits"]);
  const pub = b64(await subtle.exportKey("raw", par.publicKey));
  const codigo = gerarCodigoAparelho();
  return { par, pub, codigo, tag: await etiquetaCodigo(codigo, pub) };
}

/**
 * Aparelho aberto: confere o código digitado contra o pedido e cifra a DEK para o aparelho novo.
 * Erros com `code`: CODIGO_FORMATO, CODIGO_ERRADO ou SEM_DEK (chaves salvas antes desta versão).
 */
export async function selarParaAparelho(chaves, pedido, codigoDigitado) {
  const codigo = normalizarCodigoAparelho(codigoDigitado);
  if (!codigo) throw erroCodigo("CODIGO_FORMATO", "O código tem 8 letras e números, como K7M2-Q9XD.");
  if ((await etiquetaCodigo(codigo, pedido.device_pub)) !== pedido.device_tag) {
    throw erroCodigo("CODIGO_ERRADO", "O código não confere. Confira no aparelho novo e digite de novo.");
  }
  if (!chaves?.dek) throw erroCodigo("SEM_DEK", "Confirme a senha da nuvem neste aparelho uma vez para poder liberar outros.");
  const dek = new Uint8Array(await subtle.exportKey("raw", chaves.dek));
  const par = await subtle.generateKey(ECDH, false, ["deriveBits"]);
  const chave = await chaveDoPacote(par.privateKey, pedido.device_pub, codigo, pedido.id);
  const iv = aleatorio(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(pedido.id) }, chave, dek);
  dek.fill(0);
  return JSON.stringify({ v: 1, pub: b64(await subtle.exportKey("raw", par.publicKey)), iv: b64(iv), ct: b64(ct) });
}

/** Aparelho novo: abre o pacote com a própria chave privada e o código que mostrou. */
export async function abrirPacoteAparelho(pedido, id, selado) {
  const s = JSON.parse(selado);
  const chave = await chaveDoPacote(pedido.par.privateKey, s.pub, pedido.codigo, id);
  const dek = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: deB64(s.iv), additionalData: enc.encode(id) }, chave, deB64(s.ct)));
  return chavesDaDek(dek);
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
