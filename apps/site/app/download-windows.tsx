"use client";

import { useEffect, useRef, useState } from "react";

// A landing page é estática e não tem banco: o pedido vai direto para a API do
// gerenciador de licenças, que já aceita chamadas de outra origem em /api/v1.
const LICENSE_API = "https://myfinance-license-manager.vercel.app";

type Props = { href: string };

export default function DownloadWindows({ href }: Props) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const baixarRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (aberto) setTimeout(() => emailRef.current?.focus(), 40);
  }, [aberto]);

  // Fechar com Esc é esperado em qualquer modal; sem isso o visitante fica preso.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  function fechar() {
    setAberto(false); setErro(""); setPronto(false); setEnviando(false);
  }

  async function enviar(event: React.FormEvent) {
    event.preventDefault();
    setEnviando(true); setErro("");
    try {
      const resposta = await fetch(`${LICENSE_API}/api/v1/license-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name: nome, platform: "windows" }),
      });
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || "Não foi possível registrar seu pedido.");
      setPronto(true);
      // O download começa junto: a licença chega por e-mail depois, e o visitante
      // já pode instalar enquanto espera.
      setTimeout(() => baixarRef.current?.click(), 250);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível registrar seu pedido.");
    } finally { setEnviando(false); }
  }

  return (
    <>
      <button type="button" className="button primary download" onClick={() => setAberto(true)}>
        <span className="platform-mark windows-mark" aria-hidden="true">⊞</span>
        <span><small>BAIXAR PARA</small>Windows 10/11 · 64 bits</span>
        <b aria-hidden="true">↓</b>
      </button>
      {/* Âncora real: é ela que baixa, disparada depois do pedido ser aceito. */}
      <a ref={baixarRef} href={href} download hidden aria-hidden="true" tabIndex={-1}>Baixar</a>

      {aberto && (
        <div className="modal-fundo" role="dialog" aria-modal="true" aria-labelledby="pedido-titulo"
          onClick={e => { if (e.target === e.currentTarget) fechar(); }}>
          <div className="modal-caixa">
            {pronto ? (
              <>
                <span className="modal-ok" aria-hidden="true">✓</span>
                <h2 id="pedido-titulo">Pedido registrado</h2>
                <p>O download está começando. Sua licença será enviada para <b>{email}</b> assim que for emitida.</p>
                <p className="modal-nota">Se o download não iniciar, <a href={href} download>clique aqui</a>.</p>
                <div className="modal-acoes">
                  <button type="button" className="button primary" onClick={fechar}>Fechar</button>
                </div>
              </>
            ) : (
              <>
                <p className="eyebrow">ANTES DE BAIXAR</p>
                <h2 id="pedido-titulo">Para onde enviamos sua licença?</h2>
                <p>O Arqevon Finance precisa de uma licença para abrir. Informe seu e-mail e enviaremos a chave
                  de ativação. O download começa em seguida.</p>
                <form onSubmit={enviar}>
                  <label>E-mail
                    <input ref={emailRef} type="email" value={email} required autoComplete="email"
                      placeholder="voce@exemplo.com" onChange={e => setEmail(e.target.value)} />
                  </label>
                  <label>Nome <span className="opcional">opcional</span>
                    <input type="text" value={nome} autoComplete="name" placeholder="Como podemos te chamar"
                      onChange={e => setNome(e.target.value)} />
                  </label>
                  {erro && <p className="modal-erro">{erro}</p>}
                  <p className="modal-nota">Usamos seu e-mail apenas para enviar a licença e avisos sobre o
                    aplicativo. Seus dados financeiros nunca saem do seu computador.</p>
                  <div className="modal-acoes">
                    <button type="button" className="button ghost" onClick={fechar}>Cancelar</button>
                    <button className="button primary" disabled={enviando}>
                      {enviando ? "Enviando…" : "Enviar e baixar"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
