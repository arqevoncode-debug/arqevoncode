"use client";

import { useState } from "react";

// O site não tem banco: o pedido vai para a API do license-manager, que grava e avisa por e-mail.
const API = "https://licencas.arqevoncode.com.br";

const TIPOS = [
  ["web", "Sistema web ou painel"],
  ["desktop", "Aplicativo para computador"],
  ["mobile", "Aplicativo para celular"],
  ["integracao", "Automação ou integração"],
  ["site", "Site ou página"],
  ["outro", "Outro"],
];
const ORCAMENTOS = [
  ["", "Prefiro não informar"],
  ["nao_sei", "Ainda não sei"],
  ["ate_5k", "Até R$ 5 mil"],
  ["5k_15k", "R$ 5 mil a R$ 15 mil"],
  ["15k_50k", "R$ 15 mil a R$ 50 mil"],
  ["acima_50k", "Acima de R$ 50 mil"],
];

export default function Orcamento() {
  const [campos, setCampos] = useState({ name: "", email: "", phone: "", company: "", projectType: "web", budget: "", description: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const mudar = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setCampos(c => ({ ...c, [k]: e.target.value }));

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true); setErro("");
    try {
      const resposta = await fetch(`${API}/api/v1/quote-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(campos),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || "Não foi possível enviar seu pedido.");
      setPronto(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar seu pedido.");
    } finally { setEnviando(false); }
  }

  if (pronto) {
    return (
      <div className="lp-orcamento-form lp-orcamento-ok" role="status">
        <span aria-hidden="true">✓</span>
        <h3>Pedido recebido</h3>
        <p>Obrigado, {campos.name.split(" ")[0]}. Vamos ler com atenção e responder em <b>{campos.email}</b>.</p>
      </div>
    );
  }

  return (
    <form className="lp-orcamento-form" onSubmit={enviar}>
      <div className="lp-campos-2">
        <label>Nome<input value={campos.name} onChange={mudar("name")} required minLength={2} maxLength={120} autoComplete="name" /></label>
        <label>E-mail<input type="email" value={campos.email} onChange={mudar("email")} required maxLength={200} autoComplete="email" /></label>
        <label><span>WhatsApp ou telefone <em>opcional</em></span><input value={campos.phone} onChange={mudar("phone")} maxLength={40} autoComplete="tel" inputMode="tel" /></label>
        <label><span>Empresa <em>opcional</em></span><input value={campos.company} onChange={mudar("company")} maxLength={120} autoComplete="organization" /></label>
        <label>O que você precisa?
          <select value={campos.projectType} onChange={mudar("projectType")}>
            {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <label><span>Orçamento previsto <em>opcional</em></span>
          <select value={campos.budget} onChange={mudar("budget")}>
            {ORCAMENTOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
      </div>
      <label>Conte sobre o projeto
        <textarea value={campos.description} onChange={mudar("description")} required minLength={20} maxLength={3000} rows={5}
          placeholder="Qual problema o sistema resolve, quem vai usar e se há prazo." />
      </label>
      {erro && <p className="lp-orcamento-erro">{erro}</p>}
      <button className="lp-botao grande" disabled={enviando}>{enviando ? "Enviando…" : "Pedir orçamento"}</button>
      <p className="lp-orcamento-nota">
        Sem compromisso. Usamos seus dados só para responder ao pedido, conforme a{" "}
        <a href="/privacidade">Política de Privacidade</a>.
      </p>
    </form>
  );
}
