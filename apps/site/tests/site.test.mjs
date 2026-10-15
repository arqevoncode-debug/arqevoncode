import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function sha256(relativePath) {
  const contents = await readFile(new URL(relativePath, root));
  return createHash("sha256").update(contents).digest("hex");
}

// O Arqevon Finance tem página própria (/finance); a página inicial é da Arqevon Code.
test("mantém a marca na página do Finance", async () => {
  const page = await readFile(new URL("app/finance/page.tsx", root), "utf8");
  assert.match(page, /Arqevon Code/);
  assert.match(page, /Arqevon Finance/);
});

// O app desktop foi descontinuado em 2026-10-14: nenhuma página oferece instalador.
test("não oferece mais download do desktop", async () => {
  for (const arquivo of ["app/finance/page.tsx", "app/page.tsx"]) {
    const page = await readFile(new URL(arquivo, root), "utf8");
    assert.doesNotMatch(page, /\/downloads\//, `${arquivo} não deve linkar instaladores`);
  }
});

// Os instaladores continuam hospedados, sem link no site, para quem já instalou poder reinstalar
// enquanto migra para o app web. A API de licenças também continua no ar.
test("preserva os instaladores exatos do baseline 1.0.6", async () => {
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.6-Windows-x64-Setup.exe"),
    "053b83ab64a7befc9385a81c6e815a8940b4c93c2e27301c1b929204ddd0d079",
  );
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.6-macOS-Apple-Silicon.dmg"),
    "05d2a99f95aab6f1f673c895e47d9ef652a8efba8f153b1a48ceb7482a3ec16a",
  );
});

// A 1.0.5 continua hospedada para não quebrar links já enviados a clientes.
test("mantém os instaladores da 1.0.5 acessíveis", async () => {
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.5-Windows-x64-Setup-v3.exe"),
    "c51bbc9d8b0b96bef3d15a2f06b2002178db92aab70968e28d0cceb214d8ce48",
  );
  assert.equal(
    await sha256("public/downloads/Arqevon-Finance-1.0.5-macOS-Apple-Silicon.dmg"),
    "b44b34502cff2a7117032a250c3ae3ad56b80733045831411c8138f937a160ff",
  );
});

// /p é o link da bio do Instagram: leva à página inicial (a fábrica de software).
test("mantém a rota curta apontando para a página inicial", async () => {
  const route = await readFile(new URL("app/p/route.ts", root), "utf8");
  assert.match(route, /new URL\("\/", request\.url\)/);
  assert.match(route, /302/);
});

// A venda do Pro depende destes documentos (LGPD e CDC): o rodapé precisa levar a eles.
test("publica Termos de Uso e Política de Privacidade com contato", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const termos = await readFile(new URL("app/termos/page.tsx", root), "utf8");
  const privacidade = await readFile(new URL("app/privacidade/page.tsx", root), "utf8");
  const seguranca = await readFile(new URL("app/seguranca/page.tsx", root), "utf8");
  // páginas legais com canonical próprio (senão herdam o da página inicial e somem das buscas)
  for (const slug of ["seguranca", "termos", "privacidade"]) {
    const pagina = await readFile(new URL(`app/${slug}/page.tsx`, root), "utf8");
    assert.match(pagina, new RegExp(`canonical: "/${slug}"`), `/${slug} sem canonical próprio`);
  }
  // calculadoras: cada uma com página, título próprio e no sitemap
  const sitemap = await readFile(new URL("app/sitemap.ts", root), "utf8");
  assert.match(sitemap, /CALCULADORAS/);
  for (const slug of ["50-30-20", "parcela-e-renda", "reserva-de-emergencia"]) {
    const calc = await readFile(new URL(`app/calculadoras/${slug}/page.tsx`, root), "utf8");
    assert.match(calc, new RegExp(`canonical: "/calculadoras/${slug}"`));
    assert.match(calc, new RegExp(`atual="${slug}"`));
  }
  const reserva = await readFile(new URL("app/calculadoras/reserva-de-emergencia/calculadora.tsx", root), "utf8");
  assert.match(reserva, /não conta rendimento/, "regra da marca: não prometer rendimento");
  assert.match(seguranca, /AES-256-GCM/);
  // a página cita as iterações da senha da nuvem: precisam bater com o código do cofre
  const cofre = await readFile(new URL("../web/src/cofre.js", root), "utf8");
  const iteracoes = Number(cofre.match(/ITERACOES_SENHA = ([\d_]+)/)[1].replace(/_/g, ""));
  assert.ok(seguranca.includes(`${iteracoes / 1000} mil iterações`), `/seguranca deve citar ${iteracoes} iterações`);
  const layout = await readFile(new URL("app/legal-layout.tsx", root), "utf8");

  assert.match(page, /href="\/termos"/);
  assert.match(page, /href="\/privacidade"/);
  assert.match(layout, /CONTATO = "[^"]+@[^"]+"/);
  assert.match(termos, /art\. 49/, "direito de arrependimento");
  assert.match(termos, /chave de recuperação/);
  assert.match(privacidade, /art\. 18/, "direitos do titular");
  for (const fornecedor of ["Supabase", "Vercel", "Resend", "Kiwify", "GitHub", "Google Fonts"]) {
    assert.match(privacidade, new RegExp(fornecedor), `fornecedor ausente: ${fornecedor}`);
  }
});

// A página inicial destaca o Arqevon Finance; o orçamento sob medida é um extra discreto que abre
// uma janela. O formulário aponta para a API que grava o pedido.
test("destaca o Finance e mantém o orçamento sob medida", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  const form = await readFile(new URL("app/orcamento.tsx", root), "utf8");
  const privacidade = await readFile(new URL("app/privacidade/page.tsx", root), "utf8");
  const seguranca = await readFile(new URL("app/seguranca/page.tsx", root), "utf8");
  // páginas legais com canonical próprio (senão herdam o da página inicial e somem das buscas)
  for (const slug of ["seguranca", "termos", "privacidade"]) {
    const pagina = await readFile(new URL(`app/${slug}/page.tsx`, root), "utf8");
    assert.match(pagina, new RegExp(`canonical: "/${slug}"`), `/${slug} sem canonical próprio`);
  }
  // calculadoras: cada uma com página, título próprio e no sitemap
  const sitemap = await readFile(new URL("app/sitemap.ts", root), "utf8");
  assert.match(sitemap, /CALCULADORAS/);
  for (const slug of ["50-30-20", "parcela-e-renda", "reserva-de-emergencia"]) {
    const calc = await readFile(new URL(`app/calculadoras/${slug}/page.tsx`, root), "utf8");
    assert.match(calc, new RegExp(`canonical: "/calculadoras/${slug}"`));
    assert.match(calc, new RegExp(`atual="${slug}"`));
  }
  const reserva = await readFile(new URL("app/calculadoras/reserva-de-emergencia/calculadora.tsx", root), "utf8");
  assert.match(reserva, /não conta rendimento/, "regra da marca: não prometer rendimento");
  assert.match(seguranca, /AES-256-GCM/);
  // a página cita as iterações da senha da nuvem: precisam bater com o código do cofre
  const cofre = await readFile(new URL("../web/src/cofre.js", root), "utf8");
  const iteracoes = Number(cofre.match(/ITERACOES_SENHA = ([\d_]+)/)[1].replace(/_/g, ""));
  assert.ok(seguranca.includes(`${iteracoes / 1000} mil iterações`), `/seguranca deve citar ${iteracoes} iterações`);

  const hero = await readFile(new URL("app/hero-produto.tsx", root), "utf8");
  assert.match(page, /<HeroProduto app=\{FINANCE_APP\} \/>/);
  assert.match(hero, /#exemplo/, "botão Ver um exemplo leva ao modo exemplo do app");
  for (const img of ["app-painel", "app-lancamentos", "app-relatorios", "app-objetivos"]) {
    assert.match(hero, new RegExp(`/produto/${img}\\.png`));
  }
  assert.match(page, /<Orcamento \/>/);
  assert.ok(page.indexOf('id="planos"') < page.indexOf("<Orcamento />"), "o orçamento vem depois do produto");
  assert.match(form, /id="sob-encomenda"/, "links antigos para #sob-encomenda continuam valendo");
  assert.match(form, /location\.hash === "#sob-encomenda"/);
  assert.match(page, /href="\/finance"/);
  assert.match(form, /\/api\/v1\/quote-requests/);
  assert.match(privacidade, /Pedido de orçamento/, "dado novo coletado precisa constar na política");
});
