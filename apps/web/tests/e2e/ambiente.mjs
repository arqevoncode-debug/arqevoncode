// Ambiente dos testes de navegador: serve um build do app web e abre o Chrome com "hoje" fixo.
// Os testes usam só o modo "usar sem conta": nada sai do navegador e nenhuma conta é tocada.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

export const HTML_PADRAO = resolve(import.meta.dirname, "../../dist/index.html");
export const HOJE = "2026-10-13T12:00:00";
export const VAZIO = () => ({ lancamentos: [], fixos: [], parcelamentos: [], objetivos: [], orcamentos: [] });

const CANDIDATOS_CHROME = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

export async function servir(arquivo = process.env.ARQEVON_WEB_HTML || HTML_PADRAO) {
  if (!existsSync(arquivo)) throw new Error(`${arquivo} não existe. Rode npm run build antes.`);
  // Arquivos do PWA (manifesto, ícones, service worker) ao lado do index.html; o resto é a página.
  const TIPOS = { ".webmanifest": "application/manifest+json", ".js": "text/javascript", ".png": "image/png" };
  const servidor = createServer(async (req, res) => {
    const nome = new URL(req.url, "http://x").pathname.slice(1);
    const tipo = TIPOS[nome.slice(nome.lastIndexOf("."))];
    if (tipo && /^[\w.-]+$/.test(nome)) {
      try {
        const corpo = await readFile(resolve(arquivo, "..", nome));
        res.writeHead(200, { "content-type": tipo, "cache-control": "no-store" });
        return res.end(corpo);
      } catch { res.writeHead(404); return res.end(); }
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(await readFile(arquivo));
  });
  await new Promise(ok => servidor.listen(0, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${servidor.address().port}/`, fechar: () => new Promise(ok => servidor.close(ok)) };
}

export async function navegador() {
  const executablePath = CANDIDATOS_CHROME.find(c => existsSync(c));
  if (!executablePath) throw new Error("Chrome não encontrado. Defina CHROME_PATH.");
  return puppeteer.launch({ executablePath, headless: "new", args: ["--no-sandbox"] });
}

/**
 * Abre o app num perfil limpo.
 * @param {object} o
 * @param {string} o.url endereço do servidor
 * @param {object} [o.dados] estado inicial do motor
 * @param {string} [o.hoje] data e hora simuladas
 * @param {number} [o.aceleraIdle] divide os timers de 1 min ou mais (bloqueio por inatividade)
 * @param {boolean} [o.sw] deixa o service worker atuar (só no teste do PWA)
 * @param {object} [o.extra] outras chaves do localStorage a gravar antes de abrir
 * @param {"pro"|"gratis"} [o.plano] plano do motor no modo sem conta (padrão: pro)
 */
export async function abrir(browser, { url, dados = null, hoje = HOJE, vp = { width: 1400, height: 1000 }, aceleraIdle = 1, sw = false, extra = null, plano = "pro" }) {
  // Contra a produção, um ritmo calmo: rajadas de acessos do mesmo IP disparam a proteção contra
  // robôs da Vercel (403 "Security Checkpoint" por uns 10 minutos, só para esse IP).
  if (process.env.ARQEVON_WEB_URL) await espera(2000);
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport(vp);
  // O service worker só entra no teste do PWA: nos outros, as requisições vão direto à rede.
  if (!sw) await p.setBypassServiceWorker(true);
  p.erros = [];
  p.on("pageerror", e => p.erros.push(e.message));
  p.respostas = []; // respostas para alert/confirm/prompt, na ordem (false = cancelar)
  p.vistos = [];
  p.on("dialog", async d => {
    p.vistos.push(`${d.type()}: ${d.message().replace(/ /g, " ")}`);
    const r = p.respostas.shift();
    if (r === false) await d.dismiss(); else await d.accept(typeof r === "string" ? r : undefined);
  });
  await p.evaluateOnNewDocument((iso, fator) => {
    let t = new Date(iso).getTime(); const D = Date;
    window.Date = class extends D { constructor(...a) { a.length ? super(...a) : super(t); } static now() { return t++; } };
    if (fator > 1) {
      const st = window.setTimeout;
      window.setTimeout = (fn, ms, ...a) => st(fn, ms >= 60000 ? ms / fator : ms, ...a);
    }
  }, hoje, aceleraIdle);
  // A maioria dos testes exercita os recursos completos: o motor começa no Pro. Os testes do plano
  // grátis passam plano: "gratis".
  if (plano === "pro") await p.evaluateOnNewDocument(() => { window.__ARQEVON_TESTE_PRO__ = true; });
  await p.goto(url);
  await p.evaluate((d, x) => {
    localStorage.clear();
    localStorage.setItem("arqevon-web-local", "1");
    // o convite de criptografia já foi oferecido: a janela não abre em todo teste
    localStorage.setItem("meu-financeiro-v1-seg", JSON.stringify({ convite: true }));
    if (d) localStorage.setItem("meu-financeiro-v1", JSON.stringify(d));
    if (x) for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
  }, dados, extra);
  await p.reload();
  await p.waitForSelector("#formLanc");
  await espera(200);
  p.fechar = () => ctx.close();
  return p;
}

export const espera = ms => new Promise(r => setTimeout(r, ms));
export const lerDados = p => p.evaluate(() => {
  const bruto = localStorage.getItem("meu-financeiro-v1");
  try { return JSON.parse(bruto); } catch { return bruto; }
});
export const aba = (p, nome) => p.evaluate(n => ativarAba(n), nome);
export const texto = (p, sel) => p.$eval(sel, e => e.innerText.replace(/ /g, " "));
export const limparEDigitar = async (p, sel, valor) => { await p.$eval(sel, e => { e.value = ""; }); await p.type(sel, valor); };

export async function desbloquear(p, senha = "segredo123") {
  await p.type("#tbSenha", senha);
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector("#telaBloqueio").hidden, { timeout: 15000 });
}

/** Cria o servidor e o navegador uma vez por arquivo de teste. */
export function preparar(t) {
  const ctx = {};
  // ARQEVON_WEB_URL roda a mesma bateria contra um endereço publicado (ex.: a produção, depois do deploy).
  t.before(async () => {
    ctx.srv = process.env.ARQEVON_WEB_URL ? { url: process.env.ARQEVON_WEB_URL, fechar: async () => {} } : await servir();
    ctx.browser = await navegador();
  });
  t.after(async () => { await ctx.browser?.close(); await ctx.srv?.fechar(); });
  ctx.abrir = (o = {}) => abrir(ctx.browser, { url: ctx.srv.url, ...o });
  return ctx;
}
