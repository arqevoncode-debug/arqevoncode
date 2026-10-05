export const PROJECT_TYPES = {
  web: "Sistema web ou painel",
  desktop: "Aplicativo para computador",
  mobile: "Aplicativo para celular",
  integracao: "Automação ou integração",
  site: "Site ou página",
  outro: "Outro",
};
export const BUDGETS = {
  nao_sei: "Ainda não sei",
  ate_5k: "Até R$ 5 mil",
  "5k_15k": "R$ 5 mil a R$ 15 mil",
  "15k_50k": "R$ 15 mil a R$ 50 mil",
  acima_50k: "Acima de R$ 50 mil",
};
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 3000;

const texto = (v, max) => String(v ?? "").trim().slice(0, max);

/**
 * Valida o pedido de orçamento vindo do site. Os mesmos limites estão como check constraint na
 * tabela; aqui eles existem para devolver uma mensagem em português a quem preencheu.
 */
export function normalizeQuoteRequest(input = {}) {
  const name = texto(input.name, 120);
  const email = texto(input.email, 200).toLowerCase();
  const description = String(input.description ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Informe seu nome." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Informe um e-mail válido." };
  if (description.length < DESCRIPTION_MIN) return { ok: false, error: `Conte um pouco mais sobre o projeto (pelo menos ${DESCRIPTION_MIN} caracteres).` };
  if (description.length > DESCRIPTION_MAX) return { ok: false, error: `A descrição passou de ${DESCRIPTION_MAX} caracteres. Resuma um pouco, por favor.` };
  return {
    ok: true,
    value: {
      name, email, description,
      phone: texto(input.phone, 40) || null,
      company: texto(input.company, 120) || null,
      projectType: Object.hasOwn(PROJECT_TYPES, input.projectType ?? "") ? input.projectType : "outro",
      budget: Object.hasOwn(BUDGETS, input.budget ?? "") ? input.budget : null,
    },
  };
}

const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** E-mail que avisa o dono de um pedido novo. "Responder" vai direto para o cliente. */
export function montarAvisoOrcamento(p) {
  const linhas = [
    ["Nome", p.name],
    ["E-mail", p.email],
    ["Telefone", p.phone || "não informado"],
    ["Empresa", p.company || "não informada"],
    ["Tipo de projeto", PROJECT_TYPES[p.projectType]],
    ["Orçamento previsto", p.budget ? BUDGETS[p.budget] : "não informado"],
  ];
  return {
    assunto: `Pedido de orçamento: ${PROJECT_TYPES[p.projectType]} — ${p.name}`,
    replyTo: p.email,
    texto: `${linhas.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nProjeto:\n${p.description}\n\nResponda este e-mail para falar direto com o cliente.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;color:#101b2d">
<p><strong>Novo pedido de orçamento pelo site.</strong> Responda este e-mail para falar direto com o cliente.</p>
<table style="border-collapse:collapse">${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#48586d">${escapar(k)}</td><td style="padding:4px 0"><strong>${escapar(v)}</strong></td></tr>`).join("")}</table>
<p style="margin-top:16px;color:#48586d">Projeto:</p>
<div style="white-space:pre-wrap;background:#f3f7fa;border-radius:8px;padding:12px">${escapar(p.description)}</div>
</div>`,
  };
}
