import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Servidor só para testar localmente; em produção quem serve é a Vercel.
const arquivo = resolve(import.meta.dirname, "../dist/index.html");
const porta = Number(process.env.PORT || 4300);

createServer(async (req, res) => {
  try {
    const html = await readFile(arquivo);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(html);
  } catch {
    res.writeHead(500).end("Rode npm run build antes.");
  }
}).listen(porta, () => console.log(`Arqevon Finance (web) em http://localhost:${porta}`));
