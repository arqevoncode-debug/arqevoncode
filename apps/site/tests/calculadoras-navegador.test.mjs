// Calculadoras no Chrome: sobe o build (`next start`) e usa as páginas como uma pessoa usaria.
// Precisa de `npm run build` antes (o `npm test` já faz). Chrome do sistema ou CHROME_PATH.
// Depois do deploy: ARQEVON_SITE_URL=https://arqevoncode.com.br roda a mesma bateria na produção.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";
import puppeteer from "puppeteer-core";

const root = fileURLToPath(new URL("../", import.meta.url));
const HOJE = "2026-10-30T12:00:00"; // a 1ª parcela de uma compra nova cai em novembro/2026
const CHROME = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean).find(c => existsSync(c));
const CELULAR = { width: 390, height: 844, isMobile: true, hasTouch: true };
const PAGINAS = ["/calculadoras", "/calculadoras/50-30-20", "/calculadoras/parcela-e-renda", "/calculadoras/reserva-de-emergencia"];

let servidor, base, browser;

const portaLivre = () => new Promise((ok, falha) => {
  const s = createServer().once("error", falha).listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const REMOTO = process.env.ARQEVON_SITE_URL?.replace(/\/+$/, "");

test.before(async () => {
  assert.ok(CHROME, "Chrome não encontrado: defina CHROME_PATH");
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  if (REMOTO) { base = REMOTO; return; }
  assert.ok(existsSync(new URL("../.next/BUILD_ID", import.meta.url)), "rode npm run build antes");
  const porta = await portaLivre();
  base = `http://127.0.0.1:${porta}`;
  servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(porta), "-H", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/calculadoras`)).ok) break; } catch { /* ainda subindo */ }
    await new Promise(r => setTimeout(r, 200));
  }
});

test.after(async () => {
  await browser?.close();
  servidor?.kill();
});

/** Abre uma página com a data fixa, guardando erros e requisições feitas depois do carregamento. */
async function abrir(caminho, vp = { width: 1366, height: 900 }) {
  // na produção, ritmo calmo: rajadas do mesmo IP disparam a proteção contra robôs da Vercel (403)
  if (REMOTO) await new Promise(r => setTimeout(r, 2000));
  const p = await browser.newPage();
  await p.setViewport(vp);
  p.erros = [];
  p.on("pageerror", e => p.erros.push(e.message));
  p.on("console", m => { if (m.type() === "error") p.erros.push(m.text()); });
  await p.evaluateOnNewDocument(iso => {
    const t = new Date(iso).getTime(), D = Date;
    window.Date = class extends D { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
  }, HOJE);
  await p.goto(base + caminho, { waitUntil: "networkidle0" });
  p.pedidos = [];
  p.on("request", r => p.pedidos.push({ metodo: r.method(), url: r.url(), corpo: r.postData() || "" }));
  return p;
}

const limpo = s => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const resultado = p => p.$eval(".calc-resultado", e => e.innerText).then(limpo);
// o rótulo "Exemplo" é maiúsculo por CSS (innerText devolve "EXEMPLO"): confere pelo elemento
const temExemplo = async p => (await p.$(".calc-exemplo")) !== null;

/** Input pelo texto do rótulo (como um leitor de tela o encontraria). */
async function campo(p, rotulo) {
  const h = await p.evaluateHandle(r => [...document.querySelectorAll("label.calc-campo")]
    .find(l => l.querySelector("span")?.textContent.startsWith(r))?.querySelector("input") ?? null, rotulo);
  const el = h.asElement();
  assert.ok(el, `campo não encontrado: ${rotulo}`);
  return el;
}
async function digitar(p, rotulo, texto) {
  const el = await campo(p, rotulo);
  await el.click({ clickCount: 3 });
  for (let i = 0; i < 14; i++) await p.keyboard.press("Backspace");
  if (texto) await el.type(texto);
}
const opcao = (p, nome) => p.evaluateHandle(n => [...document.querySelectorAll(".calc-opcoes label")]
  .find(l => l.querySelector("strong")?.textContent === n)?.querySelector("input"), nome).then(h => h.asElement());

test("índice: três calculadoras com exemplo e link para cada uma", async () => {
  const p = await abrir("/calculadoras");
  const cartoes = await p.$$eval(".calc-indice .calc-cartao", as => as.map(a => ({ href: a.getAttribute("href"), texto: a.innerText })));
  assert.deepEqual(cartoes.map(c => c.href), PAGINAS.slice(1));
  assert.match(limpo(cartoes[0].texto), /Ex\.: Renda de R\$ 3\.000: R\$ 1\.500 · R\$ 900 · R\$ 600/);
  assert.match(limpo(cartoes[1].texto), /Ex\.: R\$ 900 em parcelas com renda de R\$ 4\.000: 22,5%/);
  assert.match(limpo(cartoes[2].texto), /Ex\.: Gastos de R\$ 2\.500 por mês: reserva de R\$ 15\.000/);
  await Promise.all([p.waitForNavigation(), p.click('.calc-cartao[href="/calculadoras/reserva-de-emergencia"]')]);
  assert.equal(new URL(p.url()).pathname, "/calculadoras/reserva-de-emergencia");
  assert.equal(await p.$eval("h1", e => e.textContent), "Reserva de emergência");
  await Promise.all([p.waitForNavigation(), p.click(".calc-voltar")]);
  assert.equal(new URL(p.url()).pathname, "/calculadoras", "Todas as calculadoras volta ao índice");
  assert.deepEqual(p.erros, []);
  await p.close();
});

// O bug que motivou a revisão: as caixas encostavam na borda da tela e o título ficava centralizado,
// cada bloco numa margem diferente. Tudo precisa seguir a margem do cabeçalho, sem rolagem lateral.
test("layout: blocos alinhados ao cabeçalho e sem rolagem lateral", async () => {
  for (const largura of [360, 390, 768, 1024, 1366, 1600]) {
    const vp = largura < 800 ? { ...CELULAR, width: largura } : { width: largura, height: 900 };
    for (const caminho of PAGINAS) {
      const p = await abrir(caminho, vp);
      const m = await p.evaluate(() => {
        // DOMRect não atravessa para o Node: vira objeto simples
        const r = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().toJSON(); };
        const corpo = r(".calc-caixa") || r(".calc-indice");
        return { header: r(".lp-header"), h1: r(".calc-topo h1"), corpo, convite: r(".calc-convite"),
          rolagem: document.documentElement.scrollWidth - window.innerWidth };
      });
      const onde = `${caminho} a ${largura}px`;
      assert.ok(m.rolagem <= 0, `${onde}: rolagem lateral de ${m.rolagem}px`);
      assert.ok(m.header.left >= 16, `${onde}: cabeçalho sem margem`);
      for (const bloco of ["h1", "corpo", "convite"]) {
        assert.ok(Math.abs(m[bloco].left - m.header.left) <= 1, `${onde}: ${bloco} começa em ${m[bloco].left}, o cabeçalho em ${m.header.left}`);
      }
      for (const bloco of ["corpo", "convite"]) {
        assert.ok(Math.abs(m[bloco].right - m.header.right) <= 1, `${onde}: ${bloco} termina em ${m[bloco].right}, o cabeçalho em ${m.header.right}`);
      }
      await p.close();
    }
  }
});

test("celular: campos com 16px (sem zoom no iPhone) e alvos de toque de 44px", async () => {
  for (const caminho of PAGINAS) {
    const p = await abrir(caminho, CELULAR);
    const pequenos = await p.evaluate(() => [...document.querySelectorAll(".calc-campo input")]
      .filter(i => i.type !== "radio" && parseFloat(getComputedStyle(i).fontSize) < 16).length);
    assert.equal(pequenos, 0, `${caminho}: campo com fonte menor que 16px`);
    const baixos = await p.$$eval(".calc-voltar, .calc-cartao, .calc-opcoes label, .calc-dinheiro, .calc-campo input:not([type=radio]), .lp-botao, .lp-botao-sec",
      els => els.filter(e => e.getBoundingClientRect().height < 44).map(e => e.className || e.tagName));
    assert.deepEqual(baixos, [], `${caminho}: alvos de toque baixos`);
    await p.close();
  }
});

test("50/30/20: exemplo antes de digitar, conta com a renda e compara com o essencial", async () => {
  const p = await abrir("/calculadoras/50-30-20");
  let r = await resultado(p);
  assert.ok(await temExemplo(p));
  assert.match(r, /exemplo com renda de R\$ 3\.000,00/i);
  assert.match(r, /R\$ 1\.500,00.*R\$ 900,00.*R\$ 600,00/);

  await digitar(p, "Sua renda líquida", "450000");
  assert.equal(await (await campo(p, "Sua renda líquida")).evaluate(e => e.value), "4.500,00", "máscara pelos centavos");
  r = await resultado(p);
  assert.equal(await temExemplo(p), false);
  assert.match(r, /R\$ 2\.250,00.*R\$ 1\.350,00.*R\$ 900,00/);

  await digitar(p, "Quanto você gasta hoje com o essencial", "270000");
  r = await resultado(p);
  assert.match(r, /Hoje o essencial leva 60% da sua renda\. Passa dos 50% em R\$ 450,00/);
  assert.equal(await p.$eval(".calc-nota.destaque", e => e.classList.contains("ruim")), true);
  await digitar(p, "Quanto você gasta hoje com o essencial", "200000");
  assert.match(await resultado(p), /leva 44% da sua renda\. Está dentro dos 50%: sobram R\$ 250,00/);

  await digitar(p, "Sua renda líquida", "");
  assert.match(await resultado(p), /Preencha a renda para comparar/);
  assert.deepEqual(p.erros, []);
  await p.close();
});

test("campo de dinheiro aceita valor colado em formatos comuns", async () => {
  const p = await abrir("/calculadoras/50-30-20");
  for (const [colado, esperado] of [["R$ 5.000,00", "5.000,00"], ["3500", "3.500,00"], ["1.234,5", "1.234,50"]]) {
    const el = await campo(p, "Sua renda líquida");
    await el.evaluate((e, t) => {
      const dados = new DataTransfer(); dados.setData("text", t);
      e.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dados, bubbles: true, cancelable: true }));
    }, colado);
    assert.equal(await el.evaluate(e => e.value), esperado, `colar ${colado}`);
  }
  assert.match(await resultado(p), /R\$ 617,25/, "50% de R$ 1.234,50");
  await p.close();
});

test("parcelas: porcentagem, faixa de cor e mês da última parcela", async () => {
  const p = await abrir("/calculadoras/parcela-e-renda");
  let r = await resultado(p);
  assert.ok(await temExemplo(p));
  assert.match(r, /exemplo com renda de R\$ 4\.000,00, R\$ 600,00 em parcelas e uma compra nova de 10x de R\$ 300,00/i);
  assert.match(r, /22,5%/);
  assert.equal(await p.$("label.calc-campo input[type=number]"), null, "\"Em quantas vezes\" só aparece com compra nova");

  await digitar(p, "Sua renda líquida", "400000");
  await digitar(p, "Parcelas que você já paga", "60000");
  r = await resultado(p);
  assert.equal(await temExemplo(p), false);
  assert.match(r, /15,0%/);
  assert.equal(await p.$eval(".calc-grande", e => e.className), "calc-grande bom");
  assert.match(r, /Sobra para o resto .* R\$ 3\.400,00/);

  await digitar(p, "Nova parcela", "30000");
  r = await resultado(p);
  assert.match(r, /22,5%/);
  assert.equal(await p.$eval(".calc-grande", e => e.className), "calc-grande atencao");
  assert.match(r, /10x de R\$ 300,00, até agosto de 2027 R\$ 3\.000,00/);

  const vezes = await campo(p, "Em quantas vezes");
  await vezes.click({ clickCount: 3 });
  await vezes.type("12");
  assert.match(await resultado(p), /12x de R\$ 300,00, até outubro de 2027 R\$ 3\.600,00/);

  await digitar(p, "Nova parcela", "100000");
  assert.equal(await p.$eval(".calc-grande", e => e.className), "calc-grande ruim");
  assert.match(await resultado(p), /40,0%.*Passa dos 30% da renda/);
  assert.deepEqual(p.erros, []);
  await p.close();
});

test("reserva: perfil de renda, meses à escolha, prazo e reserva completa", async () => {
  const p = await abrir("/calculadoras/reserva-de-emergencia");
  assert.ok(await temExemplo(p));
  assert.match(await resultado(p), /R\$ 15\.000,00 6 meses/);

  // rádio pelo teclado, como num grupo de opções nativo
  await (await opcao(p, "Renda estável")).focus();
  await p.keyboard.press("ArrowDown");
  assert.equal(await (await opcao(p, "Renda variável")).evaluate(e => e.checked), true);
  assert.match(await resultado(p), /R\$ 30\.000,00 12 meses/);
  assert.ok(await temExemplo(p), "trocar o perfil sem digitar mantém o exemplo");

  await digitar(p, "Seus gastos essenciais", "200000");
  assert.match(await resultado(p), /R\$ 24\.000,00 12 meses/);
  assert.equal(await temExemplo(p), false);

  await (await opcao(p, "Outro prazo")).click();
  const meses = await campo(p, "Quantos meses de gastos guardar");
  await meses.click({ clickCount: 3 });
  await meses.type("3");
  assert.match(await resultado(p), /R\$ 6\.000,00 3 meses/);

  await digitar(p, "Quanto você já tem guardado", "100000");
  await digitar(p, "Quanto consegue guardar por mês", "50000");
  let r = await resultado(p);
  assert.match(r, /Já guardado 17% da reserva R\$ 1\.000,00/);
  assert.match(r, /Falta para completar R\$ 5\.000,00/);
  assert.match(r, /Prazo guardando R\$ 500,00 por mês 10 meses/);

  await digitar(p, "Quanto você já tem guardado", "600000");
  r = await resultado(p);
  assert.match(r, /Falta reserva completa R\$ 0,00/);
  assert.doesNotMatch(r, /Prazo/);
  assert.match(r, /não conta rendimento/);
  assert.deepEqual(p.erros, []);
  await p.close();
});

// A página promete "Os números ficam no seu navegador: nada é enviado."
test("os valores digitados não saem do navegador", async () => {
  for (const [caminho, rotulo] of [["/calculadoras/50-30-20", "Sua renda líquida"], ["/calculadoras/parcela-e-renda", "Sua renda líquida"], ["/calculadoras/reserva-de-emergencia", "Seus gastos essenciais"]]) {
    const p = await abrir(caminho);
    await digitar(p, rotulo, "987654");
    await new Promise(r => setTimeout(r, 300));
    const vazou = p.pedidos.filter(x => x.metodo !== "GET" || /9876|9\.876/.test(x.url + x.corpo));
    assert.deepEqual(vazou, [], `${caminho}: requisição com o valor digitado`);
    await p.close();
  }
});
