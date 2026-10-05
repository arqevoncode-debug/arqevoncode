import { NextResponse } from "next/server";
import { assinaturaResendValida, montarEncaminhamento } from "@/lib/email-recebido";

const RESEND = "https://api.resend.com";

async function resend(path, { method = "GET", body, idempotencia } = {}) {
  const response = await fetch(`${RESEND}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${process.env.RESEND_RECEIVING_API_KEY}`,
      "content-type": "application/json",
      ...(idempotencia ? { "idempotency-key": idempotencia } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Resend ${method} ${path}: ${response.status} ${data.message || ""}`.trim());
  return data;
}

// E-mails que chegam em @arqevoncode.com.br (contato@ e respostas a nao-responda@) são
// encaminhados para a caixa do dono. O domínio não tem caixa postal própria: o MX aponta para o
// Resend, que avisa aqui a cada e-mail recebido.
export async function POST(request) {
  const corpo = await request.text();
  const valido = assinaturaResendValida({
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, corpo);
  if (!valido) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  let evento;
  try { evento = JSON.parse(corpo); } catch { evento = null; }
  if (evento?.type !== "email.received" || !evento.data?.email_id) return NextResponse.json({ ok: true, ignorado: true });

  try {
    const id = encodeURIComponent(evento.data.email_id);
    const email = await resend(`/emails/receiving/${id}`);
    const anexos = email.attachments?.length ? (await resend(`/emails/receiving/${id}/attachments`)).data || [] : [];
    // A chave de idempotência é o id do aviso: se o Resend reentregar, o e-mail não sai duas vezes.
    await resend("/emails", {
      method: "POST",
      body: montarEncaminhamento(email, anexos, process.env.ALERTA_EMAIL),
      idempotencia: `encaminhar-${request.headers.get("svix-id")}`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    // 500 faz o Resend tentar de novo; nenhum e-mail de cliente se perde por uma falha momentânea.
    console.error("email recebido", evento.data.email_id, error.message);
    return NextResponse.json({ error: "Falha ao encaminhar." }, { status: 500 });
  }
}
