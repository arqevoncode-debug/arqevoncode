import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";

// O motor financeiro é o mesmo do desktop: lemos meu-financeiro.html direto de lá, sem cópia,
// para que as duas versões nunca divirjam. Aqui só entram a tela de login e o layout web.
const root = resolve(import.meta.dirname, "..");
const motor = resolve(root, "../finance-desktop/meu-financeiro.html");
const output = resolve(root, "dist");

// ARQEVON_BILLING=1 libera a venda do Pro na interface. Fica desligado até a sincronização existir.
const venderPro = process.env.ARQEVON_BILLING === "1";

let html = await readFile(motor, "utf8");
const css = await readFile(resolve(root, "src/web.css"), "utf8");
const markup = await readFile(resolve(root, "src/web.html"), "utf8");

// Tudo num arquivo só, sem script de terceiros: o app guarda dados financeiros e não pode carregar
// código de outro domínio (pixel, analytics, CDN).
const bundle = await build({
  entryPoints: [resolve(root, "src/web.js")],
  bundle: true, format: "esm", target: "es2022", minify: true, write: false, legalComments: "none",
  define: { ARQEVON_BILLING: venderPro ? "true" : "false" },
});
const js = bundle.outputFiles[0].text.replaceAll("</script", "<\\/script");

if (!html.includes("</head>") || !html.includes("</body>")) {
  throw new Error("meu-financeiro.html mudou de estrutura: </head> ou </body> não encontrado.");
}

const fontes = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230a1628'/%3E%3Cpath d='m7 20 6-5 5 3 7-7' stroke='%233fe7c0' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
<script>document.documentElement.classList.add("web-bloqueado", "desktop-bloqueado");</script>
`;
html = html.replace("</head>", `${fontes}</head>`);
html = html.replace("</body>", `<style id="web-style">\n${css}\n</style>\n${markup}\n<script type="module">\n${js}\n</script>\n</body>`);

await mkdir(output, { recursive: true });
await writeFile(resolve(output, "index.html"), html);
console.log(`dist/index.html gerado (venda do Pro ${venderPro ? "LIGADA" : "desligada"}).`);
