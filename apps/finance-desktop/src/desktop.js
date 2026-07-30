const API_BASE = __LICENSE_API_BASE__;
const PUBLIC_KEY_PEM = __LICENSE_PUBLIC_KEY__;
const RECEIPT_KEY = "myfinance-license-receipt-v1";
const DEVICE_KEY = "myfinance-device-id-v1";
const APP_VERSION = "1.0.6";
const MAX_OFFLINE_MS = 30 * 86400000;
const DAILY_CHECK_MS = 24 * 60 * 60 * 1000;
const DENIAL_CODES = ["ACTIVATION_REVOKED", "LICENSE_INACTIVE", "LICENSE_EXPIRED", "TOKEN_INVALID"];
// Mesmos limites da check constraint da tabela e do validador do servidor.
const FEEDBACK_MIN = 10;
const FEEDBACK_MAX = 2000;
let validationTimer = null;
let validationInFlight = null;

const $ = selector => document.querySelector(selector);
const fromB64url = value => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), c => c.charCodeAt(0));
const toB64 = bytes => { let value = ""; for (const byte of new Uint8Array(bytes)) value += String.fromCharCode(byte); return btoa(value); };
const fromB64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
  return id;
}

function osName() {
  const value = `${navigator.userAgent} ${navigator.platform}`.toLowerCase();
  if (value.includes("mac")) return "macos";
  if (value.includes("win")) return "windows";
  return "unknown";
}

function pemBytes(pem) {
  return fromB64(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
}

async function verifyReceipt(token) {
  if (!PUBLIC_KEY_PEM || !token) return null;
  try {
    const [header, payload, signature] = token.split(".");
    const key = await crypto.subtle.importKey("spki", pemBytes(PUBLIC_KEY_PEM), { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("Ed25519", key, fromB64url(signature), new TextEncoder().encode(`${header}.${payload}`));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (data.iss !== "myfinance-license-server" || data.aud !== "myfinance-desktop" || data.deviceId !== getDeviceId()) return null;
    const issuedAt = Number(data.iat) * 1000;
    if (Number(data.exp) * 1000 <= Date.now() || !issuedAt || Date.now() - issuedAt > MAX_OFFLINE_MS) return null;
    return data;
  } catch { return null; }
}

async function post(path, body, timeoutMs = 12000) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || "Não foi possível validar a licença."), { code: result.code });
    return result;
  } finally { clearTimeout(timer); }
}

function unlock(payload) {
  document.documentElement.classList.remove("desktop-bloqueado");
  $("#licencaTela").hidden = true;
  $("#licencaResumo").textContent = `${payload.customerName || "Cliente"} · plano ${payload.plan || "individual"} · dispositivo autorizado.`;
  installLicenseButton(); installFeedbackButton(); installPortableBackup();
  startValidationSchedule();
}

function showActivation(message = "") {
  document.documentElement.classList.add("desktop-bloqueado");
  $("#licencaTela").hidden = false;
  $("#licencaTitulo").textContent = "Ative o Arqevon Finance";
  $("#licencaMensagem").textContent = "Informe a licença recebida na compra. A internet é necessária para validar este dispositivo.";
  $("#licencaForm").hidden = false;
  const error = $("#licencaErro"); error.hidden = !message; error.textContent = message;
  setTimeout(() => $("#licencaChave").focus(), 50);
}

function showChecking() {
  document.documentElement.classList.add("desktop-bloqueado");
  $("#licencaTela").hidden = false;
  $("#licencaTitulo").textContent = "Verificando licença…";
  $("#licencaMensagem").textContent = "Confirmando a autorização deste dispositivo. Se estiver offline, seus dados serão liberados pela tolerância local.";
  $("#licencaForm").hidden = true;
  $("#licencaErro").hidden = true;
}

async function activate(event) {
  event.preventDefault();
  const button = $("#licencaAtivar"), error = $("#licencaErro");
  button.disabled = true; button.textContent = "Validando…"; error.hidden = true;
  try {
    const result = await post("/api/v1/licenses/activate", {
      licenseKey: $("#licencaChave").value, deviceId: getDeviceId(),
      deviceName: osName() === "macos" ? "Mac" : osName() === "windows" ? "PC Windows" : "Computador",
      os: osName(), appVersion: APP_VERSION,
    });
    const payload = await verifyReceipt(result.token);
    if (!payload) throw new Error("O servidor respondeu, mas o comprovante de ativação não é válido.");
    localStorage.setItem(RECEIPT_KEY, result.token);
    $("#licencaChave").value = ""; unlock(payload);
  } catch (err) { error.textContent = err.name === "AbortError" ? "O servidor demorou para responder. Verifique sua internet." : err.message; error.hidden = false; }
  finally { button.disabled = false; button.textContent = "Ativar neste computador"; }
}

async function validateOnline(token, localPayload, { launch = false } = {}) {
  try {
    const result = await post("/api/v1/licenses/validate", { token }, launch ? 5000 : 12000);
    const payload = await verifyReceipt(result.token);
    if (!payload) throw Object.assign(new Error("O comprovante renovado não é válido."), { code: "TOKEN_INVALID" });
    localStorage.setItem(RECEIPT_KEY, result.token);
    if (launch) unlock(payload);
    else $("#licencaResumo").textContent = `${payload.customerName || "Cliente"} · plano ${payload.plan || "individual"} · dispositivo autorizado.`;
    return true;
  } catch (err) {
    if (DENIAL_CODES.includes(err.code)) {
      localStorage.removeItem(RECEIPT_KEY);
      showActivation(err.message);
      return false;
    }
    // Falha de rede ou do servidor: respeita o comprovante local por no máximo 30 dias.
    if (launch && localPayload) unlock(localPayload);
    return Boolean(localPayload);
  }
}

async function validateCurrentLicense() {
  if (validationInFlight) return validationInFlight;
  const token = localStorage.getItem(RECEIPT_KEY);
  const localPayload = await verifyReceipt(token);
  if (!localPayload) {
    showActivation("A tolerância offline de 30 dias terminou. Conecte-se à internet e informe sua licença para continuar.");
    return false;
  }
  validationInFlight = validateOnline(token, localPayload).finally(() => { validationInFlight = null; });
  return validationInFlight;
}

function startValidationSchedule() {
  if (validationTimer) return;
  validationTimer = setInterval(validateCurrentLicense, DAILY_CHECK_MS);
  addEventListener("online", validateCurrentLicense);
}

function installLicenseButton() {
  if ($("#btnGerenciarLicenca")) return;
  const footer = $(".rodape-acoes") || $(".rodape-dados"); if (!footer) return;
  const button = document.createElement("button"); button.id = "btnGerenciarLicenca"; button.textContent = "Gerenciar licença";
  button.onclick = () => $("#licencaModal").showModal();
  const resetButton = $("#btnResetar");
  if (resetButton?.parentElement === footer) footer.insertBefore(button, resetButton); else footer.appendChild(button);
}

function installFeedbackButton() {
  if ($("#btnEnviarFeedback")) return;
  const footer = $(".rodape-acoes") || $(".rodape-dados"); if (!footer) return;
  const button = document.createElement("button"); button.id = "btnEnviarFeedback"; button.textContent = "Enviar feedback";
  button.onclick = openFeedback;
  const licenseButton = $("#btnGerenciarLicenca");
  if (licenseButton?.parentElement === footer) footer.insertBefore(button, licenseButton); else footer.appendChild(button);
}

function openFeedback() {
  const message = $("#feedbackMensagem");
  message.value = ""; $("#feedbackCategoria").value = "sugestao";
  $("#feedbackErro").hidden = true;
  updateFeedbackCounter();
  $("#feedbackModal").showModal();
  setTimeout(() => message.focus(), 30);
}

function updateFeedbackCounter() {
  $("#feedbackContador").textContent = `${$("#feedbackMensagem").value.length} / ${FEEDBACK_MAX}`;
}

async function sendFeedback() {
  const button = $("#feedbackEnviar"), error = $("#feedbackErro");
  const message = $("#feedbackMensagem").value.trim();
  if (message.length < FEEDBACK_MIN) {
    error.textContent = `Escreva pelo menos ${FEEDBACK_MIN} caracteres para enviarmos seu feedback.`;
    error.hidden = false; $("#feedbackMensagem").focus(); return;
  }
  const token = localStorage.getItem(RECEIPT_KEY);
  if (!token) { error.textContent = "Nenhuma licença ativa neste computador."; error.hidden = false; return; }

  button.disabled = true; button.textContent = "Enviando…"; error.hidden = true;
  try {
    await post("/api/v1/feedback", { token, message, category: $("#feedbackCategoria").value, appVersion: APP_VERSION });
    $("#feedbackModal").close();
    showAppToast("Feedback enviado. Obrigado por ajudar a melhorar o aplicativo.");
  } catch (err) {
    // Sem fila offline: o envio exige conexão e a mensagem permanece na caixa para nova tentativa.
    error.textContent = err.name === "AbortError"
      ? "O servidor demorou para responder. Verifique sua internet e tente novamente."
      : err.message;
    error.hidden = false;
  } finally { button.disabled = false; button.textContent = "Enviar"; }
}

let toastTimer = null;
function showAppToast(message, type = "ok") {
  const toast = $("#appToast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("erro", type === "erro");
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5500);
}

function showAppDialog({ title, message, password = false, confirmPassword = false, minLength = 0, confirmText = "Continuar", cancelText = "Cancelar" }) {
  const modal = $("#appDialog"), input = $("#appDialogSenha"), confirmation = $("#appDialogConfirmacao");
  const passwordWrap = $("#appDialogSenhaWrap"), confirmationWrap = $("#appDialogConfirmacaoWrap"), error = $("#appDialogErro");
  $("#appDialogTitulo").textContent = title;
  $("#appDialogMensagem").textContent = message;
  $("#appDialogAceitar").textContent = confirmText;
  $("#appDialogCancelar").textContent = cancelText;
  passwordWrap.hidden = !password;
  confirmationWrap.hidden = !(password && confirmPassword);
  input.value = ""; confirmation.value = ""; error.hidden = true;

  return new Promise(resolve => {
    let finalizado = false;
    const finish = value => {
      if (finalizado) return;
      finalizado = true;
      modal.oncancel = null;
      if (modal.open) modal.close();
      resolve(value);
    };
    $("#appDialogCancelar").onclick = () => finish(null);
    $("#appDialogAceitar").onclick = () => {
      if (password) {
        if (input.value.length < minLength) {
          error.textContent = `A senha deve ter pelo menos ${minLength} caracteres.`;
          error.hidden = false; input.focus(); return;
        }
        if (confirmPassword && input.value !== confirmation.value) {
          error.textContent = "As senhas não conferem.";
          error.hidden = false; confirmation.focus(); return;
        }
        finish(input.value); return;
      }
      finish(true);
    };
    modal.oncancel = event => { event.preventDefault(); finish(null); };
    modal.showModal();
    if (password) setTimeout(() => input.focus(), 30);
  });
}

async function deactivate() {
  const confirmed = await showAppDialog({ title: "Desativar este dispositivo?", message: "Seus dados locais não serão apagados, mas será necessária uma licença para abri-los novamente.", confirmText: "Desativar" });
  if (!confirmed) return;
  const token = localStorage.getItem(RECEIPT_KEY);
  try { await post("/api/v1/licenses/deactivate", { token }); }
  catch (err) { showAppToast(err.message, "erro"); return; }
  localStorage.removeItem(RECEIPT_KEY); $("#licencaModal").close(); showActivation("Este dispositivo foi desativado e a vaga da licença foi liberada.");
}

async function deriveBackupKey(password, salt, usages, iterations = 250000) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, usages);
}

async function exportPortableBackup() {
  const bridge = window.MyFinanceBridge; if (!bridge) return showAppToast("O módulo de backup não está disponível.", "erro");
  const password = await showAppDialog({ title: "Proteger novo backup", message: "Crie uma senha com pelo menos 6 caracteres. Ela será necessária para importar o arquivo.", password: true, confirmPassword: true, minLength: 6, confirmText: "Exportar backup" });
  if (password === null) return;
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(password, salt, ["encrypt"]);
  const payload = JSON.stringify({ format: "myfinance-data", schemaVersion: bridge.versaoDados, exportedAt: new Date().toISOString(), data: bridge.obterDados() });
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(payload));
  const envelope = { format: "myfinance-backup", version: 1, encrypted: true, kdf: "PBKDF2-SHA256", iterations: 250000, salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ciphertext) };
  const blob = new Blob([JSON.stringify(envelope)], { type: "application/vnd.myfinance.backup+json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Arqevon-Finance-Backup-${new Date().toISOString().slice(0, 10)}.myfinance`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showAppToast("Backup protegido exportado com sucesso.");
}

async function importPortableFile(file) {
  let parsed;
  try { parsed = JSON.parse(await file.text()); } catch { return showAppToast("Arquivo de backup inválido.", "erro"); }
  try {
    let financialData = parsed;
    if (parsed.format === "myfinance-backup" && parsed.encrypted) {
      const password = await showAppDialog({ title: "Abrir backup protegido", message: "Digite a senha usada para proteger este backup.", password: true, confirmText: "Abrir backup" });
      if (password === null) return;
      const iterations = Number(parsed.iterations) || 250000;
      const key = await deriveBackupKey(password, fromB64(parsed.salt), ["decrypt"], iterations);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parsed.iv) }, key, fromB64(parsed.ciphertext));
      const payload = JSON.parse(new TextDecoder().decode(plaintext)); financialData = payload.data;
    } else if (parsed.enc === true && parsed.salt && parsed.iv && parsed.ct) {
      // Compatibilidade com os backups JSON criptografados pelas versões anteriores.
      const password = await showAppDialog({ title: "Importar backup anterior", message: "Este arquivo foi criado por uma versão anterior. Digite a senha usada para protegê-lo.", password: true, confirmText: "Abrir backup" });
      if (password === null) return;
      const key = await deriveBackupKey(password, fromB64(parsed.salt), ["decrypt"], 150000);
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(parsed.iv) }, key, fromB64(parsed.ct));
      financialData = JSON.parse(new TextDecoder().decode(plaintext));
    }
    if (!financialData || !Array.isArray(financialData.lancamentos)) throw new Error("Formato não reconhecido.");
    if (!Array.isArray(financialData.fixos)) financialData.fixos = [];
    if (!Array.isArray(financialData.parcelamentos)) financialData.parcelamentos = [];
    if (!Array.isArray(financialData.objetivos)) financialData.objetivos = [];
    const count = financialData.lancamentos.length + (financialData.fixos?.length || 0) + (financialData.parcelamentos?.length || 0) + (financialData.objetivos?.length || 0);
    const confirmed = await showAppDialog({ title: "Confirmar importação", message: `O backup contém ${count} item(ns). Os dados atuais serão substituídos depois que uma cópia de segurança local for criada.`, confirmText: "Importar dados" });
    if (!confirmed) return;
    window.MyFinanceBridge.substituirDados(financialData);
    showAppToast("Backup importado com sucesso.");
  } catch (error) {
    const mensagem = error?.name === "OperationError"
      ? "Não foi possível descriptografar o backup. Confira se a senha está correta."
      : "Não foi possível abrir o backup. O arquivo pode ser incompatível ou estar danificado.";
    showAppToast(mensagem, "erro");
  }
}

function installPortableBackup() {
  if ($("#arquivoBackupDesktop")) return;
  const exportButton = $("#btnExportar"), importButton = $("#btnImportar"); if (!exportButton || !importButton) return;
  exportButton.textContent = "Exportar backup protegido"; exportButton.onclick = exportPortableBackup;
  const input = document.createElement("input"); input.type = "file"; input.id = "arquivoBackupDesktop"; input.accept = ".myfinance,.json,application/json"; input.hidden = true;
  input.onchange = async () => { const file = input.files?.[0]; if (file) await importPortableFile(file); input.value = ""; };
  document.body.appendChild(input); importButton.onclick = () => input.click(); importButton.textContent = "Importar backup";
}

$("#licencaForm").addEventListener("submit", activate);
$("#licencaFechar").onclick = () => $("#licencaModal").close();
$("#licencaDesativar").onclick = deactivate;
$("#feedbackCancelar").onclick = () => $("#feedbackModal").close();
$("#feedbackEnviar").onclick = sendFeedback;
$("#feedbackMensagem").addEventListener("input", updateFeedbackCounter);

const receipt = localStorage.getItem(RECEIPT_KEY);
const payload = await verifyReceipt(receipt);
if (payload) { showChecking(); await validateOnline(receipt, payload, { launch: true }); }
else showActivation(receipt ? "Sua autorização expirou. Informe a licença para renovar este dispositivo." : "");
