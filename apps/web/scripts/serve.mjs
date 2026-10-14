import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Servidor só para testar localmente; em produção quem serve é a Vercel.
const arquivo = resolve(import.meta.dirname, "../dist/index.html");
const porta = Number(process.env.PORT || 4300);

const TIPOS = { ".webmanifest": "application/manifest+json", ".js": "text/javascript", ".png": "image/png" };

createServer(async (req, res) => {
  const nome = new URL(req.url, "http://x").pathname.slice(1);
  const tipo = TIPOS[nome.slice(nome.lastIndexOf("."))];
  if (tipo && /^[\w.-]+$/.test(nome)) {
    try {
      const corpo = await readFile(resolve(arquivo, "..", nome));
      res.writeHead(200, { "content-type": tipo, "cache-control": "no-store" });
      return res.end(corpo);
    } catch { res.writeHead(404); return res.end(); }
  }
  try {
    const html = await readFile(arquivo);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html);
  } catch {
    res.writeHead(500).end("Rode npm run build antes.");
  }
}).listen(porta, () => console.log(`Arqevon Finance (web) em http://localhost:${porta}`));
