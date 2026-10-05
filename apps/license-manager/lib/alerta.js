const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/**
 * Monta o e-mail que avisa o dono de um reembolso na Kiwify. O texto diz o que fazer, porque a
 * assinatura continua ativa lá até ser cancelada à mão.
 */
export function montarAlertaReembolso({ pedido, assinatura, plano, comprador, motivo }) {
  const tipo = motivo === "chargeback" ? "Chargeback" : "Reembolso";
  const linhas = [
    ["Pedido", pedido],
    ["Assinatura na Kiwify", assinatura || "(venda sem assinatura)"],
    ["Plano", plano || "não identificado"],
    ["E-mail do comprador", comprador || "não informado"],
  ];
  const assunto = `${tipo} na Kiwify: cancele a assinatura do pedido ${pedido}`;
  const texto = [
    `${tipo} registrado. O acesso Pro do cliente já foi retirado no Arqevon.`,
    "",
    "AÇÃO NECESSÁRIA: a Kiwify não cancela a assinatura sozinha. Sem cancelar, o cliente será cobrado de novo.",
    "No painel da Kiwify, abra Assinaturas, procure pelo pedido ou pelo e-mail abaixo e clique em Cancelar.",
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#101b2d">
<p><strong>${tipo} registrado.</strong> O acesso Pro do cliente já foi retirado no Arqevon.</p>
<p style="background:#fff4e5;border-left:4px solid #f5a623;padding:10px 12px"><strong>Ação necessária:</strong> a Kiwify não cancela a assinatura sozinha. Sem cancelar, o cliente será cobrado de novo. No painel da Kiwify, abra <strong>Assinaturas</strong>, procure pelo pedido ou pelo e-mail abaixo e clique em <strong>Cancelar</strong>.</p>
<table style="border-collapse:collapse">${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#48586d">${escapar(k)}</td><td style="padding:4px 0"><strong>${escapar(v)}</strong></td></tr>`).join("")}</table>
</div>`;
  return { assunto, texto, html };
}

/** Envia pelo Resend. Lança erro em qualquer falha, para o webhook pedir nova entrega. */
export async function enviarAlerta({ assunto, texto, html, replyTo }, { apiKey = process.env.RESEND_API_KEY, para = process.env.ALERTA_EMAIL } = {}) {
  if (!apiKey || !para) throw new Error("RESEND_API_KEY ou ALERTA_EMAIL não configurados.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "Arqevon Alertas <nao-responda@arqevoncode.com.br>", to: [para], subject: assunto, text: texto, html, ...(replyTo ? { reply_to: [replyTo] } : {}) }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error(`Resend: ${response.status} ${data.message || ""}`.trim());
  return data.id;
}
