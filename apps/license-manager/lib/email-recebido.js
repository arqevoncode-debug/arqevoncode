import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Confere a assinatura dos webhooks do Resend (padrão Svix): HMAC-SHA256 de "id.timestamp.corpo"
 * com o segredo em base64 depois de "whsec_". Recusa avisos com mais de 5 minutos para que uma
 * requisição capturada não possa ser reenviada depois.
 */
export function assinaturaResendValida({ id, timestamp, signature }, corpo, segredo = process.env.RESEND_WEBHOOK_SECRET, agora = Date.now()) {
  if (!id || !timestamp || !signature || !segredo?.startsWith("whsec_")) return false;
  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos) || Math.abs(agora / 1000 - segundos) > 300) return false;
  const esperado = createHmac("sha256", Buffer.from(segredo.slice(6), "base64")).update(`${id}.${timestamp}.${corpo}`).digest();
  return String(signature).split(" ").some(parte => {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) return false;
    const recebido = Buffer.from(valor, "base64");
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  });
}

const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Monta o encaminhamento de um e-mail recebido em @arqevoncode.com.br para a caixa do dono.
 * "Responder" vai direto para quem escreveu.
 */
export function montarEncaminhamento(email, anexos, para) {
  const remetente = email.headers?.from || email.from;
  const cabecalho = [
    ["De", remetente],
    ["Para", (email.to || []).join(", ")],
    ["Data", email.created_at],
  ];
  const textoOriginal = email.text || "(e-mail sem versão em texto; veja a versão HTML)";
  return {
    from: "Contato Arqevon <contato@arqevoncode.com.br>",
    to: [para],
    reply_to: [email.reply_to?.[0] || email.from],
    subject: `[Contato] ${email.subject || "(sem assunto)"}`,
    text: `${cabecalho.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${textoOriginal}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:13px;color:#48586d;border-bottom:1px solid #e5ebf1;padding-bottom:10px;margin-bottom:14px">${cabecalho.map(([k, v]) => `<div><strong>${escapar(k)}:</strong> ${escapar(v)}</div>`).join("")}</div>${email.html || `<pre style="white-space:pre-wrap;font-family:inherit">${escapar(textoOriginal)}</pre>`}`,
    attachments: anexos.map(a => ({ filename: a.filename, path: a.download_url, content_type: a.content_type })),
  };
}
