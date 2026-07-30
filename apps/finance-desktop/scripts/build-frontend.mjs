import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceHtml = resolve(root, "meu-financeiro.html");
const output = resolve(root, "dist");
const apiBase = (process.env.LICENSE_API_BASE || "https://myfinance-license-manager.vercel.app").replace(/\/$/, "");
let publicKey = (process.env.LICENSE_PUBLIC_KEY || "").replace(/\\n/g, "\n");
if (!publicKey) {
  try { publicKey = await readFile(resolve(root, "config/license-public.pem"), "utf8"); }
  catch { /* O build continua, mas a ativação avisará que a chave pública não está configurada. */ }
}

// O CSP do Tauri é declarativo e não conhece o LICENSE_API_BASE do build. Sem esta checagem
// um build apontado para outra origem compilaria normalmente e só falharia na ativação, em runtime.
await conferirCspDaApi(apiBase);
async function conferirCspDaApi(base) {
  const conf = resolve(root, "src-tauri/tauri.conf.json");
  const csp = JSON.parse(await readFile(conf, "utf8")).app?.security?.csp || "";
  const connectSrc = csp.split(";").map(d => d.trim()).find(d => d.startsWith("connect-src"));
  if (!connectSrc) throw new Error(`connect-src ausente no CSP de ${conf}.`);
  const origem = new URL(base).origin;
  const liberado = connectSrc.split(/\s+/).slice(1).some(fonte => fonte === origem
    || (fonte.includes("*") && new RegExp(`^${fonte.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*")}$`).test(origem)));
  if (!liberado) throw new Error(
    `LICENSE_API_BASE (${origem}) não é permitido pelo connect-src do CSP.\n`
    + `Inclua a origem em app.security.csp de ${conf} antes de gerar o build.`);
}

await mkdir(output, { recursive: true });
let html = await readFile(sourceHtml, "utf8");
const desktopMarkup = `
<style id="desktop-license-style">
  html.desktop-bloqueado body { overflow:hidden; }
  html.desktop-bloqueado .app { visibility:hidden; }
  #licencaTela { position:fixed;inset:0;z-index:5000;background:radial-gradient(900px 420px at 88% -8%,color-mix(in srgb,var(--accent) 15%,transparent),transparent 65%),var(--page);display:grid;place-items:center;padding:24px;color:var(--ink); }
  #licencaTela[hidden] { display:none; }
  .lic-caixa { width:min(440px,100%);background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:30px;box-shadow:0 24px 70px rgba(0,0,0,.2); }
  .lic-logo { width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:radial-gradient(circle at 78% 18%,color-mix(in srgb,var(--accent) 68%,transparent),transparent 45%),#0a1628;border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);box-shadow:0 8px 24px color-mix(in srgb,var(--accent) 28%,transparent);margin-bottom:18px; }
  .lic-logo svg { width:35px;height:35px; }
  .lic-caixa h1 { margin:0 0 6px;font-size:24px;letter-spacing:-.03em; }.lic-caixa p { color:var(--muted);margin:0 0 20px; }
  .lic-caixa label { display:grid;gap:5px;font-size:12px;font-weight:700;color:var(--ink-2); }.lic-caixa input { font:inherit;color:var(--ink);background:var(--page);border:1px solid var(--border);border-radius:10px;padding:12px;text-transform:uppercase;letter-spacing:.04em;width:100%; }
  .lic-caixa .botao { width:100%;margin-top:12px; }.lic-erro { color:var(--bad)!important;background:var(--bad-bg);padding:9px 11px;border-radius:9px;margin:12px 0 0!important;font-size:13px; }
  .lic-rodape { margin-top:16px!important;text-align:center;font-size:11px;color:var(--muted)!important; }
  dialog#licencaModal,dialog#appDialog { border:1px solid var(--border);border-radius:16px;background:var(--surface);color:var(--ink);padding:24px;width:min(420px,calc(100vw - 40px));box-shadow:0 24px 70px rgba(0,0,0,.3); }
  dialog#licencaModal::backdrop,dialog#appDialog::backdrop { background:rgba(0,0,0,.5);backdrop-filter:blur(3px); } dialog#licencaModal h2,dialog#appDialog h2 { margin:0 0 5px; } dialog#licencaModal p,dialog#appDialog>p { color:var(--muted);margin:0 0 16px; }
  .app-dialog-campo { display:grid;gap:5px;margin-top:12px;font-size:12px;font-weight:700;color:var(--ink-2); }.app-dialog-campo input { font:inherit;color:var(--ink);background:var(--page);border:1px solid var(--border);border-radius:10px;padding:11px 12px;width:100%; }.app-dialog-erro { color:var(--bad)!important;background:var(--bad-bg);padding:9px 11px;border-radius:9px;margin:12px 0 0!important;font-size:13px; }
  #appToast { position:fixed;z-index:7000;right:22px;bottom:22px;max-width:min(420px,calc(100vw - 44px));padding:13px 16px;border-radius:12px;background:var(--surface);border:1px solid var(--border);box-shadow:0 16px 40px rgba(0,0,0,.28);color:var(--ink);font-size:13px;font-weight:650; } #appToast.erro { color:var(--bad);border-color:color-mix(in srgb,var(--bad) 35%,var(--border)); }
  .lic-acoes { display:flex;justify-content:flex-end;gap:8px;margin-top:18px; }
</style>
<div id="licencaTela">
  <div class="lic-caixa">
    <div class="lic-logo" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><path d="M7 24V19M13 24V15M19 24V11" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="m7 14 6-5 5 3 7-7" stroke="#3fe7c0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 5h4v4" stroke="#3fe7c0" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div><h1 id="licencaTitulo">Ative o Arqevon Finance</h1>
    <p id="licencaMensagem">Informe a licença recebida na compra. A internet é necessária para validar este dispositivo.</p>
    <form id="licencaForm"><label>Chave da licença<input id="licencaChave" autocomplete="off" spellcheck="false" placeholder="MYF-XXXXX-XXXXX-XXXXX-XXXXX" required></label><button class="botao" id="licencaAtivar">Ativar neste computador</button></form>
    <p class="lic-erro" id="licencaErro" hidden></p><p class="lic-rodape">Seus dados financeiros permanecem armazenados somente neste dispositivo.</p>
  </div>
</div>
<dialog id="licencaModal"><h2>Licença do Arqevon Finance</h2><p id="licencaResumo">Este computador está autorizado.</p><div class="lic-acoes"><button class="botao cancelar" id="licencaFechar">Fechar</button><button class="botao cancelar" id="licencaDesativar">Desativar dispositivo</button></div></dialog>
<dialog id="appDialog"><h2 id="appDialogTitulo">Confirmar ação</h2><p id="appDialogMensagem"></p><label class="app-dialog-campo" id="appDialogSenhaWrap" hidden><span>Senha</span><input id="appDialogSenha" type="password" autocomplete="current-password"></label><label class="app-dialog-campo" id="appDialogConfirmacaoWrap" hidden><span>Confirme a senha</span><input id="appDialogConfirmacao" type="password" autocomplete="new-password"></label><p class="app-dialog-erro" id="appDialogErro" hidden></p><div class="lic-acoes"><button class="botao cancelar" type="button" id="appDialogCancelar">Cancelar</button><button class="botao" type="button" id="appDialogAceitar">Continuar</button></div></dialog>
<div id="appToast" role="status" aria-live="polite" hidden></div>
<script type="module" src="./desktop.js"><\/script>`;

html = html.replace("<html lang=\"pt-BR\">", "<html lang=\"pt-BR\" class=\"desktop-bloqueado\">")
  .replace("</body>", `${desktopMarkup}\n</body>`);
await writeFile(resolve(output, "index.html"), html);

let desktopJs = await readFile(resolve(root, "src/desktop.js"), "utf8");
desktopJs = desktopJs.replace("__LICENSE_API_BASE__", JSON.stringify(apiBase))
  .replace("__LICENSE_PUBLIC_KEY__", JSON.stringify(publicKey));
await writeFile(resolve(output, "desktop.js"), desktopJs);
await cp(resolve(root, "src-tauri/icons/icon.svg"), resolve(output, "icon.svg"));
console.log(`Frontend desktop gerado em ${output}`);
