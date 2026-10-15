"use client";

import { useEffect, useRef, useState } from "react";

// O site não tem banco: o pedido vai para a API do license-manager, que grava e avisa por e-mail.
const API = "https://licencas.arqevoncode.com.br";

// Orçamento sob medida: na página inicial é um extra discreto (uma linha que abre esta janela).
// Links antigos para /#sob-encomenda (stories, bio) abrem a janela direto.
export default function Orcamento() {
  const dlg = useRef<HTMLDialogElement>(null);
  const [campos, setCampos] = useState({ name: "", email: "", description: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const mudar = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCampos(c => ({ ...c, [k]: e.target.value }));

  useEffect(() => {
    const abrirPeloLink = () => { if (location.hash === "#sob-encomenda" && !dlg.current?.open) dlg.current?.showModal(); };
    abrirPeloLink();
    addEventListener("hashchange", abrirPeloLink);
    return () => removeEventListener("hashchange", abrirPeloLink);
  }, []);

  function fechar() {
    dlg.current?.close();
    if (location.hash === "#sob-encomenda") history.replaceState(null, "", location.pathname + location.search);
  }

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true); setErro("");
    try {
      const resposta = await fetch(`${API}/api/v1/quote-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...campos, phone: "", company: "", projectType: "outro", budget: "" }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || "Não foi possível enviar seu pedido.");
      setPronto(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar seu pedido.");
    } finally { setEnviando(false); }
  }

  return (
    <>
      <p className="ini-extra" id="sob-encomenda">
        Precisa de um sistema sob medida para sua empresa?
        <button type="button" onClick={() => dlg.current?.showModal()}>Pedir orçamento</button>
      </p>
      <dialog ref={dlg} className="ini-dlg" aria-labelledby="orc-titulo" onClose={fechar}>
        <button type="button" className="ini-fechar" aria-label="Fechar" onClick={fechar}>×</button>
        {pronto ? (
          <div className="ini-ok" role="status">
            <span aria-hidden="true">✓</span>
            <h3 id="orc-titulo">Pedido recebido</h3>
            <p>Obrigado, {campos.name.split(" ")[0]}. Vamos responder em <b>{campos.email}</b>.</p>
          </div>
        ) : (
          <>
            <h3 id="orc-titulo">Sistema sob medida</h3>
            <p className="ini-sub">Conte em poucas linhas. Respondemos por e-mail.</p>
            <form onSubmit={enviar}>
              <label>Nome<input value={campos.name} onChange={mudar("name")} required minLength={2} maxLength={120} autoComplete="name" /></label>
              <label>E-mail<input type="email" value={campos.email} onChange={mudar("email")} required maxLength={200} autoComplete="email" /></label>
              <label>O que você precisa?
                <textarea value={campos.description} onChange={mudar("description")} required minLength={20} maxLength={3000} rows={4}
                  placeholder="Ex.: um sistema para controlar os pedidos da loja, usado por 3 pessoas." />
              </label>
              {erro && <p className="ini-erro" role="alert">{erro}</p>}
              <button className="ini-btn" disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
              <p className="ini-mini">Sem compromisso. Usamos seus dados só para responder, conforme a <a href="/privacidade">Política de Privacidade</a>.</p>
            </form>
          </>
        )}
      </dialog>
    </>
  );
}
